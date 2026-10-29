import type http from 'node:http';
import { Server, type Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { config } from './config.js';
import { q, one, tx } from './db/pool.js';
import { SESSION_COOKIE, userFromToken, type AuthUser } from './auth.js';

let io: Server;

// ---------------- Presence ----------------
const userSockets = new Map<string, Set<string>>();                 // userId -> socketIds
const lessonState = new Map<string, Map<string, 'active' | 'away'>>(); // lessonId -> studentId -> holat

export const isOnline = (userId: string) => (userSockets.get(userId)?.size ?? 0) > 0;

export function emitToUser(userId: string, ev: string, data: unknown) { io?.to(`user:${userId}`).emit(ev, data); }
export function emitToGroup(groupId: string, ev: string, data: unknown) { io?.to(`group:${groupId}`).emit(ev, data); }
export function emitToLesson(lessonId: string, ev: string, data: unknown) { io?.to(`lesson:${lessonId}`).emit(ev, data); }
export function emitToTeacher(ev: string, data: unknown) { io?.to('teacher').emit(ev, data); }
export function emitToLessonTeacher(lessonId: string, ev: string, data: unknown) { io?.to(`lesson:${lessonId}:teacher`).emit(ev, data); }

// ---------------- Bildirishnomalar ----------------
export async function notifyUsers(userIds: string[], type: string, title: string, body?: string | null, link?: string | null) {
  if (!userIds.length) return;
  const rows = await q<any>(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT unnest($1::uuid[]), $2, $3, $4, $5 RETURNING *`, [userIds, type, title, body ?? null, link ?? null]);
  for (const n of rows) emitToUser(n.user_id, 'notification', n);
}
export async function groupStudentUserIds(groupId: string): Promise<string[]> {
  const rows = await q<{ user_id: string }>(
    `SELECT s.user_id FROM student_groups sg JOIN students s ON s.id = sg.student_id
     JOIN users u ON u.id = s.user_id WHERE sg.group_id = $1 AND u.is_active`, [groupId]);
  return rows.map((r) => r.user_id);
}
export async function notifyGroup(groupId: string, type: string, title: string, body?: string | null, link?: string | null) {
  await notifyUsers(await groupStudentUserIds(groupId), type, title, body, link);
}
export async function teacherId(): Promise<string | null> {
  return (await one<{ id: string }>(`SELECT id FROM users WHERE role='teacher'`))?.id ?? null;
}

// ---------------- Live monitoring ----------------
const monitorTimers = new Map<string, NodeJS.Timeout>();
export function scheduleMonitor(lessonId: string) {
  if (monitorTimers.has(lessonId)) return;
  monitorTimers.set(lessonId, setTimeout(async () => {
    monitorTimers.delete(lessonId);
    try { io?.to(`lesson:${lessonId}:teacher`).emit('monitor:update', await lessonMonitor(lessonId)); }
    catch (e) { console.error('monitor', e); }
  }, 250));
}

export async function lessonMonitor(lessonId: string) {
  const lesson = await one<any>(`SELECT * FROM live_lessons WHERE id=$1`, [lessonId]);
  if (!lesson) return null;
  const students = await q<any>(`
    SELECT s.id AS student_id, s.public_id, u.id AS user_id, u.full_name
    FROM student_groups sg JOIN students s ON s.id = sg.student_id JOIN users u ON u.id = s.user_id
    WHERE sg.group_id = $1 AND u.is_active ORDER BY u.full_name`, [lesson.group_id]);
  const task = await one<any>(`SELECT id, title, max_score FROM assignments WHERE lesson_id=$1 ORDER BY created_at DESC LIMIT 1`, [lessonId]);
  const subs = task ? await q<any>(`SELECT student_id, status, score FROM assignment_submissions WHERE assignment_id=$1`, [task.id]) : [];
  const quiz = await one<any>(`SELECT qa.quiz_id, qz.title FROM quiz_attempts qa JOIN quizzes qz ON qz.id=qa.quiz_id
                               WHERE qa.lesson_id=$1 ORDER BY qa.started_at DESC LIMIT 1`, [lessonId]);
  const attempts = quiz ? await q<any>(`SELECT student_id, score, max_score, finished_at FROM quiz_attempts WHERE lesson_id=$1 AND quiz_id=$2`, [lessonId, quiz.quiz_id]) : [];
  const scores = await q<any>(`SELECT student_id, SUM(score)::float AS score FROM grades WHERE lesson_id=$1 GROUP BY student_id`, [lessonId]);
  const att = await q<any>(`SELECT ar.student_id, ar.status FROM attendance a JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.lesson_id=$1`, [lessonId]);
  const st = lessonState.get(lessonId) ?? new Map();
  const run = quizRuns.get(lessonId);
  const rows = students.map((s) => {
    const inLesson = st.get(s.student_id);
    const online = inLesson === 'active' ? 'green' : (inLesson === 'away' || isOnline(s.user_id)) ? 'yellow' : 'red';
    const sub = subs.find((x) => x.student_id === s.student_id);
    const a = attempts.find((x) => x.student_id === s.student_id);
    const quizStatus = run && run.quizId === quiz?.quiz_id && run.phase !== 'finished'
      ? (run.answered.has(s.student_id) ? 'answered' : a ? 'in_progress' : 'not_started')
      : a ? (a.finished_at ? 'done' : 'in_progress') : null;
    return {
      ...s, online,
      task: task ? (sub?.status ?? 'not_started') : null,
      task_score: sub?.score ?? null,
      quiz: quizStatus,
      quiz_score: a ? a.score : null,
      score: scores.find((x) => x.student_id === s.student_id)?.score ?? null,
      attendance: att.find((x) => x.student_id === s.student_id)?.status ?? null,
    };
  });
  return {
    lessonId,
    online: rows.filter((r) => r.online === 'green').length,
    total: rows.length,
    task, quiz: quiz ? { id: quiz.quiz_id, title: quiz.title } : null,
    students: rows,
  };
}

// ---------------- Live Quiz (Kahoot uslubi) ----------------
interface QuizQ { id: string; text: string; option_a: string; option_b: string; option_c: string | null; option_d: string | null; correct: string; time_sec: number; points: number }
interface QuizRun {
  lessonId: string; quizId: string; title: string; subjectId: string; groupId: string;
  questions: QuizQ[]; index: number; phase: 'question' | 'reveal' | 'finished';
  endsAt: number; timer?: NodeJS.Timeout;
  answered: Set<string>; counts: Record<string, number>;
  attempts: Map<string, string>; totals: Map<string, { score: number; ms: number }>;
  totalStudents: number;
}
const quizRuns = new Map<string, QuizRun>();

function publicQuestion(r: QuizRun) {
  const qq = r.questions[r.index];
  return {
    quizId: r.quizId, title: r.title, index: r.index, total: r.questions.length, questionId: qq.id,
    text: qq.text, points: qq.points, time_sec: qq.time_sec,
    options: (['A', 'B', 'C', 'D'] as const).map((k) => ({ key: k, text: (qq as any)[`option_${k.toLowerCase()}`] })).filter((o) => o.text),
    endsAt: r.endsAt, serverNow: Date.now(),
  };
}
export function quizState(lessonId: string) {
  const r = quizRuns.get(lessonId);
  if (!r) return null;
  const base = { quizId: r.quizId, title: r.title, phase: r.phase, index: r.index, total: r.questions.length, answered: r.answered.size, totalStudents: r.totalStudents };
  if (r.phase === 'question') return { ...base, question: publicQuestion(r) };
  if (r.phase === 'reveal') return { ...base, reveal: revealPayload(r) };
  return { ...base, leaderboard: leaderboard(r) };
}

async function names(ids: string[]) {
  const rows = await q<any>(`SELECT s.id, u.full_name FROM students s JOIN users u ON u.id=s.user_id WHERE s.id = ANY($1)`, [ids]);
  return new Map(rows.map((r) => [r.id, r.full_name]));
}
let nameCache = new Map<string, string>();
function leaderboard(r: QuizRun) {
  return [...r.totals.entries()]
    .map(([sid, t]) => ({ student_id: sid, full_name: nameCache.get(sid) ?? '—', score: t.score, ms: t.ms }))
    .sort((a, b) => b.score - a.score || a.ms - b.ms).slice(0, 10);
}
function revealPayload(r: QuizRun) {
  const qq = r.questions[r.index];
  return { questionId: qq.id, index: r.index, total: r.questions.length, correct: qq.correct, counts: r.counts, answered: r.answered.size, leaderboard: leaderboard(r), isLast: r.index === r.questions.length - 1 };
}

export async function startQuiz(lessonId: string, quizId: string) {
  if (quizRuns.get(lessonId) && quizRuns.get(lessonId)!.phase !== 'finished') throw new Error('Darsda boshqa quiz davom etmoqda');
  const lesson = await one<any>(`SELECT * FROM live_lessons WHERE id=$1 AND status='active'`, [lessonId]);
  if (!lesson) throw new Error('Dars aktiv emas');
  const quiz = await one<any>(`SELECT * FROM quizzes WHERE id=$1`, [quizId]);
  if (!quiz) throw new Error('Quiz topilmadi');
  if (quiz.subject_id !== lesson.subject_id) throw new Error('Quiz bu fanga tegishli emas');
  const questions = await q<QuizQ>(`SELECT * FROM quiz_questions WHERE quiz_id=$1 ORDER BY position`, [quizId]);
  if (!questions.length) throw new Error('Quizda savol yo‘q');
  const existing = await one(`SELECT 1 FROM quiz_attempts WHERE quiz_id=$1 AND lesson_id=$2`, [quizId, lessonId]);
  if (existing) throw new Error('Bu quiz shu darsda allaqachon o‘tkazilgan');
  const total = (await groupStudentUserIds(lesson.group_id)).length;
  const r: QuizRun = {
    lessonId, quizId, title: quiz.title, subjectId: lesson.subject_id, groupId: lesson.group_id, questions,
    index: -1, phase: 'question', endsAt: 0, answered: new Set(), counts: {}, attempts: new Map(), totals: new Map(), totalStudents: total,
  };
  quizRuns.set(lessonId, r);
  const sids = await q<any>(`SELECT student_id FROM student_groups WHERE group_id=$1`, [lesson.group_id]);
  nameCache = new Map([...nameCache, ...(await names(sids.map((x) => x.student_id)))]);
  await notifyGroup(lesson.group_id, 'quiz', 'Jonli quiz boshlandi', quiz.title, '/student/live');
  nextQuestion(lessonId);
}

export function nextQuestion(lessonId: string) {
  const r = quizRuns.get(lessonId);
  if (!r) throw new Error('Quiz yo‘q');
  if (r.phase === 'question' && r.index >= 0) throw new Error('Savol vaqti hali tugamagan');
  if (r.index >= r.questions.length - 1) return finishQuiz(lessonId);
  r.index += 1;
  r.phase = 'question';
  r.answered = new Set();
  r.counts = {};
  const qq = r.questions[r.index];
  r.endsAt = Date.now() + qq.time_sec * 1000;
  clearTimeout(r.timer);
  r.timer = setTimeout(() => reveal(lessonId), qq.time_sec * 1000 + 300);
  emitToLesson(lessonId, 'quiz:question', publicQuestion(r));
  io?.to(`lesson:${lessonId}:teacher`).emit('quiz:state', quizState(lessonId));
  scheduleMonitor(lessonId);
}

export function reveal(lessonId: string) {
  const r = quizRuns.get(lessonId);
  if (!r || r.phase !== 'question') return;
  clearTimeout(r.timer);
  r.phase = 'reveal';
  const payload = revealPayload(r);
  emitToLesson(lessonId, 'quiz:reveal', payload);
  io?.to(`lesson:${lessonId}:teacher`).emit('quiz:state', quizState(lessonId));
}

export async function finishQuiz(lessonId: string) {
  const r = quizRuns.get(lessonId);
  if (!r) return;
  clearTimeout(r.timer);
  r.phase = 'finished';
  const maxScore = r.questions.reduce((s, x) => s + Number(x.points), 0);
  const cat = await one<any>(`SELECT id FROM grade_categories WHERE system_key='quiz'`);
  await tx(async (c) => {
    for (const [sid, attemptId] of r.attempts) {
      const t = r.totals.get(sid) ?? { score: 0, ms: 0 };
      await c.query(`UPDATE quiz_attempts SET score=$2, max_score=$3, finished_at=now() WHERE id=$1`, [attemptId, t.score, maxScore]);
      if (cat) await c.query(`
        INSERT INTO grades (student_id, subject_id, category_id, lesson_id, score, max_score, comment, source_type, source_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'quiz',$8)
        ON CONFLICT (source_type, source_id, student_id) WHERE source_id IS NOT NULL DO UPDATE SET score=EXCLUDED.score`,
        [sid, r.subjectId, cat.id, lessonId, t.score, maxScore, r.title, attemptId]);
    }
  });
  const lb = leaderboard(r);
  emitToLesson(lessonId, 'quiz:finished', { quizId: r.quizId, title: r.title, leaderboard: lb, maxScore });
  const userRows = await q<any>(`SELECT s.id, s.user_id FROM students s WHERE s.id = ANY($1)`, [[...r.attempts.keys()]]);
  for (const u of userRows) {
    const t = r.totals.get(u.id) ?? { score: 0 };
    emitToUser(u.user_id, 'quiz:myresult', { quizId: r.quizId, score: t.score, maxScore });
  }
  await notifyUsers(userRows.map((u) => u.user_id), 'grade', 'Yangi baho: Quiz', r.title, '/student/grades');
  io?.to(`lesson:${lessonId}:teacher`).emit('quiz:state', quizState(lessonId));
  scheduleMonitor(lessonId);
}

export function stopQuiz(lessonId: string) { return finishQuiz(lessonId); }

async function submitQuizAnswer(user: AuthUser, lessonId: string, questionId: string, answer: string) {
  const r = quizRuns.get(lessonId);
  if (!r || r.phase !== 'question') return { ok: false, error: 'Savol yopilgan' };
  if (user.group_id !== r.groupId) return { ok: false, error: 'Ruxsat yo‘q' };
  if (Date.now() > r.endsAt + 250) return { ok: false, error: 'Vaqt tugadi' };           // vaqt tugagach qabul qilinmaydi
  const qq = r.questions[r.index];
  if (qq.id !== questionId) return { ok: false, error: 'Eski savol' };
  if (!['A', 'B', 'C', 'D'].includes(answer)) return { ok: false, error: 'Noto‘g‘ri javob' };
  const sid = user.student_id!;
  if (r.answered.has(sid)) return { ok: false, error: 'Siz allaqachon javob berdingiz' };
  r.answered.add(sid);
  const correct = qq.correct === answer;
  const points = correct ? Number(qq.points) : 0;
  const elapsed = qq.time_sec * 1000 - (r.endsAt - Date.now());
  let attemptId = r.attempts.get(sid);
  if (!attemptId) {
    const a = await one<any>(`INSERT INTO quiz_attempts (quiz_id, student_id, lesson_id) VALUES ($1,$2,$3)
      ON CONFLICT (quiz_id, student_id, lesson_id) DO UPDATE SET started_at=quiz_attempts.started_at RETURNING id`, [r.quizId, sid, lessonId]);
    attemptId = a.id as string;
    r.attempts.set(sid, attemptId);
  }
  await q(`INSERT INTO quiz_answers (attempt_id, question_id, answer, is_correct, points) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT DO NOTHING`, [attemptId, qq.id, answer, correct, points]);
  const t = r.totals.get(sid) ?? { score: 0, ms: 0 };
  r.totals.set(sid, { score: t.score + points, ms: t.ms + elapsed });
  r.counts[answer] = (r.counts[answer] ?? 0) + 1;
  io?.to(`lesson:${lessonId}:teacher`).emit('quiz:progress', { answered: r.answered.size, totalStudents: r.totalStudents, counts: r.counts });
  scheduleMonitor(lessonId);
  if (r.answered.size >= r.totalStudents) setTimeout(() => reveal(lessonId), 400); // hamma javob berdi
  return { ok: true };
}

// ---------------- Socket.IO server ----------------
export function initRealtime(server: http.Server) {
  io = new Server(server, {
    cors: { origin: config.appOrigin, credentials: true },
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const user = await userFromToken(cookies[SESSION_COOKIE]);
      if (!user || user.must_change_password) return next(new Error('unauthorized'));
      socket.data.user = user;
      next();
    } catch (e) { next(e as Error); }
  });

  io.on('connection', (socket: Socket) => {
    const user: AuthUser = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.role === 'teacher') socket.join('teacher');
    if (user.group_id) socket.join(`group:${user.group_id}`);
    if (!userSockets.has(user.id)) userSockets.set(user.id, new Set());
    userSockets.get(user.id)!.add(socket.id);
    emitToTeacher('presence', { userId: user.id, online: true });
    const joined = new Set<string>();

    const refreshLessons = () => { for (const l of lessonState.keys()) scheduleMonitor(l); };
    refreshLessons();

    socket.on('lesson:join', async (p: { lessonId?: string }, ack?: (r: unknown) => void) => {
      try {
        const lessonId = String(p?.lessonId ?? '');
        const lesson = await one<any>(`SELECT * FROM live_lessons WHERE id::text=$1 AND status='active'`, [lessonId]);
        if (!lesson) return ack?.({ ok: false, error: 'Dars topilmadi yoki tugagan' });
        if (user.role === 'teacher') {
          socket.join(`lesson:${lessonId}:teacher`);
          socket.join(`lesson:${lessonId}`);
          ack?.({ ok: true, monitor: await lessonMonitor(lessonId), quiz: quizState(lessonId) });
          return;
        }
        if (lesson.group_id !== user.group_id) return ack?.({ ok: false, error: 'Ruxsat yo‘q' });
        socket.join(`lesson:${lessonId}`);
        joined.add(lessonId);
        if (!lessonState.has(lessonId)) lessonState.set(lessonId, new Map());
        lessonState.get(lessonId)!.set(user.student_id!, 'active');
        await q(`INSERT INTO live_participants (lesson_id, student_id) VALUES ($1,$2)
                 ON CONFLICT (lesson_id, student_id) DO UPDATE SET last_seen = now()`, [lessonId, user.student_id]);
        scheduleMonitor(lessonId);
        const openQ = await q<any>(`SELECT lq.id, lq.text, lq.max_score, la.text AS my_answer, la.score AS my_score
          FROM live_questions lq LEFT JOIN live_answers la ON la.question_id=lq.id AND la.student_id=$2
          WHERE lq.lesson_id=$1 AND lq.is_open ORDER BY lq.created_at DESC`, [lessonId, user.student_id]);
        const qs = quizState(lessonId);
        ack?.({ ok: true, questions: openQ, quiz: qs, answered: qs && quizRuns.get(lessonId)?.answered.has(user.student_id!) });
      } catch (e) { console.error(e); ack?.({ ok: false, error: 'Server xatosi' }); }
    });

    socket.on('lesson:status', (p: { lessonId?: string; status?: string }) => {
      const lessonId = String(p?.lessonId ?? '');
      if (user.role !== 'student' || !joined.has(lessonId)) return;
      lessonState.get(lessonId)?.set(user.student_id!, p.status === 'away' ? 'away' : 'active');
      scheduleMonitor(lessonId);
    });

    socket.on('lesson:leave', (p: { lessonId?: string }) => {
      const lessonId = String(p?.lessonId ?? '');
      socket.leave(`lesson:${lessonId}`);
      if (joined.delete(lessonId)) { lessonState.get(lessonId)?.delete(user.student_id!); scheduleMonitor(lessonId); }
    });

    socket.on('quiz:answer', async (p: { lessonId?: string; questionId?: string; answer?: string }, ack?: (r: unknown) => void) => {
      if (user.role !== 'student') return ack?.({ ok: false });
      try { ack?.(await submitQuizAnswer(user, String(p?.lessonId), String(p?.questionId), String(p?.answer))); }
      catch (e) { console.error(e); ack?.({ ok: false, error: 'Server xatosi' }); }
    });

    socket.on('typing', (p: { to?: string }) => {
      if (typeof p?.to === 'string') emitToUser(p.to, 'typing', { from: user.id });
    });

    socket.on('disconnect', () => {
      userSockets.get(user.id)?.delete(socket.id);
      for (const l of joined) {
        // boshqa tabda hali darsda bo'lsa o'chirmaymiz
        const still = [...(io.sockets.adapter.rooms.get(`lesson:${l}`) ?? [])].some((sid) => io.sockets.sockets.get(sid)?.data.user.id === user.id);
        if (!still) lessonState.get(l)?.delete(user.student_id!);
      }
      if (!isOnline(user.id)) emitToTeacher('presence', { userId: user.id, online: false });
      refreshLessons();
    });
  });

  // Deadline yaqin — har 5 daqiqada tekshiruv
  setInterval(checkDeadlines, 5 * 60_000).unref();
  return io;
}

export function endLessonRealtime(lessonId: string) {
  const r = quizRuns.get(lessonId);
  if (r && r.phase !== 'finished') finishQuiz(lessonId).catch(console.error);
  emitToLesson(lessonId, 'lesson:ended', { lessonId });
  lessonState.delete(lessonId);
  setTimeout(() => quizRuns.delete(lessonId), 60_000);
}

async function checkDeadlines() {
  try {
    const due = await q<any>(`UPDATE assignments SET deadline_notified=true
      WHERE NOT deadline_notified AND deadline IS NOT NULL AND deadline > now() AND deadline < now() + interval '2 hours'
      RETURNING id, title, group_id, deadline`);
    for (const a of due) {
      const pending = await q<any>(`SELECT s.user_id FROM student_groups sg JOIN students s ON s.id=sg.student_id
        LEFT JOIN assignment_submissions sub ON sub.assignment_id=$1 AND sub.student_id=s.id
        WHERE sg.group_id=$2 AND (sub.status IS NULL OR sub.status='working')`, [a.id, a.group_id]);
      await notifyUsers(pending.map((p) => p.user_id), 'deadline', 'Deadline yaqin', a.title, `/student/assignments/${a.id}`);
    }
  } catch (e) { console.error('deadline check', e); }
}
