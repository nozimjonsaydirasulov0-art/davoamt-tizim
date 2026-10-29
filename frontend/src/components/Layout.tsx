import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useSocket, useSocketEvent } from '../socket';
import { api } from '../api';
import { t, type Dict } from '../i18n';
import { useToast } from './ui';

type Item = { to: string; icon: string; label: keyof Dict; end?: boolean };

const TEACHER_NAV: Item[] = [
  { to: '/teacher', icon: '🏠', label: 'nav_home', end: true },
  { to: '/teacher/subjects', icon: '📚', label: 'nav_subjects' },
  { to: '/teacher/groups', icon: '👥', label: 'nav_groups' },
  { to: '/teacher/students', icon: '🎓', label: 'nav_students' },
  { to: '/teacher/schedule', icon: '📅', label: 'nav_schedule' },
  { to: '/teacher/attendance', icon: '📝', label: 'nav_attendance' },
  { to: '/teacher/grades', icon: '📊', label: 'nav_grades' },
  { to: '/teacher/materials', icon: '📂', label: 'nav_materials' },
  { to: '/teacher/assignments', icon: '💻', label: 'nav_assignments' },
  { to: '/teacher/tests', icon: '🧪', label: 'nav_tests' },
  { to: '/teacher/live', icon: '⚡', label: 'nav_live' },
  { to: '/teacher/messages', icon: '💬', label: 'nav_messages' },
  { to: '/teacher/notifications', icon: '🔔', label: 'nav_notifications' },
  { to: '/teacher/reports', icon: '📈', label: 'nav_reports' },
  { to: '/teacher/settings', icon: '⚙️', label: 'nav_settings' },
];
const STUDENT_NAV: Item[] = [
  { to: '/student', icon: '🏠', label: 'nav_home', end: true },
  { to: '/student/profile', icon: '👤', label: 'nav_profile' },
  { to: '/student/subjects', icon: '📚', label: 'nav_my_subjects' },
  { to: '/student/schedule', icon: '📅', label: 'nav_schedule' },
  { to: '/student/attendance', icon: '📋', label: 'nav_my_attendance' },
  { to: '/student/grades', icon: '📊', label: 'nav_my_grades' },
  { to: '/student/materials', icon: '📂', label: 'nav_materials' },
  { to: '/student/assignments', icon: '💻', label: 'nav_my_assignments' },
  { to: '/student/tests', icon: '🧪', label: 'nav_tests' },
  { to: '/student/live', icon: '⚡', label: 'nav_live' },
  { to: '/student/messages', icon: '💬', label: 'nav_messages' },
  { to: '/student/notifications', icon: '🔔', label: 'nav_notifications' },
  { to: '/student/stats', icon: '📈', label: 'nav_my_stats' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [liveBadge, setLiveBadge] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const toast = useToast();
  const isTeacher = user?.role === 'teacher';
  const items = isTeacher ? TEACHER_NAV : STUDENT_NAV;
  const base = isTeacher ? '/teacher' : '/student';

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    api.get('/notifications').then((r) => setUnread(r.unread)).catch(() => {});
    if (!isTeacher) api.get('/s/live').then((r) => setLiveBadge(!!r.lesson)).catch(() => {});
  }, [loc.pathname, isTeacher]);

  useSocketEvent<any>('notification', (n) => {
    setUnread((u) => u + 1);
    // Jonli dars sahifasida savol/quiz o'zi ko'rinadi — takroriy toast chiqarmaymiz
    if (loc.pathname.endsWith('/live') && ['question', 'quiz', 'lesson', 'material', 'assignment'].includes(n.type)) return;
    toast(`🔔 ${n.title}${n.body ? ': ' + n.body : ''}`, 'info');
  });
  useSocketEvent('lesson:started', () => setLiveBadge(true));
  useSocketEvent('lesson:ended', () => setLiveBadge(false));

  const Side = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">🎓</div>
        <div>
          <div className="font-bold leading-tight text-white">{t('appName')}</div>
          <div className="text-[11px] uppercase tracking-wider text-brand-200">{isTeacher ? 'Teacher / Admin' : 'Talaba kabineti'}</div>
        </div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'}`}>
            <span className="w-5 text-center">{i.icon}</span>
            <span className="flex-1">{t(i.label)}</span>
            {i.label === 'nav_notifications' && unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
            {i.label === 'nav_live' && liveBadge && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-xs text-brand-200">
        <span className={`mr-1 inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        {connected ? 'Real-time ulangan' : 'Ulanmoqda...'}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-brand-900 to-brand-950 lg:block">{Side}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-gradient-to-b from-brand-900 to-brand-950" onClick={(e) => e.stopPropagation()}>{Side}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
        <div className="flex-1" />
        <button onClick={() => nav(`${base}/notifications`)} className="relative rounded-lg p-2 text-lg hover:bg-slate-100" aria-label={t('nav_notifications')}>
          🔔{unread > 0 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
        </button>
        <div className="hidden text-right sm:block">
          <div className="text-sm font-semibold text-slate-800">{user?.full_name}</div>
          <div className="text-xs text-slate-500">{isTeacher ? 'O‘qituvchi' : `${user?.group_name ?? ''} · ${user?.public_id ?? ''}`}</div>
        </div>
        <button onClick={async () => { await logout(); nav('/login'); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">{t('logout')}</button>
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></main>
    </div>
  );
}

export const Section = ({ children }: { children: ReactNode }) => <div className="space-y-5">{children}</div>;
