import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { sessions } from '../lib/api';

export function Landing() {
  const trips = Object.entries(sessions.all());
  return (
    <div className="frame narrow">
      <main className="landing">
        <div className="wordmark">
          <img src="/icon.svg" alt="" />
          SajiloTrip
        </div>
        <h1>Trip money, settled before you're home.</h1>
        <p className="lede">
          One shared ledger for the group. Log who paid, split it in a tap, and see exactly who owes whom — including
          the common fund.
        </p>
        <div className="actions">
          <Link to="/new" className="btn block">
            Start a trip
          </Link>
          <Link to="/join" className="btn ghost block">
            Join with a code
          </Link>
        </div>

        {trips.length > 0 && (
          <section className="trips" aria-labelledby="your-trips">
            <div className="section-head" id="your-trips">
              Your trips
            </div>
            <ul className="list">
              {trips.map(([code, s]) => (
                <li key={code}>
                  <Link to={`/t/${code}`} className="row">
                    <div className="row-main">
                      <div className="row-title">{s.tripName || 'Trip'}</div>
                      <div className="row-sub num">{code}</div>
                    </div>
                    <ChevronRight size={18} className="faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
