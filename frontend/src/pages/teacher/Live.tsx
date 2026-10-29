import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, StatusBadge, SubjectGroupPicker, Table, useAction, useFetch, useToast } from '../../components/ui';
import { fmtDateTime, fmtSize, t } from '../../i18n';
import { useSocket, useSocketEvent } from '../../socket';
import { AttendanceSheet, GradeForm } from './AttendanceGrades';
import { AssignmentForm, MaterialForm, fileIcon } from './MaterialsAssignments';

export function LiveList() {
  const { data, loading } = useFetch<any[]>('/t/lessons');
  const [sub, setSub] = useState(''); const [grp, setGrp] = useState('');
  const { busy, run } = useAction();
  const nav = useNavigate();
  const start = async () => { const l = await run(() => api.post('/t/lessons/start', { subject_id: sub, group_id: grp })); if (l) nav(`/teacher/live/${l.id}`); };
  const active = data?.filter((l) => l.status === 'active') ?? [];
  return (
    <div>
      <PageHeader title={t('nav_live')} subtitle="Jonli darslar: real-time material, topshiriq, savol, quiz va monitoring" />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Jadvaldan tashqari darsni boshlash">
          <div className="space-y-3">
            <SubjectGroupPicker subjectId={sub} groupId={grp} onChange={(s, g) => { setSub(s); setGrp(g); }} />
            <Button className="w-full" size="lg" onClick={start} loading={busy} disabled={!sub || !grp}>▶ {t('start_lesson')}</Button>
            <p className="text-xs text-slate-500">Odatda darslar <Link className="text-brand-600" to="/teacher/schedule">Dars jadvali</Link> yoki bosh sahifadan boshlanadi.</p>
          </div>
        </Card>
        <Card title="Aktiv darslar" className="lg:col-span-2">
          {!active.length ? <Empty text={t('no_active_lesson')} icon="⚡" /> : active.map((l) => (
            <div key={l.id} className="mb-2 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div><div className="font-semibold">{l.subject_name}</div><div className="text-sm text-slate-600">{l.group_name} · boshlangan {fmtDateTime(l.started_at)}</div></div>
              <Link to={`/teacher/live/${l.id}`}><Button variant="success">● Kirish</Button></Link>
            </div>
          ))}
        </Card>
      </div>
      <Card title="O‘tgan darslar" className="mt-5">
        {loading ? <Spinner /> : (
          <Table head={[t('date'), t('subject'), t('group'), 'Qatnashgan', t('status')]} empty={!data?.length}>
            {data?.map((l) => (
              <tr key={l.id}><td className="td">{fmtDateTime(l.started_at)}</td><td className="td">{l.subject_name}</td><td className="td">{l.group_name}</td><td className="td">{l.participants}</td>
                <td className="td">{l.status === 'active' ? <Link to={`/teacher/live/${l.id}`}><Badge color="green">aktiv</Badge></Link> : <Badge>tugagan</Badge>}</td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function useElapsed(from?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (!from) return '00:00:00';
  const s = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
}
export function useCountdown(endsAt?: number, offset = 0) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!endsAt) return; const i = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(i); }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - (now + offset)) / 1000));
}

const OPT_COLORS = ['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-600'];
const ONLINE_DOT: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' };

function QuizPanel({ lessonId, quiz, quizzes, onChange }: { lessonId: string; quiz: any; quizzes: any[]; onChange: (q: any) => void }) {
  const { busy, run } = useAction();
  const [offset, setOffset] = useState(0);
  useEffect(() => { if (quiz?.question?.serverNow) setOffset(quiz.question.serverNow - Date.now()); }, [quiz?.question?.questionId]); // eslint-disable-line
  const left = useCountdown(quiz?.phase === 'question' ? quiz.question.endsAt : undefined, offset);
  const act = async (path: string, body?: any) => { const r = await run(() => api.post(`/t/lessons/${lessonId}/quiz/${path}`, body)); if (r !== undefined) onChange(r); };

  if (!quiz || quiz.phase === 'finished') {
    const available = quizzes.filter((q) => !q.used && q.question_count > 0);
    return (
      <div className="space-y-3">
        {quiz?.phase === 'finished' && (
          <div className="rounded-xl bg-violet-50 p-4">
            <div className="mb-2 font-semibold text-violet-900">🏆 “{quiz.title}” yakunlandi</div>
            <Leaderboard rows={quiz.leaderboard} />
          </div>
        )}
        {!available.length ? <Empty text="Bu fan bo‘yicha jonli quiz yo‘q" icon="⚡" /> : available.map((q) => (
          <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div><div className="font-medium">{q.title}</div><div className="text-xs text-slate-500">{q.question_count} savol</div></div>
            <Button variant="success" loading={busy} onClick={() => act('start', { quiz_id: q.id })}>▶ START QUIZ</Button>
          </div>
        ))}
        <Link to="/teacher/tests/new" className="block text-center text-sm text-brand-600">+ Yangi quiz yaratish</Link>
      </div>
    );
  }
  const qq = quiz.question;
  const rv = quiz.reveal;
  const counts = rv?.counts ?? quiz.counts ?? {};
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <Badge color="purple">{quiz.title}</Badge>
        <span className="font-semibold text-slate-600">Savol {quiz.index + 1}/{quiz.total}</span>
      </div>
      {quiz.phase === 'question' && qq && (
        <>
          <div className="flex items-center gap-4 rounded-xl bg-slate-900 p-4 text-white">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-black ${left <= 5 ? 'animate-pulse bg-rose-500' : 'bg-brand-600'}`}>{left}</div>
            <div className="text-lg font-semibold leading-snug">{qq.text}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {qq.options.map((o: any, i: number) => (
              <div key={o.key} className={`rounded-lg p-3 text-sm font-semibold text-white ${OPT_COLORS[i]}`}>{o.key}) {o.text} <span className="float-right opacity-80">{counts[o.key] ?? 0}</span></div>
            ))}
          </div>
          <div className="text-center text-2xl font-black text-slate-800">Answered: {quiz.answered}/{quiz.totalStudents}</div>
          <Button variant="secondary" className="w-full" onClick={() => act('reveal')}>⏹ Vaqtni to‘xtatish va javobni ko‘rsatish</Button>
        </>
      )}
      {quiz.phase === 'reveal' && rv && (
        <>
          <div className="rounded-xl bg-emerald-50 p-3 text-center font-semibold text-emerald-800">To‘g‘ri javob: {rv.correct} · Javob berdi: {rv.answered}/{quiz.totalStudents}</div>
          <div className="space-y-1">
            {['A', 'B', 'C', 'D'].map((k, i) => (counts[k] !== undefined || k === rv.correct) && (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white ${OPT_COLORS[i]}`}>{k}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100"><div className={`h-full ${k === rv.correct ? 'bg-emerald-500' : 'bg-slate-400'}`} style={{ width: `${rv.answered ? (100 * (counts[k] ?? 0)) / rv.answered : 0}%` }} /></div>
                <span className="w-6 text-right">{counts[k] ?? 0}</span>
              </div>
            ))}
          </div>
          <Leaderboard rows={rv.leaderboard} />
          <div className="flex gap-2">
            {!rv.isLast && <Button className="flex-1" size="lg" loading={busy} onClick={() => act('next')}>{t('next_question')} →</Button>}
            <Button className="flex-1" size="lg" variant={rv.isLast ? 'success' : 'secondary'} loading={busy} onClick={() => act('stop')}>🏁 {t('finish_quiz')}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export const Leaderboard = ({ rows }: { rows: any[] }) => (
  <div className="space-y-1">
    {rows?.map((r, i) => (
      <div key={r.student_id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${i === 0 ? 'bg-amber-100 font-bold' : i < 3 ? 'bg-slate-100 font-semibold' : ''}`}>
        <span className="w-6">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span><span className="flex-1 truncate">{r.full_name}</span><span>{r.score}</span>
      </div>
    ))}
    {!rows?.length && <div className="text-center text-xs text-slate-400">Hali javob yo‘q</div>}
  </div>
);

function QuestionsPanel({ lessonId, questions, reload }: { lessonId: string; questions: any[]; reload: () => void }) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const { run } = useAction();
  const grade = async (a: any) => { if (await run(() => api.post(`/t/live-answers/${a.id}/grade`, { score: scores[a.id] }), 'Baholandi')) reload(); };
  const close = async (q: any) => { if (await run(() => api.post(`/t/lessons/${lessonId}/questions/${q.id}/close`))) reload(); };
  if (!questions.length) return <Empty text="Savol yuborilmagan" icon="❓" />;
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <div key={q.id} className="rounded-lg border border-slate-200">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
            <div className="text-sm font-semibold">❓ {q.text} <span className="text-xs font-normal text-slate-400">({q.answers.length} javob · max {q.max_score})</span></div>
            {q.is_open ? <Button size="sm" variant="ghost" onClick={() => close(q)}>Yopish</Button> : <Badge>yopiq</Badge>}
          </div>
          <div className="divide-y divide-slate-50">
            {q.answers.map((a: any) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-32 shrink-0 font-medium">{a.full_name}</span>
                <span className="min-w-[120px] flex-1 whitespace-pre-wrap text-slate-600">{a.text}</span>
                {a.score !== null && <Badge color="green">{a.score}/{q.max_score}</Badge>}
                <input className="input w-16 py-1" type="number" min={0} max={q.max_score} step="0.5" placeholder="ball" value={scores[a.id] ?? ''} onChange={(e) => setScores({ ...scores, [a.id]: e.target.value })} />
                <Button size="sm" onClick={() => grade(a)} disabled={!scores[a.id]}>✓</Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamsTool({ students, groupId, onDone }: { students: any[]; groupId: string; onDone: () => void }) {
  const [size, setSize] = useState(3);
  const [onlyOnline, setOnlyOnline] = useState(true);
  const [teams, setTeams] = useState<any[][]>([]);
  const { busy, run } = useAction();
  const make = () => {
    const pool = students.filter((s) => !onlyOnline || s.online !== 'red').sort(() => Math.random() - 0.5);
    const n = Math.max(1, Math.ceil(pool.length / size));
    const res: any[][] = Array.from({ length: n }, () => []);
    pool.forEach((s, i) => res[i % n].push(s));
    setTeams(res);
  };
  const announce = async () => {
    const body = '👥 Guruhli ish jamoalari:\n' + teams.map((tm, i) => `${i + 1}-jamoa: ${tm.map((s) => s.full_name).join(', ')}`).join('\n');
    if (await run(() => api.post('/messages', { group_id: groupId, body }), 'Jamoalar guruhga yuborildi')) onDone();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Jamoadagi talabalar soni"><input className="input w-24" type="number" min={2} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} /></Field>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} /> faqat online</label>
        <Button variant="secondary" onClick={make}>🎲 Tasodifiy bo‘lish</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((tm, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3"><div className="mb-1 font-semibold text-brand-700">{i + 1}-jamoa</div>{tm.map((s) => <div key={s.student_id} className="text-sm">{s.full_name}</div>)}</div>
        ))}
      </div>
      {teams.length > 0 && <div className="flex justify-end"><Button onClick={announce} loading={busy}>📢 Guruhga e’lon qilish</Button></div>}
    </div>
  );
}

function PublishTestModal({ lesson, onDone }: { lesson: any; onDone: () => void }) {
  const { data } = useFetch<any[]>('/t/quizzes?mode=test');
  const [limit, setLimit] = useState('20');
  const { busy, run } = useAction();
  const list = data?.filter((q) => q.subject_id === lesson.subject_id) ?? [];
  const publish = async (q: any) => {
    if (await run(() => api.post(`/t/quizzes/${q.id}/publish`, { group_id: lesson.group_id, time_limit_min: Number(limit) || null }), 'Test guruhga ochildi')) onDone();
  };
  return (
    <div className="space-y-3">
      <Field label="Vaqt limiti (daqiqa)"><input className="input w-28" type="number" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      {!list.length ? <Empty text="Bu fan bo‘yicha mustaqil test yo‘q" /> : list.map((q) => (
        <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
          <div><div className="font-medium">{q.title}</div><div className="text-xs text-slate-500">{q.question_count} savol {q.is_published && `· ochiq (${q.group_name})`}</div></div>
          <Button loading={busy} onClick={() => publish(q)}>🚀 Yuborish</Button>
        </div>
      ))}
    </div>
  );
}

export function LiveClassroom() {
  const { id } = useParams();
  const lessonId = id!;
  const nav = useNavigate();
  const toast = useToast();
  const { socket } = useSocket();
  const { data, loading, reload } = useFetch<any>(`/t/lessons/${lessonId}`);
  const [monitor, setMonitor] = useState<any | null>(null);
  const [quiz, setQuiz] = useState<any | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [gradeFor, setGradeFor] = useState<string | undefined>();
  const [qText, setQText] = useState(''); const [qMax, setQMax] = useState('1');
  const { busy, run } = useAction();
  const elapsed = useElapsed(data?.lesson.started_at);

  useEffect(() => { if (data) { setMonitor(data.monitor); setQuiz(data.quiz); } }, [data]);

  const join = useCallback(() => {
    socket?.emit('lesson:join', { lessonId }, (r: any) => { if (r?.ok) { setMonitor(r.monitor); setQuiz(r.quiz); } });
  }, [socket, lessonId]);
  useEffect(() => { join(); socket?.on('connect', join); return () => { socket?.off('connect', join); }; }, [socket, join]);

  useSocketEvent('monitor:update', (m: any) => m?.lessonId === lessonId && setMonitor(m));
  useSocketEvent('quiz:state', setQuiz);
  useSocketEvent<any>('quiz:progress', (p) => setQuiz((q: any) => (q ? { ...q, answered: p.answered, counts: p.counts } : q)));
  useSocketEvent<any>('question:answer', (a) => { toast(`💬 ${a.full_name} javob berdi`, 'info'); reload(); });

  if (loading || !data) return <Spinner />;
  const L = data.lesson;
  if (L.status !== 'active') return (
    <Card><Empty text="Bu dars tugagan" icon="🏁" /><div className="text-center"><Link to="/teacher/live"><Button variant="secondary">Orqaga</Button></Link></div></Card>
  );
  const students = monitor?.students ?? [];

  const end = async () => {
    if (!confirm('Darsni tugatasizmi? Davomat saqlanganiga ishonch hosil qiling.')) return;
    if (await run(() => api.post(`/t/lessons/${lessonId}/end`), 'Dars tugatildi')) nav('/teacher');
  };
  const sendQuestion = async () => {
    if (await run(() => api.post(`/t/lessons/${lessonId}/questions`, { text: qText, max_score: qMax }), 'Savol yuborildi')) { setQText(''); setModal(null); reload(); }
  };
  const actions = [
    { k: 'material', icon: '📂', label: t('btn_material'), c: 'from-sky-500 to-sky-600' },
    { k: 'task', icon: '💻', label: t('btn_task'), c: 'from-indigo-500 to-indigo-600' },
    { k: 'question', icon: '❓', label: t('btn_question'), c: 'from-amber-500 to-orange-500' },
    { k: 'test', icon: '🧪', label: t('btn_test'), c: 'from-rose-500 to-rose-600' },
    { k: 'quiz', icon: '⚡', label: t('btn_quiz'), c: 'from-violet-500 to-purple-600' },
    { k: 'teams', icon: '👥', label: 'Guruhli ish', c: 'from-teal-500 to-emerald-600' },
    { k: 'attendance', icon: '📝', label: t('btn_attendance'), c: 'from-slate-600 to-slate-700' },
    { k: 'grade', icon: '📊', label: t('btn_grade'), c: 'from-fuchsia-500 to-pink-600' },
  ];
  const quizRunning = quiz && quiz.phase !== 'finished';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-500" /><span className="text-sm font-bold tracking-widest">{t('live_classroom')}</span></div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xl font-bold">{L.subject_name}</div>
            <div className="text-sm text-brand-200">{L.group_name} · {L.public_id}</div>
          </div>
          <div className="text-center"><div className="text-xs uppercase text-brand-200">{t('online')}</div><div className="text-2xl font-black">{monitor?.online ?? 0} / {monitor?.total ?? 0}</div></div>
          <div className="text-center"><div className="text-xs uppercase text-brand-200">⏱ Vaqt</div><div className="font-mono text-2xl font-black">{elapsed}</div></div>
          <Button variant="danger" onClick={end} loading={busy}>⏹ {t('end_lesson')}</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {actions.map((a) => (
          <button key={a.k} onClick={() => { setGradeFor(undefined); setModal(a.k); }}
            className={`flex flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br ${a.c} px-2 py-4 text-white shadow-md transition hover:scale-[1.03] hover:shadow-lg ${a.k === 'quiz' && quizRunning ? 'ring-4 ring-violet-300' : ''}`}>
            <span className="text-2xl">{a.icon}</span><span className="text-xs font-semibold sm:text-sm">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <Card title="👁 Real-time monitoring" actions={<span className="text-xs text-slate-400">🟢 darsda · 🟡 boshqa sahifada · 🔴 offline</span>}>
          <Table head={['Talaba', t('online'), t('nav_attendance'), 'Task', 'Quiz', t('score'), '']} empty={!students.length}>
            {students.map((s: any) => (
              <tr key={s.student_id} className={s.online === 'red' ? 'bg-slate-50/50 text-slate-400' : ''}>
                <td className="td font-medium">{s.full_name}</td>
                <td className="td text-lg">{ONLINE_DOT[s.online]}</td>
                <td className="td">{s.attendance ? <StatusBadge status={s.attendance} /> : '—'}</td>
                <td className="td">{s.task ? <><StatusBadge status={s.task} />{s.task_score !== null && <span className="ml-1 text-xs font-semibold">{s.task_score}</span>}</> : '—'}</td>
                <td className="td">{s.quiz ? <Badge color={s.quiz === 'done' || s.quiz === 'answered' ? 'green' : s.quiz === 'in_progress' ? 'yellow' : 'gray'}>{s.quiz === 'answered' ? 'javob berdi' : s.quiz === 'done' ? `Done ${s.quiz_score ?? ''}` : s.quiz === 'in_progress' ? 'ishlamoqda' : 'kutmoqda'}</Badge> : '—'}</td>
                <td className="td text-lg font-bold text-brand-700">{s.score ?? '—'}</td>
                <td className="td text-right"><Button size="sm" variant="ghost" title="Baho" onClick={() => { setGradeFor(s.student_id); setModal('grade'); }}>＋</Button></td>
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-5">
          {quizRunning && <Card title="⚡ Jonli quiz"><QuizPanel lessonId={lessonId} quiz={quiz} quizzes={data.quizzes} onChange={setQuiz} /></Card>}
          <Card title="❓ Savollar va javoblar"><QuestionsPanel lessonId={lessonId} questions={data.questions} reload={reload} /></Card>
          <Card title="📦 Darsda yuborilganlar">
            <div className="space-y-2 text-sm">
              {data.materials.map((m: any) => <div key={m.id}>{fileIcon(m.mime_type)} {m.title} <span className="text-xs text-slate-400">{fmtSize(m.file_size)}</span></div>)}
              {data.assignments.map((a: any) => <Link key={a.id} to={`/teacher/assignments/${a.id}`} className="block text-brand-700 hover:underline">💻 {a.title}</Link>)}
              {!data.materials.length && !data.assignments.length && <div className="text-xs text-slate-400">Hali hech narsa yuborilmagan</div>}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={modal === 'material'} onClose={() => setModal(null)} title="📂 Material yuborish"><MaterialForm lessonId={lessonId} onSaved={() => { setModal(null); reload(); }} /></Modal>
      <Modal open={modal === 'task'} onClose={() => setModal(null)} title="💻 Amaliy topshiriq" wide><AssignmentForm lessonId={lessonId} onSaved={() => { setModal(null); reload(); }} /></Modal>
      <Modal open={modal === 'question'} onClose={() => setModal(null)} title="❓ Savol yuborish">
        <div className="space-y-3">
          <textarea className="input text-lg" rows={3} autoFocus placeholder="TCP va UDP o‘rtasidagi asosiy farq nima?" value={qText} onChange={(e) => setQText(e.target.value)} />
          <Field label="Maks. ball (Faollik)"><input className="input w-24" type="number" min={0.5} step="0.5" value={qMax} onChange={(e) => setQMax(e.target.value)} /></Field>
          <div className="flex justify-end"><Button onClick={sendQuestion} loading={busy} disabled={qText.trim().length < 2}>📤 Yuborish</Button></div>
        </div>
      </Modal>
      <Modal open={modal === 'test'} onClose={() => setModal(null)} title="🧪 Guruhga test yuborish"><PublishTestModal lesson={L} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'quiz'} onClose={() => setModal(null)} title="⚡ Jonli quiz" wide><QuizPanel lessonId={lessonId} quiz={quiz} quizzes={data.quizzes} onChange={(q) => { setQuiz(q); if (q?.phase === 'question') setModal(null); }} /></Modal>
      <Modal open={modal === 'teams'} onClose={() => setModal(null)} title="👥 Guruhli ish" wide><TeamsTool students={students} groupId={L.group_id} onDone={() => setModal(null)} /></Modal>
      <Modal open={modal === 'attendance'} onClose={() => setModal(null)} title="📝 Davomat" wide><AttendanceSheet lessonId={lessonId} onSaved={() => setModal(null)} /></Modal>
      <Modal open={modal === 'grade'} onClose={() => setModal(null)} title="📊 Dars davomida baholash" wide>
        <GradeForm key={gradeFor ?? 'x'} students={students.map((s: any) => ({ id: s.student_id, full_name: s.full_name }))} subjectId={L.subject_id} lessonId={lessonId} presetStudent={gradeFor} onSaved={() => setModal(null)} />
      </Modal>
    </div>
  );
}
