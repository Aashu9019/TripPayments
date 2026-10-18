import { Link } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useLoadedTrip } from '../lib/trip-context';
import { dateRange, money } from '../lib/format';
import { Avatar, TopBar } from '../components/ui';
import { EntryRow } from '../components/EntryRow';
import { useOpenEntry, useOpenSwitcher } from './TripShell';
import { TripTitle } from '../components/TripSwitcher';
import { shareInvite } from '../lib/share';

export function Home() {
  const { data, me, member, code } = useLoadedTrip();
  const open = useOpenEntry();
  const openSwitcher = useOpenSwitcher();
  const { ledger, trip } = data;
  const cur = trip.currency;
  const myNet = me ? (ledger.net[me.id] ?? 0) : 0;
  const myMoves = ledger.transfers.filter((t) => t.from === me?.id || t.to === me?.id);
  const people = data.members.filter((m) => !m.left_at || ledger.spent[m.id]);
  const maxSpent = Math.max(1, ...people.map((m) => ledger.spent[m.id] ?? 0));
  const keeper = member(ledger.fund.keeperId);

  return (
    <>
      <TopBar>
        <TripTitle
          name={trip.name}
          sub={[trip.destination, dateRange(trip.start_date, trip.end_date)].filter(Boolean).join(' · ') || code}
          onOpen={openSwitcher}
        />
        <button className="icon-btn" aria-label="Invite friends" onClick={() => shareInvite(code, trip.name)}>
          <Share2 size={20} />
        </button>
      </TopBar>

      <div className="cols">
        <div>
          <section className="hero" aria-live="polite">
            <div className="hero-label">{myNet > 0 ? 'You get back' : myNet < 0 ? 'You owe' : 'Your balance'}</div>
            <p className={`hero-amount ${myNet > 0 ? 'plus' : myNet < 0 ? 'minus' : ''}`}>
              {myNet === 0 ? 'All square' : money(Math.abs(myNet), cur)}
            </p>
            {myMoves.length > 0 && (
              <ul className="moves">
                {myMoves.map((t) => {
                  const iPay = t.from === me?.id;
                  const other = member(iPay ? t.to : t.from);
                  return (
                    <li key={`${t.from}-${t.to}`}>
                      <Avatar member={other} size="sm" />
                      <span className="row-main">
                        {iPay ? (
                          <>
                            Pay <strong>{other?.name}</strong>
                          </>
                        ) : (
                          <>
                            <strong>{other?.name}</strong> pays you
                          </>
                        )}
                      </span>
                      <span className="num">{money(t.amount, cur)}</span>
                      {iPay && (
                        <button className="btn small" onClick={() => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount })}>
                          Paid
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="stats">
            <div className="stat">
              <div className="stat-label">Trip total</div>
              <div className="stat-value">{money(ledger.total, cur)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Your share</div>
              <div className="stat-value">{money(me ? (ledger.spent[me.id] ?? 0) : 0, cur)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Fund left</div>
              <div className="stat-value">{money(ledger.fund.cash, cur)}</div>
            </div>
          </div>
          {ledger.fund.in > 0 && keeper && (
            <p className="hint" style={{ marginTop: 8 }}>
              {keeper.id === me?.id ? 'You hold' : `${keeper.name} holds`} the common fund. {money(ledger.fund.in, cur)} in, {money(ledger.fund.out, cur)} spent.
            </p>
          )}

          <section className="section">
            <div className="section-head">Who spent what</div>
            <ul className="list">
              {people.map((m) => {
                const s = ledger.spent[m.id] ?? 0;
                const n = ledger.net[m.id] ?? 0;
                return (
                  <li key={m.id} className="row">
                    <Avatar member={m} />
                    <div className="row-main">
                      <div className="row-title">
                        {m.name}
                        {m.id === me?.id && <span className="faint"> (you)</span>}
                      </div>
                      <div className="bar" aria-hidden>
                        <span style={{ width: `${(s / maxSpent) * 100}%`, background: `var(--m${m.color % 8})` }} />
                      </div>
                    </div>
                    <div className="row-end">
                      <div className="row-title">{money(s, cur)}</div>
                      <div className={`row-sub ${n > 0 ? 'plus' : n < 0 ? 'minus' : ''}`}>
                        {n === 0 ? 'settled' : n > 0 ? `gets ${money(n, cur)}` : `owes ${money(-n, cur)}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="section">
          <div className="section-head">
            Recent
            {data.entries.length > 5 && (
              <Link to={`/t/${code}/spend`} className="link-btn">
                See all
              </Link>
            )}
          </div>
          {data.entries.length ? (
            <ul className="list">
              {data.entries.slice(0, 6).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          ) : (
            <div className="empty">
              <strong>Nothing spent yet</strong>
              <p>Collected money for the trip? Add it as "Into fund" first.</p>
              <button className="btn" onClick={() => open({ kind: 'deposit' })}>
                Add to common fund
              </button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
