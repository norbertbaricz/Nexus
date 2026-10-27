'use strict';

const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const { randomUUID, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase, transaction } = require('./database');
const { changedFields } = require('./audit');
const { createBadges } = require('./badges');
const { installPublicAssets } = require('./public-assets');
const { COOKIE_NAME, hashPassword, checkPassword, findSession, createSession } = require('./auth');
const { installUploads } = require('./uploads');
const { installLifecycle } = require('./lifecycle');
const { installCommunity, CHANNEL_TYPES, CHANNEL_ICONS, isVoice, isForum } = require('./community');
const GIFS = require('../public/assets/gifs/catalog.json');
const { providerGif } = require('./gifs');
const { installSocial } = require('./social');
const { installPreferences } = require('./preferences');
const { installPins } = require('./pins');
const { mentionTokens, markSpoilers, attachmentCrops } = require('./message-content');
const { normalizeCrop, readCrop } = require('./artwork');
const { PERMISSION_DEFINITIONS, PERMISSION_KEYS, PROTECTED_ROLE_PERMISSIONS, resolvePermissions, normalizeDefaults } = require('./permissions');
const { timingSafeEqual, createHmac } = require('node:crypto');
const { createRequestSecurity, SOURCE_ERROR_CODE, SOURCE_ERROR_MESSAGE } = require('./request-security');

// Product-wide validation. Runtime limits and hosting settings are in config.js.
const STATUSES = new Set(['online', 'idle', 'dnd', 'invisible']);
const REACTIONS = new Set(['❤️', '🔥', '🙌', '👀', '😂', '✨', '👍', '🚀']);
const PUBLIC_USER_FIELDS = ['id', 'username', 'displayName', 'avatar', 'banner', 'bio', 'pronouns', 'accent', 'status', 'createdAt', 'avatarCrop', 'bannerCrop'];
const SERVER_PERMISSIONS = PERMISSION_KEYS;
const PROFILE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const USER_SEARCH_LIMITS = Object.freeze({ minimum: 2, maximum: 50, results: 20 });
const id = prefix => `${prefix}_${randomUUID()}`;
const now = () => new Date().toISOString();
const room = conversationId => `conversation:${conversationId}`;
const userRoom = userId => `user:${userId}`;
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function text(value, max, label, min = 0) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `${label} must be ${min}–${max} characters.`);
  }
  return value.trim();
}
function imageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString())) return 'image/gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

function createApp(config) {
  const app = express();
  const db = openDatabase(config.databasePath);
  const requestSecurity = createRequestSecurity(config);
  const badges = createBadges(db, config);
  fs.mkdirSync(config.uploadPath, { recursive: true });
  // Badges use immutable account IDs; display names never grant privileges.
  let creatorId = db.prepare("SELECT value FROM app_settings WHERE key='creatorUserId'").get()?.value || '';
  if (!creatorId) {
    const creator = config.creatorUserId ? db.prepare('SELECT id FROM users WHERE id=?').get(config.creatorUserId) : db.prepare('SELECT id FROM users WHERE username=?').get(config.creatorUsername);
    if (creator) { creatorId = creator.id; db.prepare("INSERT OR REPLACE INTO app_settings VALUES ('creatorUserId',?)").run(creatorId); }
  }
  function isOfficial(server) { return Boolean(creatorId && server.ownerId === creatorId && server.id === db.prepare("SELECT value FROM app_settings WHERE key='officialServerId'").get()?.value); }
  const permissionCache = new Map();
  const activeUsers = new Map();
  const activities = new Map();
  const recentMessages = new Map();
  const voice = new Map();
  const buckets = new Map();
  let io;
  const dummyPassword = hashPassword(randomBytes(32).toString('hex'));
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - 60000;
    for (const [key, item] of recentMessages) if (item.at < cutoff) recentMessages.delete(key);
    for (const [key, bucket] of buckets) if (bucket.since < cutoff) buckets.delete(key);
    db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(Date.now());
    if (io) for (const socket of io.sockets.sockets.values()) {
      if (!db.prepare('SELECT 1 FROM sessions WHERE hash = ? AND expiresAt > ?').get(socket.sessionHash, Date.now())) {
        socket.emit('session:expired'); socket.disconnect(true);
      }
    }
  }, 30000);
  cleanup.unref();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'same-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self)',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss: https://api.giphy.com https://media.giphy.com https://media0.giphy.com https://media1.giphy.com https://media2.giphy.com https://media3.giphy.com https://media4.giphy.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    });
    next();
  });
  app.use(express.json({ limit: config.jsonBodyLimit }));
  function limit(key, max) {
    let bucket = buckets.get(key);
    if (!bucket || Date.now() - bucket.since >= 60000) {
      bucket = { since: Date.now(), count: 0 }; buckets.set(key, bucket);
    }
    if (++bucket.count > max) throw new HttpError(429, 'A little too fast. Please try again in a minute.');
  }
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.vary('Origin'); res.vary('Sec-Fetch-Site');
    req.body ??= {};
    req.session = findSession(db, req.headers.cookie);
    req.userId = req.session?.userId;
    const chunkRequest = /^\/uploads\/[^/]+\/chunks$/.test(req.path);
    if (!chunkRequest) limit(`api:${req.userId || req.ip}`, config.requestsPerMinute);
    if (req.userId && !chunkRequest && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) limit(`mutation:${req.userId}`, config.mutationsPerMinute);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !requestSecurity.isTrusted(req)) {
      const error = new HttpError(403, SOURCE_ERROR_MESSAGE);
      error.publicCode = SOURCE_ERROR_CODE;
      throw error;
    }
    next();
  });
  const auth = (req, res, next) => {
    if (!req.userId) throw new HttpError(401, 'Sign in to continue.');
    next();
  };
  function publicUser(row) {
    if (!row) return null;
    const user = Object.fromEntries(PUBLIC_USER_FIELDS.map(key => [key, row[key]]));
    user.avatarCrop = readCrop(row.avatarCrop); user.bannerCrop = readCrop(row.bannerCrop);
    user.badges = badges.forUser(row.id, creatorId);
    const activity = [...activities.values()].filter(activity=>activity.userId===row.id);
    if (user.status === 'online' && activity.length && !activity.some(item=>!item.away&&Date.now()-item.at<=config.idleAfterMs)) user.status = 'idle';
    if (user.status === 'invisible' || !activeUsers.get(user.id)?.size) user.status = 'offline';
    return user;
  }
  const getUser = userId => publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  function member(serverId, userId) {
    const found = db.prepare('SELECT * FROM members WHERE serverId = ? AND userId = ?').get(serverId, userId);
    if (!found) throw new HttpError(404, 'This server is not available.');
    return found;
  }
  function owner(serverId, userId) {
    if (member(serverId, userId).role !== 'owner') throw new HttpError(403, 'Only the server owner can do this.');
  }
  function rolesFor(serverId, userId) {
    return db.prepare(`SELECT r.* FROM server_roles r JOIN member_roles m ON m.roleId = r.id
      WHERE m.serverId = ? AND m.userId = ?`).all(serverId, userId)
      .map(role => ({ ...role, permissions: JSON.parse(role.permissions), deniedPermissions: JSON.parse(role.deniedPermissions || '[]') }));
  }
  function permissionsFor(serverId, userId) {
    const key=`${serverId}:${userId}`;
    if(permissionCache.has(key))return permissionCache.get(key);
    const membership=member(serverId,userId),server=db.prepare('SELECT defaultPermissions FROM servers WHERE id=?').get(serverId);
    const resolved=resolvePermissions(JSON.parse(server.defaultPermissions || '{}'),rolesFor(serverId,userId),membership.role==='owner');
    if(permissionCache.size >= config.permissionCacheEntries)permissionCache.delete(permissionCache.keys().next().value);
    permissionCache.set(key,resolved);return resolved;
  }
  function hasPermission(serverId, userId, key) { return Boolean(permissionsFor(serverId,userId)[key]); }
  function permission(serverId, userId, key) {
    if (!hasPermission(serverId, userId, key)) throw new HttpError(403, 'You do not have permission for this action.');
  }
  function canView(channel, userId) {
    const membership = member(channel.serverId, userId);
    return membership.role === 'owner' || hasPermission(channel.serverId,userId,'viewChannels') && (!channel.private || rolesFor(channel.serverId, userId).some(role => JSON.parse(channel.allowedRoleIds).includes(role.id)));
  }
  function publicChannel(channel, userId) {
    return { ...channel, private: Boolean(channel.private), readOnly: Boolean(channel.readOnly), allowMedia: Boolean(channel.allowMedia), allowAttachments: Boolean(channel.allowAttachments),
      coverCrop: readCrop(channel.coverCrop), allowedRoleIds: JSON.parse(channel.allowedRoleIds), unread: unread(channel.id, userId) };
  }
  function access(conversationId, userId) {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(conversationId);
    if (channel && canView(channel, userId)) return channel;
    if (db.prepare('SELECT 1 FROM participants WHERE conversationId = ? AND userId = ?').get(conversationId, userId)) {
      const peer = db.prepare('SELECT userId FROM participants WHERE conversationId=? AND userId!=?').get(conversationId,userId);
      if (peer && social.pairBlocked(userId,peer.userId)) throw new HttpError(403, 'This conversation is unavailable while a block is active.');
      return { id: conversationId, type: 'dm' };
    }
    throw new HttpError(404, 'This conversation is not available.');
  }
  function recipients(conversationId) {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(conversationId);
    return channel ? db.prepare('SELECT userId FROM members WHERE serverId = ?').all(channel.serverId)
      .filter(row => canView(channel, row.userId)).map(row => row.userId)
      : db.prepare('SELECT userId FROM participants WHERE conversationId = ?').all(conversationId).map(row => row.userId);
  }
  function refreshServerAccess(serverId) {
    permissionCache.clear();
    const channels = db.prepare('SELECT * FROM channels WHERE serverId = ?').all(serverId);
    for (const socket of io?.sockets.sockets.values() || []) {
      const membership = db.prepare('SELECT 1 FROM members WHERE serverId = ? AND userId = ?').get(serverId, socket.userId);
      for (const channel of channels) {
        if (membership && canView(channel, socket.userId)) {
          socket.join(room(channel.id));
          const current = voice.get(socket.id);
          if(current?.conversationId===channel.id) {
            const stageSpeaker=channel.type!=='stage'||hasPermission(serverId,socket.userId,'manageChannels');
            const canSpeak=stageSpeaker&&hasPermission(serverId,socket.userId,'speak');
            const mediaAllowed=channel.allowMedia||hasPermission(serverId,socket.userId,'manageChannels');
            if(!hasPermission(serverId,socket.userId,'connectVoice') || current.stageSpeaker!==stageSpeaker || current.canSpeak!==canSpeak || current.camera&&(!mediaAllowed||!hasPermission(serverId,socket.userId,'useVideo')) || current.sharing&&(!mediaAllowed||!hasPermission(serverId,socket.userId,'shareScreen'))) {
              socket.emit('voice:removed',{conversationId:channel.id,reason:'Your voice permissions changed. Rejoin to apply them.'});leaveVoice(socket);
            }
          }
        }
        else {
          socket.leave(room(channel.id));
          if (voice.get(socket.id)?.conversationId === channel.id) { socket.emit('voice:removed', { conversationId: channel.id, reason: 'Your channel access changed.' }); leaveVoice(socket); }
        }
      }
    }
  }
  function emitUsers(users, event, payload) {
    if (event === 'user:updated') users = users.filter(userId => !social.isBlocked(userId,payload.id));
    if (users.length && io) io.to([...new Set(users)].map(userRoom)).emit(event, payload);
  }
  function relatedUsers(userId) {
    return db.prepare(`SELECT DISTINCT userId FROM members WHERE serverId IN
      (SELECT serverId FROM members WHERE userId = ?) UNION SELECT DISTINCT userId FROM participants
      WHERE conversationId IN (SELECT conversationId FROM participants WHERE userId = ?)`).all(userId, userId).map(r => r.userId).concat(userId);
  }
  function updateWorkspace(users) { permissionCache.clear(); emitUsers(users, 'workspace:updated', {}); }
  function refreshUserBadges(users, audience = []) {
    for (const userId of new Set(users)) { const user = getUser(userId); if (user) emitUsers([...relatedUsers(userId), ...audience], 'user:updated', user); }
  }
  function unread(conversationId, userId) {
    return db.prepare(`SELECT count(*) AS count FROM messages WHERE conversationId = ? AND authorId != ?
      AND authorId NOT IN (SELECT targetId FROM blocks WHERE ownerId=?)
      AND NOT EXISTS (SELECT 1 FROM messages root JOIN blocks b ON b.targetId=root.authorId WHERE root.id=messages.threadId AND b.ownerId=?)
      AND createdAt > COALESCE((SELECT readAt FROM reads WHERE conversationId = ? AND userId = ?), '')`)
      .get(conversationId, userId, userId, userId, conversationId, userId).count;
  }
  function lastMessage(conversationId) {
    const message = db.prepare('SELECT id,text,attachments,createdAt FROM messages WHERE conversationId=? ORDER BY createdAt DESC,id DESC LIMIT 1').get(conversationId);
    return message ? {...message,attachments:JSON.parse(message.attachments || '[]')} : null;
  }
  function hydratedMessage(message, viewerId) {
    if (!message) return null;
    const reactions = db.prepare('SELECT emoji, userId FROM reactions WHERE messageId = ?').all(message.id).filter(row=>!viewerId || !social.isBlocked(viewerId,row.userId));
    const reply = message.replyTo && db.prepare('SELECT authorId FROM messages WHERE id=?').get(message.replyTo);
    const replyCount = viewerId ? db.prepare('SELECT count(*) AS n FROM messages WHERE threadId=? AND authorId NOT IN (SELECT targetId FROM blocks WHERE ownerId=?)').get(message.id,viewerId).n : db.prepare('SELECT count(*) AS n FROM messages WHERE threadId=?').get(message.id).n;
    const answer=message.acceptedReplyId && db.prepare('SELECT authorId FROM messages WHERE id=?').get(message.acceptedReplyId);
    return { ...message, acceptedReplyId: viewerId && answer && social.isBlocked(viewerId,answer.authorId) ? null : message.acceptedReplyId, replyTo: viewerId && reply && social.isBlocked(viewerId,reply.authorId) ? null : message.replyTo, replyCount, attachments: JSON.parse(message.attachments), reactions, mentions: JSON.parse(message.mentions || '[]').filter(userId=>!viewerId || !social.isBlocked(viewerId,userId)), pinned: Boolean(message.pinned) };
  }
  function messageFor(messageId, userId) {
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (!message) throw new HttpError(404, 'Message not found.');
    access(message.conversationId, userId);
    const root = message.threadId && db.prepare('SELECT authorId FROM messages WHERE id=?').get(message.threadId);
    if (social.isBlocked(userId,message.authorId) || root && social.isBlocked(userId,root.authorId)) throw new HttpError(404, 'Message not found.');
    return message;
  }
  function broadcastMessage(messageId) {
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    if (message) publishMessage(message,'message:updated');
  }
  function publishMessage(message,event) {
    const root=message.threadId&&db.prepare('SELECT authorId FROM messages WHERE id=?').get(message.threadId),plain=[];
    for(const userId of recipients(message.conversationId)) {
      if(!activeUsers.get(userId)?.size||social.isBlocked(userId,message.authorId)||root&&social.isBlocked(userId,root.authorId))continue;
      if(!social.ids(userId).length)plain.push(userId);else emitUsers([userId],event,hydratedMessage(message,userId));
    }
    if(plain.length)emitUsers(plain,event,hydratedMessage(message));
  }
  function joinConversationRooms(userId, conversationId) {
    try { access(conversationId, userId); } catch { return; }
    for (const socketId of activeUsers.get(userId) || []) io?.sockets.sockets.get(socketId)?.join(room(conversationId));
  }
  const social = installSocial(app, { db, config, auth, HttpError, getUser, now, onChange: (ownerId,targetId,blocking) => {
    const first = [...voice.values()].filter(peer=>peer.userId===ownerId), second = [...voice.values()].filter(peer=>peer.userId===targetId);
    for (const a of first) for (const b of second) if (a.conversationId===b.conversationId) {
      if (blocking) {
        io?.to(a.socketId).emit('voice:peer-blocked',{socketIds:[b.socketId]});
        io?.to(b.socketId).emit('voice:peer-blocked',{socketIds:[a.socketId]});
        if (!db.prepare('SELECT 1 FROM channels WHERE id=?').get(a.conversationId)) for (const peer of [a,b]) {
          const client=io?.sockets.sockets.get(peer.socketId); if(client){client.emit('voice:removed',{conversationId:peer.conversationId,reason:'This direct call is no longer available.'});leaveVoice(client);}
        }
      } else if (!social.pairBlocked(ownerId,targetId)) io?.to(a.socketId).emit('voice:peer-available',{conversationId:a.conversationId,peer:b});
    }
    emitUsers([ownerId],'blocks:updated',{}); updateWorkspace([ownerId,targetId]);
    for (const conversationId of new Set([...first,...second].map(peer=>peer.conversationId))) publishVoice(conversationId);
  }});
  const community = installCommunity(app, { db, config, auth, HttpError, id, now, text, member, owner, permission, hasPermission, serverUsers, refreshServerAccess, updateWorkspace, refreshUserBadges, getIO: () => io, voice, leaveVoice });
  const accountPreferences=installPreferences(app,{db,auth,HttpError,emitUsers});
  const pins=installPins(app,{db,auth,access,recipients,activeUsers,emitUsers,HttpError});
  app.get('/api/gifs', auth, (req, res) => res.json({ gifs: GIFS }));
  function clientIceServers(userId) {
    if (!userId) return [];
    if (!config.turnSharedSecret) return config.iceServers;
    const username = `${Math.floor(Date.now()/1000) + config.turnCredentialSeconds}:${userId}`;
    const credential = createHmac('sha1',config.turnSharedSecret).update(username).digest('base64');
    return config.iceServers.map(server => [].concat(server.urls).some(url=>/^turns?:/i.test(url)) ? {...server, username, credential} : server);
  }
  app.get('/api/health', (req, res) => res.json({ ok: true, version: '2.17.0' }));
  app.get('/api/config', (req, res) => res.json({
    csrfToken: requestSecurity.issueToken(req, res),
    registrationOpen: config.registrationOpen, minPasswordLength: config.minPasswordLength, maxMessageLength: config.maxMessageLength,
    maxUploadBytes: config.maxUploadBytes, maxProfileBytes: config.maxProfileBytes, maxServerImageBytes: config.maxServerImageBytes,
    uploadChunkBytes: config.uploadChunkBytes, idleAfterMs: config.idleAfterMs, creatorUsername: config.creatorUsername, creatorClaimAvailable: !creatorId && Boolean(config.creatorClaimToken),
    permissionDefinitions: PERMISSION_DEFINITIONS,
    giphyApiKey: req.userId ? config.giphyApiKey : '',
    maxAttachments: config.maxAttachments, iceServers: clientIceServers(req.userId), iceTransportPolicy: config.iceTransportPolicy,
    maxVoiceParticipants: config.maxVoiceParticipants, maxServerRulesLength: config.maxServerRulesLength, maxRoleNameLength: config.maxRoleNameLength, maxServerRoles: config.maxServerRoles,
    rtcConnectionTimeoutMs: config.rtcConnectionTimeoutMs, rtcRestartDelayMs: config.rtcRestartDelayMs, rtcMaxRestarts: config.rtcMaxRestarts,
    hasTurn: req.userId ? config.iceServers.some(server => [].concat(server.urls).some(url => /^turns?:/i.test(url))) : false,
  }));
  app.post('/api/auth/register', async (req, res) => {
    limit(`auth:${req.ip}`, config.authAttemptsPerMinute);
    if (!config.registrationOpen) throw new HttpError(403, 'New accounts are currently closed.');
    const username = text(req.body.username, 24, 'Username', 3).toLowerCase();
    if (!/^[a-z0-9_.]+$/.test(username)) throw new HttpError(400, 'Use letters, numbers, underscores or dots in your username.');
    if (username === config.creatorUsername && !creatorId) {
      const supplied = Buffer.from(String(req.body.creatorClaimToken || '')), expected = Buffer.from(config.creatorClaimToken || '');
      if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new HttpError(403, 'This username is reserved for the project creator. Set the creator claim token on your server.');
    }
    const displayName = text(req.body.displayName || username, 32, 'Display name', 1);
    const password = req.body.password;
    if (typeof password !== 'string' || password.length < config.minPasswordLength || password.length > config.maxPasswordLength) {
      throw new HttpError(400, `Use a password with ${config.minPasswordLength}–${config.maxPasswordLength} characters.`);
    }
    const passwordHash = await hashPassword(password);
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'This username is already taken.');
    const userId = id('u');
    db.prepare('INSERT INTO users (id, username, displayName, passwordHash, createdAt) VALUES (?, ?, ?, ?, ?)')
      .run(userId, username, displayName, passwordHash, now());
    if (username === config.creatorUsername && !creatorId) { creatorId = userId; db.prepare("INSERT OR REPLACE INTO app_settings VALUES ('creatorUserId',?)").run(creatorId); }
    badges.awardEarlyMember(userId, db.prepare('SELECT createdAt FROM users WHERE id=?').get(userId).createdAt);
    createSession(db, res, userId, config);
    res.status(201).json({ user: getUser(userId) });
  });
  app.post('/api/auth/login', async (req, res) => {
    limit(`auth:${req.ip}`, config.authAttemptsPerMinute);
    const username = text(req.body.username, 24, 'Username', 1);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length > config.maxPasswordLength) throw new HttpError(400, 'Invalid username or password.');
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    const valid = await checkPassword(password, user?.passwordHash || await dummyPassword);
    if (!valid || !user) throw new HttpError(401, 'Invalid username or password.');
    if (req.session) db.prepare('DELETE FROM sessions WHERE hash = ?').run(req.session.hash);
    createSession(db, res, user.id, config);
    res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE hash = ?').run(req.session.hash);
    for (const socket of io?.sockets.sockets.values() || []) if (socket.sessionHash === req.session.hash) socket.disconnect(true);
    res.clearCookie(COOKIE_NAME, { path: '/', secure: config.secureCookies, httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
  });
  installLifecycle(app, { db, config, auth, HttpError, checkPassword, COOKIE_NAME, limit, owner, serverUsers, relatedUsers, updateWorkspace, refreshUserBadges, getIO: () => io, voice, leaveVoice, onCreatorDeleted: () => { creatorId = ''; }, onAccountDeleted: userId => { social.clearCache();for(const key of recentMessages.keys())if(key.startsWith(`${userId}:`))recentMessages.delete(key); } });
  app.get('/api/bootstrap', auth, (req, res) => {
    const servers = db.prepare(`SELECT s.*, m.role FROM servers s JOIN members m ON m.serverId = s.id
      WHERE m.userId = ? ORDER BY s.createdAt, s.id`).all(req.userId).map(server => ({
        ...server, iconCrop:readCrop(server.iconCrop),bannerCrop:readCrop(server.bannerCrop),ownerRoleDisplay:Boolean(server.ownerRoleDisplay),defaultPermissions: JSON.parse(server.defaultPermissions || '{}'), official: isOfficial(server), publicListing: Boolean(server.publicListing), invite: hasPermission(server.id, req.userId, 'inviteMembers') ? server.invite : undefined,
        moderation: community.activeModeration(server.id,req.userId,'mute') || null,
        permissions: permissionsFor(server.id,req.userId),
        roles: db.prepare('SELECT * FROM server_roles WHERE serverId = ? ORDER BY position,name,id').all(server.id).map(role => ({ ...role, iconCrop:readCrop(role.iconCrop),displayMembers:Boolean(role.displayMembers),permissions: JSON.parse(role.permissions), deniedPermissions: JSON.parse(role.deniedPermissions || '[]') })),
        categories: db.prepare('SELECT * FROM categories WHERE serverId=? ORDER BY position,id').all(server.id),
        channels: db.prepare('SELECT * FROM channels WHERE serverId = ? ORDER BY position, id').all(server.id)
          .filter(c => canView(c, req.userId)).map(c => ({...publicChannel(c, req.userId),pins:pins.state(c.id,req.userId)})),
        members: db.prepare('SELECT userId, role FROM members WHERE serverId = ? ORDER BY joinedAt').all(server.id).filter(m=>!social.isBlocked(req.userId,m.userId)).map(m => ({ ...m, roleIds: rolesFor(server.id, m.userId).map(role => role.id) })),
      }));
    const dms = db.prepare(`SELECT c.*, p.userId AS peerId FROM conversations c
      JOIN participants p ON p.conversationId = c.id AND p.userId != ?
      WHERE c.id IN (SELECT conversationId FROM participants WHERE userId = ?)
      ORDER BY COALESCE((SELECT max(createdAt) FROM messages WHERE conversationId = c.id), c.createdAt) DESC`).all(req.userId, req.userId)
      .filter(dm=>!social.pairBlocked(req.userId,dm.peerId)).map(dm => ({ ...dm, pins:pins.state(dm.id,req.userId), unread: unread(dm.id, req.userId), lastMessage: lastMessage(dm.id) }));
    const userIds = new Set([req.userId, ...servers.flatMap(s => s.members.map(m => m.userId)), ...dms.map(d => d.peerId)]);
    res.json({ user: { ...getUser(req.userId), preferredStatus: db.prepare('SELECT status FROM users WHERE id = ?').get(req.userId).status },
      accountPreferences:accountPreferences.snapshot(req.userId), blockedIds: social.ids(req.userId), servers, dms, users: [...userIds].map(getUser), voice: [...voice.values()].filter(v => {
        if(social.pairBlocked(req.userId,v.userId))return false;
        try { access(v.conversationId, req.userId); return true; } catch { return false; }
      }) });
  });
  app.patch('/api/profile', auth, (req, res) => {
    if ('username' in req.body) throw new HttpError(400, 'Your username is permanent. You can change your display name.');
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    const values = {
      displayName: text(req.body.displayName ?? current.displayName, 32, 'Display name', 1),
      bio: text(req.body.bio ?? current.bio, 190, 'Bio'),
      pronouns: text(req.body.pronouns ?? current.pronouns, 24, 'Pronouns'),
      accent: req.body.accent ?? current.accent,
      status: req.body.status ?? current.status,
      avatar: req.body.avatar ?? current.avatar, banner: req.body.banner ?? current.banner,
      avatarCrop: cropValue(req.body.avatarCrop, current.avatarCrop), bannerCrop: cropValue(req.body.bannerCrop, current.bannerCrop),
    };
    if (!/^#[0-9a-f]{6}$/i.test(values.accent) || !STATUSES.has(values.status)) throw new HttpError(400, 'Choose a valid accent color and status.');
    for (const key of ['avatar', 'banner']) {
      const value = values[key];
      if (typeof value !== 'string' || value.length > 2000) throw new HttpError(400, 'Invalid image URL.');
      if (value.startsWith('/files/')) {
        const file = db.prepare('SELECT * FROM files WHERE id = ? AND ownerId = ? AND purpose = ?').get(value.slice(7), req.userId, 'profile');
        if (!file) throw new HttpError(400, 'Upload your profile image again.');
      } else if (value && value !== current[key]) throw new HttpError(400, 'Upload an image from your device.');
    }
    db.prepare(`UPDATE users SET displayName=?, bio=?, pronouns=?, accent=?, status=?, avatar=?, banner=?, avatarCrop=?, bannerCrop=? WHERE id=?`)
      .run(...Object.values(values), req.userId);
    const user = getUser(req.userId);
    emitUsers(relatedUsers(req.userId), 'user:updated', user);
    emitUsers([req.userId], 'preferences:status', {status:values.status});
    res.json({ user });
  });
  app.get('/api/users', auth, (req, res) => {
    const value = req.query.q;
    const normalized = typeof value === 'string' ? value.trim().replace(/^@/, '').trim() : value || '';
    const query = text(normalized, USER_SEARCH_LIMITS.maximum, 'Search', USER_SEARCH_LIMITS.minimum).replace(/[!%_]/g, '!$&');
    res.json({ users: db.prepare("SELECT * FROM users WHERE id != ? AND username LIKE ? ESCAPE '!' ORDER BY username LIMIT ?")
      .all(req.userId, `%${query}%`, USER_SEARCH_LIMITS.results).filter(row=>!social.pairBlocked(req.userId,row.id)).map(publicUser) });
  });
  app.post('/api/servers', auth, (req, res) => {
    const name = text(req.body.name, 60, 'Server name', 2);
    const description = text(req.body.description || '', 180, 'Description');
    const serverId = id('s');
    transaction(db, () => {
      db.prepare('INSERT INTO servers (id, name, description, ownerId, invite, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
        .run(serverId, name, description, req.userId, randomBytes(12).toString('base64url'), now());
      db.prepare('INSERT INTO members VALUES (?, ?, ?, ?)').run(serverId, req.userId, 'owner', now());
      for (const [position, name] of ['THE COMMON ROOM', 'GOOD COMPANY'].entries()) db.prepare('INSERT INTO categories VALUES (?,?,?,?)').run(id('cat'), serverId, name, position);
      for (const [position, channel] of [['general', 'text', 'General conversation.'], ['introductions', 'text', 'Introduce yourself.'], ['ideas', 'text', 'Share ideas.'], ['The lounge', 'voice', 'Talk with your server.']].entries()) {
        const channelId = id('c');
        db.prepare('INSERT INTO channels (id, serverId, name, type, topic, position, category) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(channelId, serverId, ...channel, position, channel[1] === 'voice' ? 'GOOD COMPANY' : 'THE COMMON ROOM');
      }
    });
    community.audit(serverId,req.userId,'server.created',serverId);
    for (const c of db.prepare('SELECT id FROM channels WHERE serverId = ?').all(serverId)) joinConversationRooms(req.userId, c.id);
    updateWorkspace([req.userId]); refreshUserBadges([req.userId]); res.status(201).json({ id: serverId });
  });
  app.patch('/api/servers/:id', auth, (req, res) => {
    permission(req.params.id, req.userId, 'manageServer');
    const current = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    const values = {
      name: text(req.body.name ?? current.name, 60, 'Server name', 2),
      description: text(req.body.description ?? current.description, 180, 'Description'),
      icon: req.body.icon ?? current.icon,
      banner: req.body.banner ?? current.banner,
      accent: req.body.accent ?? current.accent,
      welcomeMessage: text(req.body.welcomeMessage ?? current.welcomeMessage, 500, 'Welcome message'),
      defaultNotifications: req.body.defaultNotifications ?? current.defaultNotifications,
      rules: text(req.body.rules ?? current.rules, config.maxServerRulesLength, 'Server rules'),
      publicListing: req.body.publicListing === undefined ? current.publicListing : req.body.publicListing === true ? 1 : 0,
      iconCrop:cropValue(req.body.iconCrop,current.iconCrop),bannerCrop:cropValue(req.body.bannerCrop,current.bannerCrop),
    };
    if (!['all', 'mentions'].includes(values.defaultNotifications)) throw new HttpError(400, 'Choose valid default notifications.');
    if (!/^#[0-9a-f]{6}$/i.test(values.accent)) throw new HttpError(400, 'Choose a valid server color.');
    for (const key of ['icon', 'banner']) {
      const value = values[key];
      if (typeof value !== 'string' || value.length > 2000) throw new HttpError(400, 'Invalid server image.');
      if (value.startsWith('/files/')) {
        const file = db.prepare('SELECT 1 FROM files WHERE id = ? AND purpose = ? AND serverId = ?')
          .get(value.slice(7), 'server', current.id);
        if (!file) throw new HttpError(400, 'Upload an image for this server.');
      } else if (value && value !== current[key]) throw new HttpError(400, 'Upload an image from your device.');
    }
    db.prepare('UPDATE servers SET name=?, description=?, icon=?, banner=?, accent=?, welcomeMessage=?, defaultNotifications=?, rules=?, publicListing=?,iconCrop=?,bannerCrop=? WHERE id=?')
      .run(...Object.values(values), current.id);
    const users = db.prepare('SELECT userId FROM members WHERE serverId = ?').all(current.id).map(row => row.userId);
    const changes=changedFields(current,values);if(changes.length)community.audit(current.id, req.userId, 'server.updated',current.id,'',{changes}); io?.emit('discovery:updated');
    updateWorkspace(users);
    res.json({ server: { ...values,iconCrop:readCrop(values.iconCrop),bannerCrop:readCrop(values.bannerCrop),id: current.id } });
  });
  app.post('/api/servers/join', auth, (req, res) => {
    const invite = text(req.body.invite, 200, 'Invite code', 1).split('/').filter(Boolean).pop().replace(/^\?invite=/, '');
    const server = db.prepare('SELECT * FROM servers WHERE invite = ?').get(invite);
    if (!server) throw new HttpError(404, 'This invite is invalid or has been replaced.');
    community.checkBan(server.id, req.userId);
    const joined=db.prepare('INSERT OR IGNORE INTO members VALUES (?, ?, ?, ?)').run(server.id, req.userId, 'member', now());if(joined.changes)community.audit(server.id,req.userId,'member.joined',req.userId);
    for (const c of db.prepare('SELECT id FROM channels WHERE serverId = ?').all(server.id)) joinConversationRooms(req.userId, c.id);
    updateWorkspace(db.prepare('SELECT userId FROM members WHERE serverId = ?').all(server.id).map(r => r.userId));
    res.json({ id: server.id });
  });
  app.post('/api/servers/:id/invite', auth, (req, res) => {
    permission(req.params.id, req.userId, 'inviteMembers');
    if (req.body.rotate === true) permission(req.params.id,req.userId,'manageInvites');
    if (req.body.rotate === true) {db.prepare('UPDATE servers SET invite = ? WHERE id = ?').run(randomBytes(12).toString('base64url'), req.params.id);community.audit(req.params.id,req.userId,'invite.rotated');}
    res.json({ invite: db.prepare('SELECT invite FROM servers WHERE id = ?').get(req.params.id).invite });
  });
  app.post('/api/servers/:id/channels', auth, (req, res) => {
    permission(req.params.id, req.userId, 'manageChannels');
    const name = text(req.body.name, 40, 'Channel name', 1);
    const type = req.body.type || 'text';
    if (!CHANNEL_TYPES.has(type)) throw new HttpError(400, 'Choose a valid channel type.');
    if (db.prepare('SELECT count(*) AS n FROM channels WHERE serverId=?').get(req.params.id).n >= config.maxChannels) throw new HttpError(400, 'Channel limit reached.');
    const topic = text(req.body.topic || '', 140, 'Topic');
    if (req.body.category && !db.prepare('SELECT 1 FROM categories WHERE serverId=? AND name=?').get(req.params.id,req.body.category)) throw new HttpError(400,'Choose a valid category.');
    if (db.prepare('SELECT 1 FROM channels WHERE serverId = ? AND name = ?').get(req.params.id, name)) throw new HttpError(409, 'This channel name is already in use.');
    const cover=validatedCover(req.body.cover || '',req.params.id);
    const channelId = id('c');
    const position = db.prepare('SELECT COALESCE(max(position), 0) + 1 AS n FROM channels WHERE serverId = ?').get(req.params.id).n;
    db.prepare('INSERT INTO channels (id, serverId, name, type, topic, position, category) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(channelId, req.params.id, name, type, topic, position, req.body.category ?? (isVoice({ type }) ? 'GOOD COMPANY' : 'THE COMMON ROOM'));
    db.prepare('UPDATE channels SET cover=?,coverCrop=? WHERE id=?').run(cover,cropValue(req.body.coverCrop),channelId);
    if (type === 'announcement') db.prepare('UPDATE channels SET readOnly=1 WHERE id=?').run(channelId);
    const users = db.prepare('SELECT userId FROM members WHERE serverId = ?').all(req.params.id).map(r => r.userId);
    users.forEach(userId => joinConversationRooms(userId, channelId));
    community.audit(req.params.id,req.userId,'channel.created',channelId);
    updateWorkspace(users); res.status(201).json({ id: channelId });
  });
  function serverUsers(serverId) { return db.prepare('SELECT userId FROM members WHERE serverId = ?').all(serverId).map(row => row.userId); }
  function validatedRoleIds(serverId, values) {
    if (!Array.isArray(values) || values.length > config.maxServerRoles || new Set(values).size !== values.length) throw new HttpError(400, 'Choose valid server roles.');
    const valid = new Set(db.prepare('SELECT id FROM server_roles WHERE serverId = ?').all(serverId).map(row => row.id));
    if (values.some(value => typeof value !== 'string' || !valid.has(value))) throw new HttpError(400, 'A selected role does not belong to this server.');
    return values;
  }
  function cropValue(value,current='{}') {
    try{return JSON.stringify(value===undefined?readCrop(current):normalizeCrop(value));}catch(error){throw new HttpError(400,error.message);}
  }
  function roleValues(body, current = {}, serverId) {
    const values={name:text(body.name ?? current.name,config.maxRoleNameLength,'Role name',1),color:body.color ?? current.color ?? '#b9a1f0',icon:body.icon ?? current.icon ?? 'shield',permissions:body.permissions ?? current.permissions ?? [],deniedPermissions:body.deniedPermissions ?? current.deniedPermissions ?? []};
    if(!/^#[0-9a-f]{6}$/i.test(values.color))throw new HttpError(400,'Choose a valid role color.');
    for(const key of ['permissions','deniedPermissions']){
      if(!Array.isArray(values[key])||values[key].some(permission=>!SERVER_PERMISSIONS.has(permission)))throw new HttpError(400,'Choose valid role permissions.');
      values[key]=[...new Set(values[key])];
    }
    if(values.permissions.some(key=>values.deniedPermissions.includes(key)))throw new HttpError(400,'A permission cannot be allowed and denied at the same time.');
    if(!CHANNEL_ICONS.has(values.icon)&&!(typeof values.icon==='string'&&/^\/files\/f_[a-z0-9-]+$/i.test(values.icon)))throw new HttpError(400,'Choose a role icon.');
    if(values.icon.startsWith('/files/')&&!db.prepare("SELECT 1 FROM files WHERE id=? AND serverId=? AND purpose IN ('server','role')").get(values.icon.slice(7),serverId))throw new HttpError(400,'Upload a role icon for this server.');
    if(body.displayMembers!==undefined&&typeof body.displayMembers!=='boolean')throw new HttpError(400,'Choose a valid member display setting.');
    values.displayMembers=body.displayMembers??Boolean(current.displayMembers);values.iconCrop=readCrop(cropValue(body.iconCrop,current.iconCrop));
    return values;
  }
  function checkRoleAuthority(serverId,actorId,current,values=current) {
    if(member(serverId,actorId).role==='owner')return;
    permission(serverId,actorId,'manageRoles');
    const owned=current&&db.prepare('SELECT 1 FROM member_roles WHERE roleId=? AND userId=?').get(current.id,actorId);
    const protectedRole=current?.permissions?.some(key=>PROTECTED_ROLE_PERMISSIONS.has(key));
    if(owned||protectedRole)throw new HttpError(403,'Only the owner can change this protected role.');
    if(values?.permissions?.some(key=>PROTECTED_ROLE_PERMISSIONS.has(key)||!hasPermission(serverId,actorId,key)))throw new HttpError(403,'You cannot grant administrative powers or permissions you do not hold.');
  }
  function validatedCover(value,serverId) {
    if(value==='')return '';
    if(typeof value!=='string'||!/^\/files\/f_[a-z0-9-]+$/i.test(value)||!db.prepare("SELECT 1 FROM files WHERE id=? AND serverId=? AND purpose='channel' AND mime LIKE 'image/%'").get(value.slice(7),serverId))throw new HttpError(400,'Upload a channel cover for this server.');
    return value;
  }
  app.patch('/api/servers/:id/permissions',auth,(req,res)=>{
    permission(req.params.id,req.userId,'manageServer');let defaults;
    try{defaults=normalizeDefaults(req.body.defaultPermissions);}catch(error){throw new HttpError(400,error.message);}
    const before=resolvePermissions(JSON.parse(db.prepare('SELECT defaultPermissions FROM servers WHERE id=?').get(req.params.id).defaultPermissions||'{}'));
    db.prepare('UPDATE servers SET defaultPermissions=? WHERE id=?').run(JSON.stringify(defaults),req.params.id);
    community.audit(req.params.id,req.userId,'permissions.updated','','',{changes:changedFields(before,defaults)});refreshServerAccess(req.params.id);updateWorkspace(serverUsers(req.params.id));res.json({ok:true});
  });
  app.get('/api/discovery', auth, (req, res) => {
    const query = text(req.query.q ?? '', config.discoveryQueryLength, 'Server search');
    const offsetText = String(req.query.offset ?? '0'), offset = Number(offsetText);
    if (!/^\d+$/.test(offsetText) || !Number.isSafeInteger(offset) || offset < 0 || offset > config.discoveryMaxOffset) throw new HttpError(400, 'Choose a valid discovery page.');
    const rows = db.prepare(`SELECT s.ownerId, s.id, s.name, s.description, s.icon, s.banner, s.iconCrop, s.bannerCrop, s.accent, s.rules,
      (SELECT count(*) FROM members m WHERE m.serverId = s.id) AS memberCount,
      (SELECT count(*) FROM members candidate WHERE candidate.serverId = s.id AND candidate.userId IN
        (SELECT related.userId FROM members related WHERE related.serverId IN
          (SELECT own.serverId FROM members own WHERE own.userId = ?))) AS sharedMembers
      FROM servers s WHERE s.publicListing = 1 AND NOT EXISTS (SELECT 1 FROM moderations b WHERE b.serverId=s.id AND b.userId=? AND b.kind='ban' AND (b.expiresAt IS NULL OR b.expiresAt>?))
      AND (?='' OR instr(lower(s.name),lower(?))>0 OR instr(lower(s.description),lower(?))>0)
      ORDER BY CASE WHEN s.id=? AND s.ownerId=? THEN 0 ELSE 1 END, sharedMembers DESC, memberCount DESC, s.createdAt DESC, s.id DESC LIMIT ? OFFSET ?`)
      .all(req.userId, req.userId, Date.now(), query, query, query, db.prepare("SELECT value FROM app_settings WHERE key='officialServerId'").get()?.value || '', creatorId, config.discoveryPageSize + 1, offset);
    const hasMore = rows.length > config.discoveryPageSize;
    const servers = rows.slice(0, config.discoveryPageSize).map(({ownerId, ...server}) => ({ ...server,iconCrop:readCrop(server.iconCrop),bannerCrop:readCrop(server.bannerCrop),official: isOfficial({ ...server, ownerId }), joined: Boolean(db.prepare('SELECT 1 FROM members WHERE serverId=? AND userId=?').get(server.id, req.userId)) }));
    res.json({ servers, hasMore, nextOffset: hasMore ? offset + servers.length : null });
  });
  app.post('/api/servers/:id/join-public', auth, (req, res) => {
    const server = db.prepare('SELECT id FROM servers WHERE id = ? AND publicListing = 1').get(req.params.id);
    if (!server) throw new HttpError(404, 'This public server is no longer available.');
    community.checkBan(server.id, req.userId);
    const joined=db.prepare('INSERT OR IGNORE INTO members VALUES (?, ?, ?, ?)').run(server.id, req.userId, 'member', now());if(joined.changes)community.audit(server.id,req.userId,'member.joined',req.userId);
    refreshServerAccess(server.id); updateWorkspace(serverUsers(server.id)); res.json({ id: server.id });
  });
  app.put('/api/servers/:id/role-order',auth,(req,res)=>{
    owner(req.params.id,req.userId);
    const expected=['__owner__',...db.prepare('SELECT id FROM server_roles WHERE serverId=?').all(req.params.id).map(role=>role.id)],order=req.body.roleIds;
    if(!Array.isArray(order)||order.length!==expected.length||new Set(order).size!==expected.length||order.some(roleId=>!expected.includes(roleId)))throw new HttpError(400,'Reload before rearranging roles.');
    const oldRoles=db.prepare('SELECT id,name,position FROM server_roles WHERE serverId=?').all(req.params.id);oldRoles.push({id:'__owner__',name:'Server owner',position:db.prepare('SELECT ownerRolePosition FROM servers WHERE id=?').get(req.params.id).ownerRolePosition});
    transaction(db,()=>order.forEach((roleId,index)=>roleId==='__owner__'?db.prepare('UPDATE servers SET ownerRolePosition=? WHERE id=?').run(index,req.params.id):db.prepare('UPDATE server_roles SET position=? WHERE id=? AND serverId=?').run(index,roleId,req.params.id)));
    community.audit(req.params.id,req.userId,'roles.reordered','','',{changes:order.flatMap((roleId,index)=>{const role=oldRoles.find(item=>item.id===roleId);return role.position===index?[]:[{label:role.name,before:`Position ${role.position+1}`,after:`Position ${index+1}`}];})});updateWorkspace(serverUsers(req.params.id));res.json({ok:true});
  });
  app.patch('/api/servers/:id/owner-role',auth,(req,res)=>{
    owner(req.params.id,req.userId);if(typeof req.body.displayMembers!=='boolean')throw new HttpError(400,'Choose a valid member display setting.');
    const previous=db.prepare('SELECT ownerRoleDisplay FROM servers WHERE id=?').get(req.params.id);
    db.prepare('UPDATE servers SET ownerRoleDisplay=? WHERE id=?').run(Number(req.body.displayMembers),req.params.id);
    community.audit(req.params.id,req.userId,'owner-role.updated','','',{changes:[{label:'Separate owner group',before:previous.ownerRoleDisplay?'On':'Off',after:req.body.displayMembers?'On':'Off'}]});
    updateWorkspace(serverUsers(req.params.id));res.json({ok:true});
  });
  app.post('/api/servers/:id/roles', auth, (req, res) => {
    permission(req.params.id,req.userId,'manageRoles');
    if (db.prepare('SELECT count(*) AS count FROM server_roles WHERE serverId = ?').get(req.params.id).count >= config.maxServerRoles) throw new HttpError(400, 'This server has reached its role limit.');
    const values = roleValues(req.body, {}, req.params.id);
    checkRoleAuthority(req.params.id,req.userId,null,values);
    if (db.prepare('SELECT 1 FROM server_roles WHERE serverId = ? AND name = ?').get(req.params.id, values.name)) throw new HttpError(409, 'This role name is already in use.');
    const position=Math.max(db.prepare('SELECT coalesce(max(position),0) AS n FROM server_roles WHERE serverId=?').get(req.params.id).n,db.prepare('SELECT ownerRolePosition AS n FROM servers WHERE id=?').get(req.params.id).n)+1;
    const roleId = id('r'); db.prepare('INSERT INTO server_roles (id,serverId,name,color,permissions,icon,deniedPermissions,displayMembers,iconCrop,position) VALUES (?, ?, ?, ?, ?, ?, ?,?,?,?)').run(roleId, req.params.id, values.name, values.color, JSON.stringify(values.permissions), values.icon,JSON.stringify(values.deniedPermissions),Number(values.displayMembers),JSON.stringify(values.iconCrop),position);
    community.audit(req.params.id,req.userId,'role.created',roleId);
    updateWorkspace(serverUsers(req.params.id)); res.status(201).json({ role: { id: roleId, ...values } });
  });
  app.patch('/api/servers/:id/roles/:roleId', auth, (req, res) => {
    permission(req.params.id,req.userId,'manageRoles');
    const current = db.prepare('SELECT * FROM server_roles WHERE id = ? AND serverId = ?').get(req.params.roleId, req.params.id);
    if (!current) throw new HttpError(404, 'Role not found.');
    const values = roleValues(req.body, { ...current, permissions: JSON.parse(current.permissions),deniedPermissions:JSON.parse(current.deniedPermissions || '[]') }, req.params.id);
    if (db.prepare('SELECT 1 FROM server_roles WHERE serverId = ? AND name = ? AND id != ?').get(req.params.id, values.name, current.id)) throw new HttpError(409, 'This role name is already in use.');
    checkRoleAuthority(req.params.id,req.userId,{...current,permissions:JSON.parse(current.permissions)},values);
    db.prepare('UPDATE server_roles SET name=?, color=?, permissions=?, icon=?,deniedPermissions=?,displayMembers=?,iconCrop=? WHERE id=?').run(values.name, values.color, JSON.stringify(values.permissions), values.icon,JSON.stringify(values.deniedPermissions),Number(values.displayMembers),JSON.stringify(values.iconCrop),current.id);
    community.audit(req.params.id,req.userId,'role.updated',current.id,'',{changes:changedFields({...current,permissions:JSON.parse(current.permissions),deniedPermissions:JSON.parse(current.deniedPermissions||'[]')},values)});
    refreshServerAccess(req.params.id); updateWorkspace(serverUsers(req.params.id)); res.json({ role: { id: current.id, ...values } });
  });
  app.delete('/api/servers/:id/roles/:roleId', auth, (req, res) => {
    permission(req.params.id,req.userId,'manageRoles');
    const current=db.prepare('SELECT * FROM server_roles WHERE id=? AND serverId=?').get(req.params.roleId,req.params.id);
    if(!current)throw new HttpError(404,'Role not found.');checkRoleAuthority(req.params.id,req.userId,{...current,permissions:JSON.parse(current.permissions)});
    const result = db.prepare('DELETE FROM server_roles WHERE id = ? AND serverId = ?').run(req.params.roleId, req.params.id);
    if (!result.changes) throw new HttpError(404, 'Role not found.');
    community.audit(req.params.id,req.userId,'role.deleted',current.id,'',{targetName:current.name});
    refreshServerAccess(req.params.id); updateWorkspace(serverUsers(req.params.id)); res.json({ ok: true });
  });
  app.put('/api/servers/:id/members/:userId/roles', auth, (req, res) => {
    permission(req.params.id,req.userId,'manageRoles');
    const target = member(req.params.id, req.params.userId);
    if (target.role === 'owner') throw new HttpError(400, 'The owner already has every permission.');
    const roles = validatedRoleIds(req.params.id, req.body.roleIds);
    const priorRoles=rolesFor(req.params.id,req.params.userId).map(role=>role.name);
    if(member(req.params.id,req.userId).role!=='owner') {
      if(req.params.userId===req.userId)throw new HttpError(403,'Only the owner can assign your roles.');
      const existing=rolesFor(req.params.id,req.params.userId);
      const changes=new Set([...roles,...existing.map(role=>role.id)]);
      for(const roleId of changes)if(roles.includes(roleId)!==existing.some(role=>role.id===roleId)){const row=db.prepare('SELECT * FROM server_roles WHERE id=?').get(roleId);checkRoleAuthority(req.params.id,req.userId,{...row,permissions:JSON.parse(row.permissions)});}
    }
    transaction(db, () => {
      db.prepare('DELETE FROM member_roles WHERE serverId = ? AND userId = ?').run(req.params.id, req.params.userId);
      for (const roleId of roles) db.prepare('INSERT INTO member_roles VALUES (?, ?, ?)').run(req.params.id, req.params.userId, roleId);
    });
    community.audit(req.params.id,req.userId,'member.roles',req.params.userId,'',{changes:[{label:'Roles',before:priorRoles.join(', ')||'None',after:rolesFor(req.params.id,req.params.userId).map(role=>role.name).join(', ')||'None'}]});
    refreshServerAccess(req.params.id); updateWorkspace(serverUsers(req.params.id)); res.json({ ok: true });
  });
  app.patch('/api/channels/:id', auth, (req, res) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    if (!channel) throw new HttpError(404, 'Channel not found.');
    permission(channel.serverId, req.userId, 'manageChannels');
    const cover=validatedCover(req.body.cover ?? channel.cover,channel.serverId);
    const name = text(req.body.name ?? channel.name, 40, 'Channel name', 1);
    const topic = text(req.body.topic ?? channel.topic, 140, 'Topic');
    const roles = validatedRoleIds(channel.serverId, req.body.allowedRoleIds ?? JSON.parse(channel.allowedRoleIds));
    const privateChannel = req.body.private === undefined ? channel.private : Number(req.body.private === true);
    const readOnly = req.body.readOnly === undefined ? channel.readOnly : Number(req.body.readOnly === true);
    const type = req.body.type ?? channel.type;
    if (!CHANNEL_TYPES.has(type) || isVoice({ type }) !== isVoice(channel)) throw new HttpError(400, 'Voice and text history cannot be converted into each other.');
    if(type!==channel.type && type==='media') {
      const history=db.prepare('SELECT attachments FROM messages WHERE conversationId=?').all(channel.id);
      if(history.some(message=>{const files=JSON.parse(message.attachments);return !files.length;}))throw new HttpError(400,'This history does not fit the new collection type. Create a new channel to keep every post visible.');
    }
    const category = req.body.category ?? channel.category;
    if (category && !db.prepare('SELECT 1 FROM categories WHERE serverId=? AND name=?').get(channel.serverId, category)) throw new HttpError(400, 'Choose a valid category.');
    const channelIcon = req.body.icon ?? channel.icon;
    if (!CHANNEL_ICONS.has(channelIcon)) throw new HttpError(400, 'Choose a channel icon.');
    const slowmode = Number(req.body.slowmodeSeconds ?? channel.slowmodeSeconds), userLimit = Number(req.body.userLimit ?? channel.userLimit);
    if (!Number.isInteger(slowmode) || slowmode < 0 || slowmode > 21600 || !Number.isInteger(userLimit) || userLimit < 0 || userLimit > config.maxVoiceParticipants) throw new HttpError(400, 'Choose valid slowmode and voice capacity values.');
    const allowAttachments = req.body.allowAttachments === undefined ? channel.allowAttachments : Number(req.body.allowAttachments === true);
    const allowMedia = req.body.allowMedia === undefined ? channel.allowMedia : Number(req.body.allowMedia === true);
    if (db.prepare('SELECT 1 FROM channels WHERE serverId=? AND name=? AND id!=?').get(channel.serverId, name, channel.id)) throw new HttpError(409, 'This channel name is already in use.');
    db.prepare('UPDATE channels SET name=?, topic=?, private=?, allowedRoleIds=?, readOnly=?, allowMedia=?, type=?, category=?, icon=?, slowmodeSeconds=?, userLimit=?, allowAttachments=?,cover=?,coverCrop=? WHERE id=?')
      .run(name, topic, privateChannel, JSON.stringify(roles), readOnly, allowMedia, type, category, channelIcon, slowmode, userLimit, allowAttachments, cover,cropValue(req.body.coverCrop,channel.coverCrop),channel.id);
    const updated=db.prepare('SELECT * FROM channels WHERE id=?').get(channel.id);
    community.audit(channel.serverId, req.userId, 'channel.updated', channel.id,'',{changes:changedFields(channel,updated,['name','topic','type','category','icon','private','readOnly','allowMedia','slowmodeSeconds','userLimit','allowAttachments','cover','coverCrop'])});
    refreshServerAccess(channel.serverId); updateWorkspace(serverUsers(channel.serverId)); res.json({ ok: true });
  });
  app.delete('/api/channels/:id', auth, (req, res) => {
    const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
    if (!channel) throw new HttpError(404, 'Channel not found.');
    permission(channel.serverId, req.userId, 'manageChannels');
    const files = db.prepare('SELECT diskName FROM files WHERE conversationId = ?').all(channel.id);
    // Notify active clients before removing the room and its persisted history.
    for (const socket of io?.sockets.sockets.values() || []) if (voice.get(socket.id)?.conversationId === channel.id) {
      socket.emit('voice:removed', { conversationId: channel.id, reason: 'This channel was deleted.' }); leaveVoice(socket);
    }
    transaction(db, () => {
      db.prepare('DELETE FROM messages WHERE conversationId = ?').run(channel.id);
      db.prepare('DELETE FROM files WHERE conversationId = ?').run(channel.id);
      db.prepare('DELETE FROM reads WHERE conversationId = ?').run(channel.id);
      db.prepare('DELETE FROM pin_reads WHERE conversationId=?').run(channel.id);db.prepare('DELETE FROM pin_counters WHERE conversationId=?').run(channel.id);
      db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
    });
    for (const file of files) fs.rmSync(path.join(config.uploadPath, file.diskName), { force: true });
    community.audit(channel.serverId,req.userId,'channel.deleted',channel.id,'',{targetName:channel.name});
    io?.to(room(channel.id)).emit('conversation:deleted', { id: channel.id, serverId: channel.serverId });
    io?.in(room(channel.id)).socketsLeave(room(channel.id));
    updateWorkspace(serverUsers(channel.serverId)); res.json({ ok: true });
  });
  app.post('/api/dms', auth, (req, res) => {
    const peerId = text(req.body.userId, 80, 'User ID', 1);
    if (peerId === req.userId || !getUser(peerId)) throw new HttpError(404, 'Choose another Nexus user.');
    if (social.pairBlocked(req.userId,peerId)) throw new HttpError(403, 'You cannot start a conversation while a block is active.');
    const pair = [req.userId, peerId].sort().join(':');
    let conversation = db.prepare('SELECT * FROM conversations WHERE pair = ?').get(pair);
    if (!conversation) transaction(db, () => {
      conversation = { id: id('d') };
      db.prepare('INSERT INTO conversations VALUES (?, ?, ?)').run(conversation.id, pair, now());
      for (const userId of [req.userId, peerId]) db.prepare('INSERT INTO participants VALUES (?, ?)').run(conversation.id, userId);
    });
    [req.userId, peerId].forEach(userId => joinConversationRooms(userId, conversation.id));
    updateWorkspace([req.userId, peerId]); res.json({ id: conversation.id });
  });
  app.get('/api/conversations/:id/messages', auth, (req, res) => {
    const conversation = access(req.params.id, req.userId);
    const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : '';
    if (threadId) messageFor(threadId,req.userId);
    const search = text(req.query.q || '', 100, 'Search');
    const args = { conversation: req.params.id, viewer: req.userId };
    const visible = `conversationId=@conversation
      AND authorId NOT IN (SELECT targetId FROM blocks WHERE ownerId=@viewer)
      AND NOT EXISTS (SELECT 1 FROM messages root JOIN blocks b ON b.targetId=root.authorId
        WHERE root.id=messages.threadId AND b.ownerId=@viewer)`;
    if (typeof req.query.around === 'string') {
      const anchor = messageFor(req.query.around, req.userId);
      if (anchor.conversationId !== req.params.id || (anchor.threadId || '') !== threadId) throw new HttpError(404,'Message not found in this conversation.');
      const around = { ...args, thread: threadId, anchor: anchor.id };
      const where = `${visible} AND coalesce(threadId,'')=@thread`;
      const rows = db.prepare(`SELECT * FROM messages WHERE ${where} AND id<=@anchor ORDER BY id DESC LIMIT ?`).all(around,Math.ceil(config.messagePageSize/2)).reverse();
      rows.push(...db.prepare(`SELECT * FROM messages WHERE ${where} AND id>@anchor ORDER BY id LIMIT ?`).all(around,Math.floor(config.messagePageSize/2)));
      const hasMore = Boolean(rows.length && db.prepare(`SELECT 1 FROM messages WHERE ${where} AND id<@anchor LIMIT 1`).get({...around,anchor:rows[0].id}));
      const hasNewer = Boolean(rows.length && db.prepare(`SELECT 1 FROM messages WHERE ${where} AND id>@anchor LIMIT 1`).get({...around,anchor:rows.at(-1).id}));
      return res.json({messages:rows.map(row=>hydratedMessage(row,req.userId)),hasMore,hasNewer});
    }
    args.before = typeof req.query.before === 'string' ? req.query.before : '\uffff';
    args.pattern = `%${search.replace(/[!%_]/g, '!$&')}%`;
    let where = `${visible} AND id<@before AND (text LIKE @pattern ESCAPE '!' OR EXISTS (SELECT 1 FROM json_each(messages.attachments) file WHERE json_extract(file.value,'$.name') LIKE @pattern ESCAPE '!'))`;
    if (isForum(conversation) && !search && req.query.pinned !== 'true') {
      where += threadId ? ' AND threadId=@thread' : ' AND threadId IS NULL';
      if (threadId) args.thread=threadId;
    }

    if (req.query.pinned === 'true') where += ' AND pinned=1';
    const messages = db.prepare(`SELECT * FROM messages WHERE ${where} ORDER BY id DESC LIMIT ?`).all(args,config.messagePageSize+1);
    const hasMore = messages.length > config.messagePageSize;
    if (hasMore) messages.pop();
    res.json({ messages: messages.reverse().map(row=>hydratedMessage(row,req.userId)), hasMore });
  });
  app.get('/api/messages/:id', auth, (req,res) => res.json({message:hydratedMessage(messageFor(req.params.id,req.userId),req.userId)}));
  app.post('/api/conversations/:id/read', auth, (req, res) => {
    access(req.params.id, req.userId);
    db.prepare('INSERT INTO reads VALUES (?, ?, ?) ON CONFLICT(conversationId, userId) DO UPDATE SET readAt=excluded.readAt')
      .run(req.params.id, req.userId, now());
    emitUsers([req.userId], 'conversation:read', { conversationId: req.params.id });
    res.json({ ok: true });
  });
  function messageMentions(body,conversation,actorId) {
    const names=mentionTokens(body);if(!names.size)return [];
    const everyone=conversation.serverId && names.has('everyone'),here=!conversation.serverId && names.has('here');
    if(everyone){permission(conversation.serverId,actorId,'mentionEveryone');limit(`group-mention:${actorId}`,config.groupMentionsPerMinute);}
    return recipients(conversation.id).filter(userId=>!social.pairBlocked(actorId,userId)&&(everyone||here||names.has(getUser(userId)?.username.toLowerCase())));
  }
  app.post('/api/conversations/:id/messages', auth, (req, res) => {
    const conversation = access(req.params.id, req.userId);
    if (conversation.serverId && conversation.readOnly && !hasPermission(conversation.serverId, req.userId, 'manageMessages')) throw new HttpError(403, 'This channel is read-only.');
    community.checkMute(conversation, req.userId);
    if(conversation.serverId)permission(conversation.serverId,req.userId,'sendMessages');
    if(isForum(conversation))permission(conversation.serverId,req.userId,req.body.threadId?'replyToTopics':'createTopics');
    if (isVoice(conversation)) throw new HttpError(400, 'Choose a text channel to send a message.');
    limit(`message:${req.userId}`, config.messagesPerMinute);
    const body = text(req.body.text || '', config.maxMessageLength, 'Message');
    if (conversation.serverId && conversation.slowmodeSeconds && !hasPermission(conversation.serverId, req.userId, 'manageMessages')) {
      const last = db.prepare('SELECT createdAt FROM messages WHERE conversationId=? AND authorId=? ORDER BY id DESC LIMIT 1').get(conversation.id, req.userId);
      if (last && Date.now() - Date.parse(last.createdAt) < conversation.slowmodeSeconds * 1000) throw new HttpError(429, `Slowmode: wait ${conversation.slowmodeSeconds} seconds between messages.`);
    }
    const recentKey = `${req.userId}:${req.params.id}`;
    const recent = recentMessages.get(recentKey);
    if (body && recent?.text === body && Date.now() - recent.at < 8000) throw new HttpError(429, 'Wait a moment before sending the same message again.');
    const attachmentIds = req.body.attachments ?? [];
    const gifIds = req.body.gifs ?? [];
    const externalGifs = req.body.providerGifs ?? [];
    if (!Array.isArray(externalGifs) || externalGifs.length > config.maxAttachments) throw new HttpError(400, 'Too many GIFs.');
    const providerGifs = externalGifs.map(providerGif);
    if (providerGifs.some(gif=>!gif)) throw new HttpError(400, 'Choose a valid GIF from the picker.');
    if (!Array.isArray(gifIds) || gifIds.length > config.maxAttachments || gifIds.some(gifId => !GIFS.some(gif => gif.id === gifId))) throw new HttpError(400, 'Choose a GIF from the picker.');
    if (conversation.serverId && !conversation.allowAttachments && (attachmentIds.length || gifIds.length || providerGifs.length) && !hasPermission(conversation.serverId, req.userId, 'manageMessages')) throw new HttpError(403, 'Attachments are disabled in this channel.');
    if (!Array.isArray(attachmentIds) || attachmentIds.length + gifIds.length + providerGifs.length > config.maxAttachments || new Set(attachmentIds).size !== attachmentIds.length) throw new HttpError(400, 'Too many attachments.');
    const attachments = attachmentIds.map(fileId => {
      const file = db.prepare('SELECT * FROM files WHERE id = ? AND ownerId = ? AND purpose = ? AND conversationId IS NULL').get(String(fileId), req.userId, 'attachment');
      if (!file) throw new HttpError(400, 'This attachment is not available.');
      return { id: file.id, name: file.name, type: file.mime, size: file.size, url: `/files/${file.id}` };
    });
    attachments.push(...gifIds.map(gifId => { const gif = GIFS.find(item => item.id === gifId); return { ...gif, type: 'image/gif', name: gif.title, size: 0 }; }));
    attachments.push(...providerGifs);
    if(conversation.serverId && attachments.length)permission(conversation.serverId,req.userId,'attachFiles');
    if (!body && !attachments.length) throw new HttpError(400, 'Write a message or attach a file.');
    const threadId = req.body.threadId || null;
    if (threadId && (!isForum(conversation) || messageFor(String(threadId), req.userId).conversationId !== conversation.id || messageFor(String(threadId), req.userId).threadId)) throw new HttpError(400, 'Choose a topic in this forum.');
    if (conversation.type === 'media' && !attachments.length) throw new HttpError(400, 'Add an image or file to post in this media gallery.');
    const replyTo = req.body.replyTo || null;
    if (replyTo && messageFor(String(replyTo), req.userId).conversationId !== req.params.id) throw new HttpError(400, 'Reply in the same conversation.');
    // Time-sortable IDs support stable cursor pagination even for identical timestamps.
    const mentions=messageMentions(body,conversation,req.userId);
    let storedAttachments;
    try{storedAttachments=attachmentCrops(markSpoilers(attachments,req.body.spoilers,config.maxAttachments),req.body.attachmentCrops,config.maxAttachments);}catch(error){throw new HttpError(400,error.message);}
    const messageId = `m_${Date.now().toString(36).padStart(10, '0')}_${randomBytes(8).toString('hex')}`;
    transaction(db, () => {
      db.prepare('INSERT INTO messages (id, conversationId, authorId, text, attachments, replyTo, createdAt,mentions,threadId) VALUES (?, ?, ?, ?, ?, ?, ?,?,?)')
        .run(messageId, req.params.id, req.userId, body, JSON.stringify(storedAttachments), replyTo, now(), JSON.stringify(mentions), threadId);
      for (const attachment of attachments) db.prepare('UPDATE files SET conversationId = ? WHERE id = ?').run(req.params.id, attachment.id);
    });
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
    const message = hydratedMessage(row,req.userId);
    recentMessages.set(recentKey, { text: body, at: Date.now() });
    publishMessage(row,'message:new');
    res.status(201).json({ message });
  });
  app.patch('/api/messages/:id', auth, (req, res) => {
    const message = messageFor(req.params.id, req.userId);
    community.checkMute(access(message.conversationId, req.userId), req.userId);
    if (message.authorId !== req.userId) throw new HttpError(403, 'You can only edit your own messages.');
    const body = text(req.body.text, config.maxMessageLength, 'Message', JSON.parse(message.attachments).length ? 0 : 1);
    const mentions=messageMentions(body,access(message.conversationId,req.userId),req.userId),editedAt=now();
    db.prepare('UPDATE messages SET text = ?, editedAt = ?, mentions = ? WHERE id = ?').run(body,editedAt,JSON.stringify(mentions),message.id);
    broadcastMessage(message.id); res.json({ message: hydratedMessage({ ...message,text:body,editedAt,mentions:JSON.stringify(mentions) },req.userId) });
  });
  app.delete('/api/messages/:id', auth, (req, res) => {
    const message = messageFor(req.params.id, req.userId);
    community.checkMute(access(message.conversationId, req.userId), req.userId);
    if (message.authorId !== req.userId) {
      const channel = access(message.conversationId, req.userId);
      if (!channel.serverId) throw new HttpError(403, 'You can only delete your own messages.');
      if(isForum(channel)&&hasPermission(channel.serverId,req.userId,'manageTopics')){}else permission(channel.serverId, req.userId, 'manageMessages');
    }
    const deletedAttachments=db.prepare('SELECT attachments FROM messages WHERE id=? OR threadId=?').all(message.id,message.id).flatMap(row=>JSON.parse(row.attachments));
    transaction(db, () => {
      db.prepare('DELETE FROM messages WHERE id = ?').run(message.id);
      for (const attachment of deletedAttachments) {
        db.prepare('DELETE FROM files WHERE id = ?').run(attachment.id);
        fs.rmSync(path.join(config.uploadPath, attachment.id), { force: true });
      }
    });
    io?.to(room(message.conversationId)).emit('message:deleted', { id: message.id, conversationId: message.conversationId });
    pins.notify(message.conversationId);
    res.json({ ok: true });
  });
  app.post('/api/messages/:id/reactions', auth, (req, res) => {
    const message = messageFor(req.params.id, req.userId);
    const conversation=access(message.conversationId,req.userId);if(conversation.serverId)permission(conversation.serverId,req.userId,'addReactions');
    const emoji = req.body.emoji;
    if (typeof emoji !== 'string' || emoji.length > 24 || !/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]|[0-9#*])+$/u.test(emoji)) throw new HttpError(400, 'Choose a supported reaction.');
    const existing = db.prepare('SELECT 1 FROM reactions WHERE messageId = ? AND userId = ? AND emoji = ?').get(message.id, req.userId, emoji);
    if (existing) db.prepare('DELETE FROM reactions WHERE messageId = ? AND userId = ? AND emoji = ?').run(message.id, req.userId, emoji);
    else db.prepare('INSERT INTO reactions VALUES (?, ?, ?)').run(message.id, req.userId, emoji);
    broadcastMessage(message.id); res.json({ message: hydratedMessage(message,req.userId) });
  });
  app.post('/api/messages/:id/pin', auth, (req, res) => {
    const message = messageFor(req.params.id, req.userId);
    const conversation = access(message.conversationId, req.userId);
    if (conversation.serverId) permission(conversation.serverId, req.userId, 'pinMessages');
    if (!message.pinned && db.prepare('SELECT count(*) AS n FROM messages WHERE conversationId=? AND pinned=1').get(message.conversationId).n >= config.maxPins) throw new HttpError(400,`This conversation has ${config.maxPins} pins. Unpin one before adding another.`);
    transaction(db,()=>{const revision=message.pinned?message.pinRevision:pins.next(message.conversationId);db.prepare('UPDATE messages SET pinned=?,pinRevision=? WHERE id=?').run(message.pinned?0:1,revision,message.id);});
    broadcastMessage(message.id);pins.notify(message.conversationId);res.json({ok:true,pins:pins.state(message.conversationId,req.userId)});
  });
  const closeUploads = installUploads(app, { db, config, auth, permission, HttpError, id, now, imageType, PROFILE_IMAGE_TYPES, limit, text });
  // Search can display assigned artwork before a DM or shared server exists.
  const assignedProfileImage = db.prepare('SELECT 1 FROM users WHERE id = ? AND (avatar = ? OR banner = ?)');

  app.get('/files/:id', (req, res) => {
    const session = findSession(db, req.headers.cookie);
    if (!session) throw new HttpError(401, 'Sign in to download files.');
    limit(`download:${session.userId}`, config.downloadsPerMinute);
    const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
    if (!file) throw new HttpError(404, 'File not found.');
    if (!['server','channel','role'].includes(file.purpose) && social.isBlocked(session.userId,file.ownerId)) throw new HttpError(404, 'File not found.');
    const download=req.query.download==='1';
    if(download && file.purpose!=='attachment')throw new HttpError(403,'Profile and community images have no download action.');
    if(file.purpose==='role'){if(db.prepare('SELECT 1 FROM server_roles WHERE icon=? AND serverId=?').get(`/files/${file.id}`,file.serverId))member(file.serverId,session.userId);else if(file.ownerId!==session.userId)throw new HttpError(404,'File not found.');}
    else if(file.purpose==='channel'){const channel=db.prepare('SELECT * FROM channels WHERE cover=?').get(`/files/${file.id}`);if(channel){access(channel.id,session.userId);}else if(file.ownerId!==session.userId)throw new HttpError(404,'File not found.');}
    else if (file.purpose === 'server') {
      const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(file.serverId);
      if (!server?.publicListing || ![server.icon, server.banner].includes(`/files/${file.id}`)) member(file.serverId, session.userId);
    }
    else if (file.purpose === 'profile' && file.ownerId !== session.userId) {
      const url = `/files/${file.id}`;
      if (social.pairBlocked(session.userId, file.ownerId) || !assignedProfileImage.get(file.ownerId, url, url)) throw new HttpError(404, 'File not found.');
    }
    else if (file.purpose !== 'profile' && file.ownerId !== session.userId) {
      if (!file.conversationId) throw new HttpError(404, 'File not found.');
      access(file.conversationId, session.userId);
    }
    if(file.conversationId){const conversation=access(file.conversationId,session.userId);
      if(download && PROFILE_IMAGE_TYPES.has(file.mime) && !['dm','media'].includes(conversation.type))throw new HttpError(403,'Image downloads are available only in DMs and media galleries.');
      if(conversation.serverId && (download || !/^image\/|^video\/|^audio\//.test(file.mime)))permission(conversation.serverId,session.userId,'downloadFiles');
    }
    if(req.query.info==='1')return res.json({url:`/files/${file.id}?download=1`,name:file.name,size:file.size});
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': file.mime,
      'Content-Disposition': `${!download && (PROFILE_IMAGE_TYPES.has(file.mime) || /^video\/|^audio\//.test(file.mime)) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.name)}` });
    res.sendFile(path.join(config.uploadPath, file.diskName));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  const publicDirectory = path.join(__dirname, '../public');
  const publicAssets = installPublicAssets(app, publicDirectory);
  app.use(express.static(publicDirectory, { index: false, maxAge: 0, dotfiles: 'deny' }));
  app.get('/{*path}', publicAssets.sendIndex);
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    // Failed private image responses must never become a cached broken avatar.
    res.set('Cache-Control', 'no-store');
    const status = error instanceof multer.MulterError ? 400 : error.status || 500;
    if (status >= 500) console.error('[Nexus]', error);
    const message = error instanceof multer.MulterError ? `Upload failed: ${error.code === 'LIMIT_FILE_SIZE' ? `the file exceeds ${Math.round(config.maxUploadBytes / 1024 ** 3)} GB` : 'too many files or fields'}.` : status >= 500 ? 'Something went wrong. Please try again.' : error.message;
    res.status(status).json({ error: message, ...(error.publicCode ? { code: error.publicCode } : {}), ...(error.details || {}) });
  });
  function voiceState(conversationId, viewerId) {
    return { conversationId, participants: [...voice.values()].filter(v => v.conversationId === conversationId && (!viewerId || !social.pairBlocked(viewerId,v.userId))) };
  }
  function publishVoice(conversationId) { for(const userId of recipients(conversationId)) emitUsers([userId], 'voice:state', voiceState(conversationId,userId)); }
  function leaveVoice(socket) {
    const previous = voice.get(socket.id);
    if (!previous) return;
    voice.delete(socket.id); socket.leave(`voice:${previous.conversationId}`);
    io.to(`voice:${previous.conversationId}`).emit('voice:left', { socketId: socket.id });
    publishVoice(previous.conversationId);
  }
  function attachRealtime(server) {
    io = new Server(server, { maxHttpBufferSize: 65536, cors: undefined,
      allowRequest: (req, callback) => callback(null, requestSecurity.canBeginHandshake(req)) });
    io.use((socket, next) => {
      const session = findSession(db, socket.request.headers.cookie);
      if (!session) return next(new Error('Sign in to connect.'));
      if (!requestSecurity.isTrusted(socket.request, socket.handshake.auth?.csrfToken, session.hash)) {
        const error = new Error(SOURCE_ERROR_MESSAGE); error.data = { code: SOURCE_ERROR_CODE };
        return next(error);
      }
      try {
        limit(`connections:${session.userId}`,config.connectionsPerMinute);
        if ((activeUsers.get(session.userId)?.size || 0) >= config.maxConcurrentSockets) throw new HttpError(429,'Close an unused Nexus tab before connecting another.');
      } catch(error) { return next(new Error(error.message)); }
      socket.userId = session.userId; socket.sessionHash = session.hash;
      next();
    });
    io.on('connection', socket => {
      if (!activeUsers.has(socket.userId)) activeUsers.set(socket.userId, new Set());
      activeUsers.get(socket.userId).add(socket.id); socket.join(userRoom(socket.userId));
      const channelIds = db.prepare('SELECT * FROM channels WHERE serverId IN (SELECT serverId FROM members WHERE userId = ?)').all(socket.userId).filter(channel => canView(channel, socket.userId));
      const dmIds = db.prepare('SELECT conversationId AS id FROM participants WHERE userId = ?').all(socket.userId);
      socket.join(channelIds.concat(dmIds).map(c => room(c.id)));
      activities.set(socket.id, { userId:socket.userId, at: Date.now(), away: false });
      emitUsers(relatedUsers(socket.userId), 'user:updated', getUser(socket.userId));
      function on(event, action) {
        socket.on(event, async (payload = {}, ack = () => {}) => {
          try {
            if (typeof ack !== 'function') ack = () => {};
            if (!payload || typeof payload !== 'object') throw new HttpError(400, 'Invalid event.');
            if (!db.prepare('SELECT 1 FROM sessions WHERE hash = ? AND expiresAt > ?').get(socket.sessionHash, Date.now())) throw new HttpError(401, 'Session expired.');
            limit(`socket:${socket.userId}`, config.socketEventsPerMinute);
            const result = await action(payload); ack({ ok: true, ...result });
          } catch (error) { if (!error.status) console.error('[Nexus realtime]', { event, userId: socket.userId, error: error.stack }); ack({ ok: false, error: error.status ? error.message : 'This action could not be completed.', ...(error.details || {}) }); }
        });
      }
      on('presence:activity', payload => {
        const before = getUser(socket.userId)?.status;
        activities.set(socket.id, { userId:socket.userId, at: Date.now(), away: payload.away === true });
        const user = getUser(socket.userId);
        if (before !== user.status) emitUsers(relatedUsers(socket.userId), 'user:updated', user);
      });
      on('typing', payload => {
        access(payload.conversationId, socket.userId);
        limit(`typing:${socket.id}`, 40);
        emitUsers(recipients(payload.conversationId).filter(userId=>userId!==socket.userId && !social.isBlocked(userId,socket.userId)), 'typing', { userId: socket.userId, conversationId: payload.conversationId });
      });
      on('voice:join', payload => {
        const conversation = access(payload.conversationId, socket.userId);
        community.checkMute(conversation, socket.userId);
        if(conversation.serverId)permission(conversation.serverId,socket.userId,'connectVoice');
        if (!isVoice(conversation) && conversation.type !== 'dm') throw new HttpError(400, 'Choose a voice room or direct message.');
        const current = voice.get(socket.id);
        if (current?.conversationId === payload.conversationId) return { peers: voiceState(payload.conversationId,socket.userId).participants.filter(p => p.socketId !== socket.id) };
        const peers = voiceState(payload.conversationId,socket.userId).participants;
        if (voiceState(payload.conversationId).participants.length >= (conversation.userLimit || config.maxVoiceParticipants)) throw new HttpError(409, 'This voice room is full.');
        if ([...voice.values()].some(v => v.userId === socket.userId)) throw new HttpError(409, 'You are already connected in another tab.');
        leaveVoice(socket);
        const stageSpeaker=conversation.type!=='stage'||hasPermission(conversation.serverId,socket.userId,'manageChannels'),canSpeak=!conversation.serverId||stageSpeaker&&hasPermission(conversation.serverId,socket.userId,'speak');
        voice.set(socket.id, { canSpeak,stageSpeaker: conversation.type !== 'stage' || hasPermission(conversation.serverId, socket.userId, 'manageChannels'), socketId: socket.id, userId: socket.userId, conversationId: payload.conversationId, muted: !canSpeak || payload.muted === true || payload.deafened === true, deafened: payload.deafened === true, camera: false, sharing: false });
        socket.join(`voice:${payload.conversationId}`); publishVoice(payload.conversationId);
        return { peers, canSpeak,stageListener: conversation.type === 'stage' && !stageSpeaker };
      });
      on('voice:leave', () => { leaveVoice(socket); });
      on('voice:update', payload => {
        const current = voice.get(socket.id);
        if (!current) return;
        const conversation = access(current.conversationId, socket.userId);
        if (conversation.serverId && !conversation.allowMedia && (payload.camera || payload.sharing) && !hasPermission(conversation.serverId, socket.userId, 'manageChannels')) throw new HttpError(403, 'Camera and screen sharing are disabled in this channel.');
        if(current.canSpeak===false && payload.muted===false)throw new HttpError(403,'Microphone access is disabled for your roles.');
        if(conversation.serverId && payload.camera)permission(conversation.serverId,socket.userId,'useVideo');
        if(conversation.serverId && payload.sharing)permission(conversation.serverId,socket.userId,'shareScreen');
        if (!current.stageSpeaker && (payload.muted === false || payload.camera || payload.sharing)) throw new HttpError(403, 'Only stage hosts can speak or share media.');
        for (const key of ['muted', 'deafened', 'camera', 'sharing']) if (typeof payload[key] === 'boolean') current[key] = payload[key];
        publishVoice(current.conversationId);
      });
      on('rtc:signal', payload => {
        const current = voice.get(socket.id), target = voice.get(payload.to);
        if (current) access(current.conversationId, socket.userId);
        if (!current || !target || current.conversationId !== target.conversationId) throw new HttpError(403, 'Join the same voice room first.');
        if (social.pairBlocked(socket.userId,target.userId)) throw new HttpError(403, 'This media connection is not available.');
        if (!['offer', 'answer', 'candidate'].includes(payload.type)) throw new HttpError(400, 'Invalid call signal.');
        const media = payload.media && Object.fromEntries(['audio','camera','screen'].map(key => [key, typeof payload.media[key] === 'string' && /^[a-z0-9_-]{1,16}$/i.test(payload.media[key]) ? payload.media[key] : null]));
        io.to(payload.to).emit('rtc:signal', { from: socket.id, userId: socket.userId, conversationId: current.conversationId, type: payload.type, data: payload.data, ...(media ? { media } : {}) });
      });
      on('call:invite', payload => {
        if (access(payload.conversationId, socket.userId).type !== 'dm') throw new HttpError(400, 'Call a direct message conversation.');
        limit(`calls:${socket.userId}`, 6);
        const current = voice.get(socket.id);
        if (current?.conversationId !== payload.conversationId) throw new HttpError(400, 'Join the call first.');
        emitUsers(recipients(payload.conversationId).filter(u => u !== socket.userId), 'call:incoming', { conversationId: payload.conversationId, user: getUser(socket.userId), video: Boolean(payload.video) });
      });
      on('call:decline', payload => {
        if (access(payload.conversationId, socket.userId).type !== 'dm') throw new HttpError(400, 'Invalid call.');
        emitUsers(recipients(payload.conversationId).filter(u => u !== socket.userId), 'call:declined', { conversationId: payload.conversationId });
      });
      socket.on('disconnect', () => {
        leaveVoice(socket);
        activeUsers.get(socket.userId)?.delete(socket.id);
        activities.delete(socket.id); if (!activeUsers.get(socket.userId)?.size) activeUsers.delete(socket.userId);
        const user=getUser(socket.userId);if(user)emitUsers(relatedUsers(socket.userId), 'user:updated', user);
      });
    });
    return io;
  }
  return { app, db, attachRealtime, close() { clearInterval(cleanup); closeUploads(); db.close(); } };
}

module.exports = { createApp };
