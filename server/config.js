'use strict';

const path = require('node:path');

if (process.env.TURN_URLS?.trim() && !process.env.TURN_SHARED_SECRET?.trim() && (!process.env.TURN_USERNAME?.trim() || !process.env.TURN_CREDENTIAL?.trim())) {
  throw new Error('TURN_URLS requires TURN_SHARED_SECRET or TURN_USERNAME and TURN_CREDENTIAL from your relay provider.');
}

function readIceServers(raw) {
  let servers;
  try { servers=JSON.parse(raw); } catch { throw new Error('ICE_SERVERS must be a valid JSON array.'); }
  if(!Array.isArray(servers)||servers.some(server=>!server||![].concat(server.urls).length||[].concat(server.urls).some(url=>typeof url!=='string'||!/^stuns?:|^turns?:/i.test(url))))throw new Error('ICE_SERVERS must contain valid STUN or TURN URLs.');
  return servers;
}

// All deployment settings and easy-to-tune limits live here or in .env.
const CONFIG = Object.freeze({
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  databasePath: path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '../data/nexus.sqlite')),
  uploadPath: path.resolve(process.env.UPLOAD_PATH || path.join(__dirname, '../data/uploads')),
  // Optional host FFmpeg; original files are never replaced by playback copies.
  playback: Object.freeze({ enabled:process.env.VIDEO_COMPAT_ENABLED!=='false',executable:process.env.FFMPEG_PATH||'ffmpeg',
    cachePath:process.env.VIDEO_CACHE_PATH?path.resolve(process.env.VIDEO_CACHE_PATH):null,
    concurrency:1,queueLimit:8,threads:2,timeoutMs:15*60*1000,probeTimeoutMs:5000,
    maxOutputBytes:512*1024**2,maxCacheBytes:2*1024**3,minimumFreeBytes:256*1024**2,cacheAgeMs:7*24*60*60*1000,
    maxSide:1280,fps:30,crf:25,bitrateKbps:2500,pollMs:1000,requestsPerMinute:6,
    // Persistent backlog stays on disk; only queueLimit jobs enter memory.
    backfillBatch:32,backfillMs:1000,cooldownMs:250,resourceRetryMs:30000,evictedRetryMs:60000,
    retryDelaysMs:Object.freeze([60000,15*60*1000]),cacheTouchMs:60000,
  }),
  publicOrigin: (process.env.PUBLIC_ORIGIN || '').trim(),
  csrfSecret: process.env.CSRF_SECRET || '',
  csrfLifetimeMs: 2 * 60 * 60 * 1000,
  trustProxy: process.env.TRUST_PROXY === 'true',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  registrationOpen: process.env.REGISTRATION_OPEN !== 'false',
  giphyApiKey: (process.env.GIPHY_API_KEY || '').trim(),
  push: Object.freeze({
    enabled: process.env.PUSH_ENABLED !== 'false', subject: (process.env.PUSH_SUBJECT || '').trim(),
    ttlSeconds: 300, graceMs: 1500, pollMs: 1000, concurrency: 4, batchSize: 24,
    queueLimit: 10000, maxDevices: 10, timeoutMs: 8000,
    retryDelaysMs: Object.freeze([5000, 30000, 60000]), settingsPerMinute: 20, testsPerMinute: 2,
  }),
  // SMTP is optional. Recovery codes work without an external mail service.
  mail: Object.freeze({
    host: (process.env.MAIL_HOST || '').trim(), port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === 'true', from: (process.env.MAIL_FROM || '').trim(),
    user: process.env.MAIL_USER || '', password: process.env.MAIL_PASSWORD || '',
    connectionTimeoutMs: 10000, greetingTimeoutMs: 10000, socketTimeoutMs: 20000,
    maxQueue: 50, concurrency: 2,
  }),
  recovery: Object.freeze({
    resetTokenMinutes: 20, verificationTokenMinutes: 1440, supportTokenMinutes: 15, tokenBytes: 32,
    codeBytes: 16, codeCount: 8, cooldownMs: 60000, responseDelayMs: 250,
    requestsPerMinute: 4, proofAttemptsPerMinute: 6, settingsPerMinute: 4,
  }),
  sessionDays: 14,
  minPasswordLength: 10,
  maxPasswordLength: 128,
  maxMessageLength: 8000,
  maxPins: 50, groupMentionsPerMinute: 3,
  permissionCacheEntries: 2000,
  maxBlockedUsers: 1000,
  messagePageSize: 50,
  maxUploadBytes: 5 * 1024 ** 3,
  maxProfileBytes: 5 * 1024 ** 3,
  maxServerImageBytes: 5 * 1024 ** 3,
  uploadChunkBytes: 4 * 1024 * 1024,
  uploadExpiryMs: 24 * 60 * 60 * 1000,
  maxActiveUploads: 4,
  uploadChunksPerMinute: 600,
  downloadsPerMinute: 1200,
  socketEventsPerMinute: 900,
  maxConcurrentSockets: 12,
  connectionsPerMinute: 30,
  creatorUserId: process.env.CREATOR_USER_ID || '',
  creatorClaimToken: process.env.CREATOR_CLAIM_TOKEN || '',
  creatorUsername: 'maxultimat3',
  earlyMemberWindowDays: Number(process.env.EARLY_MEMBER_WINDOW_DAYS || 90),
  earlyMemberEndsAt: (process.env.EARLY_MEMBER_ENDS_AT || '').trim(),
  jsonBodyLimit: '256kb',
  idleAfterMs: 5 * 60 * 1000,
  mutationsPerMinute: 100,
  maxCategories: 40,
  maxChannels: 100,
  maxModerationHours: 24 * 365,
  turnSharedSecret: process.env.TURN_SHARED_SECRET || '',
  turnCredentialSeconds: 3600,
  iceTransportPolicy: process.env.RTC_RELAY_ONLY === 'true' ? 'relay' : 'all',
  maxAttachments: 4,
  maxVoiceParticipants: 8,
  maxServerRulesLength: 32000,
  maxServerRoles: 20,
  maxRoleNameLength: 32,
  discoveryPageSize: 24, discoveryQueryLength: 80, discoveryMaxOffset: 1000000,
  rtcConnectionTimeoutMs: 25000,
  rtcRestartDelayMs: 4000,
  rtcMaxRestarts: 2,
  authAttemptsPerMinute: 12,
  requestsPerMinute: 240,
  messagesPerMinute: 45,
  uploadsPerMinute: 20,
  iceServers: [
    ...readIceServers(process.env.ICE_SERVERS || '[{"urls":"stun:stun.cloudflare.com:3478"}]'),
    ...(process.env.TURN_URLS ? [{ urls: process.env.TURN_URLS.split(',').map(value => value.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' }] : []),
  ],
});

if (!Number.isFinite(CONFIG.earlyMemberWindowDays) || CONFIG.earlyMemberWindowDays < 0) throw new Error('EARLY_MEMBER_WINDOW_DAYS must be a nonnegative number.');
if (CONFIG.earlyMemberEndsAt && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(CONFIG.earlyMemberEndsAt) || !Number.isFinite(Date.parse(CONFIG.earlyMemberEndsAt)))) throw new Error('EARLY_MEMBER_ENDS_AT must be an ISO timestamp with a timezone.');

module.exports = { CONFIG };
