'use strict';
const { transaction } = require('./database');

// The earning window is fixed once, using runtime defaults from config.js.
const BADGE_SETTINGS = Object.freeze({ launch: 'earlyMemberLaunchAt', end: 'earlyMemberEndsAt' });
const DAY_MS = 24 * 60 * 60 * 1000;
function createBadges(db, config, clock = Date.now) {
  const setting = db.prepare('SELECT value FROM app_settings WHERE key=?');
  const storedBadges = db.prepare('SELECT badge FROM user_badges WHERE userId=?');
  const ownsServer = db.prepare('SELECT 1 FROM servers WHERE ownerId=? LIMIT 1');
  const award = db.prepare("INSERT OR IGNORE INTO user_badges VALUES (?,'early-member')");
  function windowFor(firstAccountAt) {
    const launch = setting.get(BADGE_SETTINGS.launch)?.value;
    const storedEnd = setting.get(BADGE_SETTINGS.end)?.value;
    if (launch && storedEnd) return { launchAt: Date.parse(launch), endsAt: Date.parse(storedEnd) };
    if (!firstAccountAt) return null;
    const launchAt = launch ? Date.parse(launch) : Date.parse(firstAccountAt);
    const endsAt = storedEnd ? Date.parse(storedEnd) : config.earlyMemberEndsAt ? Date.parse(config.earlyMemberEndsAt) : launchAt + config.earlyMemberWindowDays * DAY_MS;
    if (!Number.isFinite(launchAt) || !Number.isFinite(endsAt)) throw new Error('Early member dates must be valid timestamps.');
    transaction(db, () => {
      db.prepare('INSERT OR IGNORE INTO app_settings VALUES (?,?)').run(BADGE_SETTINGS.launch, new Date(launchAt).toISOString());
      db.prepare('INSERT OR IGNORE INTO app_settings VALUES (?,?)').run(BADGE_SETTINGS.end, new Date(endsAt).toISOString());
    });
    return { launchAt, endsAt };
  }
  // Upgrades use the oldest real account. Existing awards are never revoked.
  windowFor(db.prepare('SELECT min(createdAt) AS createdAt FROM users').get()?.createdAt);
  function awardEarlyMember(userId, createdAt) {
    const window = windowFor(createdAt), at = clock();
    if (window && at >= window.launchAt && at < window.endsAt) award.run(userId);
  }
  function forUser(userId, creatorId) {
    const stored = storedBadges.all(userId).map(row => row.badge);
    // Ownership and creator badges are always derived from authoritative IDs.
    return [...new Set([
      ...(userId === creatorId ? ['creator'] : []),
      ...(ownsServer.get(userId) ? ['community-owner'] : []),
      ...stored.filter(badge => !['creator', 'community-owner'].includes(badge)),
    ])];
  }
  return { awardEarlyMember, forUser };
}
module.exports = { createBadges };
