import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, setCsrf } from '../api';
import { useAuth } from '../auth';
import { Button, Field } from '../components/ui';
import { t, LANG_NAMES, getLang, setLang } from '../i18n';

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 p-4">
    <div className="w-full max-w-md">
      <div className="mb-6 text-center text-white">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl">🎓</div>
        <div className="text-2xl font-bold">{t('appName')}</div>
        <div className="text-sm text-brand-200">Ta’lim boshqaruv platformasi</div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-2xl sm:p-8">{children}</div>
      <div className="mt-4 flex justify-center gap-3 text-xs text-brand-200">
        {Object.entries(LANG_NAMES).map(([k, v]) => (
          <button key={k} onClick={() => setLang(k)} className={getLang() === k ? 'font-bold text-white' : 'hover:text-white'}>{v}</button>
        ))}
      </div>
    </div>
  </div>
);

export function Login() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && !user.must_change_password) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.post('/auth/login', { username, password });
      setCsrf(r.csrf);
      await refresh();
      nav(r.must_change_password ? '/change-password' : '/');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Shell>
      <h2 className="mb-5 text-xl font-bold text-slate-900">{t('login_title')}</h2>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('username')}><input className="input" autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} required autoFocus /></Field>
        <Field label={t('password')}><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required /></Field>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('login_btn')}</Button>
      </form>
    </Shell>
  );
}

export function ChangePassword() {
  const { user, ready, refresh } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (ready && !user) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (p1 !== p2) return setErr(t('passwords_mismatch'));
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: cur, new_password: p1 });
      await refresh();
      nav('/');
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Shell>
      <h2 className="mb-1 text-xl font-bold text-slate-900">{t('new_password_title')}</h2>
      <p className="mb-5 text-sm text-slate-500">{t('new_password_hint')}</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('current_password')}><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></Field>
        <Field label={t('new_password')} hint={t('password_rules')}><input className="input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} required minLength={8} autoComplete="new-password" /></Field>
        <Field label={t('repeat_password')}><input className="input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} required autoComplete="new-password" /></Field>
        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>{t('save')}</Button>
      </form>
    </Shell>
  );
}
