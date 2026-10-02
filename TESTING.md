# Testing Checklist

## 1. Automated API tests

With `server/.env` filled in:

```bash
cd server
npm run test:api
```

This starts its own copy of the backend on a random port (your dev server is not touched), runs 44 checks against the real HTTP endpoints and MongoDB, and deletes its test data afterwards. It sends **no emails**: where a real code or reset link is needed, it stores a known one in the database, hashed the same way the app does.

Expected last line: `44 passed, 0 failed`.

## 2. Manual browser tests (local)

Start both servers (`npm run dev` in `server/` and `client/`), open http://localhost:5174 and use **your real email**.

| # | Do this | Expected |
|---|---|---|
| 1 | **Email code** tab → your email → **Send OTP** | "OTP sent successfully." The email arrives within a minute (check Spam the first time). |
| 2 | Enter the code from the email | Moves on to "Create a password" (new account) or the dashboard. |
| 3 | Request a new code, enter a wrong one | "Invalid verification code. 4 attempts left." |
| 4 | Request a code, wait 5+ minutes, enter it | "OTP expired. Please request a new code." |
| 5 | Enter 5 wrong codes, then the right one | "Too many attempts. Please request a new code." |
| 6 | Click **Resend OTP** before the countdown ends (or Send OTP twice) | Button disabled with countdown; the API answers "Please wait before requesting another OTP." |
| 7 | Log out, then open http://localhost:5174/dashboard | Redirected to the sign-in page. |
| 8 | Create a password, log out, sign in on the **Password** tab | Dashboard, no email code needed. |
| 9 | Sign in with a wrong password 6 times | "Too many failed sign-in attempts…" (resets after 15 min or a server restart). |
| 10 | **Forgot password?** → your email → open the email → **Reset password** | Link opens the reset page; the `#token=…` disappears from the address bar. |
| 11 | Set a new password | Signed in; dashboard shows "Your password has been reset." |
| 12 | Click the same reset link again | "This reset link is invalid or has expired." |
| 13 | Sign in on the dashboard, refresh the page | Still signed in (cookie kept). |
| 14 | DevTools → Application → Cookies → `localhost` | `token` cookie with **HttpOnly** ✓. In Console, `document.cookie` does **not** show it. |
| 15 | DevTools → Network → the `send-otp` response | Contains a message only — **no code**. |

Rate-limit counters live in the server's memory: restarting the backend (or saving any server file while `npm run dev` runs) resets them.

## 3. Production test (after deployment)

Repeat section 2 using the public frontend URL, a **different** email address (ideally a friend's, on another provider such as Outlook), and a phone on mobile data. Also check:

- The site loads over `https://` with no browser warnings.
- The reset link in the email points to the public URL, not `localhost`.
- Refreshing `/dashboard` or opening `/reset-password` directly does not show a 404.
