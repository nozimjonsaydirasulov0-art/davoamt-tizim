import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './auth';

const Ctx = createContext<{ socket: Socket | null; connected: boolean }>({ socket: null, connected: false });
export const useSocket = () => useContext(Ctx);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user || user.must_change_password) return;
    const s = io({ withCredentials: true, transports: ['websocket', 'polling'] });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => { s.disconnect(); setSocket(null); setConnected(false); };
  }, [user?.id, user?.must_change_password]);

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

/** Socket hodisasiga obuna bo'lish (handler har renderda yangilansa ham qayta obuna bo'lmaydi) */
export function useSocketEvent<T = any>(event: string, handler: (data: T) => void) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const fn = (d: T) => ref.current(d);
    socket.on(event, fn);
    return () => { socket.off(event, fn); };
  }, [socket, event]);
}
