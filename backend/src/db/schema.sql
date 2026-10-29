-- =====================================================================
--  EDU PLATFORM — PostgreSQL sxemasi (v1)
--  Bitta TEACHER (super admin) + ko'p STUDENT
--  Ichki ID: UUID. Ko'rinadigan ID: STU-2026-K7Q2M (tasodifiy, taxmin qilib bo'lmaydi)
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Foydalanuvchilar va autentifikatsiya ----------
CREATE TABLE IF NOT EXISTS users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role                 TEXT NOT NULL CHECK (role IN ('teacher','student')),
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  full_name            TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts      INT NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Tizimda faqat bitta teacher bo'lishi mumkin
CREATE UNIQUE INDEX IF NOT EXISTS one_teacher_only ON users ((role)) WHERE role = 'teacher';

CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,          -- SHA-256(token); tokenning o'zi faqat cookie'da
  csrf_token  TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- ---------- Akademik tuzilma ----------
CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  semester    INT CHECK (semester BETWEEN 1 AND 12),
  course      INT CHECK (course BETWEEN 1 AND 6),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL UNIQUE,
  course        INT CHECK (course BETWEEN 1 AND 6),
  direction     TEXT,
  academic_year TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GROUP <-> SUBJECT (ko'pga-ko'p)
CREATE TABLE IF NOT EXISTS group_subjects (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, subject_id)
);
CREATE INDEX IF NOT EXISTS group_subjects_subject_idx ON group_subjects(subject_id);

CREATE TABLE IF NOT EXISTS students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  public_id  TEXT NOT NULL UNIQUE,
  birth_date DATE,
  gender     TEXT CHECK (gender IN ('male','female')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Talaba bir vaqtda bitta guruhda (student_id UNIQUE)
CREATE TABLE IF NOT EXISTS student_groups (
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, group_id)
);
CREATE INDEX IF NOT EXISTS student_groups_group_idx ON student_groups(group_id);

-- ---------- Dars jadvali va jonli darslar ----------
CREATE TABLE IF NOT EXISTS schedules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  group_id   UUID NOT NULL,
  weekday    INT NOT NULL CHECK (weekday BETWEEN 1 AND 7),   -- 1 = Dushanba
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  room       TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  -- jadvalga faqat guruhga biriktirilgan fan qo'yiladi
  FOREIGN KEY (group_id, subject_id) REFERENCES group_subjects(group_id, subject_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS schedules_group_idx ON schedules(group_id, weekday);

CREATE TABLE IF NOT EXISTS live_lessons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   TEXT NOT NULL UNIQUE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  topic       TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);
-- bitta guruhda bir vaqtda bitta aktiv dars
CREATE UNIQUE INDEX IF NOT EXISTS one_active_lesson_per_group ON live_lessons(group_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS live_participants (
  lesson_id    UUID NOT NULL REFERENCES live_lessons(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  first_joined TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS live_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES live_lessons(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  max_score  NUMERIC(6,2) NOT NULL DEFAULT 1,
  is_open    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES live_questions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  score       NUMERIC(6,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, student_id)
);

-- ---------- Davomat ----------
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  lesson_id  UUID UNIQUE REFERENCES live_lessons(id) ON DELETE SET NULL,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_sg_idx ON attendance(subject_id, group_id, date);

CREATE TABLE IF NOT EXISTS attendance_records (
  attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('present','absent','late')),
  PRIMARY KEY (attendance_id, student_id)
);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_id);

-- ---------- Baholar ----------
CREATE TABLE IF NOT EXISTS grade_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  default_max NUMERIC(6,2) NOT NULL DEFAULT 10,
  system_key  TEXT UNIQUE,                 -- 'assignment','quiz','test','activity' — avtomatik baholar uchun
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES grade_categories(id) ON DELETE RESTRICT,
  lesson_id   UUID REFERENCES live_lessons(id) ON DELETE SET NULL,
  score       NUMERIC(6,2) NOT NULL CHECK (score >= 0),
  max_score   NUMERIC(6,2) NOT NULL CHECK (max_score > 0),
  comment     TEXT,
  source_type TEXT,     -- 'assignment' | 'quiz' | 'live_answer' | NULL (qo'lda)
  source_id   UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (score <= max_score)
);
CREATE INDEX IF NOT EXISTS grades_student_subject_idx ON grades(student_id, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS grades_source_uniq ON grades(source_type, source_id, student_id) WHERE source_id IS NOT NULL;

-- ---------- Materiallar va topshiriqlar ----------
CREATE TABLE IF NOT EXISTS materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES live_lessons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT NOT NULL,
  mime_type   TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_group_idx ON materials(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   TEXT NOT NULL UNIQUE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES live_lessons(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  deadline    TIMESTAMPTZ,
  max_score   NUMERIC(6,2) NOT NULL DEFAULT 10 CHECK (max_score > 0),
  file_name   TEXT,
  file_path   TEXT,
  file_size   BIGINT,
  mime_type   TEXT,
  deadline_notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assignments_group_idx ON assignments(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','submitted','graded')),
  text_answer   TEXT,
  file_name     TEXT,
  file_path     TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  score         NUMERIC(6,2),
  feedback      TEXT,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at  TIMESTAMPTZ,
  graded_at     TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

-- ---------- Testlar va jonli quiz ----------
CREATE TABLE IF NOT EXISTS quizzes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id   TEXT NOT NULL UNIQUE,
  subject_id  UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'live' CHECK (mode IN ('live','test')),
  -- test rejimi uchun: qaysi guruhga ochilgan va qachongacha
  group_id    UUID REFERENCES groups(id) ON DELETE SET NULL,
  opens_at    TIMESTAMPTZ,
  closes_at   TIMESTAMPTZ,
  time_limit_min INT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id    UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position   INT NOT NULL,
  text       TEXT NOT NULL,
  option_a   TEXT NOT NULL,
  option_b   TEXT NOT NULL,
  option_c   TEXT,
  option_d   TEXT,
  correct    CHAR(1) NOT NULL CHECK (correct IN ('A','B','C','D')),
  time_sec   INT NOT NULL DEFAULT 20 CHECK (time_sec BETWEEN 5 AND 600),
  points     NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (points > 0),
  UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id   UUID REFERENCES live_lessons(id) ON DELETE CASCADE,
  score       NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_score   NUMERIC(8,2) NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (quiz_id, student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  attempt_id  UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  answer      CHAR(1) CHECK (answer IN ('A','B','C','D')),
  is_correct  BOOLEAN NOT NULL,
  points      NUMERIC(6,2) NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

-- ---------- Aloqa ----------
CREATE TABLE IF NOT EXISTS messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,   -- shaxsiy xabar
  group_id     UUID REFERENCES groups(id) ON DELETE CASCADE,  -- guruhga xabar
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((recipient_id IS NULL) <> (group_id IS NULL))
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS messages_group_idx ON messages(group_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    JSONB,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

-- ---------- Boshlang'ich ma'lumotlar ----------
INSERT INTO grade_categories (name, default_max, system_key) VALUES
  ('Amaliy ish', 10, 'assignment'),
  ('Test', 10, 'test'),
  ('Quiz', 10, 'quiz'),
  ('Mustaqil ish', 10, NULL),
  ('Faollik', 1, 'activity'),
  ('Oraliq nazorat', 30, NULL),
  ('Yakuniy nazorat', 50, NULL)
ON CONFLICT (name) DO NOTHING;

INSERT INTO settings (key, value) VALUES
  ('student_editable_fields', '["phone","email"]')
ON CONFLICT (key) DO NOTHING;
