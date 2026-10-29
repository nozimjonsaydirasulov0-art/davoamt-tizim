# EduPanel — Teacher + Student ta’lim boshqaruv platformasi (LOCAL MVP)

Bitta **TEACHER/ADMIN** (siz) va ko‘plab **STUDENT**lar uchun shaxsiy platforma.
HEMIS mantig‘iga o‘xshash (fan → guruh → talaba → jadval → davomat → baho), lekin asosiy urg‘u
**interaktiv real-time dars**, amaliy ish, jonli quiz va talabalarni kuzatishga berilgan.

> Bu **LOCAL MVP**: asosiy workflow to‘liq ishlaydi va end-to-end sinovdan o‘tgan.
> Production’ga chiqarishdan oldin “Productionga tayyorlash” bo‘limini o‘qing.

---

## 1. Tezkor ishga tushirish

### A) Docker bilan (eng oson — Windows/macOS/Linux)

Kerak: [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
cd edu-platform
cp .env.example .env            # Windows: copy .env.example .env
# .env ichida DB_PASSWORD ni o'zgartiring
docker compose up -d --build

# Demo ma'lumotlar bilan sinab ko'rish (ixtiyoriy):
docker compose exec backend node dist/db/seedDemo.js

# YOKI faqat o'zingizning teacher hisobingiz:
docker compose exec backend node dist/db/createTeacher.js --username nozimjon --name "Nozimjon" --password "KuchliParol2026"
```

Brauzerda: **http://localhost**

### B) Docker’siz (Node.js + PostgreSQL)

Kerak: **Node.js 20+**, **PostgreSQL 15+** (16 tavsiya).

```bash
# 1) Baza
psql -U postgres -c "CREATE USER edu WITH PASSWORD 'edu_dev_pass';"
psql -U postgres -c "CREATE DATABASE edu OWNER edu;"

# 2) Backend  (1-terminal)
cd backend
cp .env.example .env
npm install
npm run seed:demo          # demo ma'lumotlar (yoki: npm run seed:teacher -- --username nozimjon --password "KuchliParol2026")
npm run dev                # http://localhost:4000

# 3) Frontend (2-terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Brauzerda: **http://localhost:5173**

### Demo hisoblar (`seed:demo` dan keyin)

| Rol | Login | Parol |
|---|---|---|
| Teacher / Admin | `nozimjon` | `Teacher2026` |
| Talaba (KX1-25) | `aliyev.ali`, `valiyev.vali`, `sodiqov.sardor`, `dilshodov.dilshod`, `karimova.madina` | `Student2026` |
| Talaba (KX2-25) | `tursunov.jasur`, `rahimova.nilufar`, `ergashev.bekzod` | `Student2026` |

Real-time’ni ko‘rish uchun: teacher’ni oddiy oynada, talabani **inkognito** oynada (yoki telefonda) oching.

---

## 2. Sinab ko‘rish ssenariysi (asosiy workflow)

**Teacher:** Fanlar → *+ Yangi fan* → Guruhlar → *+ Yangi guruh* → guruh ichida *+ Fan biriktirish* →
*+ Talaba qo‘shish* (tizim Student ID, login va vaqtinchalik parol beradi) → Dars jadvali → *+ Dars jadvali* →
**▶ Boshlash** → Jonli dars ochiladi.

**Jonli darsda** katta tugmalar: 📂 Material · 💻 Amaliy ish · ❓ Savol · 🧪 Test · ⚡ Quiz · 👥 Guruhli ish · 📝 Davomat · 📊 Baho.
Monitoring jadvali real-time: 🟢 darsda / 🟡 boshqa sahifada yoki tab yashirin / 🔴 offline, Task holati, Quiz holati, joriy ball.

**Talaba:** vaqtinchalik parol bilan kiradi → “Yangi parol o‘rnating” → kabinet →
“DARS BOSHLANDI” → *Darsga qo‘shilish* → material darhol chiqadi, topshiriqni ochadi (teacher’da *Bajarmoqda*),
matn/fayl/screenshot yuboradi (*Topshirildi*), savolga javob beradi, quizda Kahoot uslubida tugma bosadi.

Bu ssenariy avtomatik test bilan to‘liq tekshirildi (Playwright, 2 ta brauzer: teacher desktop + talaba mobil).

---

## 3. Nima tayyor

| Modul | Holat |
|---|---|
| Autentifikatsiya: login, vaqtinchalik parol → majburiy yangi parol, parol almashtirish, logout | ✅ |
| Fanlar CRUD | ✅ |
| Guruhlar CRUD + guruh ↔ fan (ko‘pga-ko‘p) biriktirish | ✅ |
| Talabalar: yaratish (avto ID/login/parol), tahrirlash, parolni tiklash, bloklash, o‘chirish, online holat | ✅ |
| Dars jadvali: haftalik ko‘rinish, vaqt to‘qnashuvi tekshiruvi, jadvaldan darsni boshlash | ✅ |
| Jonli dars: online/timer, material, topshiriq, savol, test yuborish, quiz, guruhli ish, davomat, baho | ✅ |
| Real-time monitoring jadvali (online / task / quiz / davomat / ball) | ✅ |
| Jonli quiz: bir vaqtda savol, server timer, vaqt tugagach javob qabul qilinmaydi, Answered X/Y, leaderboard, bazaga yozish, avtomatik baho | ✅ |
| Mustaqil testlar: guruhga ochish, ochilish/yopilish vaqti, vaqt limiti (server tomonda), avtomatik baholash, natijani ko‘rish | ✅ |
| Amaliy topshiriq: fayl bilan, deadline, Not started → Working → Submitted → Graded, ball + feedback | ✅ |
| Materiallar: yuklash, ko‘rish (PDF/rasm), yuklab olish | ✅ |
| Davomat: Keldi / Kelmadi / Kechikdi, jonli darsda yoki alohida, tahrirlash | ✅ |
| Baholar: kategoriyalar (qo‘shish mumkin), jurnal, bitta/ustun bo‘yicha baho, tahrirlash | ✅ |
| Xabarlar: shaxsiy real-time chat (teacher ↔ talaba), guruhga e’lon kanali | ✅ |
| Bildirishnomalar: yangi material/topshiriq/test/baho/xabar, dars boshlandi, deadline yaqin (2 soat) | ✅ |
| Hisobotlar: fan → guruh statistikasi, grafiklar, har bir talaba progress grafigi | ✅ |
| Talaba statistikasi + grafiklar | ✅ |
| Sozlamalar: talaba qaysi profil maydonlarini tahrirlashi, baho kategoriyalari, audit log | ✅ |
| Responsive (telefonda test va quiz ishlaydi) | ✅ |
| i18n arxitekturasi (uz to‘liq; ru/en qisman) | ⚠️ qisman |

---

## 4. Texnologiyalar

| Qatlam | Tanlov | Sabab |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | tezkor, keng tarqalgan |
| UI | Tailwind CSS 3 | tez va izchil dizayn |
| Backend | Node.js + TypeScript + **Express** | NestJS’dan yengil; MVP uchun kam kod, keyin modullarga bo‘lish oson |
| Baza | **PostgreSQL 16** | FK, unique, partial index, tranzaksiya |
| Real-time | **Socket.IO** | reconnect, room’lar, fallback |
| Auth | **Server-side session** (httpOnly cookie + bazada hash) | JWT’dan farqli: istalgan payt sessiyani bekor qilish mumkin (parol almashtirish, bloklash) |
| Grafiklar | Recharts | |
| Deploy | Docker Compose + Nginx | |

---

## 5. Arxitektura

```
edu-platform/
├── backend/
│   └── src/
│       ├── db/schema.sql        ← butun sxema (27 jadval), server ishga tushganda avtomatik qo'llanadi
│       ├── db/createTeacher.ts  ← yagona teacher hisobini yaratish
│       ├── db/seedDemo.ts       ← demo ma'lumotlar
│       ├── auth.ts              ← sessiya, CSRF, rol tekshiruvlari
│       ├── realtime.ts          ← Socket.IO, presence, monitoring, jonli quiz dvigateli
│       ├── lib/files.ts         ← fayl yuklash va tekshirish
│       └── routes/
│           ├── auth.ts          ← /api/auth/*
│           ├── teacherCore.ts   ← /api/t/* (dashboard, fan, guruh, talaba, jadval, sozlamalar)
│           ├── teacherLearning.ts ← /api/t/* (dars, davomat, baho, material, topshiriq, test, statistika)
│           ├── student.ts       ← /api/s/* (faqat o'z ma'lumotlari)
│           └── common.ts        ← xabarlar, bildirishnomalar, fayllarni yuklab olish
├── frontend/src/
│   ├── pages/teacher/*          ← teacher paneli
│   ├── pages/student/*          ← talaba kabineti
│   ├── i18n/uz.ts, ru.ts, en.ts
│   └── components/ui.tsx, Layout.tsx
└── docker-compose.yml
```

### Ma’lumotlar bazasi (asosiy bog‘lanishlar)

```
users ─1:1─ students ─1:1─ student_groups ─N:1─ groups ─┐
                                                        ├─ group_subjects ─ subjects
schedules (group_id, subject_id) → FK → group_subjects ─┘      (jadvalga faqat biriktirilgan fan qo'yiladi)
live_lessons → live_participants, live_questions → live_answers
attendance → attendance_records
grades → grade_categories   (source_type/source_id: topshiriq/quiz/savol bahosi avtomatik bog'lanadi)
materials, assignments → assignment_submissions
quizzes → quiz_questions, quiz_attempts → quiz_answers
messages, notifications, sessions, audit_logs, settings
```

Muhim cheklovlar: tizimda **faqat bitta teacher** (partial unique index), guruhda bir vaqtda **bitta aktiv dars**,
talaba bir vaqtda **bitta guruhda**, baho `score <= max_score`, bitta talaba bitta topshiriqqa bitta javob.

### ID tizimi
Ichki ID — **UUID**. Ko‘rinadigan ID — `STU-2026-K7Q2MX`, `GRP-2026-…`, `SUB-…`, `LES-…`, `ASN-…`, `QUIZ-…`.
Suffiks **tasodifiy** (ketma-ket emas), shuning uchun taxmin qilib bo‘lmaydi. API hech qachon ko‘rinadigan ID
bo‘yicha ruxsat bermaydi — har bir so‘rov sessiyadagi foydalanuvchi bo‘yicha tekshiriladi.

---

## 6. Xavfsizlik

| Talab | Qanday bajarilgan |
|---|---|
| Parol hashing | bcrypt (12 round). Vaqtinchalik parol faqat bir marta ko‘rsatiladi, bazada faqat hash |
| Secure auth | 256-bit tasodifiy sessiya tokeni, bazada SHA-256 hash, httpOnly + SameSite=Lax cookie |
| Authorization / RBAC | `/api/t/*` faqat teacher, `/api/s/*` faqat student; student so‘rovlari doim `student_id`/`group_id` bilan filtrlanadi |
| ID almashtirish (IDOR) | talaba boshqa talabaning topshirig‘i/fayli/testini ocholmaydi (404/403) — testda tekshirildi |
| Input validation | har bir endpoint’da Zod sxemasi |
| SQL injection | faqat parametrli so‘rovlar (`$1, $2…`) |
| XSS | React avtomatik escape; `dangerouslySetInnerHTML` ishlatilmaydi; Helmet CSP |
| CSRF | sessiyaga bog‘langan token `X-CSRF-Token` header’da + SameSite cookie |
| Rate limiting | API: 300 so‘rov/daqiqa/IP; login: 20 urinish/15 daqiqa/IP |
| Brute-force | 5 ta noto‘g‘ri paroldan keyin hisob 15 daqiqaga bloklanadi; mavjud bo‘lmagan login uchun ham bir xil vaqt |
| Secure cookies / HTTPS | `COOKIE_SECURE=true` + Nginx’da TLS (quyida) |
| Fayl xavfsizligi | kengaytmalar ro‘yxati + **magic bytes** tekshiruvi (masalan `.exe`ni `.pdf` deb yuklab bo‘lmaydi — testda tekshirildi), 25 MB limit, tasodifiy nom, `nosniff`, faqat PDF/rasm inline, qolganlari yuklab olinadi, fayllar faqat avtorizatsiya orqali beriladi |
| Audit log | login, xato login, yaratish/o‘chirish, baho, parol, sozlamalar — Sozlamalar sahifasida ko‘rinadi |
| Sessiyani bekor qilish | parol almashtirilganda boshqa sessiyalar yopiladi; bloklangan talaba darhol chiqariladi |

---

## 7. Productionga tayyorlash (VPS)

1. VPS’ga Docker o‘rnating, loyihani ko‘chiring, `.env` da kuchli `DB_PASSWORD`, `APP_ORIGIN=https://sizning-domen.uz`.
2. `docker compose up -d --build`
3. Teacher hisobini yarating (`createTeacher.js`, demo seed **ishlatmang**).
4. **HTTPS**: eng oddiy yo‘l — host’da Nginx/Caddy + Let’s Encrypt, u `localhost:80` (web konteyner) ga proksi qiladi.
   Masalan Caddy: `edu.sizningdomen.uz { reverse_proxy localhost:8080 }` va `.env` da `HTTP_PORT=8080`.
   Keyin `.env` da `COOKIE_SECURE=true` va `docker compose up -d`.
5. Zaxira nusxa: `docker compose exec db pg_dump -U edu edu > backup.sql` + `uploads` volume’ini cron bilan saqlang.

---

## 8. Hozirgi cheklovlar va keyingi qadamlar

- **Jonli quiz holati server xotirasida.** Quiz o‘rtasida backend qayta ishga tushsa, joriy quiz yo‘qoladi (berilgan javoblar bazada qoladi). Bitta server uchun yetarli; bir nechta instansiya kerak bo‘lsa — Redis adapter.
- **i18n**: o‘zbekcha to‘liq; ru/en fayllari faqat asosiy kalitlarni o‘z ichiga oladi, sahifalarning bir qismi hali to‘g‘ridan-to‘g‘ri o‘zbekcha matnda.
- Parolni unutgan talaba — teacher “🔑 Parolni tiklash” orqali yangi vaqtinchalik parol beradi (email/SMS yo‘q).
- Talabalarni Excel’dan ommaviy import qilish — keyingi bosqich uchun yaxshi nomzod.
- Avtomatik testlar: hozir Playwright E2E ssenariysi ishlatildi; unit testlar qo‘shilmagan.
