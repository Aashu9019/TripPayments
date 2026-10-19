import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { useLoadedTrip } from '../lib/trip-context';
import { CATEGORIES, money, parseMoney, toInput, today } from '../lib/format';
import type { Entry, EntryKind } from '../lib/types';
import { Avatar, Check, FINE_POINTER, Sheet } from '../components/ui';

export interface EntryDraft {
  kind: EntryKind;
  entry?: Entry;
  fromId?: string | null;
  toId?: string;
  amount?: number;
}

const KIND_LABEL: Record<EntryKind, string> = {
  expense: 'Expense',
  deposit: 'Into fund',
  payment: 'Settle up',
};

const FUND = '__fund';

export function EntrySheet({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  draft: EntryDraft | null;
}) {
  const { data, me, isLeader, mutate, code } = useLoadedTrip();
  const active = data.members.filter((m) => !m.left_at);
  const editing = draft?.entry;

  const [kind, setKind] = useState<EntryKind>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('food');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [exact, setExact] = useState(false);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset the form each time the sheet opens.
  useEffect(() => {
    if (!open || !draft || !me) return;
    const e = draft.entry;
    setKind(draft.kind);
    setAmount(e ? toInput(e.amount) : draft.amount ? toInput(draft.amount) : '');
    setTitle(e?.title ?? '');
    setCategory(e?.category ?? 'food');
    setFrom(e ? (e.from_id ?? FUND) : draft.fromId === null ? FUND : (draft.fromId ?? me.id));
    setTo(e?.to_id ?? draft.toId ?? '');
    setParticipants(e?.kind === 'expense' ? Object.keys(e.shares) : active.map((m) => m.id));
    setExact(e?.split_mode === 'exact');
    setShares(e ? Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, toInput(v)])) : {});
    setDate(e?.date.slice(0, 10) ?? today());
    setNote(e?.note ?? '');
    setError('');
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  const total = parseMoney(amount);
  const exactSum = useMemo(
    () => Object.values(shares).reduce((s, v) => s + (parseMoney(v) ?? 0), 0),
    [shares],
  );
  const perHead = total && participants.length ? Math.floor(total / participants.length) : 0;

  const canDelete = editing && (isLeader || editing.created_by === me?.id);

  function validate(): string | null {
    if (!total) return 'Enter an amount';
    if (kind === 'expense') {
      if (!title.trim()) return 'What was it for?';
      if (exact && exactSum !== total) return `Split adds up to ${money(exactSum, data.trip.currency)}, not ${money(total, data.trip.currency)}`;
      if (!exact && !participants.length) return 'Pick at least one person';
    }
    if (kind !== 'expense' && (!from || from === FUND)) return 'Pick who paid';
    if (kind === 'payment' && (!to || to === from)) return 'Pick who received it';
    return null;
  }

  async function save() {
    const v = validate();
    if (v) return setError(v);
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = {
      kind,
      amount: total,
      title: kind === 'expense' ? title : kind === 'deposit' ? 'Into the common fund' : 'Settled up',
      category,
      fromId: from === FUND ? null : from,
      toId: to,
      date,
      note,
      splitMode: exact ? 'exact' : 'equal',
      participants,
      shares: exact ? Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, parseMoney(v) ?? 0])) : undefined,
    };
    try {
      await mutate(() => (editing ? api.updateEntry(code, editing.id, body) : api.addEntry(code, body)));
      toast.success(editing ? 'Saved' : kind === 'payment' ? 'Payment recorded' : 'Added');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !confirm('Delete this entry? Balances will update for everyone.')) return;
    setBusy(true);
    try {
      await mutate(() => api.deleteEntry(code, editing.id));
      toast('Deleted');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete');
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const title_ = editing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : 'Add';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title_}
      footer={
        <>
          {canDelete && (
            <button className="btn danger" onClick={remove} disabled={busy} style={{ flex: 'none' }}>
              Delete
            </button>
          )}
          <button className="btn" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save' : kind === 'payment' ? 'Record payment' : 'Add'}
          </button>
        </>
      }
    >
      {!editing && (
        <div className="segmented" role="radiogroup" aria-label="Type">
          {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      <label className="amount-input">
        <span>{data.trip.currency === 'NPR' ? 'Rs' : data.trip.currency}</span>
        <input
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-label="Amount"
          autoFocus={!editing && FINE_POINTER}
        />
      </label>

      {kind === 'expense' && (
        <>
          <label className="field">
            <span>For</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dal bhat at Ringmo" maxLength={80} />
          </label>
          <div className="field-label">Category</div>
          <div className="chips" role="radiogroup" aria-label="Category">
            {CATEGORIES.map((c) => (
              <button key={c.id} className="chip" role="radio" aria-checked={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="field-label">{kind === 'deposit' ? 'Who put money in' : 'Paid by'}</div>
      <div className="chips" role="radiogroup" aria-label="Paid by">
        {kind === 'expense' && (
          <button className="chip" role="radio" aria-checked={from === FUND} onClick={() => setFrom(FUND)}>
            <Avatar size="sm" /> Common fund
          </button>
        )}
        {active.map((m) => (
          <button key={m.id} className="chip" role="radio" aria-checked={from === m.id} onClick={() => setFrom(m.id)}>
            <Avatar member={m} size="sm" /> {m.id === me?.id ? 'You' : m.name}
          </button>
        ))}
      </div>

      {kind === 'payment' && (
        <>
          <div className="field-label">Paid to</div>
          <div className="chips" role="radiogroup" aria-label="Paid to">
            {active
              .filter((m) => m.id !== from)
              .map((m) => (
                <button key={m.id} className="chip" role="radio" aria-checked={to === m.id} onClick={() => setTo(m.id)}>
                  <Avatar member={m} size="sm" /> {m.id === me?.id ? 'You' : m.name}
                </button>
              ))}
          </div>
        </>
      )}

      {kind === 'expense' && (
        <>
          <div className="field-label split-head">
            <span>Split between</span>
            <button className="link-btn" onClick={() => setExact((x) => !x)}>
              {exact ? 'Split equally' : 'Split unevenly'}
            </button>
          </div>
          {exact ? (
            <>
              {active.map((m) => (
                <label key={m.id} className="split-row">
                  <Avatar member={m} size="sm" />
                  <span className="row-main">{m.name}</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    placeholder="0"
                    value={shares[m.id] ?? ''}
                    onChange={(e) => setShares({ ...shares, [m.id]: e.target.value.replace(/[^\d.,]/g, '') })}
                  />
                </label>
              ))}
              <p className="hint num" style={{ marginTop: 4 }}>
                {total ? (
                  exactSum === total ? (
                    'Adds up.'
                  ) : (
                    <>
                      {money(Math.abs(total - exactSum), data.trip.currency)} {exactSum < total ? 'left to assign' : 'over'}
                    </>
                  )
                ) : (
                  'Enter the total first.'
                )}
              </p>
            </>
          ) : (
            <>
              {active.map((m) => {
                const on = participants.includes(m.id);
                return (
                  <button key={m.id} className="split-row as-button" onClick={() => toggle(m.id)} aria-pressed={on}>
                    <Check on={on} />
                    <Avatar member={m} size="sm" />
                    <span className="row-main">{m.name}</span>
                    <span className="num muted">{on && perHead ? money(perHead, data.trip.currency) : ''}</span>
                  </button>
                );
              })}
            </>
          )}
        </>
      )}

      <div className="two-up" style={{ marginTop: 16 }}>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Note</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={500} />
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
