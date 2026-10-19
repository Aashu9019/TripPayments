import { useEffect, useMemo, useState } from 'react';
import { DateField } from '../components/DateField';
import { autoSplit, equalShares, maxFor } from '../lib/split';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
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
  // Uneven split: amounts the person typed (paisa). Everyone else shares the rest.
  const [typed, setTyped] = useState<Record<string, number>>({});
  // Stored shares of an expense being edited, shown as-is until something changes.
  const [base, setBase] = useState<Record<string, number> | null>(null);
  // Raw text of the field being typed in, so "10." survives while typing.
  const [draftText, setDraftText] = useState<{ id: string; text: string } | null>(null);
  const [capped, setCapped] = useState<string | null>(null);
  const [who, setWho] = useState(''); // search in the people picker
  // The sheet swaps between the form and a full-height people picker (no nested sheets on iPhone).
  const [view, setView] = useState<'form' | 'people'>('form');
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
    setTyped({});
    setBase(e?.split_mode === 'exact' ? { ...e.shares } : null);
    setDraftText(null);
    setCapped(null);
    setWho('');
    setView('form');
    setDate(e?.date.slice(0, 10) ?? today());
    setNote(e?.note ?? '');
    setError('');
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  const total = parseMoney(amount);
  // Live shares: stored ones while editing untouched, otherwise typed + auto-filled.
  const shares = useMemo(
    () => base ?? (exact ? autoSplit(total ?? 0, participants, typed) : equalShares(total ?? 0, participants)),
    [base, exact, total, participants, typed],
  );
  const assigned = participants.reduce((s, id) => s + (shares[id] ?? 0), 0);
  const left = (total ?? 0) - assigned;

  // Editing a stored split: the first change starts fresh, so everyone you don't
  // type for re-spreads what is left.
  const current = () => {
    if (!base) return typed;
    setBase(null);
    return {};
  };

  function typeShare(id: string, text: string) {
    const clean = text.replace(/[^\d.]/g, '');
    const next: Record<string, number> = { ...current() };
    delete next[id];
    if (clean === '' || clean === '.') {
      // Cleared: this person goes back to sharing the rest.
      setTyped(next);
      setDraftText({ id, text: clean });
      setCapped(null);
      return;
    }
    const max = maxFor(id, total ?? 0, participants, next);
    let v = Math.round(Number(clean) * 100);
    if (v > max) {
      v = max;
      setCapped(id);
      setDraftText({ id, text: toInput(max) });
    } else {
      setCapped(null);
      setDraftText({ id, text: clean });
    }
    setTyped({ ...next, [id]: v });
  }

  function toggleSplit(id: string) {
    const next: Record<string, number> = { ...current() };
    const on = participants.includes(id);
    setParticipants((p) => (on ? p.filter((x) => x !== id) : [...p, id]));
    if (on) delete next[id];
    setTyped(next);
    setCapped(null);
  }

  function selectAll(all: boolean) {
    setBase(null);
    setTyped({});
    setCapped(null);
    setParticipants(all ? active.map((m) => m.id) : []);
  }

  function resetSplit() {
    setBase(null);
    setTyped({});
    setDraftText(null);
    setCapped(null);
  }

  const canDelete = editing && (isLeader || editing.created_by === me?.id);

  function validate(): string | null {
    if (!total) return 'Enter an amount';
    if (kind === 'expense') {
      if (!title.trim()) return 'What was it for?';
      if (!participants.length) return 'Pick at least one person';
      if (exact && left !== 0)
        return left > 0
          ? `${money(left, data.trip.currency)} still to assign`
          : `Split is ${money(-left, data.trip.currency)} over the total`;
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
      shares: exact ? Object.fromEntries(participants.map((id) => [id, shares[id] ?? 0])) : undefined,
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


  // You first, then everyone else; the search box filters by name.
  const ordered = [...active].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0));
  const q = who.trim().toLowerCase();
  const splitList = q ? ordered.filter((m) => m.name.toLowerCase().includes(q)) : ordered;

  const title_ = editing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : 'Add';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={view === 'people' ? 'Split between' : title_}
      footer={
        view === 'people' ? (
          <button
            className="btn"
            onClick={() => {
              setWho('');
              setView('form');
            }}
            disabled={!participants.length}
          >
            {participants.length ? `Done · ${participants.length} ${participants.length === 1 ? 'person' : 'people'}` : 'Pick at least one'}
          </button>
        ) : (
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
        )
      }
    >
      {view === 'people' ? (
        <div className="picker">
          <div className="picker-top">
            <label className="split-search">
              <Search size={18} aria-hidden />
              <input
                type="search"
                enterKeyHint="search"
                placeholder={`Search ${active.length} people`}
                value={who}
                onChange={(e) => setWho(e.target.value)}
                aria-label="Search people"
              />
            </label>
            <div className="picker-bar">
              <span className="faint num">
                {participants.length} of {active.length} selected
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="chip" onClick={() => selectAll(true)} aria-pressed={participants.length === active.length}>
                  All
                </button>
                <button className="chip" onClick={() => selectAll(false)} aria-pressed={participants.length === 0}>
                  None
                </button>
              </span>
            </div>
          </div>
          {splitList.length === 0 && <p className="hint" style={{ marginTop: 16 }}>No one called “{who}”.</p>}
          <ul className="picker-list">
            {splitList.map((m) => {
              const on = participants.includes(m.id);
              return (
                <li key={m.id}>
                  <button className="picker-row" onClick={() => toggleSplit(m.id)} aria-pressed={on}>
                    <Avatar member={m} />
                    <span className="row-main">{m.id === me?.id ? `${m.name} (you)` : m.name}</span>
                    <Check on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
      <>
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
        {ordered.map((m) => (
          <button key={m.id} className="chip" role="radio" aria-checked={from === m.id} onClick={() => setFrom(m.id)}>
            <Avatar member={m} size="sm" /> {m.id === me?.id ? 'You' : m.name}
          </button>
        ))}
      </div>

      {kind === 'payment' && (
        <>
          <div className="field-label">Paid to</div>
          <div className="chips" role="radiogroup" aria-label="Paid to">
            {ordered
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
            <span>
              Split between
            </span>
            <span style={{ display: 'flex', gap: 14 }}>
              {exact && (typed && Object.keys(typed).length > 0 || base) && (
                <button className="link-btn" onClick={resetSplit}>
                  Reset
                </button>
              )}
              <button
                className="link-btn"
                onClick={() => {
                  setExact((x) => !x);
                  resetSplit();
                }}
              >
                {exact ? 'Split equally' : 'Split unevenly'}
              </button>
            </span>
          </div>
          <button className="who-row" onClick={() => setView('people')}>
            <span className="avatar-stack" aria-hidden>
              {ordered
                .filter((m) => participants.includes(m.id))
                .slice(0, 5)
                .map((m) => (
                  <Avatar key={m.id} member={m} size="sm" />
                ))}
              {participants.length > 5 && <span className="stack-more num">+{participants.length - 5}</span>}
            </span>
            <span className="row-main">
              <span className="row-title">
                {participants.length === 0
                  ? 'Choose people'
                  : participants.length === active.length
                    ? `Everyone (${active.length})`
                    : `${participants.length} ${participants.length === 1 ? 'person' : 'people'}`}
              </span>
              {!exact && total && participants.length > 0 && (
                <span className="row-sub num">
                  {Object.values(shares).every((v) => v === shares[participants[0]!])
                    ? `${money(shares[participants[0]!] ?? 0, data.trip.currency)} each`
                    : `about ${money(Math.round(total / participants.length / 100) * 100, data.trip.currency)} each`}
                </span>
              )}
            </span>
            <span className="link-btn">Change</span>
          </button>
          {exact &&
            ordered
              .filter((m) => participants.includes(m.id))
              .map((m) => {
                const isTyped = !base && m.id in typed;
                const shown = draftText?.id === m.id ? draftText.text : toInput(shares[m.id] ?? 0);
                return (
                  <div key={m.id} className="split-row">
                    <Avatar member={m} size="sm" />
                    <span className="row-main">{m.id === me?.id ? 'You' : m.name}</span>
                    <input
                      className={`input num split-amt ${isTyped ? 'is-typed' : ''} ${capped === m.id ? 'is-capped' : ''}`}
                      inputMode="decimal"
                      placeholder="0"
                      disabled={!total}
                      value={shown}
                      onFocus={() => setDraftText({ id: m.id, text: isTyped || base ? toInput(shares[m.id] ?? 0) : '' })}
                      onBlur={() => setDraftText(null)}
                      onChange={(e) => typeShare(m.id, e.target.value)}
                      aria-label={`${m.name} share`}
                    />
                  </div>
                );
              })}
          {exact && (
            <div className="split-summary num">
              {!total ? (
                <span className="faint">Enter the total first</span>
              ) : left === 0 ? (
                <span className="plus">✓ Adds up to {money(total, data.trip.currency)}</span>
              ) : left > 0 ? (
                <span className="minus">{money(left, data.trip.currency)} left to assign</span>
              ) : (
                <span className="minus">{money(-left, data.trip.currency)} over the total</span>
              )}
              {capped && <span className="faint"> · capped at what’s left</span>}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <DateField label="Date" value={date} onChange={setDate} />
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
      </>
      )}
    </Sheet>
  );
}
