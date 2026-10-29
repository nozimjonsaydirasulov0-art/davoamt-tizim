import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Button, Card, Empty, Field, Modal, PageHeader, Spinner, useAction, useFetch } from '../../components/ui';
import { t, WEEKDAYS } from '../../i18n';

const empty = { subject_id: '', group_id: '', weekday: String(((new Date().getDay() + 6) % 7) + 1), start_time: '14:00', end_time: '15:20', room: '', note: '' };

export function Schedule() {
  const { data, loading, reload } = useFetch<any[]>('/t/schedules');
  const { data: groups } = useFetch<any[]>('/t/groups');
  const [form, setForm] = useState<any | null>(null);
  const { busy, run } = useAction();
  const nav = useNavigate();
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const groupSubjects = groups?.find((g) => g.id === form?.group_id)?.subjects ?? [];
  const showSunday = data?.some((s) => s.weekday === 7);
  const days = showSunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6];

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => (form.id ? api.put(`/t/schedules/${form.id}`, form) : api.post('/t/schedules', form)), t('saved'));
    if (r) { setForm(null); reload(); }
  };
  const del = async () => {
    if (!confirm(t('confirm_delete'))) return;
    if (await run(() => api.del(`/t/schedules/${form.id}`), 'O‘chirildi')) { setForm(null); reload(); }
  };
  const start = async (s: any) => {
    const l = await run(() => api.post('/t/lessons/start', { schedule_id: s.id }));
    if (l) nav(`/teacher/live/${l.id}`);
  };

  return (
    <div>
      <PageHeader title={t('nav_schedule')} subtitle="Haftalik dars jadvali" actions={<Button onClick={() => setForm({ ...empty })}>+ Dars jadvali</Button>} />
      {loading ? <Spinner /> : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6" style={showSunday ? { gridTemplateColumns: undefined } : undefined}>
          {days.map((d) => {
            const items = data?.filter((s) => s.weekday === d) ?? [];
            return (
              <div key={d} className={`card overflow-hidden ${d === today ? 'ring-2 ring-brand-400' : ''}`}>
                <div className={`px-3 py-2 text-sm font-semibold ${d === today ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-700'}`}>
                  {WEEKDAYS()[d - 1]} {d === today && '· bugun'}
                </div>
                <div className="space-y-2 p-2">
                  {items.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-200 p-2.5 text-sm hover:border-brand-300">
                      <button className="w-full text-left" onClick={() => setForm({ ...s, weekday: String(s.weekday), room: s.room ?? '', note: s.note ?? '' })}>
                        <div className="font-bold text-brand-700">{s.start_time}–{s.end_time}</div>
                        <div className="font-medium leading-tight text-slate-900">{s.subject_name}</div>
                        <div className="text-xs text-slate-500">{s.group_name} · {s.room ? `xona ${s.room}` : ''}</div>
                      </button>
                      {s.active_lesson_id
                        ? <Button size="sm" variant="success" className="mt-2 w-full" onClick={() => nav(`/teacher/live/${s.active_lesson_id}`)}>● Davom etish</Button>
                        : <Button size="sm" variant={d === today ? 'primary' : 'secondary'} className="mt-2 w-full" onClick={() => start(s)}>▶ Boshlash</Button>}
                    </div>
                  ))}
                  {!items.length && <div className="py-4 text-center text-xs text-slate-300">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !data?.length && <Card className="mt-4"><Empty text="Jadval bo‘sh. Avval guruhga fan biriktiring, keyin dars qo‘shing." /></Card>}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Darsni tahrirlash' : 'Jadvalga dars qo‘shish'}>
        {form && (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('group')}>
                <select className="input" required value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value, subject_id: '' })}>
                  <option value="">{t('select')}</option>{groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Field>
              <Field label={t('subject')} hint={form.group_id && !groupSubjects.length ? 'Bu guruhga fan biriktirilmagan' : undefined}>
                <select className="input" required value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                  <option value="">{t('select')}</option>{groupSubjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Hafta kuni">
              <select className="input" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: e.target.value })}>
                {WEEKDAYS().map((w, i) => <option key={i} value={i + 1}>{w}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Boshlanish"><input className="input" type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></Field>
              <Field label="Tugash"><input className="input" type="time" required value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></Field>
              <Field label="Xona"><input className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="204" /></Field>
            </div>
            <Field label={t('comment')}><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div className="flex justify-between gap-2">
              <div>{form.id && <Button type="button" variant="danger" onClick={del}>{t('delete')}</Button>}</div>
              <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setForm(null)}>{t('cancel')}</Button><Button type="submit" loading={busy}>{t('save')}</Button></div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
