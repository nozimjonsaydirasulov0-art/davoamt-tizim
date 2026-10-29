// Oddiy i18n: kalit -> matn. Yangi til qo'shish uchun uz.ts nusxasini oling (ru.ts, en.ts) va LANGS ga qo'shing.
import { uz } from './uz';
import { ru } from './ru';
import { en } from './en';

export type Dict = typeof uz;
const LANGS: Record<string, Partial<Dict>> = { uz, ru, en };
export const LANG_NAMES: Record<string, string> = { uz: 'O‘zbekcha', ru: 'Русский', en: 'English' };

let lang = 'uz';
try { lang = localStorage.getItem('lang') || 'uz'; } catch { /* ignore */ }

export function setLang(l: string) {
  lang = LANGS[l] ? l : 'uz';
  try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  location.reload();
}
export const getLang = () => lang;

export function t(key: keyof Dict, vars?: Record<string, string | number>): string {
  let s = (LANGS[lang]?.[key] ?? uz[key] ?? key) as string;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const WEEKDAYS = () => [t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat'), t('sun')];

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
// Brauzer lokaliga bog'liq bo'lmagan formatlash (uz-UZ ko'p brauzerlarda to'liq qo'llab-quvvatlanmaydi)
export function fmtDate(d?: string | null) {
  if (!d) return '—';
  const x = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return `${pad(x.getDate())}.${pad(x.getMonth() + 1)}.${x.getFullYear()}`;
}
export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  const x = new Date(d);
  return `${fmtDate(d)} ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}
export const fmtLongDate = (x: Date) => `${x.getDate()}-${MONTHS[x.getMonth()]}, ${x.getFullYear()}`;
export function fmtSize(n?: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
