import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './lib/auth-context';
import { Admin } from './screens/Admin';
import { Landing } from './screens/Landing';
import { Login } from './screens/Login';
import { CreateTrip } from './screens/CreateTrip';
import { JoinTrip } from './screens/JoinTrip';
import { TripShell } from './screens/TripShell';
import { useCalendar } from './components/DateField';

export function App() {
  const location = useLocation();
  useCalendar(); // re-render every date when BS/AD is switched
  // Key top-level screens so each push replays the slide-in; tabs inside a trip share one key.
  const top = location.pathname.split('/').slice(0, 3).join('/');
  return (
    <Routes location={location} key={top.startsWith('/t/') ? top : location.pathname}>
      <Route path="/login" element={<Login />} />
      <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
      <Route path="/" element={<RequireAuth><Landing /></RequireAuth>} />
      <Route path="/new" element={<RequireAuth><CreateTrip /></RequireAuth>} />
      <Route path="/join" element={<RequireAuth><JoinTrip /></RequireAuth>} />
      <Route path="/join/:code" element={<RequireAuth><JoinTrip /></RequireAuth>} />
      <Route path="/t/:code/*" element={<RequireAuth><TripShell /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
