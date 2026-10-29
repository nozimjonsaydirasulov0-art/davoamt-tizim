import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { q, one, type Db, pool } from '../db/pool.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const bad = (m: string) => new HttpError(400, m);
export const notFound = (m = 'Topilmadi') => new HttpError(404, m);
export const forbidden = (m = 'Ruxsat yo‘q') => new HttpError(403, m);

export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try { return schema.parse(data); }
  catch (e) {
    if (e instanceof ZodError) {
      const i = e.issues[0];
      throw bad(`${i.path.join('.') || 'maydon'}: ${i.message}`);
    }
    throw e;
  }
}

export const uuid = z.string().uuid('noto‘g‘ri ID');
export const optStr = (max = 500) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

// Tasodifiy, taxmin qilib bo'lmaydigan ko'rinadigan ID: STU-2026-K7Q2M
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len: number) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPH[bytes[i] % ALPH.length];
  return s;
}
export async function publicId(prefix: string, table: string, db: Db = pool): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 10; i++) {
    const id = `${prefix}-${year}-${randomCode(6)}`;
    const ex = await one(`SELECT 1 FROM ${table} WHERE public_id = $1`, [id], db);
    if (!ex) return id;
  }
  throw new Error('ID generatsiya qilib bo‘lmadi');
}

// Vaqtinchalik parol: 10 belgi, chalkash belgilarsiz
export function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += a[b[i] % a.length];
  return s;
}

// "Aliyev Ali Valiyevich" -> "aliyev.ali"
const TR: Record<string, string> = { 'ʻ': '', 'ʼ': '', "'": '', '‘': '', '’': '', 'ў': 'o', 'ғ': 'g', 'қ': 'q', 'ҳ': 'h', 'ш': 'sh', 'ч': 'ch' };
export function slugifyName(fullName: string) {
  const parts = fullName.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .split('').map((c) => TR[c] ?? c).join('')
    .replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).join('.') || 'student').slice(0, 30);
}

export async function audit(userId: string | null, action: string, entity?: string, entityId?: string, details?: unknown, ip?: string) {
  try {
    await q('INSERT INTO audit_logs (user_id, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, action, entity ?? null, entityId ?? null, details ? JSON.stringify(details) : null, ip ?? null]);
  } catch (e) { console.error('audit error', e); }
}
