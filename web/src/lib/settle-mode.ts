import { useEffect, useState } from 'react';
import type { Ledger } from './types';

/** How Settle and Home suggest payments: pair by pair, or the fewest transfers. */
export type SettleMode = 'direct' | 'fewest';
const KEY = 'sajilotrip:settle-mode';

const read = (): SettleMode => {
  try {
    return localStorage.getItem(KEY) === 'fewest' ? 'fewest' : 'direct';
  } catch {
    return 'direct';
  }
};

export function useSettleMode() {
  const [mode, setMode] = useState<SettleMode>(read);
  useEffect(() => {
    const on = () => setMode(read());
    window.addEventListener('settlemodechange', on);
    return () => window.removeEventListener('settlemodechange', on);
  }, []);
  const set = (m: SettleMode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('settlemodechange'));
  };
  return [mode, set] as const;
}

/** Older cached trips have no `direct`; fall back to the simplified list. */
export const suggested = (ledger: Ledger, mode: SettleMode) =>
  mode === 'direct' && ledger.direct ? ledger.direct : ledger.transfers;
