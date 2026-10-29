import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, qs } from '../../api';
import { Badge, Button, Card, Empty, Field, PageHeader, Spinner, Stat, SubjectGroupPicker, Table, pct, useAction, useFetch } from '../../components/ui';
import { fmtDateTime, LANG_NAMES, getLang, setLang, t } from '../../i18n';

const shortDay = (d: string) => d.slice(5).replace('-', '.');

export function Reports() {
  const [sp, setSp] = useSearchParams();
  const subjectId = sp.get('subject_id') ?? '', groupId = sp.get('group_id') ?? '';
  const { data, loading } = useFetch<any>(subjectId && groupId ? `/t/stats${qs({ subject_id: subjectId, group_id: groupId })}` : null);
  const [student, setStudent] = useState('');
  useEffect(() => setStudent(''), [subjectId, groupId]);
  const s = data?.summary;
  const personal = data?.timeline.filter((x: any) => x.student_id === student) ?? [];
  return (
    <div>
      <PageHeader title={t('nav_reports')} subtitle="Fan → Guruh → Statistika" />
      <Card className="mb-5"><SubjectGroupPicker subjectId={subjectId} groupId={groupId} onChange={(a, b) => setSp(Object.fromEntries(Object.entries({ subject_id: a, group_id: b }).filter(([, v]) => v)))} /></Card>
      {!subjectId || !groupId ? <Card><Empty text="Guruh va fanni tanlang" icon="📈" /></Card> : loading || !data ? <Spinner /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat icon="📊" label="O‘rtacha baho" value={pct(s.avg_grade)} />
            <Stat icon="📝" label="Davomat" value={pct(s.attendance)} color="green" />
            <Stat icon="🧪" label="Test natijasi" value={pct(s.test_perf)} color="rose" />
            <Stat icon="💻" label="Topshiriqlar bajarilishi" value={pct(s.assignment_completion)} color="amber" sub={`${s.total_assignments} ta topshiriq`} />
            <Stat icon="⚡" label="Quiz natijasi" value={pct(s.quiz_perf)} color="violet" />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Talabalar o‘rtacha bahosi (%)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.students.map((x: any) => ({ name: x.full_name.split(' ').slice(0, 2).join(' '), v: x.avg_grade ?? 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip /><Bar dataKey="v" name="%" fill="#336fff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Davomat dinamikasi (%)">
              {!data.attendanceTrend.length ? <Empty /> : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.attendanceTrend.map((x: any) => ({ ...x, day: shortDay(x.day) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey="day" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} />
                    <Tooltip /><Line dataKey="pct" name="%" stroke="#059669" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
          <Card title="Talaba progress grafigi" actions={
            <select className="input w-auto" value={student} onChange={(e) => setStudent(e.target.value)}>
              <option value="">Talabani tanlang</option>{data.students.map((x: any) => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </select>}>
            {!student ? <Empty text="Talabani tanlang" icon="👤" /> : !personal.length ? <Empty text="Baholar yo‘q" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={personal.map((x: any) => ({ ...x, day: shortDay(x.day) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" /><XAxis dataKey="day" fontSize={11} /><YAxis domain={[0, 100]} fontSize={11} />
                  <Tooltip /><Line dataKey="pct" name="Kunlik %" stroke="#7c3aed" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
          <Card title="Batafsil jadval">
            <Table head={['Talaba', 'O‘rtacha', 'Davomat', 'Test', 'Quiz', 'Topshiriqlar']}>
              {data.students.map((x: any) => (
                <tr key={x.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setStudent(x.id)}>
                  <td className="td font-medium">{x.full_name}</td><td className="td">{pct(x.avg_grade)}</td><td className="td">{pct(x.attendance)}</td>
                  <td className="td">{pct(x.test_perf)}</td><td className="td">{pct(x.quiz_perf)}</td><td className="td">{x.assignments_done}/{s.total_assignments}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = { phone: 'Telefon', email: 'Email', birth_date: 'Tug‘ilgan sana', gender: 'Jinsi', full_name: 'F.I.Sh.' };

export function Settings() {
  const { data, reload } = useFetch<any>('/t/settings');
  const { data: cats, reload: reloadCats } = useFetch<any[]>('/t/grade-categories');
  const { data: logs } = useFetch<any[]>('/t/audit-logs');
  const [fields, setFields] = useState<string[]>([]);
  const [cat, setCat] = useState({ name: '', default_max: '10' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const { busy, run } = useAction();
  useEffect(() => { if (data) setFields(data.student_editable_fields); }, [data]);

  const saveFields = async () => { if (await run(() => api.put('/t/settings', { student_editable_fields: fields }), t('saved'))) reload(); };
  const addCat = async (e: FormEvent) => { e.preventDefault(); if (await run(() => api.post('/t/grade-categories', cat), 'Qo‘shildi')) { setCat({ name: '', default_max: '10' }); reloadCats(); } };
  const delCat = async (c: any) => { if (confirm(t('confirm_delete')) && await run(() => api.del(`/t/grade-categories/${c.id}`))) reloadCats(); };
  const changePw = async (e: FormEvent) => { e.preventDefault(); if (await run(() => api.post('/auth/change-password', pw), 'Parol o‘zgartirildi')) setPw({ current_password: '', new_password: '' }); };

  return (
    <div>
      <PageHeader title={t('nav_settings')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Talaba profilida tahrirlanadigan maydonlar">
          <div className="space-y-2">
            {data?.available_fields.map((f: string) => (
              <label key={f} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields(e.target.checked ? [...fields, f] : fields.filter((x) => x !== f))} />
                <span className="text-sm">{FIELD_LABELS[f] ?? f}</span>
              </label>
            ))}
            <div className="flex justify-end"><Button onClick={saveFields} loading={busy}>{t('save')}</Button></div>
          </div>
        </Card>
        <Card title="Baholash kategoriyalari">
          <div className="mb-3 space-y-1">
            {cats?.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 hover:bg-slate-50">
                <span className="text-sm">{c.name} <span className="text-xs text-slate-400">(max {c.default_max})</span> {c.system_key && <Badge>tizim</Badge>}</span>
                {!c.system_key && <Button size="sm" variant="ghost" onClick={() => delCat(c)}>🗑</Button>}
              </div>
            ))}
          </div>
          <form onSubmit={addCat} className="flex gap-2">
            <input className="input" required placeholder="Yangi kategoriya" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
            <input className="input w-24" type="number" min={1} value={cat.default_max} onChange={(e) => setCat({ ...cat, default_max: e.target.value })} />
            <Button type="submit">+</Button>
          </form>
        </Card>
        <Card title="Parolni o‘zgartirish">
          <form onSubmit={changePw} className="space-y-3">
            <Field label="Joriy parol"><input className="input" type="password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="Yangi parol" hint={t('password_rules')}><input className="input" type="password" required minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" loading={busy}>{t('save')}</Button></div>
          </form>
        </Card>
        <Card title="Interfeys tili">
          <div className="flex gap-2">{Object.entries(LANG_NAMES).map(([k, v]) => <Button key={k} variant={getLang() === k ? 'primary' : 'secondary'} onClick={() => setLang(k)}>{v}</Button>)}</div>
          <p className="mt-2 text-xs text-slate-500">Rus va ingliz tarjimalari qisman — to‘liq tarjima keyingi bosqichda.</p>
        </Card>
      </div>
      <Card title="Audit log (oxirgi 200 ta amal)" className="mt-5">
        <Table head={['Vaqt', 'Foydalanuvchi', 'Amal', 'Obyekt', 'IP']} empty={!logs?.length}>
          {logs?.map((l) => (
            <tr key={l.id}><td className="td whitespace-nowrap text-xs">{fmtDateTime(l.created_at)}</td><td className="td text-xs">{l.full_name ?? '—'}</td>
              <td className="td"><Badge color={l.action.includes('fail') ? 'red' : 'gray'}>{l.action}</Badge></td><td className="td text-xs">{l.entity}</td><td className="td font-mono text-xs">{l.ip}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
