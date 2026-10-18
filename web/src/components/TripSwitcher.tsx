import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, LogIn, LogOut, Plus } from 'lucide-react';
import { api, cache } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { dateRange, money } from '../lib/format';
import type { MyTrip } from '../lib/types';
import { Sheet, Spinner } from './ui';
import { formatPhone } from './ContactButtons';

/** The signed-in user's trips: cached copy first, then fresh from the server. */
export function useMyTrips(active = true) {
  const [trips, setTrips] = useState<MyTrip[] | null>(() => cache.trips());
  const [error, setError] = useState(false);
  const load = useCallback(() => {
    api
      .myTrips()
      .then((r) => {
        cache.setTrips(r.trips);
        setTrips(r.trips);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);
  useEffect(() => {
    if (active) load();
  }, [active, load]);
  return { trips, error, reload: load };
}

export function TripList({ trips, current, onPick }: { trips: MyTrip[]; current?: string; onPick: (code: string) => void }) {
  return (
    <ul className="list">
      {trips.map((t) => {
        const meta = [t.destination, dateRange(t.start_date, t.end_date), `${t.people} ${t.people === 1 ? 'person' : 'people'}`]
          .filter(Boolean)
          .join(' · ');
        return (
          <li key={t.code}>
            <button className="row" onClick={() => onPick(t.code)} aria-current={t.code === current ? 'true' : undefined}>
              <div className="row-main">
                <div className="row-title">
                  {t.name} {t.role === 'leader' && <span className="tag">Leader</span>}
                </div>
                <div className="row-sub">{meta}</div>
              </div>
              <div className="row-end">
                <div className={`row-sub ${t.net > 0 ? 'plus' : t.net < 0 ? 'minus' : ''}`}>
                  {t.net === 0 ? (t.total ? 'square' : 'no spend yet') : t.net > 0 ? `gets ${money(t.net, t.currency)}` : `owes ${money(-t.net, t.currency)}`}
                </div>
              </div>
              {t.code === current && <Check size={18} className="accent-ink" aria-label="Current trip" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function TripSwitcher({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: string }) {
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const { trips } = useMyTrips(open);
  const go = (to: string) => {
    onOpenChange(false);
    nav(to);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Your trips">
      {trips ? (
        <TripList trips={trips} current={current} onPick={(code) => go(`/t/${code}`)} />
      ) : (
        <div className="center-fill" style={{ minHeight: 120 }}>
          <Spinner />
        </div>
      )}
      <ul className="list" style={{ marginTop: 16 }}>
        <li>
          <button className="row" onClick={() => go('/new')}>
            <span className="glyph">
              <Plus size={18} />
            </span>
            <div className="row-main row-title">Start a new trip</div>
          </button>
        </li>
        <li>
          <button className="row" onClick={() => go('/join')}>
            <span className="glyph">
              <LogIn size={18} />
            </span>
            <div className="row-main row-title">Join with a code</div>
          </button>
        </li>
        <li>
          <button
            className="row"
            onClick={() => {
              onOpenChange(false);
              signOut();
            }}
          >
            <span className="glyph">
              <LogOut size={18} />
            </span>
            <div className="row-main">
              <div className="row-title">Sign out</div>
              <div className="row-sub">
                {user?.name} · {user ? formatPhone(user.phone) : ''}
              </div>
            </div>
          </button>
        </li>
      </ul>
    </Sheet>
  );
}

/** Trip name in the top bar; tapping it opens the switcher. */
export function TripTitle({ name, sub, onOpen }: { name: string; sub: string; onOpen: () => void }) {
  return (
    <h1>
      <button className="title-btn" onClick={onOpen} aria-label={`${name}, switch trip`}>
        <span className="title-text">{name}</span>
        <ChevronDown size={16} className="faint" />
      </button>
      <span className="sub">{sub}</span>
    </h1>
  );
}
