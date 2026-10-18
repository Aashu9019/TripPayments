import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, Pencil, Plus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLoadedTrip } from '../lib/trip-context';
import { api, ApiError } from '../lib/api';
import { useOpenSwitcher } from './TripShell';
import { TripTitle } from '../components/TripSwitcher';
import { ContactButtons, formatPhone } from '../components/ContactButtons';
import { dateRange } from '../lib/format';
import { shareInvite } from '../lib/share';
import type { Member, Place, PlaceKind } from '../lib/types';
import { Avatar, TopBar } from '../components/ui';
import { MemberSheet, PlaceSheet, TripEditSheet } from '../sheets/TripSheets';

export function TripInfo() {
  const { data, me, isLeader, code, mutate } = useLoadedTrip();
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

  const by = (k: PlaceKind) => data.places.filter((p) => p.kind === k).sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || a.sort - b.sort);
  const stops = by('stop');
  const stays = by('stay');
  const contacts = by('contact');

  const addBtn = (kind: PlaceKind) =>
    isLeader && (
      <button className="link-btn" onClick={() => setPlace({ kind })}>
        <Plus size={14} style={{ verticalAlign: -2 }} /> Add
      </button>
    );

  const leave = async () => {
    if (!me || !confirm('Leave this trip? Your payments stay, and you can rejoin with the code.')) return;
    try {
      await mutate(() => api.updateMember(code, me.id, { left: true }));
      nav('/?all', { replace: true });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not leave');
    }
  };

  return (
    <>
      <TopBar>
        <TripTitle
          name={t.name}
          sub={[t.destination, dateRange(t.start_date, t.end_date)].filter(Boolean).join(' · ') || 'Trip details'}
          onOpen={openSwitcher}
        />
        {isLeader && (
          <button className="icon-btn" aria-label="Edit trip details" onClick={() => setEditTrip(true)}>
            <Pencil size={18} />
          </button>
        )}
      </TopBar>

      <div className="cols">
        <div>
          <div className="code-box" style={{ marginTop: 8 }}>
            <div>
              <div className="muted" style={{ fontSize: 13 }}>
                Trip code
              </div>
              <div className="code">{code}</div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="icon-btn"
                aria-label="Copy code"
                onClick={() => navigator.clipboard?.writeText(code).then(() => toast.success('Code copied'))}
              >
                <Copy size={18} />
              </button>
              <button className="icon-btn" aria-label="Share invite" onClick={() => shareInvite(code, t.name)}>
                <Share2 size={18} />
              </button>
            </div>
          </div>

          <section className="section">
            <div className="section-head">
              Route {addBtn('stop')}
            </div>
            {stops.length ? (
              <ul className="list route">
                {stops.map((p) => (
                  <li key={p.id}>
                    <PlaceRow p={p} onEdit={isLeader ? () => setPlace({ kind: 'stop', place: p }) : undefined}>
                      <span className="route-dot" aria-hidden>
                        <span />
                      </span>
                    </PlaceRow>
                  </li>
                ))}
              </ul>
            ) : (
              <Blank text={isLeader ? 'Add the stops day by day so everyone knows the plan.' : 'The leader hasn’t added the route yet.'} />
            )}
          </section>

          <section className="section">
            <div className="section-head">
              Stays {addBtn('stay')}
            </div>
            {stays.length ? (
              <ul className="list">
                {stays.map((p) => (
                  <li key={p.id}>
                    <PlaceRow p={p} onEdit={isLeader ? () => setPlace({ kind: 'stay', place: p }) : undefined} />
                  </li>
                ))}
              </ul>
            ) : (
              <Blank text={isLeader ? 'Hotels and teahouses with their numbers.' : 'No stays added yet.'} />
            )}
          </section>
        </div>

        <div>
          <section className="section">
            <div className="section-head">
              Phone numbers {addBtn('contact')}
            </div>
            {contacts.length ? (
              <ul className="list">
                {contacts.map((p) => (
                  <li key={p.id}>
                    <PlaceRow p={p} onEdit={isLeader ? () => setPlace({ kind: 'contact', place: p }) : undefined} />
                  </li>
                ))}
              </ul>
            ) : (
              <Blank text={isLeader ? 'Driver, guide, porter, rescue — numbers you need without signal hunting.' : 'No contacts added yet.'} />
            )}
          </section>

          <section className="section">
            <div className="section-head">
              People · {data.members.filter((m) => !m.left_at).length}
              {isLeader && (
                <button className="link-btn" onClick={() => setMember({})}>
                  <Plus size={14} style={{ verticalAlign: -2 }} /> Add
                </button>
              )}
            </div>
            <ul className="list">
              {data.members.map((m) => {
                const canEdit = isLeader || m.id === me?.id;
                const inner = (
                  <>
                    <Avatar member={m} />
                    <div className="row-main">
                      <div className="row-title">
                        {m.name}
                        {m.id === me?.id && <span className="faint"> (you)</span>}
                      </div>
                      <div className="row-sub">
                        {m.left_at ? 'Left the trip' : m.claimed ? (m.phone ? formatPhone(m.phone) : 'Joined') : 'Hasn’t joined yet'}
                      </div>
                    </div>
                    {m.role === 'leader' && <span className="tag accent">Leader</span>}
                  </>
                );
                return (
                  <li key={m.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                    {canEdit ? (
                      <button className="row" onClick={() => setMember({ member: m })} style={{ opacity: m.left_at ? 0.55 : 1 }}>
                        {inner}
                      </button>
                    ) : (
                      <div className="row" style={{ opacity: m.left_at ? 0.55 : 1 }}>
                        {inner}
                      </div>
                    )}
                    {m.phone && m.id !== me?.id && <ContactButtons phone={m.phone} name={m.name} />}
                  </li>
                );
              })}
            </ul>
          </section>

          {(t.notes || isLeader) && (
            <section className="section">
              <div className="section-head">
                Notes
                {isLeader && (
                  <button className="link-btn" onClick={() => setEditTrip(true)}>
                    Edit
                  </button>
                )}
              </div>
              {t.notes ? <p className="notes">{t.notes}</p> : <Blank text="Permits, packing list, meeting point…" />}
            </section>
          )}

          <div className="pad" style={{ paddingTop: 24 }}>
            {!isLeader && (
              <button className="btn danger block" onClick={leave}>
                Leave this trip
              </button>
            )}
          </div>
        </div>
      </div>

      <PlaceSheet open={!!place} onOpenChange={(o) => !o && setPlace(null)} kind={place?.kind ?? 'stop'} place={place?.place} />
      <MemberSheet open={!!member} onOpenChange={(o) => !o && setMember(null)} member={member?.member} />
      <TripEditSheet open={editTrip} onOpenChange={setEditTrip} />
    </>
  );
}

function PlaceRow({ p, onEdit, children }: { p: Place; onEdit?: () => void; children?: ReactNode }) {
  const meta = [p.day != null ? `Day ${p.day}` : '', p.address, p.note].filter(Boolean).join(' · ');
  const body = (
    <>
      {children}
      <div className="row-main">
        <div className="row-title">{p.title}</div>
        {meta && <div className="row-sub">{meta}</div>}
      </div>
    </>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      {onEdit ? (
        <button className="row" onClick={onEdit}>
          {body}
        </button>
      ) : (
        <div className="row">{body}</div>
      )}
      {p.phone && <ContactButtons phone={p.phone} name={p.title} />}
    </div>
  );
}

function Blank({ text }: { text: string }) {
  return <p className="hint" style={{ margin: '0 0 4px' }}>{text}</p>;
}
