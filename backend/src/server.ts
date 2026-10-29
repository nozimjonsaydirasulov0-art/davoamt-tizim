import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime.js';
import { migrate } from './db/migrate.js';
import { one, q } from './db/pool.js';
import { hashPassword, validatePasswordStrength } from './auth.js';

async function main() {
  await migrate();
  await bootstrapTeacher();
  // Qayta ishga tushganda xotiradagi quiz holati yo'qoladi — aktiv darslar saqlanadi
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, () => console.log(`✔ API http://localhost:${config.port}  (${config.env})`));
  // eskirgan sessiyalarni tozalash
  setInterval(() => q(`DELETE FROM sessions WHERE expires_at < now() - interval '1 day' OR revoked_at < now() - interval '1 day'`).catch(() => {}), 3600_000).unref();
}

// Hostingda (masalan Render) shell bo'lmasa: teacher hisobi bo'lmasa, TEACHER_USERNAME / TEACHER_PASSWORD dan yaratiladi
async function bootstrapTeacher() {
  const password = process.env.TEACHER_PASSWORD;
  if (!password || await one(`SELECT id FROM users WHERE role='teacher'`)) return;
  const err = validatePasswordStrength(password);
  if (err) throw new Error(`TEACHER_PASSWORD: ${err}`);
  const username = (process.env.TEACHER_USERNAME ?? 'nozimjon').toLowerCase();
  await q(`INSERT INTO users (role, username, password_hash, full_name) VALUES ('teacher',$1,$2,$3)`,
    [username, await hashPassword(password), process.env.TEACHER_NAME ?? 'Nozimjon']);
  console.log(`✔ Teacher hisobi yaratildi: ${username}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
