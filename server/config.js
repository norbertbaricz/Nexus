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
  publicOrigin: (process.env.PUBLIC_ORIGIN || '').trim(),
  csrfSecret: process.env.CSRF_SECRET || '',
  csrfLifetimeMs: 2 * 60 * 60 * 1000,
  trustProxy: process.env.TRUST_PROXY === 'true',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  registrationOpen: process.env.REGISTRATION_OPEN !== 'false',
  giphyApiKey: (process.env.GIPHY_API_KEY || '').trim(),
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
  discoveryPageSize: 24,
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

module.exports = { CONFIG };
