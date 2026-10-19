import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, cache } from './api';
import type { Member, TripState } from './types';

const POLL_MS = 6000;

interface TripCtx {
  code: string;
  data: TripState | null;
  me: Member | null;
  isLeader: boolean;
  online: boolean;
  /** The trip no longer exists (deleted by its leader or an admin). */
  gone: boolean;
  /** Run a mutation then pull fresh state. Errors bubble to the caller. */
  mutate: <T>(fn: () => Promise<T>) => Promise<T>;
  refresh: () => Promise<void>;
  member: (id: string | null | undefined) => Member | undefined;
}

const Ctx = createContext<TripCtx | null>(null);

export function TripProvider({ code, children }: { code: string; children: ReactNode }) {
  const [data, setData] = useState<TripState | null>(() => cache.get(code));
  const [online, setOnline] = useState(true);
  const [gone, setGone] = useState(false);
  const version = useRef<number | undefined>(data?.version);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getTrip(code, version.current);
      setOnline(true);
      if ('unchanged' in res) return;
      version.current = res.version;
      cache.set(code, res);
      setData(res);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOnline(false);
      else if (e instanceof ApiError && e.status === 404) setGone(true);
      else throw e;
    }
  }, [code]);

  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') refresh().catch(() => {});
      timer = window.setTimeout(tick, POLL_MS);
    };
    tick();
    const onVisible = () => document.visibilityState === 'visible' && refresh().catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh]);

  const mutate = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      const out = await fn();
      await refresh().catch(() => {});
      return out;
    },
    [refresh],
  );

  const value = useMemo<TripCtx>(() => {
    const byId = new Map(data?.members.map((m) => [m.id, m]));
    const me = (data?.meId && byId.get(data.meId)) || null;
    return {
      code,
      data,
      me,
      isLeader: me?.role === 'leader',
      online,
      gone,
      mutate,
      refresh,
      member: (id) => (id ? byId.get(id) : undefined),
    };
  }, [code, data, online, gone, mutate, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrip() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTrip outside TripProvider');
  return v;
}

/** Same as useTrip but asserts data has loaded. Use below the shell's loading gate. */
export function useLoadedTrip() {
  const v = useTrip();
  if (!v.data) throw new Error('Trip not loaded');
  return { ...v, data: v.data };
}
