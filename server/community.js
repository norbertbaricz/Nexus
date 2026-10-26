'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { transaction } = require('./database');
const { createAudit, changedFields } = require('./audit');

// Deliberately small allowlists are shared with administration controls.
const CHANNEL_TYPES = new Set(['text', 'voice', 'announcement', 'forum', 'media', 'stage']);
const CHANNEL_ICONS = new Set(['', 'hash', 'voice', 'megaphone', 'chat', 'image', 'mic', 'star', 'book', 'code', 'game', 'music', 'heart', 'flag', 'shield', 'sparkle', 'folder', 'help', 'grid', 'list']);
const isForum = channel => channel.type === 'forum';
const isVoice = channel => ['voice', 'stage'].includes(channel.type);
function installCommunity(app, ctx) {
  const { db, config, auth, HttpError, id, now, text, member, owner, permission, serverUsers, refreshServerAccess, updateWorkspace, getIO, voice, leaveVoice } = ctx;
  const activity=createAudit(db,{id,now}),audit=activity.write;
  const activeModeration = (serverId, userId, kind) => db.prepare('SELECT * FROM moderations WHERE serverId=? AND userId=? AND kind=? AND (expiresAt IS NULL OR expiresAt>?)').get(serverId, userId, kind, Date.now());
  function moderationError(serverId, userId, kind) {
    const entry = activeModeration(serverId, userId, kind); if (!entry) return;
    const error = new HttpError(403, kind === 'ban' ? 'You are banned from this server.' : 'You are temporarily muted in this server.');
    error.details = { moderation: { kind, reason: entry.reason, expiresAt: entry.expiresAt, permanent: entry.expiresAt === null, serverId, serverName: db.prepare('SELECT name FROM servers WHERE id=?').get(serverId)?.name || 'Server' } };
    throw error;
  }
  function checkBan(serverId, userId) { moderationError(serverId, userId, 'ban'); }
  function checkMute(channel, userId) { if (channel.serverId) moderationError(channel.serverId, userId, 'mute'); }
  function removeMember(serverId, userId, reason) {
    const users = serverUsers(serverId);
    db.prepare('DELETE FROM members WHERE serverId=? AND userId=?').run(serverId, userId);
    refreshServerAccess(serverId);
    for (const socket of getIO()?.sockets.sockets.values() || []) if (socket.userId === userId && voice.get(socket.id)?.conversationId && db.prepare('SELECT 1 FROM channels WHERE id=? AND serverId=?').get(voice.get(socket.id).conversationId, serverId)) { socket.emit('voice:removed', { reason }); leaveVoice(socket); }
    updateWorkspace(users);
  }
  app.post('/api/servers/:id/leave', auth, (req, res) => {
    const current = member(req.params.id, req.userId);
    if (current.role === 'owner') throw new HttpError(400, 'Transfer ownership before leaving your server.');
    audit(req.params.id, req.userId, 'member.left', req.userId); removeMember(req.params.id, req.userId, 'You left the server.'); res.json({ ok: true });
  });
  app.post('/api/servers/:id/transfer', auth, (req, res) => {
    owner(req.params.id, req.userId); const target = member(req.params.id, req.body.userId);
    if (target.userId === req.userId) throw new HttpError(400, 'Choose another member.');
    transaction(db, () => { db.prepare("UPDATE members SET role='member' WHERE serverId=? AND userId=?").run(req.params.id, req.userId); db.prepare("UPDATE members SET role='owner' WHERE serverId=? AND userId=?").run(req.params.id, target.userId); db.prepare('UPDATE servers SET ownerId=? WHERE id=?').run(target.userId, req.params.id); });
    audit(req.params.id, req.userId, 'ownership.transferred', target.userId); refreshServerAccess(req.params.id); updateWorkspace(serverUsers(req.params.id)); res.json({ ok: true });
  });
  app.get('/api/servers/:id/moderation', auth, (req, res) => {
    member(req.params.id,req.userId);if(!['moderateMembers','kickMembers','banMembers','timeoutMembers','disconnectMembers'].some(key=>ctx.hasPermission(req.params.id,req.userId,key)))throw new HttpError(403,'You do not have moderation permission.'); res.json({ entries: db.prepare('SELECT m.*,u.displayName,u.username FROM moderations m JOIN users u ON u.id=m.userId WHERE m.serverId=? AND (m.expiresAt IS NULL OR m.expiresAt>?)').all(req.params.id, Date.now()) });
  });
  app.post('/api/servers/:id/moderation', auth, (req, res) => {
    const userId = text(req.body.userId, 80, 'User ID', 1), kind = req.body.kind;
    permission(req.params.id,req.userId,({kick:'kickMembers',ban:'banMembers',unban:'banMembers',mute:'timeoutMembers',unmute:'timeoutMembers',disconnect:'disconnectMembers'})[kind] || 'moderateMembers');
    if (!['kick', 'ban', 'mute', 'unban', 'unmute', 'disconnect'].includes(kind)) throw new HttpError(400, 'Choose a moderation action.');
    if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId))throw new HttpError(404,'User not found.');
    const server = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
    if (userId === server.ownerId || userId === req.userId) throw new HttpError(403, 'You cannot moderate the owner or yourself.');
    const target = db.prepare('SELECT * FROM members WHERE serverId=? AND userId=?').get(server.id, userId);
    if (!target && !['unban', 'unmute', 'ban'].includes(kind)) throw new HttpError(404, 'Member not found.');
    if (target && req.userId !== server.ownerId && ['moderateMembers','kickMembers','banMembers','timeoutMembers','disconnectMembers','manageRoles','manageServer','manageChannels'].some(key=>ctx.hasPermission(server.id,userId,key))) throw new HttpError(403, 'Only the owner can moderate another moderator.');
    if(kind==='disconnect' && ![...voice.values()].some(peer=>peer.userId===userId&&db.prepare('SELECT 1 FROM channels WHERE id=? AND serverId=?').get(peer.conversationId,server.id)))throw new HttpError(400,'This member is not connected to voice or stage in this server.');
    const reason = text(req.body.reason || '', 300, 'Reason');
    let expiresAt = null;
    if (['ban', 'mute'].includes(kind)) {
      const hours = Number(req.body.hours || 0);
      if (!Number.isFinite(hours) || hours < 0 || hours > config.maxModerationHours || kind === 'mute' && hours === 0) throw new HttpError(400, 'Choose a valid duration. Mutes need an end time.');
      expiresAt = hours ? Date.now() + hours * 3600000 : null;
      db.prepare('INSERT OR REPLACE INTO moderations VALUES (?,?,?,?,?,?)').run(server.id, userId, kind, expiresAt, reason, req.userId);
    }
    if (kind === 'unban' || kind === 'unmute') db.prepare('DELETE FROM moderations WHERE serverId=? AND userId=? AND kind=?').run(server.id, userId, kind.slice(2));
    audit(server.id, req.userId, `member.${kind}`, userId, reason, {changes:['ban','mute'].includes(kind)?[{label:'Duration',before:'Unrestricted',after:expiresAt?`Until ${new Date(expiresAt).toISOString()}`:'Permanent'}]:[]});
    if (kind === 'kick' || kind === 'ban') removeMember(server.id, userId, 'Your server membership changed.');
    if (kind === 'disconnect' || kind === 'mute') for (const socket of getIO()?.sockets.sockets.values() || []) if (socket.userId === userId) {
      const current = voice.get(socket.id); if (current && db.prepare('SELECT 1 FROM channels WHERE id=? AND serverId=?').get(current.conversationId, server.id)) { socket.emit('voice:removed', { conversationId: current.conversationId, reason: kind === 'mute' ? 'You were temporarily muted in this server.' : 'A moderator disconnected you from voice.' }); leaveVoice(socket); }
    }
    updateWorkspace(serverUsers(server.id)); res.json({ ok: true, expiresAt });
  });
  app.get('/api/servers/:id/audit', auth, (req, res) => { permission(req.params.id, req.userId, 'viewAuditLog'); res.json({ entries: activity.list(req.params.id) }); });
  app.post('/api/servers/:id/categories', auth, (req, res) => {
    permission(req.params.id, req.userId, 'manageChannels'); const name = text(req.body.name, 50, 'Category name', 1);
    if (db.prepare('SELECT count(*) AS n FROM categories WHERE serverId=?').get(req.params.id).n >= config.maxCategories) throw new HttpError(400, 'Category limit reached.');
    if (db.prepare('SELECT 1 FROM categories WHERE serverId=? AND name=?').get(req.params.id, name)) throw new HttpError(409, 'This category name is already used.');
    const categoryId = id('cat'), position = db.prepare('SELECT coalesce(max(position),0)+1 AS n FROM categories WHERE serverId=?').get(req.params.id).n;
    db.prepare('INSERT INTO categories VALUES (?,?,?,?)').run(categoryId, req.params.id, name, position); audit(req.params.id, req.userId, 'category.created', categoryId, name); updateWorkspace(serverUsers(req.params.id)); res.status(201).json({ id: categoryId });
  });
  app.patch('/api/categories/:id', auth, (req, res) => {
    const category = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id); if (!category) throw new HttpError(404, 'Category not found.');
    permission(category.serverId, req.userId, 'manageChannels'); const name = text(req.body.name ?? category.name, 50, 'Category name', 1);
    if (db.prepare('SELECT 1 FROM categories WHERE serverId=? AND name=? AND id!=?').get(category.serverId, name, category.id)) throw new HttpError(409, 'This category name is already used.');
    transaction(db, () => { db.prepare('UPDATE channels SET category=? WHERE serverId=? AND category=?').run(name, category.serverId, category.name); db.prepare('UPDATE categories SET name=? WHERE id=?').run(name, category.id); });
    audit(category.serverId, req.userId, 'category.updated', category.id, '', {targetName:name,changes:changedFields(category,{name})}); updateWorkspace(serverUsers(category.serverId)); res.json({ ok: true });
  });
  app.delete('/api/categories/:id', auth, (req, res) => {
    const category = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id); if (!category) throw new HttpError(404, 'Category not found.');
    permission(category.serverId, req.userId, 'manageChannels'); transaction(db, () => { db.prepare("UPDATE channels SET category='' WHERE serverId=? AND category=?").run(category.serverId, category.name); db.prepare('DELETE FROM categories WHERE id=?').run(category.id); });
    audit(category.serverId, req.userId, 'category.deleted', category.id, '', {targetName:category.name}); updateWorkspace(serverUsers(category.serverId)); res.json({ ok: true });
  });
  app.put('/api/servers/:id/layout', auth, (req, res) => {
    permission(req.params.id, req.userId, 'manageChannels'); const { categories, channels } = req.body;
    const existingCategories = db.prepare('SELECT * FROM categories WHERE serverId=?').all(req.params.id), existingChannels = db.prepare('SELECT * FROM channels WHERE serverId=?').all(req.params.id);
    function exactIds(values, existing) { return Array.isArray(values) && values.length === existing.length && new Set(values.map(item => item.id)).size === existing.length && values.every(item => existing.some(row => row.id === item.id)); }
    if (!exactIds(categories, existingCategories) || !exactIds(channels, existingChannels) || channels.some(channel => typeof channel.category !== 'string' || channel.category && !existingCategories.some(row => row.name === channel.category))) throw new HttpError(400, 'Reload before rearranging the server layout.');
    transaction(db, () => { categories.forEach((category, i) => db.prepare('UPDATE categories SET position=? WHERE id=?').run(i, category.id)); channels.forEach((channel, i) => db.prepare('UPDATE channels SET position=?,category=? WHERE id=?').run(i, channel.category, channel.id)); });
    const changes=[...categories.flatMap((item,index)=>{const before=existingCategories.find(row=>row.id===item.id);return before.position===index?[]:[{label:`Category ${before.name}`,before:`Position ${before.position+1}`,after:`Position ${index+1}`}];}),...channels.flatMap((item,index)=>{const before=existingChannels.find(row=>row.id===item.id);return before.position===index&&before.category===item.category?[]:[{label:`Channel ${before.name}`,before:`${before.category||'Outside categories'} · position ${before.position+1}`,after:`${item.category||'Outside categories'} · position ${index+1}`}];})];
    audit(req.params.id, req.userId, 'layout.updated', '', '', {changes}); updateWorkspace(serverUsers(req.params.id)); res.json({ ok: true });
  });
  app.delete('/api/dms/:id', auth, (req, res) => {
    if (!db.prepare('SELECT 1 FROM participants WHERE conversationId=? AND userId=?').get(req.params.id, req.userId)) throw new HttpError(404, 'Conversation not found.');
    const users = db.prepare('SELECT userId FROM participants WHERE conversationId=?').all(req.params.id).map(row => row.userId), files = db.prepare('SELECT diskName FROM files WHERE conversationId=?').all(req.params.id);
    for (const socket of getIO()?.sockets.sockets.values() || []) if (voice.get(socket.id)?.conversationId === req.params.id) { socket.emit('voice:removed', { conversationId: req.params.id, reason: 'This conversation was deleted.' }); leaveVoice(socket); }
    transaction(db, () => { db.prepare('DELETE FROM messages WHERE conversationId=?').run(req.params.id); db.prepare('DELETE FROM files WHERE conversationId=?').run(req.params.id); db.prepare('DELETE FROM reads WHERE conversationId=?').run(req.params.id); db.prepare('DELETE FROM pin_reads WHERE conversationId=?').run(req.params.id); db.prepare('DELETE FROM pin_counters WHERE conversationId=?').run(req.params.id); db.prepare('DELETE FROM conversations WHERE id=?').run(req.params.id); });
    for (const file of files) fs.rmSync(path.join(config.uploadPath, file.diskName), { force: true });
    getIO()?.to(`conversation:${req.params.id}`).emit('conversation:deleted', { id: req.params.id }); getIO()?.in(`conversation:${req.params.id}`).socketsLeave(`conversation:${req.params.id}`); updateWorkspace(users); res.json({ ok: true });
  });
  return { activeModeration, checkBan, checkMute, audit };
}
module.exports = { installCommunity, CHANNEL_TYPES, CHANNEL_ICONS, isVoice, isForum };
