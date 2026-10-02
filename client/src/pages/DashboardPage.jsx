import { useState } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { authApi } from '../services/api.js';

// Only ever rendered inside <ProtectedRoute>, which has already confirmed the login with the server.
export default function DashboardPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const notice = useLocation().state?.notice;
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout() {
    setLoggingOut(true);
    setError('');
    try {
      await authApi.logout(); // server revokes the token and deletes the cookie
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoggingOut(false);
    }
  }

  return (
    <div className="card">
      <h1>Welcome!</h1>
      <p>Your email has been successfully verified.</p>

      <Alert type="success">{notice}</Alert>

      <dl className="details">
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Status</dt>
        <dd className={user.emailVerified ? 'verified' : ''}>{user.emailVerified ? 'Verified' : 'Not verified'}</dd>
        <dt>Password</dt>
        <dd>{user.hasPassword ? 'Set' : 'Not set'}</dd>
      </dl>

      {!user.hasPassword && (
        <button type="button" className="full secondary" onClick={() => navigate('/set-password')}>
          Create a password
        </button>
      )}

      <Alert type="error">{error}</Alert>

      <button type="button" onClick={handleLogout} disabled={loggingOut} className="full">
        {loggingOut ? 'Logging out…' : 'Logout'}
      </button>
    </div>
  );
}
