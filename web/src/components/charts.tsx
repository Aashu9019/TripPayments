import { CATEGORIES, money } from '../lib/format';
import type { Entry, Member } from '../lib/types';
import { Avatar } from './ui';

const CAT_COLOR: Record<string, string> = {
  food: 'var(--m1)',
  stay: 'var(--m2)',
  transport: 'var(--m5)',
  permit: 'var(--m4)',
  guide: 'var(--m0)',
  gear: 'var(--m3)',
  other: 'var(--ink-3)',
};

/** One stacked bar of spend by category, with a legend under it. */
export function CategoryBar({ entries, currency }: { entries: Entry[]; currency: string }) {
  const sums = new Map<string, number>();
  for (const e of entries) if (e.kind === 'expense') sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  const parts = CATEGORIES.map((c) => ({ ...c, v: sums.get(c.id) ?? 0 })).filter((p) => p.v > 0).sort((a, b) => b.v - a.v);
  return (
    <div className="catbar">
      <div className="catbar-track" role="img" aria-label="Spending by category">
        {parts.map((p) => (
          <span key={p.id} style={{ flexGrow: p.v, background: CAT_COLOR[p.id] }} />
        ))}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.id}>
            <i style={{ background: CAT_COLOR[p.id] }} />
            {p.label}
            <span className="num">{money(p.v, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Common fund: spent vs left in one bar. */
export function FundBar({ fund, keeper, currency }: { fund: { in: number; out: number; cash: number }; keeper?: Member; currency: string }) {
  if (!fund.in) return null;
  const spentPct = Math.min(100, (fund.out / fund.in) * 100);
  return (
    <div className="fundbar">
      <div className="fundbar-head">
        <span>Common fund</span>
        {keeper && (
          <span className="fundbar-keeper">
            <Avatar member={keeper} size="sm" /> holds it
          </span>
        )}
      </div>
      <div className="fundbar-track" role="img" aria-label={`${Math.round(spentPct)}% of the fund spent`}>
        <span style={{ width: `${spentPct}%` }} />
      </div>
      <div className="fundbar-legend num">
        <span>
          <i className="spent" /> Spent {money(fund.out, currency)}
        </span>
        <span>
          <i className="left" /> Left {money(fund.cash, currency)}
        </span>
      </div>
    </div>
  );
}

/** Diverging bars: owed-to on the right in green, owing on the left in red. */
export function BalanceChart({ members, net, currency, meId }: { members: Member[]; net: Record<string, number>; currency: string; meId?: string }) {
  const max = Math.max(1, ...members.map((m) => Math.abs(net[m.id] ?? 0)));
  return (
    <ul className="balances">
      {members.map((m) => {
        const n = net[m.id] ?? 0;
        const w = `${(Math.abs(n) / max) * 50}%`;
        return (
          <li key={m.id}>
            <Avatar member={m} size="sm" />
            <span className="bal-name">
              {m.id === meId ? 'You' : m.name.split(' ')[0]}
              {m.left_at && <span className="tag">left</span>}
            </span>
            <span className="bal-track" aria-hidden>
              <span className={n >= 0 ? 'bal-plus' : 'bal-minus'} style={{ width: w }} />
            </span>
            <span className={`bal-amt num ${n > 0 ? 'plus' : n < 0 ? 'minus' : 'faint'}`}>
              {n === 0 ? '✓' : money(n, currency, { sign: true })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
