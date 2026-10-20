import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BedDouble, Copy, Pencil, PhoneCall, Plus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLoadedTrip } from '../lib/trip-context';
import { api, ApiError } from '../lib/api';
import { useOpenSwitcher } from './TripShell';
import { TripTitle } from '../components/TripSwitcher';
import { ContactButtons } from '../components/ContactButtons';
import { dateRange } from '../lib/format';
import { shareInvite } from '../lib/share';
import type { Member, Place, PlaceKind } from '../lib/types';
import { Avatar, TopBar } from '../components/ui';
import { MemberSheet, PlaceSheet, TripEditSheet } from '../sheets/TripSheets';
import { ProfileSheet } from '../components/ProfileSheet';

export function TripInfo() {
  const { data, me, isLeader, outranks, code, mutate, refresh } = useLoadedTrip();
  const [profile, setProfile] = useState(false);
  const openSwitcher = useOpenSwitcher();
  const nav = useNavigate();
  const location = useLocation();
  const [place, setPlace] = useState<{ kind: PlaceKind; place?: Place } | null>(null);
  const [member, setMember] = useState<{ member?: Member } | null>(null);
  const [editTrip, setEditTrip] = useState(false);
  const t = data.trip;

  // A freshly created trip lands here: nudge the leader to add friends.
  useEffect(() => {
    if ((location.state as { created?: boolean } | null)?.created) {
      toast.success('Trip created. Add your friends, then share the code.');
      nav(location.pathname, { replace: true, state: null });
    }
  }, [location, nav]);

  const by = (k: PlaceKind) =>
    data.places.filter((p) => p.kind === k).sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || a.sort - b.sort);
  const stops = by('stop');
  const stays = by('stay');
  const contacts = by('contact');
  const people = data.members.filter((m) => !m.left_at);

  const leave = async () => {
    if (!me || !confirm('Leave this trip?\n\nYour payments stay. You can rejoin with the code.')) return;
    try {
      await mutate(() => api.updateMember(code, me.id, { left: true }));
      nav('/?all', { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not leave');
    }
  };

  const head = (label: string, kind?: PlaceKind) => (
    <div className="section-head">
      {label}
      {kind && (
        <button className="link-btn" onClick={() => setPlace({ kind })} aria-label={`Add ${label.toLowerCase()}`}>
          <Plus size={16} />
        </button>
      )}
    </div>
  );

  return (
    <>
      <TopBar>
        <TripTitle
          name={t.name}
          sub={[t.destination, dateRange(t.start_date, t.end_date)].filter(Boolean).join(' · ') || 'Trip details'}
          onOpen={openSwitcher}
        />
        {(
          <button className="icon-btn" aria-label="Edit trip details" onClick={() => setEditTrip(true)}>
            <Pencil size={18} />
          </button>
        )}
      </TopBar>

      <div className="code-pill-row">
        <span className="code-pill num">{code}</span>
        <button
          className="icon-btn"
          aria-label="Copy code"
          onClick={() => navigator.clipboard?.writeText(code).then(() => toast.success('Code copied'))}
        >
          <Copy size={18} />
        </button>
        <button className="btn small" onClick={() => shareInvite(code, t.name)}>
          <Share2 size={16} /> Invite
        </button>
      </div>

      <section className="section">
        {head(`People · ${people.length}`)}
        <ul className="people-strip">
          {people.map((m) => {
            const canEdit = outranks(m) || m.id === me?.id;
            return (
              <li key={m.id}>
                <button className="person" onClick={() => (m.id === me?.id ? setProfile(true) : canEdit && setMember({ member: m }))} disabled={!canEdit} aria-label={m.name}>
                  <span className="person-avatar" data-pending={!m.claimed}>
                    <Avatar member={m} />
                    {m.role === 'leader' && <span className="crown" aria-label="Leader">★</span>}
                    {m.role === 'coleader' && <span className="crown co" aria-label="Co-leader">☆</span>}
                  </span>
                  <span className="person-name">{m.id === me?.id ? 'You' : m.name.split(' ')[0]}</span>
                </button>
                {m.phone && m.id !== me?.id ? <ContactButtons phone={m.phone} name={m.name} /> : <span className="contact-btns-empty" />}
              </li>
            );
          })}
          {(
            <li>
              <button className="person" onClick={() => setMember({})} aria-label="Add a friend">
                <span className="person-add">
                  <Plus size={20} />
                </span>
                <span className="person-name">Add</span>
              </button>
            </li>
          )}
        </ul>
      </section>

      <div className="cols">
        <div>
          {true && (
            <section className="section">
              {head('Route', 'stop')}
              {stops.length ? (
                <ol className="timeline">
                  {stops.map((p) => (
                    <li key={p.id}>
                      <button className="tl-item" onClick={() => setPlace({ kind: 'stop', place: p })}>
                        <span className="tl-day num">{p.day != null ? `D${p.day}` : '•'}</span>
                        <span className="tl-body">
                          <span className="row-title">{p.title}</span>
                          {(p.address || p.note) && <span className="row-sub">{[p.address, p.note].filter(Boolean).join(' · ')}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <AddRow label="Add the first stop" onClick={() => setPlace({ kind: 'stop' })} />
              )}
            </section>
          )}
        </div>

        <div>
          {true && (
            <section className="section">
              {head('Stays', 'stay')}
              {stays.length ? (
                <ul className="list">
                  {stays.map((p) => (
                    <PlaceRow key={p.id} p={p} icon={<BedDouble size={18} />} onEdit={() => setPlace({ kind: 'stay', place: p })} />
                  ))}
                </ul>
              ) : (
                <AddRow label="Add a hotel or teahouse" onClick={() => setPlace({ kind: 'stay' })} />
              )}
            </section>
          )}

          {true && (
            <section className="section">
              {head('Contacts', 'contact')}
              {contacts.length ? (
                <ul className="list">
                  {contacts.map((p) => (
                    <PlaceRow key={p.id} p={p} icon={<PhoneCall size={18} />} onEdit={() => setPlace({ kind: 'contact', place: p })} />
                  ))}
                </ul>
              ) : (
                <AddRow label="Driver, guide, porter…" onClick={() => setPlace({ kind: 'contact' })} />
              )}
            </section>
          )}

          {t.notes && (
            <section className="section">
              <div className="section-head">
                Notes
                {(
                  <button className="link-btn" onClick={() => setEditTrip(true)} aria-label="Edit notes">
                    <Pencil size={14} />
                  </button>
                )}
              </div>
              <p className="notes">{t.notes}</p>
            </section>
          )}

          {!isLeader && (
            <div className="pad" style={{ paddingTop: 24 }}>
              <button className="btn danger block" onClick={leave}>
                Leave trip
              </button>
            </div>
          )}
        </div>
      </div>

      <PlaceSheet open={!!place} onOpenChange={(o) => !o && setPlace(null)} kind={place?.kind ?? 'stop'} place={place?.place} />
      <MemberSheet open={!!member} onOpenChange={(o) => !o && setMember(null)} member={member?.member} />
      <TripEditSheet open={editTrip} onOpenChange={setEditTrip} />
      <ProfileSheet open={profile} onOpenChange={setProfile} onChanged={() => refresh().catch(() => {})} />
    </>
  );
}

function PlaceRow({ p, icon, onEdit }: { p: Place; icon: ReactNode; onEdit?: () => void }) {
  const meta = [p.day != null ? `Day ${p.day}` : '', p.address].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="glyph">{icon}</span>
      <div className="row-main">
        <div className="row-title">{p.title}</div>
        {meta && <div className="row-sub">{meta}</div>}
      </div>
    </>
  );
  return (
    <li style={{ display: 'flex', alignItems: 'stretch' }}>
      {onEdit ? (
        <button className="row" onClick={onEdit}>
          {body}
        </button>
      ) : (
        <div className="row">{body}</div>
      )}
      {p.phone && <ContactButtons phone={p.phone} name={p.title} />}
    </li>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="add-row" onClick={onClick}>
      <Plus size={18} /> {label}
    </button>
  );
}
