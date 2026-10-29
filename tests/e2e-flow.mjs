// E2E ssenariy: teacher (desktop) + talaba (mobil) — butun workflow.
// Ishga tushirish: backend + frontend (5173) ishlab turganda, seed:demo dan keyin:
//   npm i playwright && npx playwright install chromium && node tests/e2e-flow.mjs
import { chromium } from 'playwright';
const B = 'http://localhost:5173';
const SHOT = './e2e-shots';
import fs from 'node:fs'; fs.mkdirSync(SHOT, { recursive: true });
const log = (...a) => console.log('▶', ...a);
const browser = await chromium.launch();
const T = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const S = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errors = [];
for (const [n, p] of [['T', T], ['S', S]]) {
  p.on('pageerror', (e) => errors.push(`${n} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${n} console: ${m.text()}`));
}
const shot = (p, name) => p.screenshot({ path: `${SHOT}/${name}.png`, fullPage: false });
const modal = (p) => p.locator('div.fixed.inset-0.z-50');
const U = Date.now().toString().slice(-4);

// ---------- Teacher login ----------
await T.goto(B + '/login');
await T.fill('input[autocomplete=username]', 'nozimjon');
await T.fill('input[type=password]', 'Teacher2026');
await T.click('button[type=submit]');
await T.waitForSelector('text=SALOM, NOZIMJON');
await shot(T, '01-teacher-dashboard'); log('teacher dashboard ok');

// ---------- Create subject ----------
await T.click('text=Fanlar >> nth=0');
await T.click('text=+ Yangi fan');
const m1 = modal(T);
await m1.locator('input').nth(0).fill(`Axborot tizimlari xavfsizligi ${U}`);
await m1.locator('input').nth(1).fill(`ATS-${U}`);
await m1.locator('input').nth(2).fill('1');
await m1.locator('input').nth(3).fill('1');
await m1.locator('button[type=submit]').click();
await T.waitForSelector(`text=ATS-${U}`); log('subject created');

// ---------- Create group ----------
await T.click('aside >> text=Guruhlar');
await T.click('text=+ Yangi guruh');
const m2 = modal(T);
await m2.locator('input').nth(0).fill(`KX9-${U}`);
await m2.locator('input').nth(1).fill('1');
await m2.locator('button[type=submit]').click();
await T.click(`text=KX9-${U}`);
await T.waitForSelector('text=Guruhga biriktirilgan fanlar');
// ---------- Attach subject ----------
await T.click('text=+ Fan biriktirish');
await modal(T).locator(`label:has-text("ATS-${U}") input`).check();
await modal(T).locator('button:has-text("Biriktirish")').click();
await T.waitForSelector(`text=Axborot tizimlari xavfsizligi ${U}`);
await shot(T, '02-group-subjects'); log('group + subject attached');

// ---------- Add student ----------
await T.click('text=Talabalar (0)');
await T.click('text=+ Talaba qo‘shish');
await T.waitForSelector('text=Yangi talaba');
const m3 = modal(T);
await m3.locator('input').nth(0).fill(`Test Sinovjon ${U}`);
await m3.locator('button[type=submit]').click();
await T.waitForSelector('text=Talaba kirish ma’lumotlari');
const credText = await modal(T).locator('.font-mono').innerText();
const login = credText.match(/Login: (\S+)/)[1];
const temp = credText.match(/Vaqtinchalik parol: (\S+)/)[1];
await shot(T, '03-student-credentials'); log('student created', login, temp);
await modal(T).locator('button:has-text("Tayyor")').click();

// ---------- Schedule ----------
await T.click('aside >> text=Dars jadvali');
await T.click('text=+ Dars jadvali');
const m4 = modal(T);
await m4.locator('select').nth(0).selectOption({ label: `KX9-${U}` });
await m4.locator('select').nth(1).selectOption({ label: `Axborot tizimlari xavfsizligi ${U}` });
const dow = String(((new Date().getDay() + 6) % 7) + 1);
await m4.locator('select').nth(2).selectOption(dow);
await m4.locator('input[type=time]').nth(0).fill(`0${Number(U)%8}:05`);
await m4.locator('input[type=time]').nth(1).fill(`0${Number(U)%8}:50`);
await m4.locator('input').nth(2).fill('204');
await m4.locator('button[type=submit]').click();
await T.waitForSelector(`text=KX9-${U}`);
await shot(T, '04-schedule'); log('schedule created');

// ---------- Create live quiz for this subject ----------
await T.goto(B + '/teacher/tests/new');
await T.locator('input').nth(0).fill(`Tezkor quiz ${U}`);
await T.locator('select').nth(0).selectOption({ label: `Axborot tizimlari xavfsizligi ${U}` });
await T.locator('textarea').nth(0).fill('HTTPS qaysi portda ishlaydi?');
const opts = T.locator('input[placeholder^="Variant"]');
await opts.nth(0).fill('80'); await opts.nth(1).fill('443'); await opts.nth(2).fill('21'); await opts.nth(3).fill('22');
await T.locator('input[type=radio]').nth(1).check();
await T.locator('input[type=number]').nth(0).fill('15');
await T.click('button:has-text("Saqlash") >> nth=0');
await T.waitForSelector('text=Savollar'); log('quiz created');

// ---------- Student first login ----------
await S.goto(B + '/login');
await S.fill('input[autocomplete=username]', login);
await S.fill('input[type=password]', temp);
await S.click('button[type=submit]');
await S.waitForSelector('text=Yangi parol o‘rnating');
await shot(S, '05-student-new-password');
await S.locator('input[type=password]').nth(0).fill(temp);
await S.locator('input[type=password]').nth(1).fill('MeningParol2026');
await S.locator('input[type=password]').nth(2).fill('MeningParol2026');
await S.click('button[type=submit]');
await S.waitForSelector('text=Salom, Sinovjon');
await shot(S, '06-student-dashboard'); log('student changed password & logged in');

// ---------- Start lesson ----------
await T.goto(B + '/teacher/schedule');
await T.locator(`div.rounded-lg:has-text("KX9-${U}") >> button:has-text("Boshlash")`).click();
await T.waitForSelector('text=JONLI DARS');
log('lesson started');
await S.waitForSelector('text=DARS BOSHLANDI', { timeout: 10000 });
await S.click('text=Darsga qo‘shilish');
await S.waitForSelector('text=Dars materiallari');
await T.waitForFunction(() => document.body.innerText.includes('1 / 1'), null, { timeout: 10000 });
await shot(T, '07-live-classroom-online'); log('student online in lesson');

// ---------- Upload material ----------
fs.writeFileSync('./amaliy.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
await T.click('button:has-text("Material")');
await modal(T).locator('input').nth(0).fill('Bugungi amaliy ish');
await modal(T).locator('input[type=file]').setInputFiles('./amaliy.pdf');
await modal(T).locator('button[type=submit]').click();
await S.waitForSelector('text=Bugungi amaliy ish', { timeout: 10000 });
await shot(S, '08-student-material'); log('material received by student');

// fake exe renamed as pdf must be rejected
fs.writeFileSync('./virus.pdf', 'MZ\x90\x00this is not a pdf');
await T.click('button:has-text("Material")');
await modal(T).locator('input[type=file]').setInputFiles('./virus.pdf');
await modal(T).locator('button[type=submit]').click();
await T.waitForSelector('text=Fayl mazmuni kengaytmasiga mos emas'); log('fake pdf rejected ✓');
await T.keyboard.press('Escape');

// ---------- Assignment ----------
await T.click('button:has-text("Amaliy ish")');
await modal(T).locator('input').nth(0).fill('Task Manager yordamida processlarni tahlil qiling');
await modal(T).locator('button[type=submit]').click();
await S.waitForSelector('text=Task Manager yordamida', { timeout: 10000 });
await S.click('text=Task Manager yordamida');
await S.click('text=Topshiriqni ochish');
await S.waitForSelector('textarea');
await T.waitForSelector('td >> text=Bajarmoqda', { timeout: 10000 }); log('monitor shows Working ✓');
fs.writeFileSync('./shot.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
await S.fill('textarea', 'svchost.exe, chrome.exe va explorer.exe eng ko‘p resurs ishlatmoqda.');
await S.locator('input[type=file]').setInputFiles('./shot.png');
await S.click('button:has-text("Yuborish")');
await S.waitForSelector('text=yuborilgan');
await T.waitForSelector('td >> text=Topshirildi', { timeout: 10000 });
await shot(T, '09-monitor-submitted'); log('submission visible to teacher');
// grade it
await T.click('text=Task Manager yordamida processlarni tahlil qiling');
await T.click('button:has-text("Tekshirish")');
await modal(T).locator('input[type=number]').fill('9');
await modal(T).locator('input').nth(1).fill('Yaxshi bajarilgan.');
await modal(T).locator('button:has-text("Baholash")').click();
await T.waitForSelector('td >> text=9/10');
await S.waitForSelector('text=Yaxshi bajarilgan', { timeout: 10000 });
await shot(S, '10-student-graded'); log('student sees 9/10 + feedback');
await T.goBack();
await T.waitForSelector('text=JONLI DARS');

// ---------- Real-time question ----------
await S.click('aside >> text=Jonli dars').catch(async () => { await S.goto(B + '/student/live'); });
await S.waitForSelector('text=Dars materiallari');
await T.click('button:has-text("Savol")');
await modal(T).locator('textarea').fill('TCP va UDP o‘rtasidagi asosiy farq nima?');
await modal(T).locator('button:has-text("Yuborish")').click();
await S.waitForSelector('text=TCP va UDP', { timeout: 10000 });
await S.locator('textarea').fill('TCP connection-oriented, UDP connectionless.');
await S.click('button:has-text("Yuborish")');
await T.waitForSelector('text=TCP connection-oriented', { timeout: 10000 });
await T.locator('input[placeholder=ball]').fill('1');
await T.locator('input[placeholder=ball] + button').click();
await S.waitForSelector('text=Baholandi: 1/1', { timeout: 10000 }); log('live question answered & graded');

// ---------- Live quiz ----------
await T.click('button:has-text("Quiz")');
await modal(T).locator('button:has-text("START QUIZ")').click();
await S.waitForSelector('text=HTTPS qaysi portda', { timeout: 10000 });
await shot(S, '11-student-quiz');
await S.click('button:has-text("443")');
await S.waitForSelector('text=To‘g‘ri!', { timeout: 10000 });
await shot(T, '12-teacher-quiz-reveal');
await T.click('button:has-text("Quizni yakunlash")');
await S.waitForSelector('text=yakunlandi', { timeout: 10000 });
await shot(S, '13-student-quiz-finished'); log('quiz done');

// ---------- Attendance + grade ----------
await T.click('button:has-text("Davomat")');
await modal(T).locator('button:has-text("Kechikdi")').first().click();
await modal(T).locator('button:has-text("Saqlash")').click();
await T.waitForSelector('text=Davomat saqlandi');
await T.click('button:has-text("Baho") >> nth=-1');
const gm = modal(T);
await gm.locator('select').nth(0).selectOption({ label: `Test Sinovjon ${U}` });
await gm.locator('select').nth(1).selectOption({ label: 'Faollik' });
await gm.locator('input[placeholder=Ball]').fill('1');
await gm.locator('button:has-text("Save Grade")').click();
await T.waitForSelector('text=Baho saqlandi');
await T.waitForTimeout(800);
await shot(T, '14-live-monitor-final'); log('attendance + grade saved');

// ---------- Message ----------
await T.goto(B + '/teacher/messages');
await T.click(`text=Test Sinovjon ${U}`);
await T.fill('input[placeholder="Xabar yozing..."]', 'Topshiriqni qayta yuboring.');
await T.click('button:has-text("Yuborish")');
await S.goto(B + '/student/messages');
await S.waitForSelector('text=Topshiriqni qayta yuboring.');
await S.fill('input[placeholder="Xabar yozing..."]', 'Xo‘p, ustoz!');
await S.click('button:has-text("Yuborish")');
await T.waitForSelector('text=Xo‘p, ustoz!', { timeout: 10000 }); log('real-time messaging ok');

// ---------- End lesson & student views ----------
await T.goto(B + '/teacher/live');
await T.click('text=● Kirish');
T.once('dialog', (d) => d.accept());
await T.click('button:has-text("Darsni tugatish")');
await T.waitForSelector('text=SALOM');
for (const [path, name, wait] of [['/student/grades', '15-student-grades', 'Faollik'], ['/student/attendance', '16-student-attendance', 'Kechikdi'], ['/student/stats', '17-student-stats', 'Baholar dinamikasi']]) {
  await S.goto(B + path); await S.waitForSelector(`text=${wait}`); await S.waitForTimeout(500); await shot(S, name);
}
await T.goto(B + '/teacher/reports');
await T.locator('select').nth(0).selectOption({ label: `KX9-${U}` });
await T.locator('select').nth(1).selectOption({ label: `Axborot tizimlari xavfsizligi ${U}` });
await T.waitForSelector('text=Batafsil jadval'); await T.waitForTimeout(800);
await shot(T, '18-teacher-reports');

// ---------- IDOR check: student cannot open other group's data ----------
const other = await S.evaluate(async () => (await fetch('/api/t/students')).status);
log('student -> teacher API status:', other);
console.log('\nERRORS:', errors.length ? errors : 'none');
await browser.close();
