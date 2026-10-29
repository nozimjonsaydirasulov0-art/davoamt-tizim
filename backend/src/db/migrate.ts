import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] && process.argv[1].includes('migrate')) {
  migrate()
    .then(() => { console.log('✔ Migratsiya bajarildi'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
