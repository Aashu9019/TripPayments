import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { useLoadedTrip } from '../lib/trip-context';
import type { Member, Place, PlaceKind } from '../lib/types';
import { FINE_POINTER, Sheet } from '../components/ui';

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
  const { mutate, code, me, isLeader, data } = useLoadedTrip();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(member?.name ?? '');
      setPhone(member?.phone ?? '');
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
    return run(() => (member ? api.updateMember(code, member.id, { name, phone }) : api.addMember(code, { name, phone })));
  };

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
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus={!member && FINE_POINTER} placeholder="Asha" />
      </label>
      <label className="field">
        <span>Phone</span>
        <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="Optional" />
      </label>
      {!member && <p className="hint">They'll pick their name when they open the invite link.</p>}

      {member && isLeader && !self && (
        <div className="pad stack-gap" style={{ marginTop: 8 }}>
          {member.claimed && (
            <button className="btn ghost" disabled={busy} onClick={() => run(() => api.updateMember(code, member.id, { release: true }), 'Seat freed. They can join again.')}>
              Unlink their account
            </button>
          )}
          {!member.left_at && member.role !== 'leader' && (
            <button
              className="btn ghost"
              disabled={busy}
              onClick={() => confirm(`Make ${member.name} the trip leader? You will become a member.`) && run(() => api.updateMember(code, member.id, { makeLeader: true }), 'Leader changed')}
            >
              Make trip leader
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
  const { data, mutate, code } = useLoadedTrip();
  const t = data.trip;
  const [f, setF] = useState({ name: '', destination: '', startDate: '', endDate: '', notes: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open)
      setF({
        name: t.name,
        destination: t.destination,
        startDate: t.start_date?.slice(0, 10) ?? '',
        endDate: t.end_date?.slice(0, 10) ?? '',
        notes: t.notes,
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    try {
      await mutate(() => api.updateTrip(code, f));
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
      <div className="two-up">
        <label className="field">
          <span>From</span>
          <input className="input" type="date" value={f.startDate} onChange={set('startDate')} />
        </label>
        <label className="field">
          <span>To</span>
          <input className="input" type="date" value={f.endDate} onChange={set('endDate')} />
        </label>
      </div>
      <label className="field">
        <span>Notes for everyone</span>
        <textarea className="input" value={f.notes} onChange={set('notes')} maxLength={4000} placeholder="Permits, packing list, meeting point…" rows={5} />
      </label>
    </Sheet>
  );
}
