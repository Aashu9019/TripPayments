import { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useLoadedTrip } from '../lib/trip-context';
import { money } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { Avatar, Sheet, TopBar } from '../components/ui';
import { FundBar } from '../components/charts';
import { EntryRow } from '../components/EntryRow';
import { useOpenEntry } from './TripShell';
import type { Member } from '../lib/types';
import { suggested, useSettleMode } from '../lib/settle-mode';

type Transfer = { from: string; to: string; amount: number };

export function Settle() {
  const { data, me, member, canManage, mutate, code } = useLoadedTrip();
  const open = useOpenEntry();
  const [keeperOpen, setKeeperOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mode, setMode] = useSettleMode();
  const { ledger, trip } = data;
  const cur = trip.currency;
  const first = (id: string) => (id === me?.id ? 'You' : (member(id)?.name.split(' ')[0] ?? '—'));
  // People who left only show while money is still open with them.
  const people = data.members
    .filter((m) => !m.left_at || ledger.net[m.id])
    .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : (ledger.net[b.id] ?? 0) - (ledger.net[a.id] ?? 0)));

  // Payments already recorded between people, per person (sent / received).
  const settled = useMemo(() => {
    const sent: Record<string, number> = {};
    const got: Record<string, number> = {};
    for (const e of data.entries) {
      if (e.kind !== 'payment') continue;
      sent[e.from_id!] = (sent[e.from_id!] ?? 0) + e.amount;
      got[e.to_id!] = (got[e.to_id!] ?? 0) + e.amount;
    }
    return { sent, got };
  }, [data.entries]);
  const payments = data.entries.filter((e) => e.kind === 'payment');

  const list = suggested(ledger, mode);
  const toMe = list.filter((t) => t.to === me?.id);
  const fromMe = list.filter((t) => t.from === me?.id);
  const others = list.filter((t) => t.to !== me?.id && t.from !== me?.id);
  const maxNet = Math.max(1, ...people.map((m) => Math.abs(ledger.net[m.id] ?? 0)));

  async function setKeeper(id: string) {
    try {
      await mutate(() => api.updateTrip(code, { fundKeeperId: id }));
      setKeeperOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not change keeper');
    }
  }

  const markPaid = (t: Transfer) => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount });

  const group = (title: string, list: Transfer[], tone: 'in' | 'out' | 'other') =>
    list.length > 0 && (
      <section className="pay-group" data-tone={tone}>
        <div className="pay-group-head">
          <span>{title}</span>
          <span className="num">{money(list.reduce((s, t) => s + t.amount, 0), cur)}</span>
        </div>
        <ul>
          {list.map((t) => (
            <li key={`${t.from}-${t.to}`} className="pay-row">
              <span className="pay-pair" aria-hidden>
                <Avatar member={member(t.from)} />
                <Avatar member={member(t.to)} />
              </span>
              <span className="pay-text">
                <span className="pay-who">
                  {tone === 'in' ? (
                    <>
                      <b>{first(t.from)}</b> pays you
                    </>
                  ) : tone === 'out' ? (
                    <>
                      You pay <b>{first(t.to)}</b>
                    </>
                  ) : (
                    <>
                      <b>{first(t.from)}</b> pays <b>{first(t.to)}</b>
                    </>
                  )}
                </span>
                <span className="pay-amt num">{money(t.amount, cur)}</span>
              </span>
              <button className="mark-paid" onClick={() => markPaid(t)}>
                <Check size={15} strokeWidth={2.6} /> Paid
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  const myNet = me ? (ledger.net[me.id] ?? 0) : 0;

  return (
    <>
      <TopBar>
        <h1>Settle up</h1>
      </TopBar>

      <div className="cols">
        <div>
          {list.length > 0 && (
            <>
              <div className="segmented" role="radiogroup" aria-label="How to settle" style={{ marginTop: 4 }}>
                <button role="radio" aria-checked={mode === 'direct'} onClick={() => setMode('direct')}>
                  Who owes whom
                </button>
                <button role="radio" aria-checked={mode === 'fewest'} onClick={() => setMode('fewest')}>
                  Fewest payments
                </button>
              </div>
              <p className="hint" style={{ marginTop: -6 }}>
                {mode === 'direct'
                  ? 'Each person pays back the people who actually paid for them.'
                  : 'Same totals, fewer transfers: debts are passed through so fewer people need to pay.'}
              </p>
            </>
          )}
          {list.length ? (
            <>
              <div className="settle-summary">
                <span className="num">
                  {list.length} {list.length === 1 ? 'payment' : 'payments'}
                </span>{' '}
                settle the whole trip
                {myNet !== 0 && (
                  <span className={`settle-me num ${myNet > 0 ? 'plus' : 'minus'}`}>
                    {myNet > 0 ? `You get ${money(myNet, cur)}` : `You owe ${money(-myNet, cur)}`}
                  </span>
                )}
              </div>
              {group('Coming to you', toMe, 'in')}
              {group('You pay', fromMe, 'out')}
              {group('Between others', others, 'other')}
            </>
          ) : (
            <div className="square">
              <CircleCheck size={40} strokeWidth={1.6} />
              <strong>All square</strong>
              <span className="muted">{ledger.total ? 'Nobody owes anything.' : 'Balances show up once you add expenses.'}</span>
            </div>
          )}

          <section className="section">
            <div className="section-head">
              Balances <span className="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>· tap to see why</span>
            </div>
            <ul className="bal-list">
              {people.map((m) => (
                <BalanceRow
                  key={m.id}
                  m={m}
                  name={first(m.id)}
                  net={ledger.net[m.id] ?? 0}
                  max={maxNet}
                  cur={cur}
                  paid={ledger.paid[m.id] ?? 0}
                  share={ledger.spent[m.id] ?? 0}
                  deposited={ledger.deposited[m.id] ?? 0}
                  sent={settled.sent[m.id] ?? 0}
                  got={settled.got[m.id] ?? 0}
                  holdsFund={ledger.fund.keeperId === m.id ? ledger.fund.cash : 0}
                  open={expanded === m.id}
                  onToggle={() => setExpanded((x) => (x === m.id ? null : m.id))}
                />
              ))}
            </ul>
          </section>
        </div>

        <div>
          {ledger.fund.in > 0 && (
            <section className="section">
              <FundBar fund={ledger.fund} keeper={member(ledger.fund.keeperId)} currency={cur} />
            </section>
          )}
          <div className="pad chip-actions" style={{ marginTop: 20 }}>
            <button className="chip" onClick={() => open({ kind: 'payment' })}>
              <Plus size={16} /> Record a payment
            </button>
            <button className="chip" onClick={() => open({ kind: 'deposit' })}>
              <Plus size={16} /> Add to fund
            </button>
            {canManage && ledger.fund.in > 0 && (
              <button className="chip" onClick={() => setKeeperOpen(true)}>
                Change fund keeper
              </button>
            )}
          </div>

          {payments.length > 0 && (
            <section className="section">
              <div className="section-head">Already settled</div>
              <ul className="list">
                {payments.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <Sheet open={keeperOpen} onOpenChange={setKeeperOpen} title="Who holds the fund cash?">
        <ul className="list">
          {data.members
            .filter((m) => !m.left_at)
            .map((m) => (
              <li key={m.id}>
                <button className="row" onClick={() => setKeeper(m.id)} aria-pressed={m.id === ledger.fund.keeperId}>
                  <Avatar member={m} />
                  <div className="row-main row-title">{m.name}</div>
                  {m.id === ledger.fund.keeperId && <Check size={18} className="accent-ink" />}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
    </>
  );
}

/** One person's balance: a diverging bar, and on tap the arithmetic behind it. */
function BalanceRow(p: {
  m: Member;
  name: string;
  net: number;
  max: number;
  cur: string;
  paid: number;
  share: number;
  deposited: number;
  sent: number;
  got: number;
  holdsFund: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { net, cur } = p;
  const w = `${(Math.abs(net) / p.max) * 50}%`;
  const lines: [string, number][] = [
    ['Paid for the group', p.paid],
    ['Put in the common fund', p.deposited],
    ['Their share of expenses', -p.share],
    ['Paid back to others', p.sent],
    ['Received from others', -p.got],
    ['Fund cash they hold', -p.holdsFund],
  ];
  return (
    <li className="bal-item" data-open={p.open}>
      <button className="bal-row" onClick={p.onToggle} aria-expanded={p.open}>
        <Avatar member={p.m} size="sm" />
        <span className="bal-name">
          {p.name}
          {p.m.left_at && <span className="tag">left</span>}
        </span>
        <span className="bal-track" aria-hidden>
          <span className={net >= 0 ? 'bal-plus' : 'bal-minus'} style={{ width: w }} />
        </span>
        <span className={`bal-amt num ${net > 0 ? 'plus' : net < 0 ? 'minus' : 'faint'}`}>
          {net === 0 ? 'square' : money(net, cur, { sign: true })}
        </span>
        <ChevronDown size={16} className="bal-chev faint" aria-hidden />
      </button>
      {p.open && (
        <div className="bal-why num">
          {lines
            .filter(([, v]) => v !== 0)
            .map(([label, v]) => (
              <div key={label} className="why-line">
                <span>{label}</span>
                <span className={v > 0 ? 'plus' : 'minus'}>{money(v, cur, { sign: true })}</span>
              </div>
            ))}
          <div className="why-line why-total">
            <span>{net > 0 ? `${p.name === 'You' ? 'You get' : 'Gets'} back` : net < 0 ? `${p.name === 'You' ? 'You owe' : 'Owes'}` : 'Square'}</span>
            <span className={net > 0 ? 'plus' : net < 0 ? 'minus' : ''}>{money(Math.abs(net), cur)}</span>
          </div>
        </div>
      )}
    </li>
  );
}
