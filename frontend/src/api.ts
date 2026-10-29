// API qatlami: cookie (httpOnly) + CSRF header
let csrfToken = '';
export const setCsrf = (t: string) => { csrfToken = t; };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Listener = (status: number) => void;
const authListeners = new Set<Listener>();
export const onAuthError = (fn: Listener) => { authListeners.add(fn); return () => { authListeners.delete(fn); }; };

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${url}`, {
    method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 428) authListeners.forEach((f) => f(res.status));
    throw new ApiError(res.status, data?.error ?? `Xato (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T = any>(url: string) => request<T>('DELETE', url, {}),
  upload: <T = any>(url: string, form: FormData) => request<T>('POST', url, form, true),
};

export const qs = (o: Record<string, string | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
  return p ? `?${p}` : '';
};

export const fileUrl = (kind: 'material' | 'assignment' | 'submission', id: string, inline = false) => `/api/files/${kind}/${id}${inline ? '?inline=1' : ''}`;
