'use strict';
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

// Inspect the container signature, never the supplied filename or Content-Type.
function isoMediaType(header) {
  if (header.length < 12 || header.subarray(4,8).toString() !== 'ftyp') return null;
  const brand = header.subarray(8,12).toString();
  if (brand === 'qt  ') return 'video/quicktime';
  if (['M4A ','M4B ','M4P '].includes(brand)) return 'audio/mp4';
  if (['isom','mp41','mp42','avc1','hvc1','hev1','av01','M4V ','MSNV','dash'].includes(brand) || /^iso[2-9]$/.test(brand)) return 'video/mp4';
  return null;
}

// Disk storage bounds memory regardless of the configured multi-gigabyte limit.
function installUploads(app, ctx) {
  const { db, config, onFileRemoved, onFileCommitted, auth, permission, HttpError, id, now, imageType, PROFILE_IMAGE_TYPES, limit, text } = ctx;
  const locks = new Set();
  const location = key => path.join(config.uploadPath, key);
  const remove = async key => {onFileRemoved?.(key);await fs.promises.rm(location(key),{force:true}).catch(()=>{});};
  const purposeFor = req => req.query.purpose === 'role' ? 'role' : req.query.purpose === 'channel' ? 'channel' : req.query.purpose === 'server' ? 'server' : req.query.purpose === 'profile' ? 'profile' : 'attachment';
  function validateTarget(req, purpose) {
    if (!['server','channel','role'].includes(purpose)) return null;
    const serverId = text(req.query.serverId, 80, 'Server ID', 1);
    permission(serverId, req.userId, purpose==='channel'?'manageChannels':purpose==='role'?'manageRoles':'manageServer'); return serverId;
  }
  const maximum = purpose => purpose === 'profile' ? config.maxProfileBytes : ['server','channel','role'].includes(purpose) ? config.maxServerImageBytes : config.maxUploadBytes;
  async function commit(file, ownerId, purpose, serverId) {
    const handle = await fs.promises.open(file.path, 'r'); const header = Buffer.alloc(48);
    try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
    const mime = imageType(header) || isoMediaType(header) || (header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) ? 'video/webm' : header.subarray(0,4).toString()==='OggS' ? 'audio/ogg' : header.subarray(0,3).toString()==='ID3' || header[0]===255&&(header[1]&0xe0)===0xe0 ? 'audio/mpeg' : header.subarray(0,4).toString()==='RIFF'&&header.subarray(8,12).toString()==='WAVE' ? 'audio/wav' : 'application/octet-stream');
    if (file.size > maximum(purpose) || purpose !== 'attachment' && !PROFILE_IMAGE_TYPES.has(mime)) throw new HttpError(400, 'Choose a PNG, JPEG, WebP or GIF within the image limit.');
    const fileId = id('f');
    await fs.promises.rename(file.path, location(fileId));
    try {
      db.prepare('INSERT INTO files (id,ownerId,serverId,purpose,name,mime,size,diskName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(fileId, ownerId, serverId, purpose, file.originalname, mime, file.size, fileId, now());
    } catch (error) { await remove(fileId); throw error; }
    onFileCommitted?.(db.prepare('SELECT * FROM files WHERE id=?').get(fileId));
    return { id: fileId, url: `/files/${fileId}`, name: file.originalname, type: mime, size: file.size };
  }
  const cleanName = name => text(name, 160, 'File name', 1).replace(/[\x00-\x1f\x7f/\\]/g, '_');
  const storage = multer.diskStorage({ destination: config.uploadPath, filename: (req, file, done) => done(null, `.upload-${id('tmp')}`) });
  const multipart = multer({ storage, limits: { fileSize: config.maxUploadBytes, files: config.maxAttachments, fields: 0, parts: config.maxAttachments } });
  app.post('/api/uploads', auth, (req, res, next) => {
    limit(`upload:${req.userId}`, config.uploadsPerMinute);
    req.uploadPurpose = purposeFor(req); req.uploadServerId = validateTarget(req, req.uploadPurpose);
    multipart.array('files', config.maxAttachments)(req, res, next);
  }, async (req, res) => {
    if (!req.files?.length) throw new HttpError(400, 'Choose a file to upload.');
    const completed = [];
    try {
      for (const file of req.files) completed.push(await commit({ ...file, originalname: cleanName(file.originalname) }, req.userId, req.uploadPurpose, req.uploadServerId));
      res.status(201).json({ files: completed });
    } catch (error) {
      for (const file of req.files) await fs.promises.rm(file.path, { force: true });
      for (const file of completed) { db.prepare('DELETE FROM files WHERE id=?').run(file.id); await remove(file.id); }
      throw error;
    }
  });
  app.post('/api/uploads/start', auth, (req, res) => {
    limit(`upload:${req.userId}`, config.uploadsPerMinute);
    const purpose = purposeFor(req), serverId = validateTarget(req, purpose);
    const name = cleanName(req.body.name), size = Number(req.body.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > maximum(purpose)) throw new HttpError(400, 'The file exceeds the configured 5 GB limit or is empty.');
    if (db.prepare('SELECT count(*) AS n FROM upload_sessions WHERE ownerId=? AND expiresAt>? AND completedFileId IS NULL').get(req.userId, Date.now()).n >= config.maxActiveUploads) throw new HttpError(429, 'Finish or cancel an upload before starting another.');
    const uploadId = id('upload');
    fs.closeSync(fs.openSync(location(`.${uploadId}`), 'wx'));
    db.prepare('INSERT INTO upload_sessions(id,ownerId,serverId,purpose,name,size,expiresAt) VALUES (?,?,?,?,?,?,?)').run(uploadId, req.userId, serverId, purpose, name, size, Date.now() + config.uploadExpiryMs);
    res.status(201).json({ id: uploadId, received: 0, chunkBytes: config.uploadChunkBytes });
  });
  function session(req) {
    const upload = db.prepare('SELECT * FROM upload_sessions WHERE id=? AND ownerId=? AND expiresAt>?').get(req.params.id, req.userId, Date.now());
    if (!upload) throw new HttpError(404, 'This upload expired. Select the file again.');
    if (upload.serverId) permission(upload.serverId, req.userId, 'manageServer');
    return upload;
  }
  const publicFile = file => { if(!file) throw new HttpError(410,'This attachment has already been removed.'); return {id:file.id,url:`/files/${file.id}`,name:file.name,type:file.mime,size:file.size}; };
  app.get('/api/uploads/:id', auth, (req, res) => { const upload = session(req); res.json({ id: upload.id, received: upload.received, size: upload.size, chunkBytes: config.uploadChunkBytes, ...(upload.completedFileId ? {files:[publicFile(db.prepare('SELECT * FROM files WHERE id=?').get(upload.completedFileId))]} : {}) }); });
  app.put('/api/uploads/:id/chunks', auth, (req, res, next) => {
    limit(`chunk:${req.userId}`, config.uploadChunksPerMinute);
    session(req);
    require('express').raw({ type: 'application/octet-stream', limit: config.uploadChunkBytes })(req, res, next);
  }, async (req, res) => {
    const upload = session(req), offset = Number(req.query.offset);
    if (upload.completedFileId) throw new HttpError(409,'This upload is already complete.');
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > config.uploadChunkBytes) throw new HttpError(400, 'Invalid upload chunk.');
    if (locks.has(upload.id)) throw new HttpError(409, 'Another chunk is being written. Retry this chunk.');
    if (!Number.isSafeInteger(offset) || offset !== upload.received || offset + req.body.length > upload.size) throw new HttpError(409, 'Upload position changed. Resume from the server position.');
    locks.add(upload.id);
    try {
      // Write at the acknowledged offset; a retry never appends duplicate bytes.
      const handle = await fs.promises.open(location(`.${upload.id}`), 'r+');
      try { let written = 0; while (written < req.body.length) { const result = await handle.write(req.body, written, req.body.length - written, offset + written); if (!result.bytesWritten) throw new Error('The upload could not be written.'); written += result.bytesWritten; } } finally { await handle.close(); }
      db.prepare('UPDATE upload_sessions SET received=?,expiresAt=? WHERE id=?').run(offset + req.body.length, Date.now() + config.uploadExpiryMs, upload.id);
      res.json({ received: offset + req.body.length });
    } finally { locks.delete(upload.id); }
  });
  app.post('/api/uploads/:id/complete', auth, async (req, res) => {
    const upload = session(req);
    if (upload.completedFileId) return res.json({files:[publicFile(db.prepare('SELECT * FROM files WHERE id=?').get(upload.completedFileId))]});
    if (locks.has(upload.id)) throw new HttpError(409, 'Wait for the current chunk to finish.');
    if (upload.received !== upload.size) throw new HttpError(409, 'The file is still uploading.');
    locks.add(upload.id);
    try {
      const file = await commit({ path: location(`.${upload.id}`), size: upload.size, originalname: upload.name }, upload.ownerId, upload.purpose, upload.serverId);
      db.prepare('UPDATE upload_sessions SET completedFileId=? WHERE id=?').run(file.id,upload.id); res.status(201).json({ files: [file] });
    } catch (error) { db.prepare('DELETE FROM upload_sessions WHERE id=?').run(upload.id); await remove(`.${upload.id}`); throw error; }
    finally { locks.delete(upload.id); }
  });
  app.delete('/api/uploads/:id', auth, async (req, res) => { const upload = session(req); if (locks.has(upload.id)) throw new HttpError(409, 'Wait for the current chunk to finish.'); db.prepare('DELETE FROM upload_sessions WHERE id=?').run(upload.id); await remove(`.${upload.id}`); res.json({ ok: true }); });
  app.delete('/api/files/:id', auth, async (req, res) => {
    const file = db.prepare("SELECT * FROM files WHERE id=? AND ownerId=? AND purpose='attachment' AND conversationId IS NULL").get(req.params.id,req.userId);
    if (!file) throw new HttpError(404,'Unsent attachment not found.');
    db.prepare('DELETE FROM files WHERE id=?').run(file.id); await remove(file.diskName); res.json({ok:true});
  });
  const janitor = setInterval(() => {
    for (const upload of db.prepare('SELECT id FROM upload_sessions WHERE expiresAt<?').all(Date.now())) if (!locks.has(upload.id)) {
      db.prepare('DELETE FROM upload_sessions WHERE id=?').run(upload.id); remove(`.${upload.id}`);
    }
    const cutoff = new Date(Date.now()-config.uploadExpiryMs).toISOString();
    for (const file of db.prepare(`SELECT f.* FROM files f WHERE f.conversationId IS NULL AND f.createdAt<?
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar='/files/'||f.id OR u.banner='/files/'||f.id)
      AND NOT EXISTS (SELECT 1 FROM servers s WHERE s.icon='/files/'||f.id OR s.banner='/files/'||f.id)
      AND NOT EXISTS (SELECT 1 FROM channels c WHERE c.cover='/files/'||f.id)
      AND NOT EXISTS (SELECT 1 FROM server_roles r WHERE r.icon='/files/'||f.id)`).all(cutoff)) {
      db.prepare('DELETE FROM files WHERE id=?').run(file.id); remove(file.diskName);
    }
  }, 60000); janitor.unref();
  return () => clearInterval(janitor);
}
module.exports = { installUploads, isoMediaType };
