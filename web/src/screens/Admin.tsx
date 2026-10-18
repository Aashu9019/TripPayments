import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LogOut, Search } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { dateRange, money } from '../lib/format';
import type { AdminStats, AdminTrip, AdminTripDetail, AdminUser } from '../lib/types';
import { Sheet, Spinner, TopBar } from '../components/ui';
import { formatPhone } from '../components/ContactButtons';

const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

export function Admin() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<'trips' | 'people'>('trips');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trips, setTrips] = useState<AdminTrip[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [trip, setTrip] = useState<AdminTripDetail | null>(null);
  const [person, setPerson] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.stats().then(setStats).catch((e) => toast.error(errMsg(e)));
    adminApi.trips(search).then((r) => setTrips(r.trips)).catch(() => {});
    adminApi.users(search).then((r) => setUsers(r.users)).catch(() => {});
  }, [search]);

  // Debounce search so typing doesn't fire a request per key.
  useEffect(() => {
    const id = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(id);
  }, [load, search]);

  async function openTrip(code: string) {
    try {
      setTrip(await adminApi.trip(code));
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function run(fn: () => Promise<unknown>, done: string, close: () => void) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      close();
      load();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="frame admin">
      <div className="screen">
        <TopBar>
          <h1>
            Admin
            <span className="sub">SajiloTrip · {user ? formatPhone(user.phone) : ''}</span>
          </h1>
          <Link to="/?all" className="link-btn" style={{ fontSize: 14 }}>
            Open app
          </Link>
          <button className="icon-btn" onClick={() => signOut()} aria-label="Sign out">
            <LogOut size={20} />
          </button>
        </TopBar>

        <div className="stats admin-stats">
          <Stat label="People" value={stats?.users} note={stats ? `+${stats.users_week} this week` : ''} />
          <Stat label="Trips" value={stats?.trips} note={stats ? `+${stats.trips_week} this week` : ''} />
          <Stat label="Active trips" value={stats?.active_trips} note="last 7 days" />
          <Stat label="Entries" value={stats?.entries} note="" />
          <Stat label="Money tracked" value={stats ? money(stats.spent) : undefined} note="all expenses" />
        </div>

        <div className="segmented" role="radiogroup" aria-label="View" style={{ marginTop: 20 }}>
          <button role="radio" aria-checked={tab === 'trips'} onClick={() => setTab('trips')}>
            Trips {trips ? `· ${trips.length}` : ''}
          </button>
          <button role="radio" aria-checked={tab === 'people'} onClick={() => setTab('people')}>
            People {users ? `· ${users.length}` : ''}
          </button>
        </div>

        <label className="field search-field">
          <Search size={18} className="faint" aria-hidden />
          <input
            className="input"
            type="search"
            placeholder={tab === 'trips' ? 'Search trip name, place or code' : 'Search name or phone'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </label>

        {tab === 'trips' ? (
          !trips ? (
            <div className="center-fill" style={{ minHeight: 160 }}>
              <Spinner />
            </div>
          ) : trips.length === 0 ? (
            <div className="empty">
              <strong>No trips</strong>
            </div>
          ) : (
            <ul className="list">
              {trips.map((t) => (
                <li key={t.code}>
                  <button className="row" onClick={() => openTrip(t.code)}>
                    <div className="row-main">
                      <div className="row-title">
                        {t.name} <span className="faint num">{t.code}</span>
                      </div>
                      <div className="row-sub">
                        {[t.leader && `led by ${t.leader}`, `${t.people} people`, `${t.entries} entries`, `active ${ago(t.last_activity)}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="row-end row-title">{money(t.total, t.currency)}</div>
                    <ChevronRight size={18} className="faint" />
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : !users ? (
          <div className="center-fill" style={{ minHeight: 160 }}>
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <div className="empty">
            <strong>No people</strong>
          </div>
        ) : (
          <ul className="list">
            {users.map((u) => (
              <li key={u.id}>
                <button className="row" onClick={() => setPerson(u)}>
                  <div className="row-main">
                    <div className="row-title">{u.name}</div>
                    <div className="row-sub num">
                      {formatPhone(u.phone)} · {u.trips} trips{u.leading ? ` (leads ${u.leading})` : ''} · last sign-in {ago(u.last_login)}
                    </div>
                  </div>
                  <ChevronRight size={18} className="faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet
        open={!!trip}
        onOpenChange={(o) => !o && setTrip(null)}
        title={trip?.trip.name ?? 'Trip'}
        footer={
          trip && (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                confirm(`Delete "${trip.trip.name}" and all its payments for everyone? This cannot be undone.`) &&
                run(() => adminApi.deleteTrip(trip.trip.code), 'Trip deleted', () => setTrip(null))
              }
            >
              Delete trip
            </button>
          )
        }
      >
        {trip && (
          <>
            <p className="hint" style={{ marginTop: 0 }}>
              {[trip.trip.code, trip.trip.destination, `created ${dateRange(trip.trip.created_at.slice(0, 10), null)}`].filter(Boolean).join(' · ')}
            </p>
            <div className="stats">
              <Stat label="Total" value={money(trip.total, trip.trip.currency)} note="" />
              <Stat label="Fund in" value={money(trip.fund.in, trip.trip.currency)} note="" />
              <Stat label="Fund left" value={money(trip.fund.cash, trip.trip.currency)} note="" />
            </div>
            <div className="section">
              <div className="section-head">People</div>
              <ul className="list">
                {trip.members.map((m) => (
                  <li key={m.id} className="row">
                    <div className="row-main">
                      <div className="row-title">
                        {m.name} {m.role === 'leader' && <span className="tag accent">Leader</span>}
                      </div>
                      <div className="row-sub">
                        {m.left_at ? 'left · ' : ''}
                        {m.account_phone ? formatPhone(m.account_phone) : 'not joined'}
                      </div>
                    </div>
                    <div className="row-end">
                      <div className="row-title">{money(m.spent, trip.trip.currency)}</div>
                      <div className={`row-sub ${m.net > 0 ? 'plus' : m.net < 0 ? 'minus' : ''}`}>{money(m.net, trip.trip.currency, { sign: true })}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="section">
              <div className="section-head">Latest entries</div>
              {trip.entries.length ? (
                <ul className="list">
                  {trip.entries.map((e) => (
                    <li key={e.id} className="row">
                      <div className="row-main">
                        <div className="row-title">{e.title || e.kind}</div>
                        <div className="row-sub">
                          {e.kind} · {e.date.slice(0, 10)}
                        </div>
                      </div>
                      <div className="row-end">{money(e.amount, trip.trip.currency)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">No entries yet.</p>
              )}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!person} onOpenChange={(o) => !o && setPerson(null)} title={person?.name ?? 'Person'}>
        {person && (
          <div className="pad stack-gap">
            <p className="muted" style={{ margin: 0 }}>
              {formatPhone(person.phone)} · joined {person.created_at.slice(0, 10)} · {person.trips} trips · last sign-in {ago(person.last_login)}
            </p>
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => run(() => adminApi.signOutUser(person.id), 'Signed out on all devices', () => setPerson(null))}
            >
              Sign out on all devices
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() =>
                confirm(`Delete ${person.name}'s account? Their seats in trips stay (so balances still add up) but become unclaimed.`) &&
                run(() => adminApi.deleteUser(person.id), 'Account deleted', () => setPerson(null))
              }
            >
              Delete account
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string | undefined; note: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {note && <div className="stat-label">{note}</div>}
    </div>
  );
}
