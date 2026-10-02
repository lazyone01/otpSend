import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { authApi } from '../services/api.js';

// Wraps pages that need a logged-in user.
// The frontend can't read the HTTP-only cookie, so it ASKS the server: "who am I?"
// The browser attaches the cookie automatically; the server decides.
export default function ProtectedRoute() {
  const [state, setState] = useState({ status: 'loading', user: null, error: '' });

  useEffect(() => {
    let cancelled = false; // ignore the answer if the user navigated away meanwhile
    authApi
      .me()
      .then((data) => !cancelled && setState({ status: 'authenticated', user: data.user, error: '' }))
      .catch((err) => {
        if (cancelled) return;
        // 401 = not logged in. Anything else (server down) is shown as an error, not a silent logout.
        setState(err.status === 401 ? { status: 'unauthenticated' } : { status: 'error', error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') return <div className="card muted">Loading…</div>;
  if (state.status === 'unauthenticated') return <Navigate to="/" replace />;
  if (state.status === 'error') return <div className="card alert alert-error">{state.error}</div>;

  // Render the child route (e.g. DashboardPage) and hand it the user.
  return <Outlet context={{ user: state.user }} />;
}
