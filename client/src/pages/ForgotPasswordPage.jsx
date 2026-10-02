import { useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { authApi } from '../services/api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // The server answers the same way whether or not the account exists (privacy).
      const data = await authApi.forgotPassword(email);
      setSentMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (sentMessage) {
    return (
      <div className="card">
        <h1>Check your email</h1>
        <Alert type="success">{sentMessage}</Alert>
        <p className="muted">
          The link expires in 30 minutes. Didn&apos;t get it? Check your spam folder, or wait a minute and try again.
        </p>
        <div className="row">
          <button type="button" className="link" onClick={() => setSentMessage('')}>
            Try again
          </button>
          <Link to="/" className="link">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Forgot your password?</h1>
      <p className="muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>

      <form onSubmit={handleSubmit}>
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

        <Alert type="error">{error}</Alert>

        <button type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div className="row">
        <Link to="/" className="link">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
