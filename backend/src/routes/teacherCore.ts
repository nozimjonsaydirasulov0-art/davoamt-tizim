import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db/pool.js';
import { ah, audit, bad, notFound, optStr, parse, publicId, slugifyName, tempPassword, uuid } from '../lib/util.js';
import { hashPassword } from '../auth.js';
import { isOnline, lessonMonitor } from '../realtime.js';

export const teacherCore = Router();

// ======================= DASHBOARD =======================
teacherCore.get('/dashboard', ah(async (req, res) => {
  const dow = ((new Date().getDay() + 6) % 7) + 1; // 1 = Dushanba
  const [today, counts, att, pending, tests, unread, active] = await Promise.all([
    q(`SELECT sc.*, to_char(sc.start_time,'HH24:MI') AS start_time, to_char(sc.end_time,'HH24:MI') AS end_time,
              s.name AS subject_name, g.name AS group_name, ll.id AS active_lesson_id
       FROM schedules sc JOIN subjects s ON s.id=sc.subject_id JOIN groups g ON g.id=sc.group_id
       LEFT JOIN live_lessons ll ON ll.group_id=sc.group_id AND ll.status='active'
       WHERE sc.weekday=$1 ORDER BY sc.start_time`, [dow]),
    one(`SELECT (SELECT count(*) FROM groups)::int AS groups,
                (SELECT count(*) FROM groups g WHERE EXISTS (SELECT 1 FROM student_groups sg WHERE sg.group_id=g.id))::int AS active_groups,
                (SELECT count(*) FROM students)::int AS students,
                (SELECT count(*) FROM subjects)::int AS subjects`),
    one(`SELECT count(*) FILTER (WHERE ar.status IN ('present','late'))::int AS present, count(*)::int AS total
         FROM attendance a JOIN attendance_records ar ON ar.attendance_id=a.id WHERE a.date=CURRENT_DATE`),
    one(`SELECT count(*)::int AS n FROM assignment_submissions WHERE status='submitted'`),
    one(`SELECT count(*)::int AS n FROM quizzes WHERE mode='test' AND is_published AND (closes_at IS NULL OR closes_at > now()) AND (opens_at IS NULL OR opens_at <= now())`),
    one(`SELECT count(*)::int AS n FROM messages WHERE recipient_id=$1 AND read_at IS NULL`, [req.user!.id]),
    q(`SELECT ll.id, ll.started_at, s.name AS subject_name, g.name AS group_name FROM live_lessons ll
       JOIN subjects s ON s.id=ll.subject_id JOIN groups g ON g.id=ll.group_id WHERE ll.status='active'`),
  ]);
  const recentSubs = await q(`SELECT sub.id, sub.submitted_at, u.full_name, a.title, a.id AS assignment_id FROM assignment_submissions sub
    JOIN students st ON st.id=sub.student_id JOIN users u ON u.id=st.user_id JOIN assignments a ON a.id=sub.assignment_id
    WHERE sub.status='submitted' ORDER BY sub.submitted_at DESC LIMIT 5`);
  res.json({
    name: req.user!.full_name, date: new Date().toISOString(), weekday: dow,
    todayLessons: today, counts, attendanceToday: att, pendingSubmissions: pending?.n ?? 0,
    activeTests: tests?.n ?? 0, unreadMessages: unread?.n ?? 0, activeLessons: active, recentSubmissions: recentSubs,
  });
}));

// ======================= FANLAR =======================
const subjectSchema = z.object({
  name: z.string().trim().min(2).max(200),
  code: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase()),
  semester: z.coerce.number().int().min(1).max(12).optional().nullable(),
  course: z.coerce.number().int().min(1).max(6).optional().nullable(),
  description: optStr(2000),
});

teacherCore.get('/subjects', ah(async (_req, res) => {
  res.json(await q(`SELECT s.*, (SELECT count(*)::int FROM group_subjects gs WHERE gs.subject_id=s.id) AS group_count,
    COALESCE((SELECT json_agg(json_build_object('id',g.id,'name',g.name) ORDER BY g.name) FROM group_subjects gs JOIN groups g ON g.id=gs.group_id WHERE gs.subject_id=s.id),'[]') AS groups
    FROM subjects s ORDER BY s.created_at DESC`));
}));
teacherCore.post('/subjects', ah(async (req, res) => {
  const b = parse(subjectSchema, req.body);
  const row = await one(`INSERT INTO subjects (public_id, name, code, semester, course, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [await publicId('SUB', 'subjects'), b.name, b.code, b.semester ?? null, b.course ?? null, b.description]);
  await audit(req.user!.id, 'subject_create', 'subject', row.id, { name: b.name }, req.ip);
  res.status(201).json(row);
}));
teacherCore.put('/subjects/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(subjectSchema, req.body);
  const row = await one(`UPDATE subjects SET name=$2, code=$3, semester=$4, course=$5, description=$6 WHERE id=$1 RETURNING *`,
    [id, b.name, b.code, b.semester ?? null, b.course ?? null, b.description]);
  if (!row) throw notFound();
  await audit(req.user!.id, 'subject_update', 'subject', id, null, req.ip);
  res.json(row);
}));
teacherCore.delete('/subjects/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const r = await one(`DELETE FROM subjects WHERE id=$1 RETURNING id, name`, [id]);
  if (!r) throw notFound();
  await audit(req.user!.id, 'subject_delete', 'subject', id, r, req.ip);
  res.json({ ok: true });
}));

// ======================= GURUHLAR =======================
const groupSchema = z.object({
  name: z.string().trim().min(1).max(50),
  course: z.coerce.number().int().min(1).max(6).optional().nullable(),
  direction: optStr(200),
  academic_year: optStr(20),
  note: optStr(2000),
});

teacherCore.get('/groups', ah(async (_req, res) => {
  res.json(await q(`SELECT g.*,
    (SELECT count(*)::int FROM student_groups sg WHERE sg.group_id=g.id) AS student_count,
    COALESCE((SELECT json_agg(json_build_object('id',s.id,'name',s.name,'code',s.code) ORDER BY s.name) FROM group_subjects gs JOIN subjects s ON s.id=gs.subject_id WHERE gs.group_id=g.id),'[]') AS subjects
    FROM groups g ORDER BY g.name`));
}));
teacherCore.get('/groups/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const g = await one(`SELECT * FROM groups WHERE id=$1`, [id]);
  if (!g) throw notFound();
  const [subjects, students, schedule] = await Promise.all([
    q(`SELECT s.* FROM group_subjects gs JOIN subjects s ON s.id=gs.subject_id WHERE gs.group_id=$1 ORDER BY s.name`, [id]),
    q(`SELECT st.id, st.public_id, u.full_name, u.username, u.phone, u.id AS user_id, u.is_active, u.must_change_password, u.last_login_at
       FROM student_groups sg JOIN students st ON st.id=sg.student_id JOIN users u ON u.id=st.user_id WHERE sg.group_id=$1 ORDER BY u.full_name`, [id]),
    q(`SELECT sc.*, s.name AS subject_name FROM schedules sc JOIN subjects s ON s.id=sc.subject_id WHERE sc.group_id=$1 ORDER BY weekday, start_time`, [id]),
  ]);
  res.json({ ...g, subjects, students: students.map((s: any) => ({ ...s, online: isOnline(s.user_id) })), schedule });
}));
teacherCore.post('/groups', ah(async (req, res) => {
  const b = parse(groupSchema, req.body);
  const row = await one(`INSERT INTO groups (public_id, name, course, direction, academic_year, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [await publicId('GRP', 'groups'), b.name, b.course ?? null, b.direction, b.academic_year, b.note]);
  await audit(req.user!.id, 'group_create', 'group', row.id, { name: b.name }, req.ip);
  res.status(201).json(row);
}));
teacherCore.put('/groups/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(groupSchema, req.body);
  const row = await one(`UPDATE groups SET name=$2, course=$3, direction=$4, academic_year=$5, note=$6 WHERE id=$1 RETURNING *`,
    [id, b.name, b.course ?? null, b.direction, b.academic_year, b.note]);
  if (!row) throw notFound();
  res.json(row);
}));
teacherCore.delete('/groups/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const n = await one<any>(`SELECT count(*)::int AS n FROM student_groups WHERE group_id=$1`, [id]);
  if (n.n > 0) throw bad('Guruhda talabalar bor. Avval ularni boshqa guruhga o‘tkazing.');
  const r = await one(`DELETE FROM groups WHERE id=$1 RETURNING id, name`, [id]);
  if (!r) throw notFound();
  await audit(req.user!.id, 'group_delete', 'group', id, r, req.ip);
  res.json({ ok: true });
}));
// Guruhga fan biriktirish (GROUP <-> GROUP_SUBJECT <-> SUBJECT)
teacherCore.post('/groups/:id/subjects', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { subject_ids } = parse(z.object({ subject_ids: z.array(uuid).min(1).max(50) }), req.body);
  await tx(async (c) => {
    for (const sid of subject_ids) await c.query(`INSERT INTO group_subjects (group_id, subject_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, sid]);
  });
  await audit(req.user!.id, 'group_subject_attach', 'group', id, { subject_ids }, req.ip);
  res.json({ ok: true });
}));
teacherCore.delete('/groups/:id/subjects/:subjectId', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const sid = parse(uuid, req.params.subjectId);
  await q(`DELETE FROM group_subjects WHERE group_id=$1 AND subject_id=$2`, [id, sid]);
  await audit(req.user!.id, 'group_subject_detach', 'group', id, { subject_id: sid }, req.ip);
  res.json({ ok: true });
}));

// ======================= TALABALAR =======================
const studentSchema = z.object({
  full_name: z.string().trim().min(3).max(150),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal('')).transform((v) => v || null),
  gender: z.enum(['male', 'female']).optional().nullable().or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().max(30).regex(/^[+0-9()\s-]*$/, 'telefon formati noto‘g‘ri').optional().nullable().transform((v) => v || null),
  email: z.string().trim().max(150).email('email noto‘g‘ri').optional().nullable().or(z.literal('')).transform((v) => v || null),
  group_id: uuid,
  note: optStr(2000),
});

teacherCore.get('/students', ah(async (req, res) => {
  const groupId = req.query.group_id ? parse(uuid, req.query.group_id) : null;
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
  const rows = await q<any>(`
    SELECT st.id, st.public_id, st.birth_date, st.gender, st.note, u.id AS user_id, u.full_name, u.username, u.phone, u.email,
           u.is_active, u.must_change_password, u.last_login_at, g.id AS group_id, g.name AS group_name
    FROM students st JOIN users u ON u.id=st.user_id
    LEFT JOIN student_groups sg ON sg.student_id=st.id LEFT JOIN groups g ON g.id=sg.group_id
    WHERE ($1::uuid IS NULL OR g.id=$1) AND ($2 = '' OR u.full_name ILIKE '%'||$2||'%' OR u.username ILIKE '%'||$2||'%' OR st.public_id ILIKE '%'||$2||'%')
    ORDER BY g.name NULLS LAST, u.full_name`, [groupId, search]);
  res.json(rows.map((r) => ({ ...r, online: isOnline(r.user_id) })));
}));

async function uniqueUsername(base: string, c: any) {
  for (let i = 0; i < 1000; i++) {
    const name = i === 0 ? base : `${base}${i + 1}`;
    const ex = await c.query(`SELECT 1 FROM users WHERE lower(username)=lower($1)`, [name]);
    if (!ex.rowCount) return name;
  }
  throw bad('Username yaratib bo‘lmadi');
}

teacherCore.post('/students', ah(async (req, res) => {
  const b = parse(studentSchema, req.body);
  const password = tempPassword();
  const hash = await hashPassword(password);
  const result = await tx(async (c) => {
    const username = await uniqueUsername(slugifyName(b.full_name), c);
    const u = (await c.query(`INSERT INTO users (role, username, password_hash, must_change_password, full_name, email, phone)
      VALUES ('student',$1,$2,true,$3,$4,$5) RETURNING id`, [username, hash, b.full_name, b.email, b.phone])).rows[0];
    const pid = await publicId('STU', 'students', c);
    const s = (await c.query(`INSERT INTO students (user_id, public_id, birth_date, gender, note) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [u.id, pid, b.birth_date, b.gender, b.note])).rows[0];
    await c.query(`INSERT INTO student_groups (student_id, group_id) VALUES ($1,$2)`, [s.id, b.group_id]);
    return { id: s.id, public_id: pid, username };
  });
  await audit(req.user!.id, 'student_create', 'student', result.id, { username: result.username }, req.ip);
  // Vaqtinchalik parol faqat shu javobda bir marta ko'rsatiladi, bazada faqat hash
  res.status(201).json({ ...result, full_name: b.full_name, temporary_password: password });
}));

teacherCore.put('/students/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(studentSchema, req.body);
  await tx(async (c) => {
    const s = (await c.query(`UPDATE students SET birth_date=$2, gender=$3, note=$4 WHERE id=$1 RETURNING user_id`, [id, b.birth_date, b.gender, b.note])).rows[0];
    if (!s) throw notFound();
    await c.query(`UPDATE users SET full_name=$2, email=$3, phone=$4 WHERE id=$1`, [s.user_id, b.full_name, b.email, b.phone]);
    await c.query(`INSERT INTO student_groups (student_id, group_id) VALUES ($1,$2)
                   ON CONFLICT (student_id) DO UPDATE SET group_id=EXCLUDED.group_id, joined_at=now()`, [id, b.group_id]);
  });
  await audit(req.user!.id, 'student_update', 'student', id, null, req.ip);
  res.json({ ok: true });
}));

teacherCore.post('/students/:id/reset-password', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const password = tempPassword();
  const r = await one<any>(`UPDATE users SET password_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL
    WHERE id=(SELECT user_id FROM students WHERE id=$1) RETURNING id, username, full_name`, [id, await hashPassword(password)]);
  if (!r) throw notFound();
  await q(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [r.id]);
  await audit(req.user!.id, 'student_password_reset', 'student', id, null, req.ip);
  res.json({ username: r.username, full_name: r.full_name, temporary_password: password });
}));

teacherCore.post('/students/:id/active', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const { active } = parse(z.object({ active: z.boolean() }), req.body);
  const r = await one<any>(`UPDATE users SET is_active=$2 WHERE id=(SELECT user_id FROM students WHERE id=$1) RETURNING id`, [id, active]);
  if (!r) throw notFound();
  if (!active) await q(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [r.id]);
  await audit(req.user!.id, active ? 'student_activate' : 'student_deactivate', 'student', id, null, req.ip);
  res.json({ ok: true });
}));

teacherCore.delete('/students/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const r = await one<any>(`DELETE FROM users WHERE id=(SELECT user_id FROM students WHERE id=$1) RETURNING username`, [id]);
  if (!r) throw notFound();
  await audit(req.user!.id, 'student_delete', 'student', id, r, req.ip);
  res.json({ ok: true });
}));

// ======================= DARS JADVALI =======================
const scheduleSchema = z.object({
  subject_id: uuid, group_id: uuid,
  weekday: z.coerce.number().int().min(1).max(7),
  start_time: z.string().regex(/^\d{2}:\d{2}$/), end_time: z.string().regex(/^\d{2}:\d{2}$/),
  room: optStr(50), note: optStr(500),
}).refine((v) => v.end_time > v.start_time, { message: 'Tugash vaqti boshlanishdan keyin bo‘lsin', path: ['end_time'] });

async function assertNoClash(b: z.infer<typeof scheduleSchema>, exceptId: string | null) {
  const clash = await one<any>(`SELECT sc.id, g.name FROM schedules sc JOIN groups g ON g.id=sc.group_id
    WHERE sc.weekday=$1 AND sc.start_time < $3::time AND sc.end_time > $2::time AND ($4::uuid IS NULL OR sc.id<>$4) LIMIT 1`,
    [b.weekday, b.start_time, b.end_time, exceptId]);
  if (clash) throw bad(`Bu vaqtda sizda boshqa dars bor (${clash.name})`);
}

teacherCore.get('/schedules', ah(async (req, res) => {
  const groupId = req.query.group_id ? parse(uuid, req.query.group_id) : null;
  res.json(await q(`SELECT sc.*, to_char(sc.start_time,'HH24:MI') AS start_time, to_char(sc.end_time,'HH24:MI') AS end_time,
      s.name AS subject_name, s.code AS subject_code, g.name AS group_name, ll.id AS active_lesson_id
    FROM schedules sc JOIN subjects s ON s.id=sc.subject_id JOIN groups g ON g.id=sc.group_id
    LEFT JOIN live_lessons ll ON ll.group_id=sc.group_id AND ll.subject_id=sc.subject_id AND ll.status='active'
    WHERE ($1::uuid IS NULL OR sc.group_id=$1) ORDER BY sc.weekday, sc.start_time`, [groupId]));
}));
teacherCore.post('/schedules', ah(async (req, res) => {
  const b = parse(scheduleSchema, req.body);
  await assertNoClash(b, null);
  const row = await one(`INSERT INTO schedules (subject_id, group_id, weekday, start_time, end_time, room, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.subject_id, b.group_id, b.weekday, b.start_time, b.end_time, b.room, b.note]);
  res.status(201).json(row);
}));
teacherCore.put('/schedules/:id', ah(async (req, res) => {
  const id = parse(uuid, req.params.id);
  const b = parse(scheduleSchema, req.body);
  await assertNoClash(b, id);
  const row = await one(`UPDATE schedules SET subject_id=$2, group_id=$3, weekday=$4, start_time=$5, end_time=$6, room=$7, note=$8 WHERE id=$1 RETURNING *`,
    [id, b.subject_id, b.group_id, b.weekday, b.start_time, b.end_time, b.room, b.note]);
  if (!row) throw notFound();
  res.json(row);
}));
teacherCore.delete('/schedules/:id', ah(async (req, res) => {
  await q(`DELETE FROM schedules WHERE id=$1`, [parse(uuid, req.params.id)]);
  res.json({ ok: true });
}));

// ======================= SOZLAMALAR =======================
const EDITABLE = ['phone', 'email', 'birth_date', 'gender', 'full_name'] as const;
teacherCore.get('/settings', ah(async (_req, res) => {
  const s = await one<any>(`SELECT value FROM settings WHERE key='student_editable_fields'`);
  res.json({ student_editable_fields: s?.value ?? [], available_fields: EDITABLE });
}));
teacherCore.put('/settings', ah(async (req, res) => {
  const b = parse(z.object({ student_editable_fields: z.array(z.enum(EDITABLE)).max(EDITABLE.length) }), req.body);
  await q(`INSERT INTO settings (key, value) VALUES ('student_editable_fields', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify(b.student_editable_fields)]);
  await audit(req.user!.id, 'settings_update', 'settings', 'student_editable_fields', b, req.ip);
  res.json({ ok: true });
}));
teacherCore.get('/audit-logs', ah(async (_req, res) => {
  res.json(await q(`SELECT a.*, u.full_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200`));
}));

export { lessonMonitor };
