'use strict';

const { randomBytes, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const deriveKey = promisify(scrypt);

// The work factor deliberately bounds memory and CPU per password check.
const PASSWORD_KEY_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const COOKIE_NAME = 'nexus_session';
const LOGIN_INPUT_MAX_LENGTH = 128;

function normalizeLoginUsername(value) {
  if (typeof value !== 'string' || value.length > LOGIN_INPUT_MAX_LENGTH) return '';
  const normalized = value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').trim().replace(/^@/,'').toLowerCase();
  return /^[a-z0-9_.]{1,24}$/.test(normalized) ? normalized : '';
}
function validPasswordHash(value) { return typeof value === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(value); }

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function cookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => {
    const at = part.indexOf('=');
    return at < 0 ? [part.trim(), ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
  }));
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS);
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, stored) {
  if (typeof password !== 'string' || !validPasswordHash(stored)) return false;
  const [salt, hash] = stored.split(':');
  const key = await deriveKey(password, salt, PASSWORD_KEY_BYTES, SCRYPT_OPTIONS);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
function findSession(db, header) {
  const token = cookies(header)[COOKIE_NAME];
  if (!token || token.length !== 64) return null;
  return db.prepare(`SELECT s.userId, s.hash, s.expiresAt FROM sessions s
    WHERE s.hash = ? AND s.expiresAt > ?`).get(digest(token), Date.now()) || null;
}
function createSession(db, res, userId, config) {
  const token = randomBytes(32).toString('hex');
  const maxAge = config.sessionDays * 86400000;
  db.prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), userId, Date.now() + maxAge);
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, maxAge, path: '/' });
}

module.exports = { COOKIE_NAME, normalizeLoginUsername, validPasswordHash, hashPassword, checkPassword, findSession, createSession };
