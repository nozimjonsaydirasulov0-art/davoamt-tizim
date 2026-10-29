import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api';
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Table, Tabs, useAction, useFetch } from '../../components/ui';
import { fmtDate, fmtDateTime, t, WEEKDAYS } from '../../i18n';

// ============================ FANLAR ============================
const emptySubject = { name: '', code: '', semester: '', course: '', description: '' };
export function Subjects() {
  const { data, loading, reload } = useFetch<any[]>('/t/subjects');
  const [form, setForm] = useState<any | null>(null);
  const { busy, run } = useAction();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, semester: form.semester || null, course: form.course || null };
    const r = await run(() => (form.id ? api.put(`/t/subjects/${form.id}`, body) : api.post('/t/subjects', body)), t('saved'));
    if (r) { setForm(null); reload(); }
  };
  const del = async (s: any) => {
    if (!confirm(`"${s.name}" — ${t('confirm_delete')}\nBu fanga tegishli jadval, baho va materiallar ham o‘chadi.`)) return;
    if (await run(() => api.del(`/t/subjects/${s.id}`), 'O‘chirildi')) reload();
  };
  return (
    <div>
      <PageHeader title={t('nav_subjects')} subtitle="O‘qitiladigan fanlar ro‘yxati" actions={<Button onClick={() => setForm({ ...emptySubject })}>+ Yangi fan</Button>} />
      <Card>
        {loading ? <Spinner /> : (
          <Table head={['Kod', 'Fan nomi', t('semester'), t('course'), 'Guruhlar', 'ID', '']} empty={!data?.length}>
            {data?.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td font-mono text-xs font-semibold text-brand-700">{s.code}</td>
                <td className="td font-medium text-slate-900">{s.name}<div className="text-xs text-slate-400">{s.description}</div></td>
                <td className="td">{s.semester ?? '—'}</td>
                <td className="td">{s.course ?? '—'}</td>
                <td className="td"><div className="flex flex-wrap gap-1">{s.groups.map((g: any) => <Badge key={g.id} color="blue">{g.name}</Badge>)}{!s.groups.length && <span className="text-xs text-slate-400">biriktirilmagan</span>}</div></td>
                <td className="td font-mono text-xs text-slate-400">{s.public_id}</td>
                <td className="td whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...s, semester: s.semester ?? '', course: s.course ?? '', description: s.description ?? '' })}>✏️</Button>
                  <Button size="sm" variant="ghost" onClick={() => del(s)}>🗑</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Fanni tahrirlash' : 'Yangi fan'}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <Field label="Fan nomi"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tarmoq xavfsizligi va kiberxavfsizlik asoslari" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Fan kodi"><input className="input" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CYBER-101" /></Field>
              <Field label={t('semester')}><input className="input" type="number" min={1} max={12} value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} /></Field>
              <Field label={t('course')}><input className="input" type="number" min={1} max={6} value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></Field>
            </div>
            <Field label={t('comment')}><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>{t('cancel')}</Button><Button type="submit" loading={busy}>{t('save')}</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ============================ GURUHLAR ============================
const emptyGroup = { name: '', course: '', direction: 'Axborot xavfsizligi', academic_year: '2026/2027', note: '' };
export function GroupForm({ form, setForm, onSaved }: { form: any; setForm: (f: any) => void; onSaved: () => void }) {
  const { busy, run } = useAction();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, course: form.course || null };
    const r = await run(() => (form.id ? api.put(`/t/groups/${form.id}`, body) : api.post('/t/groups', body)), t('saved'));
    if (r) { setForm(null); onSaved(); }
  };
  return (
    <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Guruhni tahrirlash' : 'Yangi guruh'}>
      {form && (
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Guruh nomi"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="KX1-25" /></Field>
            <Field label={t('course')}><input className="input" type="number" min={1} max={6} value={form.course ?? ''} onChange={(e) => setForm({ ...form, course: e.target.value })} /></Field>
          </div>
          <Field label={t('direction')}><input className="input" value={form.direction ?? ''} onChange={(e) => setForm({ ...form, direction: e.target.value })} /></Field>
          <Field label="O‘quv yili"><input className="input" value={form.academic_year ?? ''} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="2026/2027" /></Field>
          <Field label={t('comment')}><textarea className="input" rows={2} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>{t('cancel')}</Button><Button type="submit" loading={busy}>{t('save')}</Button></div>
        </form>
      )}
    </Modal>
  );
}

export function Groups() {
  const { data, loading, reload } = useFetch<any[]>('/t/groups');
  const [form, setForm] = useState<any | null>(null);
  return (
    <div>
      <PageHeader title={t('nav_groups')} subtitle="Guruhlar va ularga biriktirilgan fanlar" actions={<Button onClick={() => setForm({ ...emptyGroup })}>+ Yangi guruh</Button>} />
      {loading ? <Spinner /> : !data?.length ? <Card><Empty /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((g) => (
            <Link key={g.id} to={`/teacher/groups/${g.id}`} className="card block p-5 transition hover:border-brand-300 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold text-slate-900">{g.name}</div>
                  <div className="text-sm text-slate-500">{g.direction} · {g.course ?? '—'}-kurs · {g.academic_year}</div>
                </div>
                <Badge color="blue">🎓 {g.student_count}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {g.subjects.map((s: any) => <Badge key={s.id} color="purple">{s.code}</Badge>)}
                {!g.subjects.length && <span className="text-xs text-slate-400">Fan biriktirilmagan</span>}
              </div>
              <div className="mt-3 font-mono text-xs text-slate-400">{g.public_id}</div>
            </Link>
          ))}
        </div>
      )}
      <GroupForm form={form} setForm={setForm} onSaved={reload} />
    </div>
  );
}

export function GroupDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: g, loading, reload } = useFetch<any>(`/t/groups/${id}`);
  const { data: allSubjects } = useFetch<any[]>('/t/subjects');
  const [tab, setTab] = useState('subjects');
  const [attach, setAttach] = useState<string[] | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const { busy, run } = useAction();
  if (loading || !g) return <Spinner />;
  const attachedIds = new Set(g.subjects.map((s: any) => s.id));
  const free = allSubjects?.filter((s) => !attachedIds.has(s.id)) ?? [];

  const doAttach = async () => {
    if (!attach?.length) return;
    if (await run(() => api.post(`/t/groups/${id}/subjects`, { subject_ids: attach }), 'Fanlar biriktirildi')) { setAttach(null); reload(); }
  };
  const detach = async (s: any) => {
    if (!confirm(`"${s.name}" fanini guruhdan ajratasizmi? Jadvaldagi darslar ham o‘chadi.`)) return;
    if (await run(() => api.del(`/t/groups/${id}/subjects/${s.id}`), 'Ajratildi')) reload();
  };
  const delGroup = async () => {
    if (!confirm(t('confirm_delete'))) return;
    if (await run(() => api.del(`/t/groups/${id}`), 'O‘chirildi')) nav('/teacher/groups');
  };

  return (
    <div>
      <PageHeader title={<>👥 {g.name}</>} subtitle={`${g.direction ?? ''} · ${g.course ?? '—'}-kurs · ${g.academic_year ?? ''} · ${g.public_id}`}
        actions={<>
          <Button variant="secondary" onClick={() => setForm(g)}>✏️ {t('edit')}</Button>
          <Button variant="secondary" onClick={delGroup}>🗑</Button>
        </>} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'subjects', label: `📚 Fanlar (${g.subjects.length})` },
        { key: 'students', label: `🎓 Talabalar (${g.students.length})` },
        { key: 'schedule', label: `📅 Jadval (${g.schedule.length})` },
      ]} />
      {tab === 'subjects' && (
        <Card title="Guruhga biriktirilgan fanlar" actions={<Button size="sm" onClick={() => setAttach([])}>+ Fan biriktirish</Button>}>
          {!g.subjects.length ? <Empty text="Fan biriktirilmagan" /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {g.subjects.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div><div className="font-semibold">{s.name}</div><div className="font-mono text-xs text-brand-600">{s.code}</div></div>
                  <div className="flex gap-1">
                    <Link to={`/teacher/reports?subject_id=${s.id}&group_id=${g.id}`}><Button size="sm" variant="ghost">📈</Button></Link>
                    <Button size="sm" variant="ghost" onClick={() => detach(s)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {tab === 'students' && (
        <Card title="Talabalar" actions={<Link to={`/teacher/students?group_id=${g.id}&new=1`}><Button size="sm">+ Talaba qo‘shish</Button></Link>}>
          <Table head={['', 'F.I.Sh.', 'Student ID', 'Login', 'Oxirgi kirish']} empty={!g.students.length}>
            {g.students.map((s: any) => (
              <tr key={s.id}>
                <td className="td"><span className={`inline-block h-2.5 w-2.5 rounded-full ${s.online ? 'bg-emerald-500' : 'bg-slate-300'}`} /></td>
                <td className="td font-medium">{s.full_name}</td>
                <td className="td font-mono text-xs">{s.public_id}</td>
                <td className="td font-mono text-xs">{s.username} {s.must_change_password && <Badge color="yellow">vaqtinchalik parol</Badge>}</td>
                <td className="td text-xs text-slate-500">{fmtDateTime(s.last_login_at)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      {tab === 'schedule' && (
        <Card title="Haftalik jadval" actions={<Link to="/teacher/schedule"><Button size="sm" variant="secondary">Jadvalni boshqarish</Button></Link>}>
          <Table head={['Kun', 'Vaqt', 'Fan', 'Xona']} empty={!g.schedule.length}>
            {g.schedule.map((s: any) => (
              <tr key={s.id}><td className="td">{WEEKDAYS()[s.weekday - 1]}</td><td className="td">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</td><td className="td">{s.subject_name}</td><td className="td">{s.room}</td></tr>
            ))}
          </Table>
        </Card>
      )}
      <Modal open={attach !== null} onClose={() => setAttach(null)} title={`${g.name} — fan biriktirish`}>
        {!free.length ? <Empty text="Barcha fanlar biriktirilgan. Avval yangi fan yarating." /> : (
          <div className="space-y-2">
            {free.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4" checked={attach?.includes(s.id) ?? false}
                  onChange={(e) => setAttach((a) => (e.target.checked ? [...(a ?? []), s.id] : (a ?? []).filter((x) => x !== s.id)))} />
                <div><div className="font-medium">{s.name}</div><div className="font-mono text-xs text-slate-500">{s.code}</div></div>
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setAttach(null)}>{t('cancel')}</Button><Button onClick={doAttach} loading={busy} disabled={!attach?.length}>Biriktirish</Button></div>
          </div>
        )}
      </Modal>
      <GroupForm form={form} setForm={setForm} onSaved={reload} />
    </div>
  );
}

// ============================ TALABALAR ============================
const emptyStudent = { full_name: '', birth_date: '', gender: '', phone: '', email: '', group_id: '', note: '' };
export function Students() {
  const [sp, setSp] = useSearchParams();
  const groupId = sp.get('group_id') ?? '';
  const [search, setSearch] = useState('');
  const { data, loading, reload } = useFetch<any[]>(`/t/students${qs({ group_id: groupId, search })}`);
  const { data: groups } = useFetch<any[]>('/t/groups');
  const [form, setForm] = useState<any | null>(sp.get('new') ? { ...emptyStudent, group_id: groupId } : null);
  const [creds, setCreds] = useState<any | null>(null);
  const { busy, run } = useAction();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => (form.id ? api.put(`/t/students/${form.id}`, form) : api.post('/t/students', form)), t('saved'));
    if (r) { setForm(null); reload(); if (!form.id) setCreds(r); }
  };
  const reset = async (s: any) => {
    if (!confirm(`${s.full_name} uchun yangi vaqtinchalik parol yaratilsinmi?`)) return;
    const r = await run(() => api.post(`/t/students/${s.id}/reset-password`));
    if (r) { setCreds({ ...r, public_id: s.public_id }); reload(); }
  };
  const toggle = async (s: any) => { if (await run(() => api.post(`/t/students/${s.id}/active`, { active: !s.is_active }))) reload(); };
  const del = async (s: any) => {
    if (!confirm(`${s.full_name}: ${t('confirm_delete')}\nBarcha baho, davomat va javoblari o‘chadi!`)) return;
    if (await run(() => api.del(`/t/students/${s.id}`), 'O‘chirildi')) reload();
  };

  return (
    <div>
      <PageHeader title={t('nav_students')} subtitle={`${data?.length ?? 0} ta talaba`} actions={<Button onClick={() => setForm({ ...emptyStudent, group_id: groupId })}>+ Talaba qo‘shish</Button>} />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select className="input w-auto" value={groupId} onChange={(e) => setSp(e.target.value ? { group_id: e.target.value } : {})}>
            <option value="">Barcha guruhlar</option>
            {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input className="input max-w-xs" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {loading ? <Spinner /> : (
          <Table head={['', 'F.I.Sh.', 'Student ID', 'Login', t('group'), 'Telefon', 'Holat', '']} empty={!data?.length}>
            {data?.map((s) => (
              <tr key={s.id} className={`hover:bg-slate-50 ${!s.is_active ? 'opacity-50' : ''}`}>
                <td className="td"><span title={s.online ? 'online' : 'offline'} className={`inline-block h-2.5 w-2.5 rounded-full ${s.online ? 'bg-emerald-500' : 'bg-slate-300'}`} /></td>
                <td className="td font-medium text-slate-900">{s.full_name}</td>
                <td className="td font-mono text-xs">{s.public_id}</td>
                <td className="td font-mono text-xs">{s.username}</td>
                <td className="td">{s.group_name ? <Badge color="blue">{s.group_name}</Badge> : '—'}</td>
                <td className="td text-xs">{s.phone ?? '—'}</td>
                <td className="td">{!s.is_active ? <Badge color="red">bloklangan</Badge> : s.must_change_password ? <Badge color="yellow">parol o‘rnatilmagan</Badge> : <Badge color="green">faol</Badge>}</td>
                <td className="td whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" title="Tahrirlash" onClick={() => setForm({ ...emptyStudent, ...s, birth_date: s.birth_date ?? '', gender: s.gender ?? '', phone: s.phone ?? '', email: s.email ?? '', note: s.note ?? '' })}>✏️</Button>
                  <Button size="sm" variant="ghost" title="Parolni tiklash" onClick={() => reset(s)}>🔑</Button>
                  <Button size="sm" variant="ghost" title={s.is_active ? 'Bloklash' : 'Faollashtirish'} onClick={() => toggle(s)}>{s.is_active ? '⛔' : '✅'}</Button>
                  <Button size="sm" variant="ghost" title="O‘chirish" onClick={() => del(s)}>🗑</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Talabani tahrirlash' : 'Yangi talaba'}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <Field label="F.I.Sh."><input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Aliyev Ali Valiyevich" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tug‘ilgan sana"><input className="input" type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></Field>
              <Field label="Jinsi"><select className="input" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">—</option><option value="male">Erkak</option><option value="female">Ayol</option></select></Field>
              <Field label="Telefon"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" /></Field>
              <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            </div>
            <Field label={t('group')}>
              <select className="input" required value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                <option value="">{t('select')}</option>
                {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </Field>
            <Field label={t('comment')}><textarea className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            {!form.id && <div className="rounded-lg bg-brand-50 p-3 text-xs text-brand-800">Saqlagandan so‘ng tizim avtomatik ravishda <b>Student ID</b>, <b>login</b> va <b>vaqtinchalik parol</b> yaratadi.</div>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>{t('cancel')}</Button><Button type="submit" loading={busy}>{t('save')}</Button></div>
          </form>
        )}
      </Modal>

      <Modal open={!!creds} onClose={() => setCreds(null)} title="🔐 Talaba kirish ma’lumotlari">
        {creds && <CredentialsCard c={creds} onClose={() => setCreds(null)} />}
      </Modal>
    </div>
  );
}

function CredentialsCard({ c, onClose }: { c: any; onClose: () => void }) {
  const text = `Talaba: ${c.full_name}\nStudent ID: ${c.public_id ?? ''}\nLogin: ${c.username}\nVaqtinchalik parol: ${c.temporary_password}\nKirish manzili: ${location.origin}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 p-5 font-mono text-sm">
        <div className="mb-2 font-sans text-base font-bold text-slate-900">{c.full_name}</div>
        {c.public_id && <div>Student ID: <b>{c.public_id}</b></div>}
        <div>Login: <b>{c.username}</b></div>
        <div>Vaqtinchalik parol: <b className="text-lg text-brand-700">{c.temporary_password}</b></div>
      </div>
      <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">⚠️ Bu parol faqat hozir ko‘rsatiladi — bazada faqat uning hash’i saqlanadi. Talaba birinchi kirishda o‘z parolini o‘rnatadi.</div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* */ } }}>{copied ? '✓ Nusxalandi' : '📋 Nusxa olish'}</Button>
        <Button variant="secondary" onClick={() => window.print()}>🖨 Chop etish</Button>
        <Button onClick={onClose}>Tayyor</Button>
      </div>
    </div>
  );
}

export { fmtDate };
