import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, SubjectGroupPicker, Table, useAction, useFetch } from '../../components/ui';
import { fmtDate, t } from '../../i18n';

// ============================ DAVOMAT VARAG'I (qayta ishlatiladi) ============================
export function AttendanceSheet({ lessonId, attendanceId, groupId, subjectId, onSaved }:
  { lessonId?: string; attendanceId?: string; groupId?: string; subjectId?: string; onSaved?: () => void }) {
  const { data, loading } = useFetch<any>(`/t/attendance/sheet${qs({ lesson_id: lessonId, attendance_id: attendanceId, group_id: groupId })}`);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { busy, run } = useAction();
  useEffect(() => {
    if (data) setMarks(Object.fromEntries(data.students.map((s: any) => [s.student_id, s.status ?? 'present'])));
  }, [data]);
  if (loading || !data) return <Spinner />;
  const counts = { present: 0, late: 0, absent: 0 } as Record<string, number>;
  Object.values(marks).forEach((v) => counts[v]++);
  const save = async () => {
    const records = Object.entries(marks).map(([student_id, status]) => ({ student_id, status }));
    const r = await run(() => (attendanceId
      ? api.put(`/t/attendance/${attendanceId}`, { records })
      : api.post('/t/attendance', lessonId ? { lesson_id: lessonId, records } : { subject_id: subjectId, group_id: groupId, date, records })), 'Davomat saqlandi');
    if (r) onSaved?.();
  };
  const setAll = (st: string) => setMarks(Object.fromEntries(Object.keys(marks).map((k) => [k, st])));
  const btn = (sid: string, st: string, label: string, cls: string) => (
    <button type="button" onClick={() => setMarks({ ...marks, [sid]: st })}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${marks[sid] === st ? cls : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{label}</button>
  );
  return (
    <div className="space-y-3">
      {!lessonId && !attendanceId && <Field label={t('date')}><input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge color="green">✓ {counts.present}</Badge><Badge color="yellow">⏱ {counts.late}</Badge><Badge color="red">✕ {counts.absent}</Badge>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setAll('present')}>Hammasi keldi</Button>
      </div>
      {!data.students.length ? <Empty text="Guruhda talaba yo‘q" /> : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {data.students.map((s: any, i: number) => (
            <div key={s.student_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-6 text-xs text-slate-400">{i + 1}</span>
              <span className="min-w-[160px] flex-1 text-sm font-medium">{s.full_name}</span>
              <div className="flex gap-1">
                {btn(s.student_id, 'present', t('present'), 'bg-emerald-600 text-white')}
                {btn(s.student_id, 'late', t('late'), 'bg-amber-500 text-white')}
                {btn(s.student_id, 'absent', t('absent'), 'bg-rose-600 text-white')}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end"><Button onClick={save} loading={busy} disabled={!data.students.length}>💾 {t('save')}</Button></div>
    </div>
  );
}

export function Attendance() {
  const [sp, setSp] = useSearchParams();
  const subjectId = sp.get('subject_id') ?? '', groupId = sp.get('group_id') ?? '';
  const { data, loading, reload } = useFetch<any[]>(`/t/attendance${qs({ subject_id: subjectId, group_id: groupId })}`);
  const [sheet, setSheet] = useState<any | null>(null);
  const { run } = useAction();
  const del = async (a: any) => { if (confirm(t('confirm_delete')) && await run(() => api.del(`/t/attendance/${a.id}`))) reload(); };
  return (
    <div>
      <PageHeader title={t('nav_attendance')} subtitle="Davomat tarixi. Jonli dars ichida ham belgilash mumkin."
        actions={<Button disabled={!subjectId || !groupId} onClick={() => setSheet({ new: true })}>+ Davomat olish</Button>} />
      <Card>
        <div className="mb-4"><SubjectGroupPicker subjectId={subjectId} groupId={groupId} requireBoth={false} onChange={(s, g) => setSp(Object.fromEntries(Object.entries({ subject_id: s, group_id: g }).filter(([, v]) => v)))} /></div>
        {loading ? <Spinner /> : (
          <Table head={[t('date'), t('subject'), t('group'), t('present'), t('late'), t('absent'), '%', '']} empty={!data?.length}>
            {data?.map((a) => {
              const tot = a.present + a.late + a.absent;
              return (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{fmtDate(a.date)} {a.lesson_id && <Badge color="purple">jonli</Badge>}</td>
                  <td className="td">{a.subject_name}</td><td className="td">{a.group_name}</td>
                  <td className="td text-emerald-700">{a.present}</td><td className="td text-amber-600">{a.late}</td><td className="td text-rose-600">{a.absent}</td>
                  <td className="td font-semibold">{tot ? Math.round((100 * (a.present + a.late)) / tot) : 0}%</td>
                  <td className="td whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSheet(a)}>✏️</Button>
                    <Button size="sm" variant="ghost" onClick={() => del(a)}>🗑</Button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Modal open={!!sheet} onClose={() => setSheet(null)} title="Davomat" wide>
        {sheet && <AttendanceSheet attendanceId={sheet.new ? undefined : sheet.id} groupId={sheet.new ? groupId : undefined} subjectId={subjectId}
          onSaved={() => { setSheet(null); reload(); }} />}
      </Modal>
    </div>
  );
}

// ============================ BAHOLAR ============================
export function GradeForm({ students, subjectId, lessonId, presetStudent, onSaved }:
  { students: any[]; subjectId: string; lessonId?: string; presetStudent?: string; onSaved: () => void }) {
  const { data: cats } = useFetch<any[]>('/t/grade-categories');
  const [studentId, setStudentId] = useState(presetStudent ?? '');
  const [rows, setRows] = useState<{ category_id: string; score: string; max_score: string; comment: string }[]>([{ category_id: '', score: '', max_score: '', comment: '' }]);
  const { busy, run } = useAction();
  const upd = (i: number, k: string, v: string) => setRows(rows.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: v };
    if (k === 'category_id') n.max_score = String(cats?.find((c) => c.id === v)?.default_max ?? '');
    return n;
  }));
  const save = async () => {
    const items = rows.filter((r) => r.category_id && r.score !== '').map((r) => ({ ...r, student_id: studentId, subject_id: subjectId, lesson_id: lessonId ?? null }));
    if (!items.length) return;
    if (await run(() => api.post('/t/grades', { items }), 'Baho saqlandi')) onSaved();
  };
  return (
    <div className="space-y-4">
      <Field label={t('student')}>
        <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">{t('select')}</option>{students.map((s) => <option key={s.id ?? s.student_id} value={s.id ?? s.student_id}>{s.full_name}</option>)}
        </select>
      </Field>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_80px_80px] gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_80px_80px_1fr]">
          <select className="input" value={r.category_id} onChange={(e) => upd(i, 'category_id', e.target.value)}>
            <option value="">Kategoriya</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" type="number" step="0.5" min={0} placeholder="Ball" value={r.score} onChange={(e) => upd(i, 'score', e.target.value)} />
          <input className="input" type="number" step="0.5" min={0.5} placeholder="Max" value={r.max_score} onChange={(e) => upd(i, 'max_score', e.target.value)} />
          <input className="input col-span-3 sm:col-span-1" placeholder={t('comment')} value={r.comment} onChange={(e) => upd(i, 'comment', e.target.value)} />
        </div>
      ))}
      <div className="flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => setRows([...rows, { category_id: '', score: '', max_score: '', comment: '' }])}>+ Yana kategoriya</Button>
        <Button onClick={save} loading={busy} disabled={!studentId}>💾 Save Grade</Button>
      </div>
    </div>
  );
}

function BulkGrade({ students, subjectId, onSaved }: { students: any[]; subjectId: string; onSaved: () => void }) {
  const { data: cats } = useFetch<any[]>('/t/grade-categories');
  const [cat, setCat] = useState('');
  const [max, setMax] = useState('');
  const [comment, setComment] = useState('');
  const [scores, setScores] = useState<Record<string, string>>({});
  const { busy, run } = useAction();
  const save = async () => {
    const items = Object.entries(scores).filter(([, v]) => v !== '').map(([student_id, score]) => ({ student_id, subject_id: subjectId, category_id: cat, score, max_score: max, comment }));
    if (!items.length) return;
    if (await run(() => api.post('/t/grades', { items }), `${items.length} ta baho saqlandi`)) onSaved();
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setMax(String(cats?.find((c) => c.id === e.target.value)?.default_max ?? '')); }}>
          <option value="">Kategoriya</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" type="number" placeholder="Max ball" value={max} onChange={(e) => setMax(e.target.value)} />
        <input className="input" placeholder={t('comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>
      <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {students.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-1.5">
            <span className="flex-1 text-sm">{s.full_name}</span>
            <input className="input w-24" type="number" step="0.5" min={0} max={max || undefined} value={scores[s.id] ?? ''} onChange={(e) => setScores({ ...scores, [s.id]: e.target.value })} />
          </div>
        ))}
      </div>
      <div className="flex justify-end"><Button onClick={save} loading={busy} disabled={!cat || !max}>💾 {t('save')}</Button></div>
    </div>
  );
}

export function Grades() {
  const [sp, setSp] = useSearchParams();
  const subjectId = sp.get('subject_id') ?? '', groupId = sp.get('group_id') ?? '';
  const { data, loading, reload } = useFetch<any>(subjectId && groupId ? `/t/grades${qs({ subject_id: subjectId, group_id: groupId })}` : null);
  const [modal, setModal] = useState<'one' | 'bulk' | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const { busy, run } = useAction();
  const cats: any[] = data?.categories ?? [];
  const usedCats = cats.filter((c) => data?.grades.some((g: any) => g.category_id === c.id));

  const saveEdit = async () => {
    if (await run(() => api.put(`/t/grades/${edit.id}`, { score: edit.score, comment: edit.comment }), t('saved'))) { setEdit(null); reload(); }
  };
  const delGrade = async () => {
    if (confirm(t('confirm_delete')) && await run(() => api.del(`/t/grades/${edit.id}`))) { setEdit(null); reload(); }
  };

  return (
    <div>
      <PageHeader title={t('nav_grades')} subtitle="Fan va guruh bo‘yicha baholar jurnali"
        actions={subjectId && groupId ? <>
          <Button variant="secondary" onClick={() => setModal('bulk')}>Ustun bo‘yicha baho</Button>
          <Button onClick={() => setModal('one')}>+ Baho qo‘yish</Button>
        </> : null} />
      <Card>
        <div className="mb-4"><SubjectGroupPicker subjectId={subjectId} groupId={groupId} onChange={(s, g) => setSp(Object.fromEntries(Object.entries({ subject_id: s, group_id: g }).filter(([, v]) => v)))} /></div>
        {!subjectId || !groupId ? <Empty text="Guruh va fanni tanlang" icon="📊" /> : loading || !data ? <Spinner /> : (
          <Table head={['#', 'Talaba', ...usedCats.map((c) => c.name), 'Jami', '%']} empty={!data.students.length}>
            {data.students.map((s: any, i: number) => {
              const gs = data.grades.filter((g: any) => g.student_id === s.id);
              const sum = gs.reduce((a: number, g: any) => a + g.score, 0), mx = gs.reduce((a: number, g: any) => a + g.max_score, 0);
              const p = mx ? Math.round((100 * sum) / mx) : null;
              return (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td text-xs text-slate-400">{i + 1}</td>
                  <td className="td whitespace-nowrap font-medium">{s.full_name}</td>
                  {usedCats.map((c) => (
                    <td key={c.id} className="td">
                      <div className="flex flex-wrap gap-1">
                        {gs.filter((g: any) => g.category_id === c.id).map((g: any) => (
                          <button key={g.id} title={`${g.comment ?? ''} · ${fmtDate(g.created_at)}`} onClick={() => setEdit({ ...g, comment: g.comment ?? '' })}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-brand-100">{g.score}/{g.max_score}</button>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="td whitespace-nowrap font-semibold">{mx ? `${sum}/${mx}` : '—'}</td>
                  <td className="td"><Badge color={p === null ? 'gray' : p >= 86 ? 'green' : p >= 71 ? 'blue' : p >= 56 ? 'yellow' : 'red'}>{p === null ? '—' : `${p}%`}</Badge></td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      <Modal open={modal === 'one'} onClose={() => setModal(null)} title="Baho qo‘yish" wide>
        {data && <GradeForm students={data.students} subjectId={subjectId} onSaved={() => { setModal(null); reload(); }} />}
      </Modal>
      <Modal open={modal === 'bulk'} onClose={() => setModal(null)} title="Butun guruhga baho qo‘yish" wide>
        {data && <BulkGrade students={data.students} subjectId={subjectId} onSaved={() => { setModal(null); reload(); }} />}
      </Modal>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Baho: ${edit?.category_name ?? ''}`}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Ball (max ${edit.max_score})`}><input className="input" type="number" step="0.5" value={edit.score} onChange={(e) => setEdit({ ...edit, score: e.target.value })} /></Field>
              <Field label={t('date')}><input className="input" disabled value={fmtDate(edit.created_at)} /></Field>
            </div>
            <Field label={t('comment')}><input className="input" value={edit.comment} onChange={(e) => setEdit({ ...edit, comment: e.target.value })} /></Field>
            <div className="flex justify-between"><Button variant="danger" onClick={delGrade}>{t('delete')}</Button><Button onClick={saveEdit} loading={busy}>{t('save')}</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
