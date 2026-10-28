'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createECDH, randomBytes } = require('node:crypto');
const WebSocket = require('ws');
const webPush = require('web-push');
const ece = require('http_ece');
const { createApp } = require('../server/app');
const { openDatabase } = require('../server/database');
const { CONFIG } = require('../server/config');
const { allowedEndpoint, normalizeSubscription } = require('../server/push');
const PASSWORD = 'Disposable-push-test-password!';
function browser(index = 1) {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys(); const auth = randomBytes(16), deviceId = index.toString(16).padStart(32, '0');
  return { ecdh, auth, deviceId, subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/NexusDisposableFixture${index}`, expirationTime: null, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
}
async function fixture(t, overrides = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-push-')), sent = [], sockets = []; let at = Date.now();
  const config = { ...CONFIG, databasePath: path.join(folder, 'nexus.sqlite'), uploadPath: path.join(folder, 'uploads'), publicOrigin: 'https://nexus.example.test', authAttemptsPerMinute: 1000, requestsPerMinute: 5000, mutationsPerMinute: 5000, push: { ...CONFIG.push, graceMs: 0, settingsPerMinute: 100, ...overrides } };
  let failure = null;
  const instance = createApp(config, { pushAutoStart: false, pushClock: () => at, pushTransport: async (subscription, payload, settings) => { sent.push({ subscription, payload, settings }); if (failure) throw failure; return { statusCode: 201 }; } });
  const server = http.createServer(instance.app), io = instance.attachRealtime(server); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { for (const ws of sockets) ws.terminate(); await new Promise(resolve => io.close(resolve)); instance.close(); fs.rmSync(folder, { recursive: true, force: true }); });
  const api = async (route, cookie, body, method = body ? 'POST' : 'GET', headers = {}) => {
    const response = await fetch(base + route, { method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = async username => { const result = await api('/api/auth/register', null, { username, displayName: username, password: PASSWORD }); assert.equal(result.status, 201); return { user: result.data.user, cookie: result.cookie }; };
  const subscribe = (account, device) => api('/api/push/subscription', account.cookie, { deviceId: device.deviceId, subscription: device.subscription });
  const dm = async (a, b) => { const result = await api('/api/dms', a.cookie, { userId: b.user.id }); assert.equal(result.status, 200); return result.data.id; };
  const message = async (account, conversationId, text = 'A detailed message preview.') => { const result = await api(`/api/conversations/${conversationId}/messages`, account.cookie, { text }); assert.equal(result.status, 201, JSON.stringify(result.data)); return result.data.message; };
  const connect = cookie => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', { headers: { Origin: base, Cookie: cookie } }); sockets.push(ws); let counter = 0; const pending = new Map(),events=[];
    const timer = setTimeout(() => reject(new Error('Socket timed out.')), 4000); ws.on('error', reject);
    ws.on('message', value => { const packet = value.toString(); if (packet.startsWith('0')) ws.send('40'); else if (packet === '2') ws.send('3'); else if (packet.startsWith('40')) { clearTimeout(timer); resolve({ events,emit: (event, payload) => new Promise(done => { const id = ++counter; pending.set(id, done); ws.send(`42${id}${JSON.stringify([event, payload])}`); }) }); } else if (packet.startsWith('43')) { const index = packet.indexOf('['), id = Number(packet.slice(2, index)); pending.get(id)?.(JSON.parse(packet.slice(index))[0]); pending.delete(id); } else if(packet.startsWith('42'))events.push(JSON.parse(packet.slice(2))); });
  });
  return { ...instance, base, folder, sent, api, register, subscribe, dm, message, connect, advance: ms => { at += ms; }, fail: value => { failure = value; } };
}

test('outbound push targets and receiver keys reject SSRF, credentials, other providers and malformed curves', () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a', 'https://example.notify.windows.com/w/?token=a']) assert.equal(allowedEndpoint(endpoint), true, endpoint);
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/a', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://fcm.googleapis.com.evil.test/x', 'https://user:password@fcm.googleapis.com/x', 'https://web.push.apple.com:444/x', 'https://localhost/x', 'https://web.push.apple.com/a#fragment']) assert.equal(allowedEndpoint(endpoint), false, endpoint);
  const valid = browser(); assert.equal(normalizeSubscription(valid.subscription).endpoint, valid.subscription.endpoint);
  assert.throws(() => normalizeSubscription({ ...valid.subscription, keys: { ...valid.subscription.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } }), /key/);
  assert.throws(() => normalizeSubscription({ ...valid.subscription, keys: { ...valid.subscription.keys, auth: 'short' } }), /keys/);
});
test('real DM outbox delivery includes bounded sender/text details inside encrypted transport', async t => {
  const f = await fixture(t), sender = await f.register('push_sender'), receiver = await f.register('push_receiver'), device = browser();
  const binding = await f.subscribe(receiver, device); assert.equal(binding.status, 200); assert.match(binding.data.bindingId, /^[a-f0-9]{32}$/);
  const config = await f.api('/api/config', receiver.cookie), publicConfig = await f.api('/api/config');
  assert.equal(config.data.webPush.configured, true); assert.deepEqual(publicConfig.data.webPush, { configured: false });
  const conversationId = await f.dm(sender, receiver), message = await f.message(sender, conversationId);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n, 1); await f.push.tick(); assert.equal(f.sent.length, 1);
  const sent = f.sent[0], payload = JSON.parse(sent.payload); assert.equal(payload.kind, 'dm'); assert.equal(payload.conversationId, conversationId); assert.equal(payload.messageId, message.id); assert.equal(payload.bindingId, binding.data.bindingId);
  assert.equal(payload.notification.title,'push_sender (@push_sender)');assert.equal(payload.notification.body,'Direct message · '+message.text); assert.ok(!JSON.stringify(config.data).includes('privateKey')); assert.equal(sent.settings.urgency, 'high');
  const request = webPush.generateRequestDetails(sent.subscription, sent.payload, sent.settings);
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm'); assert.ok(!request.body.includes(Buffer.from(sent.payload)));
  const decrypted = ece.decrypt(request.body, { version: 'aes128gcm', privateKey: device.ecdh, authSecret: device.auth.toString('base64url') }); assert.deepEqual(JSON.parse(decrypted.toString()), payload);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n, 0);
});
test('subscription enrollment uses authentication and CSRF checks; disabling or logging out removes the delivery authority', async t => {
  const f = await fixture(t), a = await f.register('push_security_a'), b = await f.register('push_security_b'), device = browser();
  assert.equal((await f.api('/api/push/subscription', null, { deviceId: device.deviceId, subscription: device.subscription })).status, 401);
  assert.equal((await f.api('/api/push/subscription', a.cookie, { deviceId: device.deviceId, subscription: device.subscription }, 'POST', { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const first = await f.subscribe(a, device); assert.equal(first.status, 200);
  assert.equal((await f.api('/api/push/subscription', b.cookie, { deviceId: device.deviceId }, 'DELETE')).status, 200); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 1);
  const rebound = await f.subscribe(b, device); assert.notEqual(rebound.data.bindingId, first.data.bindingId); assert.equal(f.db.prepare('SELECT userId FROM push_subscriptions').get().userId, b.user.id);
  await f.api('/api/auth/logout', b.cookie, {}); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 0);
  await f.subscribe(a, device); await f.api('/api/push/subscription', a.cookie, { deviceId: device.deviceId }, 'DELETE'); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 0);
});
test('a first DM carries its alert policy over the real realtime transport before workspace hydration',async t=>{
 const f=await fixture(t),a=await f.register('first_dm_sender'),b=await f.register('first_dm_receiver'),socket=await f.connect(b.cookie),id=await f.dm(a,b),message=await f.message(a,id,'First message alert');
 for(let attempt=0;attempt<30&&!socket.events.some(([event,payload])=>event==='message:new'&&payload.id===message.id);attempt++)await new Promise(resolve=>setImmediate(resolve));
 const payload=socket.events.find(([event,payload])=>event==='message:new'&&payload.id===message.id)?.[1];assert.ok(payload);assert.equal(payload.notificationPolicy,'all');assert.equal(payload.conversationId,id);assert.equal(payload.notification.title,'first_dm_sender (@first_dm_sender)');assert.match(payload.notification.body,/First message alert/);
});
test('DND, blocks and reads are rechecked without dropping alerts merely because the installation is focused', async t => {
  const f = await fixture(t), a = await f.register('push_policy_a'), b = await f.register('push_policy_b'), device = browser(); await f.subscribe(b, device); const id = await f.dm(a, b);
  await f.message(a, id, 'read before delivery'); await f.api(`/api/conversations/${id}/read`, b.cookie, {}); await f.push.tick(); assert.equal(f.sent.length, 0);
  await f.message(a, id, 'DND before delivery'); await f.api('/api/profile', b.cookie, { status: 'dnd' }, 'PATCH'); await f.push.tick(); assert.equal(f.sent.length, 0);
  await f.api('/api/profile', b.cookie, { status: 'online' }, 'PATCH'); await f.message(a, id, 'block before delivery'); await f.api(`/api/blocks/${a.user.id}`, b.cookie, {}, 'PUT'); await f.push.tick(); assert.equal(f.sent.length, 0);
  await f.api(`/api/blocks/${a.user.id}`, b.cookie, {}, 'DELETE');
  const socket = await f.connect(b.cookie); assert.equal((await socket.emit('presence:activity', { away: false, foreground: true, notificationDevice: device.deviceId })).ok, true);
  await f.message(a, id, 'focused installation browsing elsewhere'); await f.push.tick(); assert.equal(f.sent.length, 1);
  await f.message(a,id,'actively read conversation');await f.api(`/api/conversations/${id}/read`,b.cookie,{});await f.push.tick();assert.equal(f.sent.length,1);
  await socket.emit('presence:activity', { away: true, foreground: false, notificationDevice: device.deviceId }); await f.message(a, id, 'background installation'); await f.push.tick(); assert.equal(f.sent.length, 2);
});
test('all-message server alerts reach every subscribed eligible member, including a focused installation elsewhere',async t=>{
 const f=await fixture(t),a=await f.register('all_owner'),b=await f.register('all_member_b'),c=await f.register('all_member_c'),one=browser(1),two=browser(2);
 await f.subscribe(b,one);await f.subscribe(c,two);
 const created=(await f.api('/api/servers',a.cookie,{name:'All notifications fixture'})).data,server=(await f.api('/api/bootstrap',a.cookie)).data.servers.find(s=>s.id===created.id),channel=server.channels.find(c=>c.type==='text');
 await f.api('/api/servers/join',b.cookie,{invite:server.invite});await f.api('/api/servers/join',c.cookie,{invite:server.invite});await f.api(`/api/servers/${server.id}`,a.cookie,{defaultNotifications:'all'},'PATCH');
 const socket=await f.connect(b.cookie);await socket.emit('presence:activity',{foreground:true,notificationDevice:one.deviceId});
 await f.message(a,channel.id,'A message without mentions');await f.push.tick();assert.equal(f.sent.length,2);
 assert.equal(new Set(f.sent.map(s=>s.subscription.endpoint)).size,2);for(const sent of f.sent){const payload=JSON.parse(sent.payload);assert.equal(payload.kind,'server');assert.equal(payload.conversationId,channel.id);assert.ok(payload.notification.title.includes('All notifications fixture'));assert.ok(payload.notification.title.includes('#'+channel.name));assert.ok(payload.notification.body.includes('all_owner'));assert.ok(payload.notification.body.includes('A message without mentions'));}
});
test('server alerts honor mention defaults and recheck private-channel access after enqueue', async t => {
  const f = await fixture(t), a = await f.register('push_server_owner'), b = await f.register('push_server_member'), device = browser(); await f.subscribe(b, device);
  const created = (await f.api('/api/servers', a.cookie, { name: 'Push permission fixture' })).data;
  const server = (await f.api('/api/bootstrap', a.cookie)).data.servers.find(item => item.id === created.id), channel = server.channels.find(item => item.type === 'text');
  await f.api('/api/servers/join', b.cookie, { invite: server.invite }); await f.api(`/api/servers/${server.id}`, a.cookie, { defaultNotifications: 'mentions' }, 'PATCH');
  await f.message(a, channel.id, 'no mention'); await f.push.tick(); assert.equal(f.sent.length, 0);
  await f.message(a, channel.id, '@push_server_member hello'); await f.push.tick(); assert.equal(JSON.parse(f.sent[0].payload).kind, 'mention');
  await f.message(a, channel.id, '@push_server_member no access after enqueue'); f.db.prepare('UPDATE channels SET private=1,allowedRoleIds=? WHERE id=?').run('[]', channel.id); await f.push.tick(); assert.equal(f.sent.length, 1);
});
test('durable outbox coalesces a conversation, retries bounded transport failures and removes expired endpoints', async t => {
  const f = await fixture(t, { retryDelaysMs: [10, 20] }), a = await f.register('push_retry_a'), b = await f.register('push_retry_b'), device = browser(); await f.subscribe(b, device); const id = await f.dm(a, b);
  await f.message(a, id, 'first pending message'); const latest = await f.message(a, id, 'second pending message'); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n, 1);
  f.fail(Object.assign(new Error('Synthetic transport failure'), { statusCode: 503 })); await f.push.tick(); assert.equal(f.db.prepare('SELECT attempts FROM push_outbox').get().attempts, 1); assert.equal(JSON.parse(f.sent[0].payload).messageId, latest.id);
  f.advance(11); f.fail(null); await f.push.tick(); assert.equal(f.sent.length, 2); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_outbox').get().n, 0);
  await f.message(a, id, 'expired endpoint'); f.fail(Object.assign(new Error('Expired fixture'), { statusCode: 410 })); await f.push.tick(); assert.equal(f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get().n, 0);
  await f.subscribe(b, browser(2)); await f.message(a, id, 'session expired'); f.advance(CONFIG.sessionDays * 86400000 + 1); await f.push.tick(); assert.equal(f.sent.length, 3);
});
test('host keys persist privately and reopening schema eleven preserves existing identities while adding push tables', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-push-migration-')), filename = path.join(folder, 'data.sqlite'); t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const initial = openDatabase(filename); initial.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_keep', 'keep_push', 'Existing account', 'existing-fixture-hash', new Date().toISOString());
  initial.exec('DROP TABLE push_outbox;DROP TABLE push_subscriptions;PRAGMA user_version=11;'); initial.close();
  const config = { ...CONFIG, databasePath: filename, uploadPath: path.join(folder, 'uploads'), publicOrigin: 'https://nexus.example.test' };
  const one = createApp(config, { pushAutoStart: false }); const key = one.push.status().applicationServerKey; assert.equal(one.db.prepare('PRAGMA user_version').get().user_version, 13); one.close();
  const two = createApp(config, { pushAutoStart: false }); assert.equal(two.push.status().applicationServerKey, key); assert.equal(two.db.prepare('SELECT passwordHash FROM users WHERE id=?').get('u_keep').passwordHash, 'existing-fixture-hash'); assert.equal(two.db.prepare('PRAGMA foreign_key_check').all().length, 0); two.close();
});

test('online, idle and offline retain detailed DM and all-message server delivery; DND suppresses both',async t=>{
 const f=await fixture(t),a=await f.register('status_sender'),b=await f.register('status_receiver');await f.subscribe(b,browser());const dm=await f.dm(a,b);
 const created=(await f.api('/api/servers',a.cookie,{name:'Status alerts'})).data,server=(await f.api('/api/bootstrap',a.cookie)).data.servers.find(s=>s.id===created.id),channel=server.channels.find(c=>c.type==='text');
 await f.api('/api/servers/join',b.cookie,{invite:server.invite});await f.api(`/api/servers/${server.id}`,a.cookie,{defaultNotifications:'all'},'PATCH');
 for(const [index,status] of ['online','idle','offline','dnd'].entries()){
  assert.equal((await f.api('/api/profile',b.cookie,{status:status==='offline'?'invisible':status},'PATCH')).status,200);await f.message(a,dm,`DM while ${status}`);await f.message(a,channel.id,`Server while ${status}`);await f.push.tick();
  assert.equal(f.sent.length,Math.min(index+1,3)*2,status);
 }
 for(const sent of f.sent){const p=JSON.parse(sent.payload);assert.ok(p.notification.title);assert.ok(p.notification.body.includes('while'));assert.ok(!p.notification.body.includes('dnd'));}
});
test('notification excerpts hide spoilers and bound untrusted names, Markdown and attachment labels',()=>{
 const {notificationContent,NOTIFICATION_CONTENT}=require('../server/notification-content');let channel=null;
 const db={prepare:sql=>({get:()=>sql.includes('FROM users')?{displayName:'Alex',username:'alex'}:channel})};
 const message={authorId:'u',conversationId:'c',text:'# Hello **friend** ||hidden words|| [Docs](https://example.test/private?q=secret)',attachments:JSON.stringify([{type:'image/png',name:'secret.png',spoiler:true},{type:'application/pdf',name:'report.pdf'}])};
 const dm=notificationContent(db,message);assert.equal(dm.title,'Alex (@alex)');assert.ok(dm.body.includes('Hello friend [Spoiler] Docs'));assert.ok(dm.body.includes('Spoiler attachment'));assert.ok(dm.body.includes('report.pdf'));assert.ok(!dm.body.includes('hidden words'));assert.ok(!dm.body.includes('secret.png'));assert.ok(!dm.body.includes('https://'));
 channel={serverName:'Server '+ 'x'.repeat(200),name:'general'};message.text='🔥'.repeat(8000);const server=notificationContent(db,message);assert.ok(Array.from(server.title).length<=NOTIFICATION_CONTENT.titleLength);assert.ok(Array.from(server.body).length<=NOTIFICATION_CONTENT.bodyLength);assert.ok(!server.body.includes('�'));
});
