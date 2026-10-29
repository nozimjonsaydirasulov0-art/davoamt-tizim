import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl, qs } from '../../api';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, StatusBadge, SubjectGroupPicker, Table, useAction, useFetch } from '../../components/ui';
import { fmtDateTime, fmtSize, t } from '../../i18n';
import { useSocketEvent } from '../../socket';

export const ACCEPT = '.pdf,.docx,.pptx,.xlsx,.doc,.ppt,.xls,.png,.jpg,.jpeg,.zip,.txt';
export const fileIcon = (m?: string) => (!m ? '📄' : m.includes('pdf') ? '📕' : m.includes('image') ? '🖼' : m.includes('zip') ? '🗜' : m.includes('sheet') || m.includes('excel') ? '📗' : m.includes('presentation') || m.includes('powerpoint') ? '📙' : '📘');
export const canInline = (m?: string) => !!m && (m.includes('pdf') || m.includes('image'));

// ---------------- Material yuklash formasi (Jonli darsda ham ishlatiladi) ----------------
export function MaterialForm({ lessonId, onSaved }: { lessonId?: string; onSaved: () => void }) {
  const [subjectId, setS] = useState(''); const [groupId, setG] = useState('');
  const [title, setTitle] = useState(''); const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('title', title || file.name.replace(/\.[^.]+$/, ''));
    if (lessonId) fd.append('lesson_id', lessonId); else { fd.append('subject_id', subjectId); fd.append('group_id', groupId); }
    fd.append('file', file);
    if (await run(() => api.upload('/t/materials', fd), 'Material yuborildi')) onSaved();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {!lessonId && <SubjectGroupPicker subjectId={subjectId} groupId={groupId} onChange={(s, g) => { setS(s); setG(g); }} />}
      <Field label={t('title')}><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bugungi amaliy ish" /></Field>
      <Field label={t('file')} hint="PDF, DOCX, PPTX, XLSX, PNG, JPG, ZIP · maks. 25 MB">
        <input type="file" required accept={ACCEPT} className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
      <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!file || (!lessonId && (!subjectId || !groupId))}>📤 Yuklash va yuborish</Button></div>
    </form>
  );
}

export function Materials() {
  const [subjectId, setS] = useState(''); const [groupId, setG] = useState('');
  const { data, loading, reload } = useFetch<any[]>(`/t/materials${qs({ subject_id: subjectId, group_id: groupId })}`);
  const [open, setOpen] = useState(false);
  const { run } = useAction();
  const del = async (m: any) => { if (confirm(t('confirm_delete')) && await run(() => api.del(`/t/materials/${m.id}`))) reload(); };
  return (
    <div>
      <PageHeader title={t('nav_materials')} subtitle="Guruhlarga yuborilgan fayllar" actions={<Button onClick={() => setOpen(true)}>+ Fayl yuklash</Button>} />
      <Card>
        <div className="mb-4"><SubjectGroupPicker subjectId={subjectId} groupId={groupId} requireBoth={false} onChange={(s, g) => { setS(s); setG(g); }} /></div>
        {loading ? <Spinner /> : (
          <Table head={['', t('title'), t('subject'), t('group'), 'Hajm', t('date'), '']} empty={!data?.length}>
            {data?.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="td text-xl">{fileIcon(m.mime_type)}</td>
                <td className="td"><div className="font-medium">{m.title}</div><div className="text-xs text-slate-400">{m.file_name}</div></td>
                <td className="td">{m.subject_name}</td><td className="td"><Badge color="blue">{m.group_name}</Badge> {m.lesson_id && <Badge color="purple">darsda</Badge>}</td>
                <td className="td text-xs">{fmtSize(m.file_size)}</td><td className="td text-xs">{fmtDateTime(m.created_at)}</td>
                <td className="td whitespace-nowrap text-right">
                  {canInline(m.mime_type) && <a href={fileUrl('material', m.id, true)} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost">👁</Button></a>}
                  <a href={fileUrl('material', m.id)}><Button size="sm" variant="ghost">⬇</Button></a>
                  <Button size="sm" variant="ghost" onClick={() => del(m)}>🗑</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Material yuklash"><MaterialForm onSaved={() => { setOpen(false); reload(); }} /></Modal>
    </div>
  );
}

// ---------------- Topshiriq yaratish formasi ----------------
export function AssignmentForm({ lessonId, onSaved }: { lessonId?: string; onSaved: (a: any) => void }) {
  const [subjectId, setS] = useState(''); const [groupId, setG] = useState('');
  const defDeadline = (() => { const d = new Date(Date.now() + 60 * 60_000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })();
  const [f, setF] = useState({ title: '', description: '', deadline: defDeadline, max_score: '10' });
  const [file, setFile] = useState<File | null>(null);
  const { busy, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('title', f.title); fd.append('description', f.description); fd.append('max_score', f.max_score);
    if (f.deadline) fd.append('deadline', new Date(f.deadline).toISOString());
    if (lessonId) fd.append('lesson_id', lessonId); else { fd.append('subject_id', subjectId); fd.append('group_id', groupId); }
    if (file) fd.append('file', file);
    const r = await run(() => api.upload('/t/assignments', fd), 'Topshiriq yuborildi');
    if (r) onSaved(r);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {!lessonId && <SubjectGroupPicker subjectId={subjectId} groupId={groupId} onChange={(s, g) => { setS(s); setG(g); }} />}
      <Field label="Topshiriq"><input className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Windows Task Manager yordamida processlarni tahlil qiling" /></Field>
      <Field label="Batafsil tavsif"><textarea className="input" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('deadline')}><input className="input" type="datetime-local" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
        <Field label="Maks. ball"><input className="input" type="number" min={1} step="0.5" value={f.max_score} onChange={(e) => setF({ ...f, max_score: e.target.value })} /></Field>
      </div>
      <Field label="Fayl (ixtiyoriy)"><input type="file" accept={ACCEPT} className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!lessonId && (!subjectId || !groupId)}>📤 Topshiriqni yuborish</Button></div>
    </form>
  );
}

export function Assignments() {
  const { data, loading, reload } = useFetch<any[]>('/t/assignments');
  const [open, setOpen] = useState(false);
  useSocketEvent('submission:update', reload);
  return (
    <div>
      <PageHeader title={t('nav_assignments')} subtitle="Amaliy topshiriqlar va talabalar javoblari" actions={<Button onClick={() => setOpen(true)}>+ Amaliy topshiriq</Button>} />
      <Card>
        {loading ? <Spinner /> : (
          <Table head={['Topshiriq', t('subject'), t('group'), t('deadline'), 'Topshirgan', 'Tekshirish', '']} empty={!data?.length}>
            {data?.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="td"><Link to={`/teacher/assignments/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.title}</Link><div className="font-mono text-xs text-slate-400">{a.public_id}</div></td>
                <td className="td">{a.subject_name}</td><td className="td"><Badge color="blue">{a.group_name}</Badge></td>
                <td className="td text-xs">{fmtDateTime(a.deadline)} {a.deadline && new Date(a.deadline) < new Date() && <Badge color="red">tugagan</Badge>}</td>
                <td className="td"><div className="flex items-center gap-2"><div className="h-2 w-20 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${a.total ? (100 * a.submitted) / a.total : 0}%` }} /></div><span className="text-xs">{a.submitted}/{a.total}</span></div></td>
                <td className="td">{a.to_check > 0 ? <Badge color="yellow">{a.to_check} ta</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                <td className="td text-right"><Link to={`/teacher/assignments/${a.id}`}><Button size="sm" variant="secondary">Ochish</Button></Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Yangi amaliy topshiriq" wide><AssignmentForm onSaved={() => { setOpen(false); reload(); }} /></Modal>
    </div>
  );
}

export function SubmissionGrader({ sub, maxScore, onDone }: { sub: any; maxScore: number; onDone: () => void }) {
  const [score, setScore] = useState(String(sub.score ?? ''));
  const [feedback, setFeedback] = useState(sub.feedback ?? '');
  const { busy, run } = useAction();
  const save = async () => { if (await run(() => api.post(`/t/submissions/${sub.id}/grade`, { score, feedback }), 'Baholandi')) onDone(); };
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-50 p-4">
        <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Javob · {fmtDateTime(sub.submitted_at)}</div>
        {sub.text_answer ? <div className="whitespace-pre-wrap text-sm">{sub.text_answer}</div> : <div className="text-sm text-slate-400">Matn yo‘q</div>}
        {sub.file_name && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm">{fileIcon(sub.mime_type)} {sub.file_name}</span>
            {canInline(sub.mime_type) && <a href={fileUrl('submission', sub.id, true)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">{t('view')}</Button></a>}
            <a href={fileUrl('submission', sub.id)}><Button size="sm" variant="secondary">{t('download')}</Button></a>
          </div>
        )}
        {sub.mime_type?.includes('image') && <img src={fileUrl('submission', sub.id, true)} alt="screenshot" className="mt-3 max-h-80 rounded-lg border" />}
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-3">
        <Field label={`Ball / ${maxScore}`}><input className="input text-lg font-bold" type="number" step="0.5" min={0} max={maxScore} value={score} onChange={(e) => setScore(e.target.value)} /></Field>
        <Field label="Feedback"><input className="input" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Yaxshi bajarilgan." /></Field>
      </div>
      <div className="flex justify-end"><Button onClick={save} loading={busy} disabled={score === ''}>✓ Baholash</Button></div>
    </div>
  );
}

export function AssignmentDetail() {
  const { id } = useParams();
  const { data: a, loading, reload } = useFetch<any>(`/t/assignments/${id}`);
  const [sel, setSel] = useState<any | null>(null);
  useSocketEvent<any>('submission:update', (p) => p.assignment_id === id && reload());
  if (loading || !a) return <Spinner />;
  const c = (st: string) => a.submissions.filter((s: any) => s.status === st).length;
  return (
    <div>
      <PageHeader title={a.title} subtitle={`${a.subject_name} · ${a.group_name} · ${a.public_id}`}
        actions={<Button variant="secondary" onClick={async () => { if (confirm(t('confirm_delete'))) { await api.del(`/t/assignments/${id}`); history.back(); } }}>🗑 {t('delete')}</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Topshiriq" className="lg:col-span-1">
          <div className="space-y-2 text-sm">
            {a.description && <div className="whitespace-pre-wrap text-slate-700">{a.description}</div>}
            <div><span className="text-slate-500">Deadline:</span> <b>{fmtDateTime(a.deadline)}</b></div>
            <div><span className="text-slate-500">Maks. ball:</span> <b>{a.max_score}</b></div>
            {a.file_name && <a className="text-brand-600 hover:underline" href={fileUrl('assignment', a.id)}>{fileIcon(a.mime_type)} {a.file_name}</a>}
            <div className="flex flex-wrap gap-1 pt-2">
              <Badge color="gray">Boshlanmagan: {c('not_started')}</Badge><Badge color="yellow">Bajarmoqda: {c('working')}</Badge>
              <Badge color="blue">Topshirdi: {c('submitted')}</Badge><Badge color="green">Baholandi: {c('graded')}</Badge>
            </div>
          </div>
        </Card>
        <Card title="Talabalar holati" className="lg:col-span-2">
          <Table head={['Talaba', t('status'), 'Topshirilgan', t('score'), '']}>
            {a.submissions.map((s: any) => (
              <tr key={s.student_id} className="hover:bg-slate-50">
                <td className="td font-medium">{s.full_name}</td>
                <td className="td"><StatusBadge status={s.status} /></td>
                <td className="td text-xs">{fmtDateTime(s.submitted_at)}</td>
                <td className="td font-semibold">{s.score !== null ? `${s.score}/${a.max_score}` : '—'}</td>
                <td className="td text-right">{(s.status === 'submitted' || s.status === 'graded') && <Button size="sm" variant={s.status === 'submitted' ? 'primary' : 'secondary'} onClick={() => setSel(s)}>{s.status === 'submitted' ? 'Tekshirish' : 'Ko‘rish'}</Button>}</td>
              </tr>
            ))}
          </Table>
          {!a.submissions.length && <Empty />}
        </Card>
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel?.full_name} wide>
        {sel && <SubmissionGrader sub={sel} maxScore={a.max_score} onDone={() => { setSel(null); reload(); }} />}
      </Modal>
    </div>
  );
}
