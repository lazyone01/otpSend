import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { authApi } from '../services/api.js';

const MIN_LENGTH = 8;

// Opened from the email link: /reset-password#token=<64 hex chars>
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Read the token from the "#..." part of the URL once, when the page opens.
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Remove the token from the address bar right away, so it isn't left in browser history
  // or accidentally shared in a screenshot or copied URL. We keep it in React state.
  useEffect(() => {
    if (location.hash) navigate('/reset-password', { replace: true });
  }, [location.hash, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');

    setSaving(true);
    try {
      await authApi.resetPassword(token, password); // server also signs us in (sets the cookie)
      navigate('/dashboard', { replace: true, state: { notice: 'Your password has been reset.' } });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <h1>Invalid reset link</h1>
        <Alert type="error">This link is incomplete. Please use the full link from the email, or request a new one.</Alert>
        <div className="row">
          <Link to="/forgot-password" className="link">
            Request a new link
          </Link>
          <Link to="/" className="link">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Choose a new password</h1>
      <p className="muted">After saving, you&apos;ll be signed in and signed out on all other devices.</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_LENGTH}
          maxLength={64}
          autoFocus
        />
        <p className="hint">At least {MIN_LENGTH} characters.</p>

        <label htmlFor="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          maxLength={64}
        />

        <Alert type="error">{error}</Alert>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Reset password'}
        </button>
      </form>

      <div className="row">
        <Link to="/forgot-password" className="link">
          Request a new link
        </Link>
      </div>
    </div>
  );
}
