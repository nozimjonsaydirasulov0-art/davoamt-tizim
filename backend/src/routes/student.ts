import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, audit, bad, forbidden, notFound, parse, uuid } from '../lib/util.js';
import { discardUpload, finalizeUpload, removeStored, upload } from '../lib/files.js';
import { emitToLessonTeacher, emitToTeacher, notifyUsers, scheduleMonitor, teacherId } from '../realtime.js';

// Barcha so'rovlar faqat req.user.student_id va req.user.group_id bilan cheklangan:
// talaba ID almashtirib boshqa talabaning ma'lumotini ocholmaydi.
export const studentRouter = Router();

const me = (req: any) => ({ sid: req.user.student_id as string, gid: req.user.group_id as string | null, uid: req.user.id as string });

async function assertMySubject(gid: string | null, subjectId: string) {
  if (!gid) throw forbidden();
  const ok = await one(`SELECT 1 FROM group_subjects WHERE group_id=$1 AND subject_id=$2`, [gid, subjectId]);
  if (!ok) throw forbidden('Bu fan sizga biriktirilmagan');
}

studentRouter.get('/dashboard', ah(async (req, res) => {
  const { sid, gid, uid } = me(req);
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  const [group, today, att, avg, unread, active, upcoming] = await Promise.all([
    one(`SELECT g.name, g.direction, g.course FROM groups g WHERE g.id=$1`, [gid]),
    q(`SELECT sc.id, to_char(sc.start_time,'HH24:MI') AS start_time, to_char(sc.end_time,'HH24:MI') AS end_time, sc.room, s.name AS subject_name
       FROM schedules sc JOIN subjects s ON s.id=sc.subject_id WHERE sc.group_id=$1 AND sc.weekday=$2 ORDER BY sc.start_time`, [gid, dow]),
    one(`SELECT round(100.0*count(*) FILTER (WHERE status IN ('present','late'))/NULLIF(count(*),0),1)::float AS pct FROM attendance_records WHERE student_id=$1`, [sid]),
    one(`SELECT round(100*sum(score)/NULLIF(sum(max_score),0),1)::float AS pct FROM grades WHERE student_id=$1`, [sid]),
    q(`SELECT type, count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL GROUP BY type`, [uid]),
    one(`SELECT ll.id, s.name AS subject_name, ll.started_at FROM live_lessons ll JOIN subjects s ON s.id=ll.subject_id WHERE ll.group_id=$1 AND ll.status='active'`, [gid]),
    q(`SELECT a.id, a.title, a.deadline, s.name AS subject_name, COALESCE(x.status,'not_started') AS status FROM assignments a
       JOIN subjects s ON s.id=a.subject_id LEFT JOIN assignment_submissions x ON x.assignment_id=a.id AND x.student_id=$2
       WHERE a.group_id=$1 AND (x.status IS NULL OR x.status='working') ORDER BY a.deadline NULLS LAST LIMIT 5`, [gid, sid]),
  ]);
  const unreadMsgs = await one<any>(`SELECT count(*)::int AS n FROM messages WHERE recipient_id=$1 AND read_at IS NULL`, [uid]);
  const counts = Object.fromEntries(unread.map((r: any) => [r.type, r.n]));
  res.json({ group, today, attendance: att?.pct ?? null, avgGrade: avg?.pct ?? null, newCounts: { ...counts, messages: unreadMsgs.n }, activeLesson: active, upcoming });
}));

// ---------- Profil ----------
studentRouter.get('/profile', ah(async (req, res) => {
  const { sid } = me(req);
  const p = await one(`SELECT st.public_id, st.birth_date, st.gender, u.full_name, u.username, u.email, u.phone, u.last_login_at,
      g.name AS group_name, g.course, g.direction, g.academic_year
    FROM students st JOIN users u ON u.id=st.user_id LEFT JOIN student_groups sg ON sg.student_id=st.id LEFT JOIN groups g ON g.id=sg.group_id WHERE st.id=$1`, [sid]);
  const s = await one<any>(`SELECT value FROM settings WHERE key='student_editable_fields'`);
  res.json({ ...p, editable_fields: s?.value ?? [] });
}));
studentRouter.patch('/profile', ah(async (req, res) => {
  const { sid, uid } = me(req);
  const allowed: string[] = (await one<any>(`SELECT value FROM settings WHERE key='student_editable_fields'`))?.value ?? [];
  const b = parse(z.object({
    phone: z.string().trim().max(30).regex(/^[+0-9()\s-]*$/).optional(),
    email: z.string().trim().max(150).email().optional().or(z.literal('')),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    gender: z.enum(['male', 'female']).optional(),
    full_name: z.string().trim().min(3).max(150).optional(),
  }).strict(), req.body);
  for (const k of Object.keys(b)) if (!allowed.includes(k)) throw forbidden(`"${k}" maydonini o‘zgartirishga ruxsat yo‘q`);
  await tx(async (c) => {
    if (b.phone !== undefined) await c.query(`UPDATE users SET phone=$2 WHERE id=$1`, [uid, b.phone || null]);
    if (b.email !== undefined) await c.query(`UPDATE users SET email=$2 WHERE id=$1`, [uid, b.email || null]);
    if (b.full_name !== undefined) await c.query(`UPDATE users SET full_name=$2 WHERE id=$1`, [uid, b.full_name]);
    if (b.birth_date !== undefined) await c.query(`UPDATE students SET birth_date=$2 WHERE id=$1`, [sid, b.birth_date]);
    if (b.gender !== undefined) await c.query(`UPDATE students SET gender=$2 WHERE id=$1`, [sid, b.gender]);
  });
  await audit(uid, 'profile_update', 'student', sid, Object.keys(b), req.ip);
  res.json({ ok: true });
}));

// ---------- Fanlar ----------
studentRouter.get('/subjects', ah(async (req, res) => {
  const { sid, gid } = me(req);
  res.json(await q(`SELECT s.id, s.name, s.code, s.semester, s.course, s.description,
      (SELECT round(100*sum(score)/NULLIF(sum(max_score),0),1)::float FROM grades g WHERE g.student_id=$2 AND g.subject_id=s.id) AS avg_grade,
      (SELECT round(100.0*count(*) FILTER (WHERE ar.status IN ('present','late'))/NULLIF(count(*),0),1)::float FROM attendance a
        JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.subject_id=s.id AND ar.student_id=$2) AS attendance
    FROM group_subjects gs JOIN subjects s ON s.id=gs.subject_id WHERE gs.group_id=$1 ORDER BY s.name`, [gid, sid]));
}));
studentRouter.get('/subjects/:id', ah(async (req, res) => {
  const { sid, gid } = me(req);
  const id = parse(uuid, req.params.id);
  await assertMySubject(gid, id);
  const [subject, teacher, group, attendance, grades, materials, assignments, tests, lessons, schedule] = await Promise.all([
    one(`SELECT * FROM subjects WHERE id=$1`, [id]),
    one(`SELECT full_name FROM users WHERE role='teacher'`),
    one(`SELECT name, direction, course FROM groups WHERE id=$1`, [gid]),
    q(`SELECT a.date, ar.status FROM attendance a JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.subject_id=$1 AND ar.student_id=$2 ORDER BY a.date DESC`, [id, sid]),
    q(`SELECT g.score, g.max_score, g.comment, g.created_at, gc.name AS category FROM grades g JOIN grade_categories gc ON gc.id=g.category_id WHERE g.subject_id=$1 AND g.student_id=$2 ORDER BY g.created_at DESC`, [id, sid]),
    q(`SELECT id, title, file_name, file_size, mime_type, created_at FROM materials WHERE subject_id=$1 AND group_id=$2 ORDER BY created_at DESC`, [id, gid]),
    q(`SELECT a.id, a.title, a.deadline, a.max_score, COALESCE(x.status,'not_started') AS status, x.score FROM assignments a
       LEFT JOIN assignment_submissions x ON x.assignment_id=a.id AND x.student_id=$3 WHERE a.subject_id=$1 AND a.group_id=$2 ORDER BY a.created_at DESC`, [id, gid, sid]),
    q(`SELECT qz.id, qz.title, qz.closes_at, qa.score, qa.max_score, qa.finished_at FROM quizzes qz
       LEFT JOIN quiz_attempts qa ON qa.quiz_id=qz.id AND qa.student_id=$3 AND qa.lesson_id IS NULL
       WHERE qz.subject_id=$1 AND qz.group_id=$2 AND qz.is_published AND qz.mode='test' ORDER BY qz.created_at DESC`, [id, gid, sid]),
    q(`SELECT ll.id, ll.started_at, ll.ended_at, ll.status, ll.topic FROM live_lessons ll WHERE ll.subject_id=$1 AND ll.group_id=$2 ORDER BY ll.started_at DESC LIMIT 30`, [id, gid]),
    q(`SELECT weekday, to_char(start_time,'HH24:MI') AS start_time, to_char(end_time,'HH24:MI') AS end_time, room FROM schedules WHERE subject_id=$1 AND group_id=$2 ORDER BY weekday, start_time`, [id, gid]),
  ]);
  res.json({ subject, teacher, group, attendance, grades, materials, assignments, tests, lessons, schedule });
}));

studentRouter.get('/schedule', ah(async (req, res) => {
  const { gid } = me(req);
  res.json(await q(`SELECT sc.id, sc.weekday, to_char(sc.start_time,'HH24:MI') AS start_time, to_char(sc.end_time,'HH24:MI') AS end_time, sc.room, sc.note,
      s.name AS subject_name, s.code AS subject_code FROM schedules sc JOIN subjects s ON s.id=sc.subject_id WHERE sc.group_id=$1 ORDER BY sc.weekday, sc.start_time`, [gid]));
}));

studentRouter.get('/attendance', ah(async (req, res) => {
  const { sid } = me(req);
  res.json(await q(`SELECT a.date, ar.status, s.name AS subject_name FROM attendance_records ar JOIN attendance a ON a.id=ar.attendance_id
    JOIN subjects s ON s.id=a.subject_id WHERE ar.student_id=$1 ORDER BY a.date DESC, a.created_at DESC`, [sid]));
}));

studentRouter.get('/grades', ah(async (req, res) => {
  const { sid } = me(req);
  res.json(await q(`SELECT g.id, g.score, g.max_score, g.comment, g.created_at, gc.name AS category, s.name AS subject_name, s.id AS subject_id
    FROM grades g JOIN grade_categories gc ON gc.id=g.category_id JOIN subjects s ON s.id=g.subject_id WHERE g.student_id=$1 ORDER BY g.created_at DESC`, [sid]));
}));

studentRouter.get('/materials', ah(async (req, res) => {
  const { gid } = me(req);
  res.json(await q(`SELECT m.id, m.title, m.file_name, m.file_size, m.mime_type, m.created_at, s.name AS subject_name
    FROM materials m JOIN subjects s ON s.id=m.subject_id
    WHERE m.group_id=$1 AND EXISTS (SELECT 1 FROM group_subjects gs WHERE gs.group_id=$1 AND gs.subject_id=m.subject_id)
    ORDER BY m.created_at DESC`, [gid]));
}));

// ---------- Topshiriqlar ----------
studentRouter.get('/assignments', ah(async (req, res) => {
  const { sid, gid } = me(req);
  res.json(await q(`SELECT a.id, a.title, a.deadline, a.max_score, a.created_at, s.name AS subject_name,
      COALESCE(x.status,'not_started') AS status, x.score, x.feedback
    FROM assignments a JOIN subjects s ON s.id=a.subject_id LEFT JOIN assignment_submissions x ON x.assignment_id=a.id AND x.student_id=$2
    WHERE a.group_id=$1 ORDER BY a.created_at DESC`, [gid, sid]));
}));
async function myAssignment(req: any, id: string) {
  const { gid } = me(req);
  const a = await one<any>(`SELECT a.id, a.title, a.description, a.deadline, a.max_score, a.file_name, a.mime_type, a.lesson_id, a.created_at, a.group_id, s.name AS subject_name
    FROM assignments a JOIN subjects s ON s.id=a.subject_id WHERE a.id=$1`, [id]);
  if (!a || a.group_id !== gid) throw notFound();
  return a;
}
studentRouter.get('/assignments/:id', ah(async (req, res) => {
  const { sid } = me(req);
  const a = await myAssignment(req, parse(uuid, req.params.id));
  const sub = await one(`SELECT id, status, text_answer, file_name, mime_type, score, feedback, submitted_at, graded_at FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2`, [a.id, sid]);
  res.json({ ...a, submission: sub });
}));
// "Topshiriqni ochish" — statusni Working qiladi (teacher monitoringi uchun)
studentRouter.post('/assignments/:id/open', ah(async (req, res) => {
  const { sid } = me(req);
  const a = await myAssignment(req, parse(uuid, req.params.id));
  await q(`INSERT INTO assignment_submissions (assignment_id, student_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a.id, sid]);
  if (a.lesson_id) scheduleMonitor(a.lesson_id);
  emitToTeacher('submission:update', { assignment_id: a.id });
  res.json({ ok: true });
}));
studentRouter.post('/assignments/:id/submit', upload.single('file'), ah(async (req, res) => {
  const { sid, uid } = me(req);
  try {
    const a = await myAssignment(req, parse(uuid, req.params.id));
    const { text_answer } = parse(z.object({ text_answer: z.string().max(20000).optional().default('') }), req.body);
    if (!text_answer.trim() && !req.file) throw bad('Javob matni yoki fayl yuboring');
    const existing = await one<any>(`SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2`, [a.id, sid]);
    if (existing?.status === 'graded') throw bad('Topshiriq allaqachon baholangan');
    if (a.deadline && new Date(a.deadline) < new Date()) throw bad('Deadline o‘tib ketgan');
    const f = finalizeUpload(req.file, 'submissions');
    await q(`INSERT INTO assignment_submissions (assignment_id, student_id, status, text_answer, file_name, file_path, file_size, mime_type, submitted_at)
      VALUES ($1,$2,'submitted',$3,$4,$5,$6,$7,now())
      ON CONFLICT (assignment_id, student_id) DO UPDATE SET status='submitted', text_answer=EXCLUDED.text_answer,
        file_name=COALESCE(EXCLUDED.file_name, assignment_submissions.file_name), file_path=COALESCE(EXCLUDED.file_path, assignment_submissions.file_path),
        file_size=COALESCE(EXCLUDED.file_size, assignment_submissions.file_size), mime_type=COALESCE(EXCLUDED.mime_type, assignment_submissions.mime_type), submitted_at=now()`,
      [a.id, sid, text_answer.trim() || null, f?.file_name ?? null, f?.file_path ?? null, f?.file_size ?? null, f?.mime_type ?? null]);
    if (f && existing?.file_path) removeStored(existing.file_path);
    if (a.lesson_id) scheduleMonitor(a.lesson_id);
    emitToTeacher('submission:update', { assignment_id: a.id });
    const tid = await teacherId();
    if (tid) await notifyUsers([tid], 'submission', 'Yangi javob', `${req.user!.full_name}: ${a.title}`, `/teacher/assignments/${a.id}`);
    await audit(uid, 'submission', 'assignment', a.id, null, req.ip);
    res.json({ ok: true });
  } catch (e) { discardUpload(req.file); throw e; }
}));

// ---------- Testlar (mustaqil) ----------
studentRouter.get('/tests', ah(async (req, res) => {
  const { sid, gid } = me(req);
  res.json(await q(`SELECT qz.id, qz.title, qz.opens_at, qz.closes_at, qz.time_limit_min, s.name AS subject_name,
      (SELECT count(*)::int FROM quiz_questions qq WHERE qq.quiz_id=qz.id) AS question_count,
      qa.score, qa.max_score, qa.started_at, qa.finished_at
    FROM quizzes qz JOIN subjects s ON s.id=qz.subject_id
    LEFT JOIN quiz_attempts qa ON qa.quiz_id=qz.id AND qa.student_id=$2 AND qa.lesson_id IS NULL
    WHERE qz.mode='test' AND qz.is_published AND qz.group_id=$1 ORDER BY qz.created_at DESC`, [gid, sid]));
}));
async function myTest(req: any, id: string) {
  const { gid } = me(req);
  const t = await one<any>(`SELECT * FROM quizzes WHERE id=$1 AND mode='test' AND is_published AND group_id=$2`, [id, gid]);
  if (!t) throw notFound('Test topilmadi');
  return t;
}
function deadlineOf(t: any, startedAt: Date) {
  const lim = t.time_limit_min ? new Date(startedAt.getTime() + t.time_limit_min * 60_000) : null;
  const cl = t.closes_at ? new Date(t.closes_at) : null;
  if (lim && cl) return lim < cl ? lim : cl;
  return lim ?? cl;
}
studentRouter.post('/tests/:id/start', ah(async (req, res) => {
  const { sid } = me(req);
  const t = await myTest(req, parse(uuid, req.params.id));
  const now = new Date();
  if (t.opens_at && new Date(t.opens_at) > now) throw bad('Test hali ochilmagan');
  let attempt = await one<any>(`SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND lesson_id IS NULL`, [t.id, sid]);
  if (attempt?.finished_at) throw bad('Siz bu testni allaqachon topshirgansiz');
  if (!attempt) {
    if (t.closes_at && new Date(t.closes_at) < now) throw bad('Test yopilgan');
    attempt = await one(`INSERT INTO quiz_attempts (quiz_id, student_id) VALUES ($1,$2) RETURNING *`, [t.id, sid]);
  }
  const questions = await q(`SELECT id, position, text, option_a, option_b, option_c, option_d, points FROM quiz_questions WHERE quiz_id=$1 ORDER BY position`, [t.id]);
  const dl = deadlineOf(t, new Date(attempt.started_at));
  res.json({ attempt_id: attempt.id, title: t.title, deadline: dl, serverNow: Date.now(), questions });
}));
studentRouter.post('/tests/:id/submit', ah(async (req, res) => {
  const { sid, uid } = me(req);
  const t = await myTest(req, parse(uuid, req.params.id));
  const { answers } = parse(z.object({ answers: z.record(uuid, z.enum(['A', 'B', 'C', 'D'])) }), req.body);
  const attempt = await one<any>(`SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND lesson_id IS NULL`, [t.id, sid]);
  if (!attempt) throw bad('Avval testni boshlang');
  if (attempt.finished_at) throw bad('Test allaqachon topshirilgan');
  const dl = deadlineOf(t, new Date(attempt.started_at));
  const late = dl && Date.now() > dl.getTime() + 60_000; // 1 daqiqa tarmoq uchun zaxira
  const questions = await q<any>(`SELECT id, correct, points FROM quiz_questions WHERE quiz_id=$1`, [t.id]);
  const max = questions.reduce((s, x) => s + Number(x.points), 0);
  let score = 0;
  const cat = await one<any>(`SELECT id FROM grade_categories WHERE system_key='test'`);
  await tx(async (c) => {
    for (const qq of questions) {
      const ans = late ? undefined : answers[qq.id];
      const ok = ans === qq.correct;
      if (ok) score += Number(qq.points);
      await c.query(`INSERT INTO quiz_answers (attempt_id, question_id, answer, is_correct, points) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [attempt.id, qq.id, ans ?? null, ok, ok ? qq.points : 0]);
    }
    await c.query(`UPDATE quiz_attempts SET score=$2, max_score=$3, finished_at=now() WHERE id=$1`, [attempt.id, score, max]);
    await c.query(`INSERT INTO grades (student_id, subject_id, category_id, score, max_score, comment, source_type, source_id)
      VALUES ($1,$2,$3,$4,$5,$6,'quiz',$7) ON CONFLICT (source_type, source_id, student_id) WHERE source_id IS NOT NULL DO NOTHING`,
      [sid, t.subject_id, cat.id, score, max, t.title, attempt.id]);
  });
  const tid = await teacherId();
  if (tid) await notifyUsers([tid], 'test', 'Test topshirildi', `${req.user!.full_name}: ${t.title} — ${score}/${max}`, `/teacher/tests/${t.id}`);
  await notifyUsers([uid], 'grade', 'Yangi baho: Test', `${t.title}: ${score}/${max}`, '/student/grades');
  res.json({ score, max_score: max, late: !!late });
}));
studentRouter.get('/tests/:id/review', ah(async (req, res) => {
  const { sid } = me(req);
  const t = await myTest(req, parse(uuid, req.params.id));
  const attempt = await one<any>(`SELECT * FROM quiz_attempts WHERE quiz_id=$1 AND student_id=$2 AND lesson_id IS NULL AND finished_at IS NOT NULL`, [t.id, sid]);
  if (!attempt) throw bad('Natija yo‘q');
  // To'g'ri javoblar faqat test yopilgandan keyin ko'rsatiladi
  const showCorrect = !t.closes_at || new Date(t.closes_at) < new Date();
  const rows = await q<any>(`SELECT qq.position, qq.text, qq.option_a, qq.option_b, qq.option_c, qq.option_d, ${showCorrect ? 'qq.correct' : 'NULL AS correct'},
      qa.answer, qa.is_correct, qa.points FROM quiz_questions qq LEFT JOIN quiz_answers qa ON qa.question_id=qq.id AND qa.attempt_id=$2
    WHERE qq.quiz_id=$1 ORDER BY qq.position`, [t.id, attempt.id]);
  res.json({ title: t.title, score: attempt.score, max_score: attempt.max_score, questions: rows, showCorrect });
}));

// ---------- Jonli dars ----------
studentRouter.get('/live', ah(async (req, res) => {
  const { gid, sid } = me(req);
  const lesson = await one<any>(`SELECT ll.id, ll.started_at, ll.topic, s.name AS subject_name, g.name AS group_name FROM live_lessons ll
    JOIN subjects s ON s.id=ll.subject_id JOIN groups g ON g.id=ll.group_id WHERE ll.group_id=$1 AND ll.status='active'`, [gid]);
  if (!lesson) return res.json({ lesson: null });
  const [materials, assignments] = await Promise.all([
    q(`SELECT id, title, file_name, file_size, mime_type, created_at FROM materials WHERE lesson_id=$1 ORDER BY created_at DESC`, [lesson.id]),
    q(`SELECT a.id, a.title, a.deadline, a.max_score, COALESCE(x.status,'not_started') AS status, x.score FROM assignments a
       LEFT JOIN assignment_submissions x ON x.assignment_id=a.id AND x.student_id=$2 WHERE a.lesson_id=$1 ORDER BY a.created_at DESC`, [lesson.id, sid]),
  ]);
  res.json({ lesson, materials, assignments });
}));
studentRouter.post('/live/answers', ah(async (req, res) => {
  const { sid, gid } = me(req);
  const b = parse(z.object({ question_id: uuid, text: z.string().trim().min(1).max(5000) }), req.body);
  const qq = await one<any>(`SELECT lq.*, ll.group_id FROM live_questions lq JOIN live_lessons ll ON ll.id=lq.lesson_id WHERE lq.id=$1 AND ll.status='active'`, [b.question_id]);
  if (!qq || qq.group_id !== gid) throw notFound('Savol topilmadi');
  if (!qq.is_open) throw bad('Savol yopilgan');
  const row = await one<any>(`INSERT INTO live_answers (question_id, student_id, text) VALUES ($1,$2,$3)
    ON CONFLICT (question_id, student_id) DO UPDATE SET text=EXCLUDED.text, created_at=now() WHERE live_answers.score IS NULL RETURNING *`, [b.question_id, sid, b.text]);
  if (!row) throw bad('Javobingiz allaqachon baholangan');
  emitToLessonTeacher(qq.lesson_id, 'question:answer', { ...row, full_name: req.user!.full_name });
  scheduleMonitor(qq.lesson_id);
  res.json({ ok: true });
}));

// ---------- Statistikam ----------
studentRouter.get('/stats', ah(async (req, res) => {
  const { sid, gid } = me(req);
  const [att, avg, asg, tests, bySubject, timeline] = await Promise.all([
    one(`SELECT round(100.0*count(*) FILTER (WHERE status IN ('present','late'))/NULLIF(count(*),0),1)::float AS pct,
         count(*) FILTER (WHERE status='present')::int AS present, count(*) FILTER (WHERE status='late')::int AS late,
         count(*) FILTER (WHERE status='absent')::int AS absent FROM attendance_records WHERE student_id=$1`, [sid]),
    one(`SELECT round(100*sum(score)/NULLIF(sum(max_score),0),1)::float AS pct FROM grades WHERE student_id=$1`, [sid]),
    one(`SELECT (SELECT count(*)::int FROM assignments WHERE group_id=$2) AS total,
         (SELECT count(*)::int FROM assignment_submissions WHERE student_id=$1 AND status IN ('submitted','graded')) AS done`, [sid, gid]),
    one(`SELECT (SELECT count(*)::int FROM quizzes WHERE group_id=$2 AND mode='test' AND is_published) AS total,
         (SELECT count(*)::int FROM quiz_attempts qa JOIN quizzes qz ON qz.id=qa.quiz_id WHERE qa.student_id=$1 AND qz.mode='test' AND qa.finished_at IS NOT NULL) AS done`, [sid, gid]),
    q(`SELECT s.name, round(100*sum(g.score)/NULLIF(sum(g.max_score),0),1)::float AS pct FROM grades g JOIN subjects s ON s.id=g.subject_id
       WHERE g.student_id=$1 GROUP BY s.name ORDER BY s.name`, [sid]),
    q(`SELECT date_trunc('day', created_at)::date::text AS day, round(100*sum(score)/sum(max_score),1)::float AS pct FROM grades
       WHERE student_id=$1 GROUP BY day ORDER BY day`, [sid]),
  ]);
  res.json({ attendance: att, avgGrade: avg?.pct ?? null, assignments: asg, tests, bySubject, timeline });
}));
