import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useSocketEvent } from '../socket';
import { Button, Card, Empty, PageHeader, Spinner, useFetch } from '../components/ui';
import { fmtDateTime, t } from '../i18n';

const ICON: Record<string, string> = { material: '📂', assignment: '💻', test: '🧪', quiz: '⚡', grade: '📊', message: '💬', lesson: '🟢', deadline: '⏰', question: '❓', submission: '📥' };

export function Notifications() {
  const { data, loading, reload, setData } = useFetch<any>('/notifications');
  const nav = useNavigate();
  useSocketEvent<any>('notification', (n) => setData((d: any) => d ? { ...d, items: [n, ...d.items], unread: d.unread + 1 } : d));
  const open = async (n: any) => {
    if (!n.read_at) await api.post(`/notifications/${n.id}/read`);
    if (n.link) nav(n.link); else reload();
  };
  return (
    <div>
      <PageHeader title={t('nav_notifications')} subtitle={data ? `${data.unread} ta o‘qilmagan` : ''}
        actions={<Button variant="secondary" onClick={async () => { await api.post('/notifications/read-all'); reload(); }}>Hammasini o‘qilgan qilish</Button>} />
      <Card>
        {loading ? <Spinner /> : !data?.items.length ? <Empty icon="🔔" /> : (
          <div className="divide-y divide-slate-100">
            {data.items.map((n: any) => (
              <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-slate-50 ${n.read_at ? 'opacity-60' : ''}`}>
                <span className="text-xl">{ICON[n.type] ?? '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">{n.title}</div>
                  {n.body && <div className="truncate text-sm text-slate-500">{n.body}</div>}
                  <div className="text-xs text-slate-400">{fmtDateTime(n.created_at)}</div>
                </div>
                {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-brand-600" />}
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
