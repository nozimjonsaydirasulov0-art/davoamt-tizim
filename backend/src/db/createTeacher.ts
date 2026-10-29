// Yagona TEACHER/ADMIN hisobini yaratish yoki parolini yangilash
//   npm run seed:teacher -- --username nozimjon --name "Nozimjon" --password "KuchliParol123"
// Parol berilmasa tasodifiy parol yaratiladi va bir marta ekranga chiqariladi.
import { migrate } from './migrate.js';
import { one, pool, q } from './pool.js';
import { hashPassword, validatePasswordStrength } from '../auth.js';
import { tempPassword } from '../lib/util.js';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : process.env[`TEACHER_${name.toUpperCase()}`];
}

async function main() {
  await migrate();
  const username = (arg('username') ?? 'nozimjon').toLowerCase();
  const name = arg('name') ?? 'Nozimjon';
  const password = arg('password') ?? tempPassword() + '7';
  const err = validatePasswordStrength(password);
  if (err) throw new Error(err);
  const hash = await hashPassword(password);
  const existing = await one<any>(`SELECT id FROM users WHERE role='teacher'`);
  if (existing) {
    await q(`UPDATE users SET username=$2, full_name=$3, password_hash=$4, failed_attempts=0, locked_until=NULL WHERE id=$1`, [existing.id, username, name, hash]);
    console.log('✔ Teacher hisobi yangilandi');
  } else {
    await q(`INSERT INTO users (role, username, password_hash, full_name) VALUES ('teacher',$1,$2,$3)`, [username, hash, name]);
    console.log('✔ Teacher hisobi yaratildi');
  }
  console.log(`   Login:  ${username}\n   Parol:  ${password}`);
  await pool.end();
}
main().catch((e) => { console.error('✘', e.message); process.exit(1); });
