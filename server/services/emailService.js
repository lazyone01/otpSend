import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { OTP_EXPIRY_MS } from '../utils/otp.js';

// ---------- Delivery: SMTP (Nodemailer) or Brevo HTTPS API, chosen by EMAIL_PROVIDER ----------
// The rest of this file only calls deliver() - it doesn't care which one is used.

// A "transporter" is Nodemailer's connection to the SMTP server. Created once and reused.
const transporter =
  env.emailProvider === 'smtp'
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465, // 465 = TLS from the start; 587 = upgrade to TLS via STARTTLS
        auth: {
          user: env.smtp.user,
          pass: env.smtp.password,
        },
        // Don't let a slow SMTP server hang the request forever.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;

const BREVO_API = 'https://api.brevo.com/v3';

// EMAIL_FROM looks like 'OTP Auth <you@example.com>'. APIs want the name and address separately.
function parseFrom(from) {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1] || undefined, email: match[2].trim() } : { email: from.trim() };
}

async function brevoRequest(path, options = {}) {
  const res = await fetch(`${BREVO_API}${path}`, {
    ...options,
    headers: { 'api-key': env.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    signal: AbortSignal.timeout(15000), // same idea as the SMTP timeouts
  });
  if (!res.ok) {
    // Brevo explains failures in the body (e.g. "sender not verified"). Log-worthy, never shown to users.
    const detail = await res.text().catch(() => '');
    const err = new Error(`Brevo API ${res.status}: ${detail.slice(0, 300)}`);
    err.code = `BREVO_${res.status}`;
    throw err;
  }
  return res.json();
}

async function deliver({ to, subject, text, html }) {
  if (env.emailProvider === 'brevo') {
    await brevoRequest('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: parseFrom(env.emailFrom),
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    return;
  }
  await transporter.sendMail({ from: env.emailFrom, to, subject, text, html });
}

// Called at startup to check the email credentials work (SMTP login / Brevo API key).
export async function verifyEmailTransport() {
  if (env.emailProvider === 'brevo') {
    await brevoRequest('/account');
    return;
  }
  await transporter.verify();
}

export async function sendOtpEmail(to, otp) {
  const minutes = OTP_EXPIRY_MS / 60000;

  // Plain-text version: shown by email clients that don't render HTML, and helps spam scores.
  const text = [
    'Hello,',
    '',
    'Your verification code is:',
    '',
    otp,
    '',
    `This code will expire in ${minutes} minutes.`,
    '',
    'If you did not request this code, you can safely ignore this email.',
    '',
    'Regards,',
    'OTP Authentication App',
  ].join('\n');

  // HTML version: inline styles only, because most email clients strip <style> tags.
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 16px">Your Verification Code</h2>
    <p>Hello,</p>
    <p>Your verification code is:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f4f6fb;padding:16px;text-align:center;border-radius:8px;margin:16px 0">${otp}</p>
    <p>This code will expire in <strong>${minutes} minutes</strong>.</p>
    <p style="color:#6b7280;font-size:14px">If you did not request this code, you can safely ignore this email.</p>
    <p style="margin-top:24px">Regards,<br>OTP Authentication App</p>
  </div>`;

  await deliver({
    to,
    subject: 'Your Verification Code',
    text,
    html,
  });
}

export async function sendPasswordResetEmail(to, resetUrl, expiresInMinutes) {
  const text = [
    'Hello,',
    '',
    'We received a request to reset the password for your account.',
    'Open this link to choose a new password:',
    '',
    resetUrl,
    '',
    `This link will expire in ${expiresInMinutes} minutes and can only be used once.`,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    'Your password will not change.',
    '',
    'Regards,',
    'OTP Authentication App',
  ].join('\n');

  // The button is a styled <a> link - email clients don't run JavaScript or support real buttons.
  // The plain URL is repeated below it in case the button doesn't render.
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
    <h2 style="margin:0 0 16px">Reset your password</h2>
    <p>Hello,</p>
    <p>We received a request to reset the password for your account. Click the button below to choose a new password.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:8px">Reset password</a>
    </p>
    <p>This link will expire in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
    <p style="color:#6b7280;font-size:13px;word-break:break-all">If the button doesn't work, copy this link into your browser:<br>${resetUrl}</p>
    <p style="color:#6b7280;font-size:14px">If you did not request a password reset, you can safely ignore this email. Your password will not change.</p>
    <p style="margin-top:24px">Regards,<br>OTP Authentication App</p>
  </div>`;

  await deliver({
    to,
    subject: 'Reset your password',
    text,
    html,
  });
}
