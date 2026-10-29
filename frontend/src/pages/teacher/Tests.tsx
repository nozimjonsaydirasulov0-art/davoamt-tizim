import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Table, Tabs, useAction, useFetch } from '../../components/ui';
import { fmtDateTime, t } from '../../i18n';

export function Tests() {
  const [tab, setTab] = useState('all');
  const { data, loading } = useFetch<any[]>(`/t/quizzes${tab === 'all' ? '' : `?mode=${tab}`}`);
  return (
    <div>
      <PageHeader title={t('nav_tests')} subtitle="Jonli quizlar (Kahoot uslubi) va mustaqil testlar" actions={<Link to="/teacher/tests/new"><Button>+ Yangi test / quiz</Button></Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'all', label: 'Barchasi' }, { key: 'live', label: '⚡ Jonli quiz' }, { key: 'test', label: '🧪 Mustaqil test' }]} />
      <Card>
        {loading ? <Spinner /> : (
          <Table head={[t('title'), t('subject'), 'Tur', 'Savollar', 'Urinishlar', 'Holat', '']} empty={!data?.length}>
            {data?.map((q) => (
              <tr key={q.id} className="hover:bg-slate-50">
                <td className="td"><Link className="font-medium text-brand-700 hover:underline" to={`/teacher/tests/${q.id}`}>{q.title}</Link><div className="font-mono text-xs text-slate-400">{q.public_id}</div></td>
                <td className="td">{q.subject_name}</td>
                <td className="td">{q.mode === 'live' ? <Badge color="purple">⚡ Jonli</Badge> : <Badge color="blue">🧪 Test</Badge>}</td>
                <td className="td">{q.question_count}</td><td className="td">{q.attempt_count}</td>
                <td className="td">{q.mode === 'test' ? (q.is_published ? <Badge color="green">{q.group_name} uchun ochiq</Badge> : <Badge>qoralama</Badge>) : <span className="text-xs text-slate-400">darsda boshlanadi</span>}</td>
                <td className="td text-right"><Link to={`/teacher/tests/${q.id}`}><Button size="sm" variant="secondary">Ochish</Button></Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

const blankQ = () => ({ text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct: 'A', time_sec: 20, points: 1 });

export function QuizEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: subjects } = useFetch<any[]>('/t/subjects');
  const { data: existing } = useFetch<any>(id ? `/t/quizzes/${id}` : null);
  const [quiz, setQuiz] = useState<any>({ title: '', subject_id: '', mode: 'live', questions: [blankQ()] });
  const { busy, run } = useAction();
  useEffect(() => {
    if (existing) setQuiz({ title: existing.title, subject_id: existing.subject_id, mode: existing.mode,
      questions: existing.questions.map((q: any) => ({ ...blankQ(), ...q, option_c: q.option_c ?? '', option_d: q.option_d ?? '' })) });
  }, [existing]);
  const upd = (i: number, k: string, v: any) => setQuiz({ ...quiz, questions: quiz.questions.map((q: any, j: number) => (j === i ? { ...q, [k]: v } : q)) });
  const save = async () => {
    const r = await run(() => (id ? api.put(`/t/quizzes/${id}`, quiz) : api.post('/t/quizzes', quiz)), t('saved'));
    if (r) nav(`/teacher/tests/${id ?? r.id}`);
  };
  return (
    <div>
      <PageHeader title={id ? 'Testni tahrirlash' : 'Yangi test / quiz'} actions={<Button onClick={save} loading={busy}>💾 {t('save')}</Button>} />
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('title')}><input className="input" value={quiz.title} onChange={(e) => setQuiz({ ...quiz, title: e.target.value })} placeholder="Tarmoq asoslari — quiz" /></Field>
          <Field label={t('subject')}>
            <select className="input" value={quiz.subject_id} onChange={(e) => setQuiz({ ...quiz, subject_id: e.target.value })}>
              <option value="">{t('select')}</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Tur">
            <select className="input" value={quiz.mode} onChange={(e) => setQuiz({ ...quiz, mode: e.target.value })}>
              <option value="live">⚡ Jonli quiz (darsda, hamma bir vaqtda)</option>
              <option value="test">🧪 Mustaqil test (talaba o‘zi ishlaydi)</option>
            </select>
          </Field>
        </div>
      </Card>
      <div className="space-y-4">
        {quiz.questions.map((q: any, i: number) => (
          <Card key={i} title={`Savol ${i + 1}`} actions={quiz.questions.length > 1 && <Button size="sm" variant="ghost" onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_: any, j: number) => j !== i) })}>🗑</Button>}>
            <div className="space-y-3">
              <textarea className="input" rows={2} placeholder="Savol matni" value={q.text} onChange={(e) => upd(i, 'text', e.target.value)} />
              <div className="grid gap-2 sm:grid-cols-2">
                {(['a', 'b', 'c', 'd'] as const).map((k, ki) => (
                  <label key={k} className={`flex items-center gap-2 rounded-lg border-2 p-1.5 pl-3 ${q.correct === k.toUpperCase() ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                    <input type="radio" name={`c${i}`} checked={q.correct === k.toUpperCase()} onChange={() => upd(i, 'correct', k.toUpperCase())} />
                    <span className={`flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-white ${['bg-rose-500', 'bg-sky-500', 'bg-amber-500', 'bg-emerald-600'][ki]}`}>{k.toUpperCase()}</span>
                    <input className="flex-1 bg-transparent px-1 py-1 text-sm outline-none" placeholder={ki < 2 ? `Variant ${k.toUpperCase()}` : `Variant ${k.toUpperCase()} (ixtiyoriy)`} value={q[`option_${k}`]} onChange={(e) => upd(i, `option_${k}`, e.target.value)} />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Field label="Vaqt (soniya)"><input className="input w-28" type="number" min={5} max={600} value={q.time_sec} onChange={(e) => upd(i, 'time_sec', Number(e.target.value))} /></Field>
                <Field label="Ball"><input className="input w-24" type="number" min={0.5} step="0.5" value={q.points} onChange={(e) => upd(i, 'points', Number(e.target.value))} /></Field>
              </div>
            </div>
          </Card>
        ))}
        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, blankQ()] })}>+ Savol qo‘shish</Button>
          <Button onClick={save} loading={busy}>💾 {t('save')}</Button>
        </div>
      </div>
    </div>
  );
}

export function QuizDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: q, loading, reload } = useFetch<any>(`/t/quizzes/${id}`);
  const { data: groups } = useFetch<any[]>('/t/groups');
  const [pub, setPub] = useState<any | null>(null);
  const { busy, run } = useAction();
  if (loading || !q) return <Spinner />;
  const eligible = groups?.filter((g) => g.subjects.some((s: any) => s.id === q.subject_id)) ?? [];
  const publish = async () => {
    const body = { ...pub, opens_at: pub.opens_at ? new Date(pub.opens_at).toISOString() : null, closes_at: pub.closes_at ? new Date(pub.closes_at).toISOString() : null, time_limit_min: pub.time_limit_min || null };
    if (await run(() => api.post(`/t/quizzes/${id}/publish`, body), 'Test guruhga ochildi')) { setPub(null); reload(); }
  };
  const copy = async () => { const r = await run(() => api.post(`/t/quizzes/${id}/copy`)); if (r) nav(`/teacher/tests/${r.id}/edit`); };
  const del = async () => { if (confirm(t('confirm_delete')) && await run(() => api.del(`/t/quizzes/${id}`))) nav('/teacher/tests'); };
  return (
    <div>
      <PageHeader title={q.title} subtitle={`${q.mode === 'live' ? '⚡ Jonli quiz' : '🧪 Mustaqil test'} · ${q.questions.length} savol · ${q.public_id}`}
        actions={<>
          {!q.attempts.length && <Link to={`/teacher/tests/${id}/edit`}><Button variant="secondary">✏️ {t('edit')}</Button></Link>}
          <Button variant="secondary" onClick={copy}>📋 Nusxa</Button>
          {q.mode === 'test' && (q.is_published
            ? <Button variant="warning" onClick={async () => { await api.post(`/t/quizzes/${id}/unpublish`); reload(); }}>Yopish</Button>
            : <Button onClick={() => setPub({ group_id: '', opens_at: '', closes_at: '', time_limit_min: 20 })}>🚀 Guruhga ochish</Button>)}
          <Button variant="ghost" onClick={del}>🗑</Button>
        </>} />
      {q.mode === 'live' && <div className="mb-4 rounded-lg bg-violet-50 p-3 text-sm text-violet-800">⚡ Jonli quiz <b>Jonli dars</b> sahifasidan “Quiz” tugmasi orqali boshlanadi.</div>}
      {q.mode === 'test' && q.is_published && <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Ochiq: {q.opens_at ? fmtDateTime(q.opens_at) : 'hozirdan'} → {q.closes_at ? fmtDateTime(q.closes_at) : 'muddatsiz'} · vaqt limiti: {q.time_limit_min ?? '—'} daqiqa</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Savollar">
          <ol className="space-y-3">
            {q.questions.map((x: any) => (
              <li key={x.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium">{x.position}. {x.text}</div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                  {['A', 'B', 'C', 'D'].map((k) => x[`option_${k.toLowerCase()}`] && (
                    <div key={k} className={x.correct === k ? 'font-bold text-emerald-700' : 'text-slate-500'}>{k}) {x[`option_${k.toLowerCase()}`]} {x.correct === k && '✓'}</div>
                  ))}
                </div>
                <div className="mt-1 text-xs text-slate-400">⏱ {x.time_sec}s · {x.points} ball</div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title={`Natijalar (${q.attempts.length})`}>
          <Table head={['Talaba', t('group'), t('score'), 'Vaqt']} empty={!q.attempts.length}>
            {q.attempts.map((a: any) => (
              <tr key={a.id}><td className="td font-medium">{a.full_name}</td><td className="td">{a.group_name}</td>
                <td className="td font-semibold">{a.finished_at ? `${a.score}/${a.max_score}` : <Badge color="yellow">ishlamoqda</Badge>}</td>
                <td className="td text-xs">{fmtDateTime(a.finished_at ?? a.started_at)} {a.lesson_id && <Badge color="purple">jonli</Badge>}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
      <Modal open={!!pub} onClose={() => setPub(null)} title="Testni guruhga ochish">
        {pub && (
          <div className="space-y-4">
            <Field label={t('group')} hint={!eligible.length ? 'Bu fan hech qaysi guruhga biriktirilmagan' : undefined}>
              <select className="input" value={pub.group_id} onChange={(e) => setPub({ ...pub, group_id: e.target.value })}>
                <option value="">{t('select')}</option>{eligible.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ochiladi"><input className="input" type="datetime-local" value={pub.opens_at} onChange={(e) => setPub({ ...pub, opens_at: e.target.value })} /></Field>
              <Field label="Yopiladi"><input className="input" type="datetime-local" value={pub.closes_at} onChange={(e) => setPub({ ...pub, closes_at: e.target.value })} /></Field>
            </div>
            <Field label="Vaqt limiti (daqiqa)"><input className="input w-32" type="number" min={1} value={pub.time_limit_min} onChange={(e) => setPub({ ...pub, time_limit_min: e.target.value })} /></Field>
            <div className="flex justify-end"><Button onClick={publish} loading={busy} disabled={!pub.group_id}>🚀 Ochish</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export { Empty };
