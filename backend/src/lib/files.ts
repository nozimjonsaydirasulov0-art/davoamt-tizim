import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Response } from 'express';
import { config } from '../config.js';
import { HttpError } from './util.js';

export type UploadKind = 'materials' | 'assignments' | 'submissions';

// Ruxsat etilgan turlar: kengaytma -> MIME + "magic bytes" tekshiruvi
const ALLOWED: Record<string, { mime: string; sig: 'pdf' | 'zip' | 'ole' | 'png' | 'jpg' | 'text' }> = {
  pdf: { mime: 'application/pdf', sig: 'pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sig: 'zip' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sig: 'zip' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sig: 'zip' },
  doc: { mime: 'application/msword', sig: 'ole' },
  ppt: { mime: 'application/vnd.ms-powerpoint', sig: 'ole' },
  xls: { mime: 'application/vnd.ms-excel', sig: 'ole' },
  zip: { mime: 'application/zip', sig: 'zip' },
  png: { mime: 'image/png', sig: 'png' },
  jpg: { mime: 'image/jpeg', sig: 'jpg' },
  jpeg: { mime: 'image/jpeg', sig: 'jpg' },
  txt: { mime: 'text/plain; charset=utf-8', sig: 'text' },
};
export const ALLOWED_EXT = Object.keys(ALLOWED);
// Brauzerda ochib ko'rish mumkin bo'lganlar (qolganlari faqat yuklab olinadi)
const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg']);

for (const k of ['materials', 'assignments', 'submissions', 'tmp']) fs.mkdirSync(path.join(config.uploadDir, k), { recursive: true });

export const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(config.uploadDir, 'tmp'),
    filename: (_req, _f, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 30 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!ALLOWED[ext]) return cb(new HttpError(400, `Bu fayl turiga ruxsat yo‘q. Ruxsat: ${ALLOWED_EXT.join(', ')}`));
    cb(null, true);
  },
});

function checkSignature(buf: Buffer, sig: string) {
  switch (sig) {
    case 'pdf': return buf.subarray(0, 4).toString('latin1') === '%PDF';
    case 'zip': return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
    case 'ole': return buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case 'png': return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'jpg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'text': return !buf.includes(0);
    default: return false;
  }
}

/** Yuklangan faylni tekshiradi va doimiy joyga ko'chiradi. Xavfli bo'lsa o'chiradi. */
export function finalizeUpload(file: Express.Multer.File | undefined, kind: UploadKind) {
  if (!file) return null;
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  const fd = fs.openSync(file.path, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (!rule || !checkSignature(head, rule.sig)) {
    fs.rmSync(file.path, { force: true });
    throw new HttpError(400, 'Fayl mazmuni kengaytmasiga mos emas');
  }
  const stored = `${crypto.randomUUID()}.${ext}`;
  const rel = path.posix.join(kind, stored);
  fs.renameSync(file.path, path.join(config.uploadDir, rel));
  // original nomni tozalash
  const safeName = path.basename(file.originalname).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').slice(0, 200);
  return { file_name: safeName, file_path: rel, file_size: file.size, mime_type: rule.mime };
}

export function discardUpload(file?: Express.Multer.File) {
  if (file?.path) fs.rmSync(file.path, { force: true });
}

export function removeStored(rel?: string | null) {
  if (!rel) return;
  const abs = path.resolve(config.uploadDir, rel);
  if (abs.startsWith(config.uploadDir)) fs.rmSync(abs, { force: true });
}

export function sendStored(res: Response, f: { file_path: string; file_name: string; mime_type: string }, inline: boolean) {
  const abs = path.resolve(config.uploadDir, f.file_path);
  if (!abs.startsWith(config.uploadDir + path.sep) || !fs.existsSync(abs)) throw new HttpError(404, 'Fayl topilmadi');
  const asInline = inline && INLINE_SAFE.has(f.mime_type);
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Content-Disposition', `${asInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
  fs.createReadStream(abs).pipe(res);
}
