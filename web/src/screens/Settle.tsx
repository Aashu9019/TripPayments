import { useState } from 'react';
import { ArrowRight, Check, CircleCheck, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useLoadedTrip } from '../lib/trip-context';
import { money } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { Avatar, Sheet, TopBar } from '../components/ui';
import { BalanceChart, FundBar } from '../components/charts';
import { useOpenEntry } from './TripShell';

export function Settle() {
  const { data, me, member, canManage, mutate, code } = useLoadedTrip();
  const open = useOpenEntry();
  const [keeperOpen, setKeeperOpen] = useState(false);
  const { ledger, trip } = data;
  const cur = trip.currency;
  const first = (id: string) => (id === me?.id ? 'You' : (member(id)?.name.split(' ')[0] ?? '—'));
  // People who left only show while money is still open with them.
  const people = data.members.filter((m) => !m.left_at || ledger.net[m.id]);

  async function setKeeper(id: string) {
    try {
      await mutate(() => api.updateTrip(code, { fundKeeperId: id }));
      setKeeperOpen(false);
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
          {ledger.transfers.length ? (
            <ul className="transfers">
              {ledger.transfers.map((t) => {
                const mine = t.from === me?.id || t.to === me?.id;
                return (
                  <li key={`${t.from}-${t.to}`} data-mine={mine}>
                    <div className="xfer-people">
                      <span className="xfer-person">
                        <Avatar member={member(t.from)} />
                        <span>{first(t.from)}</span>
                      </span>
                      <span className="xfer-arrow" aria-hidden>
                        <ArrowRight size={16} />
                      </span>
                      <span className="xfer-person">
                        <Avatar member={member(t.to)} />
                        <span>{first(t.to)}</span>
                      </span>
                    </div>
                    <span className="xfer-amt num">{money(t.amount, cur)}</span>
                    <button
                      className="xfer-done"
                      aria-label={`Mark ${first(t.from)} paid ${first(t.to)} ${money(t.amount, cur)}`}
                      onClick={() => open({ kind: 'payment', fromId: t.from, toId: t.to, amount: t.amount })}
                    >
                      <Check size={18} strokeWidth={2.4} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="square">
              <CircleCheck size={40} strokeWidth={1.6} />
              <strong>All square</strong>
            </div>
          )}

          <section className="section">
            <div className="section-head">Balances</div>
            <BalanceChart members={people} net={ledger.net} currency={cur} meId={me?.id} />
          </section>
        </div>

        <section className="section">
          <FundBar fund={ledger.fund} keeper={member(ledger.fund.keeperId)} currency={cur} />
          <div className="pad chip-actions">
            <button className="chip" onClick={() => open({ kind: 'deposit' })}>
              <Plus size={16} /> Add to fund
            </button>
            {canManage && ledger.fund.in > 0 && (
              <button className="chip" onClick={() => setKeeperOpen(true)}>
                Change keeper
              </button>
            )}
            <button className="chip" onClick={() => open({ kind: 'payment' })}>
              <Plus size={16} /> Other payment
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
                  {m.id === ledger.fund.keeperId && <Check size={18} className="accent-ink" />}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
    </>
  );
}
