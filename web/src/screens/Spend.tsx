import { useMemo, useRef, useState } from 'react';
import { useLoadedTrip } from '../lib/trip-context';
import { dayLabel, money } from '../lib/format';
import { TopBar } from '../components/ui';
import { EntryRow } from '../components/EntryRow';
import { useOpenEntry } from './TripShell';
import type { Entry } from '../lib/types';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Involving me' },
  { id: 'expense', label: 'Expenses' },
  { id: 'deposit', label: 'Fund' },
  { id: 'payment', label: 'Settlements' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

export function Spend() {
  const { data, me } = useLoadedTrip();
  const open = useOpenEntry();
  const [filter, setFilter] = useState<Filter>('all');
  // Rows that arrive after first paint (yours or a friend's via sync) get a short rise-in.
  const seen = useRef(new Set(data.entries.map((e) => e.id)));

  const groups = useMemo(() => {
    const keep = (e: Entry) => {
      if (filter === 'all') return true;
      if (filter === 'mine') return !!me && (e.from_id === me.id || e.to_id === me.id || me.id in e.shares);
      return e.kind === filter;
    };
    const map = new Map<string, Entry[]>();
    for (const e of data.entries.filter(keep)) {
      const k = e.date.slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [data.entries, filter, me]);

  const cur = data.trip.currency;

  return (
    <>
      <TopBar>
        <h1>Spend</h1>
        <span className="muted num">{money(data.ledger.total, cur)}</span>
      </TopBar>
      <div className="chips" role="radiogroup" aria-label="Filter" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {FILTERS.map((f) => (
          <button key={f.id} className="chip" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <strong>{data.entries.length ? 'Nothing here' : 'No payments yet'}</strong>
          <p>{data.entries.length ? 'Try another filter.' : 'Add the first one — it takes ten seconds.'}</p>
          {!data.entries.length && (
            <button className="btn" onClick={() => open()}>
              Add expense
            </button>
          )}
        </div>
      ) : (
        groups.map(([day, entries]) => {
          const dayTotal = entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
          return (
            <section key={day} className="section">
              <div className="section-head">
                <span>{dayLabel(day)}</span>
                {dayTotal > 0 && <span className="num">{money(dayTotal, cur)}</span>}
              </div>
              <ul className="list">
                {entries.map((e) => {
                  const fresh = !seen.current.has(e.id);
                  seen.current.add(e.id);
                  return <EntryRow key={e.id} entry={e} fresh={fresh} />;
                })}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
