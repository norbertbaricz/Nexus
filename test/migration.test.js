'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../server/database');

test('schema ten recovery addresses, code hashes and outstanding proofs survive the additive host-recovery migration',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-v10-recovery-')),filename=path.join(directory,'nexus.sqlite');t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const initial=openDatabase(filename),created='2026-10-01T00:00:00.000Z';
 initial.prepare('INSERT INTO users (id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_recovery_keep','recovery_keep','Retained recovery','existing-hash-fixture',created);
 initial.prepare('INSERT INTO account_security VALUES (?,?,?,?,?,?)').run('u_recovery_keep','verified@example.test',1000,'pending@example.test',2000,3000);
 initial.prepare('INSERT INTO account_tokens VALUES (?,?,?,?,?,?)').run('a'.repeat(64),'u_recovery_keep','reset','verified@example.test',2000,9999999999999);
 initial.prepare('INSERT INTO recovery_codes VALUES (?,?,?)').run('b'.repeat(64),'u_recovery_keep',2000);
 const before={security:initial.prepare('SELECT * FROM account_security').all(),tokens:initial.prepare('SELECT * FROM account_tokens').all(),codes:initial.prepare('SELECT * FROM recovery_codes').all()};
 initial.exec('DROP TABLE support_recovery_tokens; PRAGMA user_version=10');initial.close();
 const upgraded=openDatabase(filename);
 try{assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,13);assert.deepEqual(upgraded.prepare('SELECT * FROM account_security').all(),before.security);assert.deepEqual(upgraded.prepare('SELECT * FROM account_tokens').all(),before.tokens);assert.deepEqual(upgraded.prepare('SELECT * FROM recovery_codes').all(),before.codes);assert.equal(upgraded.prepare('SELECT COUNT(*) AS count FROM support_recovery_tokens').get().count,0);assert.equal(upgraded.prepare('SELECT passwordHash FROM users WHERE id=?').get('u_recovery_keep').passwordHash,'existing-hash-fixture');}
 finally{upgraded.close();}
});

// Version-one columns match the previous release. Every record is disposable.
const LEGACY_SCHEMA = `
  PRAGMA user_version = 1;
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    displayName TEXT NOT NULL, passwordHash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '', banner TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '', pronouns TEXT NOT NULL DEFAULT '',
    accent TEXT NOT NULL DEFAULT '#f37970', status TEXT NOT NULL DEFAULT 'online', createdAt TEXT NOT NULL
  );
  CREATE TABLE servers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT '#f37970',
    ownerId TEXT NOT NULL REFERENCES users(id), invite TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL
  );
  CREATE TABLE files (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    conversationId TEXT, purpose TEXT NOT NULL, name TEXT NOT NULL,
    mime TEXT NOT NULL, size INTEGER NOT NULL, diskName TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  INSERT INTO users (id, username, displayName, passwordHash, createdAt)
    VALUES ('u_legacy', 'existing_user', 'Existing user', 'test-only-hash', '2026-01-01');
  INSERT INTO servers (id, name, ownerId, invite, createdAt)
    VALUES ('s_legacy', 'Existing server', 'u_legacy', 'existing-invitation', '2026-01-01');
  INSERT INTO files VALUES ('f_legacy', 'u_legacy', NULL, 'profile', 'existing.gif', 'image/gif', 100, 'f_legacy', '2026-01-01');
`;
test('upgrading a version-one database preserves accounts, servers, invitations and existing uploads', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-migration-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'nexus.sqlite');
  const legacy = new DatabaseSync(filename); legacy.exec(LEGACY_SCHEMA); legacy.close();
  const db = openDatabase(filename);
  assert.equal(db.prepare('SELECT username FROM users').get().username, 'existing_user');
  const server = db.prepare('SELECT * FROM servers').get();
  assert.equal(server.name, 'Existing server'); assert.equal(server.invite, 'existing-invitation'); assert.equal(server.banner, '');
  const file = db.prepare('SELECT * FROM files').get();
  assert.equal(file.name, 'existing.gif'); assert.equal(file.purpose, 'profile'); assert.equal(file.serverId, null);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 13); db.close();
  const reopened = openDatabase(filename);
  assert.equal(reopened.prepare('SELECT count(*) AS count FROM users').get().count, 1);
  assert.equal(reopened.prepare('SELECT count(*) AS count FROM files').get().count, 1); reopened.close();
});


test('version-five permission migration preserves role grants once and keeps later invitation edits', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-permission-migration-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, 'nexus.sqlite');
  const fixture = openDatabase(filename);
  fixture.exec(`
    INSERT INTO users (id,username,displayName,passwordHash,createdAt) VALUES ('u_owner','previous_owner','Previous owner','test-only','2026-01-01');
    INSERT INTO servers (id,name,ownerId,invite,createdAt) VALUES ('s_existing','Previous server','u_owner','existing-invite','2026-01-01');
    INSERT INTO server_roles (id,serverId,name,color,permissions) VALUES ('r_inviter','s_existing','Inviter','#ffffff','["inviteMembers","manageMessages"]');
    INSERT INTO channels (id,serverId,name) VALUES ('c_existing','s_existing','existing');
    INSERT INTO messages (id,conversationId,authorId,text,createdAt) VALUES ('m_existing','c_existing','u_owner','Keep this history','2026-01-01');
    DELETE FROM app_settings WHERE key='permissionsV6';
    ALTER TABLE servers DROP COLUMN defaultPermissions;
    ALTER TABLE server_roles DROP COLUMN deniedPermissions;
    ALTER TABLE channels DROP COLUMN cover;
    ALTER TABLE messages DROP COLUMN acceptedReplyId;
    PRAGMA user_version = 5;
  `);
  fixture.close();
  const upgraded = openDatabase(filename);
  assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version, 13);
  assert.equal(upgraded.prepare('SELECT text FROM messages').get().text, 'Keep this history');
  const role = upgraded.prepare('SELECT * FROM server_roles').get();
  assert.deepEqual(JSON.parse(role.permissions), ['inviteMembers','manageMessages','manageInvites']);
  assert.deepEqual(JSON.parse(role.deniedPermissions), []);
  assert.deepEqual(JSON.parse(upgraded.prepare('SELECT defaultPermissions FROM servers').get().defaultPermissions), {});
  assert.equal(upgraded.prepare('SELECT cover FROM channels').get().cover, '');
  upgraded.prepare('UPDATE server_roles SET permissions=?,deniedPermissions=? WHERE id=?').run('["inviteMembers"]','["manageInvites"]',role.id);
  upgraded.close();
  const reopened = openDatabase(filename);
  const edited = reopened.prepare('SELECT * FROM server_roles').get();
  assert.deepEqual(JSON.parse(edited.permissions), ['inviteMembers']);
  assert.deepEqual(JSON.parse(edited.deniedPermissions), ['manageInvites']);
  assert.equal(reopened.prepare('SELECT invite FROM servers').get().invite, 'existing-invite');
  reopened.close();
});


test('version-six upgrade keeps pins, roles and messages while adding account preferences and pin receipts',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-sync-migration-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));const filename=path.join(folder,'nexus.sqlite');
  const fixture=openDatabase(filename);fixture.exec(`
    INSERT INTO users (id,username,displayName,passwordHash,createdAt) VALUES ('u_previous','previous_account','Previous account','test-only','2026-01-01');
    INSERT INTO conversations VALUES ('d_previous','previous-pair','2026-01-01');
    INSERT INTO participants VALUES ('d_previous','u_previous');
    INSERT INTO messages (id,conversationId,authorId,text,pinned,createdAt) VALUES ('m_pinned','d_previous','u_previous','Keep this pinned message',1,'2026-01-01');
    ALTER TABLE messages DROP COLUMN pinRevision;
    DROP TABLE user_preferences; DROP TABLE pin_counters; DROP TABLE pin_reads;
    PRAGMA user_version=6;
  `);fixture.close();
  const upgraded=openDatabase(filename);assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,13);
  const message=upgraded.prepare('SELECT * FROM messages').get();assert.equal(message.text,'Keep this pinned message');assert.equal(message.pinned,1);assert.equal(message.pinRevision,0);
  upgraded.prepare('INSERT INTO user_preferences VALUES (?,?,?,?)').run('u_previous','{"palette":"rose","motion":false}',1,'2026-10-26');
  upgraded.prepare('INSERT INTO pin_counters VALUES (?,?)').run('d_previous',2);upgraded.prepare('INSERT INTO pin_reads VALUES (?,?,?)').run('d_previous','u_previous',1);upgraded.close();
  const reopened=openDatabase(filename);assert.equal(JSON.parse(reopened.prepare('SELECT preferences FROM user_preferences').get().preferences).palette,'rose');assert.equal(reopened.prepare('SELECT revision FROM pin_reads').get().revision,1);reopened.close();
});

test('version-seven type simplification preserves forum roots, replies, pins, files and new artwork settings after restart',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-channel-migration-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));const filename=path.join(folder,'nexus.sqlite');
 const fixture=openDatabase(filename);fixture.exec(`
 INSERT INTO users (id,username,displayName,passwordHash,createdAt) VALUES ('u_v7','version_seven','Version seven','test-only','2026-01-01');
 INSERT INTO servers (id,name,ownerId,invite,createdAt) VALUES ('s_v7','Existing community','u_v7','keep-invite','2026-01-01');
 INSERT INTO members VALUES ('s_v7','u_v7','owner','2026-01-01');
 INSERT INTO channels (id,serverId,name,type,cover) VALUES ('c_qa','s_v7','help','qa','/files/f_cover'),('c_resources','s_v7','documents','resources','');
 INSERT INTO messages (id,conversationId,authorId,text,pinned,pinRevision,createdAt) VALUES ('m_root','c_qa','u_v7','Keep the question',1,3,'2026-01-01');
 INSERT INTO messages (id,conversationId,authorId,text,threadId,createdAt) VALUES ('m_reply','c_qa','u_v7','Keep its reply','m_root','2026-01-01');
 UPDATE messages SET acceptedReplyId='m_reply' WHERE id='m_root';
 INSERT INTO messages (id,conversationId,authorId,text,attachments,createdAt) VALUES ('m_doc','c_resources','u_v7','Keep the document','[{"id":"f_doc","type":"application/pdf","spoiler":true}]','2026-01-01');
 INSERT INTO files (id,ownerId,conversationId,serverId,purpose,name,mime,size,diskName,createdAt) VALUES ('f_doc','u_v7','c_resources','s_v7','attachment','notes.pdf','application/pdf',12,'keep-disk-file','2026-01-01');
 INSERT INTO server_roles (id,serverId,name,color) VALUES ('r_z','s_v7','Zebra','#ffffff'),('r_a','s_v7','Alpha','#ffffff');
 DELETE FROM app_settings WHERE key='channelTypesV8';
 ALTER TABLE users DROP COLUMN avatarCrop;ALTER TABLE users DROP COLUMN bannerCrop;
 ALTER TABLE servers DROP COLUMN iconCrop;ALTER TABLE servers DROP COLUMN bannerCrop;ALTER TABLE servers DROP COLUMN ownerRolePosition;ALTER TABLE servers DROP COLUMN ownerRoleDisplay;
 ALTER TABLE channels DROP COLUMN coverCrop;
 ALTER TABLE server_roles DROP COLUMN iconCrop;ALTER TABLE server_roles DROP COLUMN position;ALTER TABLE server_roles DROP COLUMN displayMembers;
 PRAGMA user_version=7;`);fixture.close();
 const upgraded=openDatabase(filename);assert.equal(upgraded.prepare('PRAGMA user_version').get().user_version,13);assert.equal(upgraded.prepare('SELECT type FROM channels WHERE id=?').get('c_qa').type,'forum');assert.equal(upgraded.prepare('SELECT type FROM channels WHERE id=?').get('c_resources').type,'media');
 const topic=upgraded.prepare('SELECT * FROM messages WHERE id=?').get('m_root');assert.equal(topic.pinned,1);assert.equal(topic.pinRevision,3);assert.equal(topic.acceptedReplyId,'m_reply');assert.equal(upgraded.prepare('SELECT threadId FROM messages WHERE id=?').get('m_reply').threadId,'m_root');assert.equal(upgraded.prepare('SELECT diskName FROM files').get().diskName,'keep-disk-file');assert.equal(upgraded.prepare('SELECT cover FROM channels WHERE id=?').get('c_qa').cover,'/files/f_cover');assert.equal(JSON.parse(upgraded.prepare('SELECT attachments FROM messages WHERE id=?').get('m_doc').attachments)[0].spoiler,true);
 assert.deepEqual(upgraded.prepare('SELECT name FROM server_roles ORDER BY position').all().map(role=>role.name),['Alpha','Zebra']);
 upgraded.exec(`UPDATE server_roles SET position=10,displayMembers=1 WHERE id='r_a';UPDATE users SET avatarCrop='{"x":20,"y":80,"zoom":2}';`);upgraded.close();
 const reopened=openDatabase(filename);assert.equal(reopened.prepare('SELECT position FROM server_roles WHERE id=?').get('r_a').position,10);assert.equal(reopened.prepare('SELECT count(*) AS n FROM messages').get().n,3);assert.equal(JSON.parse(reopened.prepare('SELECT avatarCrop FROM users').get().avatarCrop).x,20);reopened.close();
});
