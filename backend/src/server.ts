import http from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { initRealtime } from './realtime.js';
import { migrate } from './db/migrate.js';
import { q } from './db/pool.js';

async function main() {
  await migrate();
  // Qayta ishga tushganda xotiradagi quiz holati yo'qoladi — aktiv darslar saqlanadi
  const app = createApp();
  const server = http.createServer(app);
  initRealtime(server);
  server.listen(config.port, () => console.log(`✔ API http://localhost:${config.port}  (${config.env})`));
  // eskirgan sessiyalarni tozalash
  setInterval(() => q(`DELETE FROM sessions WHERE expires_at < now() - interval '1 day' OR revoked_at < now() - interval '1 day'`).catch(() => {}), 3600_000).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
