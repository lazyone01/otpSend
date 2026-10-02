import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '../components/Alert.jsx';
import { authApi } from '../services/api.js';
import { clearPendingLogin, getPendingLogin, savePendingLogin } from '../services/pendingLogin.js';

function secondsUntil(timestamp) {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

export default function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(getPendingLogin);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(() => (pending ? secondsUntil(pending.resendAt) : 0));

  // Tick the resend countdown once per second. Computed from a fixed timestamp
  // (not "minus 1 each tick") so it stays accurate even if the tab sleeps.
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => setCountdown(secondsUntil(pending.resendAt)), 1000);
    return () => clearInterval(timer); // cleanup when the page unmounts
  }, [pending]);

  // Nobody is waiting for a code (opened /verify directly) -> back to the email page.
  if (!pending) return <Navigate to="/" replace />;

  async function handleVerify(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setVerifying(true);

    try {
      // On success the server also sets the login cookie - the browser stores it automatically.
      const data = await authApi.verifyOtp(pending.email, otp);
      clearPendingLogin();
      // New account (no password yet) -> create one next.
      navigate(data.user.hasPassword ? '/dashboard' : '/set-password', { replace: true });
    } catch (err) {
      const remaining = err.data?.attemptsRemaining;
      setError(remaining ? `${err.message} ${remaining} attempt${remaining === 1 ? '' : 's'} left.` : err.message);
      setOtp('');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError('');
    setNotice('');
    setResending(true);

    try {
      const data = await authApi.resendOtp(pending.email);
      startCountdown(data.resendAvailableIn);
      setNotice('A new code has been sent. The previous code no longer works.');
      setOtp('');
    } catch (err) {
      if (err.data?.retryAfter) startCountdown(err.data.retryAfter);
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  function startCountdown(seconds) {
    savePendingLogin(pending.email, seconds);
    const next = getPendingLogin();
    if (next) {
      setPending(next);
      setCountdown(secondsUntil(next.resendAt));
    }
  }

  function changeEmail() {
    clearPendingLogin();
    navigate('/', { replace: true });
  }

  return (
    <div className="card">
      <h1>Check your email</h1>
      <p className="muted">
        We sent a 6-digit code to <strong>{pending.email}</strong>. It expires in 5 minutes.
      </p>

      <Alert type="success">{notice}</Alert>

      <form onSubmit={handleVerify}>
        <label htmlFor="otp">Verification code</label>
        <input
          id="otp"
          className="otp-input"
          type="text"
          inputMode="numeric" // number keypad on phones
          autoComplete="one-time-code" // lets iOS/Android suggest the code from the email/SMS
          pattern="\d{6}"
          maxLength={6}
          placeholder="••••••"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // digits only
          required
          autoFocus
        />

        <Alert type="error">{error}</Alert>

        <button type="submit" disabled={verifying || otp.length !== 6}>
          {verifying ? 'Verifying…' : 'Verify OTP'}
        </button>
      </form>

      <div className="row">
        <button type="button" className="link" onClick={handleResend} disabled={countdown > 0 || resending}>
          {resending ? 'Sending…' : countdown > 0 ? `Resend OTP in ${countdown}s` : 'Resend OTP'}
        </button>
        <button type="button" className="link" onClick={changeEmail}>
          Use a different email
        </button>
      </div>
    </div>
  );
}
