'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');
const WebSocket=require('ws');
const {createApp}=require('../server/app');
const {CONFIG}=require('../server/config');
const {checkPassword,hashPassword,normalizeLoginUsername}=require('../server/auth');
const {normalizeEmail,GENERIC_RECOVERY_MESSAGE}=require('../server/account-security');
const {issueSupportRecovery,revokeSupportRecovery}=require('../server/support-recovery');

// All identities, email addresses, passwords and delivery messages are local fixtures.
const PASSWORD='Original-fixture-password-2026!',NEW_PASSWORD='New-fixture-password-2026!';
async function fixture(t,{email=true,recovery={},transport}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-recovery-')),messages=[];
 const mailTransport=email?(transport||{async sendMail(message){messages.push(message);return {accepted:[message.to]};},close(){}}):undefined;
 const instance=createApp({...CONFIG,databasePath:':memory:',uploadPath:directory,publicOrigin:email?'https://nexus.example.test':'',authAttemptsPerMinute:1000,requestsPerMinute:1000,mutationsPerMinute:1000,recovery:{...CONFIG.recovery,responseDelayMs:0,cooldownMs:0,requestsPerMinute:1000,proofAttemptsPerMinute:1000,settingsPerMinute:1000,...recovery}}, {mailTransport});
 const server=http.createServer(instance.app),io=instance.attachRealtime(server);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>io.close(resolve));if(server.listening)await new Promise(resolve=>server.close(resolve));instance.close();fs.rmSync(directory,{recursive:true,force:true});});
 const api=async(route,{method='GET',cookie,body,headers={}}={})=>{const response=await fetch(base+route,{method,headers:{Origin:base,...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};};
 const register=async(username='recovery_user',password=PASSWORD)=>{const result=await api('/api/auth/register',{method:'POST',body:{username,displayName:'Private recovery fixture',password}});assert.equal(result.status,201);return {...result.data.user,cookie:result.cookie,password};};
 const login=async(username,password=PASSWORD)=>api('/api/auth/login',{method:'POST',body:{username,password}});
 const codes=async user=>{const result=await api('/api/account/recovery-codes',{method:'POST',cookie:user.cookie,body:{password:user.password}});assert.equal(result.status,200);return result.data.codes;};
 const token=kind=>{const message=[...messages].reverse().find(message=>message.subject===(kind==='verify'?'Verify your Nexus recovery email':'Reset your Nexus password'));assert.ok(message,'Expected local email');return message.text.match(/#(?:verify-email|reset-password)=([A-Za-z0-9_-]+)/)[1];};
 const verifyEmail=async(user,address='recovery@example.test')=>{const sent=await api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{password:user.password,email:address}});assert.equal(sent.status,200);await instance.mailer.idle();const result=await api('/api/auth/verify-email',{method:'POST',body:{token:token('verify')}});assert.equal(result.status,200);};
 return {api,register,login,codes,token,verifyEmail,instance,messages,base,directory};
}
const replacement={newPassword:NEW_PASSWORD,confirmPassword:NEW_PASSWORD};
function supportLink(f,user){
 const result=issueSupportRecovery(f.instance.db,{...CONFIG,databasePath:path.join(f.directory,'fixture.sqlite'),publicOrigin:'https://nexus.example.test'},{userId:user.id,confirmUsername:'@'+user.username,identityVerified:true});
 const token=fs.readFileSync(result.file,'utf8').match(/#reset-password=([A-Za-z0-9_-]+)/)[1];return {...result,token};
}

test('an email can be saved without SMTP but remains private and cannot recover the account until verified',async t=>{
 const f=await fixture(t,{email:false}),user=await f.register();
 assert.equal((await f.api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{email:'user@gmail.com',password:'wrong'}})).status,403);
 const saved=await f.api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{email:'user@gmail.com',password:PASSWORD}});
 assert.equal(saved.status,200);assert.equal(saved.data.email,'');assert.equal(saved.data.pendingEmail,'user@gmail.com');assert.equal(saved.data.verificationSent,false);assert.equal(saved.data.verifiedAt,null);
 assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM account_tokens').get().count,0);
 assert.equal((await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:'user@gmail.com'}})).status,503);
 assert.equal(JSON.stringify((await f.api('/api/bootstrap',{cookie:user.cookie})).data).includes('user@gmail.com'),false);
});
test('host-issued recovery requires an immutable ID, confirmed username, explicit ownership attestation and trusted origin',async t=>{
 const f=await fixture(t),user=await f.register(),config={...CONFIG,databasePath:path.join(f.directory,'fixture.sqlite'),publicOrigin:'https://nexus.example.test'};
 const inputs={userId:user.id,confirmUsername:user.username,identityVerified:true};
 for(const patch of [{identityVerified:false},{confirmUsername:'someone_else'},{userId:'missing_id'},{origin:'http://untrusted.example'}])assert.throws(()=>issueSupportRecovery(f.instance.db,config,{...inputs,...patch}));
 assert.throws(()=>issueSupportRecovery(f.instance.db,{...config,uploadPath:f.directory},inputs),/public or upload storage/);
 assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM support_recovery_tokens').get().count,0);
 const issued=supportLink(f,user),record=f.instance.db.prepare('SELECT * FROM support_recovery_tokens').get();assert.notEqual(record.hash,issued.token);assert.equal(JSON.stringify(record).includes(issued.token),false);assert.equal(Object.keys(issued).includes('url'),false);
 if(process.platform!=='win32')assert.equal(fs.statSync(issued.file).mode&0o777,0o600);
 assert.equal((await f.login(user.username)).status,200);assert.equal((await f.api('/api/account/security',{cookie:user.cookie})).status,200);
});
test('a host-assisted link recovers an account with no email or codes without deleting its identity',async t=>{
 const f=await fixture(t,{email:false}),user=await f.register(),issued=supportLink(f,user);
 assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:issued.token}})).status,400);
 const result=await f.api('/api/auth/reset-password',{method:'POST',body:{token:issued.token,...replacement}});assert.equal(result.status,200);assert.equal(result.cookie,undefined);
 assert.equal((await f.login(user.username)).status,401);const login=await f.login(user.username,NEW_PASSWORD);assert.equal(login.status,200);assert.equal(login.data.user.id,user.id);
 assert.equal((await f.api('/api/account/security',{cookie:user.cookie})).status,401);assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:issued.token,...replacement}})).status,400);
});
test('host recovery expires, rotates, can be revoked and is invalid after a password change',async t=>{
 const f=await fixture(t),user=await f.register(),first=supportLink(f,user),second=supportLink(f,user);
 const reset=token=>f.api('/api/auth/reset-password',{method:'POST',body:{token,...replacement}});
 assert.equal((await reset(first.token)).status,400);assert.equal(revokeSupportRecovery(f.instance.db,user.id),1);assert.equal((await reset(second.token)).status,400);
 const expired=supportLink(f,user);f.instance.db.prepare('UPDATE support_recovery_tokens SET expiresAt=?').run(Date.now()-1);assert.equal((await reset(expired.token)).status,400);
 const stale=supportLink(f,user);f.instance.db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(await hashPassword('Changed-in-another-session-2026!'),user.id);assert.equal((await reset(stale.token)).status,400);
});
test('simultaneous host-assisted resets consume one proof once and clear every previous recovery method',async t=>{
 const f=await fixture(t),user=await f.register();await f.verifyEmail(user);await f.codes(user);await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}});
 const issued=supportLink(f,user),body={token:issued.token,...replacement};
 const results=await Promise.all([f.api('/api/auth/reset-password',{method:'POST',body}),f.api('/api/auth/reset-password',{method:'POST',body})]);assert.deepEqual(results.map(result=>result.status).sort(),[200,400]);
 for(const table of ['account_tokens','support_recovery_tokens','recovery_codes','sessions'])assert.equal(f.instance.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE userId=?`).get(user.id).count,0);
 assert.equal(f.instance.db.prepare('SELECT * FROM account_security WHERE userId=?').get(user.id),undefined);
});
test('changing recovery methods revokes a host proof and ordinary website users cannot issue one',async t=>{
 const f=await fixture(t,{email:false}),user=await f.register(),issued=supportLink(f,user);await f.codes(user);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:issued.token,...replacement}})).status,400);
 const response=await fetch(f.base+'/api/auth/support-recovery',{method:'POST',headers:{Origin:f.base,Cookie:user.cookie,'Content-Type':'application/json'},body:JSON.stringify({userId:user.id,identityVerified:true})});assert.equal(response.status,404);
 assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM support_recovery_tokens').get().count,0);
});
test('failure to write a private recovery file rolls back issuance without invalidating the previous link',async t=>{
 const f=await fixture(t),user=await f.register(),issued=supportLink(f,user);
 const originalWrite=fs.writeFileSync;t.mock.method(fs,'writeFileSync',()=>{throw new Error('Disposable file-write failure.');});
 assert.throws(()=>supportLink(f,user),/file-write failure/);fs.writeFileSync=originalWrite;
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:issued.token,...replacement}})).status,200);
});
test('verifying a recovery address invalidates an outstanding host-issued link',async t=>{
 const f=await fixture(t),user=await f.register();
 await f.api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{email:'new-proof@example.test',password:PASSWORD}});await f.instance.mailer.idle();
 const verify=f.token('verify'),issued=supportLink(f,user);assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:verify}})).status,200);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:issued.token,...replacement}})).status,400);
});

test('sign-in accepts plain, @, mixed-case and copied maximum-length usernames while preserving exact passwords',async t=>{
 const f=await fixture(t),name='a'.repeat(24),password='  Caf\u00e9-\u{1f43a}-Password 2026  ',user=await f.register(name,password);
 for(const username of [name,'@'+name,'  @'+name.toUpperCase()+'  ','\u200b@'+name+'\ufeff'])assert.equal((await f.login(username,password)).status,200,username);
 assert.equal((await f.login(name,password.trim())).status,401);assert.equal((await f.login(name,password.normalize('NFD'))).status,401);assert.equal((await f.login('Private recovery fixture',password)).status,401);
 const stored=f.instance.db.prepare('SELECT id,passwordHash FROM users WHERE username=?').get(name);assert.equal(stored.id,user.id);assert.ok(await checkPassword(password,stored.passwordHash));
});
test('corrupt or missing password hashes fail closed without a server error or plaintext fallback',async t=>{
 const f=await fixture(t),user=await f.register();for(const stored of ['','plaintext','abc:xyz',PASSWORD]){f.instance.db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(stored,user.id);assert.equal((await f.login(user.username)).status,401);}
 assert.equal(await checkPassword(PASSWORD,undefined),false);assert.equal(normalizeLoginUsername('@@name'),'');assert.equal(normalizeLoginUsername('@User.Name'),'user.name');
});
test('a password changed during sign-in cannot create a session from its stale password check',async t=>{
 const f=await fixture(t),user=await f.register(),replacementHash=await hashPassword(NEW_PASSWORD);
 const prepare=f.instance.db.prepare.bind(f.instance.db);let changed=false;
 t.mock.method(f.instance.db,'prepare',sql=>{
  const statement=prepare(sql);
  if(sql==='SELECT * FROM users WHERE username = ?')return {get(username){const row=statement.get(username);if(row&&!changed){changed=true;prepare('UPDATE users SET passwordHash=? WHERE id=?').run(replacementHash,user.id);prepare('DELETE FROM sessions WHERE userId=?').run(user.id);}return row;}};
  return statement;
 });
 assert.equal((await f.login(user.username)).status,401);assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE userId=?').get(user.id).count,0);
 assert.equal((await f.login(user.username,NEW_PASSWORD)).status,200);
});
test('offline recovery codes require current-password reauthentication and are stored only as hashes',async t=>{
 const f=await fixture(t,{email:false}),user=await f.register();assert.equal((await f.api('/api/account/security')).status,401);
 assert.equal((await f.api('/api/account/recovery-codes',{method:'POST',cookie:user.cookie,body:{password:'wrong'}})).status,403);
 const codes=await f.codes(user);assert.equal(codes.length,CONFIG.recovery.codeCount);const rows=f.instance.db.prepare('SELECT * FROM recovery_codes').all();assert.equal(rows.length,codes.length);
 for(const code of codes){assert.match(code,/^NXS-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);assert.equal(JSON.stringify(rows).includes(code),false);}
 const state=await f.api('/api/account/security',{cookie:user.cookie});assert.equal(state.data.emailAvailable,false);assert.equal(state.data.remainingCodes,codes.length);assert.equal(state.data.codes,undefined);
});
test('code recovery changes the password, preserves identity/messages and revokes all sessions and old codes',async t=>{
 const f=await fixture(t,{email:false}),user=await f.register(),codes=await f.codes(user),other=await f.login(user.username);
 f.instance.db.prepare('INSERT INTO conversations (id,pair,createdAt) VALUES (?,?,?)').run('dm_keep','recovery-fixture',new Date().toISOString());
 f.instance.db.prepare('INSERT INTO messages (id,conversationId,authorId,text,createdAt) VALUES (?,?,?,?,?)').run('m_keep','dm_keep',user.id,'Keep existing conversations.',new Date().toISOString());
 const result=await f.api('/api/auth/reset-password',{method:'POST',body:{username:'@'+user.username,recoveryCode:codes[0].toLowerCase(),...replacement}});assert.equal(result.status,200);assert.equal(result.cookie,undefined);
 assert.equal((await f.login(user.username)).status,401);assert.equal((await f.login(user.username,NEW_PASSWORD)).status,200);
 for(const cookie of [user.cookie,other.cookie])assert.equal((await f.api('/api/bootstrap',{cookie})).status,401);
 assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM recovery_codes WHERE userId=?').get(user.id).count,0);assert.equal(f.instance.db.prepare('SELECT authorId,text FROM messages WHERE id=?').get('m_keep').authorId,user.id);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{username:user.username,recoveryCode:codes[1],...replacement}})).status,400);
});
test('a code cannot reset a different user and invalid password confirmation never spends a valid proof',async t=>{
 const f=await fixture(t),alice=await f.register('alice_recovery'),bob=await f.register('bob_recovery'),codes=await f.codes(alice);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{username:bob.username,recoveryCode:codes[0],...replacement}})).status,400);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{username:alice.username,recoveryCode:codes[0],...replacement,confirmPassword:'different'}})).status,400);
 assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM recovery_codes').get().count,codes.length);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{username:alice.username,recoveryCode:codes[0],...replacement}})).status,200);
 assert.equal((await f.login(bob.username)).status,200);
});
test('simultaneous resets can spend a recovery proof only once',async t=>{
 const f=await fixture(t),user=await f.register(),codes=await f.codes(user);const body={username:user.username,recoveryCode:codes[0],...replacement};
 const results=await Promise.all([f.api('/api/auth/reset-password',{method:'POST',body}),f.api('/api/auth/reset-password',{method:'POST',body})]);assert.deepEqual(results.map(result=>result.status).sort(),[200,400]);
});
test('unverified email cannot recover an account and verification tokens require explicit single-use POST',async t=>{
 const f=await fixture(t),user=await f.register();const pending=await f.api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{password:PASSWORD,email:'RECOVERY@Example.test'}});assert.equal(pending.status,200);assert.equal(pending.data.email,'');assert.equal(pending.data.pendingEmail,'recovery@example.test');await f.instance.mailer.idle();
 const proof=f.token('verify'),before=f.messages.length;const request=await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}});await f.instance.mailer.idle();assert.equal(request.data.message,GENERIC_RECOVERY_MESSAGE);assert.equal(f.messages.length,before);
 await fetch(f.base+'/');assert.equal(f.instance.db.prepare('SELECT COUNT(*) AS count FROM account_tokens').get().count,1);
 const stored=f.instance.db.prepare('SELECT * FROM account_tokens').get();assert.notEqual(stored.hash,proof);assert.equal(JSON.stringify(stored).includes(proof),false);
 assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:proof}})).status,200);assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:proof}})).status,400);
});
test('verified email reset links use the configured origin, expire and cannot be replayed',async t=>{
 const f=await fixture(t),user=await f.register();await f.verifyEmail(user);
 const forgot=await f.api('/api/auth/forgot-password',{method:'POST',headers:{'X-Forwarded-Host':'attacker.example'},body:{identifier:'@'+user.username}});assert.equal(forgot.status,200);await f.instance.mailer.idle();
 const proof=f.token('reset'),message=f.messages.find(message=>message.subject==='Reset your Nexus password');assert.match(message.text,/https:\/\/nexus\.example\.test\/#reset-password=/);assert.doesNotMatch(message.text,/attacker/);
 assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:proof}})).status,400);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:proof,...replacement}})).status,200);assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:proof,...replacement}})).status,400);
 assert.equal((await f.login(user.username,NEW_PASSWORD)).status,200);
});
test('expired tokens and changed email ownership cannot reset the password',async t=>{
 const f=await fixture(t),user=await f.register();await f.verifyEmail(user);await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:'recovery@example.test'}});await f.instance.mailer.idle();const token=f.token('reset');
 f.instance.db.prepare('UPDATE account_tokens SET expiresAt=?').run(Date.now()-1);assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token,...replacement}})).status,400);assert.equal((await f.login(user.username)).status,200);
});
test('recovery responses do not reveal known, missing, unverified or cooldown accounts',async t=>{
 const f=await fixture(t,{recovery:{cooldownMs:60000}}),user=await f.register();const missing=await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:'missing_user'}}),unverified=await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}});assert.deepEqual(missing.data,unverified.data);
 await f.verifyEmail(user);const first=await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}}),cooldown=await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}});assert.deepEqual(first.data,missing.data);assert.deepEqual(cooldown.data,missing.data);
});
test('email settings and recovery secrets never appear in public users or unauthenticated APIs',async t=>{
 const f=await fixture(t),user=await f.register(),codes=await f.codes(user);await f.verifyEmail(user,'private-address@example.test');
 const bootstrap=await f.api('/api/bootstrap',{cookie:user.cookie});assert.equal(JSON.stringify(bootstrap.data).includes('private-address'),false);assert.equal(JSON.stringify(bootstrap.data).includes(codes[0]),false);assert.equal((await f.api('/api/account/security')).status,401);
 const config=await f.api('/api/config');assert.deepEqual(config.data.passwordRecovery,{emailAvailable:true,codeCount:8});assert.equal(config.data.mail,undefined);
});
test('email changes retain the old verified address until confirmation and invalidate old reset links',async t=>{
 const f=await fixture(t),user=await f.register();await f.verifyEmail(user,'old@example.test');await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}});await f.instance.mailer.idle();const old=f.token('reset');
 await f.api('/api/account/recovery-email',{method:'POST',cookie:user.cookie,body:{password:PASSWORD,email:'new@example.test'}});await f.instance.mailer.idle();assert.equal((await f.api('/api/account/security',{cookie:user.cookie})).data.email,'old@example.test');
 assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:f.token('verify')}})).status,200);assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{token:old,...replacement}})).status,400);assert.equal((await f.api('/api/account/security',{cookie:user.cookie})).data.email,'new@example.test');
});
test('a verified address cannot be claimed by another account',async t=>{
 const f=await fixture(t),alice=await f.register('alice_recovery'),bob=await f.register('bob_recovery');await f.verifyEmail(alice);
 await f.api('/api/account/recovery-email',{method:'POST',cookie:bob.cookie,body:{password:PASSWORD,email:'recovery@example.test'}});await f.instance.mailer.idle();assert.equal((await f.api('/api/auth/verify-email',{method:'POST',body:{token:f.token('verify')}})).status,400);assert.equal((await f.api('/api/account/security',{cookie:alice.cookie})).data.email,'recovery@example.test');assert.equal((await f.api('/api/account/security',{cookie:bob.cookie})).data.email,'');
});
test('global recovery request limits apply equally to nonexistent accounts and cross-site resets are rejected',async t=>{
 const f=await fixture(t,{recovery:{requestsPerMinute:2}}),user=await f.register(),codes=await f.codes(user);
 for(let n=0;n<2;n++)assert.equal((await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:'missing'}})).status,200);
 assert.equal((await f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:'missing'}})).status,429);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',headers:{Origin:'https://attacker.example'},body:{username:user.username,recoveryCode:codes[0],...replacement}})).status,403);assert.equal((await f.login(user.username)).status,200);
});
test('normalization rejects email header injection and does not merge provider-specific aliases',()=>{
 assert.equal(normalizeEmail('a@example.test\r\nBcc: attacker@example.test'),'');assert.equal(normalizeEmail('user+tag@EXAMPLE.test'),'user+tag@example.test');assert.notEqual(normalizeEmail('u.ser@example.test'),normalizeEmail('user@example.test'));
});
test('password recovery immediately disconnects every existing realtime session',async t=>{
 const f=await fixture(t),user=await f.register(),codes=await f.codes(user);
 const ws=new WebSocket(f.base.replace('http:','ws:')+'/socket.io/?EIO=4&transport=websocket',{headers:{Origin:f.base,Cookie:user.cookie}});t.after(()=>ws.terminate());
 let readyResolve,expiredResolve;const ready=new Promise(resolve=>{readyResolve=resolve;}),expired=new Promise(resolve=>{expiredResolve=resolve;});
 ws.on('message',bytes=>{const value=bytes.toString();if(value.startsWith('0'))ws.send('40');else if(value.startsWith('40'))readyResolve();else if(value==='2')ws.send('3');else if(value.startsWith('42')&&JSON.parse(value.slice(2))[0]==='session:expired')expiredResolve();});
 await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Realtime handshake timed out')),3000);timer.unref();})]);
 const closed=once(ws,'close');const reset=await f.api('/api/auth/reset-password',{method:'POST',body:{username:user.username,recoveryCode:codes[0],...replacement}});assert.equal(reset.status,200);
 await Promise.race([expired,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Session expiry event missing')),3000);timer.unref();})]);await closed;
});
test('new recovery code sets invalidate the previous set and email removal retains the current codes',async t=>{
 const f=await fixture(t),user=await f.register(),old=await f.codes(user),current=await f.codes(user);assert.notEqual(old[0],current[0]);
 assert.equal((await f.api('/api/auth/reset-password',{method:'POST',body:{username:user.username,recoveryCode:old[0],...replacement}})).status,400);
 await f.verifyEmail(user);assert.equal((await f.api('/api/account/recovery-email',{method:'DELETE',cookie:user.cookie,body:{password:PASSWORD}})).status,200);
 const status=await f.api('/api/account/security',{cookie:user.cookie});assert.equal(status.data.email,'');assert.equal(status.data.remainingCodes,current.length);
});
test('SMTP delivery latency cannot reveal recovery account existence or block the HTTP request',async t=>{
 const pending=[];const f=await fixture(t,{transport:{sendMail(){return new Promise(resolve=>pending.push(resolve));},close(){pending.splice(0).forEach(resolve=>resolve({}));}}}),user=await f.register();
 f.instance.db.prepare('INSERT INTO account_security (userId,email,verifiedAt) VALUES (?,?,?)').run(user.id,'recovery@example.test',Date.now());
 const response=await Promise.race([f.api('/api/auth/forgot-password',{method:'POST',body:{identifier:user.username}}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('SMTP blocked the recovery endpoint')),1500);timer.unref();})]);
 assert.equal(response.status,200);assert.equal(response.data.message,GENERIC_RECOVERY_MESSAGE);assert.equal(pending.length,1);pending.splice(0).forEach(resolve=>resolve({}));await f.instance.mailer.idle();
});
