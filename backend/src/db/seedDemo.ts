// DEMO ma'lumotlar (faqat sinab ko'rish uchun!). Real ishga tushirishda ishlatmang.
//   npm run seed:demo
// Yaratadi: teacher (nozimjon / Teacher2026), 3 fan, 2 guruh, 8 talaba (parol: Student2026), jadval, quiz.
import { migrate } from './migrate.js';
import { one, pool, q } from './pool.js';
import { hashPassword } from '../auth.js';
import { publicId, slugifyName } from '../lib/util.js';

async function main() {
  await migrate();
  if (await one(`SELECT 1 FROM subjects LIMIT 1`)) { console.log('Bazada ma’lumot bor — demo qo‘shilmadi.'); return pool.end(); }
  const t = await one<any>(`SELECT id FROM users WHERE role='teacher'`);
  if (!t) await q(`INSERT INTO users (role, username, password_hash, full_name) VALUES ('teacher','nozimjon',$1,'Nozimjon')`, [await hashPassword('Teacher2026')]);

  const subj = async (name: string, code: string) => (await one<any>(`INSERT INTO subjects (public_id,name,code,semester,course) VALUES ($1,$2,$3,1,1) RETURNING id`, [await publicId('SUB', 'subjects'), name, code])).id;
  const s1 = await subj('Tarmoq xavfsizligi va kiberxavfsizlik asoslari', 'CYBER-101');
  const s2 = await subj('Ma’lumotlar bazasi xavfsizligi', 'DBSEC-102');
  const s3 = await subj('Kiber huquq va kiber etika', 'CLAW-103');
  const grp = async (name: string, course: number) => (await one<any>(`INSERT INTO groups (public_id,name,course,direction,academic_year) VALUES ($1,$2,$3,'Axborot xavfsizligi','2026/2027') RETURNING id`, [await publicId('GRP', 'groups'), name, course])).id;
  const g1 = await grp('KX1-25', 1);
  const g2 = await grp('KX2-25', 2);
  for (const [g, s] of [[g1, s1], [g1, s3], [g2, s2], [g2, s1]]) await q(`INSERT INTO group_subjects VALUES ($1,$2)`, [g, s]);

  const hash = await hashPassword('Student2026');
  const names: [string, string][] = [
    ['Aliyev Ali Valiyevich', g1], ['Valiyev Vali Karimovich', g1], ['Sodiqov Sardor Anvarovich', g1], ['Dilshodov Dilshod Rustamovich', g1],
    ['Karimova Madina Olimovna', g1], ['Tursunov Jasur Baxtiyorovich', g2], ['Rahimova Nilufar Akmalovna', g2], ['Ergashev Bekzod Shavkatovich', g2],
  ];
  for (const [n, g] of names) {
    const u = await one<any>(`INSERT INTO users (role, username, password_hash, full_name) VALUES ('student',$1,$2,$3) RETURNING id`, [slugifyName(n), hash, n]);
    const st = await one<any>(`INSERT INTO students (user_id, public_id) VALUES ($1,$2) RETURNING id`, [u.id, await publicId('STU', 'students')]);
    await q(`INSERT INTO student_groups (student_id, group_id) VALUES ($1,$2)`, [st.id, g]);
  }
  const dow = ((new Date().getDay() + 6) % 7) + 1;
  await q(`INSERT INTO schedules (subject_id, group_id, weekday, start_time, end_time, room) VALUES
    ($1,$2,$5,'14:00','15:20','204'), ($3,$4,$6,'10:00','11:20','301'), ($7,$2,$6,'08:30','09:50','105')`,
    [s1, g1, s2, g2, dow, (dow % 7) + 1, s3]);
  const qz = await one<any>(`INSERT INTO quizzes (public_id, subject_id, title, mode) VALUES ($1,$2,'Tarmoq asoslari — jonli quiz','live') RETURNING id`, [await publicId('QUIZ', 'quizzes'), s1]);
  const qs = [
    ['TCP qaysi turdagi protokol?', 'Connectionless', 'Connection-oriented', 'Faqat broadcast', 'Fizik qatlam', 'B'],
    ['HTTPS odatda qaysi portda ishlaydi?', '21', '80', '443', '22', 'C'],
    ['Firewall asosiy vazifasi?', 'Trafikni filtrlash', 'Fayllarni siqish', 'Ekranni yoritish', 'IP berish', 'A'],
  ];
  let p = 1;
  for (const x of qs) await q(`INSERT INTO quiz_questions (quiz_id, position, text, option_a, option_b, option_c, option_d, correct, time_sec, points) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,20,1)`, [qz.id, p++, ...x]);
  console.log('✔ Demo ma’lumotlar yaratildi\n   Teacher: nozimjon / Teacher2026\n   Talabalar: aliyev.ali, valiyev.vali, ... / Student2026');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
