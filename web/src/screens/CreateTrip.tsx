import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { TopBar } from '../components/ui';

export function CreateTrip() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', destination: '', startDate: '', endDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.createTrip(form);
      nav(`/t/${res.code}/trip`, { replace: true, state: { created: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the trip');
      setBusy(false);
    }
  }

  return (
    <div className="frame narrow">
      <div className="screen">
        <TopBar>
          <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back">
            <ChevronLeft size={22} />
          </button>
          <h1>New trip</h1>
        </TopBar>
        <form onSubmit={submit} style={{ paddingTop: 12 }}>
          <label className="field">
            <span>Trip name</span>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Shey Phoksundo trek" autoFocus required maxLength={80} />
          </label>
          <label className="field">
            <span>Where to</span>
            <input className="input" value={form.destination} onChange={set('destination')} placeholder="Dolpa" maxLength={120} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <label className="field" style={{ paddingRight: 6 }}>
              <span>From</span>
              <input className="input" type="date" value={form.startDate} onChange={set('startDate')} />
            </label>
            <label className="field" style={{ paddingLeft: 6 }}>
              <span>To</span>
              <input className="input" type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} />
            </label>
          </div>
          <p className="hint">You'll be the trip leader. You can add friends and hand over leadership later.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="pad">
            <button className="btn block" disabled={busy || !form.name.trim()}>
              {busy ? 'Creating…' : 'Create trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
