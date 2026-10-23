import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';

/** Current + new password. Used in Your profile and on the forced change screen. */
export function PasswordForm({ onDone, currentLabel = 'Current password' }: { onDone?: () => void; currentLabel?: string }) {
  const { updateUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 6) return setError('New password needs at least 6 characters');
    if (next !== again) return setError('The new passwords don’t match');
    setBusy(true);
    setError('');
    try {
      await api.changePassword({ current, next });
      updateUser({ mustChangePassword: false });
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setAgain('');
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label className="field">
        <span>{currentLabel}</span>
        <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="field">
        <span>New password</span>
        <input className="input" type="password" autoComplete="new-password" placeholder="At least 6 characters" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required />
      </label>
      <label className="field">
        <span>New password again</span>
        <input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="pad">
        <button className="btn block" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}

/** Shown after signing in with a temporary password the trip leader set. */
export function ForcePasswordChange() {
  const { user, signOut } = useAuth();
  return (
    <div className="frame narrow">
      <main className="landing">
        <div className="wordmark">
          <img src="/icon.svg" alt="" />
          SajiloTrip
          <button className="link-btn" style={{ marginLeft: 'auto', fontSize: 14 }} onClick={() => signOut()}>
            Sign out
          </button>
        </div>
        <h1 style={{ marginBottom: 8 }}>Choose your own password</h1>
        <p className="lede">
          {user?.name.split(' ')[0]}, your trip leader set a temporary password for you. Pick a new one that only you know.
        </p>
        <div className="auth-form">
          <PasswordForm currentLabel="Temporary password" />
        </div>
      </main>
    </div>
  );
}
