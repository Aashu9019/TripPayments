import { useEffect, useState } from 'react';
import { DateField } from '../components/DateField';
import { CurrencyField } from '../components/CurrencyField';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { useLoadedTrip } from '../lib/trip-context';
import type { Member, Place, PlaceKind } from '../lib/types';
import { Avatar, FINE_POINTER, Sheet } from '../components/ui';
import { toSquareJpeg } from '../components/ProfileSheet';
import { Camera } from 'lucide-react';
import { useRef } from 'react';

const PLACE_COPY: Record<PlaceKind, { add: string; title: string; placeholder: string }> = {
  stop: { add: 'Add route stop', title: 'Place', placeholder: 'Ringmo village' },
  stay: { add: 'Add stay', title: 'Hotel or teahouse', placeholder: 'Phoksundo Guest House' },
  contact: { add: 'Add contact', title: 'Name', placeholder: 'Jeep driver — Bikram' },
};

export function PlaceSheet({
  open,
  onOpenChange,
  kind,
  place,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: PlaceKind;
  place?: Place;
}) {
  const { mutate, code } = useLoadedTrip();
  const [f, setF] = useState({ title: '', phone: '', address: '', day: '', note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setF({
        title: place?.title ?? '',
        phone: place?.phone ?? '',
        address: place?.address ?? '',
        day: place?.day?.toString() ?? '',
        note: place?.note ?? '',
      });
  }, [open, place]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const copy = PLACE_COPY[kind];

  async function save() {
    if (!f.title.trim()) return toast.error('Add a name');
    setBusy(true);
    try {
      const body = { ...f, kind, sort: place?.sort ?? 0 };
      await mutate(() => (place ? api.updatePlace(code, place.id, body) : api.addPlace(code, body)));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!place || !confirm(`Remove ${place.title}?`)) return;
    setBusy(true);
    try {
      await mutate(() => api.deletePlace(code, place.id));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not remove');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={place ? `Edit ${place.title}` : copy.add}
      footer={
        <>
          {place && (
            <button className="btn danger" onClick={remove} disabled={busy} style={{ flex: 'none' }}>
              Remove
            </button>
          )}
          <button className="btn" onClick={save} disabled={busy}>
            Save
          </button>
        </>
      }
    >
      <label className="field">
        <span>{copy.title}</span>
        <input className="input" value={f.title} onChange={set('title')} placeholder={copy.placeholder} maxLength={80} autoFocus={!place && FINE_POINTER} />
      </label>
      {kind !== 'stop' && (
        <label className="field">
          <span>Phone</span>
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="+977 98…" maxLength={30} />
        </label>
      )}
      {kind !== 'contact' && (
        <div className="two-up">
          <label className="field">
            <span>Day</span>
            <input className="input" inputMode="numeric" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="1" />
          </label>
          <label className="field">
            <span>{kind === 'stay' ? 'Where' : 'Altitude or area'}</span>
            <input className="input" value={f.address} onChange={set('address')} maxLength={200} placeholder={kind === 'stay' ? 'Ringmo' : '3,611 m'} />
          </label>
        </div>
      )}
      <label className="field">
        <span>Note</span>
        <textarea className="input" value={f.note} onChange={set('note')} maxLength={500} placeholder={kind === 'stay' ? 'Booked for 5, pay on arrival' : 'Optional'} />
      </label>
    </Sheet>
  );
}

export function MemberSheet({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  member?: Member;
}) {
  const { mutate, code, me, isLeader, outranks, data } = useLoadedTrip();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  // Photo the leader picked: a data URL waiting to upload, or null to remove.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setName(member?.name ?? '');
      setPhone(member?.phone ?? '');
      setPhoto(undefined);
    }
  }, [open, member]);
  const self = member?.id === me?.id;

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await mutate(fn);
      if (done) toast.success(done);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    if (!name.trim()) return toast.error('Add a name');
    return run(async () => {
      let id = member?.id;
      let linked = false;
      if (member) await api.updateMember(code, member.id, { name, phone });
      else {
        const res = await api.addMember(code, { name, phone });
        id = res.id;
        linked = res.linked;
      }
      if (id && photo !== undefined && (!member || outranks(member))) await api.setMemberAvatar(code, id, photo);
      if (linked) toast.success(`${name} already has an account, so the trip is in their list now`);
    });
  };

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await toSquareJpeg(file));
    } catch (e) {
      toast.error((e as Error).message || 'Could not read that image');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // What the avatar shows right now, including an unsaved pick.
  const previewMember = {
    ...(member ?? { id: 'new', role: 'member' as const, color: data.members.length % 8, claimed: false, left_at: null, phone }),
    name: name || 'New friend',
    avatar: photo === null ? null : (member?.avatar ?? null),
  };
  const canPhoto = !self && (!member || outranks(member)) && (isLeader || me?.role === 'coleader');

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={member ? (self ? 'You' : member.name) : 'Add a friend'}
      footer={
        <button className="btn" onClick={save} disabled={busy}>
          {member ? 'Save' : 'Add'}
        </button>
      }
    >
      {canPhoto && (
        <div className="profile-photo" style={{ paddingBottom: 12 }}>
          <button className="profile-avatar" onClick={() => fileRef.current?.click()} aria-label="Set photo">
            {typeof photo === 'string' ? (
              <span className="avatar" style={{ width: 88, height: 88 }}>
                <img className="avatar-img" src={photo} alt="" />
              </span>
            ) : (
              <Avatar member={previewMember} />
            )}
            <span className="profile-cam" aria-hidden>
              <Camera size={16} />
            </span>
          </button>
          {(typeof photo === 'string' || (photo === undefined && member?.avatar)) && (
            <button className="link-btn" onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        </div>
      )}
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus={!member && FINE_POINTER} placeholder="Asha" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="Optional" />
      </label>
      {(!member || !member.claimed) && (
        <p className="hint">
          Add their number and they’re linked automatically when they sign up or sign in with it. Otherwise they pick their name from the invite link.
        </p>
      )}

      {member && !self && outranks(member) && (
        <div className="pad stack-gap" style={{ marginTop: 8 }}>
          {member.claimed && (
            <button className="btn ghost" disabled={busy} onClick={() => run(() => api.updateMember(code, member.id, { release: true }), 'Seat freed. They can join again.')}>
              Unlink their account
            </button>
          )}
          {!member.left_at && member.role === 'member' && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => run(() => api.updateMember(code, member.id, { role: 'coleader' }), `${member.name} is now a co-leader`)}
            >
              Make co-leader
            </button>
          )}
          {!member.left_at && member.role === 'coleader' && isLeader && (
            <button className="btn ghost" disabled={busy} onClick={() => run(() => api.updateMember(code, member.id, { role: 'member' }), `${member.name} is a member again`)}>
              Remove co-leader
            </button>
          )}
          {!member.left_at && isLeader && member.claimed && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                confirm(`Make ${member.name} the trip leader?\n\nYou will become a co-leader. Only the leader can delete the trip.`) &&
                run(() => api.updateMember(code, member.id, { makeLeader: true }), `${member.name} leads the trip now`)
              }
            >
              Hand over leadership
            </button>
          )}
          {member.left_at ? (
            <button className="btn ghost" disabled={busy} onClick={() => run(() => api.updateMember(code, member.id, { left: false }), `${member.name} is back on the trip`)}>
              Bring back to trip
            </button>
          ) : (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                const hasMoney = data.entries.some(
                  (e) => e.from_id === member.id || e.to_id === member.id || member.id in e.shares,
                );
                const msg = hasMoney
                  ? `Remove ${member.name} from the trip?

They have payments here, so their balance stays in Settle until it is cleared. They will lose access to the trip.`
                  : `Remove ${member.name} from the trip?

They will lose access to the trip.`;
                if (confirm(msg)) run(() => api.removeMember(code, member.id), `${member.name} removed`);
              }}
            >
              Remove from trip
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function TripEditSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, mutate, code, isLeader, canManage } = useLoadedTrip();
  const t = data.trip;
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', destination: '', startDate: '', endDate: '', notes: '', currency: 'NPR' });
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setConfirming(false);
      setTyped('');
    }
  }, [open]);

  async function deleteTrip() {
    setBusy(true);
    try {
      await api.deleteTrip(code, typed);
      onOpenChange(false);
      toast.success(`${t.name} deleted`);
      nav('/?all', { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete the trip');
      setBusy(false);
    }
  }
  useEffect(() => {
    if (open)
      setF({
        name: t.name,
        destination: t.destination,
        startDate: t.start_date?.slice(0, 10) ?? '',
        endDate: t.end_date?.slice(0, 10) ?? '',
        notes: t.notes,
        currency: t.currency,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      await mutate(() => {
        // Members edit trip info; only leader / co-leaders may change the currency.
        const { currency, ...rest } = f;
        return api.updateTrip(code, canManage ? { ...rest, currency } : rest);
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Trip details"
      footer={
        <button className="btn" onClick={save} disabled={busy || !f.name.trim()}>
          Save
        </button>
      }
    >
      <label className="field">
        <span>Trip name</span>
        <input className="input" value={f.name} onChange={set('name')} maxLength={80} />
      </label>
      <label className="field">
        <span>Where to</span>
        <input className="input" value={f.destination} onChange={set('destination')} maxLength={120} />
      </label>
      <DateField label="From" value={f.startDate} onChange={(v) => setF((x) => ({ ...x, startDate: v }))} optional />
      <DateField label="To" value={f.endDate} onChange={(v) => setF((x) => ({ ...x, endDate: v }))} optional />
      {canManage && (
        <CurrencyField
          value={f.currency}
          onChange={(v) => setF((x) => ({ ...x, currency: v }))}
          warnConvert={f.currency !== t.currency && data.entries.length > 0}
        />
      )}
      <label className="field">
        <span>Notes for everyone</span>
        <textarea className="input" value={f.notes} onChange={set('notes')} maxLength={4000} placeholder="Permits, packing list, meeting point…" rows={5} />
      </label>

      {isLeader && (
      <div className="danger-zone">
        {!confirming ? (
          <button className="btn danger block" onClick={() => setConfirming(true)}>
            <Trash2 size={18} /> Delete trip
          </button>
        ) : (
          <div className="stack-gap">
            <p className="danger-note">
              This deletes <b>{t.name}</b> for everyone: all payments, the fund, route, stays and contacts. It cannot be undone.
            </p>
            <label className="field" style={{ padding: 0, margin: 0 }}>
              <span>
                Type <b className="num">{code}</b> to confirm
              </span>
              <input
                className="input code-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={code}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => { setConfirming(false); setTyped(''); }}>
                Keep trip
              </button>
              <button className="btn danger-solid" style={{ flex: 1 }} disabled={typed !== code || busy} onClick={deleteTrip}>
                Delete forever
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </Sheet>
  );
}
