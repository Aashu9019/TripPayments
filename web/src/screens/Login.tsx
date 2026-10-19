import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';

export function Login() {
  const { user, signIn } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const joining = next.startsWith('/join/');
  const [mode, setMode] = useState<'signin' | 'signup'>(joining ? 'signup' : 'signin');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={user.isAdmin && next === '/' ? '/admin' : next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      signIn(mode === 'signup' ? await api.signup({ phone, name, password }) : await api.login({ phone, password }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && mode === 'signin') {
        setError('Wrong number or password. First time here? Tap Create account and choose your own password.');
      } else if (err instanceof ApiError && err.status === 409 && mode === 'signup') {
        setError('This number already has an account. Tap Sign in.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not sign in');
      }
      setBusy(false);
    }
  }

  return (
    <div className="frame narrow">
      <main className="landing">
        <div className="wordmark">
          <img src="/icon.svg" alt="" />
          SajiloTrip
        </div>
        <h1>{joining ? 'Your friends added you to a trip.' : 'Trip money, settled before you’re home.'}</h1>
        <p className="lede">
          {joining
            ? 'Sign in or make an account with your phone number to join. Takes ten seconds.'
            : 'One shared ledger for the group. See who paid, who owes, and what’s left in the common fund.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <div className="segmented" role="radiogroup" aria-label="Account" style={{ marginBottom: 20 }}>
            <button type="button" role="radio" aria-checked={mode === 'signin'} onClick={() => setMode('signin')}>
              Sign in
            </button>
            <button type="button" role="radio" aria-checked={mode === 'signup'} onClick={() => setMode('signup')}>
              Create account
            </button>
          </div>
          <label className="field">
            <span>Phone number</span>
            <input
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          {mode === 'signup' && (
            <label className="field">
              <span>Your name</span>
              <input
                className="input"
                autoComplete="given-name"
                placeholder="Aashish"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                required
              />
            </label>
          )}
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="pad">
            <button className="btn block" disabled={busy}>
              {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </div>
          {mode === 'signup' && <p className="hint" style={{ marginTop: 12 }}>Nepali numbers work without +977. Your friends on a trip can see your number so they can call you.</p>}
        </form>
      </main>
    </div>
  );
}
