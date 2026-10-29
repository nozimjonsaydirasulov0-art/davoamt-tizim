import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Button, Card, Empty, Spinner, StatusBadge, useAction, useFetch, useToast } from '../../components/ui';
import { t } from '../../i18n';
import { useSocket, useSocketEvent } from '../../socket';
import { Leaderboard, useCountdown } from '../teacher/Live';
import { MaterialRow } from './Learning';

const OPT = ['bg-rose-500 hover:bg-rose-600', 'bg-sky-500 hover:bg-sky-600', 'bg-amber-500 hover:bg-amber-600', 'bg-emerald-600 hover:bg-emerald-700'];
const SHAPES = ['▲', '◆', '●', '■'];

function QuizView({ lessonId, quiz, setQuiz, myAnswer, setMyAnswer, myResult }: any) {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState('');
  const qq = quiz.question;
  useEffect(() => { if (qq?.serverNow) setOffset(qq.serverNow - Date.now()); setErr(''); }, [qq?.questionId]); // eslint-disable-line
  const left = useCountdown(quiz.phase === 'question' ? qq?.endsAt : undefined, offset);
  const { socket } = useSocket();

  const answer = (key: string) => {
    if (myAnswer || left === 0) return;
    setMyAnswer(key);
    socket?.emit('quiz:answer', { lessonId, questionId: qq.questionId, answer: key }, (r: any) => {
      if (!r?.ok) { setErr(r?.error ?? 'Xato'); if (r?.error !== 'Siz allaqachon javob berdingiz') setMyAnswer(null); }
    });
  };

  if (quiz.phase === 'finished') {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 p-6 text-white">
        <div className="text-center text-2xl font-black">🏆 {quiz.title} — yakunlandi</div>
        {myResult && <div className="my-4 text-center"><div className="text-sm opacity-80">Sizning natijangiz</div><div className="text-5xl font-black">{myResult.score}/{myResult.maxScore}</div></div>}
        <div className="mx-auto max-w-md rounded-xl bg-white/95 p-3 text-slate-800"><Leaderboard rows={quiz.leaderboard ?? []} /></div>
        <div className="mt-3 text-center"><Button variant="secondary" onClick={() => setQuiz(null)}>Yopish</Button></div>
      </div>
    );
  }
  if (quiz.phase === 'reveal') {
    const rv = quiz.reveal;
    const correct = myAnswer && myAnswer === rv.correct;
    const me = rv.leaderboard.find((r: any) => r.student_id === user?.student_id);
    return (
      <div className={`rounded-2xl p-8 text-center text-white ${!myAnswer ? 'bg-slate-600' : correct ? 'bg-emerald-600' : 'bg-rose-600'}`}>
        <div className="text-6xl">{!myAnswer ? '⌛' : correct ? '✅' : '❌'}</div>
        <div className="mt-2 text-3xl font-black">{!myAnswer ? 'Javob berilmadi' : correct ? 'To‘g‘ri!' : 'Noto‘g‘ri'}</div>
        <div className="mt-1 text-lg opacity-90">To‘g‘ri javob: {rv.correct}</div>
        {me && <div className="mt-3 text-lg">Ballingiz: <b>{me.score}</b></div>}
        <div className="mt-4 text-sm opacity-80">Keyingi savolni kuting...</div>
      </div>
    );
  }
  if (!qq) return null;
  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-white sm:p-6">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold opacity-80">⚡ {quiz.title} · {qq.index + 1}/{qq.total}</span>
        <span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black ${left <= 5 ? 'animate-pulse bg-rose-500' : 'bg-brand-600'}`}>{left}</span>
      </div>
      <div className="mb-5 text-center text-xl font-bold leading-snug sm:text-2xl">{qq.text}</div>
      {left === 0 && !myAnswer ? (
        <div className="py-8 text-center text-2xl font-black text-rose-400">{t('time_up')}</div>
      ) : myAnswer ? (
        <div className="py-8 text-center"><div className="text-5xl">{SHAPES[['A', 'B', 'C', 'D'].indexOf(myAnswer)]}</div><div className="mt-2 text-xl font-bold">Javob qabul qilindi ({myAnswer})</div><div className="text-sm opacity-70">Natijani kuting...</div></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {qq.options.map((o: any, i: number) => (
            <button key={o.key} onClick={() => answer(o.key)} className={`flex min-h-[72px] items-center gap-3 rounded-xl px-5 py-4 text-left text-lg font-bold shadow-lg transition active:scale-95 ${OPT[i]}`}>
              <span className="text-2xl">{SHAPES[i]}</span><span>{o.text}</span>
            </button>
          ))}
        </div>
      )}
      {err && <div className="mt-3 text-center text-sm text-rose-300">{err}</div>}
    </div>
  );
}

function QuestionCard({ q, onSent }: { q: any; onSent: () => void }) {
  const [text, setText] = useState(q.my_answer ?? '');
  const { busy, run } = useAction();
  const send = async () => { if (await run(() => api.post('/s/live/answers', { question_id: q.id, text }), 'Javob yuborildi')) onSent(); };
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 text-lg font-semibold text-slate-900">❓ {q.text}</div>
      {q.my_score !== null && q.my_score !== undefined ? (
        <div className="text-sm"><Badge color="green">Baholandi: {q.my_score}/{q.max_score}</Badge><div className="mt-1 text-slate-600">{q.my_answer}</div></div>
      ) : (
        <>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Javobingiz..." />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">{q.my_answer ? '✓ yuborilgan (o‘zgartirish mumkin)' : ''}</span>
            <Button onClick={send} loading={busy} disabled={!text.trim()}>{t('send')}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function Live() {
  const { data, loading, reload } = useFetch<any>('/s/live');
  const { socket } = useSocket();
  const toast = useToast();
  const [questions, setQuestions] = useState<any[]>([]);
  const [quiz, setQuiz] = useState<any | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [myResult, setMyResult] = useState<any | null>(null);
  const [ended, setEnded] = useState(false);
  const lessonId = data?.lesson?.id as string | undefined;

  const join = useCallback(() => {
    if (!lessonId || !socket) return;
    socket.emit('lesson:join', { lessonId }, (r: any) => {
      if (!r?.ok) return;
      setQuestions(r.questions ?? []);
      if (r.quiz && r.quiz.phase !== 'finished') {
        setQuiz(r.quiz);
        if (r.answered) setMyAnswer('?');
      }
    });
  }, [lessonId, socket]);

  useEffect(() => {
    if (!lessonId || !socket) return;
    setEnded(false);
    join();
    socket.on('connect', join);
    const vis = () => socket.emit('lesson:status', { lessonId, status: document.hidden ? 'away' : 'active' });
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('blur', vis); window.addEventListener('focus', vis);
    return () => {
      socket.off('connect', join);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', vis); window.removeEventListener('focus', vis);
      socket.emit('lesson:leave', { lessonId });
    };
  }, [lessonId, socket, join]);

  useSocketEvent('lesson:started', reload);
  useSocketEvent('lesson:ended', () => { setEnded(true); setQuiz(null); });
  useSocketEvent<any>('question:new', (q) => { setQuestions((x) => [{ ...q, my_answer: null, my_score: null }, ...x]); toast('❓ Yangi savol!', 'info'); });
  useSocketEvent<any>('question:closed', (q) => setQuestions((x) => x.filter((y) => y.id !== q.id)));
  useSocketEvent<any>('question:graded', (g) => setQuestions((x) => x.map((y) => (y.id === g.question_id ? { ...y, my_score: g.score } : y))));
  useSocketEvent<any>('material:new', (m) => { if (m.lesson_id === lessonId) reload(); });
  useSocketEvent<any>('assignment:new', (a) => { if (a.lesson_id === lessonId) reload(); });
  useSocketEvent<any>('submission:graded', reload);
  useSocketEvent<any>('quiz:question', (q) => { setMyAnswer(null); setMyResult(null); setQuiz((prev: any) => ({ ...(prev ?? {}), title: q.title, quizId: q.quizId, phase: 'question', question: q, index: q.index, total: q.total })); });
  useSocketEvent<any>('quiz:reveal', (r) => setQuiz((prev: any) => ({ ...(prev ?? {}), phase: 'reveal', reveal: r })));
  useSocketEvent<any>('quiz:finished', (f) => setQuiz((prev: any) => ({ ...(prev ?? {}), phase: 'finished', title: f.title, leaderboard: f.leaderboard })));
  useSocketEvent<any>('quiz:myresult', setMyResult);

  if (loading) return <Spinner />;
  if (!data?.lesson || ended) return (
    <Card><Empty text={ended ? 'Dars tugadi. Rahmat!' : t('no_active_lesson')} icon={ended ? '🏁' : '⚡'} />
      <p className="text-center text-sm text-slate-500">O‘qituvchi darsni boshlaganda bu sahifa avtomatik yangilanadi.</p></Card>
  );
  const L = data.lesson;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow">
        <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
        <div className="flex-1"><div className="text-xs font-bold tracking-widest opacity-80">JONLI DARS</div><div className="text-xl font-bold">{L.subject_name}</div><div className="text-sm opacity-80">{L.group_name}</div></div>
      </div>

      {quiz && <QuizView lessonId={L.id} quiz={quiz} setQuiz={setQuiz} myAnswer={myAnswer} setMyAnswer={setMyAnswer} myResult={myResult} />}

      {questions.length > 0 && <div className="space-y-3">{questions.map((q) => <QuestionCard key={q.id} q={q} onSent={() => setQuestions((x) => x.map((y) => (y.id === q.id ? { ...y, my_answer: '✓' } : y)))} />)}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="📂 Dars materiallari">
          {!data.materials.length ? <Empty text="Hali material yo‘q" /> : <div className="space-y-2">{data.materials.map((m: any) => <MaterialRow key={m.id} m={m} />)}</div>}
        </Card>
        <Card title="💻 Amaliy topshiriqlar">
          {!data.assignments.length ? <Empty text="Hali topshiriq yo‘q" /> : data.assignments.map((a: any) => (
            <Link key={a.id} to={`/student/assignments/${a.id}`} className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <span className="font-medium">{a.title}</span>
              <span className="flex items-center gap-2">{a.score !== null && <b>{a.score}/{a.max_score}</b>}<StatusBadge status={a.status} /></span>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
