import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Badge, Button, Card, Empty, Spinner, Stat, useAction, useFetch } from '../../components/ui';
import { fmtDateTime, fmtLongDate, t, WEEKDAYS } from '../../i18n';
import { useSocketEvent } from '../../socket';

export function Dashboard() {
  const { data, loading, reload } = useFetch<any>('/t/dashboard');
  const nav = useNavigate();
  const { run, busy } = useAction();
  useSocketEvent('submission:update', reload);
  if (loading || !data) return <Spinner />;
  const d = new Date(data.date);
  const att = data.attendanceToday;
  const now = new Date().toTimeString().slice(0, 5);

  const start = async (scheduleId: string) => {
    const l = await run(() => api.post('/t/lessons/start', { schedule_id: scheduleId }));
    if (l) nav(`/teacher/live/${l.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-brand-700 to-brand-900 p-6 text-white shadow-lg">
        <div className="text-sm uppercase tracking-wider text-brand-200">{WEEKDAYS()[data.weekday - 1]}, {fmtLongDate(d)}</div>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{t('hello', { name: data.name.toUpperCase() })} 👋</h1>
        <p className="mt-1 text-brand-100">Bugun {data.todayLessons.length} ta dars rejalashtirilgan.</p>
        {data.activeLessons.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.activeLessons.map((l: any) => (
              <Button key={l.id} variant="success" onClick={() => nav(`/teacher/live/${l.id}`)}>
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Jonli: {l.subject_name} · {l.group_name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="📅" label={t('today_lessons')} value={data.todayLessons.length} />
        <Stat icon="👥" label={t('active_groups')} value={data.counts.active_groups} color="violet" sub={`jami ${data.counts.groups}`} />
        <Stat icon="🎓" label={t('total_students')} value={data.counts.students} color="sky" />
        <Stat icon="📝" label={t('today_attendance')} value={att.total ? `${Math.round((100 * att.present) / att.total)}%` : '—'} color="green" sub={att.total ? `${att.present}/${att.total}` : 'belgilanmagan'} />
        <Stat icon="💻" label={t('unchecked')} value={data.pendingSubmissions} color="amber" />
        <Stat icon="🧪" label={t('active_test')} value={data.activeTests} color="rose" />
        <Stat icon="💬" label={t('new_messages')} value={data.unreadMessages} color="brand" />
        <Stat icon="📚" label={t('nav_subjects')} value={data.counts.subjects} color="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t('today_lessons')} actions={<Link className="text-sm text-brand-600" to="/teacher/schedule">Jadval →</Link>}>
          {!data.todayLessons.length ? <Empty text={t('no_lessons_today')} icon="☕" /> : (
            <div className="space-y-3">
              {data.todayLessons.map((l: any) => {
                const isNow = now >= l.start_time && now <= l.end_time;
                return (
                  <div key={l.id} className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${isNow ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                    <div className="w-24 text-center">
                      <div className="text-lg font-bold text-slate-800">{l.start_time}</div>
                      <div className="text-xs text-slate-500">{l.end_time}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{l.subject_name}</div>
                      <div className="text-sm text-slate-500">{l.group_name} · Auditoriya {l.room ?? '—'}</div>
                      {isNow && <Badge color="green">Hozir</Badge>}
                    </div>
                    {l.active_lesson_id
                      ? <Button variant="success" onClick={() => nav(`/teacher/live/${l.active_lesson_id}`)}>▶ {t('continue_lesson')}</Button>
                      : <Button loading={busy} onClick={() => start(l.id)}>▶ {t('start_lesson')}</Button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card title="Tekshirish kutilmoqda">
          {!data.recentSubmissions.length ? <Empty text="Hammasi tekshirilgan" icon="✅" /> : (
            <div className="space-y-2">
              {data.recentSubmissions.map((s: any) => (
                <Link key={s.id} to={`/teacher/assignments/${s.assignment_id}`} className="block rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
                  <div className="text-sm font-semibold">{s.full_name}</div>
                  <div className="truncate text-xs text-slate-500">{s.title}</div>
                  <div className="text-xs text-slate-400">{fmtDateTime(s.submitted_at)}</div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
