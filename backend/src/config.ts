import 'dotenv/config';
import path from 'node:path';

const env = process.env;

export const config = {
  env: env.NODE_ENV ?? 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://edu:edu_dev_pass@localhost:5432/edu',
  appOrigin: (env.APP_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  uploadDir: path.resolve(env.UPLOAD_DIR ?? './uploads'),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
  sessionDays: Number(env.SESSION_DAYS ?? 7),
  cookieSecure: env.COOKIE_SECURE === 'true',
  trustProxy: Number(env.TRUST_PROXY ?? 0),
  staticDir: env.STATIC_DIR ? path.resolve(env.STATIC_DIR) : null,
};
