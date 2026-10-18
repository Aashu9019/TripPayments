import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, sessions } from '../lib/api';
import { Avatar, Spinner, TopBar } from '../components/ui';
import type { TripState } from '../lib/types';

export function JoinTrip() {
  const { code: param } = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [trip, setTrip] = useState<TripState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!param) return;
    if (sessions.get(param)) {
      nav(`/t/${param.toUpperCase()}`, { replace: true });
      return;
    }
    setError('');
    api
      .getTrip(param)
      .then((r) => 'trip' in r && setTrip(r))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the trip'));
  }, [param, nav]);

  function findTrip(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length === 6) nav(`/join/${c}`);
  }

  async function join(body: { memberId?: string; name?: string }) {
    if (!param || !trip) return;
    setBusy(true);
    try {
      const res = await api.join(param, body);
      sessions.set(param, { memberId: res.memberId, token: res.token, tripName: trip.trip.name });
      nav(`/t/${param.toUpperCase()}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not join');
      setBusy(false);
    }
  }

  const back = (
    <button className="icon-btn" onClick={() => nav(param ? '/join' : '/')} aria-label="Back">
      <ChevronLeft size={22} />
    </button>
  );

  if (!param) {
    return (
      <div className="frame narrow">
        <div className="screen">
          <TopBar>
            {back}
            <h1>Join a trip</h1>
          </TopBar>
          <form onSubmit={findTrip} style={{ paddingTop: 24 }}>
            <label className="field">
              <span>Trip code from your leader</span>
              <input
                className="input code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6))}
                placeholder="ABC123"
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
              />
            </label>
            <div className="pad">
              <button className="btn block" disabled={code.length !== 6}>
                Continue
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const open = trip?.members.filter((m) => !m.claimed && !m.left_at) ?? [];

  return (
    <div className="frame narrow">
      <div className="screen">
        <TopBar>
          {back}
          <h1>
            {trip?.trip.name ?? 'Join'}
            <span className="sub num">{param.toUpperCase()}</span>
          </h1>
        </TopBar>
        {error ? (
          <div className="empty">
            <strong>{error}</strong>
            <p>Check the code with your trip leader.</p>
          </div>
        ) : !trip ? (
          <div className="center-fill">
            <Spinner />
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <section className="section">
                <div className="section-head">Which one is you?</div>
                <ul className="list">
                  {open.map((m) => (
                    <li key={m.id}>
                      <button className="row" disabled={busy} onClick={() => join({ memberId: m.id })}>
                        <Avatar member={m} />
                        <div className="row-main row-title">{m.name}</div>
                        <ChevronRight size={18} className="faint" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <form
              className="section"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) join({ name });
              }}
            >
              <div className="section-head">{open.length ? 'Not on the list?' : 'Your name'}</div>
              <label className="field">
                <span className="visually-hidden">Your name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
              </label>
              <div className="pad">
                <button className="btn block" disabled={busy || !name.trim()}>
                  Join {trip.trip.name}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
