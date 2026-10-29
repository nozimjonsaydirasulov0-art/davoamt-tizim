import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fileUrl } from '../../api';
import { Badge, Button, Card, Empty, PageHeader, Spinner, StatusBadge, Table, Tabs, pct, useFetch } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtSize, t, WEEKDAYS } from '../../i18n';
import { useSocketEvent } from '../../socket';
import { canInline, fileIcon } from '../teacher/MaterialsAssignments';

export function Subjects() {
  const { data, loading } = useFetch<any[]>('/s/subjects');
  return (
    <div>
      <PageHeader title={t('nav_my_subjects')} />
      {loading ? <Spinner /> : !data?.length ? <Card><Empty /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <Link key={s.id} to={`/student/subjects/${s.id}`} className="card block p-5 transition hover:border-brand-300 hover:shadow-md">
              <div className="font-mono text-xs font-semibold text-brand-600">{s.code}</div>
              <div className="mt-1 text-lg font-bold leading-snug text-slate-900">{s.name}</div>
              <div className="mt-3 flex gap-2"><Badge color="green">Davomat {pct(s.attendance)}</Badge><Badge color="blue">Baho {pct(s.avg_grade)}</Badge></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function MaterialRow({ m }: { m: any }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
      <span className="text-2xl">{fileIcon(m.mime_type)}</span>
      <div className="min-w-0 flex-1"><div className="font-medium">{m.title}</div><div className="truncate text-xs text-slate-400">{m.file_name} · {fmtSize(m.file_size)} · {fmtDateTime(m.created_at)}</div></div>
      {m.subject_name && <Badge color="purple">{m.subject_name}</Badge>}
      <div className="flex gap-1">
        {canInline(m.mime_type) && <a href={fileUrl('material', m.id, true)} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary">{t('view')}</Button></a>}
        <a href={fileUrl('material', m.id)}><Button size="sm">{t('download')}</Button></a>
      </div>
    </div>
  );
}

export function SubjectDetail() {
  const { id } = useParams();
  const { data, loading } = useFetch<any>(`/s/subjects/${id}`);
  const [tab, setTab] = useState('overview');
  if (loading || !data) return <Spinner />;
  const d = data;
  const attPct = d.attendance.length ? Math.round((100 * d.attendance.filter((a: any) => a.status !== 'absent').length) / d.attendance.length) : null;
  const sum = d.grades.reduce((a: number, g: any) => a + g.score, 0), mx = d.grades.reduce((a: number, g: any) => a + g.max_score, 0);
  return (
    <div>
      <PageHeader title={d.subject.name} subtitle={`${d.subject.code} · O‘qituvchi: ${d.teacher?.full_name} · Guruh: ${d.group?.name}`} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Umumiy' }, { key: 'attendance', label: `Davomat (${d.attendance.length})` }, { key: 'grades', label: `Baholar (${d.grades.length})` },
        { key: 'materials', label: `Materiallar (${d.materials.length})` }, { key: 'assignments', label: `Topshiriqlar (${d.assignments.length})` },
        { key: 'tests', label: `Testlar (${d.tests.length})` }, { key: 'lessons', label: `Darslar (${d.lessons.length})` },
      ]} />
      {tab === 'overview' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Davomat"><div className="text-3xl font-bold text-emerald-600">{attPct === null ? '—' : `${attPct}%`}</div></Card>
          <Card title="Ball"><div className="text-3xl font-bold text-brand-600">{mx ? `${sum}/${mx}` : '—'}</div></Card>
          <Card title="Jadval">{d.schedule.map((s: any, i: number) => <div key={i} className="text-sm">{WEEKDAYS()[s.weekday - 1]} {s.start_time}–{s.end_time} · {s.room}</div>)}</Card>
          {d.subject.description && <Card title="Fan haqida" className="sm:col-span-3"><p className="text-sm text-slate-600">{d.subject.description}</p></Card>}
        </div>
      )}
      {tab === 'attendance' && <Card><Table head={[t('date'), t('status')]} empty={!d.attendance.length}>{d.attendance.map((a: any, i: number) => <tr key={i}><td className="td">{fmtDate(a.date)}</td><td className="td"><StatusBadge status={a.status} /></td></tr>)}</Table></Card>}
      {tab === 'grades' && <Card><Table head={[t('date'), 'Kategoriya', t('score'), t('comment')]} empty={!d.grades.length}>{d.grades.map((g: any, i: number) => <tr key={i}><td className="td">{fmtDate(g.created_at)}</td><td className="td">{g.category}</td><td className="td font-semibold">{g.score}/{g.max_score}</td><td className="td text-xs text-slate-500">{g.comment}</td></tr>)}</Table></Card>}
      {tab === 'materials' && <div className="space-y-2">{d.materials.map((m: any) => <MaterialRow key={m.id} m={m} />)}{!d.materials.length && <Card><Empty /></Card>}</div>}
      {tab === 'assignments' && <Card><Table head={['Topshiriq', t('deadline'), t('status'), t('score')]} empty={!d.assignments.length}>{d.assignments.map((a: any) => <tr key={a.id}><td className="td"><Link className="text-brand-700 hover:underline" to={`/student/assignments/${a.id}`}>{a.title}</Link></td><td className="td text-xs">{fmtDateTime(a.deadline)}</td><td className="td"><StatusBadge status={a.status} /></td><td className="td">{a.score ?? '—'}/{a.max_score}</td></tr>)}</Table></Card>}
      {tab === 'tests' && <Card><Table head={['Test', 'Yopiladi', t('score')]} empty={!d.tests.length}>{d.tests.map((x: any) => <tr key={x.id}><td className="td"><Link className="text-brand-700 hover:underline" to={`/student/tests/${x.id}`}>{x.title}</Link></td><td className="td text-xs">{fmtDateTime(x.closes_at)}</td><td className="td">{x.finished_at ? `${x.score}/${x.max_score}` : '—'}</td></tr>)}</Table></Card>}
      {tab === 'lessons' && <Card><Table head={[t('date'), 'Mavzu', t('status')]} empty={!d.lessons.length}>{d.lessons.map((l: any) => <tr key={l.id}><td className="td">{fmtDateTime(l.started_at)}</td><td className="td">{l.topic ?? '—'}</td><td className="td">{l.status === 'active' ? <Link to="/student/live"><Badge color="green">● jonli</Badge></Link> : <Badge>o‘tgan</Badge>}</td></tr>)}</Table></Card>}
    </div>
  );
}

export function Schedule() {
  const { data, loading } = useFetch<any[]>('/s/schedule');
  const today = ((new Date().getDay() + 6) % 7) + 1;
  if (loading || !data) return <Spinner />;
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || data.some((s) => s.weekday === 7));
  return (
    <div>
      <PageHeader title={t('nav_schedule')} />
      <div className="space-y-3">
        {days.map((d) => {
          const items = data.filter((s) => s.weekday === d);
          return (
            <Card key={d} title={<span className={d === today ? 'text-brand-700' : ''}>{WEEKDAYS()[d - 1]} {d === today && <Badge color="blue">bugun</Badge>}</span>}>
              {!items.length ? <div className="text-sm text-slate-400">Dars yo‘q</div> : (
                <div className="space-y-2">{items.map((s) => (
                  <div key={s.id} className="flex items-center gap-4"><div className="w-28 font-bold text-brand-700">{s.start_time}–{s.end_time}</div><div className="flex-1"><div className="font-medium">{s.subject_name}</div><div className="text-xs text-slate-500">Auditoriya: {s.room ?? '—'} {s.note && `· ${s.note}`}</div></div></div>
                ))}</div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function Attendance() {
  const { data, loading } = useFetch<any[]>('/s/attendance');
  if (loading || !data) return <Spinner />;
  const p = data.length ? Math.round((100 * data.filter((a) => a.status !== 'absent').length) / data.length) : null;
  return (
    <div>
      <PageHeader title={t('nav_my_attendance')} subtitle={p === null ? '' : `Umumiy davomat: ${p}%`} />
      <Card><Table head={[t('date'), t('subject'), t('status')]} empty={!data.length}>{data.map((a, i) => <tr key={i}><td className="td">{fmtDate(a.date)}</td><td className="td">{a.subject_name}</td><td className="td"><StatusBadge status={a.status} /></td></tr>)}</Table></Card>
    </div>
  );
}

export function Grades() {
  const { data, loading, reload } = useFetch<any[]>('/s/grades');
  useSocketEvent('grade:new', reload);
  useSocketEvent('notification', reload);
  if (loading || !data) return <Spinner />;
  const bySub = new Map<string, any[]>();
  data.forEach((g) => bySub.set(g.subject_name, [...(bySub.get(g.subject_name) ?? []), g]));
  return (
    <div>
      <PageHeader title={t('nav_my_grades')} />
      {!data.length ? <Card><Empty /></Card> : (
        <div className="space-y-4">
          {[...bySub.entries()].map(([name, gs]) => {
            const s = gs.reduce((a, g) => a + g.score, 0), m = gs.reduce((a, g) => a + g.max_score, 0);
            return (
              <Card key={name} title={name} actions={<Badge color="blue">{s}/{m} · {Math.round((100 * s) / m)}%</Badge>}>
                <Table head={[t('date'), 'Kategoriya', t('score'), t('comment')]}>
                  {gs.map((g) => <tr key={g.id}><td className="td text-xs">{fmtDate(g.created_at)}</td><td className="td">{g.category}</td><td className="td font-semibold">{g.score}/{g.max_score}</td><td className="td text-xs text-slate-500">{g.comment}</td></tr>)}
                </Table>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Materials() {
  const { data, loading, reload } = useFetch<any[]>('/s/materials');
  useSocketEvent('material:new', reload);
  return (
    <div>
      <PageHeader title={t('nav_materials')} />
      {loading ? <Spinner /> : !data?.length ? <Card><Empty /></Card> : <div className="space-y-2">{data.map((m) => <MaterialRow key={m.id} m={m} />)}</div>}
    </div>
  );
}
