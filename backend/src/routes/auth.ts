import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { one, q } from '../db/pool.js';
import { ah, audit, bad, HttpError, parse } from '../lib/util.js';
import { cookieOptions, createSession, hashPassword, SESSION_COOKIE, validatePasswordStrength, verifyPassword } from '../auth.js';

export const authRouter = Router();

// IP bo'yicha: 15 daqiqada 20 ta urinish
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Juda ko‘p urinish. 15 daqiqadan so‘ng qayta urinib ko‘ring.' } });

const MAX_FAILS = 5;
const LOCK_MIN = 15;
// Mavjud bo'lmagan foydalanuvchi uchun ham bcrypt ishlatib, vaqt bo'yicha farqni yo'qotamiz
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-password', 12);

authRouter.post('/login', loginLimiter, ah(async (req, res) => {
  const b = parse(z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }), req.body);
  const user = await one<any>(`SELECT * FROM users WHERE lower(username) = lower($1)`, [b.username]);
  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    throw new HttpError(423, `Hisob vaqtincha bloklangan. ${LOCK_MIN} daqiqadan so‘ng urinib ko‘ring.`);
  }
  const ok = await verifyPassword(b.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.is_active) {
    if (user) {
      const fails = user.failed_attempts + 1;
      await q(`UPDATE users SET failed_attempts=$2, locked_until = CASE WHEN $2 >= $3 THEN now() + ($4 || ' minutes')::interval ELSE NULL END WHERE id=$1`,
        [user.id, fails >= MAX_FAILS ? 0 : fails, MAX_FAILS, String(LOCK_MIN)]);
      await audit(user.id, 'login_failed', 'user', user.id, { fails }, req.ip);
    }
    throw new HttpError(401, 'Login yoki parol noto‘g‘ri');
  }
  await q(`UPDATE users SET failed_attempts=0, locked_until=NULL, last_login_at=now() WHERE id=$1`, [user.id]);
  const { token, csrf } = await createSession(user.id, req.ip, req.get('user-agent'));
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  await audit(user.id, 'login', 'user', user.id, null, req.ip);
  res.json({ ok: true, csrf, must_change_password: user.must_change_password, role: user.role });
}));

authRouter.post('/logout', ah(async (req, res) => {
  if (req.user) await q(`UPDATE sessions SET revoked_at=now() WHERE id=$1`, [req.user.session_id]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
}));

authRouter.get('/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = req.user;
  let extra: any = {};
  if (u.role === 'student') {
    extra = await one(`SELECT s.public_id, g.id AS group_id, g.name AS group_name, g.course, g.direction
      FROM students s LEFT JOIN student_groups sg ON sg.student_id=s.id LEFT JOIN groups g ON g.id=sg.group_id WHERE s.id=$1`, [u.student_id]);
  }
  res.json({
    csrf: u.csrf_token,
    user: { id: u.id, role: u.role, username: u.username, full_name: u.full_name, must_change_password: u.must_change_password, student_id: u.student_id ?? null, ...extra },
  });
}));

authRouter.post('/change-password', ah(async (req, res) => {
  if (!req.user) throw new HttpError(401, 'Tizimga kiring');
  const b = parse(z.object({ current_password: z.string().min(1).max(128), new_password: z.string().max(128) }), req.body);
  const err = validatePasswordStrength(b.new_password);
  if (err) throw bad(err);
  if (b.current_password === b.new_password) throw bad('Yangi parol eskisidan farq qilsin');
  const row = await one<any>(`SELECT password_hash FROM users WHERE id=$1`, [req.user.id]);
  if (!row || !(await verifyPassword(b.current_password, row.password_hash))) throw bad('Joriy parol noto‘g‘ri');
  await q(`UPDATE users SET password_hash=$2, must_change_password=false WHERE id=$1`, [req.user.id, await hashPassword(b.new_password)]);
  // boshqa barcha sessiyalarni yopish
  await q(`UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL`, [req.user.id, req.user.session_id]);
  await audit(req.user.id, 'password_changed', 'user', req.user.id, null, req.ip);
  res.json({ ok: true });
}));
