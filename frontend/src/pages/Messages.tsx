import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useSocketEvent } from '../socket';
import { Button, Empty, PageHeader, useAction, useFetch } from '../components/ui';
import { fmtDateTime, t } from '../i18n';

type Thread = { kind: 'user'; id: string; name: string; sub?: string; unread?: number; online?: boolean } | { kind: 'group'; id: string; name: string; sub?: string };

export function Messages() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const { data, reload } = useFetch<any>('/messages/threads');
  const [active, setActive] = useState<Thread | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { busy, run } = useAction();

  const threads: Thread[] = !data ? [] : isTeacher
    ? [
      ...data.groups.map((g: any) => ({ kind: 'group' as const, id: g.id, name: `📢 ${g.name}`, sub: 'Guruhga e’lon' })),
      ...data.students.map((s: any) => ({ kind: 'user' as const, id: s.user_id, name: s.full_name, sub: s.last_body ?? s.group_name, unread: s.unread, online: s.online })),
    ]
    : [
      ...(data.teacher ? [{ kind: 'user' as const, id: data.teacher.user_id, name: `👨‍🏫 ${data.teacher.full_name}`, sub: 'O‘qituvchi', unread: data.teacher.unread, online: data.teacher.online }] : []),
      ...(data.group ? [{ kind: 'group' as const, id: data.group.id, name: `📢 ${data.group.name}`, sub: 'Guruh e’lonlari' }] : []),
    ];

  useEffect(() => { if (!active && threads.length && !isTeacher) setActive(threads[0]); }, [threads.length]); // eslint-disable-line

  const load = async (th: Thread) => {
    const url = th.kind === 'user' ? `/messages/with/${th.id}` : `/messages/group/${th.id}`;
    setMsgs(await api.get(url));
    if (th.kind === 'user') reload();
  };
  useEffect(() => { if (active) load(active); }, [active?.id]); // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length]);

  useSocketEvent<any>('message:new', (m) => {
    if (active?.kind === 'user' && (m.sender_id === active.id || m.recipient_id === active.id)) {
      setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
      if (m.sender_id === active.id) api.get(`/messages/with/${active.id}`).catch(() => {});
    } else reload();
  });
  useSocketEvent<any>('message:group', (m) => {
    if (active?.kind === 'group' && m.group_id === active.id) setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m]));
  });

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !text.trim()) return;
    const body = active.kind === 'user' ? { recipient_id: active.id, body: text } : { group_id: active.id, body: text };
    const m = await run(() => api.post('/messages', body));
    if (m) { setText(''); setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); }
  };
  const canWrite = active && (active.kind === 'user' || isTeacher);
  const shown = threads.filter((th) => th.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <PageHeader title={t('nav_messages')} subtitle={isTeacher ? 'Talabalar bilan shaxsiy yozishma va guruhlarga e’lonlar' : 'O‘qituvchi bilan aloqa'} />
      <div className="card grid h-[calc(100vh-200px)] min-h-[480px] grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
        <div className={`flex flex-col border-r border-slate-100 ${active ? 'hidden md:flex' : 'flex'}`}>
          {isTeacher && <div className="p-3"><input className="input" placeholder={t('search')} value={filter} onChange={(e) => setFilter(e.target.value)} /></div>}
          <div className="flex-1 overflow-y-auto">
            {shown.map((th) => (
              <button key={th.kind + th.id} onClick={() => setActive(th)}
                className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${active?.id === th.id ? 'bg-brand-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                    {'online' in th && <span className={`h-2 w-2 shrink-0 rounded-full ${th.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />}
                    {th.name}
                  </div>
                  <div className="truncate text-xs text-slate-500">{th.sub}</div>
                </div>
                {'unread' in th && !!th.unread && <span className="rounded-full bg-brand-600 px-2 text-xs font-bold text-white">{th.unread}</span>}
              </button>
            ))}
            {!shown.length && <Empty />}
          </div>
        </div>
        <div className={`flex min-h-0 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
          {!active ? <div className="flex flex-1 items-center justify-center"><Empty text="Suhbatni tanlang" icon="💬" /></div> : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <button className="md:hidden" onClick={() => setActive(null)}>←</button>
                <div className="font-semibold">{active.name}</div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                {msgs.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine ? 'rounded-br-sm bg-brand-600 text-white' : 'rounded-bl-sm bg-white text-slate-800'}`}>
                        {active.kind === 'group' && !mine && <div className="mb-0.5 text-xs font-semibold text-brand-700">{m.sender_name}</div>}
                        <div className="whitespace-pre-wrap break-words">{m.body}</div>
                        <div className={`mt-1 text-[10px] ${mine ? 'text-brand-100' : 'text-slate-400'}`}>{fmtDateTime(m.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
                {!msgs.length && <Empty text="Xabarlar yo‘q" icon="✉️" />}
                <div ref={endRef} />
              </div>
              {canWrite ? (
                <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3">
                  <input className="input" placeholder="Xabar yozing..." value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
                  <Button type="submit" loading={busy}>{t('send')}</Button>
                </form>
              ) : <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-400">Bu kanal faqat o‘qituvchi e’lonlari uchun</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
