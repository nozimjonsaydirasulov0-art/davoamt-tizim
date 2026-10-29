import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { csrfGuard, loadUser, requireAuth, requireStudent, requireTeacher } from './auth.js';
import { HttpError } from './lib/util.js';
import { authRouter } from './routes/auth.js';
import { teacherCore } from './routes/teacherCore.js';
import { teacherLearning } from './routes/teacherLearning.js';
import { studentRouter } from './routes/student.js';
import { commonRouter } from './routes/common.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'", 'ws:', 'wss:'], frameSrc: ["'self'"],
        objectSrc: ["'none'"], frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  // Umumiy API limit: daqiqasiga 300 so'rov / IP
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Juda ko‘p so‘rov' } }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', loadUser, csrfGuard);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/t', requireTeacher, teacherCore, teacherLearning);
  app.use('/api/s', requireStudent, studentRouter);
  app.use('/api', requireAuth, commonRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'API topilmadi')));

  // Production: frontend build shu serverdan beriladi (yoki Nginx orqali)
  if (config.staticDir && fs.existsSync(config.staticDir)) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.staticDir!, 'index.html')));
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof multer.MulterError) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Fayl hajmi ${Math.round(config.maxUploadBytes / 1048576)} MB dan oshmasin` : 'Fayl yuklashda xato';
      return res.status(400).json({ error: msg });
    }
    // PostgreSQL xatolarini tushunarli qilish
    if (err?.code === '23505') return res.status(409).json({ error: 'Bunday qiymat allaqachon mavjud' + (err.constraint ? ` (${err.constraint})` : '') });
    if (err?.code === '23503') return res.status(400).json({ error: 'Bog‘liq ma’lumot xatosi: tanlangan element mavjud emas yoki boshqa joyda ishlatilgan' });
    if (err?.code === '23514') return res.status(400).json({ error: 'Qiymat ruxsat etilgan chegaradan tashqarida' });
    if (err?.code === '22P02') return res.status(400).json({ error: 'Noto‘g‘ri format' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON noto‘g‘ri' });
    console.error(err);
    res.status(500).json({ error: 'Serverda xatolik' });
  });
  return app;
}
