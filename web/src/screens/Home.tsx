import { Link } from 'react-router-dom';
import { ArrowRight, Check, Share2 } from 'lucide-react';
import { useLoadedTrip } from '../lib/trip-context';
import { dateRange, money } from '../lib/format';
import { Avatar, TopBar } from '../components/ui';
import { EntryRow } from '../components/EntryRow';
import { CategoryBar, FundBar } from '../components/charts';
import { TripTitle } from '../components/TripSwitcher';
import { useOpenEntry, useOpenSwitcher } from './TripShell';
import { shareInvite } from '../lib/share';

export function Home() {
  const { data, me, member, code } = useLoadedTrip();
  const open = useOpenEntry();
  const openSwitcher = useOpenSwitcher();
  const { ledger, trip } = data;
  const cur = trip.currency;
  const myNet = me ? (ledger.net[me.id] ?? 0) : 0;
  const myShare = me ? (ledger.spent[me.id] ?? 0) : 0;
  const myMoves = ledger.transfers.filter((t) => t.from === me?.id || t.to === me?.id);
  const people = data.members.filter((m) => !m.left_at || ledger.spent[m.id]);
  const maxSpent = Math.max(1, ...people.map((m) => ledger.spent[m.id] ?? 0));

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
            <div className="hero-pills num">
              <span>
                Your share <b>{money(myShare, cur)}</b>
              </span>
              <span>
                Trip <b>{money(ledger.total, cur)}</b>
              </span>
            </div>
          </section>

          {myMoves.length > 0 && (
            <ul className="transfers compact">
              {myMoves.map((t) => {
                const iPay = t.from === me?.id;
                const other = member(iPay ? t.to : t.from);
                return (
                  <li key={`${t.from}-${t.to}`} data-mine="true">
                    <div className="xfer-people">
                      <span className="xfer-person">
                        <Avatar member={iPay ? me : other} size="sm" />
                        <span>{iPay ? 'You' : other?.name.split(' ')[0]}</span>
                      </span>
                      <span className="xfer-arrow" aria-hidden>
                        <ArrowRight size={14} />
                      </span>
                      <span className="xfer-person">
                        <Avatar member={iPay ? other : me} size="sm" />
                        <span>{iPay ? other?.name.split(' ')[0] : 'You'}</span>
                      </span>
                    </div>
                    <span className="xfer-amt num">{money(t.amount, cur)}</span>
                    {iPay && (
                      <button
                        className="xfer-done"
                        aria-label={`Mark paid to ${other?.name}`}
                        onClick={() => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount })}
                      >
                        <Check size={18} strokeWidth={2.4} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {ledger.total > 0 && (
            <section className="section">
              <div className="section-head">Where it went</div>
              <CategoryBar entries={data.entries} currency={cur} />
            </section>
          )}

          <FundBar fund={ledger.fund} keeper={member(ledger.fund.keeperId)} currency={cur} />

          {ledger.total > 0 && (
            <section className="section">
              <div className="section-head">Each person’s share</div>
              <ul className="share-bars">
                {people.map((m) => {
                  const s = ledger.spent[m.id] ?? 0;
                  return (
                    <li key={m.id}>
                      <Avatar member={m} size="sm" />
                      <span className="bal-name">{m.id === me?.id ? 'You' : m.name.split(' ')[0]}</span>
                      <span className="share-track" aria-hidden>
                        <span style={{ width: `${(s / maxSpent) * 100}%`, background: `var(--m${m.color % 8})` }} />
                      </span>
                      <span className="bal-amt num">{money(s, cur)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
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
              {data.entries.slice(0, 5).map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </ul>
          ) : (
            <div className="empty">
              <strong>Nothing spent yet</strong>
              <p>Pooled money first? Add it to the common fund.</p>
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
