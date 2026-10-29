import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../api';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, StatusBadge, Table, useAction, useFetch } from '../../components/ui';
import { fmtDateTime, t } from '../../i18n';
import { useSocketEvent } from '../../socket';
import { ACCEPT, canInline, fileIcon } from '../teacher/MaterialsAssignments';
import { useCountdown } from '../teacher/Live';

export function Assignments() {
  const { data, loading, reload } = useFetch<any[]>('/s/assignments');
  useSocketEvent('assignment:new', reload);
  useSocketEvent('submission:graded', reload);
  return (
    <div>
      <PageHeader title={t('nav_my_assignments')} />
      <Card>
        {loading ? <Spinner /> : (
          <Table head={['Topshiriq', t('subject'), t('deadline'), t('status'), t('score')]} empty={!data?.length}>
            {data?.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="td"><Link to={`/student/assignments/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.title}</Link></td>
                <td className="td text-sm">{a.subject_name}</td>
                <td className={`td text-xs ${a.deadline && new Date(a.deadline) < new Date() && a.status !== 'graded' && a.status !== 'submitted' ? 'text-rose-600' : ''}`}>{fmtDateTime(a.deadline)}</td>
                <td className="td"><StatusBadge status={a.status} /></td>
                <td className="td font-semibold">{a.score !== null ? `${a.score}/${a.max_score}` : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export function AssignmentDetail() {
  const { id } = useParams();
  const { data: a, loading, reload } = useFetch<any>(`/s/assignments/${id}`);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  useSocketEvent<any>('submission:graded', (p) => p.assignment_id === id && reload());
  useEffect(() => { if (a?.submission?.text_answer) setText(a.submission.text_answer); }, [a?.submission?.text_answer]);
  if (loading || !a) return <Spinner />;
  const sub = a.submission;
  const status = sub?.status ?? 'not_started';
  const expired = a.deadline && new Date(a.deadline) < new Date();

  const open = async () => { if (await run(() => api.post(`/s/assignments/${id}/open`))) reload(); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('text_answer', text);
    if (file) fd.append('file', file);
    if (await run(() => api.upload(`/s/assignments/${id}/submit`, fd), 'Javob yuborildi ✅')) { setFile(null); reload(); }
  };
  return (
    <div>
      <PageHeader title={a.title} subtitle={a.subject_name} actions={<StatusBadge status={status} />} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Topshiriq">
          {a.description && <div className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{a.description}</div>}
          <div className="space-y-1 text-sm">
            <div>⏰ Deadline: <b className={expired ? 'text-rose-600' : ''}>{fmtDateTime(a.deadline)}</b></div>
            <div>🎯 Maks. ball: <b>{a.max_score}</b></div>
          </div>
          {a.file_name && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <span>{fileIcon(a.mime_type)} {a.file_name}</span>
              {canInline(a.mime_type) && <a href={fileUrl('assignment', a.id, true)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">{t('view')}</Button></a>}
              <a href={fileUrl('assignment', a.id)}><Button size="sm">{t('download')}</Button></a>
            </div>
          )}
        </Card>
        <Card title="Mening javobim">
          {status === 'graded' ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50 p-5 text-center"><div className="text-sm text-emerald-700">Natija</div><div className="text-4xl font-black text-emerald-700">{sub.score}/{a.max_score}</div></div>
              {sub.feedback && <div className="rounded-lg bg-slate-50 p-3 text-sm"><b>O‘qituvchi izohi:</b> {sub.feedback}</div>}
              {sub.text_answer && <div className="whitespace-pre-wrap text-sm text-slate-600">{sub.text_answer}</div>}
            </div>
          ) : status === 'not_started' ? (
            <div className="py-6 text-center"><Button size="lg" onClick={open} loading={busy}>📖 Topshiriqni ochish</Button></div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {status === 'submitted' && <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">✅ Javob {fmtDateTime(sub.submitted_at)} da yuborilgan. Tekshirilgunicha qayta yuborishingiz mumkin.</div>}
              <Field label="Javob matni"><textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Javobingizni yozing..." /></Field>
              <Field label="Fayl yoki screenshot" hint="PDF, DOCX, PNG, JPG, ZIP ... (maks. 25 MB)">
                <input type="file" accept={ACCEPT} capture={undefined} className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              {sub?.file_name && <div className="text-xs text-slate-500">Yuborilgan fayl: <a className="text-brand-600" href={fileUrl('submission', sub.id)}>{sub.file_name}</a></div>}
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!!expired || (!text.trim() && !file)}>{expired ? 'Deadline o‘tgan' : '📤 Yuborish'}</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export function Tests() {
  const { data, loading, reload } = useFetch<any[]>('/s/tests');
  useSocketEvent('test:new', reload);
  const now = new Date();
  return (
    <div>
      <PageHeader title={t('nav_tests')} />
      {loading ? <Spinner /> : !data?.length ? <Card><Empty icon="🧪" /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.map((q) => {
            const closed = q.closes_at && new Date(q.closes_at) < now;
            const notYet = q.opens_at && new Date(q.opens_at) > now;
            return (
              <Card key={q.id}>
                <div className="text-xs text-slate-500">{q.subject_name}</div>
                <div className="text-lg font-bold">{q.title}</div>
                <div className="mt-1 text-sm text-slate-500">{q.question_count} savol {q.time_limit_min && `· ${q.time_limit_min} daqiqa`}</div>
                {q.closes_at && <div className="text-xs text-slate-400">Yopiladi: {fmtDateTime(q.closes_at)}</div>}
                <div className="mt-3">
                  {q.finished_at ? <div className="flex items-center gap-2"><Badge color="green">Natija: {q.score}/{q.max_score}</Badge><Link to={`/student/tests/${q.id}`} className="text-sm text-brand-600">Ko‘rish</Link></div>
                    : closed && !q.started_at ? <Badge color="red">Yopilgan</Badge>
                    : notYet ? <Badge color="yellow">{fmtDateTime(q.opens_at)} da ochiladi</Badge>
                    : <Link to={`/student/tests/${q.id}`}><Button className="w-full">{q.started_at ? 'Davom ettirish' : '▶ Testni boshlash'}</Button></Link>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TestTake() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: list } = useFetch<any[]>('/s/tests');
  const info = list?.find((x) => x.id === id);
  const [test, setTest] = useState<any | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any | null>(null);
  const [review, setReview] = useState<any | null>(null);
  const [offset, setOffset] = useState(0);
  const { busy, run } = useAction();
  const left = useCountdown(test?.deadline ? new Date(test.deadline).getTime() : undefined, offset);

  useEffect(() => { if (info?.finished_at) api.get(`/s/tests/${id}/review`).then(setReview).catch(() => {}); }, [info?.finished_at, id]);
  const start = async () => { const r = await run(() => api.post(`/s/tests/${id}/start`)); if (r) { setTest(r); setOffset(r.serverNow - Date.now()); } };
  const submit = async (auto = false) => {
    if (!auto && Object.keys(answers).length < test.questions.length && !confirm('Barcha savollarga javob bermadingiz. Yakunlaysizmi?')) return;
    const r = await run(() => api.post(`/s/tests/${id}/submit`, { answers }));
    if (r) setResult(r);
  };
  useEffect(() => { if (test?.deadline && left === 0 && !result && !busy) submit(true); }, [left]); // eslint-disable-line

  if (!list) return <Spinner />;
  if (!info) return <Card><Empty text="Test topilmadi" /></Card>;
  if (result) return (
    <Card><div className="py-10 text-center"><div className="text-5xl">🎉</div><div className="mt-3 text-lg">Test yakunlandi</div>
      <div className="text-5xl font-black text-brand-700">{result.score}/{result.max_score}</div>
      <Button className="mt-6" onClick={() => nav('/student/tests')}>Testlarga qaytish</Button></div></Card>
  );
  if (review) return (
    <div>
      <PageHeader title={review.title} subtitle={`Natija: ${review.score}/${review.max_score}`} />
      {!review.showCorrect && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">To‘g‘ri javoblar test yopilgandan keyin ko‘rsatiladi.</div>}
      <div className="space-y-3">{review.questions.map((q: any) => (
        <Card key={q.position}><div className="font-medium">{q.position}. {q.text}</div>
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{['A', 'B', 'C', 'D'].map((k) => q[`option_${k.toLowerCase()}`] && (
            <div key={k} className={`rounded px-2 py-1 text-sm ${q.correct === k ? 'bg-emerald-100 font-semibold' : q.answer === k ? 'bg-rose-100' : 'bg-slate-50'}`}>{k}) {q[`option_${k.toLowerCase()}`]} {q.answer === k && '← siz'}</div>
          ))}</div></Card>
      ))}</div>
    </div>
  );
  if (!test) return (
    <Card><div className="py-10 text-center">
      <div className="text-4xl">🧪</div><div className="mt-2 text-xl font-bold">{info.title}</div>
      <div className="mt-1 text-slate-500">{info.question_count} savol {info.time_limit_min && `· ${info.time_limit_min} daqiqa`}</div>
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">Boshlaganingizdan keyin vaqt hisoblana boshlaydi. Vaqt tugaganda javoblar avtomatik yuboriladi.</p>
      <Button size="lg" className="mt-5" onClick={start} loading={busy}>▶ Boshlash</Button>
    </div></Card>
  );
  const done = Object.keys(answers).length;
  return (
    <div>
      <div className="sticky top-14 z-10 -mx-4 mb-4 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="min-w-0 flex-1"><div className="truncate font-semibold">{test.title}</div><div className="text-xs text-slate-500">{done}/{test.questions.length} javob</div></div>
        {test.deadline && <div className={`font-mono text-xl font-bold ${left < 60 ? 'text-rose-600' : 'text-slate-800'}`}>⏱ {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</div>}
        <Button onClick={() => submit()} loading={busy}>Yakunlash</Button>
      </div>
      <div className="space-y-4">
        {test.questions.map((q: any, i: number) => (
          <Card key={q.id}>
            <div className="mb-3 font-medium">{i + 1}. {q.text} <span className="text-xs text-slate-400">({q.points} ball)</span></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {['A', 'B', 'C', 'D'].map((k) => q[`option_${k.toLowerCase()}`] && (
                <button key={k} onClick={() => setAnswers({ ...answers, [q.id]: k })}
                  className={`rounded-lg border-2 px-4 py-3 text-left text-sm transition ${answers[q.id] === k ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-slate-200 hover:border-slate-300'}`}>
                  <b>{k})</b> {q[`option_${k.toLowerCase()}`]}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
