import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, audit, bad, notFound, optStr, parse, publicId, uuid } from '../lib/util.js';
import { discardUpload, finalizeUpload, removeStored, upload } from '../lib/files.js';
import {
  emitToGroup, emitToLesson, emitToUser, endLessonRealtime, finishQuiz, lessonMonitor, nextQuestion, notifyGroup,
  notifyUsers, quizState, reveal, scheduleMonitor, startQuiz,
} from '../realtime.js';

export const teacherLearning = Router();

async function assertGroupSubject(groupId: string, subjectId: string) {
  const ok = await one(`SELECT 1 FROM group_subjects WHERE group_id=$1 AND subject_id=$2`, [groupId, subjectId]);
  if (!ok) throw bad('Bu fan ushbu guruhga biriktirilmagan');
}
async function studentUser(studentId: string) {
  return one<any>(`SELECT s.id, s.user_id, sg.group_id, u.full_name FROM students s JOIN users u ON u.id=s.user_id
    LEFT JOIN student_groups sg ON sg.student_id=s.id WHERE s.id=$1`, [studentId]);
}

// ======================= JONLI DARSLAR =======================
teacherLearning.post('/lessons/start', ah(async (req, res) => {
  const b = parse(z.object({ schedule_id: uuid.optional(), subject_id: uuid.optional(), group_id: uuid.optional(), topic: optStr(200) }), req.body);
  let subjectId = b.subject_id, groupId = b.group_id;
  if (b.schedule_id) {
    const sc = await one<any>(`SELECT * FROM schedules WHERE id=$1`, [b.schedule_id]);
    if (!sc) throw notFound('Jadval topilmadi');
    subjectId = sc.subject_id; groupId = sc.group_id;
  }
  if (!subjectId || !groupId) throw bad('Fan va guruh tanlang');
  await assertGroupSubject(groupId, subjectId);
  const existing = await one<any>(`SELECT * FROM live_lessons WHERE group_id=$1 AND status='active'`, [groupId]);
  if (existing) {
    if (existing.subject_id !== subjectId) throw bad('Bu guruhda boshqa fan bo‘yicha dars davom etmoqda');
    return res.json(existing);
  }
  const lesson = await one<any>(`INSERT INTO live_lessons (public_id, schedule_id, subject_id, group_id, topic) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [await publicId('LES', 'live_lessons'), b.schedule_id ?? null, subjectId, groupId, b.topic]);
  const subj = await one<any>(`SELECT name FROM subjects WHERE id=$1`, [subjectId]);
  emitToGroup(groupId, 'lesson:started', { lessonId: lesson.id, subject: subj.name });
  await notifyGroup(groupId, 'lesson', 'Dars boshlandi', subj.name, '/student/live');
  await audit(req.user!.id, 'lesson_start', 'lesson', lesson.id, null, req.ip);
  res.status(201).json(lesson);
}));

teacherLearning.get('/lessons', ah(async (req, res) => {
  const status = req.query.status === 'ended' ? 'ended' : req.query.status === 'active' ? 'active' : null;
  res.json(await q(`SELECT ll.*, s.name AS subject_name, g.name AS group_name,
      (SELECT count(*)::int FROM live_participants lp WHERE lp.lesson_id=ll.id) AS participants
    FROM live_lessons ll JOIN subjects s ON s.id=ll.subject_id JOIN groups g ON g.id=ll.group_id
    WHERE ($1::text IS NULL OR ll.status=$1) ORDER BY ll.started_at DESC LIMIT 100`, [status]));
}));

teacherLearning.get('/lessons/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const lesson = await one<any>(`SELECT ll.*, s.name AS subject_name, g.name AS group_name FROM live_lessons ll
    JOIN subjects s ON s.id=ll.subject_id JOIN groups g ON g.id=ll.group_id WHERE ll.id=$1`, [id]);
  if (!lesson) throw notFound();
  const [materials, assignments, questions, quizzes] = await Promise.all([
    q(`SELECT id, title, file_name, file_size, mime_type, created_at FROM materials WHERE lesson_id=$1 ORDER BY created_at DESC`, [id]),
    q(`SELECT id, title, deadline, max_score, created_at FROM assignments WHERE lesson_id=$1 ORDER BY created_at DESC`, [id]),
    q(`SELECT lq.*, COALESCE((SELECT json_agg(json_build_object('id',la.id,'student_id',la.student_id,'full_name',u.full_name,'text',la.text,'score',la.score,'created_at',la.created_at) ORDER BY la.created_at)
        FROM live_answers la JOIN students st ON st.id=la.student_id JOIN users u ON u.id=st.user_id WHERE la.question_id=lq.id),'[]') AS answers
       FROM live_questions lq WHERE lq.lesson_id=$1 ORDER BY lq.created_at DESC`, [id]),
    q(`SELECT qz.id, qz.title, (SELECT count(*)::int FROM quiz_questions qq WHERE qq.quiz_id=qz.id) AS question_count,
        EXISTS (SELECT 1 FROM quiz_attempts qa WHERE qa.quiz_id=qz.id AND qa.lesson_id=$1) AS used
       FROM quizzes qz WHERE qz.subject_id=$2 AND qz.mode='live' ORDER BY qz.created_at DESC`, [id, lesson.subject_id]),
  ]);
  res.json({ lesson, materials, assignments, questions, quizzes, monitor: await lessonMonitor(id), quiz: quizState(id) });
}));

teacherLearning.post('/lessons/:id/end', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const r = await one<any>(`UPDATE live_lessons SET status='ended', ended_at=now() WHERE id=$1 AND status='active' RETURNING *`, [id]);
  if (!r) throw bad('Dars allaqachon tugagan');
  await q(`UPDATE live_questions SET is_open=false WHERE lesson_id=$1`, [id]);
  endLessonRealtime(id);
  await audit(req.user!.id, 'lesson_end', 'lesson', id, null, req.ip);
  res.json({ ok: true });
}));

// ---- Real-time savol ----
teacherLearning.post('/lessons/:id/questions', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({ text: z.string().trim().min(2).max(2000), max_score: z.coerce.number().min(0.5).max(100).default(1) }), req.body);
  const lesson = await one<any>(`SELECT * FROM live_lessons WHERE id=$1 AND status='active'`, [id]);
  if (!lesson) throw bad('Dars aktiv emas');
  const row = await one<any>(`INSERT INTO live_questions (lesson_id, text, max_score) VALUES ($1,$2,$3) RETURNING *`, [id, b.text, b.max_score]);
  emitToLesson(id, 'question:new', { id: row.id, text: row.text, max_score: row.max_score });
  await notifyGroup(lesson.group_id, 'question', 'Yangi savol', b.text.slice(0, 100), '/student/live');
  res.status(201).json(row);
}));
teacherLearning.post('/lessons/:id/questions/:qid/close', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const qid = parse(uuid, req.params.qid);
  await q(`UPDATE live_questions SET is_open=false WHERE id=$1 AND lesson_id=$2`, [qid, id]);
  emitToLesson(id, 'question:closed', { id: qid });
  res.json({ ok: true });
}));
teacherLearning.post('/live-answers/:id/grade', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { score } = parse(z.object({ score: z.coerce.number().min(0) }), req.body);
  const a = await one<any>(`SELECT la.*, lq.max_score, lq.text AS qtext, ll.subject_id, ll.id AS lesson_id FROM live_answers la
    JOIN live_questions lq ON lq.id=la.question_id JOIN live_lessons ll ON ll.id=lq.lesson_id WHERE la.id=$1`, [id]);
  if (!a) throw notFound();
  if (score > Number(a.max_score)) throw bad(`Maksimal ball ${a.max_score}`);
  const cat = await one<any>(`SELECT id FROM grade_categories WHERE system_key='activity'`);
  await tx(async (c) => {
    await c.query(`UPDATE live_answers SET score=$2 WHERE id=$1`, [id, score]);
    await c.query(`INSERT INTO grades (student_id, subject_id, category_id, lesson_id, score, max_score, comment, source_type, source_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'live_answer',$8)
      ON CONFLICT (source_type, source_id, student_id) WHERE source_id IS NOT NULL DO UPDATE SET score=EXCLUDED.score`,
      [a.student_id, a.subject_id, cat.id, a.lesson_id, score, a.max_score, `Savol: ${a.qtext.slice(0, 80)}`, id]);
  });
  const su = await studentUser(a.student_id);
  emitToUser(su.user_id, 'question:graded', { question_id: a.question_id, score });
  await notifyUsers([su.user_id], 'grade', 'Javobingiz baholandi', `${score}/${a.max_score}`, '/student/grades');
  scheduleMonitor(a.lesson_id);
  res.json({ ok: true });
}));

// ---- Jonli quiz boshqaruvi ----
teacherLearning.post('/lessons/:id/quiz/start', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { quiz_id } = parse(z.object({ quiz_id: uuid }), req.body);
  try { await startQuiz(id, quiz_id); } catch (e: any) { throw bad(e.message); }
  res.json(quizState(id));
}));
teacherLearning.post('/lessons/:id/quiz/next', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  try { await nextQuestion(id); } catch (e: any) { throw bad(e.message); }
  res.json(quizState(id));
}));
teacherLearning.post('/lessons/:id/quiz/reveal', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  reveal(id);
  res.json(quizState(id));
}));
teacherLearning.post('/lessons/:id/quiz/stop', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await finishQuiz(id);
  res.json(quizState(id));
}));
teacherLearning.get('/lessons/:id/monitor', ah(async (req, res) => {
  res.json(await lessonMonitor(parse(uuid, req.params.id)));
}));

// ======================= DAVOMAT =======================
teacherLearning.get('/attendance', ah(async (req, res) => {
  const subjectId = req.query.subject_id ? parse(uuid, req.query.subject_id) : null;
  const groupId = req.query.group_id ? parse(uuid, req.query.group_id) : null;
  res.json(await q(`SELECT a.*, s.name AS subject_name, g.name AS group_name,
      count(*) FILTER (WHERE ar.status='present')::int AS present,
      count(*) FILTER (WHERE ar.status='late')::int AS late,
      count(*) FILTER (WHERE ar.status='absent')::int AS absent
    FROM attendance a JOIN subjects s ON s.id=a.subject_id JOIN groups g ON g.id=a.group_id
    LEFT JOIN attendance_records ar ON ar.attendance_id=a.id
    WHERE ($1::uuid IS NULL OR a.subject_id=$1) AND ($2::uuid IS NULL OR a.group_id=$2)
    GROUP BY a.id, s.name, g.name ORDER BY a.date DESC, a.created_at DESC LIMIT 200`, [subjectId, groupId]));
}));
// Davomat varag'i: dars bo'yicha yoki (fan, guruh, sana) bo'yicha
teacherLearning.get('/attendance/sheet', ah(async (req, res) => {
  const b = parse(z.object({ lesson_id: uuid.optional(), attendance_id: uuid.optional(), group_id: uuid.optional() }), req.query);
  let att: any = null, groupId = b.group_id;
  if (b.attendance_id) att = await one(`SELECT * FROM attendance WHERE id=$1`, [b.attendance_id]);
  else if (b.lesson_id) {
    att = await one(`SELECT * FROM attendance WHERE lesson_id=$1`, [b.lesson_id]);
    if (!att) groupId = (await one<any>(`SELECT group_id FROM live_lessons WHERE id=$1`, [b.lesson_id]))?.group_id;
  }
  if (att) groupId = att.group_id;
  if (!groupId) throw bad('Guruh aniqlanmadi');
  const rows = await q(`SELECT st.id AS student_id, st.public_id, u.full_name, ar.status
    FROM student_groups sg JOIN students st ON st.id=sg.student_id JOIN users u ON u.id=st.user_id
    LEFT JOIN attendance_records ar ON ar.student_id=st.id AND ar.attendance_id=$2
    WHERE sg.group_id=$1 ORDER BY u.full_name`, [groupId, att?.id ?? null]);
  res.json({ attendance: att, students: rows });
}));
teacherLearning.post('/attendance', ah(async (req, res) => {
  const b = parse(z.object({
    lesson_id: uuid.optional().nullable(), subject_id: uuid.optional(), group_id: uuid.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    records: z.array(z.object({ student_id: uuid, status: z.enum(['present', 'absent', 'late']) })).min(1).max(500),
  }), req.body);
  let subjectId = b.subject_id, groupId = b.group_id;
  if (b.lesson_id) {
    const l = await one<any>(`SELECT * FROM live_lessons WHERE id=$1`, [b.lesson_id]);
    if (!l) throw notFound('Dars topilmadi');
    subjectId = l.subject_id; groupId = l.group_id;
  }
  if (!subjectId || !groupId) throw bad('Fan va guruh tanlang');
  await assertGroupSubject(groupId, subjectId);
  const members = new Set((await q<any>(`SELECT student_id FROM student_groups WHERE group_id=$1`, [groupId])).map((r) => r.student_id));
  if (b.records.some((r) => !members.has(r.student_id))) throw bad('Ro‘yxatda guruhga tegishli bo‘lmagan talaba bor');
  const attId = await tx(async (c) => {
    let att: any;
    if (b.lesson_id) {
      att = (await c.query(`INSERT INTO attendance (subject_id, group_id, lesson_id, date) VALUES ($1,$2,$3,CURRENT_DATE)
        ON CONFLICT (lesson_id) DO UPDATE SET lesson_id=EXCLUDED.lesson_id RETURNING id`, [subjectId, groupId, b.lesson_id])).rows[0];
    } else {
      att = (await c.query(`INSERT INTO attendance (subject_id, group_id, date) VALUES ($1,$2,$3) RETURNING id`, [subjectId, groupId, b.date ?? new Date().toISOString().slice(0, 10)])).rows[0];
    }
    for (const r of b.records) {
      await c.query(`INSERT INTO attendance_records (attendance_id, student_id, status) VALUES ($1,$2,$3)
        ON CONFLICT (attendance_id, student_id) DO UPDATE SET status=EXCLUDED.status`, [att.id, r.student_id, r.status]);
    }
    return att.id as string;
  });
  if (b.lesson_id) scheduleMonitor(b.lesson_id);
  await audit(req.user!.id, 'attendance_save', 'attendance', attId, { count: b.records.length }, req.ip);
  res.json({ ok: true, id: attId });
}));
teacherLearning.put('/attendance/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({ records: z.array(z.object({ student_id: uuid, status: z.enum(['present', 'absent', 'late']) })).min(1).max(500) }), req.body);
  const att = await one<any>(`SELECT * FROM attendance WHERE id=$1`, [id]);
  if (!att) throw notFound();
  const members = new Set((await q<any>(`SELECT student_id FROM student_groups WHERE group_id=$1`, [att.group_id])).map((r) => r.student_id));
  if (b.records.some((r) => !members.has(r.student_id))) throw bad('Ro‘yxatda guruhga tegishli bo‘lmagan talaba bor');
  await tx(async (c) => {
    for (const r of b.records) await c.query(`INSERT INTO attendance_records (attendance_id, student_id, status) VALUES ($1,$2,$3)
      ON CONFLICT (attendance_id, student_id) DO UPDATE SET status=EXCLUDED.status`, [id, r.student_id, r.status]);
  });
  res.json({ ok: true });
}));
teacherLearning.delete('/attendance/:id', ah(async (req, res) => {
  await q(`DELETE FROM attendance WHERE id=$1`, [parse(uuid, req.params.id)]);
  res.json({ ok: true });
}));

// ======================= BAHOLAR =======================
teacherLearning.get('/grade-categories', ah(async (_req, res) => {
  res.json(await q(`SELECT * FROM grade_categories ORDER BY created_at`));
}));
teacherLearning.post('/grade-categories', ah(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(60), default_max: z.coerce.number().min(0.5).max(1000) }), req.body);
  res.status(201).json(await one(`INSERT INTO grade_categories (name, default_max) VALUES ($1,$2) RETURNING *`, [b.name, b.default_max]));
}));
teacherLearning.put('/grade-categories/:id', ah(async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(60), default_max: z.coerce.number().min(0.5).max(1000) }), req.body);
  const r = await one(`UPDATE grade_categories SET name=$2, default_max=$3 WHERE id=$1 RETURNING *`, [parse(uuid, req.params.id), b.name, b.default_max]);
  if (!r) throw notFound();
  res.json(r);
}));
teacherLearning.delete('/grade-categories/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const c = await one<any>(`SELECT system_key FROM grade_categories WHERE id=$1`, [id]);
  if (c?.system_key) throw bad('Tizim kategoriyasini o‘chirib bo‘lmaydi');
  const used = await one<any>(`SELECT count(*)::int AS n FROM grades WHERE category_id=$1`, [id]);
  if (used.n) throw bad('Bu kategoriyada baholar bor');
  await q(`DELETE FROM grade_categories WHERE id=$1`, [id]);
  res.json({ ok: true });
}));

teacherLearning.get('/grades', ah(async (req, res) => {
  const b = parse(z.object({ subject_id: uuid, group_id: uuid }), req.query);
  const [students, categories, grades] = await Promise.all([
    q(`SELECT st.id, st.public_id, u.full_name FROM student_groups sg JOIN students st ON st.id=sg.student_id JOIN users u ON u.id=st.user_id
       WHERE sg.group_id=$1 ORDER BY u.full_name`, [b.group_id]),
    q(`SELECT * FROM grade_categories ORDER BY created_at`),
    q(`SELECT g.*, gc.name AS category_name FROM grades g JOIN grade_categories gc ON gc.id=g.category_id
       JOIN student_groups sg ON sg.student_id=g.student_id AND sg.group_id=$2
       WHERE g.subject_id=$1 ORDER BY g.created_at`, [b.subject_id, b.group_id]),
  ]);
  res.json({ students, categories, grades });
}));

const gradeItem = z.object({
  student_id: uuid, subject_id: uuid, category_id: uuid,
  score: z.coerce.number().min(0).max(1000), max_score: z.coerce.number().min(0.5).max(1000),
  comment: optStr(500), lesson_id: uuid.optional().nullable(),
}).refine((v) => v.score <= v.max_score, { message: 'Ball maksimaldan oshmasin', path: ['score'] });

teacherLearning.post('/grades', ah(async (req, res) => {
  const { items } = parse(z.object({ items: z.array(gradeItem).min(1).max(200) }), req.body);
  const created = await tx(async (c) => {
    const out: any[] = [];
    for (const it of items) {
      const ok = (await c.query(`SELECT 1 FROM student_groups sg JOIN group_subjects gs ON gs.group_id=sg.group_id
        WHERE sg.student_id=$1 AND gs.subject_id=$2`, [it.student_id, it.subject_id])).rowCount;
      if (!ok) throw bad('Talaba guruhiga bu fan biriktirilmagan');
      out.push((await c.query(`INSERT INTO grades (student_id, subject_id, category_id, lesson_id, score, max_score, comment)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [it.student_id, it.subject_id, it.category_id, it.lesson_id ?? null, it.score, it.max_score, it.comment])).rows[0]);
    }
    return out;
  });
  const byStudent = new Map<string, any[]>();
  for (const g of created) byStudent.set(g.student_id, [...(byStudent.get(g.student_id) ?? []), g]);
  for (const [sid, gs] of byStudent) {
    const su = await studentUser(sid);
    emitToUser(su.user_id, 'grade:new', gs);
    await notifyUsers([su.user_id], 'grade', 'Yangi baho', gs.map((g) => `${g.score}/${g.max_score}`).join(', '), '/student/grades');
  }
  for (const l of new Set(created.map((g) => g.lesson_id).filter(Boolean))) scheduleMonitor(l);
  await audit(req.user!.id, 'grades_create', 'grade', null as any, { count: created.length }, req.ip);
  res.status(201).json(created);
}));
teacherLearning.put('/grades/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({ score: z.coerce.number().min(0), comment: optStr(500) }), req.body);
  const r = await one<any>(`UPDATE grades SET score=$2, comment=$3 WHERE id=$1 AND $2 <= max_score RETURNING *`, [id, b.score, b.comment]);
  if (!r) throw bad('Baho topilmadi yoki ball maksimaldan katta');
  await audit(req.user!.id, 'grade_update', 'grade', id, b, req.ip);
  res.json(r);
}));
teacherLearning.delete('/grades/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await q(`DELETE FROM grades WHERE id=$1`, [id]);
  await audit(req.user!.id, 'grade_delete', 'grade', id, null, req.ip);
  res.json({ ok: true });
}));

// ======================= MATERIALLAR =======================
teacherLearning.get('/materials', ah(async (req, res) => {
  const subjectId = req.query.subject_id ? parse(uuid, req.query.subject_id) : null;
  const groupId = req.query.group_id ? parse(uuid, req.query.group_id) : null;
  res.json(await q(`SELECT m.id, m.title, m.file_name, m.file_size, m.mime_type, m.created_at, m.lesson_id, s.name AS subject_name, g.name AS group_name
    FROM materials m JOIN subjects s ON s.id=m.subject_id JOIN groups g ON g.id=m.group_id
    WHERE ($1::uuid IS NULL OR m.subject_id=$1) AND ($2::uuid IS NULL OR m.group_id=$2) ORDER BY m.created_at DESC`, [subjectId, groupId]));
}));
teacherLearning.post('/materials', upload.single('file'), ah(async (req, res) => {
  try {
    const b = parse(z.object({ title: z.string().trim().min(1).max(200), subject_id: uuid.optional(), group_id: uuid.optional(), lesson_id: uuid.optional().or(z.literal('')).transform((v) => v || undefined) }), req.body);
    if (!req.file) throw bad('Fayl tanlang');
    let subjectId = b.subject_id, groupId = b.group_id;
    if (b.lesson_id) {
      const l = await one<any>(`SELECT * FROM live_lessons WHERE id=$1`, [b.lesson_id]);
      if (!l) throw notFound('Dars topilmadi');
      subjectId = l.subject_id; groupId = l.group_id;
    }
    if (!subjectId || !groupId) throw bad('Fan va guruh tanlang');
    await assertGroupSubject(groupId, subjectId);
    const f = finalizeUpload(req.file, 'materials')!;
    const m = await one<any>(`INSERT INTO materials (subject_id, group_id, lesson_id, title, file_name, file_path, file_size, mime_type, uploaded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, title, file_name, file_size, mime_type, created_at, lesson_id, subject_id, group_id`,
      [subjectId, groupId, b.lesson_id ?? null, b.title, f.file_name, f.file_path, f.file_size, f.mime_type, req.user!.id]);
    emitToGroup(groupId, 'material:new', m);
    await notifyGroup(groupId, 'material', 'Yangi material', `${b.title} (${f.file_name})`, '/student/materials');
    await audit(req.user!.id, 'material_upload', 'material', m.id, { file: f.file_name }, req.ip);
    res.status(201).json(m);
  } catch (e) { discardUpload(req.file); throw e; }
}));
teacherLearning.delete('/materials/:id', ah(async (req, res) => {
  const r = await one<any>(`DELETE FROM materials WHERE id=$1 RETURNING file_path`, [parse(uuid, req.params.id)]);
  if (!r) throw notFound();
  removeStored(r.file_path);
  res.json({ ok: true });
}));

// ======================= AMALIY TOPSHIRIQLAR =======================
teacherLearning.get('/assignments', ah(async (req, res) => {
  const groupId = req.query.group_id ? parse(uuid, req.query.group_id) : null;
  res.json(await q(`SELECT a.id, a.public_id, a.title, a.deadline, a.max_score, a.created_at, a.lesson_id, a.file_name,
      s.name AS subject_name, g.name AS group_name,
      (SELECT count(*)::int FROM student_groups sg WHERE sg.group_id=a.group_id) AS total,
      (SELECT count(*)::int FROM assignment_submissions x WHERE x.assignment_id=a.id AND x.status IN ('submitted','graded')) AS submitted,
      (SELECT count(*)::int FROM assignment_submissions x WHERE x.assignment_id=a.id AND x.status='submitted') AS to_check
    FROM assignments a JOIN subjects s ON s.id=a.subject_id JOIN groups g ON g.id=a.group_id
    WHERE ($1::uuid IS NULL OR a.group_id=$1) ORDER BY a.created_at DESC`, [groupId]));
}));
teacherLearning.get('/assignments/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const a = await one<any>(`SELECT a.*, s.name AS subject_name, g.name AS group_name FROM assignments a
    JOIN subjects s ON s.id=a.subject_id JOIN groups g ON g.id=a.group_id WHERE a.id=$1`, [id]);
  if (!a) throw notFound();
  delete a.file_path;
  const subs = await q(`SELECT st.id AS student_id, u.full_name, st.public_id, sub.id, COALESCE(sub.status,'not_started') AS status,
      sub.text_answer, sub.file_name, sub.mime_type, sub.score, sub.feedback, sub.submitted_at, sub.graded_at
    FROM student_groups sg JOIN students st ON st.id=sg.student_id JOIN users u ON u.id=st.user_id
    LEFT JOIN assignment_submissions sub ON sub.student_id=st.id AND sub.assignment_id=$1
    WHERE sg.group_id=$2 ORDER BY u.full_name`, [id, a.group_id]);
  res.json({ ...a, submissions: subs });
}));
teacherLearning.post('/assignments', upload.single('file'), ah(async (req, res) => {
  try {
    const b = parse(z.object({
      title: z.string().trim().min(2).max(300), description: optStr(10000),
      deadline: z.string().optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(v) : null))
        .refine((d) => !d || !isNaN(d.getTime()), 'sana noto‘g‘ri'),
      max_score: z.coerce.number().min(0.5).max(1000).default(10),
      subject_id: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
      group_id: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
      lesson_id: uuid.optional().or(z.literal('')).transform((v) => v || undefined),
    }), req.body);
    let subjectId = b.subject_id, groupId = b.group_id;
    if (b.lesson_id) {
      const l = await one<any>(`SELECT * FROM live_lessons WHERE id=$1`, [b.lesson_id]);
      if (!l) throw notFound('Dars topilmadi');
      subjectId = l.subject_id; groupId = l.group_id;
    }
    if (!subjectId || !groupId) throw bad('Fan va guruh tanlang');
    await assertGroupSubject(groupId, subjectId);
    const f = finalizeUpload(req.file, 'assignments');
    const a = await one<any>(`INSERT INTO assignments (public_id, subject_id, group_id, lesson_id, title, description, deadline, max_score, file_name, file_path, file_size, mime_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, public_id, title, description, deadline, max_score, file_name, lesson_id, created_at`,
      [await publicId('ASN', 'assignments'), subjectId, groupId, b.lesson_id ?? null, b.title, b.description, b.deadline, b.max_score,
        f?.file_name ?? null, f?.file_path ?? null, f?.file_size ?? null, f?.mime_type ?? null]);
    emitToGroup(groupId, 'assignment:new', a);
    await notifyGroup(groupId, 'assignment', 'Yangi topshiriq', b.title, `/student/assignments/${a.id}`);
    if (b.lesson_id) scheduleMonitor(b.lesson_id);
    await audit(req.user!.id, 'assignment_create', 'assignment', a.id, null, req.ip);
    res.status(201).json(a);
  } catch (e) { discardUpload(req.file); throw e; }
}));
teacherLearning.delete('/assignments/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const files = await q<any>(`SELECT file_path FROM assignment_submissions WHERE assignment_id=$1 AND file_path IS NOT NULL`, [id]);
  const r = await one<any>(`DELETE FROM assignments WHERE id=$1 RETURNING file_path`, [id]);
  if (!r) throw notFound();
  removeStored(r.file_path);
  files.forEach((f) => removeStored(f.file_path));
  await q(`DELETE FROM grades WHERE source_type='assignment' AND source_id=$1`, [id]);
  res.json({ ok: true });
}));
teacherLearning.post('/submissions/:id/grade', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({ score: z.coerce.number().min(0), feedback: optStr(2000) }), req.body);
  const s = await one<any>(`SELECT sub.*, a.max_score, a.subject_id, a.title, a.lesson_id FROM assignment_submissions sub JOIN assignments a ON a.id=sub.assignment_id WHERE sub.id=$1`, [id]);
  if (!s) throw notFound();
  if (s.status === 'working') throw bad('Talaba hali topshirmagan');
  if (b.score > Number(s.max_score)) throw bad(`Maksimal ball ${s.max_score}`);
  const cat = await one<any>(`SELECT id FROM grade_categories WHERE system_key='assignment'`);
  await tx(async (c) => {
    await c.query(`UPDATE assignment_submissions SET score=$2, feedback=$3, status='graded', graded_at=now() WHERE id=$1`, [id, b.score, b.feedback]);
    await c.query(`INSERT INTO grades (student_id, subject_id, category_id, lesson_id, score, max_score, comment, source_type, source_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'assignment',$8)
      ON CONFLICT (source_type, source_id, student_id) WHERE source_id IS NOT NULL DO UPDATE SET score=EXCLUDED.score, comment=EXCLUDED.comment`,
      [s.student_id, s.subject_id, cat.id, s.lesson_id, b.score, s.max_score, s.title, s.assignment_id]);
  });
  const su = await studentUser(s.student_id);
  emitToUser(su.user_id, 'submission:graded', { assignment_id: s.assignment_id, score: b.score, feedback: b.feedback });
  await notifyUsers([su.user_id], 'grade', 'Topshiriq baholandi', `${s.title}: ${b.score}/${s.max_score}`, `/student/assignments/${s.assignment_id}`);
  if (s.lesson_id) scheduleMonitor(s.lesson_id);
  await audit(req.user!.id, 'submission_grade', 'submission', id, b, req.ip);
  res.json({ ok: true });
}));

// ======================= TEST / QUIZ =======================
const questionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  option_a: z.string().trim().min(1).max(500), option_b: z.string().trim().min(1).max(500),
  option_c: optStr(500), option_d: optStr(500),
  correct: z.enum(['A', 'B', 'C', 'D']),
  time_sec: z.coerce.number().int().min(5).max(600).default(20),
  points: z.coerce.number().min(0.5).max(100).default(1),
}).refine((v) => (v.correct !== 'C' || v.option_c) && (v.correct !== 'D' || v.option_d), { message: 'To‘g‘ri javob varianti bo‘sh', path: ['correct'] });
const quizSchema = z.object({
  title: z.string().trim().min(2).max(200), subject_id: uuid, mode: z.enum(['live', 'test']).default('live'),
  questions: z.array(questionSchema).min(1).max(100),
});

teacherLearning.get('/quizzes', ah(async (req, res) => {
  const mode = req.query.mode === 'test' ? 'test' : req.query.mode === 'live' ? 'live' : null;
  res.json(await q(`SELECT qz.*, s.name AS subject_name, g.name AS group_name,
      (SELECT count(*)::int FROM quiz_questions qq WHERE qq.quiz_id=qz.id) AS question_count,
      (SELECT count(*)::int FROM quiz_attempts qa WHERE qa.quiz_id=qz.id) AS attempt_count
    FROM quizzes qz JOIN subjects s ON s.id=qz.subject_id LEFT JOIN groups g ON g.id=qz.group_id
    WHERE ($1::text IS NULL OR qz.mode=$1) ORDER BY qz.created_at DESC`, [mode]));
}));
teacherLearning.get('/quizzes/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const quiz = await one(`SELECT * FROM quizzes WHERE id=$1`, [id]);
  if (!quiz) throw notFound();
  const questions = await q(`SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY position`, [id]);
  const attempts = await q(`SELECT qa.*, u.full_name, st.public_id, g.name AS group_name FROM quiz_attempts qa JOIN students st ON st.id=qa.student_id
    JOIN users u ON u.id=st.user_id LEFT JOIN student_groups sg ON sg.student_id=st.id LEFT JOIN groups g ON g.id=sg.group_id
    WHERE qa.quiz_id=$1 ORDER BY qa.score DESC, u.full_name`, [id]);
  res.json({ ...quiz, questions, attempts });
}));
async function saveQuestions(c: any, quizId: string, questions: z.infer<typeof questionSchema>[]) {
  await c.query(`DELETE FROM quiz_questions WHERE quiz_id=$1`, [quizId]);
  let pos = 1;
  for (const x of questions) {
    await c.query(`INSERT INTO quiz_questions (quiz_id, position, text, option_a, option_b, option_c, option_d, correct, time_sec, points)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [quizId, pos++, x.text, x.option_a, x.option_b, x.option_c, x.option_d, x.correct, x.time_sec, x.points]);
  }
}
teacherLearning.post('/quizzes', ah(async (req, res) => {
  const b = parse(quizSchema, req.body);
  const id = await tx(async (c) => {
    const pid = await publicId('QUIZ', 'quizzes', c);
    const qz = (await c.query(`INSERT INTO quizzes (public_id, subject_id, title, mode) VALUES ($1,$2,$3,$4) RETURNING id`, [pid, b.subject_id, b.title, b.mode])).rows[0];
    await saveQuestions(c, qz.id, b.questions);
    return qz.id;
  });
  await audit(req.user!.id, 'quiz_create', 'quiz', id, { title: b.title }, req.ip);
  res.status(201).json({ id });
}));
teacherLearning.put('/quizzes/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(quizSchema, req.body);
  const used = await one<any>(`SELECT count(*)::int AS n FROM quiz_attempts WHERE quiz_id=$1`, [id]);
  if (used.n) throw bad('Bu test allaqachon ishlatilgan — savollarni o‘zgartirib bo‘lmaydi. Nusxa yarating.');
  await tx(async (c) => {
    const r = await c.query(`UPDATE quizzes SET title=$2, subject_id=$3, mode=$4 WHERE id=$1`, [id, b.title, b.subject_id, b.mode]);
    if (!r.rowCount) throw notFound();
    await saveQuestions(c, id, b.questions);
  });
  res.json({ ok: true });
}));
teacherLearning.post('/quizzes/:id/publish', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(z.object({
    group_id: uuid,
    opens_at: z.string().optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(v) : null)),
    closes_at: z.string().optional().nullable().or(z.literal('')).transform((v) => (v ? new Date(v) : null)),
    time_limit_min: z.coerce.number().int().min(1).max(600).optional().nullable(),
  }), req.body);
  const quiz = await one<any>(`SELECT * FROM quizzes WHERE id=$1`, [id]);
  if (!quiz) throw notFound();
  await assertGroupSubject(b.group_id, quiz.subject_id);
  await q(`UPDATE quizzes SET mode='test', group_id=$2, opens_at=$3, closes_at=$4, time_limit_min=$5, is_published=true WHERE id=$1`,
    [id, b.group_id, b.opens_at, b.closes_at, b.time_limit_min ?? null]);
  emitToGroup(b.group_id, 'test:new', { id, title: quiz.title });
  await notifyGroup(b.group_id, 'test', 'Yangi test', quiz.title, '/student/tests');
  res.json({ ok: true });
}));
teacherLearning.post('/quizzes/:id/unpublish', ah(async (req, res) => {
  await q(`UPDATE quizzes SET is_published=false WHERE id=$1`, [parse(uuid, req.params.id)]);
  res.json({ ok: true });
}));
teacherLearning.post('/quizzes/:id/copy', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const newId = await tx(async (c) => {
    const src = (await c.query(`SELECT * FROM quizzes WHERE id=$1`, [id])).rows[0];
    if (!src) throw notFound();
    const pid = await publicId('QUIZ', 'quizzes', c);
    const n = (await c.query(`INSERT INTO quizzes (public_id, subject_id, title, mode) VALUES ($1,$2,$3,$4) RETURNING id`, [pid, src.subject_id, `${src.title} (nusxa)`, src.mode])).rows[0];
    await c.query(`INSERT INTO quiz_questions (quiz_id, position, text, option_a, option_b, option_c, option_d, correct, time_sec, points)
      SELECT $2, position, text, option_a, option_b, option_c, option_d, correct, time_sec, points FROM quiz_questions WHERE quiz_id=$1`, [id, n.id]);
    return n.id;
  });
  res.status(201).json({ id: newId });
}));
teacherLearning.delete('/quizzes/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  await q(`DELETE FROM grades WHERE source_type='quiz' AND source_id IN (SELECT id FROM quiz_attempts WHERE quiz_id=$1)`, [id]);
  await q(`DELETE FROM quizzes WHERE id=$1`, [id]);
  res.json({ ok: true });
}));

// ======================= STATISTIKA =======================
teacherLearning.get('/stats', ah(async (req, res) => {
  const b = parse(z.object({ subject_id: uuid, group_id: uuid }), req.query);
  const students = await q<any>(`
    WITH st AS (SELECT s.id, s.public_id, u.full_name FROM student_groups sg JOIN students s ON s.id=sg.student_id JOIN users u ON u.id=s.user_id WHERE sg.group_id=$2)
    SELECT st.*,
      (SELECT round(100*sum(score)/NULLIF(sum(max_score),0),1)::float FROM grades g WHERE g.student_id=st.id AND g.subject_id=$1) AS avg_grade,
      (SELECT round(100.0*count(*) FILTER (WHERE ar.status IN ('present','late'))/NULLIF(count(*),0),1)::float
         FROM attendance a JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.subject_id=$1 AND a.group_id=$2 AND ar.student_id=st.id) AS attendance,
      (SELECT round(100*sum(qa.score)/NULLIF(sum(qa.max_score),0),1)::float FROM quiz_attempts qa JOIN quizzes qz ON qz.id=qa.quiz_id
         WHERE qa.student_id=st.id AND qz.subject_id=$1 AND qz.mode='test' AND qa.finished_at IS NOT NULL) AS test_perf,
      (SELECT round(100*sum(qa.score)/NULLIF(sum(qa.max_score),0),1)::float FROM quiz_attempts qa JOIN quizzes qz ON qz.id=qa.quiz_id
         WHERE qa.student_id=st.id AND qz.subject_id=$1 AND qz.mode='live' AND qa.finished_at IS NOT NULL) AS quiz_perf,
      (SELECT count(*)::int FROM assignment_submissions x JOIN assignments a ON a.id=x.assignment_id
         WHERE x.student_id=st.id AND a.subject_id=$1 AND a.group_id=$2 AND x.status IN ('submitted','graded')) AS assignments_done
    FROM st ORDER BY st.full_name`, [b.subject_id, b.group_id]);
  const totalAssignments = (await one<any>(`SELECT count(*)::int AS n FROM assignments WHERE subject_id=$1 AND group_id=$2`, [b.subject_id, b.group_id])).n;
  const timeline = await q(`SELECT g.student_id, date_trunc('day', g.created_at)::date::text AS day, round(100*sum(g.score)/sum(g.max_score),1)::float AS pct
    FROM grades g JOIN student_groups sg ON sg.student_id=g.student_id AND sg.group_id=$2
    WHERE g.subject_id=$1 GROUP BY g.student_id, day ORDER BY day`, [b.subject_id, b.group_id]);
  const byCategory = await q(`SELECT gc.name, round(100*sum(g.score)/sum(g.max_score),1)::float AS pct, count(*)::int AS n
    FROM grades g JOIN grade_categories gc ON gc.id=g.category_id JOIN student_groups sg ON sg.student_id=g.student_id AND sg.group_id=$2
    WHERE g.subject_id=$1 GROUP BY gc.name ORDER BY gc.name`, [b.subject_id, b.group_id]);
  const attendanceTrend = await q(`SELECT a.date::text AS day, round(100.0*count(*) FILTER (WHERE ar.status IN ('present','late'))/NULLIF(count(*),0),1)::float AS pct
    FROM attendance a JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.subject_id=$1 AND a.group_id=$2 GROUP BY a.date ORDER BY a.date`, [b.subject_id, b.group_id]);
  const avg = (k: string) => {
    const v = students.map((s) => s[k]).filter((x) => x !== null);
    return v.length ? Math.round((v.reduce((a, c) => a + c, 0) / v.length) * 10) / 10 : null;
  };
  res.json({
    summary: {
      avg_grade: avg('avg_grade'), attendance: avg('attendance'), test_perf: avg('test_perf'), quiz_perf: avg('quiz_perf'),
      assignment_completion: totalAssignments && students.length
        ? Math.round((1000 * students.reduce((a, s) => a + s.assignments_done, 0)) / (totalAssignments * students.length)) / 10 : null,
      total_assignments: totalAssignments, student_count: students.length,
    },
    students, timeline, byCategory, attendanceTrend,
  });
}));
