'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { transaction } = require('./database');

// Destructive work is committed atomically in SQLite; disk bytes are removed after commit.
function installLifecycle(app, ctx) {
  const { db, config, auth, HttpError, checkPassword, COOKIE_NAME, limit, owner, serverUsers, relatedUsers, updateWorkspace, getIO, voice, leaveVoice, onCreatorDeleted, onAccountDeleted } = ctx;
  const conversationFiles = conversationId => db.prepare('SELECT diskName FROM files WHERE conversationId=?').all(conversationId).map(file=>file.diskName);
  function clearConversation(conversationId) {
    db.prepare('DELETE FROM messages WHERE conversationId=?').run(conversationId);
    db.prepare('DELETE FROM files WHERE conversationId=?').run(conversationId);
    db.prepare('DELETE FROM reads WHERE conversationId=?').run(conversationId);
    db.prepare('DELETE FROM pin_reads WHERE conversationId=?').run(conversationId);
    db.prepare('DELETE FROM pin_counters WHERE conversationId=?').run(conversationId);
  }
  function clearServer(serverId) {
    for (const channel of db.prepare('SELECT id FROM channels WHERE serverId=?').all(serverId)) clearConversation(channel.id);
    db.prepare('DELETE FROM files WHERE serverId=?').run(serverId);
    db.prepare("DELETE FROM app_settings WHERE key='officialServerId' AND value=?").run(serverId);
    db.prepare('DELETE FROM servers WHERE id=?').run(serverId);
    // Keep the installation marker: deleting a community must not resurrect it.
  }
  function serverRemoval(serverId) {
    const channels = db.prepare('SELECT id FROM channels WHERE serverId=?').all(serverId).map(channel=>channel.id);
    const files = [...db.prepare('SELECT diskName FROM files WHERE serverId=?').all(serverId).map(file=>file.diskName), ...channels.flatMap(conversationFiles), ...db.prepare('SELECT id FROM upload_sessions WHERE serverId=? AND completedFileId IS NULL').all(serverId).map(row=>`.${row.id}`)];
    return { channels, files };
  }
  function removeBytes(files) {
    for (const file of new Set(files)) {
      try { fs.rmSync(path.join(config.uploadPath,file),{force:true}); }
      catch (error) { console.error('[Nexus] Failed to remove deleted file:', file, error); }
    }
  }
  function notifyConversations(ids, reason) {
    const removed = new Set(ids), io = getIO();
    for (const socket of io?.sockets.sockets.values() || []) if (removed.has(voice.get(socket.id)?.conversationId)) { socket.emit('voice:removed',{reason}); leaveVoice(socket); }
    for (const conversationId of removed) {
      io?.to(`conversation:${conversationId}`).emit('conversation:deleted',{id:conversationId});
      io?.in(`conversation:${conversationId}`).socketsLeave(`conversation:${conversationId}`);
    }
  }
  app.delete('/api/servers/:id', auth, (req,res) => {
    owner(req.params.id,req.userId);
    const current = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
    if (req.body.confirmName !== current.name) throw new HttpError(400,'Type the exact server name to confirm deletion.');
    const users = serverUsers(current.id), removal = serverRemoval(current.id);
    // Disconnect before deleting channel records so membership publication can resolve them.
    notifyConversations(removal.channels,'This server was permanently deleted.');
    transaction(db,()=>clearServer(current.id)); removeBytes(removal.files);
    updateWorkspace(users); ctx.refreshUserBadges([req.userId], users); getIO()?.emit('discovery:updated',{}); res.json({ok:true});
  });
  app.delete('/api/account', auth, async (req,res) => {
    limit(`account-delete:${req.userId}`,config.authAttemptsPerMinute);
    const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    const supplied = typeof req.body.password === 'string' ? req.body.password : '';
    if (!supplied || supplied.length > config.maxPasswordLength || !await checkPassword(supplied,current.passwordHash)) throw new HttpError(403,'Enter your current password to delete your account.');
    if (String(req.body.confirmUsername || '').toLowerCase() !== current.username.toLowerCase()) throw new HttpError(400,'Type your permanent username to confirm deletion.');
    // Re-read after the password derivation: ownership could have changed in another tab.
    const owned = db.prepare('SELECT id,name FROM servers WHERE ownerId=?').all(req.userId);
    if (owned.length && req.body.deleteOwnedServers !== true) {
      const error = new HttpError(409,'Transfer ownership of your servers, or explicitly confirm deleting them with your account.');
      error.details = { ownedServers: owned }; throw error;
    }
    const users = relatedUsers(req.userId).filter(userId=>userId!==req.userId);
    const dms = db.prepare('SELECT conversationId FROM participants WHERE userId=?').all(req.userId).map(row=>row.conversationId);
    const removals = owned.map(server=>serverRemoval(server.id));
    const authored = db.prepare('SELECT id,conversationId FROM messages WHERE authorId=? OR threadId IN (SELECT id FROM messages WHERE authorId=?)').all(req.userId,req.userId);
    const orphanAttachments = authored.flatMap(message=>JSON.parse(db.prepare('SELECT attachments FROM messages WHERE id=?').get(message.id).attachments)).filter(file=>file.id).map(file=>file.id);
    const files = [...removals.flatMap(removal=>removal.files),...dms.flatMap(conversationFiles),...db.prepare('SELECT diskName FROM files WHERE ownerId=?').all(req.userId).map(row=>row.diskName),...db.prepare('SELECT id FROM upload_sessions WHERE ownerId=? AND completedFileId IS NULL').all(req.userId).map(row=>`.${row.id}`),...orphanAttachments.map(fileId=>db.prepare('SELECT diskName FROM files WHERE id=?').get(fileId)?.diskName).filter(Boolean)];
    notifyConversations([...dms,...removals.flatMap(removal=>removal.channels)],'This conversation was removed with a deleted account.');
    // End any shared voice participation before the account row disappears.
    for (const socket of getIO()?.sockets.sockets.values() || []) if(socket.userId===req.userId) leaveVoice(socket);
    const wasCreator = db.prepare("SELECT 1 FROM app_settings WHERE key='creatorUserId' AND value=?").get(req.userId);
    transaction(db,()=>{
      for (const server of owned) clearServer(server.id);
      for (const dm of dms) { clearConversation(dm);db.prepare('DELETE FROM conversations WHERE id=?').run(dm); }
      db.prepare('DELETE FROM messages WHERE authorId=?').run(req.userId);
      // Remove references to the deleting member's artwork, including images they uploaded for another server.
      for (const file of db.prepare('SELECT id FROM files WHERE ownerId=?').all(req.userId)) {
        const url=`/files/${file.id}`;
        for (const [table,columns] of [['servers',['icon','banner']],['channels',['cover']],['server_roles',['icon']]]) for (const column of columns) db.prepare(`UPDATE ${table} SET ${column}='' WHERE ${column}=?`).run(url);
      }
      for(const fileId of orphanAttachments)db.prepare('DELETE FROM files WHERE id=?').run(fileId);
      db.prepare('DELETE FROM files WHERE ownerId=?').run(req.userId);
      db.prepare('DELETE FROM reads WHERE userId=?').run(req.userId);
      db.prepare('DELETE FROM reactions WHERE userId=?').run(req.userId);
      db.prepare('DELETE FROM moderations WHERE userId=? OR actorId=?').run(req.userId,req.userId);
      db.prepare('DELETE FROM audit_log WHERE actorId=?').run(req.userId);
      if(wasCreator)db.prepare("DELETE FROM app_settings WHERE key IN ('creatorUserId','officialServerId')").run();
      db.prepare('DELETE FROM users WHERE id=?').run(req.userId);
    });
    if(wasCreator)onCreatorDeleted();onAccountDeleted?.(req.userId);removeBytes(files);
    for(const message of authored)getIO()?.to(`conversation:${message.conversationId}`).emit('message:deleted',{id:message.id,conversationId:message.conversationId});
    for(const socket of getIO()?.sockets.sockets.values() || [])if(socket.userId===req.userId){socket.emit('account:deleted');socket.disconnect(true);}
    updateWorkspace(users);getIO()?.emit('discovery:updated',{});
    res.clearCookie(COOKIE_NAME,{path:'/',secure:config.secureCookies,httpOnly:true,sameSite:'strict'});res.json({ok:true});
  });
}
module.exports = { installLifecycle };
