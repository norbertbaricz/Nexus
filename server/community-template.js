'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { transaction } = require('./database');
const { PERMISSION_KEYS } = require('./permissions');
const { CHANNEL_TYPES, CHANNEL_ICONS } = require('./community');

// Generic, explicit importer. Personal content is supplied as data by the operator.
// An installation marker prevents restarts from undoing edits or explicit deletion.
function createCommunityInstaller(db, config) {
  function install(creatorId) {
    if (!creatorId || !config.communityTemplatePath) return null;
    const manifestPath = config.communityTemplatePath;
    if (!fs.existsSync(manifestPath)) throw new Error(`Community template not found: ${manifestPath}`);
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const bounded = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    if (!bounded(data.key, 80) || !/^[a-z0-9_-]+$/.test(data.key) || !bounded(data.name, 60) || !Array.isArray(data.categories) || !Array.isArray(data.channels) || !Array.isArray(data.roles)) throw new Error('Choose a valid community template.');
    const marker = `communityTemplate:${data.key}`;
    const installed = db.prepare('SELECT value FROM app_settings WHERE key=?').get(marker);
    const revision=Number.isInteger(data.revision)?data.revision:1;
    const appliedRevision=Number(db.prepare('SELECT value FROM app_settings WHERE key=?').get(`${marker}:revision`)?.value || 0);
    if(installed && (!db.prepare('SELECT 1 FROM servers WHERE id=?').get(installed.value) || appliedRevision>=revision))return installed.value;
    if (data.channels.length > config.maxChannels || data.roles.length > config.maxServerRoles || data.categories.length > config.maxCategories) throw new Error('The community template exceeds the server limits.');
    const base = path.dirname(manifestPath);
    const localFile = name => {
      const resolved = path.resolve(base, name);
      if (!resolved.startsWith(base + path.sep)) throw new Error('Template files must stay inside the setup folder.');
      return resolved;
    };
    const rules = data.rulesFile ? fs.readFileSync(localFile(data.rulesFile), 'utf8').trim() : '';
    if (rules.length > config.maxServerRulesLength) throw new Error('The community template rules exceed the configured limit.');
    const existing = installed ? db.prepare('SELECT * FROM servers WHERE id=? AND ownerId=?').get(installed.value,creatorId) : db.prepare('SELECT * FROM servers WHERE ownerId=? AND lower(name)=lower(?) ORDER BY createdAt,id LIMIT 1').get(creatorId, data.name);
    if(installed&&!existing)throw new Error('Only the bound creator can update this imported community.');
    const upgrading=Boolean(installed);
    const serverId = existing?.id || `s_${randomUUID()}`, copied = [];
    const now = new Date().toISOString();
    try {
      transaction(db, () => {
        if (!existing) db.prepare('INSERT INTO servers(id,name,description,ownerId,invite,createdAt,rules,publicListing,welcomeMessage,defaultNotifications,ownerRoleDisplay) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(serverId,data.name,String(data.description || '').slice(0,180),creatorId,randomBytes(12).toString('base64url'),now,rules,Number(data.publicListing === true),String(data.welcomeMessage || '').slice(0,500),'mentions',1);
        else if(!upgrading&&data.replaceExistingContent === true) db.prepare('UPDATE servers SET description=?,rules=?,publicListing=?,welcomeMessage=? WHERE id=?')
          .run(String(data.description || '').slice(0,180),rules,Number(data.publicListing === true),String(data.welcomeMessage || '').slice(0,500),serverId);
        else db.prepare("UPDATE servers SET rules=CASE WHEN rules='' THEN ? ELSE rules END, publicListing=?, welcomeMessage=CASE WHEN welcomeMessage='' THEN ? ELSE welcomeMessage END WHERE id=?")
          .run(rules,Number(data.publicListing === true),String(data.welcomeMessage || '').slice(0,500),serverId);
        db.prepare("INSERT OR IGNORE INTO members VALUES (?,?,'owner',?)").run(serverId,creatorId,now);
        for (const [kind, mime] of [['icon','image/png'],['banner','image/gif']]) if (data[kind] && (!existing?.[kind] || !upgrading&&data.replaceExistingContent === true)) {
          const bytes = fs.readFileSync(localFile(data[kind]));
          if (bytes.length > config.maxServerImageBytes) throw new Error('A community template image exceeds the configured limit.');
          const fileId = `f_${randomUUID()}`;
          fs.writeFileSync(path.join(config.uploadPath,fileId),bytes,{flag:'wx'}); copied.push(fileId);
          db.prepare('INSERT INTO files(id,ownerId,serverId,purpose,name,mime,size,diskName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(fileId,creatorId,serverId,'server',path.basename(data[kind]),mime,bytes.length,fileId,now);
          db.prepare(`UPDATE servers SET ${kind}=?,${kind}Crop=? WHERE id=?`).run(`/files/${fileId}`,JSON.stringify(data[`${kind}Crop`] || {x:50,y:50,zoom:1}),serverId);
        }
        const roles = new Map();
        data.roles.forEach((role,index) => {
          if (!bounded(role.name,config.maxRoleNameLength) || !/^#[0-9a-f]{6}$/i.test(role.color) || !CHANNEL_ICONS.has(role.icon) || !Array.isArray(role.permissions) || role.permissions.some(key=>!PERMISSION_KEYS.has(key))) throw new Error('Invalid role in community template.');
          const roleId = db.prepare('SELECT id FROM server_roles WHERE serverId=? AND name=?').get(serverId,role.name)?.id || `r_${randomUUID()}`;
          db.prepare('INSERT OR IGNORE INTO server_roles(id,serverId,name,color,permissions,icon,position,displayMembers) VALUES (?,?,?,?,?,?,?,?)')
            .run(roleId,serverId,role.name,role.color,JSON.stringify(role.permissions),role.icon,index+1,Number(role.displayMembers === true));
          roles.set(role.key,roleId);
        });
        for(const retired of data.retireRoles || []) {
          const replacement=roles.get(retired.replacement),previous=db.prepare('SELECT id FROM server_roles WHERE serverId=? AND name=?').get(serverId,retired.name);
          if(!replacement)throw new Error('A retired role needs a valid replacement in the manifest.');
          if(!previous||previous.id===replacement)continue;
          db.prepare('INSERT OR IGNORE INTO member_roles(serverId,userId,roleId) SELECT serverId,userId,? FROM member_roles WHERE serverId=? AND roleId=?').run(replacement,serverId,previous.id);
          for(const channel of db.prepare('SELECT id,allowedRoleIds FROM channels WHERE serverId=?').all(serverId))db.prepare('UPDATE channels SET allowedRoleIds=? WHERE id=?').run(JSON.stringify(JSON.parse(channel.allowedRoleIds).filter(roleId=>roleId!==previous.id)),channel.id);
          db.prepare('DELETE FROM server_roles WHERE id=?').run(previous.id);
        }
        if(upgrading) {
          const replacements=data.textReplacements || [],replace=value=>replacements.reduce((result,item)=>result.split(item.from).join(item.to),value);
          db.prepare('UPDATE servers SET rules=?,description=?,welcomeMessage=? WHERE id=?').run(replace(existing.rules),replace(existing.description),replace(existing.welcomeMessage),serverId);
          for(const post of db.prepare('SELECT m.id,m.text FROM messages m JOIN channels c ON c.id=m.conversationId WHERE c.serverId=? AND m.authorId=? AND m.pinned=1').all(serverId,creatorId))if(post.text.startsWith('# '+data.name+' community rules'))db.prepare('UPDATE messages SET text=?,editedAt=? WHERE id=?').run(replace(post.text),now,post.id);
        }
        data.categories.forEach((name,index)=>{
          if (!bounded(name,50)) throw new Error('Invalid category in community template.');
          db.prepare('INSERT OR IGNORE INTO categories VALUES (?,?,?,?)').run(`cat_${randomUUID()}`,serverId,name,index);
        });
        data.channels.forEach((channel,index)=>{
          if (!bounded(channel.name,40) || !CHANNEL_TYPES.has(channel.type) || !CHANNEL_ICONS.has(channel.icon || '') || !data.categories.includes(channel.category) || (channel.roles || []).some(key=>!roles.has(key))) throw new Error('Invalid channel in community template.');
          const present = db.prepare('SELECT id FROM channels WHERE serverId=? AND name=?').get(serverId,channel.name);
          if (present) return;
          const channelId = `c_${randomUUID()}`;
          db.prepare('INSERT INTO channels(id,serverId,name,type,topic,category,position,icon,readOnly,private,allowedRoleIds,slowmodeSeconds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            .run(channelId,serverId,channel.name,channel.type,String(channel.topic || '').slice(0,140),channel.category,index,channel.icon || '',Number(channel.readOnly === true || channel.type === 'announcement'),Number(Boolean(channel.roles?.length)),JSON.stringify((channel.roles || []).map(key=>roles.get(key))),channel.slowmodeSeconds || 0);
          if (channel.post) {
            const content = fs.readFileSync(localFile(channel.post),'utf8').trim();
            if (content.length > config.maxMessageLength) throw new Error('A template message exceeds the configured limit.');
            db.prepare('INSERT INTO messages(id,conversationId,authorId,text,createdAt,pinned,pinRevision) VALUES (?,?,?,?,?,1,1)').run(`m_${randomUUID()}`,channelId,creatorId,content,now);
            db.prepare('INSERT INTO pin_counters VALUES (?,1)').run(channelId);
          }
        });
        // The single persisted ID is the authority; matching names never grant a badge.
        db.prepare("INSERT OR IGNORE INTO app_settings VALUES ('officialServerId',?)").run(serverId);
        db.prepare('INSERT OR REPLACE INTO app_settings VALUES (?,?)').run(marker,serverId);
        db.prepare('INSERT OR REPLACE INTO app_settings VALUES (?,?)').run(`${marker}:revision`,String(revision));
        db.prepare("INSERT OR IGNORE INTO app_settings VALUES ('officialBindingV1','true')").run();
      });
    } catch (error) { for (const file of copied) fs.rmSync(path.join(config.uploadPath,file),{force:true}); throw error; }
    console.info('[Nexus] Community setup installed:', data.name);
    return serverId;
  }
  return { install };
}
module.exports = { createCommunityInstaller };
