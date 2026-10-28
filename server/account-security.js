'use strict';
const { randomBytes, createHash } = require('node:crypto');
const { domainToASCII } = require('node:url');
const { transaction } = require('./database');
const { normalizeLoginUsername, COOKIE_NAME } = require('./auth');
const { supportRecoveryRecord } = require('./support-recovery');

// Limits are configured in CONFIG.recovery; no raw token/code is stored or logged.
const RECOVERY_DEFAULTS = require('./config').CONFIG.recovery;
const GENERIC_RECOVERY_MESSAGE = 'If this account has a verified recovery email, a reset link will arrive shortly.';
const INVALID_PROOF_MESSAGE = 'This recovery link or code is invalid or expired. Request a new link or use another saved code.';
const digest = (purpose, value) => createHash('sha256').update(`${purpose}:${value}`).digest('hex');
function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n\x00]/.test(value)) return '';
  const raw = value.trim(), at = raw.lastIndexOf('@');
  if (at < 1) return '';
  const local = raw.slice(0,at), domain = domainToASCII(raw.slice(at+1)).toLowerCase();
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return '';
  if (!domain.includes('.') || domain.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))) return '';
  const result = `${local.toLowerCase()}@${domain}`;
  return result.length <= 254 ? result : '';
}
function normalizeRecoveryCode(value) {
  if (typeof value !== 'string' || value.length > 160) return '';
  const code = value.trim().toUpperCase().replace(/^NXS[\s-]*/, '').replace(/[\s-]/g,'');
  return /^[A-F0-9]{32,64}$/.test(code) ? code : '';
}
function installAccountSecurity(app, context) {
  const { db, config, auth, HttpError, limit, checkPassword, hashPassword, mailer, revokeSessions } = context;
  const settings = { ...RECOVERY_DEFAULTS, ...config.recovery };
  if (!Number.isInteger(settings.tokenBytes) || settings.tokenBytes < 32 || settings.tokenBytes > 64 || !Number.isInteger(settings.codeBytes) || settings.codeBytes < 16 || settings.codeBytes > 32 || !Number.isInteger(settings.codeCount) || settings.codeCount < 1 || settings.codeCount > 20) throw new Error('Recovery token/code configuration is invalid.');
  for(const key of ['resetTokenMinutes','verificationTokenMinutes','supportTokenMinutes','requestsPerMinute','proofAttemptsPerMinute','settingsPerMinute'])if(!Number.isInteger(settings[key])||settings[key]<1)throw new Error('Recovery expiry/rate configuration is invalid.');
  for(const key of ['cooldownMs','responseDelayMs'])if(!Number.isFinite(settings[key])||settings[key]<0)throw new Error('Recovery timing configuration is invalid.');
  const invalid = () => new HttpError(400, INVALID_PROOF_MESSAGE);
  const codeHash = code => digest('recovery-code', code);
  const tokenHash = token => digest('account-token', token);
  const read = userId => db.prepare('SELECT * FROM account_security WHERE userId=?').get(userId);
  const ensure = userId => db.prepare('INSERT OR IGNORE INTO account_security (userId) VALUES (?)').run(userId);
  function status(userId) {
    const row = read(userId);
    return { email: row?.email || '', verifiedAt: row?.verifiedAt || null, pendingEmail: row?.pendingEmail || '',
      remainingCodes: db.prepare('SELECT COUNT(*) AS count FROM recovery_codes WHERE userId=?').get(userId).count,
      emailAvailable: mailer.available, codeCount: settings.codeCount };
  }
  function sensitiveLimit(req) { limit(`security-settings:${req.userId}`, settings.settingsPerMinute); }
  function stillAuthorized(req, user) {
    const current = db.prepare('SELECT passwordHash FROM users WHERE id=?').get(user.id);
    if (!current || current.passwordHash !== user.passwordHash || !db.prepare('SELECT 1 FROM sessions WHERE hash=? AND userId=? AND expiresAt>?').get(req.session.hash,user.id,Date.now())) throw new HttpError(401,'Your session changed. Sign in again before changing account security.');
  }
  async function reauthenticate(req) {
    const user = db.prepare('SELECT id,passwordHash FROM users WHERE id=?').get(req.userId);
    const password = req.body.password;
    if (!user || typeof password !== 'string' || password.length > config.maxPasswordLength || !await checkPassword(password,user.passwordHash)) throw new HttpError(403,'Enter your current password to change account security.');
    stillAuthorized(req,user); return user;
  }
  function newToken(userId, purpose, email, minutes) {
    const token = randomBytes(settings.tokenBytes).toString('base64url'), now = Date.now();
    db.prepare('DELETE FROM account_tokens WHERE userId=? AND purpose=?').run(userId,purpose);
    db.prepare('INSERT INTO account_tokens VALUES (?,?,?,?,?,?)').run(tokenHash(token),userId,purpose,email,now,now+minutes*60000);
    return token;
  }
  function tokenRecord(token, purpose) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) return null;
    return db.prepare('SELECT * FROM account_tokens WHERE hash=? AND purpose=? AND expiresAt>?').get(tokenHash(token),purpose,Date.now());
  }
  function audit(event,userId) { console.info('[Nexus security]', { event,userId }); }

  app.get('/api/account/security',auth,(req,res) => res.json(status(req.userId)));
  app.post('/api/account/recovery-email',auth,async (req,res) => {
    sensitiveLimit(req);
    const email = normalizeEmail(req.body.email);
    if (!email) throw new HttpError(400,'Enter a valid recovery email address.');
    const user = await reauthenticate(req);
    const previous = read(user.id);
    if (previous?.email === email) return res.json({ ...status(user.id), alreadyVerified: true });
    if (mailer.available && previous?.pendingAt && Date.now()-previous.pendingAt < settings.cooldownMs) throw new HttpError(429,'Wait a minute before requesting another verification email.');
    if (mailer.available && !mailer.capacity) throw new HttpError(503,'Email delivery is busy. Please try again shortly.');
    let token;
    transaction(db,() => {
      stillAuthorized(req,user); ensure(user.id);
      db.prepare('UPDATE account_security SET pendingEmail=?,pendingAt=? WHERE userId=?').run(email,mailer.available?Date.now():0,user.id);
      db.prepare('DELETE FROM account_tokens WHERE userId=? AND purpose=?').run(user.id,'verify');
      db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(user.id);
      if(mailer.available)token = newToken(user.id,'verify',email,settings.verificationTokenMinutes);
    });
    if(token)mailer.enqueue(mailer.message('verify',email,token,settings.verificationTokenMinutes));
    if (previous?.email) mailer.notify(previous.email,'Nexus recovery email change requested','A change to your Nexus recovery email was requested with your current password. Your current recovery address remains active until the new address is verified. If this was not you, sign in and secure your account.');
    audit(token?'recovery-email-requested':'recovery-email-saved-unverified',user.id); res.json({...status(user.id),verificationSent:Boolean(token)});
  });
  app.delete('/api/account/recovery-email',auth,async (req,res) => {
    sensitiveLimit(req); const user = await reauthenticate(req), previous = read(user.id);
    transaction(db,() => { stillAuthorized(req,user); db.prepare('DELETE FROM account_tokens WHERE userId=?').run(user.id); db.prepare('DELETE FROM account_security WHERE userId=?').run(user.id); db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(user.id); });
    if (previous?.email) mailer.notify(previous.email,'Nexus recovery email removed','Your recovery email was removed using your account password. If this was not you, contact your Nexus server administrator.');
    audit('recovery-email-removed',user.id); res.json(status(user.id));
  });
  app.post('/api/account/recovery-codes',auth,async (req,res) => {
    sensitiveLimit(req); const user = await reauthenticate(req), codes = [];
    transaction(db,() => {
      stillAuthorized(req,user); db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(user.id);
      db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(user.id);
      for (let index=0; index<settings.codeCount; index++) {
        const raw = randomBytes(settings.codeBytes).toString('hex').toUpperCase();
        db.prepare('INSERT INTO recovery_codes VALUES (?,?,?)').run(codeHash(raw),user.id,Date.now());
        codes.push('NXS-'+raw.match(/.{1,4}/g).join('-'));
      }
    });
    const previous = read(user.id);
    if (previous?.email) mailer.notify(previous.email,'Nexus recovery codes replaced','New single-use recovery codes were generated using your account password. Previously saved codes no longer work. If this was not you, secure your account.');
    audit('recovery-codes-generated',user.id); res.json({ ...status(user.id), codes });
  });
  app.post('/api/auth/verify-email',(req,res) => {
    limit(`recovery-proof:${req.ip}`,settings.proofAttemptsPerMinute);
    const record = tokenRecord(req.body.token,'verify'); if (!record) throw invalid();
    const previous = read(record.userId);
    if (previous?.pendingEmail !== record.targetEmail) throw invalid();
    if (db.prepare('SELECT userId FROM account_security WHERE email=? AND userId!=?').get(record.targetEmail,record.userId)) throw new HttpError(400,'This recovery address cannot be used. Sign in and choose another address.');
    transaction(db,() => {
      db.prepare('UPDATE account_security SET email=?,verifiedAt=?,pendingEmail=NULL,pendingAt=0 WHERE userId=?').run(record.targetEmail,Date.now(),record.userId);
      db.prepare('DELETE FROM account_tokens WHERE userId=?').run(record.userId);
      db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(record.userId);
    });
    if (previous?.email && previous.email !== record.targetEmail) mailer.notify(previous.email,'Nexus recovery email changed','A newly verified email address replaced this recovery address. If this was not you, secure your account and contact your Nexus server administrator.');
    audit('recovery-email-verified',record.userId); res.json({ ok:true });
  });
  app.post('/api/auth/forgot-password',async (req,res) => {
    limit(`recovery-request:${req.ip}`,settings.requestsPerMinute);
    if (!mailer.available) throw new HttpError(503,'Recovery email is not configured on this Nexus server. Use a saved recovery code.');
    const started = Date.now(), identifier = typeof req.body.identifier === 'string' ? req.body.identifier : '';
    const email = normalizeEmail(identifier), username = normalizeLoginUsername(identifier);
    const user = email ? db.prepare('SELECT userId AS id FROM account_security WHERE email=? AND verifiedAt IS NOT NULL').get(email)
      : username ? db.prepare('SELECT id FROM users WHERE username=?').get(username) : null;
    const security = user ? read(user.id) : null;
    if (security?.email && security.verifiedAt && Date.now()-security.resetRequestedAt >= settings.cooldownMs && mailer.capacity) {
      let token;
      transaction(db,() => { token=newToken(user.id,'reset',security.email,settings.resetTokenMinutes); db.prepare('UPDATE account_security SET resetRequestedAt=? WHERE userId=?').run(Date.now(),user.id); });
      mailer.enqueue(mailer.message('reset',security.email,token,settings.resetTokenMinutes));
    }
    // Delivery runs asynchronously; known/unknown accounts get the same response and delay.
    const remaining = settings.responseDelayMs-(Date.now()-started);
    if (remaining>0) await new Promise(resolve=>setTimeout(resolve,remaining));
    res.json({ ok:true,message:GENERIC_RECOVERY_MESSAGE });
  });
  app.post('/api/auth/reset-password',async (req,res) => {
    limit(`recovery-proof:${req.ip}`,settings.proofAttemptsPerMinute);
    const password = req.body.newPassword;
    if (typeof password !== 'string' || password.length < config.minPasswordLength || password.length > config.maxPasswordLength) throw new HttpError(400,`Use a password with ${config.minPasswordLength}–${config.maxPasswordLength} characters.`);
    if (password !== req.body.confirmPassword) throw new HttpError(400,'The new passwords do not match.');
    const token = req.body.token, code = normalizeRecoveryCode(req.body.recoveryCode), username = normalizeLoginUsername(req.body.username);
    const emailProof = tokenRecord(token,'reset');
    const codeProof = !token && code && username ? db.prepare('SELECT c.hash,c.userId FROM recovery_codes c JOIN users u ON u.id=c.userId WHERE c.hash=? AND u.username=?').get(codeHash(code),username) : null;
    const supportProof = !emailProof ? supportRecoveryRecord(db,token) : null;
    const proof = emailProof || codeProof || supportProof;
    if (!proof) throw invalid();
    limit(`recovery-account:${proof.userId}`,settings.proofAttemptsPerMinute);
    const passwordHash = await hashPassword(password);
    let notification;
    transaction(db,() => {
      // Recheck after password hashing so concurrent requests cannot spend one proof twice.
      const current = emailProof ? tokenRecord(token,'reset') : supportProof ? supportRecoveryRecord(db,token) : db.prepare('SELECT * FROM recovery_codes WHERE hash=? AND userId=?').get(codeProof.hash,proof.userId);
      const security = read(proof.userId);
      if (!current || emailProof && (current.userId !== proof.userId || security?.email !== current.targetEmail || !security.verifiedAt)) throw invalid();
      if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(proof.userId)) throw invalid();
      db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(passwordHash,proof.userId);
      db.prepare('DELETE FROM sessions WHERE userId=?').run(proof.userId);
      db.prepare('DELETE FROM account_tokens WHERE userId=?').run(proof.userId);
      db.prepare('DELETE FROM recovery_codes WHERE userId=?').run(proof.userId);
      db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(proof.userId);
      db.prepare('UPDATE account_security SET pendingEmail=NULL,pendingAt=0,resetRequestedAt=0 WHERE userId=?').run(proof.userId);
      notification = security?.email;
      if(supportProof)db.prepare('DELETE FROM account_security WHERE userId=?').run(proof.userId);
    });
    revokeSessions(proof.userId);
    if(req.userId===proof.userId)res.clearCookie(COOKIE_NAME,{path:'/',httpOnly:true,sameSite:'strict',secure:config.secureCookies});
    if (notification) mailer.notify(notification,'Your Nexus password changed',supportProof?'Your password was reset with assistance from the Nexus host operator. All sessions and previous recovery methods were revoked. Sign in and enroll new recovery methods. If this was not you, contact the host operator immediately.':'Your password was reset and all existing sessions and old recovery codes were revoked. Sign in with your new password and generate fresh recovery codes. If this was not you, request a new recovery link and contact your Nexus server administrator.');
    audit(supportProof?'password-reset-host-assisted':'password-reset',proof.userId); res.json({ ok:true,message:supportProof?'Password changed. Sign in and set up a verified recovery email and fresh recovery codes.':'Password changed. Sign in with your new password, then generate fresh recovery codes.' });
  });
  return { status, settings };
}
module.exports = { installAccountSecurity, normalizeEmail, normalizeRecoveryCode, GENERIC_RECOVERY_MESSAGE, INVALID_PROOF_MESSAGE };
