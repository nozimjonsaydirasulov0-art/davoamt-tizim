import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from './db/pool.js';
import { config } from './config.js';
import { HttpError, randomToken, sha256 } from './lib/util.js';

export interface AuthUser {
  id: string;
  role: 'teacher' | 'student';
  username: string;
  full_name: string;
  must_change_password: boolean;
  session_id: string;
  csrf_token: string;
  student_id?: string;
  group_id?: string | null;
}

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

export const SESSION_COOKIE = 'edu_sid';
export const BCRYPT_ROUNDS = 12;

export const hashPassword = (p: string) => bcrypt.hash(p, BCRYPT_ROUNDS);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function cookieOptions() {
  return {
    httpOnly: true,                      // JS o'qiy olmaydi (XSS'dan himoya)
    secure: config.cookieSecure,         // productionda faqat HTTPS
    sameSite: 'lax' as const,            // CSRF'ga qarshi birinchi qatlam
    path: '/',
    maxAge: config.sessionDays * 86400_000,
  };
}

export async function createSession(userId: string, ip?: string, ua?: string) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  await q(`INSERT INTO sessions (user_id, token_hash, csrf_token, ip, user_agent, expires_at)
           VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)`,
    [userId, sha256(token), csrf, ip ?? null, (ua ?? '').slice(0, 300), String(config.sessionDays)]);
  return { token, csrf };
}

/** Cookie'dagi token bo'yicha foydalanuvchini topish (HTTP va Socket.IO uchun umumiy) */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const row = await one<any>(`
    SELECT u.id, u.role, u.username, u.full_name, u.must_change_password, s.id AS session_id, s.csrf_token,
           st.id AS student_id, sg.group_id
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN students st ON st.user_id = u.id
    LEFT JOIN student_groups sg ON sg.student_id = st.id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`, [sha256(token)]);
  return row ?? null;
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const u = await userFromToken(req.cookies?.[SESSION_COOKIE]);
    if (u) req.user = u;
    next();
  } catch (e) { next(e); }
}

/** CSRF: o'zgartiruvchi so'rovlarda sessiyaga bog'langan token header orqali kelishi shart */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.user) return next();
  const h = req.get('x-csrf-token');
  if (!h || h !== req.user.csrf_token) return next(new HttpError(403, 'CSRF token noto‘g‘ri'));
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Tizimga kiring'));
  if (req.user.must_change_password) return next(new HttpError(428, 'Avval yangi parol o‘rnating'));
  next();
}
export function requireTeacher(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user!.role !== 'teacher') return next(new HttpError(403, 'Faqat o‘qituvchi uchun'));
    next();
  });
}
export function requireStudent(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    if (req.user!.role !== 'student' || !req.user!.student_id) return next(new HttpError(403, 'Faqat talaba uchun'));
    next();
  });
}

export function validatePasswordStrength(p: string): string | null {
  if (p.length < 8) return 'Parol kamida 8 belgidan iborat bo‘lsin';
  if (p.length > 128) return 'Parol juda uzun';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Parolda harf va raqam bo‘lsin';
  return null;
}
