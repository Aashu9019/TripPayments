import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, auth, setSignedOutHandler } from './api';
import type { User } from './types';
import { ForcePasswordChange } from '../components/PasswordForm';

interface AuthCtx {
  user: User | null;
  signIn: (res: { token: string; user: User }) => void;
  signOut: () => Promise<void>;
  /** Patch the signed-in user (after a profile change). */
  updateUser: (patch: Partial<User>) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => auth.get()?.user ?? null);

  const clear = useCallback(() => {
    auth.set(null);
    try {
      // Drop cached trips so the next person on this phone sees nothing of yours.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sajilotrip:'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  useEffect(() => setSignedOutHandler(clear), [clear]);

  const value: AuthCtx = {
    user,
    signIn: (res) => {
      auth.set(res);
      setUser(res.user);
    },
    updateUser: (patch) => {
      const cur = auth.get();
      if (!cur) return;
      const next = { ...cur, user: { ...cur.user, ...patch } };
      auth.set(next);
      setUser(next.user);
    },
    signOut: async () => {
      await api.logout().catch(() => {});
      clear();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Sends signed-out visitors to sign-in, then back to where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  return <>{children}</>;
}
