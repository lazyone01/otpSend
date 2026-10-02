// The ONE place the frontend talks to the backend.
// VITE_API_URL is set per environment:
// - development: http://localhost:5000 (the Express server directly)
// - production:  empty -> requests go to "/api/..." on the frontend's own domain, and Vercel
//                forwards them to the backend (see vercel.json). Same site = the cookie works everywhere.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // Send and accept cookies on cross-origin requests (needed for the login cookie in Step 12).
      credentials: 'include',
    });
  } catch {
    // fetch only throws when the server can't be reached at all (offline, wrong URL, CORS block).
    throw new ApiError('Cannot reach the server. Please check your connection.', 0, {});
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.message || 'Something went wrong.', res.status, data);
  }
  return data;
}

// Carries the HTTP status and the full JSON body, so pages can read e.g. retryAfter.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const authApi = {
  sendOtp: (email) => request('/api/auth/send-otp', { method: 'POST', body: { email } }),
  resendOtp: (email) => request('/api/auth/resend-otp', { method: 'POST', body: { email } }),
  verifyOtp: (email, otp) => request('/api/auth/verify-otp', { method: 'POST', body: { email, otp } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  forgotPassword: (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
  resetPassword: (token, password) =>
    request('/api/auth/reset-password', { method: 'POST', body: { token, password } }),
  setPassword: (password) => request('/api/auth/set-password', { method: 'POST', body: { password } }),
  me: () => request('/api/auth/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};
