import type React from 'react';
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

/** Compact amount for chart centers: Rs 58,450 -> "58.5k". */
function short(paisa: number) {
  const r = paisa / 100;
  if (r >= 100000) return `${(r / 100000).toFixed(r >= 1000000 ? 0 : 1)}L`;
  if (r >= 1000) return `${(r / 1000).toFixed(r >= 10000 ? 0 : 1)}k`;
  return String(Math.round(r));
}

/**
 * SVG donut. Segments are stroked arcs on one circle; a 1-unit gap separates them.
 * The ring draws itself in on mount (see .donut-seg in visual.css).
 */
export function Donut({
  parts,
  size = 168,
  stroke = 18,
  track = 'var(--paper-2)',
  children,
}: {
  parts: { key: string; value: number; color: string }[];
  size?: number;
  stroke?: number;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = Math.max(0, (p.value / total) * c - gap);
          const seg = (
            <circle
              key={p.key}
              className="donut-seg"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              style={{ animationDelay: `${i * 40}ms`, ['--len' as string]: len, ['--c' as string]: c }}
            />
          );
          offset += (p.value / total) * c;
          return seg;
        })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  );
}

/** Spending by category as a donut with the total in the middle and a legend. */
export function CategoryDonut({ entries, currency }: { entries: Entry[]; currency: string }) {
  const sums = new Map<string, number>();
  for (const e of entries) if (e.kind === 'expense') sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  const parts = CATEGORIES.map((c) => ({ ...c, v: sums.get(c.id) ?? 0 }))
    .filter((p) => p.v > 0)
    .sort((a, b) => b.v - a.v);
  return (
    <div className="cat-donut">
      <Donut parts={parts.map((p) => ({ key: p.id, value: p.v, color: CAT_COLOR[p.id] }))}>
        <span className="donut-big num">{short(total)}</span>
        <span className="donut-small">spent</span>
      </Donut>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.id}>
            <i style={{ background: CAT_COLOR[p.id] }} />
            <span className="dl-label">{p.label}</span>
            <span className="dl-pct num">{Math.round((p.v / total) * 100)}%</span>
            <span className="dl-amt num">{money(p.v, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small ring tile: one value against a whole, with a caption. */
export function RingTile({ value, of, color, label, amount }: { value: number; of: number; color: string; label: string; amount: string }) {
  const pct = of > 0 ? Math.min(100, Math.round((value / of) * 100)) : 0;
  return (
    <div className="ring-tile">
      <Donut parts={[{ key: 'v', value: Math.max(value, 0), color }, { key: 'rest', value: Math.max(of - value, 0), color: 'transparent' }]} size={64} stroke={8} track="var(--rule)">
        <span className="ring-pct num">{pct}%</span>
      </Donut>
      <div className="ring-text">
        <span className="ring-label">{label}</span>
        <span className="ring-amt num">{amount}</span>
      </div>
    </div>
  );
}
