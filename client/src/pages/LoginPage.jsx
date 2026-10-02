import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { authApi } from '../services/api.js';
import { savePendingLogin } from '../services/pendingLogin.js';

// Two ways in:
// - "Password": for people who already signed up and created a password.
// - "Email code": signs up new users, and signs in anyone without a password.
export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('password'); // 'password' | 'code'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setPassword('');
  }

  async function handlePasswordLogin(e) {
    e.preventDefault(); // stop the browser's default full-page form submit
    setError('');
    setLoading(true);

    try {
      await authApi.login(email, password); // server sets the login cookie on success
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCode(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();

    try {
      const data = await authApi.sendOtp(email);
      savePendingLogin(cleanEmail, data.resendAvailableIn);
      navigate('/verify', { state: { notice: data.message } });
    } catch (err) {
      if (err.status === 429 && err.data.retryAfter) {
        // A code was sent less than 60s ago - go enter that one instead.
        savePendingLogin(cleanEmail, err.data.retryAfter);
        navigate('/verify', { state: { notice: 'A code was already sent recently. Check your inbox.' } });
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h1>Sign in</h1>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          className={mode === 'password' ? 'tab active' : 'tab'}
          onClick={() => switchMode('password')}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'code'}
          className={mode === 'code' ? 'tab active' : 'tab'}
          onClick={() => switchMode('code')}
        >
          Email code
        </button>
      </div>

      <p className="muted">
        {mode === 'password'
          ? 'Sign in with the password you created after verifying your email.'
          : "We'll email you a 6-digit code. New here? This creates your account."}
      </p>

      <form onSubmit={mode === 'password' ? handlePasswordLogin : handleSendCode}>
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          autoFocus
        />

        {mode === 'password' && (
          <>
            <div className="label-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="link small">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password" // lets password managers fill it in
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              maxLength={64}
            />
          </>
        )}

        <Alert type="error">{error}</Alert>

        <button type="submit" disabled={loading}>
          {mode === 'password' ? (loading ? 'Signing in…' : 'Sign in') : loading ? 'Sending…' : 'Send OTP'}
        </button>
      </form>

      <div className="row">
        {mode === 'password' ? (
          <button type="button" className="link" onClick={() => switchMode('code')}>
            New here? Sign up with an email code
          </button>
        ) : (
          <button type="button" className="link" onClick={() => switchMode('password')}>
            Have a password? Sign in with it
          </button>
        )}
      </div>
    </div>
  );
}
