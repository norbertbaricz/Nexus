'use strict';
const {randomBytes,createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {transaction}=require('./database');
const {normalizeLoginUsername}=require('./auth');
const {recoveryOrigin}=require('./mailer');

// Privileged host-only issuance; never expose this module through an HTTP route.
const SUPPORT_RECOVERY_CONFIG=Object.freeze({tokenBytes:32,linkMinutes:15,filePrefix:'nexus-recovery-',directoryName:'recovery-links'});
const tokenHash=token=>createHash('sha256').update('host-recovery:'+token).digest('hex');
const passwordFingerprint=value=>createHash('sha256').update(value).digest('hex');
function supportRecoveryRecord(db,token,now=Date.now()){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(token))return null;
 const record=db.prepare('SELECT t.*,u.passwordHash FROM support_recovery_tokens t JOIN users u ON u.id=t.userId WHERE t.hash=? AND t.expiresAt>?').get(tokenHash(token),now);
 return record&&record.passwordFingerprint===passwordFingerprint(record.passwordHash)?record:null;
}
function issueSupportRecovery(db,config,{userId,confirmUsername,identityVerified,origin=config.publicOrigin}={}){
 if(identityVerified!==true)throw new Error('Independently verify account ownership before issuing a recovery link.');
 if(typeof userId!=='string'||userId.length>100)throw new Error('Provide the exact immutable account ID.');
 const user=db.prepare('SELECT id,username,passwordHash FROM users WHERE id=?').get(userId);
 if(!user||normalizeLoginUsername(confirmUsername)!==user.username.toLowerCase())throw new Error('The account ID and confirmed permanent username do not match.');
 const trustedOrigin=recoveryOrigin(origin);if(!trustedOrigin)throw new Error('Set PUBLIC_ORIGIN to your trusted HTTPS website origin before issuing a link.');
 const minutes=config.recovery?.supportTokenMinutes??SUPPORT_RECOVERY_CONFIG.linkMinutes;
 if(!Number.isInteger(minutes)||minutes<1||minutes>60)throw new Error('Support recovery expiry must be between 1 and 60 minutes.');
 const directory=path.join(fs.realpathSync(path.dirname(config.databasePath)),SUPPORT_RECOVERY_CONFIG.directoryName);
 const inside=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
 const publicRoots=[path.resolve(__dirname,'../public'),...(config.uploadPath?[path.resolve(config.uploadPath)]:[])].map(root=>fs.existsSync(root)?fs.realpathSync(root):root);
 if(publicRoots.some(root=>inside(root,directory)))throw new Error('Private recovery links cannot be written inside public or upload storage. Move the database to private storage first.');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 if(fs.lstatSync(directory).isSymbolicLink())throw new Error('The private recovery directory must not be a symbolic link.');
 const token=randomBytes(SUPPORT_RECOVERY_CONFIG.tokenBytes).toString('base64url'),now=Date.now(),expiresAt=now+minutes*60000;
 const file=path.join(directory,SUPPORT_RECOVERY_CONFIG.filePrefix+randomBytes(12).toString('hex')+'.txt');
 const content=`Nexus private account recovery\nAccount ID: ${user.id}\nUsername: @${user.username}\nExpires: ${new Date(expiresAt).toISOString()}\n\n${trustedOrigin}/#reset-password=${token}\n\nShare only with the independently verified account owner through a private channel.\nThis single-use link can reset the password. Delete this file after the handoff.\nA host-assisted reset revokes all sessions and previous recovery methods.\n`;
 let written=false;
 try{
  transaction(db,()=>{
   // Issuance does not change the password or revoke any current session.
   db.prepare('DELETE FROM support_recovery_tokens WHERE userId=? OR expiresAt<=?').run(user.id,now);
   db.prepare('INSERT INTO support_recovery_tokens VALUES (?,?,?,?,?)').run(tokenHash(token),user.id,passwordFingerprint(user.passwordHash),now,expiresAt);
   fs.writeFileSync(file,content,{encoding:'utf8',flag:'wx',mode:0o600});written=true;
  });
 }catch(error){if(written)fs.rmSync(file,{force:true});throw error;}
 return {userId:user.id,username:user.username,file,expiresAt};
}
function revokeSupportRecovery(db,userId){return db.prepare('DELETE FROM support_recovery_tokens WHERE userId=?').run(userId).changes;}
module.exports={SUPPORT_RECOVERY_CONFIG,supportRecoveryRecord,issueSupportRecovery,revokeSupportRecovery};
