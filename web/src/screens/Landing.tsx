import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { recent } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { TripList, useMyTrips } from '../components/TripSwitcher';
import { Spinner } from '../components/ui';

// Opening the app (or the installed icon) jumps straight into the last trip,
// but only once per launch, so "All trips" still shows this screen.
let launched = false;
export const markLaunched = () => {
  launched = true;
};

export function Landing() {
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  const { trips, error } = useMyTrips();
  useEffect(() => {
    launched = true;
  }, []);

  if (user?.isAdmin && !params.has('all')) return <Navigate to="/admin" replace />;
  const last = recent.latest();
  if (!launched && !params.has('all') && last && (!trips || trips.some((t) => t.code === last))) {
    return <Navigate to={`/t/${last}`} replace />;
  }

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
        <h1 style={{ marginBottom: 4 }}>Namaste, {user?.name.split(' ')[0]}</h1>
        <p className="lede">{trips?.length ? 'Your trips' : 'Start a trip for your group, or join one with a code.'}</p>

        {trips === null ? (
          <div className="center-fill" style={{ minHeight: 160 }}>
            {error ? <p className="muted">Can’t reach the server. Check your connection.</p> : <Spinner />}
          </div>
        ) : (
          trips.length > 0 && (
            <section className="trips" style={{ marginTop: 20 }} aria-label="Your trips">
              <TripList trips={trips} onPick={(code) => nav(`/t/${code}`)} />
            </section>
          )
        )}

        <div className="actions">
          <Link to="/new" className="btn block">
            Start a trip
          </Link>
          <Link to="/join" className="btn ghost block">
            Join with a code
          </Link>
        </div>
      </main>
    </div>
  );
}
