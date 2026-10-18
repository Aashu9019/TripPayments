import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useLoadedTrip } from '../lib/trip-context';
import { money } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { Avatar, Sheet, TopBar } from '../components/ui';
import { useOpenEntry } from './TripShell';

export function Settle() {
  const { data, me, member, isLeader, mutate, code } = useLoadedTrip();
  const open = useOpenEntry();
  const [keeperOpen, setKeeperOpen] = useState(false);
  const { ledger, trip } = data;
  const cur = trip.currency;
  const keeper = member(ledger.fund.keeperId);
  const name = (id: string) => (id === me?.id ? 'You' : (member(id)?.name ?? '—'));
  const balances = data.members
    .filter((m) => !m.left_at || ledger.net[m.id])
    .sort((a, b) => (ledger.net[b.id] ?? 0) - (ledger.net[a.id] ?? 0));

  async function setKeeper(id: string) {
    try {
      await mutate(() => api.updateTrip(code, { fundKeeperId: id }));
      setKeeperOpen(false);
      toast.success('Fund keeper changed');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not change keeper');
    }
  }

  return (
    <>
      <TopBar>
        <h1>Settle up</h1>
      </TopBar>

      <div className="cols">
        <div>
          <section className="section" style={{ paddingTop: 8 }}>
            <div className="section-head">
              {ledger.transfers.length ? `${ledger.transfers.length} ${ledger.transfers.length === 1 ? 'payment' : 'payments'} settles everyone` : 'Payments'}
            </div>
            {ledger.transfers.length ? (
              <ul className="list">
                {ledger.transfers.map((t) => (
                  <li key={`${t.from}-${t.to}`} className="row">
                    <Avatar member={member(t.from)} size="sm" />
                    <ArrowRight size={14} className="faint" />
                    <Avatar member={member(t.to)} size="sm" />
                    <div className="row-main">
                      <div className="row-title">
                        {name(t.from)} → {name(t.to)}
                      </div>
                      <div className="row-sub num">{money(t.amount, cur)}</div>
                    </div>
                    <button className="btn small ghost" onClick={() => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount })}>
                      Mark paid
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty">
                <strong>Everyone is square</strong>
                <p>{ledger.total ? 'No one owes anything right now.' : 'Balances show up once you add expenses.'}</p>
              </div>
            )}
            {ledger.transfers.length > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                Paid some other way? Record any amount with Settle up from the + button.
              </p>
            )}
          </section>

          <section className="section">
            <div className="section-head">Balances</div>
            <ul className="list">
              {balances.map((m) => {
                const n = ledger.net[m.id] ?? 0;
                return (
                  <li key={m.id} className="row">
                    <Avatar member={m} />
                    <div className="row-main">
                      <div className="row-title">{m.id === me?.id ? `${m.name} (you)` : m.name}</div>
                      <div className="row-sub num">
                        paid {money((ledger.paid[m.id] ?? 0) + (ledger.deposited[m.id] ?? 0), cur)} · share {money(ledger.spent[m.id] ?? 0, cur)}
                      </div>
                    </div>
                    <div className={`row-end row-title ${n > 0 ? 'plus' : n < 0 ? 'minus' : 'faint'}`}>
                      {n === 0 ? 'square' : money(n, cur, { sign: true })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="section">
          <div className="section-head">
            Common fund
            {isLeader && (
              <button className="link-btn" onClick={() => setKeeperOpen(true)}>
                Change keeper
              </button>
            )}
          </div>
          <ul className="list">
            <li className="row">
              <div className="row-main">
                <div className="row-title">Cash left</div>
                <div className="row-sub">Held by {keeper ? name(keeper.id) : '—'}</div>
              </div>
              <div className="row-end row-title">{money(ledger.fund.cash, cur)}</div>
            </li>
            <li className="row">
              <div className="row-main row-title">Collected</div>
              <div className="row-end num">{money(ledger.fund.in, cur)}</div>
            </li>
            <li className="row">
              <div className="row-main row-title">Spent from fund</div>
              <div className="row-end num">{money(ledger.fund.out, cur)}</div>
            </li>
            {data.members
              .filter((m) => ledger.deposited[m.id])
              .map((m) => (
                <li key={m.id} className="row">
                  <Avatar member={m} size="sm" />
                  <div className="row-main row-sub">{name(m.id)} put in</div>
                  <div className="row-end num">{money(ledger.deposited[m.id]!, cur)}</div>
                </li>
              ))}
          </ul>
          <p className="hint" style={{ marginTop: 10 }}>
            Leftover fund cash counts as money the keeper holds for everyone, so it is already part of the payments above.
          </p>
          <div className="pad">
            <button className="btn ghost block" onClick={() => open({ kind: 'deposit' })}>
              Add money to fund
            </button>
          </div>
        </section>
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
                  {m.id === ledger.fund.keeperId && <span className="tag accent">Keeper</span>}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
    </>
  );
}
