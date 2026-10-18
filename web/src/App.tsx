import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Landing } from './screens/Landing';
import { CreateTrip } from './screens/CreateTrip';
import { JoinTrip } from './screens/JoinTrip';
import { TripShell } from './screens/TripShell';

export function App() {
  const location = useLocation();
  // Key top-level screens so each push replays the slide-in; tabs inside a trip share one key.
  const top = location.pathname.split('/').slice(0, 3).join('/');
  return (
    <Routes location={location} key={top.startsWith('/t/') ? top : location.pathname}>
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<CreateTrip />} />
      <Route path="/join" element={<JoinTrip />} />
      <Route path="/join/:code" element={<JoinTrip />} />
      <Route path="/t/:code/*" element={<TripShell />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
