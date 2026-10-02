// Remembers which email is waiting for a code, and when "Resend" unlocks,
// so refreshing the verify page doesn't lose them. sessionStorage is cleared when the tab closes.
// Only non-secret data goes here - never the OTP, a password or a token.
const KEY = 'pendingLogin';

export function savePendingLogin(email, resendInSeconds) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ email, resendAt: Date.now() + resendInSeconds * 1000 }));
  } catch {
    // Storage blocked (private mode etc.) - the app still works, just not across refreshes.
  }
}

export function getPendingLogin() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function clearPendingLogin() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
