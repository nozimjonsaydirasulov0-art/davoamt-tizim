import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, Stat, StatusBadge, pct, useAction, useFetch } from '../../components/ui';
import { fmtDate, fmtDateTime, t } from '../../i18n';
import { useSocketEvent } from '../../socket';

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch<any>('/s/dashboard');
  useSocketEvent('notification', reload);
  useSocketEvent('lesson:started', reload);
  useSocketEvent('lesson:ended', reload);
  if (loading || !data) return <Spinner />;
  const first = user?.full_name.split(' ')[1] ?? user?.full_name;
  const n = data.newCounts;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold">Salom, {first} 👋</h1>
        <div className="mt-1 text-brand-100">{data.group?.name} · {data.group?.direction} · {data.group?.course}-kurs</div>
        {data.activeLesson && (
          <Link to="/student/live" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/15 p-4 transition hover:bg-white/25">
            <div><div className="flex items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />DARS BOSHLANDI</div><div className="text-lg font-semibold">{data.activeLesson.subject_name}</div></div>
            <span className="rounded-lg bg-white px-4 py-2 font-semibold text-brand-700">{t('join_lesson')} →</span>
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="📝" label="Davomat" value={pct(data.attendance)} color="green" />
        <Stat icon="📊" label="O‘rtacha baho" value={data.avgGrade === null ? '—' : Math.round(data.avgGrade)} color="brand" />
        <Stat icon="💻" label="Bajarilmagan topshiriq" value={data.upcoming.length} color="amber" />
        <Stat icon="💬" label="Yangi xabar" value={n.messages ?? 0} color="violet" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Bugungi darslar">
          {!data.today.length ? <Empty text={t('no_lessons_today')} icon="☕" /> : data.today.map((l: any) => (
            <div key={l.id} className="mb-2 rounded-lg border border-slate-200 p-3">
              <div className="font-semibold">{l.subject_name}</div>
              <div className="text-sm text-slate-500">{l.start_time} – {l.end_time} · xona {l.room ?? '—'}</div>
            </div>
          ))}
        </Card>
        <Card title="Yangi">
          <div className="space-y-2 text-sm">
            <Link to="/student/materials" className="flex justify-between rounded-lg p-2 hover:bg-slate-50"><span>📂 Material</span><Badge color="blue">{n.material ?? 0}</Badge></Link>
            <Link to="/student/assignments" className="flex justify-between rounded-lg p-2 hover:bg-slate-50"><span>💻 Topshiriq</span><Badge color="blue">{n.assignment ?? 0}</Badge></Link>
            <Link to="/student/tests" className="flex justify-between rounded-lg p-2 hover:bg-slate-50"><span>🧪 Test</span><Badge color="blue">{n.test ?? 0}</Badge></Link>
            <Link to="/student/grades" className="flex justify-between rounded-lg p-2 hover:bg-slate-50"><span>📊 Baho</span><Badge color="blue">{n.grade ?? 0}</Badge></Link>
            <Link to="/student/messages" className="flex justify-between rounded-lg p-2 hover:bg-slate-50"><span>💬 Xabar</span><Badge color="blue">{n.messages ?? 0}</Badge></Link>
          </div>
        </Card>
        <Card title="Bajarilishi kerak">
          {!data.upcoming.length ? <Empty text="Hammasi topshirilgan 🎉" icon="✅" /> : data.upcoming.map((a: any) => (
            <Link key={a.id} to={`/student/assignments/${a.id}`} className="mb-2 block rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <div className="text-sm font-semibold">{a.title}</div>
              <div className="flex items-center justify-between text-xs text-slate-500"><span>{a.subject_name}</span><StatusBadge status={a.status} /></div>
              {a.deadline && <div className={`text-xs ${new Date(a.deadline) < new Date() ? 'text-rose-600' : 'text-slate-400'}`}>⏰ {fmtDateTime(a.deadline)}</div>}
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}

export function Profile() {
  const { data, reload } = useFetch<any>('/s/profile');
  const [f, setF] = useState<any>({});
  const [pw, setPw] = useState({ current_password: '', new_password: '', repeat: '' });
  const { busy, run } = useAction();
  useEffect(() => { if (data) setF({ phone: data.phone ?? '', email: data.email ?? '', birth_date: data.birth_date ?? '', gender: data.gender ?? '', full_name: data.full_name }); }, [data]);
  if (!data) return <Spinner />;
  const ed: string[] = data.editable_fields;
  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(f).filter(([k, v]) => ed.includes(k) && v !== ''));
    if (await run(() => api.patch('/s/profile', body), t('saved'))) reload();
  };
  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.new_password !== pw.repeat) return alert(t('passwords_mismatch'));
    if (await run(() => api.post('/auth/change-password', { current_password: pw.current_password, new_password: pw.new_password }), 'Parol o‘zgartirildi')) setPw({ current_password: '', new_password: '', repeat: '' });
  };
  const row = (label: string, v: any) => <div className="flex justify-between border-b border-slate-100 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium">{v ?? '—'}</span></div>;
  return (
    <div>
      <PageHeader title={t('nav_profile')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Shaxsiy ma’lumotlar">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700">{data.full_name[0]}</div>
            <div><div className="text-lg font-bold">{data.full_name}</div><div className="font-mono text-sm text-slate-500">{data.public_id}</div></div>
          </div>
          {row('Student ID', data.public_id)}{row('Login', data.username)}{row('Guruh', data.group_name)}{row('Kurs', data.course)}{row('Yo‘nalish', data.direction)}{row('O‘quv yili', data.academic_year)}{row('Oxirgi kirish', fmtDateTime(data.last_login_at))}
        </Card>
        <div className="space-y-5">
          <Card title="Kontakt ma’lumotlari">
            <form onSubmit={saveProfile} className="space-y-3">
              <Field label="F.I.Sh."><input className="input" disabled={!ed.includes('full_name')} value={f.full_name ?? ''} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon"><input className="input" disabled={!ed.includes('phone')} value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
                <Field label="Email"><input className="input" disabled={!ed.includes('email')} value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
                <Field label="Tug‘ilgan sana"><input className="input" type="date" disabled={!ed.includes('birth_date')} value={f.birth_date ?? ''} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
                <Field label="Jinsi"><select className="input" disabled={!ed.includes('gender')} value={f.gender ?? ''} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="male">Erkak</option><option value="female">Ayol</option></select></Field>
              </div>
              {!ed.length ? <p className="text-xs text-slate-400">O‘qituvchi profilni tahrirlashga ruxsat bermagan.</p> : <div className="flex justify-end"><Button type="submit" loading={busy}>{t('save')}</Button></div>}
            </form>
          </Card>
          <Card title="Parolni o‘zgartirish">
            <form onSubmit={changePw} className="space-y-3">
              <Field label="Joriy parol"><input className="input" type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <Field label="Yangi parol" hint={t('password_rules')}><input className="input" type="password" required minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
              <Field label="Takrorlang"><input className="input" type="password" required value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} /></Field>
              <div className="flex justify-end"><Button type="submit" loading={busy}>{t('save')}</Button></div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

const PIE_COLORS = ['#059669', '#f59e0b', '#e11d48'];
export function Stats() {
  const { data } = useFetch<any>('/s/stats');
  if (!data) return <Spinner />;
  const att = data.attendance;
  const pie = [{ name: t('present'), value: att.present }, { name: t('late'), value: att.late }, { name: t('absent'), value: att.absent }].filter((x) => x.value);
  return (
    <div className="space-y-5">
      <PageHeader title={t('nav_my_stats')} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="📝" label="Davomat" value={pct(att.pct)} color="green" />
        <Stat icon="📊" label="O‘rtacha baho" value={data.avgGrade === null ? '—' : Math.round(data.avgGrade)} />
        <Stat icon="💻" label="Topshiriqlar" value={`${data.assignments.done}/${data.assignments.total}`} color="amber" />
        <Stat icon="🧪" label="Testlar" value={`${data.tests.done}/${data.tests.total}`} color="rose" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Baholar dinamikasi (%)" className="lg:col-span-2">
          {!data.timeline.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline.map((x: any) => ({ ...x, day: x.day.slice(5) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey="day" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} />
                <Tooltip /><Line dataKey="pct" name="%" stroke="#336fff" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Davomat">
          {!pie.length ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label={(e: any) => `${e.name}: ${e.value}`}>{pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[[t('present'), t('late'), t('absent')].indexOf(pie[i].name)]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
      <Card title="Fanlar bo‘yicha (%)">
        {!data.bySubject.length ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(160, data.bySubject.length * 50)}>
            <BarChart data={data.bySubject} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis type="number" domain={[0, 100]} fontSize={11} /><YAxis type="category" dataKey="name" width={200} fontSize={11} />
              <Tooltip /><Bar dataKey="pct" name="%" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

export { fmtDate };
