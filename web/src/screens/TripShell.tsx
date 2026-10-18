import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Home as HomeIcon, ReceiptText, Plus, ArrowLeftRight, Map, ChevronLeft, ChevronDown } from 'lucide-react';
import { recent } from '../lib/api';
import { TripProvider, useTrip } from '../lib/trip-context';
import { Spinner } from '../components/ui';
import { TripSwitcher } from '../components/TripSwitcher';
import { markLaunched } from './Landing';
import { EntrySheet, type EntryDraft } from '../sheets/EntrySheet';
import { Home } from './Home';
import { Spend } from './Spend';
import { Settle } from './Settle';
import { TripInfo } from './TripInfo';

const SheetCtx = createContext<(d?: EntryDraft) => void>(() => {});
export const useOpenEntry = () => useContext(SheetCtx);
const SwitcherCtx = createContext<() => void>(() => {});
export const useOpenSwitcher = () => useContext(SwitcherCtx);

const TABS = [
  { to: '', label: 'Home', icon: HomeIcon, end: true },
  { to: 'spend', label: 'Spend', icon: ReceiptText },
  { to: 'settle', label: 'Settle', icon: ArrowLeftRight },
  { to: 'trip', label: 'Trip', icon: Map },
];

export function TripShell() {
  const { code = '' } = useParams();
  useEffect(() => {
    markLaunched();
    recent.touch(code);
  }, [code]);
  return (
    <TripProvider code={code.toUpperCase()}>
      <Shell />
    </TripProvider>
  );
}

function Shell() {
  const { data, code, online, me } = useTrip();
  const location = useLocation();
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const openSwitcher = useCallback(() => setSwitcher(true), []);
  const openEntry = useCallback((d?: EntryDraft) => {
    setDraft(d ?? { kind: 'expense' });
    setOpen(true);
  }, []);

  const base = `/t/${code}`;
  const tab = location.pathname.slice(base.length).replace(/^\//, '').split('/')[0] ?? '';

  if (!data) {
    return (
      <div className="frame">
        <div className="center-fill">
          {online ? <Spinner /> : <p className="muted">You're offline and this trip isn't saved on this device yet.</p>}
        </div>
      </div>
    );
  }

  if (!me) {
    // Not on this trip (or the leader freed your seat): offer to join.
    return <Navigate to={`/join/${code}`} replace />;
  }

  return (
    <SheetCtx.Provider value={openEntry}>
      <SwitcherCtx.Provider value={openSwitcher}>
      <div className="shell">
        <aside className="sidebar" aria-label="Trip navigation">
          <Link to="/?all" className="sidebar-back">
            <ChevronLeft size={16} /> All trips
          </Link>
          <button className="sidebar-trip" onClick={openSwitcher} aria-label={`${data.trip.name}, switch trip`}>
            <span>
              <span className="sidebar-name">{data.trip.name}</span>
              <span className="faint num">{code}</span>
            </span>
            <ChevronDown size={16} className="faint" />
          </button>
          <button className="btn block" onClick={() => openEntry()}>
            <Plus size={18} /> Add payment
          </button>
          <nav className="sidebar-nav">
            {TABS.map((t) => (
              <NavLink key={t.label} to={t.to ? `${base}/${t.to}` : base} end={t.end} className="side-link">
                <t.icon size={18} strokeWidth={1.8} />
                {t.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="main">
          {!online && <div className="offline" role="status">Offline — showing what was saved on this device.</div>}
          <div className="tab-view" key={tab}>
            <Routes>
              <Route index element={<Home />} />
              <Route path="spend" element={<Spend />} />
              <Route path="settle" element={<Settle />} />
              <Route path="trip" element={<TripInfo />} />
              <Route path="*" element={<Navigate to={base} replace />} />
            </Routes>
          </div>
        </div>

        <nav className="tabbar" aria-label="Trip">
          {TABS.slice(0, 2).map((t) => (
            <NavLink key={t.label} to={t.to ? `${base}/${t.to}` : base} end={t.end} className="tab">
              <t.icon size={22} strokeWidth={1.8} />
              {t.label}
            </NavLink>
          ))}
          <button className="tab-add" onClick={() => openEntry()} aria-label="Add payment">
            <Plus size={24} strokeWidth={2.2} />
          </button>
          {TABS.slice(2).map((t) => (
            <NavLink key={t.label} to={`${base}/${t.to}`} className="tab">
              <t.icon size={22} strokeWidth={1.8} />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <EntrySheet open={open} onOpenChange={setOpen} draft={draft} />
      <TripSwitcher open={switcher} onOpenChange={setSwitcher} current={code} />
      </SwitcherCtx.Provider>
    </SheetCtx.Provider>
  );
}
