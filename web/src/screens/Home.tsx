import { Link } from 'react-router-dom';
import { ArrowRight, Check, Share2 } from 'lucide-react';
import { useLoadedTrip } from '../lib/trip-context';
import { dateRange, money } from '../lib/format';
import { Avatar, TopBar } from '../components/ui';
import { EntryRow } from '../components/EntryRow';
import { CategoryDonut, RingTile } from '../components/charts';
import { TripTitle } from '../components/TripSwitcher';
import { useOpenEntry, useOpenSwitcher } from './TripShell';
import { shareInvite } from '../lib/share';
import { suggested, useSettleMode } from '../lib/settle-mode';

export function Home() {
  const { data, me, member, code } = useLoadedTrip();
  const open = useOpenEntry();
  const openSwitcher = useOpenSwitcher();
  const [settleMode] = useSettleMode();
  const { ledger, trip } = data;
  const cur = trip.currency;
  const myNet = me ? (ledger.net[me.id] ?? 0) : 0;
  const myShare = me ? (ledger.spent[me.id] ?? 0) : 0;
  const myMoves = suggested(ledger, settleMode).filter((t) => t.from === me?.id || t.to === me?.id);
  const keeper = member(ledger.fund.keeperId);
  const empty = data.entries.length === 0;

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
          {/* 1. Your number, and what to do about it. */}
          <section className={`balance-block ${myNet > 0 ? 'is-plus' : myNet < 0 ? 'is-minus' : ''}`} aria-live="polite">
            <div className="hero-label">{myNet > 0 ? 'You get back' : myNet < 0 ? 'You owe' : 'Your balance'}</div>
            <p className="hero-amount num">{myNet === 0 ? 'All square' : money(Math.abs(myNet), cur)}</p>
            {myMoves.length > 0 && (
              <ul className="moves-v2">
                {myMoves.map((t) => {
                  const iPay = t.from === me?.id;
                  const other = member(iPay ? t.to : t.from);
                  return (
                    <li key={`${t.from}-${t.to}`}>
                      <Avatar member={other} size="sm" />
                      <span className="mv-text">
                        {iPay ? (
                          <>
                            <ArrowRight size={13} /> {other?.name.split(' ')[0]}
                          </>
                        ) : (
                          <>{other?.name.split(' ')[0]} pays you</>
                        )}
                      </span>
                      <span className="mv-amt num">{money(t.amount, cur)}</span>
                      {iPay && (
                        <button
                          className="mv-done"
                          aria-label={`Mark paid to ${other?.name}`}
                          onClick={() => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount })}
                        >
                          <Check size={16} strokeWidth={2.6} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {empty ? (
            <div className="empty">
              <strong>Nothing spent yet</strong>
              <p>Pooled money first? Add it to the common fund.</p>
              <button className="btn" onClick={() => open({ kind: 'deposit' })}>
                Add to common fund
              </button>
            </div>
          ) : (
            <>
              {/* 2. Where the money went. */}
              {ledger.total > 0 && (
                <section className="section">
                  <div className="section-head">Where the trip money went</div>
                  <CategoryDonut entries={data.entries} currency={cur} />
                </section>
              )}

              {/* 3. Two quick rings. */}
              <div className="ring-row">
                {ledger.fund.in > 0 && (
                  <RingTile
                    value={ledger.fund.cash}
                    of={ledger.fund.in}
                    color="var(--accent)"
                    label={keeper && keeper.id !== me?.id ? `Fund left · ${keeper.name.split(' ')[0]}` : 'Fund left'}
                    amount={`${money(ledger.fund.cash, cur)} of ${money(ledger.fund.in, cur)}`}
                  />
                )}
                <RingTile value={myShare} of={ledger.total} color={`var(--m${(me?.color ?? 0) % 8})`} label="Your share" amount={money(myShare, cur)} />
              </div>
            </>
          )}
        </div>

        {!empty && (
          <section className="section">
            <div className="section-head">
              Recent
              <Link to={`/t/${code}/spend`} className="link-btn">
                See all
              </Link>
            </div>
            <ul className="list">
              {data.entries.slice(0, 3).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
