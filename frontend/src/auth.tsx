import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, onAuthError, setCsrf } from './api';

export interface User {
  id: string; role: 'teacher' | 'student'; username: string; full_name: string; must_change_password: boolean;
  student_id?: string | null; public_id?: string; group_id?: string; group_name?: string; course?: number; direction?: string;
}

interface AuthCtx { user: User | null; ready: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; }
const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: User | null; csrf?: string }>('/auth/me');
      if (r.csrf) setCsrf(r.csrf);
      setUser(r.user);
    } catch { setUser(null); }
    setReady(true);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => onAuthError(() => { refresh(); }), [refresh]);

  return <Ctx.Provider value={{ user, ready, refresh, logout }}>{children}</Ctx.Provider>;
}
