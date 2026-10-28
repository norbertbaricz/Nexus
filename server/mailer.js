'use strict';
const nodemailer = require('nodemailer');

// Delivery limits and SMTP secrets come from server/config.js and private .env.
const MAIL_DEFAULTS = Object.freeze({ maxQueue: 50, concurrency: 2, connectionTimeoutMs: 10000, greetingTimeoutMs: 10000, socketTimeoutMs: 20000 });
const SAFE_MAIL_COMMANDS = new Set(['CONN','EHLO','HELO','STARTTLS','AUTH','MAIL','RCPT','DATA','QUIT']);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));
function recoveryOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) return '';
    return url.origin;
  } catch { return ''; }
}
function createMailer(config, injectedTransport) {
  const options = { ...MAIL_DEFAULTS, ...config.mail }, origin = recoveryOrigin(config.publicOrigin);
  const configured = Boolean(origin && options.host && options.from && !/[\r\n]/.test(options.from) && Number.isInteger(options.port) && options.port > 0 && options.port < 65536 && Boolean(options.user) === Boolean(options.password));
  const transport = injectedTransport || (configured ? nodemailer.createTransport({
    host: options.host, port: options.port, secure: options.secure || options.port === 465,
    requireTLS: true, ignoreTLS: false, opportunisticTLS: false,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    ...(options.user ? { auth: { user: options.user, pass: options.password } } : {}),
    connectionTimeout: options.connectionTimeoutMs, greetingTimeout: options.greetingTimeoutMs,
    socketTimeout: options.socketTimeoutMs, disableFileAccess: true, disableUrlAccess: true,
  }) : null);
  const available = Boolean(origin && transport);
  const pending = []; let active = 0, closed = false;
  const idleWaiters = [];
  function pump() {
    while (!closed && active < options.concurrency && pending.length) {
      const message = pending.shift(); active++;
      Promise.resolve().then(() => transport.sendMail(message)).catch(error => {
        // Provider errors can echo recipients or secrets: log bounded classifications only.
        const code=/^[A-Z][A-Z0-9_]{0,39}$/.test(error.code||'')?error.code:'MAIL_DELIVERY_FAILED';
        const command=String(error.command||'').split(' ')[0];
        console.error('[Nexus mail] Delivery failed.', {code,command:SAFE_MAIL_COMMANDS.has(command)?command:''});
      }).finally(() => { active--; pump(); if (!active && !pending.length) idleWaiters.splice(0).forEach(resolve => resolve()); });
    }
  }
  function enqueue({ to, subject, text, html }) {
    if (!available || closed || active + pending.length >= options.maxQueue) return false;
    pending.push({ from: options.from || 'Nexus <noreply@example.test>', to, subject, text, html,
      headers: { 'X-Auto-Response-Suppress': 'All' }, disableFileAccess: true, disableUrlAccess: true });
    pump(); return true;
  }
  function message(kind, to, token, minutes) {
    const verify = kind === 'verify', title = verify ? 'Verify your Nexus recovery email' : 'Reset your Nexus password';
    const action = verify ? 'Verify recovery email' : 'Choose a new password';
    // Fragments keep the secret out of HTTP access logs and Referer headers.
    const link = `${origin}/#${verify ? 'verify-email' : 'reset-password'}=${encodeURIComponent(token)}`;
    return { to, subject: title,
      text: `${title}\n\n${action}: ${link}\n\nThis single-use link expires in ${minutes} minutes. If you did not request this, ignore this email. Nexus will never ask you to share your password or recovery codes.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h1 style="font-size:23px">${title}</h1><p>Use the button to continue on your Nexus server.</p><p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#e7857e;color:#171719;text-decoration:none">${action}</a></p><p>This single-use link expires in ${minutes} minutes.</p><p>If you did not request this, ignore this email. Never share your password or recovery codes.</p></div>` };
  }
  function notify(to, subject, text) { return enqueue({ to, subject, text, html: `<p style="font-family:Arial,sans-serif;line-height:1.6">${escape(text)}</p>` }); }
  return { available, origin, enqueue, message, notify,
    get capacity() { return available && !closed && active + pending.length < options.maxQueue; },
    idle: () => !active && !pending.length ? Promise.resolve() : new Promise(resolve => idleWaiters.push(resolve)),
    close() { closed = true; pending.length = 0; transport?.close?.(); if (!active) idleWaiters.splice(0).forEach(resolve => resolve()); },
  };
}
module.exports = { MAIL_DEFAULTS, recoveryOrigin, createMailer };
