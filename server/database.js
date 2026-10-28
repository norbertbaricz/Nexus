'use strict';

const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname } = require('node:path');

// A new database keeps legacy unauthenticated identities separate from accounts.
function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      displayName TEXT NOT NULL, passwordHash TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '', banner TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '', pronouns TEXT NOT NULL DEFAULT '',
      accent TEXT NOT NULL DEFAULT '#f37970', status TEXT NOT NULL DEFAULT 'online',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expiresAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(userId);
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '', banner TEXT NOT NULL DEFAULT '', accent TEXT NOT NULL DEFAULT '#f37970',
      ownerId TEXT NOT NULL REFERENCES users(id), invite TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS servers_owner ON servers(ownerId);
    CREATE TABLE IF NOT EXISTS members (
      serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member', joinedAt TEXT NOT NULL,
      PRIMARY KEY (serverId, userId)
    );
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY, serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'text',
      topic TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'THE COMMON ROOM',
      position INTEGER NOT NULL DEFAULT 0, UNIQUE(serverId, name)
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, pair TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS participants (
      conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (conversationId, userId)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, conversationId TEXT NOT NULL,
      authorId TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL DEFAULT '',
      attachments TEXT NOT NULL DEFAULT '[]', replyTo TEXT REFERENCES messages(id) ON DELETE SET NULL,
      createdAt TEXT NOT NULL, editedAt TEXT, pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS message_history ON messages(conversationId, createdAt DESC, id DESC);
    CREATE TABLE IF NOT EXISTS reactions (
      messageId TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL, PRIMARY KEY(messageId, userId, emoji)
    );
    CREATE TABLE IF NOT EXISTS reads (
      conversationId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES users(id),
      readAt TEXT NOT NULL, PRIMARY KEY(conversationId, userId)
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
      conversationId TEXT, serverId TEXT REFERENCES servers(id), purpose TEXT NOT NULL, name TEXT NOT NULL,
      mime TEXT NOT NULL, size INTEGER NOT NULL, diskName TEXT NOT NULL, createdAt TEXT NOT NULL
    );

  `);
  // Additive migration keeps every existing account, message and upload intact.
  const serverColumns = new Set(db.prepare('PRAGMA table_info(servers)').all().map(column => column.name));
  const fileColumns = new Set(db.prepare('PRAGMA table_info(files)').all().map(column => column.name));
  transaction(db, () => {
    if (!serverColumns.has('banner')) db.exec("ALTER TABLE servers ADD COLUMN banner TEXT NOT NULL DEFAULT ''");
    if (!fileColumns.has('serverId')) db.exec('ALTER TABLE files ADD COLUMN serverId TEXT REFERENCES servers(id)');
    db.exec('PRAGMA user_version = 2');
  });
  const addColumns = (table, columns) => {
    const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
    for (const [name, definition] of Object.entries(columns)) if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  transaction(db, () => {
    addColumns('servers', { rules: "TEXT NOT NULL DEFAULT ''", publicListing: 'INTEGER NOT NULL DEFAULT 0' });
    addColumns('channels', { private: 'INTEGER NOT NULL DEFAULT 0', allowedRoleIds: "TEXT NOT NULL DEFAULT '[]'", readOnly: 'INTEGER NOT NULL DEFAULT 0', allowMedia: 'INTEGER NOT NULL DEFAULT 1' });
    db.exec(`CREATE TABLE IF NOT EXISTS server_roles (
      id TEXT PRIMARY KEY, serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL, color TEXT NOT NULL, permissions TEXT NOT NULL DEFAULT '[]',
      UNIQUE(serverId, name)
    );
    CREATE TABLE IF NOT EXISTS member_roles (
      serverId TEXT NOT NULL, userId TEXT NOT NULL,
      roleId TEXT NOT NULL REFERENCES server_roles(id) ON DELETE CASCADE,
      PRIMARY KEY(serverId, userId, roleId),
      FOREIGN KEY(serverId, userId) REFERENCES members(serverId, userId) ON DELETE CASCADE
    );
    PRAGMA user_version = 3;`);
  });
  transaction(db, () => {
    addColumns('servers', { welcomeMessage: "TEXT NOT NULL DEFAULT ''", defaultNotifications: "TEXT NOT NULL DEFAULT 'all'" });
    addColumns('channels', { icon: "TEXT NOT NULL DEFAULT ''", slowmodeSeconds: 'INTEGER NOT NULL DEFAULT 0', userLimit: 'INTEGER NOT NULL DEFAULT 0', allowAttachments: 'INTEGER NOT NULL DEFAULT 1' });
    addColumns('server_roles', { icon: "TEXT NOT NULL DEFAULT 'shield'" });
    addColumns('messages', { mentions: "TEXT NOT NULL DEFAULT '[]'", threadId: 'TEXT REFERENCES messages(id) ON DELETE CASCADE' });
    db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, UNIQUE(serverId,name));
      CREATE TABLE IF NOT EXISTS moderations (serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, userId TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, expiresAt INTEGER, reason TEXT NOT NULL DEFAULT '', actorId TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(serverId,userId,kind));
      CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, serverId TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE, actorId TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, targetId TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '', createdAt TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_server ON audit_log(serverId,createdAt DESC);
      CREATE TABLE IF NOT EXISTS upload_sessions (id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, serverId TEXT REFERENCES servers(id) ON DELETE CASCADE, purpose TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, expiresAt INTEGER NOT NULL, completedFileId TEXT);
      CREATE TABLE IF NOT EXISTS user_badges (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, badge TEXT NOT NULL, PRIMARY KEY(userId,badge));`);
    addColumns('upload_sessions', { completedFileId: 'TEXT' });
    db.exec(`CREATE INDEX IF NOT EXISTS files_conversation ON files(conversationId);
      CREATE INDEX IF NOT EXISTS files_owner ON files(ownerId,purpose);
      CREATE INDEX IF NOT EXISTS member_lookup ON members(userId,serverId);
      CREATE INDEX IF NOT EXISTS channel_order ON channels(serverId,position,id);
      CREATE INDEX IF NOT EXISTS thread_history ON messages(conversationId,threadId,id);`);
    // Category names in earlier releases become real, ordered categories once.
    if (!db.prepare("SELECT 1 FROM app_settings WHERE key='categoriesMigrated'").get()) {
      const { randomUUID } = require('node:crypto');
      for (const row of db.prepare("SELECT serverId,category,min(position) AS position FROM channels WHERE category != '' GROUP BY serverId,category").all()) {
        db.prepare('INSERT OR IGNORE INTO categories VALUES (?,?,?,?)').run(`cat_${randomUUID()}`, row.serverId, row.category, row.position);
      }
      db.prepare("INSERT INTO app_settings VALUES ('categoriesMigrated','true')").run();
    }
    db.exec('PRAGMA user_version = 4');
  });
  transaction(db, () => {
    db.exec(`CREATE TABLE IF NOT EXISTS blocks (
      ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      targetId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL, PRIMARY KEY(ownerId,targetId), CHECK(ownerId != targetId)
    );
    CREATE INDEX IF NOT EXISTS block_target ON blocks(targetId,ownerId);
    PRAGMA user_version = 5;`);
  });
  transaction(db, () => {
    addColumns('servers', { defaultPermissions: "TEXT NOT NULL DEFAULT '{}'" });
    addColumns('server_roles', { deniedPermissions: "TEXT NOT NULL DEFAULT '[]'" });
    addColumns('channels', { cover: "TEXT NOT NULL DEFAULT ''" });
    addColumns('messages', { acceptedReplyId: 'TEXT REFERENCES messages(id) ON DELETE SET NULL' });
    // Preserve invitation-rotation grants from releases before the permission split.
    if (!db.prepare("SELECT 1 FROM app_settings WHERE key='permissionsV6'").get()) {
      for (const role of db.prepare('SELECT id,permissions FROM server_roles').all()) {
        const grants=JSON.parse(role.permissions);
        if(grants.includes('inviteMembers') && !grants.includes('manageInvites'))db.prepare('UPDATE server_roles SET permissions=? WHERE id=?').run(JSON.stringify([...grants,'manageInvites']),role.id);
      }
      db.prepare("INSERT INTO app_settings VALUES ('permissionsV6','true')").run();
    }
    db.exec('PRAGMA user_version = 6');
  });
  transaction(db, () => {
    addColumns('messages', { pinRevision: 'INTEGER NOT NULL DEFAULT 0' });
    db.exec(`CREATE TABLE IF NOT EXISTS user_preferences (
      userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      preferences TEXT NOT NULL DEFAULT '{}', revision INTEGER NOT NULL DEFAULT 0, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pin_counters (conversationId TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pin_reads (
      conversationId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(conversationId,userId)
    );
    PRAGMA user_version = 7;`);
  });
  transaction(db, () => {
    addColumns('users', { avatarCrop: "TEXT NOT NULL DEFAULT '{}'", bannerCrop: "TEXT NOT NULL DEFAULT '{}'" });
    addColumns('servers', { iconCrop: "TEXT NOT NULL DEFAULT '{}'", bannerCrop: "TEXT NOT NULL DEFAULT '{}'", ownerRolePosition: 'INTEGER NOT NULL DEFAULT 0', ownerRoleDisplay: 'INTEGER NOT NULL DEFAULT 0' });
    addColumns('channels', { coverCrop: "TEXT NOT NULL DEFAULT '{}'" });
    addColumns('server_roles', { iconCrop: "TEXT NOT NULL DEFAULT '{}'", position: 'INTEGER NOT NULL DEFAULT 0', displayMembers: 'INTEGER NOT NULL DEFAULT 0' });
    if (!db.prepare("SELECT 1 FROM app_settings WHERE key='channelTypesV8'").get()) {
      // Keep IDs, roots, replies, pins, covers and every file during simplification.
      db.exec("UPDATE channels SET type='forum' WHERE type='qa'; UPDATE channels SET type='media' WHERE type='resources';");
      for (const server of db.prepare('SELECT id FROM servers').all()) {
        db.prepare('SELECT id FROM server_roles WHERE serverId=? ORDER BY name,id').all(server.id).forEach((role, index) => db.prepare('UPDATE server_roles SET position=? WHERE id=?').run(index + 1, role.id));
      }
      db.prepare("INSERT INTO app_settings VALUES ('channelTypesV8','true')").run();
    }
    db.exec('PRAGMA user_version = 8');
  });
  transaction(db, () => {
    addColumns('audit_log', { metadata: "TEXT NOT NULL DEFAULT '{}'" });
    db.exec('PRAGMA user_version = 9');
  });
  transaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS account_security (
        userId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        email TEXT COLLATE NOCASE UNIQUE, verifiedAt INTEGER,
        pendingEmail TEXT, pendingAt INTEGER NOT NULL DEFAULT 0,
        resetRequestedAt INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS account_tokens (
        hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
        targetEmail TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS account_tokens_user ON account_tokens(userId,purpose);
      CREATE INDEX IF NOT EXISTS account_tokens_expiry ON account_tokens(expiresAt);
      CREATE TABLE IF NOT EXISTS recovery_codes (
        hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS recovery_codes_user ON recovery_codes(userId);
      PRAGMA user_version = 10;
    `);
  });
  transaction(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS support_recovery_tokens (
        hash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        passwordFingerprint TEXT NOT NULL, createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS support_recovery_user ON support_recovery_tokens(userId);
      CREATE INDEX IF NOT EXISTS support_recovery_expiry ON support_recovery_tokens(expiresAt);
      PRAGMA user_version = 11;
    `);
  });
  return db;
}

function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

module.exports = { openDatabase, transaction };
