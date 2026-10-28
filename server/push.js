'use strict';

const { createHash, createECDH, ECDH, randomBytes } = require('node:crypto');
const webPush = require('web-push');
const { transaction } = require('./database');
const { publicOrigin } = require('./social-preview');
const { notificationContent } = require('./notification-content');

// Only real browser push-service hosts may become outbound request targets.
const PUSH_RULES = Object.freeze({ endpointLength: 4096, keyBytes: 65, authBytes: 16, identityKey: 'webPushIdentity', devicePattern: /^[a-f0-9]{32}$/, keyPattern: /^[A-Za-z0-9_-]+={0,2}$/ });
const hash = value => createHash('sha256').update(value).digest('hex');
function allowedEndpoint(value) {
  if (typeof value !== 'string' || value.length > PUSH_RULES.endpointLength || /\s/.test(value)) return false;
  try {
    const url = new URL(value), host = url.hostname;
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && url.pathname !== '/' && (
      host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}
function normalizeSubscription(value) {
  if (!value || !allowedEndpoint(value.endpoint) || !value.keys || typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string') throw new Error('Choose a valid browser push subscription.');
  const { p256dh, auth } = value.keys;
  if (p256dh.length > 100 || auth.length > 32 || !PUSH_RULES.keyPattern.test(p256dh) || !PUSH_RULES.keyPattern.test(auth)) throw new Error('The browser notification keys are invalid.');
  const key = Buffer.from(p256dh, 'base64url'), secret = Buffer.from(auth, 'base64url');
  if (key.length !== PUSH_RULES.keyBytes || key[0] !== 4 || secret.length !== PUSH_RULES.authBytes) throw new Error('The browser notification keys are invalid.');
  try { ECDH.convertKey(key, 'prime256v1'); } catch { throw new Error('The browser notification key is invalid.'); }
  const expirationTime = value.expirationTime ?? null;
  if (expirationTime !== null && (!Number.isSafeInteger(expirationTime) || expirationTime <= 0)) throw new Error('The browser notification expiry is invalid.');
  return { endpoint: new URL(value.endpoint).href, expirationTime, keys: { p256dh: key.toString('base64url'), auth: secret.toString('base64url') } };
}
function trustedSubject(config) {
  const origin = publicOrigin(config.publicOrigin);
  if (!origin.startsWith('https://')) return null;
  const subject = config.push?.subject || origin;
  if (subject === publicOrigin(subject) && subject.startsWith('https://') || /^mailto:[^\s<>@?]+@[^\s<>@?]+\.[a-z]{2,}$/i.test(subject)) return { origin, subject };
  return null;
}
function identity(db) {
  let keys;
  transaction(db, () => {
    const saved = db.prepare('SELECT value FROM app_settings WHERE key=?').get(PUSH_RULES.identityKey);
    keys = saved ? JSON.parse(saved.value) : webPush.generateVAPIDKeys();
    const ecdh = createECDH('prime256v1'); ecdh.setPrivateKey(Buffer.from(keys.privateKey, 'base64url'));
    if (!ecdh.getPublicKey().equals(Buffer.from(keys.publicKey, 'base64url'))) throw new Error('Invalid push identity.');
    if (!saved) db.prepare('INSERT INTO app_settings(key,value) VALUES (?,?)').run(PUSH_RULES.identityKey, JSON.stringify(keys));
  });
  return keys;
}

function installPush(app, { db, config, auth, HttpError, limit, access, social, transport, clock = Date.now, start = true }) {
  const options = config.push, subject = trustedSubject(config); let keys = null, closed = false, busy = false, timer = null, warnedAt = 0;
  if (options.enabled && subject) {
    try { keys = identity(db); } catch { console.error('[Nexus push] The stored signing identity is invalid. Restore the private database backup to recover background notifications.'); }
  }
  const configured = Boolean(keys), send = transport || ((subscription, payload, settings) => webPush.sendNotification(subscription, payload, settings));
  const warn = code => { if (clock() - warnedAt > 30000) { warnedAt = clock(); console.warn(`[Nexus push] Delivery will retry when possible (${code}).`); } };
  const status = () => ({ configured, publicOrigin: subject?.origin || '', applicationServerKey: keys?.publicKey || '', reason: !options.enabled ? 'disabled' : !subject ? 'origin' : !keys ? 'identity' : '' });
  const device = value => { if (typeof value !== 'string' || !PUSH_RULES.devicePattern.test(value)) throw new HttpError(400, 'Choose a valid notification device.'); return value; };
  function current(req) { return db.prepare('SELECT * FROM push_subscriptions WHERE userId=? AND sessionHash=? AND deviceId=?').get(req.userId, req.session.hash, device(req.body.deviceId)); }
  function ensureConfigured() { if (!configured) throw new HttpError(503, 'Background notifications need PUSH_ENABLED and a valid HTTPS PUBLIC_ORIGIN on the host.'); }
  function subscribe(req, value, previousId = '') {
    ensureConfigured(); const deviceId = device(req.body.deviceId); let subscription;
    try { subscription = normalizeSubscription(value); } catch (error) { throw new HttpError(400, error.message); }
    if (subscription.expirationTime !== null && subscription.expirationTime <= clock()) throw new HttpError(400, 'This notification subscription expired. Enable notifications again.');
    const id = hash(subscription.endpoint), same = db.prepare('SELECT * FROM push_subscriptions WHERE id=?').get(id);
    const own = db.prepare('SELECT * FROM push_subscriptions WHERE userId=? AND deviceId=?').get(req.userId, deviceId);
    if (previousId && (!own || own.id !== previousId || own.sessionHash !== req.session.hash || own.bindingId !== req.body.bindingId)) throw new HttpError(409, 'Open Nexus to renew notifications for the current account.');
    const count = db.prepare('SELECT count(*) AS count FROM push_subscriptions WHERE userId=?').get(req.userId).count;
    if (!own && same?.userId !== req.userId && count >= options.maxDevices) throw new HttpError(409, `Notifications are limited to ${options.maxDevices} devices per account. Sign out on an unused device first.`);
    const unchanged = same?.userId === req.userId && same.sessionHash === req.session.hash && same.deviceId === deviceId && same.origin === subject.origin && same.subscription === JSON.stringify(subscription);
    const bindingId = unchanged ? same.bindingId : randomBytes(16).toString('hex');
    transaction(db, () => {
      if (own && own.id !== id) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(own.id);
      if (same && !unchanged) db.prepare('DELETE FROM push_outbox WHERE subscriptionId=?').run(id);
      db.prepare(`INSERT INTO push_subscriptions(id,userId,sessionHash,deviceId,bindingId,origin,subscription,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET userId=excluded.userId,sessionHash=excluded.sessionHash,deviceId=excluded.deviceId,bindingId=excluded.bindingId,origin=excluded.origin,subscription=excluded.subscription,updatedAt=excluded.updatedAt`)
        .run(id, req.userId, req.session.hash, deviceId, bindingId, subject.origin, JSON.stringify(subscription), clock(), clock());
    });
    return { ...status(), userId: req.userId, bindingId, deviceId };
  }
  app.get('/api/push/status', auth, (req, res) => {
    const deviceId = req.query.deviceId === undefined ? null : device(req.query.deviceId);
    const enrolled = deviceId ? Boolean(db.prepare('SELECT 1 FROM push_subscriptions WHERE userId=? AND sessionHash=? AND deviceId=?').get(req.userId, req.session.hash, deviceId)) : false;
    res.json({ ...status(), enrolled });
  });
  app.post('/api/push/subscription', auth, (req, res) => { limit(`push:settings:${req.userId}`, options.settingsPerMinute); res.json(subscribe(req, req.body.subscription)); });
  app.post('/api/push/renew', auth, (req, res) => {
    limit(`push:settings:${req.userId}`, options.settingsPerMinute);
    if (typeof req.body.previousEndpoint !== 'string' || !allowedEndpoint(req.body.previousEndpoint)) throw new HttpError(400, 'Open Nexus to renew notifications.');
    res.json(subscribe(req, req.body.subscription, hash(req.body.previousEndpoint)));
  });
  app.delete('/api/push/subscription', auth, (req, res) => { limit(`push:settings:${req.userId}`, options.settingsPerMinute); const found = current(req); if (found) db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(found.id); res.json({ ok: true }); });
  function insertJob(subscription, message, kind = 'message') {
    const conversationId = message?.conversationId || 'test', id = hash(subscription.id + ':' + conversationId), at = clock();
    db.prepare(`INSERT INTO push_outbox(id,subscriptionId,messageId,conversationId,kind,createdAt,nextAttemptAt,expiresAt) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET messageId=excluded.messageId,kind=excluded.kind,createdAt=excluded.createdAt,expiresAt=excluded.expiresAt,attempts=0`)
      .run(id, subscription.id, message?.id || null, conversationId, kind, at, at + (kind === 'test' ? 0 : options.graceMs), at + options.ttlSeconds * 1000);
  }
  app.post('/api/push/test', auth, (req, res) => { ensureConfigured(); limit(`push:test:${req.userId}`, options.testsPerMinute); const found = current(req); if (!found) throw new HttpError(409, 'Enable notifications on this device first.'); if (db.prepare('SELECT status FROM users WHERE id=?').get(req.userId)?.status === 'dnd') throw new HttpError(409, 'Turn off Do not disturb before testing notifications.'); insertJob(found, null, 'test'); res.status(202).json({ queued: true }); });
  function eligible(message, subscription, checkRead = true) {
    if (!message || message.authorId === subscription.userId) return null;
    if (db.prepare('SELECT status FROM users WHERE id=?').get(subscription.userId)?.status === 'dnd') return null;
    if (social.pairBlocked(subscription.userId, message.authorId)) return null;
    let conversation; try { conversation = access(message.conversationId, subscription.userId); } catch { return null; }
    if (message.threadId) { const root = db.prepare('SELECT authorId FROM messages WHERE id=?').get(message.threadId); if (!root || social.isBlocked(subscription.userId, root.authorId)) return null; }
    const mentioned = JSON.parse(message.mentions || '[]').includes(subscription.userId);
    if (conversation.serverId && !mentioned && db.prepare('SELECT defaultNotifications FROM servers WHERE id=?').get(conversation.serverId)?.defaultNotifications === 'mentions') return null;
    if (checkRead && (db.prepare('SELECT readAt FROM reads WHERE conversationId=? AND userId=?').get(message.conversationId, subscription.userId)?.readAt || '') >= message.createdAt) return null;
    return conversation.type === 'dm' ? 'dm' : mentioned ? 'mention' : 'server';
  }
  function enqueue(message) {
    if (!configured || closed) return;
    const channel = db.prepare('SELECT serverId FROM channels WHERE id=?').get(message.conversationId);
    const memberSQL = channel ? 'SELECT userId FROM members WHERE serverId=?' : 'SELECT userId FROM participants WHERE conversationId=?';
    const subscriptions = db.prepare(`SELECT p.* FROM push_subscriptions p JOIN sessions s ON s.hash=p.sessionHash WHERE p.origin=? AND s.expiresAt>? AND p.userId IN (${memberSQL})`).all(subject.origin, clock(), channel?.serverId || message.conversationId);
    for (const subscription of subscriptions) if (eligible(message, subscription, false)) insertJob(subscription, message);
    const excess = db.prepare('SELECT count(*) AS count FROM push_outbox').get().count - options.queueLimit;
    if (excess > 0) db.prepare('DELETE FROM push_outbox WHERE id IN (SELECT id FROM push_outbox ORDER BY createdAt LIMIT ?)').run(excess);
  }
  async function deliver(job) {
    const subscription = db.prepare('SELECT p.*,s.expiresAt AS sessionExpires FROM push_subscriptions p JOIN sessions s ON s.hash=p.sessionHash WHERE p.id=?').get(job.subscriptionId);
    const remove = () => { if (!closed) db.prepare('DELETE FROM push_outbox WHERE id=? AND messageId IS ? AND createdAt=?').run(job.id, job.messageId, job.createdAt); };
    if (!subscription || subscription.origin !== subject.origin || subscription.sessionExpires <= clock() || job.expiresAt <= clock()) { remove(); return; }
    const message = job.kind === 'message' ? db.prepare('SELECT * FROM messages WHERE id=?').get(job.messageId) : null;
    const kind = job.kind === 'test' ? 'test' : eligible(message, subscription);
    // Read receipts suppress the conversation actually being read. A focused
    // installation may be browsing a different DM, server, voice room or dialog.
    if (!kind || db.prepare('SELECT status FROM users WHERE id=?').get(subscription.userId)?.status === 'dnd') { remove(); return; }
    let browser;
    try { browser = normalizeSubscription(JSON.parse(subscription.subscription)); } catch { db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(subscription.id); return; }
    if (browser.expirationTime !== null && browser.expirationTime <= clock()) { db.prepare('DELETE FROM push_subscriptions WHERE id=?').run(subscription.id); return; }
    const preferences = JSON.parse(db.prepare('SELECT preferences FROM user_preferences WHERE userId=?').get(subscription.userId)?.preferences || '{}');
    const payload = { version: 1, kind, bindingId: subscription.bindingId, conversationId: message?.conversationId || '', messageId: message?.id || '', sentAt: clock(), silent: preferences.sounds === false || preferences.soundVolume === 0, ...(message?{notification:notificationContent(db,message)}:{}) };
    try {
      await send(browser, JSON.stringify(payload), { vapidDetails: { subject: subject.subject, ...keys }, TTL: Math.max(1, Math.ceil((job.expiresAt - clock()) / 1000)), urgency: ['dm','mention'].includes(kind) ? 'high' : 'normal', topic: hash(subscription.bindingId + ':' + job.conversationId).slice(0, 32), timeout: options.timeoutMs, contentEncoding: 'aes128gcm' });
      if (closed) return;
      db.prepare('UPDATE push_subscriptions SET lastResult=?,lastResultAt=? WHERE id=? AND bindingId=?').run('sent', clock(), subscription.id, subscription.bindingId); remove();
    } catch (error) {
      if (closed) return;
      const statusCode = Number(error.statusCode), retry = options.retryDelaysMs[job.attempts];
      if ([404,410].includes(statusCode)) { db.prepare('DELETE FROM push_subscriptions WHERE id=? AND bindingId=?').run(subscription.id, subscription.bindingId); return; }
      db.prepare('UPDATE push_subscriptions SET lastResult=?,lastResultAt=? WHERE id=? AND bindingId=?').run('failed', clock(), subscription.id, subscription.bindingId);
      if (retry !== undefined && (statusCode === 429 || statusCode >= 500 || !statusCode) && clock() + retry < job.expiresAt) db.prepare('UPDATE push_outbox SET attempts=attempts+1,nextAttemptAt=? WHERE id=? AND messageId IS ? AND createdAt=?').run(clock() + retry, job.id, job.messageId, job.createdAt);
      else remove();
      warn(Number.isInteger(statusCode) && statusCode > 0 ? `HTTP ${statusCode}` : 'network unavailable');
    }
  }
  async function tick() {
    if (!configured || closed || busy) return; busy = true;
    try {
      db.prepare('DELETE FROM push_outbox WHERE expiresAt<=?').run(clock());
      const jobs = db.prepare('SELECT * FROM push_outbox WHERE nextAttemptAt<=? ORDER BY nextAttemptAt LIMIT ?').all(clock(), options.batchSize);
      for (let index = 0; index < jobs.length && !closed; index += options.concurrency) await Promise.all(jobs.slice(index, index + options.concurrency).map(deliver));
    } catch { if (!closed) warn('queue unavailable'); }
    finally { busy = false; }
  }
  if (configured && start) { timer = setInterval(() => { tick(); }, options.pollMs); timer.unref(); }
  return { status, enqueue, tick, configured, close() { closed = true; clearInterval(timer); } };
}
module.exports = { PUSH_RULES, allowedEndpoint, normalizeSubscription, trustedSubject, installPush };
