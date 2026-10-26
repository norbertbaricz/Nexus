'use strict';

const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');

// Request proofs survive proxy host rewrites without trusting arbitrary origins.
const NONCE_COOKIE = 'nexus_request_nonce';
const PROOF_HEADER = 'x-nexus-csrf';
const NONCE_BYTES = 32;
const SIGNATURE_HEX_LENGTH = 64;
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);
const SOURCE_ERROR_CODE = 'SOURCE_VERIFICATION_FAILED';
const SOURCE_ERROR_MESSAGE = 'Nexus could not verify this request. Reload the page and try again.';

function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value.trim() : '';
}
function cookieValue(req, name) {
  for (const part of header(req, 'cookie').split(';')) {
    const at = part.indexOf('=');
    if (at >= 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}
function normalizeOrigin(value, allowPath = false) {
  if (typeof value !== 'string' || !value.trim() || value.trim() === 'null') return null;
  try {
    const url = new URL(value.trim());
    if (!SAFE_PROTOCOLS.has(url.protocol) || url.username || url.password) return null;
    if (!allowPath && (url.pathname !== '/' || url.search || url.hash)) return null;
    return url.origin;
  } catch { return null; }
}
function firstHeaderValue(value) { return value.split(',')[0].trim(); }

function createRequestSecurity(config) {
  const secret = config.csrfSecret || randomBytes(32);
  const lifetimeMs = config.csrfLifetimeMs;
  const sign = (nonce, expiry, sessionHash) => createHmac('sha256', secret)
    .update(`${nonce}:${expiry}:${sessionHash || 'anonymous'}`).digest('hex');

  function issueToken(req, res) {
    let nonce = cookieValue(req, NONCE_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(nonce)) nonce = randomBytes(NONCE_BYTES).toString('hex');
    res.cookie(NONCE_COOKIE, nonce, {
      httpOnly: true, sameSite: 'strict', secure: config.secureCookies,
      maxAge: lifetimeMs, path: '/',
    });
    const expiry = (Date.now() + lifetimeMs).toString(36);
    return `${expiry}.${sign(nonce, expiry, req.session?.hash)}`;
  }
  function verifyToken(req, token, sessionHash) {
    if (typeof token !== 'string' || token.length > 100) return false;
    const nonce = cookieValue(req, NONCE_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(nonce)) return false;
    const parts = token.split('.');
    if (parts.length !== 2 || !/^[a-z0-9]+$/.test(parts[0]) || !new RegExp(`^[a-f0-9]{${SIGNATURE_HEX_LENGTH}}$`).test(parts[1])) return false;
    const expiresAt = parseInt(parts[0], 36);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
    const expected = Buffer.from(sign(nonce, parts[0], sessionHash), 'hex');
    return timingSafeEqual(expected, Buffer.from(parts[1], 'hex'));
  }
  function targetOrigins(req) {
    const protocol = req.protocol || (req.socket?.encrypted ? 'https' : 'http');
    const targets = [normalizeOrigin(config.publicOrigin), normalizeOrigin(`${protocol}://${header(req, 'host')}`)];
    if (config.trustProxy) {
      const forwardedHost = firstHeaderValue(header(req, 'x-forwarded-host')) || header(req, 'host');
      const forwardedProtocol = firstHeaderValue(header(req, 'x-forwarded-proto')) || protocol;
      targets.push(normalizeOrigin(`${forwardedProtocol}://${forwardedHost}`));
    }
    return new Set(targets.filter(Boolean));
  }
  function isTrusted(req, token = header(req, PROOF_HEADER), sessionHash = req.session?.hash) {
    const site = header(req, 'sec-fetch-site');
    const rawOrigin = header(req, 'origin');
    const origin = normalizeOrigin(rawOrigin);
    if (site === 'cross-site' || rawOrigin && !origin) return false;
    // Browser-controlled metadata attests the public origin before a proxy rewrites it.
    if (site === 'same-origin') return true;
    // The signed proof is bound to this browser nonce and its current session.
    if (verifyToken(req, token, sessionHash)) return true;
    const source = origin || normalizeOrigin(header(req, 'referer'), true);
    return Boolean(source && targetOrigins(req).has(source));
  }
  function canBeginHandshake(req) {
    const rawOrigin = header(req, 'origin');
    return header(req, 'sec-fetch-site') !== 'cross-site' && (!rawOrigin || Boolean(normalizeOrigin(rawOrigin)));
  }
  return { issueToken, isTrusted, canBeginHandshake };
}

module.exports = { createRequestSecurity, normalizeOrigin, SOURCE_ERROR_CODE, SOURCE_ERROR_MESSAGE };
