'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../server/database');
const { createBadges } = require('../server/badges');

const LAUNCH = Date.parse('2026-01-01T00:00:00Z'), DAY_MS = 86400000;
const SETTINGS = { earlyMemberWindowDays: 2, earlyMemberEndsAt: '' };
function user(db, id, createdAt = LAUNCH) {
  db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES(?,?,?,?,?)').run(id,id,id,'fixture',new Date(createdAt).toISOString());
}
test('early membership ends at the fixed deadline, has no account-count cap and survives restarts', t => {
  const db = openDatabase(':memory:'); t.after(() => db.close()); let at = LAUNCH;
  const badges = createBadges(db, SETTINGS, () => at);
  for (let index=0;index<102;index++) user(db,`u_${index}`);
  at = LAUNCH + 2 * DAY_MS - 1; badges.awardEarlyMember('u_101',new Date(LAUNCH).toISOString());
  assert.ok(badges.forUser('u_101','').includes('early-member'));
  at++; badges.awardEarlyMember('u_100',new Date(at).toISOString());
  assert.ok(!badges.forUser('u_100','').includes('early-member'));
  const restarted = createBadges(db,{...SETTINGS,earlyMemberWindowDays:365},()=>at);
  restarted.awardEarlyMember('u_99',new Date(at).toISOString());
  assert.ok(!restarted.forUser('u_99','').includes('early-member'));
  assert.ok(restarted.forUser('u_101','').includes('early-member'));
});
test('upgrades preserve old awards, use the first account and retain launch dates after deletion', t => {
  const db = openDatabase(':memory:'); t.after(() => db.close()); user(db,'first'); user(db,'later',LAUNCH+10*DAY_MS);
  db.prepare("INSERT INTO user_badges VALUES('first','early-member')").run();
  const badges = createBadges(db,{...SETTINGS,earlyMemberEndsAt:'2026-01-04T00:00:00Z'},()=>LAUNCH+10*DAY_MS);
  badges.awardEarlyMember('later',new Date(LAUNCH+10*DAY_MS).toISOString());
  assert.ok(badges.forUser('first','').includes('early-member')); assert.ok(!badges.forUser('later','').includes('early-member'));
  db.prepare("DELETE FROM users WHERE id='first'").run();
  createBadges(db,SETTINGS,()=>LAUNCH+10*DAY_MS).awardEarlyMember('later',new Date(LAUNCH+10*DAY_MS).toISOString());
  assert.ok(!badges.forUser('later','').includes('early-member'));
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='earlyMemberLaunchAt'").get().value,'2026-01-01T00:00:00.000Z');
});
test('community-owner reflects actual ownership, ignores stale stored flags and changes on transfer/deletion', t => {
  const db = openDatabase(':memory:'); t.after(() => db.close()); user(db,'owner'); user(db,'member');
  db.prepare("INSERT INTO user_badges VALUES('member','community-owner'),('member','creator')").run();
  db.prepare("INSERT INTO servers(id,name,ownerId,invite,createdAt) VALUES('s','Fixture','owner','invite','2026-01-01')").run();
  db.prepare("INSERT INTO members VALUES('s','owner','owner','2026-01-01'),('s','member','member','2026-01-01')").run();
  const badges=createBadges(db,SETTINGS,()=>LAUNCH);
  assert.deepEqual(badges.forUser('member',''),[]); assert.ok(badges.forUser('owner','owner').includes('community-owner'));
  db.prepare("UPDATE servers SET ownerId='member'").run();
  assert.ok(!badges.forUser('owner','').includes('community-owner')); assert.deepEqual(badges.forUser('member',''),['community-owner']);
  db.prepare("DELETE FROM servers WHERE id='s'").run(); assert.deepEqual(badges.forUser('member',''),[]);
});
