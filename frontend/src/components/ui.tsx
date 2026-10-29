import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { api } from '../api';
import { t } from '../i18n';

// ---------------- Button ----------------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
};
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; loading?: boolean }) {
  const sz = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-3 text-base', xl: 'px-6 py-5 text-lg' }[size];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${sz} ${className}`}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export const Card = ({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) => (
  <div className={`card ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
    )}
    <div className="p-4">{children}</div>
  </div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex flex-wrap gap-2">{actions}</div>
  </div>
);

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
  </label>
);

const BADGE: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', red: 'bg-rose-50 text-rose-700 ring-rose-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200', blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200', purple: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export const Badge = ({ color = 'gray', children }: { color?: keyof typeof BADGE | string; children: ReactNode }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[color] ?? BADGE.gray}`}>{children}</span>
);

export const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, [string, string]> = {
    not_started: ['gray', t('st_not_started')], working: ['yellow', t('st_working')], submitted: ['blue', t('st_submitted')],
    graded: ['green', t('st_graded')], present: ['green', t('present')], absent: ['red', t('absent')], late: ['yellow', t('late')],
  };
  const [c, l] = map[status] ?? ['gray', status];
  return <Badge color={c}>{l}</Badge>;
};

export const Empty = ({ text = t('empty'), icon = '📭' }: { text?: string; icon?: string }) => (
  <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
    <div className="mb-2 text-4xl">{icon}</div><div className="text-sm">{text}</div>
  </div>
);
export const Spinner = () => (
  <div className="flex justify-center py-10"><span className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" /></div>
);

export const Stat = ({ label, value, icon, color = 'brand', sub }: { label: string; value: ReactNode; icon: string; color?: string; sub?: ReactNode }) => {
  const bg: Record<string, string> = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', sky: 'bg-sky-50 text-sky-600', slate: 'bg-slate-100 text-slate-600' };
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${bg[color] ?? bg.brand}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-500 sm:text-xs">{label}</div>
        <div className="text-xl font-bold text-slate-900">{value}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  );
};

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label={t('close')}>✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: ReactNode }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tb) => (
        <button key={tb.key} onClick={() => onChange(tb.key)}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${value === tb.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

export const Table = ({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) => (
  <div className="-mx-4 overflow-x-auto sm:mx-0">
    <table className="min-w-full divide-y divide-slate-100">
      <thead className="bg-slate-50"><tr>{head.map((h, i) => <th key={i} className="th">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
    {empty && <Empty />}
  </div>
);

// ---------------- Toast ----------------
interface ToastItem { id: number; text: string; kind: 'ok' | 'err' | 'info' }
const ToastCtx = createContext<(text: string, kind?: ToastItem['kind']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastItem['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-16 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:max-w-sm">
        {items.map((i) => (
          <div key={i.id} className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${i.kind === 'err' ? 'bg-rose-600' : i.kind === 'info' ? 'bg-slate-800' : 'bg-emerald-600'}`}>{i.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------------- Data hooks ----------------
export function useFetch<T = any>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try { setData(await api.get<T>(url)); setError(null); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [url]);
  useEffect(() => { load(); }, [load, ...deps]); // eslint-disable-line
  return { data, loading, error, reload: load, setData };
}

/** Forma yuborish: xatoni toast qiladi */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (okText) toast(okText); return r; }
    catch (e: any) { toast(e.message ?? 'Xato', 'err'); return undefined; }
    finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}

export function SubjectGroupPicker({ subjectId, groupId, onChange, requireBoth = true }:
  { subjectId: string; groupId: string; onChange: (s: string, g: string) => void; requireBoth?: boolean }) {
  const { data: groups } = useFetch<any[]>('/t/groups');
  const group = groups?.find((g) => g.id === groupId);
  const subjects = group?.subjects ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input w-auto min-w-[160px]" value={groupId} onChange={(e) => onChange('', e.target.value)}>
        <option value="">{t('group')}: {requireBoth ? t('select') : t('all')}</option>
        {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <select className="input w-auto min-w-[220px]" value={subjectId} onChange={(e) => onChange(e.target.value, groupId)} disabled={!groupId}>
        <option value="">{t('subject')}: {requireBoth ? t('select') : t('all')}</option>
        {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
