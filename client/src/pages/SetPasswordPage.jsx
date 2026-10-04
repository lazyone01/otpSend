import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { authApi } from '../services/api.js';

const MIN_LENGTH = 8;

// Shown right after verifying an email code: create a password (new account) or
// choose a new one (forgot password). Only reachable while logged in (inside ProtectedRoute).
export default function SetPasswordPage() {
  const { user } = useOutletContext();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Quick checks for instant feedback. The server checks again - it's the one that counts.
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');

    setSaving(true);
    try {
      await authApi.setPassword(password);
      navigate('/dashboard', { replace: true, state: { notice: 'Password saved. Next time you can sign in with it.' } });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h1>{user.hasPassword ? 'Choose a new password' : 'Create a password'}</h1>
      <p className="muted">
        Your email <strong>{user.email}</strong> is verified.{' '}
        {user.hasPassword
          ? 'Enter a new password. Other devices will be signed out.'
          : 'Create a password so you can sign in without an email code next time.'}
      </p>

      <form onSubmit={handleSubmit}>
        {/* Hidden username field: helps password managers save the email + password together. */}
        <input type="email" autoComplete="username" value={user.email} readOnly hidden />

        <label htmlFor="new-password">New password</label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password" // tells password managers to suggest a strong one
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={MIN_LENGTH}
          maxLength={64}
          autoFocus
        />
        <p className="hint">At least {MIN_LENGTH} characters. A short phrase is easier to remember and harder to guess.</p>

        <label htmlFor="confirm-password">Confirm password</label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          maxLength={64}
        />

        <Alert type="error">{error}</Alert>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save password'}
        </button>
      </form>

      {!user.hasPassword && (
        <div className="row">
          <button type="button" className="link" onClick={() => navigate('/dashboard', { replace: true })}>
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
