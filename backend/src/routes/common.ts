import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db/pool.js';
import { ah, bad, forbidden, notFound, parse, uuid } from '../lib/util.js';
import { sendStored } from '../lib/files.js';
import { emitToGroup, emitToUser, isOnline, notifyGroup, notifyUsers, teacherId } from '../realtime.js';

export const commonRouter = Router();

// ======================= XABARLAR =======================
// Teacher: har bir talaba bilan shaxsiy chat + har bir guruhga e'lon kanali
// Student: faqat teacher bilan shaxsiy chat + o'z guruhining kanali (faqat o'qish)
commonRouter.get('/messages/threads', ah(async (req, res) => {
  const u = req.user!;
  if (u.role === 'teacher') {
    const students = await q<any>(`SELECT u.id AS user_id, u.full_name, g.name AS group_name,
        (SELECT body FROM messages m WHERE (m.sender_id=u.id AND m.recipient_id=$1) OR (m.sender_id=$1 AND m.recipient_id=u.id) ORDER BY created_at DESC LIMIT 1) AS last_body,
        (SELECT max(created_at) FROM messages m WHERE (m.sender_id=u.id AND m.recipient_id=$1) OR (m.sender_id=$1 AND m.recipient_id=u.id)) AS last_at,
        (SELECT count(*)::int FROM messages m WHERE m.sender_id=u.id AND m.recipient_id=$1 AND m.read_at IS NULL) AS unread
      FROM users u JOIN students st ON st.user_id=u.id LEFT JOIN student_groups sg ON sg.student_id=st.id LEFT JOIN groups g ON g.id=sg.group_id
      WHERE u.role='student' ORDER BY last_at DESC NULLS LAST, u.full_name`, [u.id]);
    const groups = await q(`SELECT g.id, g.name, (SELECT max(created_at) FROM messages m WHERE m.group_id=g.id) AS last_at FROM groups g ORDER BY g.name`);
    return res.json({ students: students.map((s) => ({ ...s, online: isOnline(s.user_id) })), groups });
  }
  const t = await one<any>(`SELECT id AS user_id, full_name FROM users WHERE role='teacher'`);
  const unread = await one<any>(`SELECT count(*)::int AS n FROM messages WHERE recipient_id=$1 AND read_at IS NULL`, [u.id]);
  const group = u.group_id ? await one(`SELECT id, name FROM groups WHERE id=$1`, [u.group_id]) : null;
  res.json({ teacher: t ? { ...t, unread: unread.n, online: isOnline(t.user_id) } : null, group });
}));

commonRouter.get('/messages/with/:userId', ah(async (req, res) => {
  const u = req.user!;
  const other = parse(uuid, req.params.userId);
  if (u.role === 'student') {
    const t = await teacherId();
    if (other !== t) throw forbidden();
  }
  const rows = await q(`SELECT id, sender_id, recipient_id, body, read_at, created_at FROM messages
    WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC LIMIT 200`, [u.id, other]);
  await q(`UPDATE messages SET read_at=now() WHERE sender_id=$2 AND recipient_id=$1 AND read_at IS NULL`, [u.id, other]);
  res.json(rows.reverse());
}));

commonRouter.get('/messages/group/:groupId', ah(async (req, res) => {
  const u = req.user!;
  const gid = parse(uuid, req.params.groupId);
  if (u.role === 'student' && u.group_id !== gid) throw forbidden();
  const rows = await q(`SELECT m.id, m.sender_id, m.group_id, m.body, m.created_at, us.full_name AS sender_name FROM messages m
    JOIN users us ON us.id=m.sender_id WHERE m.group_id=$1 ORDER BY m.created_at DESC LIMIT 200`, [gid]);
  res.json(rows.reverse());
}));

commonRouter.post('/messages', ah(async (req, res) => {
  const u = req.user!;
  const b = parse(z.object({ recipient_id: uuid.optional(), group_id: uuid.optional(), body: z.string().trim().min(1).max(4000) })
    .refine((v) => !!v.recipient_id !== !!v.group_id, 'Qabul qiluvchini tanlang'), req.body);
  if (b.group_id) {
    if (u.role !== 'teacher') throw forbidden('Guruh kanaliga faqat o‘qituvchi yozadi');
    const g = await one<any>(`SELECT name FROM groups WHERE id=$1`, [b.group_id]);
    if (!g) throw notFound();
    const m = await one<any>(`INSERT INTO messages (sender_id, group_id, body) VALUES ($1,$2,$3) RETURNING *`, [u.id, b.group_id, b.body]);
    const payload = { ...m, sender_name: u.full_name };
    emitToGroup(b.group_id, 'message:group', payload);
    emitToUser(u.id, 'message:group', payload);
    await notifyGroup(b.group_id, 'message', `Guruhga xabar (${g.name})`, b.body.slice(0, 120), '/student/messages');
    return res.status(201).json(payload);
  }
  const target = await one<any>(`SELECT id, role FROM users WHERE id=$1 AND is_active`, [b.recipient_id]);
  if (!target) throw notFound('Qabul qiluvchi topilmadi');
  if (u.role === 'student' && target.role !== 'teacher') throw forbidden('Talaba faqat o‘qituvchiga yozishi mumkin');
  if (target.id === u.id) throw bad('O‘zingizga yozib bo‘lmaydi');
  const m = await one<any>(`INSERT INTO messages (sender_id, recipient_id, body) VALUES ($1,$2,$3) RETURNING *`, [u.id, target.id, b.body]);
  const payload = { ...m, sender_name: u.full_name };
  emitToUser(target.id, 'message:new', payload);
  emitToUser(u.id, 'message:new', payload);
  await notifyUsers([target.id], 'message', `Yangi xabar: ${u.full_name}`, b.body.slice(0, 120), u.role === 'teacher' ? '/student/messages' : '/teacher/messages');
  res.status(201).json(payload);
}));

// ======================= BILDIRISHNOMALAR =======================
commonRouter.get('/notifications', ah(async (req, res) => {
  const rows = await q(`SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user!.id]);
  const unread = await one<any>(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [req.user!.id]);
  res.json({ items: rows, unread: unread.n });
}));
commonRouter.post('/notifications/read-all', ah(async (req, res) => {
  await q(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [req.user!.id]);
  res.json({ ok: true });
}));
commonRouter.post('/notifications/:id/read', ah(async (req, res) => {
  await q(`UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, [parse(uuid, req.params.id), req.user!.id]);
  res.json({ ok: true });
}));

// ======================= FAYLLAR (avtorizatsiya bilan) =======================
commonRouter.get('/files/material/:id', ah(async (req, res) => {
  const u = req.user!;
  const m = await one<any>(`SELECT * FROM materials WHERE id=$1`, [parse(uuid, req.params.id)]);
  if (!m) throw notFound();
  if (u.role === 'student' && m.group_id !== u.group_id) throw notFound();
  sendStored(res, m, req.query.inline === '1');
}));
commonRouter.get('/files/assignment/:id', ah(async (req, res) => {
  const u = req.user!;
  const a = await one<any>(`SELECT * FROM assignments WHERE id=$1`, [parse(uuid, req.params.id)]);
  if (!a || !a.file_path) throw notFound();
  if (u.role === 'student' && a.group_id !== u.group_id) throw notFound();
  sendStored(res, a, req.query.inline === '1');
}));
commonRouter.get('/files/submission/:id', ah(async (req, res) => {
  const u = req.user!;
  const s = await one<any>(`SELECT * FROM assignment_submissions WHERE id=$1`, [parse(uuid, req.params.id)]);
  if (!s || !s.file_path) throw notFound();
  if (u.role === 'student' && s.student_id !== u.student_id) throw notFound();
  sendStored(res, s, req.query.inline === '1');
}));
