'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createApp } = require('../server/app');
const { CONFIG } = require('../server/config');

// All records and credentials in this suite are disposable local fixtures.
const PASSWORD = 'test-only-password-72!';
const WAIT_MS = 2500;
let base, instance, server, io, folder, alice, bob, eve, serverId, channelId, voiceId, serverIcon, serverBanner;
const sockets = [];
async function api(route, { cookie, body, method = 'GET', headers = {} } = {}) {
  const response = await fetch(base + route, {
    method, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  return { status: response.status, data: result, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
async function register(username) {
  const result = await api('/api/auth/register', { method: 'POST', body: { username, displayName: username.toUpperCase(), password: PASSWORD } });
  assert.equal(result.status, 201); return { ...result.data.user, cookie: result.cookie };
}
function connect(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', { headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}) } });
    const acknowledgements = new Map(), events = [], waiters = [];
    let counter = 0;
    const timer = setTimeout(() => { ws.close(); reject(new Error('Connection timed out')); }, WAIT_MS);
    const client = { ws, events,
      emit(event, payload = {}) {
        return new Promise((done, fail) => {
          const n = ++counter; const timeout = setTimeout(() => { acknowledgements.delete(n); fail(new Error('Ack timed out')); }, WAIT_MS);
          acknowledgements.set(n, value => { clearTimeout(timeout); done(value); }); ws.send(`42${n}${JSON.stringify([event, payload])}`);
        });
      },
      wait(event, predicate = () => true) {
        return new Promise((done, fail) => {
          const timeout = setTimeout(() => { const at = waiters.indexOf(waiter); if (at >= 0) waiters.splice(at, 1); fail(new Error(`Missing ${event}`)); }, WAIT_MS);
          const waiter = { event, predicate, done: value => { clearTimeout(timeout); done(value); } }; waiters.push(waiter);
        });
      },
    };
    ws.on('error', reject);
    ws.on('message', bytes => {
      const packet = bytes.toString();
      if (packet.startsWith('0')) ws.send('40');
      else if (packet === '2') ws.send('3');
      else if (packet.startsWith('40')) { clearTimeout(timer); sockets.push(ws); resolve(client); }
      else if (packet.startsWith('44')) { clearTimeout(timer); ws.close(); reject(new Error(JSON.parse(packet.slice(2)).message)); }
      else if (packet.startsWith('43')) { const at = packet.indexOf('['); const n = Number(packet.slice(2, at)); acknowledgements.get(n)?.(JSON.parse(packet.slice(at))[0]); acknowledgements.delete(n); }
      else if (packet.startsWith('42')) {
        const [event, payload] = JSON.parse(packet.slice(2)); events.push({ event, payload });
        for (const waiter of [...waiters]) if (waiter.event === event && waiter.predicate(payload)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.done(payload); }
      }
    });
  });
}
before(async () => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  instance = createApp({ ...CONFIG, port: 0, databasePath: path.join(folder, 'nexus.sqlite'), uploadPath: path.join(folder, 'uploads'), authAttemptsPerMinute: 200, requestsPerMinute: 3000, mutationsPerMinute: 3000, creatorClaimToken: 'disposable-creator-token', giphyApiKey: 'disposable-public-web-key' });
  server = http.createServer(instance.app); io = instance.attachRealtime(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  sockets.forEach(socket => socket.close());
  await new Promise(resolve => io.close(resolve));
  instance.close(); fs.rmSync(folder, { recursive: true, force: true });
});
test('accounts, password hashes, session cookies and origin protection', async () => {
  assert.equal((await api('/api/bootstrap')).status, 401);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { username: 'tiny', password: 'short' } })).status, 400);
  alice = await register('alice'); bob = await register('bob'); eve = await register('eve');
  assert.ok(alice.cookie); assert.equal(alice.passwordHash, undefined);
  const fresh = (await api('/api/bootstrap', { cookie: alice.cookie })).data;
  assert.deepEqual(fresh.servers, []); assert.deepEqual(fresh.dms, []);
  assert.deepEqual(fresh.users.map(user => user.id), [alice.id]);
  assert.equal((await api('/api/bootstrap?demo=1')).status, 401);

  const row = instance.db.prepare('SELECT * FROM users WHERE id = ?').get(alice.id);
  assert.notEqual(row.passwordHash, PASSWORD); assert.match(row.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { username: 'ALICE', password: PASSWORD } })).status, 409);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'incorrect' } })).status, 401);
  const login = await api('/api/auth/login', { method: 'POST', body: { username: 'alice', password: PASSWORD } });
  assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly/); assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await api('/api/profile', { cookie: alice.cookie, method: 'PATCH', headers: { Origin: 'https://untrusted.test' }, body: { displayName: 'Spoofed' } })).status, 403);
  await assert.rejects(connect(), /Sign in/);
});
test('server invitations, membership, channels and owner permissions', async () => {
  const created = await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Test community', description: 'Only test fixtures live here.' } });
  assert.equal(created.status, 201); serverId = created.data.id;
  const snapshot = (await api('/api/bootstrap', { cookie: alice.cookie })).data;
  const community = snapshot.servers[0]; channelId = community.channels.find(c => c.type === 'text').id; voiceId = community.channels.find(c => c.type === 'voice').id;
  assert.equal(community.members.length, 1); assert.equal(community.role, 'owner');
  assert.equal((await api(`/api/conversations/${channelId}/messages`, { cookie: bob.cookie })).status, 404);
  assert.equal((await api('/api/bootstrap', { cookie: eve.cookie })).data.servers.length, 0);
  assert.equal((await api('/api/servers/join', { cookie: bob.cookie, method: 'POST', body: { invite: community.invite } })).status, 200);
  const bobSnapshot = (await api('/api/bootstrap', { cookie: bob.cookie })).data;
  assert.equal(bobSnapshot.servers[0].invite, undefined);
  assert.equal((await api(`/api/servers/${serverId}/channels`, { cookie: bob.cookie, method: 'POST', body: { name: 'nope' } })).status, 403);
  assert.equal((await api(`/api/servers/${serverId}/channels`, { cookie: alice.cookie, method: 'POST', body: { name: 'new-space', type: 'text' } })).status, 201);
  await api(`/api/servers/${serverId}/invite`, { cookie: alice.cookie, method: 'POST', body: { rotate: true } });
  assert.equal((await api('/api/servers/join', { cookie: eve.cookie, method: 'POST', body: { invite: community.invite } })).status, 404);
});
test('DM privacy over HTTP and Socket.IO; authorship, reactions, pins and read state', async () => {
  const a = await connect(alice.cookie), b = await connect(bob.cookie), outsider = await connect(eve.cookie);
  const created = await api('/api/dms', { cookie: alice.cookie, method: 'POST', body: { userId: bob.id } });
  const dmId = created.data.id;
  assert.equal((await api('/api/dms', { cookie: bob.cookie, method: 'POST', body: { userId: alice.id } })).data.id, dmId);
  assert.equal((await api(`/api/conversations/${dmId}/messages`, { cookie: eve.cookie })).status, 404);
  const seenA = a.wait('message:new'), seenB = b.wait('message:new');
  const result = await api(`/api/conversations/${dmId}/messages`, { cookie: alice.cookie, method: 'POST', body: { text: 'For Bob only.', authorId: eve.id } });
  assert.equal(result.status, 201); const message = result.data.message;
  assert.equal(message.authorId, alice.id); assert.equal((await seenA).id, message.id); assert.equal((await seenB).id, message.id);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(outsider.events.some(item => item.event === 'message:new'), false);
  assert.equal((await api('/api/bootstrap', { cookie: eve.cookie })).data.dms.length, 0);
  assert.equal((await api(`/api/messages/${message.id}`, { cookie: bob.cookie, method: 'PATCH', body: { text: 'Not mine.' } })).status, 403);
  assert.equal((await api(`/api/messages/${message.id}`, { cookie: bob.cookie, method: 'DELETE' })).status, 403);
  assert.equal((await api(`/api/messages/${message.id}`, { cookie: eve.cookie, method: 'DELETE' })).status, 404);
  const edited = await api(`/api/messages/${message.id}`, { cookie: alice.cookie, method: 'PATCH', body: { text: 'An edited private message.' } });
  assert.ok(edited.data.message.editedAt);
  const reacted = await api(`/api/messages/${message.id}/reactions`, { cookie: bob.cookie, method: 'POST', body: { emoji: '🔥' } });
  assert.equal(reacted.data.message.reactions[0].userId, bob.id);
  const unreacted = await api(`/api/messages/${message.id}/reactions`, { cookie: bob.cookie, method: 'POST', body: { emoji: '🔥' } });
  assert.equal(unreacted.data.message.reactions.length, 0);
  await api(`/api/messages/${message.id}/pin`, { cookie: bob.cookie, method: 'POST', body: {} });
  assert.equal((await api(`/api/conversations/${dmId}/messages?pinned=true`, { cookie: alice.cookie })).data.messages.length, 1);
  let snapshot = (await api('/api/bootstrap', { cookie: bob.cookie })).data;
  assert.equal(snapshot.dms[0].unread, 1);
  await api(`/api/conversations/${dmId}/read`, { cookie: bob.cookie, method: 'POST', body: {} });
  snapshot = (await api('/api/bootstrap', { cookie: bob.cookie })).data; assert.equal(snapshot.dms[0].unread, 0);
  const publicMessage = await api(`/api/conversations/${channelId}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'A shared message.' } });
  const reply = await api(`/api/conversations/${dmId}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'A real reply.', replyTo: message.id } });
  assert.equal(reply.status, 201); assert.equal(reply.data.message.replyTo, message.id);
  const wrongConversationReply = await api(`/api/conversations/${channelId}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'Wrong conversation.', replyTo: message.id } });
  assert.equal(wrongConversationReply.status, 400);
  assert.equal((await api(`/api/messages/${publicMessage.data.message.id}/pin`, { cookie: bob.cookie, method: 'POST', body: {} })).status, 403);
  assert.equal((await api(`/api/messages/${publicMessage.data.message.id}`, { cookie: alice.cookie, method: 'DELETE' })).status, 200);
  const deniedTyping = await outsider.emit('typing', { conversationId: dmId }); assert.equal(deniedTyping.ok, false);
});
test('authenticated uploads, file isolation, profile GIFs and safe metadata', async () => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  const profile = new FormData(); profile.append('files', new Blob([gif], { type: 'image/gif' }), 'animated.gif');
  const uploaded = await api('/api/uploads?purpose=profile', { cookie: alice.cookie, method: 'POST', body: profile });
  assert.equal(uploaded.status, 201); assert.equal(uploaded.data.files[0].type, 'image/gif');
  const profileImage = uploaded.data.files[0].url;
  const updated = await api('/api/profile', { cookie: alice.cookie, method: 'PATCH', body: { displayName: 'Alice', bio: 'A GIF-friendly profile.', avatar: profileImage, banner: profileImage, accent: '#b9a1f0', id: bob.id } });
  assert.equal(updated.status, 200); assert.equal(updated.data.user.id, alice.id); assert.equal(updated.data.user.banner, profileImage);
  assert.equal((await fetch(base + profileImage)).status, 401);
  const fetchedImage = await fetch(base + profileImage, { headers: { Cookie: bob.cookie } });
  assert.equal(fetchedImage.status, 200); assert.ok(Buffer.from(await fetchedImage.arrayBuffer()).equals(gif));
  const fake = new FormData(); fake.append('files', new Blob(['<script>alert(1)</script>'], { type: 'image/gif' }), 'fake.gif');
  assert.equal((await api('/api/uploads?purpose=profile', { cookie: alice.cookie, method: 'POST', body: fake })).status, 400);
  const attachment = new FormData(); attachment.append('files', new Blob(['private attachment']), 'notes.txt');
  const upload = await api('/api/uploads', { cookie: alice.cookie, method: 'POST', body: attachment });
  assert.equal(upload.status, 201);
  const file = upload.data.files[0];
  assert.equal((await fetch(base + file.url, { headers: { Cookie: bob.cookie } })).status, 404);
  const sent = await api(`/api/conversations/${channelId}/messages`, { cookie: alice.cookie, method: 'POST', body: { attachments: [file.id] } });
  assert.equal(sent.status, 201);
  const download = await fetch(base + file.url, { headers: { Cookie: bob.cookie } });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /^attachment/); assert.equal(await download.text(), 'private attachment');
  const denied = await fetch(base + file.url, { headers: { Cookie: eve.cookie } });
    assert.equal(denied.status, 404); assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal((await api(`/api/conversations/${channelId}/messages`, { cookie: bob.cookie, method: 'POST', body: { attachments: [file.id] } })).status, 400);
  assert.equal((await api('/api/profile', { cookie: alice.cookie, method: 'PATCH', body: { banner: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await api('/api/users?q=%25_', { cookie: alice.cookie })).status, 200);
});
test('server icon and banner updates preserve GIFs and enforce owner and member permissions', async () => {
  const gif = Buffer.from('R0lGODlhAgACAIEAAPN5cAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBCgABACwAAAAAAgACAIEgIykAAAAAAAAAAAAIBgABCAQQEAA7', 'base64');
  const upload = async (cookie, target = serverId, contents = gif) => {
    const body = new FormData(); body.append('files', new Blob([contents], { type: 'image/gif' }), 'server.gif');
    return api(`/api/uploads?purpose=server&serverId=${target}`, { cookie, method: 'POST', body });
  };
  assert.equal((await upload(bob.cookie)).status, 403);
  assert.equal((await upload(eve.cookie)).status, 404);
  assert.equal((await upload(alice.cookie, serverId, Buffer.from('<script>not an image</script>'))).status, 400);
  const iconUpload = await upload(alice.cookie), bannerUpload = await upload(alice.cookie);
  assert.equal(iconUpload.status, 201); assert.equal(bannerUpload.status, 201);
  const icon = iconUpload.data.files[0], banner = bannerUpload.data.files[0];
  serverIcon = icon.url; serverBanner = banner.url;
  assert.equal((await api(`/api/servers/${serverId}`, { cookie: bob.cookie, method: 'PATCH', body: { name: 'Unauthorized' } })).status, 403);
  assert.equal((await api(`/api/servers/${serverId}`, { cookie: eve.cookie, method: 'PATCH', body: { name: 'Unrelated' } })).status, 404);
  const update = await api(`/api/servers/${serverId}`, { cookie: alice.cookie, method: 'PATCH', body: {
    name: 'Test community', description: 'Images survive refresh.', icon: icon.url, banner: banner.url, accent: '#ff7972', ownerId: bob.id,
  } });
  assert.equal(update.status, 200);
  const shared = (await api('/api/bootstrap', { cookie: bob.cookie })).data.servers.find(s => s.id === serverId);
  assert.equal(shared.icon, icon.url); assert.equal(shared.banner, banner.url); assert.equal(shared.ownerId, alice.id);
  for (const file of [icon, banner]) {
    assert.equal((await fetch(base + file.url)).status, 401);
    const denied = await fetch(base + file.url, { headers: { Cookie: eve.cookie } });
    assert.equal(denied.status, 404); assert.equal(denied.headers.get('cache-control'), 'no-store');
    const response = await fetch(base + file.url, { headers: { Cookie: bob.cookie } });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/gif/);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(gif));
  }
  const other = await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Other server' } });
  assert.equal((await api(`/api/servers/${other.data.id}`, { cookie: alice.cookie, method: 'PATCH', body: { icon: icon.url } })).status, 400);
  assert.equal((await api(`/api/servers/${serverId}`, { cookie: alice.cookie, method: 'PATCH', body: { banner: 'data:image/gif;base64,bad' } })).status, 400);
  assert.equal((await api(`/api/conversations/${channelId}/messages`, { cookie: alice.cookie, method: 'POST', body: { attachments: [icon.id] } })).status, 400);
  assert.equal((await api(`/api/servers/${serverId}`, { cookie: alice.cookie, method: 'PATCH', body: { icon: '', banner: '' } })).status, 200);
  assert.equal((await api('/api/bootstrap', { cookie: bob.cookie })).data.servers.find(s => s.id === serverId).icon, '');
  await api(`/api/servers/${serverId}`, { cookie: alice.cookie, method: 'PATCH', body: { icon: serverIcon, banner: serverBanner } });
});
test('roles, private channels, read-only permissions and live access revocation', async () => {
  const created = await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Governance fixtures' } });
  const target = created.data.id;
  const community = (await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(s => s.id === target);
  await api('/api/servers/join', { cookie: bob.cookie, method: 'POST', body: { invite: community.invite } });
  await api('/api/servers/join', { cookie: eve.cookie, method: 'POST', body: { invite: community.invite } });
  assert.equal((await api(`/api/servers/${target}/roles`, { cookie: bob.cookie, method: 'POST', body: { name: 'Escalation', permissions: ['manageServer'] } })).status, 403);
  assert.equal((await api(`/api/servers/${target}/roles`, { cookie: alice.cookie, method: 'POST', body: { name: 'Invalid', permissions: ['owner'] } })).status, 400);
  const role = (await api(`/api/servers/${target}/roles`, { cookie: alice.cookie, method: 'POST', body: { name: 'Moderator', color: '#ff7972', permissions: ['manageChannels', 'manageMessages', 'inviteMembers'] } })).data.role;
  assert.equal((await api(`/api/servers/${target}/members/${bob.id}/roles`, { cookie: alice.cookie, method: 'PUT', body: { roleIds: [role.id] } })).status, 200);
  assert.equal((await api(`/api/servers/${serverId}/members/${bob.id}/roles`, { cookie: alice.cookie, method: 'PUT', body: { roleIds: [role.id] } })).status, 400);
  assert.equal((await api(`/api/servers/${target}/roles/${role.id}`, { cookie: bob.cookie, method: 'PATCH', body: { permissions: ['manageServer'] } })).status, 403);
  assert.equal((await api(`/api/servers/${target}`, { cookie: bob.cookie, method: 'PATCH', body: { publicListing: true } })).status, 403);
  assert.equal((await api(`/api/servers/${target}/invite`, { cookie: bob.cookie, method: 'POST', body: {} })).status, 200);
  const privateChannel = (await api(`/api/servers/${target}/channels`, { cookie: bob.cookie, method: 'POST', body: { name: 'moderators' } })).data.id;
  assert.equal((await api(`/api/channels/${privateChannel}`, { cookie: alice.cookie, method: 'PATCH', body: { private: true, allowedRoleIds: [role.id] } })).status, 200);
  assert.equal((await api('/api/bootstrap', { cookie: eve.cookie })).data.servers.find(s => s.id === target).channels.some(c => c.id === privateChannel), false);
  assert.equal((await api(`/api/conversations/${privateChannel}/messages`, { cookie: eve.cookie })).status, 404);
  const a = await connect(alice.cookie), b = await connect(bob.cookie), unrelated = await connect(eve.cookie);
  const seen = b.wait('message:new', message => message.conversationId === privateChannel);
  await api(`/api/conversations/${privateChannel}/messages`, { cookie: alice.cookie, method: 'POST', body: { text: 'A private role conversation.' } }); await seen;
  assert.equal(unrelated.events.some(event => event.event === 'message:new' && event.payload.conversationId === privateChannel), false);
  const regular = community.channels.find(c => c.type === 'text').id;
  await api(`/api/channels/${regular}`, { cookie: bob.cookie, method: 'PATCH', body: { readOnly: true, topic: 'Announcements only' } });
  assert.equal((await api(`/api/conversations/${regular}/messages`, { cookie: eve.cookie, method: 'POST', body: { text: 'Denied' } })).status, 403);
  assert.equal((await api(`/api/conversations/${regular}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'Moderator announcement.' } })).status, 201);
  const form = new FormData(); form.append('files', new Blob(['Private channel file']), 'private.txt');
  const file = (await api('/api/uploads', { cookie: alice.cookie, method: 'POST', body: form })).data.files[0];
  await api(`/api/conversations/${privateChannel}/messages`, { cookie: alice.cookie, method: 'POST', body: { attachments: [file.id] } });
  assert.equal((await fetch(base + file.url, { headers: { Cookie: bob.cookie } })).status, 200);
  const voiceChannel = community.channels.find(c => c.type === 'voice').id;
  await api(`/api/channels/${voiceChannel}`, { cookie: alice.cookie, method: 'PATCH', body: { private: true, allowedRoleIds: [role.id] } });
  assert.equal((await b.emit('voice:join', { conversationId: voiceChannel })).ok, true);
  const removed = b.wait('voice:removed');
  await api(`/api/servers/${target}/members/${bob.id}/roles`, { cookie: alice.cookie, method: 'PUT', body: { roleIds: [] } });
  assert.equal((await removed).conversationId, voiceChannel);
  const previous = b.events.filter(event => event.event === 'message:new' && event.payload.conversationId === privateChannel).length;
  const fresh = await connect(bob.cookie);
  await api(`/api/conversations/${privateChannel}/messages`, { cookie: alice.cookie, method: 'POST', body: { text: 'After revocation.' } });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(b.events.filter(event => event.event === 'message:new' && event.payload.conversationId === privateChannel).length, previous);
  assert.equal(fresh.events.some(event => event.event === 'message:new' && event.payload.conversationId === privateChannel), false);
  assert.equal((await fetch(base + file.url, { headers: { Cookie: bob.cookie } })).status, 404);
  assert.equal((await b.emit('voice:join', { conversationId: voiceChannel })).ok, false);
  assert.equal((await api(`/api/channels/${privateChannel}`, { cookie: bob.cookie, method: 'DELETE' })).status, 403);
  await api(`/api/channels/${privateChannel}`, { cookie: alice.cookie, method: 'DELETE' });
  assert.equal((await api(`/api/conversations/${privateChannel}/messages`, { cookie: alice.cookie })).status, 404);
  assert.equal(instance.db.prepare('SELECT count(*) AS n FROM messages WHERE conversationId=?').get(privateChannel).n, 0);
  assert.equal((await fetch(base + file.url, { headers: { Cookie: alice.cookie } })).status, 404);
  await api(`/api/channels/${voiceChannel}`, { cookie: alice.cookie, method: 'PATCH', body: { private: false, allowMedia: false } });
  assert.equal((await b.emit('voice:join', { conversationId: voiceChannel })).ok, true);
  assert.equal((await b.emit('voice:update', { camera: true })).ok, false);
  await b.emit('voice:leave');
  await api(`/api/servers/${target}/roles/${role.id}`, { cookie: alice.cookie, method: 'DELETE' });
  assert.equal((await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(s => s.id === target).roles.length, 0);
});

test('discovery lists real opted-in servers, keeps private metadata hidden and honors listing changes', async () => {
  const viewer = await register('discovery_viewer');
  const created = (await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Public discovery fixtures' } })).data.id;
  assert.equal((await api('/api/discovery', { cookie: viewer.cookie })).data.servers.some(s => s.id === created), false);
  assert.equal((await api(`/api/servers/${created}/join-public`, { cookie: viewer.cookie, method: 'POST', body: {} })).status, 404);
  await api(`/api/servers/${created}`, { cookie: alice.cookie, method: 'PATCH', body: { publicListing: true, rules: 'Be respectful.\nKeep private information private.' } });
  const listing = (await api('/api/discovery', { cookie: viewer.cookie })).data.servers.find(s => s.id === created);
  assert.equal(listing.memberCount, 1); assert.match(listing.rules, /Be respectful/);
  for (const key of ['invite', 'channels', 'members', 'ownerId']) assert.equal(listing[key], undefined);
  await api(`/api/servers/${created}`, { cookie: alice.cookie, method: 'PATCH', body: { publicListing: false } });
  assert.equal((await api('/api/discovery', { cookie: viewer.cookie })).data.servers.some(s => s.id === created), false);
  await api(`/api/servers/${created}`, { cookie: alice.cookie, method: 'PATCH', body: { publicListing: true } });
  assert.equal((await api(`/api/servers/${created}/join-public`, { cookie: viewer.cookie, method: 'POST', body: {} })).status, 200);
  assert.equal((await api('/api/discovery', { cookie: viewer.cookie })).data.servers.find(s => s.id === created).joined, true);
  assert.equal((await api('/api/bootstrap', { cookie: viewer.cookie })).data.servers.find(s => s.id === created).rules, listing.rules);
});

test('voice membership and signaling are restricted to the same authorized room', async () => {
  const a = await connect(alice.cookie), b = await connect(bob.cookie), outsider = await connect(eve.cookie);
  assert.equal((await outsider.emit('voice:join', { conversationId: voiceId })).ok, false);
  assert.equal((await a.emit('voice:join', { conversationId: channelId })).ok, false);
  const joined = await a.emit('voice:join', { conversationId: voiceId }); assert.equal(joined.ok, true); assert.equal(joined.peers.length, 0);
  const second = await b.emit('voice:join', { conversationId: voiceId }); assert.equal(second.peers.length, 1);
  const signal = a.wait('rtc:signal');
  assert.equal((await b.emit('rtc:signal', { to: second.peers[0].socketId, type: 'offer', data: { type: 'offer', sdp: 'test-only-sdp' } })).ok, true);
  assert.equal((await signal).type, 'offer');
  assert.equal((await outsider.emit('rtc:signal', { to: second.peers[0].socketId, type: 'candidate', data: {} })).ok, false);
  const stateEvent = a.wait('voice:state', payload => payload.participants.some(p => p.muted));
  assert.equal((await b.emit('voice:update', { muted: true })).ok, true); await stateEvent;
  const leave = a.wait('voice:left'); await b.emit('voice:leave'); await leave;
  await a.emit('voice:leave');
});
test('message pagination is bounded; logout revokes the corresponding socket session', async () => {
  const testLogin = await api('/api/auth/login', { method: 'POST', body: { username: 'bob', password: PASSWORD } });
  const client = await connect(testLogin.cookie);
  const response = await api(`/api/conversations/${channelId}/messages?q=absent`, { cookie: bob.cookie });
  assert.deepEqual(response.data.messages, []); assert.equal(response.data.hasMore, false);
  assert.equal((await api(`/api/conversations/${channelId}/messages`, { cookie: alice.cookie, method: 'POST', body: { text: 'x'.repeat(CONFIG.maxMessageLength + 1) } })).status, 400);
  const insert = instance.db.prepare('INSERT INTO messages (id, conversationId, authorId, text, createdAt) VALUES (?, ?, ?, ?, ?)');
  const fixtureIds = Array.from({ length: CONFIG.messagePageSize + 3 }, (_, index) => `m_zz_fixture_${String(index).padStart(4, '0')}`);
  fixtureIds.forEach(messageId => insert.run(messageId, channelId, alice.id, 'Pagination fixture', '2026-01-01T00:00:00.000Z'));
  const firstPage = (await api(`/api/conversations/${channelId}/messages`, { cookie: bob.cookie })).data;
  assert.equal(firstPage.messages.length, CONFIG.messagePageSize); assert.equal(firstPage.hasMore, true);
  const secondPage = (await api(`/api/conversations/${channelId}/messages?before=${firstPage.messages[0].id}`, { cookie: bob.cookie })).data;
  const allIds = firstPage.messages.concat(secondPage.messages).map(message => message.id);
  assert.equal(new Set(allIds).size, allIds.length); assert.ok(fixtureIds.every(messageId => allIds.includes(messageId)));
  assert.equal(secondPage.hasMore, false);
  const closed = once(client.ws, 'close');
  assert.equal((await api('/api/auth/logout', { cookie: testLogin.cookie, method: 'POST', body: {} })).status, 200); await closed;
  assert.equal((await api('/api/bootstrap', { cookie: testLogin.cookie })).status, 401);
  assert.equal((await api('/api/bootstrap', { cookie: bob.cookie })).status, 200);
});

test('a new application instance reads the real persisted account and conversation history', async () => {
  const second = createApp({ ...CONFIG, databasePath: path.join(folder, 'nexus.sqlite'), uploadPath: path.join(folder, 'uploads') });
  const secondServer = http.createServer(second.app);
  try {
    secondServer.listen(0, '127.0.0.1'); await once(secondServer, 'listening');
    const origin = `http://127.0.0.1:${secondServer.address().port}`;
    const response = await fetch(origin + '/api/bootstrap', { headers: { Cookie: alice.cookie } });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.equal(snapshot.user.id, alice.id); assert.equal(snapshot.servers[0].id, serverId);
    assert.equal(snapshot.servers[0].icon, serverIcon); assert.equal(snapshot.servers[0].banner, serverBanner);
    const history = await fetch(origin + `/api/conversations/${channelId}/messages`, { headers: { Cookie: alice.cookie } });
    const data = await history.json();
    assert.ok(data.messages.length > 0); assert.equal(data.hasMore, true);
  } finally {
    await new Promise(resolve => secondServer.close(resolve)); second.close();
  }
});

test('immutable usernames, creator reservation and display-name impersonation protections', async () => {
  const account = await register('identity_fixture');
  assert.equal((await api('/api/profile', { cookie: account.cookie, method: 'PATCH', body: { username: 'replacement' } })).status, 400);
  const profile = await api('/api/profile', { cookie: account.cookie, method: 'PATCH', body: { displayName: 'MaxUltimat3' } });
  assert.equal(profile.status, 200); assert.equal(profile.data.user.username, 'identity_fixture'); assert.equal(profile.data.user.badges.includes('creator'), false);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { username: 'MaxUltimat3', password: PASSWORD } })).status, 403);
});

test('chunked uploads enforce ownership and offsets, survive new sessions, and preserve exact bytes', async () => {
  const account = await register('chunk_fixture');
  const content = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(300000, 7)]);
  const started = await api('/api/uploads/start?purpose=profile', { cookie: account.cookie, method: 'POST', body: { name: 'streamed.gif', size: content.length } });
  assert.equal(started.status, 201); const key = started.data.id;
  async function chunk(cookie, offset, value) {
    return fetch(`${base}/api/uploads/${key}/chunks?offset=${offset}`, { method: 'PUT', headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/octet-stream' }, body: value });
  }
  assert.equal((await chunk(bob.cookie, 0, content.subarray(0, 100000))).status, 404);
  assert.equal((await chunk(account.cookie, 0, content.subarray(0, 100000))).status, 200);
  assert.equal((await chunk(account.cookie, 0, content.subarray(0, 100000))).status, 409);
  assert.equal((await api(`/api/uploads/${key}/complete`, { cookie: account.cookie, method: 'POST', body: {} })).status, 409);
  const logged = await api('/api/auth/login', { method: 'POST', body: { username: 'chunk_fixture', password: PASSWORD } });
  assert.equal((await api(`/api/uploads/${key}`, { cookie: logged.cookie })).data.received, 100000);
  assert.equal((await chunk(logged.cookie, 100000, content.subarray(100000))).status, 200);
  const finished = await api(`/api/uploads/${key}/complete`, { cookie: logged.cookie, method: 'POST', body: {} });
  assert.equal(finished.status, 201); const file = finished.data.files[0]; assert.equal(file.size, content.length);
  const download = await fetch(base + file.url, { headers: { Cookie: logged.cookie } });
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
  assert.equal((await api(`/api/uploads/${key}`, { cookie: logged.cookie })).data.files[0].id,file.id);
  assert.equal((await api(`/api/uploads/${key}/complete`, { cookie: logged.cookie, method:'POST',body:{} })).data.files[0].id,file.id);
  assert.equal((await fetch(base + file.url, { headers: { Cookie: eve.cookie } })).status, 404);
});

test('the full 5 GiB size is accepted for attachments, avatars and server banners without allocating it', async () => {
  const server = (await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Large upload fixtures' } })).data.id;
  for (const purpose of ['attachment', 'profile', 'server']) {
    const suffix = purpose === 'server' ? `&serverId=${server}` : '';
    const upload = await api(`/api/uploads/start?purpose=${purpose}${suffix}`, { cookie: alice.cookie, method: 'POST', body: { name: 'large.gif', size: 5 * 1024 ** 3 } });
    assert.equal(upload.status, 201); assert.equal((await api(`/api/uploads/${upload.data.id}`, { cookie: alice.cookie, method: 'DELETE' })).status, 200);
    assert.equal((await api(`/api/uploads/start?purpose=${purpose}${suffix}`, { cookie: alice.cookie, method: 'POST', body: { name: 'too-large.gif', size: 5 * 1024 ** 3 + 1 } })).status, 400);
  }
});

test('categories reorder, rename and remove without deleting channels; settings validate icons and limits', async () => {
  const made = (await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Layout fixtures' } })).data.id;
  const first = (await api(`/api/servers/${made}/categories`, { cookie: alice.cookie, method: 'POST', body: { name: 'Projects' } })).data.id;
  const channel = (await api(`/api/servers/${made}/channels`, { cookie: alice.cookie, method: 'POST', body: { name: 'dev', type: 'forum', category: 'Projects' } })).data.id;
  assert.equal((await api(`/api/channels/${channel}`, { cookie: alice.cookie, method: 'PATCH', body: { slowmodeSeconds: 5, icon: 'code' } })).status, 200);
  assert.equal((await api(`/api/channels/${channel}`, { cookie: alice.cookie, method: 'PATCH', body: { icon: '<script>' } })).status, 400);
  assert.equal((await api(`/api/categories/${first}`, { cookie: alice.cookie, method: 'PATCH', body: { name: 'Work' } })).status, 200);
  let snapshot = (await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(server => server.id === made);
  assert.equal(snapshot.channels.find(item => item.id === channel).category, 'Work');
  const layout = { categories: snapshot.categories.slice().reverse(), channels: snapshot.channels.slice().reverse().map(item => ({ id: item.id, category: item.id === channel ? '' : item.category })) };
  assert.equal((await api(`/api/servers/${made}/layout`, { cookie: alice.cookie, method: 'PUT', body: layout })).status, 200);
  snapshot = (await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(server => server.id === made);
  assert.equal(snapshot.channels[0].id, channel); assert.equal(snapshot.channels[0].category, '');
  assert.equal((await api(`/api/categories/${first}`, { cookie: alice.cookie, method: 'DELETE' })).status, 200);
  assert.ok((await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(server => server.id === made).channels.some(item => item.id === channel));
});

test('forums isolate topic replies, announcements are read-only, media requires an attachment, and mentions are scoped', async () => {
  const fixture = (await api('/api/servers', { cookie: alice.cookie, method: 'POST', body: { name: 'Channel type fixtures' } })).data.id;
  const community = (await api('/api/bootstrap', { cookie: alice.cookie })).data.servers.find(server => server.id === fixture);
  await api('/api/servers/join', { cookie: bob.cookie, method: 'POST', body: { invite: community.invite } });
  const make = async (name,type) => (await api(`/api/servers/${fixture}/channels`, { cookie: alice.cookie, method: 'POST', body: { name,type } })).data.id;
  const forum = await make('topics','forum'), announcements = await make('announcements','announcement'), media = await make('photos','media');
  const topic = await api(`/api/conversations/${forum}/messages`, { cookie: alice.cookie, method: 'POST', body: { text: 'Topic title\nA longer topic body' } });
  assert.equal(topic.status, 201);
  const reply = await api(`/api/conversations/${forum}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: '@alice @eve a reply', threadId: topic.data.message.id } });
  assert.equal(reply.status, 201); assert.deepEqual(reply.data.message.mentions, [alice.id]);
  const roots = await api(`/api/conversations/${forum}/messages`, { cookie: bob.cookie });
  assert.equal(roots.data.messages.length, 1); assert.equal(roots.data.messages[0].replyCount, 1);
  const replies = await api(`/api/conversations/${forum}/messages?threadId=${topic.data.message.id}`, { cookie: bob.cookie });
  assert.deepEqual(replies.data.messages.map(message=>message.id),[reply.data.message.id]);
  assert.equal((await api(`/api/conversations/${announcements}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'not allowed' } })).status, 403);
  assert.equal((await api(`/api/conversations/${media}/messages`, { cookie: bob.cookie, method: 'POST', body: { text: 'no attachment' } })).status, 400);
  const catalog = (await api('/api/gifs', { cookie: bob.cookie })).data.gifs;
  assert.ok(catalog.length >= 16);
  const gif = await api(`/api/conversations/${media}/messages`, { cookie: bob.cookie, method: 'POST', body: { gifs: [catalog[0].id] } });
  assert.equal(gif.status,201); assert.equal(gif.data.message.attachments[0].type,'image/gif');
  assert.equal((await api(`/api/messages/${gif.data.message.id}/reactions`, { cookie:bob.cookie,method:'POST',body:{emoji:'🦋'} })).status,200);
});

test('kick, expiring ban, temporary mute and leave enforce membership and private file access', async () => {
  const host = await register('moderation_host'), guest = await register('moderation_guest');
  const made = (await api('/api/servers', { cookie: host.cookie, method: 'POST', body: { name: 'Moderation fixtures' } })).data.id;
  const community = (await api('/api/bootstrap', { cookie: host.cookie })).data.servers.find(server => server.id === made);
  const join = () => api('/api/servers/join', { cookie: guest.cookie, method: 'POST', body: { invite: community.invite } });
  await join(); const channel = community.channels.find(channel => channel.type==='text');
  const moderation = body => api(`/api/servers/${made}/moderation`, { cookie: host.cookie, method:'POST',body:{ userId:guest.id,...body } });
  assert.equal((await api(`/api/servers/${made}/moderation`, { cookie:guest.cookie,method:'POST',body:{userId:host.id,kind:'ban'} })).status,403);
  assert.equal((await moderation({kind:'mute',hours:1})).status,200);
  assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:guest.cookie,method:'POST',body:{text:'muted'}})).status,403);
  await moderation({kind:'unmute'}); assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:guest.cookie,method:'POST',body:{text:'unmuted'}})).status,201);
  await moderation({kind:'ban',hours:1}); assert.equal((await join()).status,403);
  instance.db.prepare("UPDATE moderations SET expiresAt=? WHERE serverId=? AND userId=? AND kind='ban'").run(Date.now()-1000,made,guest.id);
  assert.equal((await join()).status,200);
  await moderation({kind:'kick'});assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:guest.cookie})).status,404);
  await join();assert.equal((await api(`/api/servers/${made}/leave`,{cookie:guest.cookie,method:'POST',body:{}})).status,200);
  assert.equal((await api(`/api/servers/${made}/leave`,{cookie:host.cookie,method:'POST',body:{}})).status,400);
  const audit=(await api(`/api/servers/${made}/audit`,{cookie:host.cookie})).data.entries;assert.ok(audit.some(entry=>entry.action==='member.ban'));
});

test('deleting a DM removes messages and uploaded files for both participants', async () => {
  const one=await register('delete_dm_first'),two=await register('delete_dm_second');
  const conversation=(await api('/api/dms',{cookie:one.cookie,method:'POST',body:{userId:two.id}})).data.id;
  const form=new FormData();form.append('files',new Blob(['private disposable data']),'private.txt');
  const uploaded=(await api('/api/uploads',{cookie:one.cookie,method:'POST',body:form})).data.files[0];
  await api(`/api/conversations/${conversation}/messages`,{cookie:one.cookie,method:'POST',body:{text:'Delete this test conversation',attachments:[uploaded.id]}});
  assert.equal((await api(`/api/dms/${conversation}`,{cookie:eve.cookie,method:'DELETE'})).status,404);
  assert.equal((await api(`/api/dms/${conversation}`,{cookie:two.cookie,method:'DELETE'})).status,200);
  for(const account of [one,two]){assert.equal((await api(`/api/conversations/${conversation}/messages`,{cookie:account.cookie})).status,404);assert.equal((await fetch(base+uploaded.url,{headers:{Cookie:account.cookie}})).status,404);}
  assert.equal(fs.existsSync(path.join(folder,'uploads',uploaded.id)),false);
});

test('8000 characters are accepted exactly; oversized and duplicate messages are rejected',async()=>{
  const one=await register('message_limit_first'),two=await register('message_limit_second');
  const conversation=(await api('/api/dms',{cookie:one.cookie,method:'POST',body:{userId:two.id}})).data.id;
  const send=value=>api(`/api/conversations/${conversation}/messages`,{cookie:one.cookie,method:'POST',body:{text:value}});
  const result=await send('x'.repeat(8000));assert.equal(result.status,201);assert.equal(result.data.message.text.length,8000);
  assert.equal((await send('x'.repeat(8001))).status,400);assert.equal((await send('x'.repeat(8000))).status,429);
});

test('creator claims bind a badge to an account ID and rank the real official server first',async()=>{
  const claimed=await api('/api/auth/register',{method:'POST',body:{username:'MaxUltimat3',displayName:'Project creator',password:PASSWORD,creatorClaimToken:'disposable-creator-token'}});
  assert.equal(claimed.status,201);assert.ok(claimed.data.user.badges.includes('creator'));
  const creator={...claimed.data.user,cookie:claimed.cookie};
  assert.equal((await api('/api/bootstrap',{cookie:creator.cookie})).data.servers.length,0);
  require('../server/community-template').createCommunityInstaller(instance.db,{...CONFIG,communityTemplatePath:path.join(__dirname,'../setup/community.json'),uploadPath:path.join(folder,'uploads')}).install(creator.id);
  const renamed=await api('/api/profile',{cookie:creator.cookie,method:'PATCH',body:{displayName:'A different display name'}});
  assert.ok(renamed.data.user.badges.includes('creator'));assert.equal(renamed.data.user.username,'maxultimat3');
  const ready=(await api('/api/bootstrap',{cookie:creator.cookie})).data.servers;
  const community=ready.find(server=>server.official),official=community.id;
  assert.equal(community.publicListing,true);assert.equal(community.role,'owner');assert.equal(community.roles.length,5);assert.equal(community.channels.length,15);assert.deepEqual(new Set(community.channels.map(channel=>channel.type)),new Set(['text','announcement','forum','media','voice','stage']));
  const duplicate=(await api('/api/servers',{cookie:creator.cookie,method:'POST',body:{name:'Skypixel Framework'}})).data.id;
  await api(`/api/servers/${duplicate}`,{cookie:creator.cookie,method:'PATCH',body:{publicListing:true}});
  const fake=(await api('/api/servers',{cookie:eve.cookie,method:'POST',body:{name:'Skypixel Framework'}})).data.id;
  for(const [account,key] of [[creator,official],[eve,fake]])await api(`/api/servers/${key}`,{cookie:account.cookie,method:'PATCH',body:{publicListing:true}});
  const result=(await api('/api/discovery',{cookie:alice.cookie})).data.servers;
  assert.equal(result[0].id,official);assert.equal(result[0].official,true);assert.equal(result.find(item=>item.id===fake).official,false);assert.equal(result.find(item=>item.id===duplicate).official,false);
  assert.equal(JSON.stringify((await api('/api/config',{cookie:creator.cookie})).data).includes('disposable-creator-token'),false);
  assert.equal((await api(`/api/servers/${official}`,{cookie:creator.cookie,method:'DELETE',body:{confirmName:community.name}})).status,200);
  const upgraded=createApp({...CONFIG,databasePath:path.join(folder,'nexus.sqlite'),uploadPath:path.join(folder,'uploads')});
  try {assert.equal(upgraded.db.prepare("SELECT 1 FROM app_settings WHERE key='officialServerId'").get(),undefined);assert.equal(upgraded.db.prepare("SELECT value FROM app_settings WHERE key='communityTemplate:skypixel-framework'").get().value,official);assert.equal(upgraded.db.prepare('SELECT 1 FROM servers WHERE id=?').get(official),undefined);} finally {upgraded.close();}
  assert.equal((await api('/api/discovery',{cookie:alice.cookie})).data.servers.filter(server=>server.official).length,0);

});

test('upload offsets and HTTP range downloads work at the full 5 GiB boundary using a sparse test file',async()=>{
  const account=await register('sparse_upload_fixture'),size=5*1024**3;
  const started=await api('/api/uploads/start?purpose=profile',{cookie:account.cookie,method:'POST',body:{name:'boundary.gif',size}});
  assert.equal(started.status,201);const key=started.data.id,filename=path.join(folder,'uploads',`.${key}`),tail=Buffer.alloc(1024,99);
  const handle=fs.openSync(filename,'r+');fs.writeSync(handle,Buffer.from('GIF89a'),0,6,0);fs.ftruncateSync(handle,size-1024);fs.closeSync(handle);
  instance.db.prepare('UPDATE upload_sessions SET received=? WHERE id=?').run(size-1024,key);
  const last=await fetch(`${base}/api/uploads/${key}/chunks?offset=${size-1024}`,{method:'PUT',headers:{Origin:base,Cookie:account.cookie,'Content-Type':'application/octet-stream'},body:tail});assert.equal(last.status,200);
  const finished=await api(`/api/uploads/${key}/complete`,{cookie:account.cookie,method:'POST',body:{}});assert.equal(finished.status,201);const file=finished.data.files[0];assert.equal(file.size,size);assert.equal(fs.statSync(path.join(folder,'uploads',file.id)).size,size);
  const response=await fetch(base+file.url,{headers:{Cookie:account.cookie,Range:`bytes=${size-1024}-${size-1}`}});assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),tail);
});

test('presence honors DND and invisible while activity controls automatic idle across multiple tabs',async()=>{
 const account=await register('presence_fixture');const first=await connect(account.cookie),second=await connect(account.cookie);
 await first.emit('presence:activity',{away:true});await second.emit('presence:activity',{away:false});
 assert.equal((await api('/api/bootstrap',{cookie:account.cookie})).data.user.status,'online');
 await second.emit('presence:activity',{away:true});assert.equal((await api('/api/bootstrap',{cookie:account.cookie})).data.user.status,'idle');
 const statusUpdate=second.wait('preferences:status');await api('/api/profile',{cookie:account.cookie,method:'PATCH',body:{status:'dnd'}});assert.equal((await statusUpdate).status,'dnd');await first.emit('presence:activity',{away:false});assert.equal((await api('/api/bootstrap',{cookie:account.cookie})).data.user.status,'dnd');
 await api('/api/profile',{cookie:account.cookie,method:'PATCH',body:{status:'invisible'}});await first.emit('presence:activity',{away:false});assert.equal((await api('/api/bootstrap',{cookie:account.cookie})).data.user.status,'offline');
});
test('stage hosts and listeners have distinct voice permissions and channel capacities are enforced',async()=>{
 const host=await register('stage_host'),listener=await register('stage_listener');const made=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Stage fixture'}})).data.id;
 const server=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(item=>item.id===made);await api('/api/servers/join',{cookie:listener.cookie,method:'POST',body:{invite:server.invite}});
 const stage=(await api(`/api/servers/${made}/channels`,{cookie:host.cookie,method:'POST',body:{name:'live-stage',type:'stage'}})).data.id;
 await api(`/api/channels/${stage}`,{cookie:host.cookie,method:'PATCH',body:{userLimit:1}});const first=await connect(host.cookie),second=await connect(listener.cookie);assert.equal((await first.emit('voice:join',{conversationId:stage})).stageListener,false);assert.equal((await second.emit('voice:join',{conversationId:stage})).ok,false);await api(`/api/channels/${stage}`,{cookie:host.cookie,method:'PATCH',body:{userLimit:2}});assert.equal((await second.emit('voice:join',{conversationId:stage})).stageListener,true);
 assert.equal((await second.emit('voice:update',{muted:false})).ok,false);assert.equal((await second.emit('voice:update',{camera:true})).ok,false);assert.equal((await second.emit('voice:update',{muted:true})).ok,true);
 await first.emit('voice:leave');await second.emit('voice:leave');
});
test('pinned messages outside the current history page can be loaded in a bounded authorized window',async()=>{
 const one=await register('pin_window_first'),two=await register('pin_window_second');const conversation=(await api('/api/dms',{cookie:one.cookie,method:'POST',body:{userId:two.id}})).data.id;
 const insert=instance.db.prepare('INSERT INTO messages(id,conversationId,authorId,text,createdAt,pinned) VALUES (?,?,?,?,?,?)');const keys=[];
 for(let index=0;index<80;index++){const key=`m_window_${String(index).padStart(3,'0')}`;keys.push(key);insert.run(key,conversation,one.id,`History ${index}`,'2026-01-01T12:00:00Z',index===20?1:0);}
 const around=await api(`/api/conversations/${conversation}/messages?around=${keys[20]}`,{cookie:two.cookie});assert.equal(around.status,200);assert.ok(around.data.messages.some(message=>message.id===keys[20]));assert.ok(around.data.messages.length<=50);assert.equal(around.data.hasNewer,true);
 assert.equal((await api(`/api/messages/${keys[20]}`,{cookie:eve.cookie})).status,404);assert.equal((await api(`/api/conversations/${conversation}/messages?around=${keys[20]}`,{cookie:eve.cookie})).status,404);
});

test('blocks hide server history, pins, threads, members, reactions, files and unread counts while preserving stored messages', async () => {
  const a=await register('block_owner'), b=await register('block_target'), c=await register('block_observer');
  const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Blocking checks'}})).data;
  let snapshot=(await api('/api/bootstrap',{cookie:a.cookie})).data;
  const space=snapshot.servers.find(item=>item.id===created.id),channel=space.channels.find(item=>item.type==='text');
  for(const account of [b,c])assert.equal((await api('/api/servers/join',{cookie:account.cookie,method:'POST',body:{invite:space.invite}})).status,200);
  const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
  const posted=(await api(`/api/conversations/${channel.id}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Hidden after blocking'}})).data.message;
  await api(`/api/messages/${posted.id}/pin`,{cookie:a.cookie,method:'POST',body:{}});
  const visible=(await api(`/api/conversations/${channel.id}/messages`,{cookie:c.cookie,method:'POST',body:{text:'Still visible',replyTo:posted.id}})).data.message;
  await api(`/api/messages/${visible.id}/reactions`,{cookie:b.cookie,method:'POST',body:{emoji:'👀'}});
  const forum=(await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:'block-forum',type:'forum'}})).data.id;
  const topic=(await api(`/api/conversations/${forum}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Hidden topic'}})).data.message;
  await api(`/api/conversations/${forum}/messages`,{cookie:c.cookie,method:'POST',body:{text:'Reply under hidden topic',threadId:topic.id}});
  const file=new FormData();file.append('files',new Blob(['hidden file']),'blocked.txt');
  const upload=(await api('/api/uploads',{cookie:b.cookie,method:'POST',body:file})).data.files[0];
  await api(`/api/conversations/${channel.id}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Hidden attachment',attachments:[upload.id]}});
  assert.equal((await api('/api/blocks/'+a.id,{cookie:a.cookie,method:'PUT',body:{}})).status,400);
  assert.equal((await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'PUT',body:{}})).status,200);
  assert.equal((await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'PUT',body:{}})).status,200);
  assert.equal((await api('/api/blocks/'+b.id,{method:'PUT',body:{}})).status,401);
  assert.deepEqual((await api('/api/blocks',{cookie:a.cookie})).data.users.map(user=>user.id),[b.id]);
  assert.deepEqual((await api('/api/blocks',{cookie:c.cookie})).data.users,[]);
  snapshot=(await api('/api/bootstrap',{cookie:a.cookie})).data;
  assert.deepEqual(snapshot.blockedIds,[b.id]);assert.ok(!snapshot.dms.some(item=>item.id===dm));
  const current=snapshot.servers.find(item=>item.id===space.id);
  assert.ok(!current.members.some(member=>member.userId===b.id));assert.ok(!snapshot.users.some(user=>user.id===b.id));
  assert.equal(current.channels.find(item=>item.id===channel.id).unread,1);
  assert.equal(current.channels.find(item=>item.id===forum).unread,0);
  const history=(await api(`/api/conversations/${channel.id}/messages`,{cookie:a.cookie})).data.messages;
  assert.deepEqual(history.map(message=>message.id),[visible.id]);assert.equal(history[0].replyTo,null);assert.deepEqual(history[0].reactions,[]);
  assert.deepEqual((await api(`/api/conversations/${channel.id}/messages?pinned=true`,{cookie:a.cookie})).data.messages,[]);
  assert.equal((await api('/api/messages/'+posted.id,{cookie:a.cookie})).status,404);
  assert.equal((await api(`/api/conversations/${channel.id}/messages?around=${posted.id}`,{cookie:a.cookie})).status,404);
  assert.equal((await api(`/api/conversations/${forum}/messages?q=Reply`,{cookie:a.cookie})).data.messages.length,0);
  assert.equal((await api(`/api/conversations/${forum}/messages?threadId=${topic.id}`,{cookie:a.cookie})).status,404);
  assert.equal((await fetch(base+upload.url,{headers:{Cookie:a.cookie}})).status,404);
  assert.deepEqual((await api('/api/users?q=block_target',{cookie:a.cookie})).data.users,[]);
  for(const account of [a,b]){
    assert.equal((await api('/api/dms',{cookie:account.cookie,method:'POST',body:{userId:account===a?b.id:a.id}})).status,403);
    assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:account.cookie,method:'POST',body:{text:'Blocked DM'}})).status,403);
  }
  assert.ok(instance.db.prepare('SELECT 1 FROM messages WHERE id=?').get(posted.id));
  await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'DELETE'});
  assert.equal((await api('/api/messages/'+posted.id,{cookie:a.cookie})).status,200);
  assert.ok((await api('/api/bootstrap',{cookie:a.cookie})).data.dms.some(item=>item.id===dm));
});

test('live blocking stops existing media peers, denies signaling and hides incoming server messages and typing', async () => {
  const a=await register('live_blocker'),b=await register('live_target'),c=await register('live_observer');
  const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Live block checks'}})).data;
  const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(item=>item.id===created.id);
  for(const account of [b,c])await api('/api/servers/join',{cookie:account.cookie,method:'POST',body:{invite:space.invite}});
  const channel=space.channels.find(item=>item.type==='text'),roomId=space.channels.find(item=>item.type==='voice').id;
  const aa=await connect(a.cookie),bb=await connect(b.cookie),cc=await connect(c.cookie);
  await aa.emit('voice:join',{conversationId:roomId});const joined=await bb.emit('voice:join',{conversationId:roomId});
  const aSocket=joined.peers.find(peer=>peer.userId===a.id).socketId;
  const bSocket=[...io.sockets.sockets.values()].find(socket=>socket.userId===b.id).id;
  const removedA=aa.wait('voice:peer-blocked'),removedB=bb.wait('voice:peer-blocked');
  await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'PUT',body:{}});
  assert.deepEqual((await removedA).socketIds,[bSocket]);assert.deepEqual((await removedB).socketIds,[aSocket]);
  assert.equal((await bb.emit('rtc:signal',{to:aSocket,type:'offer',data:{type:'offer',sdp:'fixture'}})).ok,false);
  assert.equal((await aa.emit('rtc:signal',{to:bSocket,type:'candidate',data:{candidate:'fixture'}})).ok,false);
  assert.ok(!(await aa.emit('voice:join',{conversationId:roomId})).peers.some(peer=>peer.userId===b.id));
  const marker=aa.events.length,seen=cc.wait('message:new',message=>message.authorId===b.id);
  const post=await api(`/api/conversations/${channel.id}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Blocked live message'}});
  assert.equal((await seen).id,post.data.message.id);
  const typing=cc.wait('typing',payload=>payload.userId===b.id);await bb.emit('typing',{conversationId:channel.id});await typing;
  assert.ok(!aa.events.slice(marker).some(event=>event.event==='message:new'&&event.payload.id===post.data.message.id));
  assert.ok(!aa.events.slice(marker).some(event=>event.event==='typing'&&event.payload.userId===b.id));
  const available=aa.wait('voice:peer-available');await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'DELETE'});
  assert.equal((await available).peer.userId,b.id);
  assert.equal((await bb.emit('rtc:signal',{to:aSocket,type:'offer',data:{type:'offer',sdp:'fixture'}})).ok,true);
  for(const client of [aa,bb,cc])await client.emit('voice:leave');
  const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
  await aa.emit('voice:join',{conversationId:dm});await bb.emit('voice:join',{conversationId:dm});
  const incoming=bb.wait('call:incoming');assert.equal((await aa.emit('call:invite',{conversationId:dm})).ok,true);await incoming;
  const endedA=aa.wait('voice:removed',event=>event.conversationId===dm),endedB=bb.wait('voice:removed',event=>event.conversationId===dm);
  await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'PUT',body:{}});await endedA;await endedB;
  assert.equal((await bb.emit('call:invite',{conversationId:dm})).ok,false);
});

test('external GIF references are restricted to provider media, respect attachments permissions and survive reload',async()=>{
  const account=await register('gif_sender');const created=(await api('/api/servers',{cookie:account.cookie,method:'POST',body:{name:'GIF validation'}})).data;
  const space=(await api('/api/bootstrap',{cookie:account.cookie})).data.servers.find(item=>item.id===created.id),channel=space.channels.find(item=>item.type==='text');
  const gif={provider:'giphy',providerId:'Abc123',url:'https://media2.giphy.com/media/v1.safe/Abc123/giphy.gif?cid=fixture',title:'Sample GIF'};
  const send=providerGifs=>api(`/api/conversations/${channel.id}/messages`,{cookie:account.cookie,method:'POST',body:{providerGifs}});
  for(const url of ['https://evil.example/media/Abc123/giphy.gif','https://media.giphy.com.evil.example/media/Abc123/giphy.gif','http://media.giphy.com/media/Abc123/giphy.gif','https://media.giphy.com/media/Other/giphy.gif','https://media.giphy.com/media/Abc123/script.svg','https://media.giphy.com:444/media/Abc123/giphy.gif','https://user:pass@media.giphy.com/media/Abc123/giphy.gif'])assert.equal((await send([{...gif,url}])).status,400);
  assert.equal((await send(Array(5).fill(gif))).status,400);
  const sent=await send([gif]);assert.equal(sent.status,201);assert.equal(sent.data.message.attachments[0].url,gif.url);
  const history=(await api(`/api/conversations/${channel.id}/messages`,{cookie:account.cookie})).data.messages;
  assert.equal(history[0].attachments[0].provider,'giphy');assert.equal(history[0].attachments[0].name,'Sample GIF');
  assert.equal((await api('/api/config')).data.giphyApiKey,'');
  assert.equal((await api('/api/config',{cookie:account.cookie})).data.giphyApiKey,'disposable-public-web-key');
  const member=await register('gif_member');await api('/api/servers/join',{cookie:member.cookie,method:'POST',body:{invite:space.invite}});
  await api('/api/channels/'+channel.id,{cookie:account.cookie,method:'PATCH',body:{allowAttachments:false}});
  assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:member.cookie,method:'POST',body:{providerGifs:[gif]}})).status,403);
});

test('server defaults and role overrides enforce messages, reactions, topics, pins and view access in HTTP and live delivery',async()=>{
 const a=await register('permission_owner'),b=await register('permission_member');
 const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Permission checks'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(space=>space.id===created.id),channel=space.channels.find(channel=>channel.type==='text');
 await api('/api/servers/join',{cookie:b.cookie,method:'POST',body:{invite:space.invite}});
 assert.equal((await api(`/api/servers/${space.id}/permissions`,{cookie:b.cookie,method:'PATCH',body:{defaultPermissions:{sendMessages:false}}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/permissions`,{cookie:a.cookie,method:'PATCH',body:{defaultPermissions:{manageServer:true}}})).status,400);
 const post=(await api(`/api/conversations/${channel.id}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Permission target'}})).data.message;
 const role=(await api(`/api/servers/${space.id}/roles`,{cookie:a.cookie,method:'POST',body:{name:'Writer',permissions:['sendMessages','pinMessages'],deniedPermissions:['addReactions']}})).data.role;
 await api(`/api/servers/${space.id}/members/${b.id}/roles`,{cookie:a.cookie,method:'PUT',body:{roleIds:[role.id]}});
 await api(`/api/servers/${space.id}/permissions`,{cookie:a.cookie,method:'PATCH',body:{defaultPermissions:{sendMessages:false}}});
 assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Explicit role grant'}})).status,201);
 assert.equal((await api(`/api/messages/${post.id}/reactions`,{cookie:b.cookie,method:'POST',body:{emoji:'👍'}})).status,403);
 assert.equal((await api(`/api/messages/${post.id}/pin`,{cookie:b.cookie,method:'POST',body:{}})).status,200);
 const forum=(await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:'topic-policy',type:'forum'}})).data.id;
 const question=(await api(`/api/conversations/${forum}/messages`,{cookie:a.cookie,method:'POST',body:{text:'A question for permission checks'}})).data.message;
 await api(`/api/servers/${space.id}/permissions`,{cookie:a.cookie,method:'PATCH',body:{defaultPermissions:{createTopics:false,replyToTopics:false}}});
 assert.equal((await api(`/api/conversations/${forum}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Denied new topic'}})).status,403);
 assert.equal((await api(`/api/conversations/${forum}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Denied reply',threadId:question.id}})).status,403);
 await api(`/api/servers/${space.id}/roles/${role.id}`,{cookie:a.cookie,method:'PATCH',body:{permissions:['sendMessages','pinMessages','replyToTopics']}});
 assert.equal((await api(`/api/conversations/${forum}/messages`,{cookie:b.cookie,method:'POST',body:{text:'Allowed reply',threadId:question.id}})).status,201);
 const socket=await connect(b.cookie);const revoked=socket.wait('workspace:updated');
 await api(`/api/servers/${space.id}/roles/${role.id}`,{cookie:a.cookie,method:'PATCH',body:{deniedPermissions:['addReactions','viewChannels']}});await revoked;
 const hidden=(await api('/api/bootstrap',{cookie:b.cookie})).data.servers.find(space=>space.id===created.id);assert.deepEqual(hidden.channels,[]);
 assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:b.cookie})).status,404);
 assert.equal((await socket.emit('typing',{conversationId:channel.id})).ok,false);
});

test('delegated role management cannot change protected roles, grant missing powers or assign itself permissions',async()=>{
 const a=await register('role_owner'),b=await register('role_manager'),c=await register('role_recipient');
 const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Role delegation'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(space=>space.id===created.id);
 for(const account of [b,c])await api('/api/servers/join',{cookie:account.cookie,method:'POST',body:{invite:space.invite}});
 const manager=(await api(`/api/servers/${space.id}/roles`,{cookie:a.cookie,method:'POST',body:{name:'Role manager',permissions:['manageRoles','pinMessages']}})).data.role;
 await api(`/api/servers/${space.id}/members/${b.id}/roles`,{cookie:a.cookie,method:'PUT',body:{roleIds:[manager.id]}});
 assert.equal((await api(`/api/servers/${space.id}/roles`,{cookie:b.cookie,method:'POST',body:{name:'Escalation',permissions:['manageServer']}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/roles`,{cookie:b.cookie,method:'POST',body:{name:'Missing capability',permissions:['banMembers']}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/roles/${manager.id}`,{cookie:b.cookie,method:'PATCH',body:{name:'Changed manager'}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/roles/${manager.id}`,{cookie:b.cookie,method:'DELETE'})).status,403);
 const lower=await api(`/api/servers/${space.id}/roles`,{cookie:b.cookie,method:'POST',body:{name:'Pin helper',permissions:['pinMessages'],deniedPermissions:['shareScreen']}});assert.equal(lower.status,201);
 assert.equal((await api(`/api/servers/${space.id}/members/${b.id}/roles`,{cookie:b.cookie,method:'PUT',body:{roleIds:[manager.id,lower.data.role.id]}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/members/${c.id}/roles`,{cookie:b.cookie,method:'PUT',body:{roleIds:[manager.id]}})).status,403);
 assert.equal((await api(`/api/servers/${space.id}/members/${c.id}/roles`,{cookie:b.cookie,method:'PUT',body:{roleIds:[lower.data.role.id]}})).status,200);
 const form=new FormData();form.append('files',new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')]),'role.gif');
 assert.equal((await api(`/api/uploads?purpose=role&serverId=${space.id}`,{cookie:b.cookie,method:'POST',body:form})).status,201);
});

test('forum covers retain server ownership and posts keep isolated text and attachment replies',async()=>{
 const a=await register('forum_cover_owner'),b=await register('forum_post_author'),c=await register('forum_outsider');
 const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Forum posts'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(space=>space.id===created.id);
 await api('/api/servers/join',{cookie:b.cookie,method:'POST',body:{invite:space.invite}});
 const form=new FormData();form.append('files',new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')]),'cover.gif');
 const cover=(await api(`/api/uploads?purpose=channel&serverId=${space.id}`,{cookie:a.cookie,method:'POST',body:form})).data.files[0];
 const invalid=await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:'invalid-cover',type:'forum',cover:'/files/f_missing'}});assert.equal(invalid.status,400);assert.ok(!instance.db.prepare("SELECT 1 FROM channels WHERE name='invalid-cover' AND serverId=?").get(space.id));
 const crop={x:17,y:83,zoom:1.75};const board=(await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:'discussions',type:'forum',cover:cover.url,coverCrop:crop}})).data.id;
 const channel=(await api('/api/bootstrap',{cookie:b.cookie})).data.servers.find(server=>server.id===space.id).channels.find(channel=>channel.id===board);assert.equal(channel.cover,cover.url);assert.deepEqual(channel.coverCrop,crop);
 assert.equal((await fetch(base+cover.url,{headers:{Cookie:b.cookie}})).status,200);assert.equal((await fetch(base+cover.url,{headers:{Cookie:c.cookie}})).status,404);
 const root=(await api(`/api/conversations/${board}/messages`,{cookie:b.cookie,method:'POST',body:{text:'A post title\n**Formatted body**'}})).data.message;
 const reply=(await api(`/api/conversations/${board}/messages`,{cookie:a.cookie,method:'POST',body:{text:'A reply in its own chat',threadId:root.id}})).data.message;
 assert.deepEqual((await api(`/api/conversations/${board}/messages`,{cookie:a.cookie})).data.messages.map(message=>message.id),[root.id]);
 assert.deepEqual((await api(`/api/conversations/${board}/messages?threadId=${root.id}`,{cookie:b.cookie})).data.messages.map(message=>message.id),[reply.id]);
 assert.equal((await api(`/api/conversations/${board}/messages`,{cookie:c.cookie})).status,404);
 const other=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Other forum server'}})).data.id;
 assert.equal((await api(`/api/servers/${other}/channels`,{cookie:a.cookie,method:'POST',body:{name:'wrong-cover',type:'forum',cover:cover.url}})).status,400);
});

test('media accepts documents, retains file requirements, image download policy and bounded filename search',async()=>{
 const a=await register('collection_owner');const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Collections'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created.id),text=space.channels.find(channel=>channel.type==='text').id;
 const create=async(name,type)=>(await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name,type}})).data.id;
 const media=await create('gallery','media');
 async function upload(name,bytes){const form=new FormData();form.append('files',new Blob([bytes]),name);return (await api('/api/uploads',{cookie:a.cookie,method:'POST',body:form})).data.files[0];}
 const imageBytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 const image=await upload('artwork.gif',imageBytes),document=await upload('release-notes.txt','A real document');
 assert.equal((await api(`/api/conversations/${media}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[document.id],spoilers:[document.id]}})).status,201);
 assert.equal((await api(`/api/conversations/${media}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Text without a resource'}})).status,400);
 assert.equal((await api(`/api/conversations/${media}/messages?q=release-notes`,{cookie:a.cookie})).data.messages.length,1);
 assert.equal((await api(`/api/conversations/${text}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[image.id]}})).status,201);
 assert.equal((await fetch(base+image.url,{headers:{Cookie:a.cookie}})).status,200);
 assert.equal((await fetch(base+image.url+'?download=1',{headers:{Cookie:a.cookie}})).status,403);
 const recipient=await register('collection_dm_recipient'),dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:recipient.id}})).data.id;
 const privateImage=await upload('private.gif',imageBytes);
 assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[privateImage.id]}})).status,201);
 assert.equal((await fetch(base+privateImage.url+'?download=1',{headers:{Cookie:recipient.cookie}})).status,200);
 assert.equal((await fetch(base+privateImage.url+'?download=1')).status,401);
 const galleryImage=await upload('gallery.gif',imageBytes);await api(`/api/conversations/${media}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[galleryImage.id]}});
 const info=await api(galleryImage.url+'?download=1&info=1',{cookie:a.cookie});assert.equal(info.status,200);assert.equal(info.data.url,galleryImage.url+'?download=1');
 const download=await fetch(base+info.data.url,{headers:{Cookie:a.cookie}});assert.match(download.headers.get('content-disposition'),/^attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),imageBytes);
 assert.equal((await api('/api/channels/'+text,{cookie:a.cookie,method:'PATCH',body:{type:'media'}})).status,200);
 const plain=space.channels.find(channel=>channel.type==='text'&&channel.id!==text).id;await api(`/api/conversations/${plain}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Keep this text history'}});
 assert.equal((await api('/api/channels/'+plain,{cookie:a.cookie,method:'PATCH',body:{type:'media'}})).status,400);
});

test('independent microphone, camera and screen grants are enforced and revoked for an active voice participant',async()=>{
 const a=await register('voice_policy_owner'),b=await register('voice_policy_member');const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Voice policies'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created.id),voiceId=space.channels.find(channel=>channel.type==='voice').id;
 await api('/api/servers/join',{cookie:b.cookie,method:'POST',body:{invite:space.invite}});
 const role=(await api(`/api/servers/${space.id}/roles`,{cookie:a.cookie,method:'POST',body:{name:'Screen-only listener',permissions:[],deniedPermissions:['speak','useVideo']}})).data.role;
 await api(`/api/servers/${space.id}/members/${b.id}/roles`,{cookie:a.cookie,method:'PUT',body:{roleIds:[role.id]}});
 const socket=await connect(b.cookie),joined=await socket.emit('voice:join',{conversationId:voiceId});assert.equal(joined.ok,true);assert.equal(joined.canSpeak,false);
 assert.equal((await socket.emit('voice:update',{muted:false})).ok,false);assert.equal((await socket.emit('voice:update',{camera:true})).ok,false);assert.equal((await socket.emit('voice:update',{sharing:true})).ok,true);
 const removed=socket.wait('voice:removed',payload=>payload.conversationId===voiceId);
 await api(`/api/servers/${space.id}/roles/${role.id}`,{cookie:a.cookie,method:'PATCH',body:{deniedPermissions:['speak','useVideo','connectVoice']}});await removed;
 assert.equal((await socket.emit('voice:join',{conversationId:voiceId})).ok,false);
});

test('account preferences are private, merge partial patches, and synchronize separate authenticated sessions',async()=>{
 const a=await register('sync_account'),b=await register('sync_other');
 const second=(await api('/api/auth/login',{method:'POST',body:{username:a.username,password:PASSWORD}})).cookie;
 assert.equal((await api('/api/preferences')).status,401);assert.equal((await api('/api/preferences',{cookie:a.cookie})).data.revision,0);
 const observer=await connect(second),update=observer.wait('preferences:updated',value=>value.preferences.palette==='blue');
 assert.equal((await api('/api/preferences',{cookie:a.cookie,method:'PATCH',body:{preferences:{palette:'blue',soundVolume:31}}})).status,200);assert.equal((await update).revision,1);
 await api('/api/preferences',{cookie:second,method:'PATCH',body:{preferences:{motion:false}}});
 const saved=(await api('/api/preferences',{cookie:a.cookie})).data;assert.equal(saved.preferences.palette,'blue');assert.equal(saved.preferences.soundVolume,31);assert.equal(saved.preferences.motion,false);
 assert.equal((await api('/api/preferences',{cookie:b.cookie})).data.preferences.palette,'coral');
 assert.equal((await api('/api/preferences',{cookie:a.cookie,method:'PATCH',body:{preferences:{sidebarLeft:1000}}})).status,400);
 assert.equal((await api('/api/preferences',{cookie:a.cookie,method:'PATCH',body:{preferences:{soundVolume:101}}})).status,400);
 assert.equal((await api('/api/bootstrap',{cookie:second})).data.accountPreferences.revision,2);
});
test('everyone mentions require a grant and notify only eligible channel members; here stays in its DM',async()=>{
 const a=await register('ping_owner'),b=await register('ping_member'),c=await register('ping_visitor');
 const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Mention policy'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created.id),channel=space.channels.find(channel=>channel.type==='text').id;
 for(const account of [b,c])await api('/api/servers/join',{cookie:account.cookie,method:'POST',body:{invite:space.invite}});
 assert.equal((await api(`/api/conversations/${channel}/messages`,{cookie:b.cookie,method:'POST',body:{text:'@everyone unauthorized'}})).status,403);
 const mention=(await api(`/api/conversations/${channel}/messages`,{cookie:a.cookie,method:'POST',body:{text:'@everyone A real server announcement'}})).data.message;
 assert.deepEqual(new Set(mention.mentions),new Set([a.id,b.id,c.id]));
 const code=(await api(`/api/conversations/${channel}/messages`,{cookie:a.cookie,method:'POST',body:{text:'`@everyone` and \\@everyone\n```\n@everyone\n```'}})).data.message;assert.deepEqual(code.mentions,[]);
 const privateChannel=(await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:'private-ping',type:'text',private:true}})).data.id;
 assert.equal((await api(`/api/channels/${privateChannel}`,{cookie:a.cookie,method:'PATCH',body:{private:true,allowedRoleIds:[]}})).status,200);
 assert.deepEqual((await api(`/api/conversations/${privateChannel}/messages`,{cookie:a.cookie,method:'POST',body:{text:'@everyone Private'}})).data.message.mentions,[a.id]);
 const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
 assert.deepEqual(new Set((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{text:'@here Both DM participants'}})).data.message.mentions),new Set([a.id,b.id]));
 assert.deepEqual((await api(`/api/conversations/${channel}/messages`,{cookie:b.cookie,method:'POST',body:{text:'@here is not a server-wide ping'}})).data.message.mentions,[]);
});
test('attachment spoiler flags persist for images and documents and reject unknown files',async()=>{
 const a=await register('spoiler_sender'),b=await register('spoiler_recipient'),dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
 const form=new FormData();form.append('files',new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')]),'sensitive.gif');
 const image=(await api('/api/uploads',{cookie:a.cookie,method:'POST',body:form})).data.files[0];
 const sent=await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[image.id],spoilers:[image.id]}});assert.equal(sent.status,201);assert.equal(sent.data.message.attachments[0].spoiler,true);
 assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:b.cookie})).data.messages[0].attachments[0].spoiler,true);
 assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Invalid spoiler',spoilers:['f_missing']}})).status,400);
 const document=new FormData();document.append('files',new Blob(['A document']),'notes.txt');const file=(await api('/api/uploads',{cookie:a.cookie,method:'POST',body:document})).data.files[0];
 assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[file.id],spoilers:[file.id]}})).status,201);
});
test('new pin indicators survive history navigation, synchronize reads, and hide blocked pins',async()=>{
 const a=await register('pin_reader'),b=await register('pin_author'),c=await register('pin_outsider');
 const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
 const second=(await api('/api/auth/login',{method:'POST',body:{username:a.username,password:PASSWORD}})).cookie,observer=await connect(second);
 const post=(await api(`/api/conversations/${dm}/messages`,{cookie:b.cookie,method:'POST',body:{text:'A newly pinned message'}})).data.message;
 const update=observer.wait('pins:updated',payload=>payload.conversationId===dm&&payload.pins.hasNew);
 await api(`/api/messages/${post.id}/pin`,{cookie:b.cookie,method:'POST',body:{}});const initial=(await update).pins;assert.equal(initial.count,1);
 const snapshot=async cookie=>(await api('/api/bootstrap',{cookie})).data.dms.find(item=>item.id===dm)?.pins;
 assert.equal((await snapshot(a.cookie)).hasNew,true);await api(`/api/conversations/${dm}/messages?around=${post.id}`,{cookie:a.cookie});assert.equal((await snapshot(a.cookie)).hasNew,true);
 assert.equal((await api(`/api/conversations/${dm}/pins/read`,{cookie:c.cookie,method:'POST',body:{}})).status,404);
 assert.equal((await api(`/api/conversations/${dm}/pins/read`,{cookie:a.cookie,method:'POST',body:{revision:-1}})).status,400);
 await api(`/api/conversations/${dm}/pins/read`,{cookie:a.cookie,method:'POST',body:{revision:0}});assert.equal((await snapshot(a.cookie)).hasNew,true);
 const read=observer.wait('pins:read',payload=>payload.conversationId===dm&&!payload.pins.hasNew);
 await api(`/api/conversations/${dm}/pins/read`,{cookie:a.cookie,method:'POST',body:{revision:initial.revision}});await read;assert.equal((await snapshot(second)).hasNew,false);
 assert.equal((await snapshot(b.cookie)).hasNew,true);
 await api(`/api/messages/${post.id}/pin`,{cookie:b.cookie,method:'POST',body:{}});assert.equal((await snapshot(a.cookie)).count,0);
 await api(`/api/messages/${post.id}/pin`,{cookie:b.cookie,method:'POST',body:{}});assert.ok((await snapshot(a.cookie)).revision>initial.revision);
 await api('/api/blocks/'+b.id,{cookie:a.cookie,method:'PUT',body:{}});assert.equal((await api('/api/bootstrap',{cookie:a.cookie})).data.dms.some(item=>item.id===dm),false);
});
test('removed channel types are rejected for creation and conversion without modifying history',async()=>{
 const a=await register('simple_channel_owner'),created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Simple channels'}})).data;
 const space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created.id),channel=space.channels.find(channel=>channel.type==='text');
 const post=(await api(`/api/conversations/${channel.id}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Keep this existing message'}})).data.message;
 for(const type of ['qa','resources']){assert.equal((await api(`/api/servers/${space.id}/channels`,{cookie:a.cookie,method:'POST',body:{name:type,type}})).status,400);assert.equal((await api(`/api/channels/${channel.id}`,{cookie:a.cookie,method:'PATCH',body:{type}})).status,400);}
 assert.equal((await api(`/api/conversations/${channel.id}/messages`,{cookie:a.cookie})).data.messages[0].id,post.id);
});

test('artwork positions validate numeric bounds, persist across sessions and keep original GIF bytes',async()=>{
 const a=await register('crop_owner'),b=await register('crop_member');const bytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 const form=new FormData();form.append('files',new Blob([bytes]),'original.gif');const image=(await api('/api/uploads?purpose=profile',{cookie:a.cookie,method:'POST',body:form})).data.files[0];
 const crop={x:12.5,y:84,zoom:2.1};const profile=await api('/api/profile',{cookie:a.cookie,method:'PATCH',body:{avatar:image.url,avatarCrop:crop,banner:image.url,bannerCrop:{x:100,y:0,zoom:4}}});assert.equal(profile.status,200);assert.deepEqual(profile.data.user.avatarCrop,crop);
 assert.deepEqual(Buffer.from(await (await fetch(base+image.url,{headers:{Cookie:a.cookie}})).arrayBuffer()),bytes);
 for(const invalid of [{x:-1},{y:101},{zoom:4.1},{x:'0'},{x:null},{css:'url(evil)'},[],true])assert.equal((await api('/api/profile',{cookie:a.cookie,method:'PATCH',body:{avatarCrop:invalid}})).status,400);
 assert.equal((await api('/api/profile',{cookie:b.cookie,method:'PATCH',body:{avatar:image.url,avatarCrop:crop}})).status,400);
 const created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Artwork positions'}})).data.id;
 assert.equal((await api(`/api/servers/${created}`,{cookie:a.cookie,method:'PATCH',body:{iconCrop:crop,bannerCrop:crop,publicListing:true}})).status,200);
 const listed=(await api('/api/discovery',{cookie:b.cookie})).data.servers.find(server=>server.id===created);assert.deepEqual(listed.iconCrop,crop);
 const second=(await api('/api/auth/login',{method:'POST',body:{username:a.username,password:PASSWORD}})).cookie;assert.deepEqual((await api('/api/bootstrap',{cookie:second})).data.user.avatarCrop,crop);
 assert.equal((await api(`/api/servers/${created}`,{cookie:b.cookie,method:'PATCH',body:{iconCrop:crop}})).status,404);
});

test('member display roles and owner position persist while role ordering requires server ownership',async()=>{
 const a=await register('role_order_owner'),b=await register('role_order_member'),created=(await api('/api/servers',{cookie:a.cookie,method:'POST',body:{name:'Member display'}})).data.id;
 let space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created);await api('/api/servers/join',{cookie:b.cookie,method:'POST',body:{invite:space.invite}});
 const first=(await api(`/api/servers/${created}/roles`,{cookie:a.cookie,method:'POST',body:{name:'First display',displayMembers:true,permissions:[]}})).data.role;
 const second=(await api(`/api/servers/${created}/roles`,{cookie:a.cookie,method:'POST',body:{name:'Second display',displayMembers:true,permissions:['manageRoles']}})).data.role;
 await api(`/api/servers/${created}/members/${b.id}/roles`,{cookie:a.cookie,method:'PUT',body:{roleIds:[first.id,second.id]}});
 const order=[second.id,first.id,'__owner__'];assert.equal((await api(`/api/servers/${created}/role-order`,{cookie:b.cookie,method:'PUT',body:{roleIds:order}})).status,403);
 for(const bad of [[first.id],[first.id,first.id,'__owner__'],[first.id,second.id,'r_foreign']])assert.equal((await api(`/api/servers/${created}/role-order`,{cookie:a.cookie,method:'PUT',body:{roleIds:bad}})).status,400);
 assert.equal((await api(`/api/servers/${created}/role-order`,{cookie:a.cookie,method:'PUT',body:{roleIds:order}})).status,200);
 assert.equal((await api(`/api/servers/${created}/owner-role`,{cookie:a.cookie,method:'PATCH',body:{displayMembers:true}})).status,200);assert.equal((await api(`/api/servers/${created}/owner-role`,{cookie:b.cookie,method:'PATCH',body:{displayMembers:false}})).status,403);
 space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created);assert.deepEqual(space.roles.map(role=>role.id),[second.id,first.id]);assert.equal(space.ownerRolePosition,2);assert.equal(space.ownerRoleDisplay,true);assert.ok(space.roles.every(role=>role.displayMembers));
 assert.equal((await api(`/api/servers/${created}/roles/${first.id}`,{cookie:a.cookie,method:'PATCH',body:{displayMembers:'true'}})).status,400);
 await api(`/api/servers/${created}/roles/${first.id}`,{cookie:a.cookie,method:'PATCH',body:{displayMembers:false,iconCrop:{x:80,y:20,zoom:1.5}}});space=(await api('/api/bootstrap',{cookie:a.cookie})).data.servers.find(server=>server.id===created);assert.equal(space.roles[1].displayMembers,false);assert.deepEqual(space.roles[1].iconCrop,{x:80,y:20,zoom:1.5});
});

test('attachment preview crops apply only to this message image and preserve original file bytes',async()=>{
 const a=await register('preview_crop_owner'),b=await register('preview_crop_peer');const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
 const bytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64'),form=new FormData();form.append('files',new Blob([bytes]),'preview.gif');const file=(await api('/api/uploads',{cookie:a.cookie,method:'POST',body:form})).data.files[0];
 for(const crops of [{missing:{x:10}}, {[file.id]:{zoom:5}}, {[file.id]:{x:'0'}}, []])assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[file.id],attachmentCrops:crops}})).status,400);
 const crop={x:18,y:82,zoom:1.7};const sent=await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[file.id],attachmentCrops:{[file.id]:crop},spoilers:[file.id]}});assert.equal(sent.status,201);assert.deepEqual(sent.data.message.attachments[0].previewCrop,crop);assert.equal(sent.data.message.attachments[0].spoiler,true);
 const history=(await api(`/api/conversations/${dm}/messages`,{cookie:b.cookie})).data.messages;assert.deepEqual(history[0].attachments[0].previewCrop,crop);assert.deepEqual(Buffer.from(await (await fetch(base+file.url,{headers:{Cookie:b.cookie}})).arrayBuffer()),bytes);
 const docForm=new FormData();docForm.append('files',new Blob(['Document']),'notes.txt');const doc=(await api('/api/uploads',{cookie:a.cookie,method:'POST',body:docForm})).data.files[0];
 assert.equal((await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[doc.id],attachmentCrops:{[doc.id]:crop}}})).status,400);
});

test('server unread counters persist per channel and reading one room leaves other room activity intact',async()=>{
 const owner=await register('activity_owner'),reader=await register('activity_reader');
 const created=await api('/api/servers',{cookie:owner.cookie,method:'POST',body:{name:'Activity rooms'}});assert.equal(created.status,201);
 const serverId=created.data.id;let ownerSnapshot=(await api('/api/bootstrap',{cookie:owner.cookie})).data;
 const community=ownerSnapshot.servers.find(server=>server.id===serverId),first=community.channels.find(channel=>channel.type==='text').id,second=community.channels.filter(channel=>channel.type==='text')[1].id;
 assert.equal((await api('/api/servers/join',{cookie:reader.cookie,method:'POST',body:{invite:community.invite}})).status,200);
 const socket=await connect(reader.cookie);
 for(const [id,text] of [[first,'First room activity'],[second,'Other room activity']]){
  const incoming=socket.wait('message:new',message=>message.conversationId===id);assert.equal((await api(`/api/conversations/${id}/messages`,{cookie:owner.cookie,method:'POST',body:{text}})).status,201);await incoming;
 }
 const counts=async()=>{const snapshot=(await api('/api/bootstrap',{cookie:reader.cookie})).data;return snapshot.servers.find(server=>server.id===serverId).channels.filter(channel=>[first,second].includes(channel.id)).map(channel=>({id:channel.id,unread:channel.unread}));};
 let values=await counts();assert.equal(values.find(value=>value.id===first).unread,1);assert.equal(values.find(value=>value.id===second).unread,1);
 const receipt=socket.wait('conversation:read',payload=>payload.conversationId===first);assert.equal((await api(`/api/conversations/${first}/read`,{cookie:reader.cookie,method:'POST',body:{}})).status,200);await receipt;
 values=await counts();assert.equal(values.find(value=>value.id===first).unread,0);assert.equal(values.find(value=>value.id===second).unread,1);
 await api(`/api/conversations/${second}/read`,{cookie:reader.cookie,method:'POST',body:{}});assert.equal((await counts()).reduce((sum,value)=>sum+value.unread,0),0);
 ownerSnapshot=(await api('/api/bootstrap',{cookie:owner.cookie})).data;assert.equal(ownerSnapshot.servers.find(server=>server.id===serverId).channels.reduce((sum,channel)=>sum+channel.unread,0),0);
});

test('only the owner can permanently delete a server, including files, pins and live rooms',async()=>{
  const host=await register('remove_server_owner'),guest=await register('remove_server_guest');
  const made=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Disposable server'}})).data.id;
  const space=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(item=>item.id===made);
  const channel=space.channels.find(item=>item.type==='text'),voiceChannel=space.channels.find(item=>item.type==='voice');
  await api('/api/servers/join',{cookie:guest.cookie,method:'POST',body:{invite:space.invite}});
  const form=new FormData();form.append('files',new Blob(['dispose this file']),'remove.txt');
  const upload=(await api('/api/uploads',{cookie:host.cookie,method:'POST',body:form})).data.files[0];
  const posted=(await api(`/api/conversations/${channel.id}/messages`,{cookie:host.cookie,method:'POST',body:{text:'Disposable',attachments:[upload.id]}})).data.message;
  await api(`/api/messages/${posted.id}/pin`,{cookie:host.cookie,method:'POST',body:{}});
  const pending=(await api(`/api/uploads/start?purpose=server&serverId=${made}`,{cookie:host.cookie,method:'POST',body:{name:'pending.gif',size:100}})).data.id;
  const live=await connect(guest.cookie);assert.equal((await live.emit('voice:join',{conversationId:voiceChannel.id})).ok,true);
  assert.equal((await api(`/api/servers/${made}`,{cookie:guest.cookie,method:'DELETE',body:{confirmName:space.name}})).status,403);
  assert.equal((await api(`/api/servers/${made}`,{cookie:host.cookie,method:'DELETE',body:{confirmName:'wrong'}})).status,400);
  const removed=live.wait('voice:removed');
  assert.equal((await api(`/api/servers/${made}`,{cookie:host.cookie,method:'DELETE',body:{confirmName:space.name}})).status,200);await removed;
  assert.equal(instance.db.prepare('SELECT 1 FROM servers WHERE id=?').get(made),undefined);
  for(const table of ['channels','categories','members','server_roles','moderations','upload_sessions','files'])assert.equal(instance.db.prepare(`SELECT count(*) AS n FROM ${table} WHERE serverId=?`).get(made).n,0);
  assert.equal(instance.db.prepare('SELECT 1 FROM messages WHERE id=?').get(posted.id),undefined);
  assert.equal(instance.db.prepare('SELECT 1 FROM pin_reads WHERE conversationId=?').get(channel.id),undefined);
  assert.equal(fs.existsSync(path.join(folder,'uploads',upload.id)),false);assert.equal(fs.existsSync(path.join(folder,'uploads',`.${pending}`)),false);
  assert.equal((await api('/api/servers/join',{cookie:guest.cookie,method:'POST',body:{invite:space.invite}})).status,404);
  assert.deepEqual(instance.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('voice disconnection is permission controlled; timeouts block voice and stage and include a precise reason and end time',async()=>{
  const host=await register('disconnect_host'),mod=await register('disconnect_mod'),guest=await register('disconnect_guest');
  const made=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Moderation voice checks'}})).data.id;
  const space=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(item=>item.id===made),voiceChannel=space.channels.find(item=>item.type==='voice');
  for(const user of [mod,guest])await api('/api/servers/join',{cookie:user.cookie,method:'POST',body:{invite:space.invite}});
  const stage=(await api(`/api/servers/${made}/channels`,{cookie:host.cookie,method:'POST',body:{name:'Moderation stage',type:'stage'}})).data.id;
  const client=await connect(guest.cookie);
  const moderate=(account,kind,extra={})=>api(`/api/servers/${made}/moderation`,{cookie:account.cookie,method:'POST',body:{userId:guest.id,kind,...extra}});
  assert.equal((await moderate(mod,'disconnect')).status,403);
  const role=(await api(`/api/servers/${made}/roles`,{cookie:host.cookie,method:'POST',body:{name:'Voice moderator',permissions:['disconnectMembers']}})).data.role.id;
  await api(`/api/servers/${made}/members/${mod.id}/roles`,{cookie:host.cookie,method:'PUT',body:{roleIds:[role]}});
  for(const conversationId of [voiceChannel.id,stage]){
    assert.equal((await client.emit('voice:join',{conversationId})).ok,true);
    const removed=client.wait('voice:removed');assert.equal((await moderate(mod,'disconnect')).status,200);await removed;
    assert.equal((await client.emit('voice:join',{conversationId})).ok,true);await client.emit('voice:leave');
  }
  const muted=await moderate(host,'mute',{hours:1,reason:'Repeated disruptive audio'});assert.equal(muted.status,200);
  const snapshot=(await api('/api/bootstrap',{cookie:guest.cookie})).data.servers.find(item=>item.id===made);
  assert.equal(snapshot.moderation.reason,'Repeated disruptive audio');assert.ok(snapshot.moderation.expiresAt>Date.now());
  for(const conversationId of [voiceChannel.id,stage]){const denied=await client.emit('voice:join',{conversationId});assert.equal(denied.ok,false);assert.equal(denied.moderation.kind,'mute');assert.equal(denied.moderation.reason,'Repeated disruptive audio');}
  await moderate(host,'unmute');assert.equal((await client.emit('voice:join',{conversationId:voiceChannel.id})).ok,true);await client.emit('voice:leave');
  for(const hours of [2,0]){
    const banned=await moderate(host,'ban',{hours,reason:'Ban explanation for member'});assert.equal(banned.status,200);
    const denied=await api('/api/servers/join',{cookie:guest.cookie,method:'POST',body:{invite:space.invite}});assert.equal(denied.status,403);assert.equal(denied.data.moderation.reason,'Ban explanation for member');assert.equal(denied.data.moderation.permanent,hours===0);
    await moderate(host,'unban');await api('/api/servers/join',{cookie:guest.cookie,method:'POST',body:{invite:space.invite}});
  }
});

test('account deletion verifies password and ownership, erases private data and invalidates every session',async()=>{
  const person=await register('delete_account_fixture'),peer=await register('delete_account_peer');
  const made=(await api('/api/servers',{cookie:person.cookie,method:'POST',body:{name:'Owned deletion fixture'}})).data.id;
  const other=(await api('/api/servers',{cookie:peer.cookie,method:'POST',body:{name:'Retained peer community'}})).data.id;
  const space=(await api('/api/bootstrap',{cookie:peer.cookie})).data.servers.find(item=>item.id===other),textChannel=space.channels.find(item=>item.type==='text');
  await api('/api/servers/join',{cookie:person.cookie,method:'POST',body:{invite:space.invite}});
  const dm=(await api('/api/dms',{cookie:person.cookie,method:'POST',body:{userId:peer.id}})).data.id;
  const form=new FormData();form.append('files',new Blob(['erase private data']),'erase.txt');
  const file=(await api('/api/uploads',{cookie:person.cookie,method:'POST',body:form})).data.files[0];
  const message=(await api(`/api/conversations/${textChannel.id}/messages`,{cookie:person.cookie,method:'POST',body:{text:'Erase me',attachments:[file.id]}})).data.message;
  const kept=(await api(`/api/conversations/${textChannel.id}/messages`,{cookie:peer.cookie,method:'POST',body:{text:'Keep peer message',replyTo:message.id}})).data.message;
  await api(`/api/conversations/${dm}/messages`,{cookie:peer.cookie,method:'POST',body:{text:'Shared DM removal'}});
  await api('/api/blocks/'+person.id,{cookie:peer.cookie,method:'PUT',body:{}});
  await api(`/api/servers/${other}/moderation`,{cookie:peer.cookie,method:'POST',body:{userId:person.id,kind:'mute',hours:1}});
  const live=await connect(person.cookie);
  const deletion=body=>api('/api/account',{cookie:person.cookie,method:'DELETE',body:{confirmUsername:person.username,password:PASSWORD,...body}});
  assert.equal((await deletion({password:'wrong'})).status,403);
  assert.equal((await deletion({confirmUsername:'wrong'})).status,400);
  const blocked=await deletion({});assert.equal(blocked.status,409);assert.equal(blocked.data.ownedServers[0].id,made);
  const ended=live.wait('account:deleted');assert.equal((await deletion({deleteOwnedServers:true})).status,200);await ended;
  assert.equal((await api('/api/bootstrap',{cookie:person.cookie})).status,401);
  assert.equal((await api('/api/auth/login',{method:'POST',body:{username:person.username,password:PASSWORD}})).status,401);
  assert.equal(instance.db.prepare('SELECT 1 FROM users WHERE id=?').get(person.id),undefined);
  assert.equal(instance.db.prepare('SELECT 1 FROM servers WHERE id=?').get(made),undefined);assert.ok(instance.db.prepare('SELECT 1 FROM servers WHERE id=?').get(other));
  assert.equal(instance.db.prepare('SELECT 1 FROM conversations WHERE id=?').get(dm),undefined);
  assert.equal(instance.db.prepare('SELECT 1 FROM messages WHERE id=?').get(message.id),undefined);assert.equal(instance.db.prepare('SELECT replyTo FROM messages WHERE id=?').get(kept.id).replyTo,null);
  assert.equal(fs.existsSync(path.join(folder,'uploads',file.id)),false);
  assert.equal(instance.db.prepare('SELECT 1 FROM sessions WHERE userId=?').get(person.id),undefined);
  assert.equal(instance.db.prepare('SELECT 1 FROM moderations WHERE userId=?').get(person.id),undefined);
  assert.equal((await api('/api/blocks',{cookie:peer.cookie})).data.users.length,0);
  assert.deepEqual(instance.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('creator account deletion clears identity authority without silently recreating an intentionally removed community',async()=>{
  const login=await api('/api/auth/login',{method:'POST',body:{username:'maxultimat3',password:PASSWORD}});assert.equal(login.status,200);
  const creator=login.data.user;
  const result=await api('/api/account',{cookie:login.cookie,method:'DELETE',body:{password:PASSWORD,confirmUsername:'maxultimat3',deleteOwnedServers:true}});assert.equal(result.status,200);
  assert.equal(instance.db.prepare("SELECT 1 FROM app_settings WHERE key='creatorUserId'").get(),undefined);assert.equal(instance.db.prepare('SELECT 1 FROM users WHERE id=?').get(creator.id),undefined);
  assert.equal((await api('/api/auth/register',{method:'POST',body:{username:'MaxUltimat3',password:PASSWORD}})).status,403);
  const next=await api('/api/auth/register',{method:'POST',body:{username:'MaxUltimat3',password:PASSWORD,creatorClaimToken:'disposable-creator-token'}});assert.equal(next.status,201);assert.ok(next.data.user.badges.includes('creator'));assert.notEqual(next.data.user.id,creator.id);
  assert.equal((await api('/api/bootstrap',{cookie:next.cookie})).data.servers.length,0);
  assert.deepEqual(instance.db.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('activity records specific server, channel and layout changes with actor names and deleted target labels',async()=>{
 const host=await register('audit_details_host');
 const made=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Before activity name'}})).data.id;
 await api(`/api/servers/${made}`,{cookie:host.cookie,method:'PATCH',body:{name:'After activity name',publicListing:true,rules:'# New rulebook'}});
 const temp=(await api(`/api/servers/${made}/channels`,{cookie:host.cookie,method:'POST',body:{name:'audit-before',type:'text'}})).data.id;
 await api(`/api/channels/${temp}`,{cookie:host.cookie,method:'PATCH',body:{name:'audit-after',slowmodeSeconds:10}});
 await api(`/api/channels/${temp}`,{cookie:host.cookie,method:'DELETE'});
 const current=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(server=>server.id===made);
 await api(`/api/servers/${made}/layout`,{cookie:host.cookie,method:'PUT',body:{categories:current.categories.slice().reverse(),channels:current.channels.slice().reverse()}});
 const activity=(await api(`/api/servers/${made}/audit`,{cookie:host.cookie})).data.entries;
 const server=activity.find(entry=>entry.action==='server.updated');assert.equal(server.actorName,host.displayName);assert.equal(server.actorUsername,host.username);assert.ok(server.metadata.changes.some(change=>change.label==='Name'&&change.before==='Before activity name'&&change.after==='After activity name'));assert.ok(server.metadata.changes.some(change=>change.label==='Discovery'&&change.before==='Off'&&change.after==='On'));
 assert.ok(activity.find(entry=>entry.action==='channel.updated').metadata.changes.some(change=>change.label==='Name'&&change.after==='audit-after'));
 assert.equal(activity.find(entry=>entry.action==='channel.deleted').metadata.targetName,'audit-after');
 assert.ok(activity.find(entry=>entry.action==='layout.updated').metadata.changes.some(change=>change.label.startsWith('Channel ')&&change.before!==change.after));
 assert.equal((await api(`/api/servers/${made}/audit`,{cookie:eve.cookie})).status,404);
 instance.db.prepare('INSERT INTO audit_log(id,serverId,actorId,action,createdAt) VALUES (?,?,?,?,?)').run('audit_legacy_fixture',made,host.id,'server.updated','2026-10-26T00:00:00Z');
 assert.deepEqual((await api(`/api/servers/${made}/audit`,{cookie:host.cookie})).data.entries.find(entry=>entry.id==='audit_legacy_fixture').metadata,{});
});

test('public discovery searches beyond the recommendation page and excludes hidden and banned servers',async()=>{
 const host=await register('discovery212_host'),viewer=await register('discovery212_viewer');
 for(let index=0;index<28;index++){
  const id=`s_discovery212_${String(index).padStart(2,'0')}`;
  instance.db.prepare('INSERT INTO servers(id,name,description,ownerId,invite,createdAt,publicListing) VALUES(?,?,?,?,?,?,?)').run(id,`Search212 ${index}`,index===0?'A satellite needle description':'A public search fixture',host.id,`invite212_${index}`,'2026-10-26T12:00:00Z',index===26?0:1);
  instance.db.prepare('INSERT INTO members VALUES(?,?,?,?)').run(id,host.id,'owner','2026-10-26T12:00:00Z');
 }
 instance.db.prepare("INSERT INTO moderations VALUES(?,?, 'ban',NULL,'Fixture',?)").run('s_discovery212_27',viewer.id,host.id);
 const first=await api('/api/discovery?q=search212',{cookie:viewer.cookie});assert.equal(first.status,200);assert.equal(first.data.servers.length,24);assert.equal(first.data.hasMore,true);
 assert.ok(first.data.servers.every(server=>!server.joined&&!server.invite&&!server.ownerId));
 const second=(await api(`/api/discovery?q=search212&offset=${first.data.nextOffset}`,{cookie:viewer.cookie})).data;
 assert.equal(second.servers.length,2);assert.equal(second.hasMore,false);assert.equal(second.nextOffset,null);assert.equal(new Set([...first.data.servers,...second.servers].map(server=>server.id)).size,26);
 assert.deepEqual((await api('/api/discovery?q=satellite%20needle',{cookie:viewer.cookie})).data.servers.map(server=>server.id),['s_discovery212_00']);
 assert.equal((await api('/api/discovery?q=%25',{cookie:viewer.cookie})).data.servers.length,0);
 assert.equal((await api('/api/discovery?offset=-1',{cookie:viewer.cookie})).status,400);assert.equal((await api(`/api/discovery?q=${'x'.repeat(81)}`,{cookie:viewer.cookie})).status,400);
 assert.equal((await api('/api/discovery?q=search212')).status,401);
});
test('community badges do not follow joining, update live on transfer and disappear after the last server is deleted',async()=>{
 const host=await register('badge212_host'),peer=await register('badge212_peer');const id=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Badge ownership fixture'}})).data.id;
 const invite=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(server=>server.id===id).invite;
 await api('/api/servers/join',{cookie:peer.cookie,method:'POST',body:{invite}});
 const snap=(await api('/api/bootstrap',{cookie:peer.cookie})).data;assert.ok(!snap.user.badges.includes('community-owner'));assert.ok(snap.users.find(user=>user.id===host.id).badges.includes('community-owner'));
 instance.db.prepare("INSERT INTO user_badges VALUES(?,'community-owner')").run(peer.id);
 assert.ok(!(await api('/api/bootstrap',{cookie:peer.cookie})).data.user.badges.includes('community-owner'));
 const socket=await connect(peer.cookie),changed=socket.wait('user:updated',user=>user.id===peer.id&&user.badges.includes('community-owner'));
 assert.equal((await api(`/api/servers/${id}/transfer`,{cookie:host.cookie,method:'POST',body:{userId:peer.id}})).status,200);await changed;
 assert.ok(!(await api('/api/bootstrap',{cookie:host.cookie})).data.user.badges.includes('community-owner'));
 const removed=socket.wait('user:updated',user=>user.id===peer.id&&!user.badges.includes('community-owner'));
 assert.equal((await api(`/api/servers/${id}`,{cookie:peer.cookie,method:'DELETE',body:{confirmName:'Badge ownership fixture'}})).status,200);await removed;
 assert.ok(!(await api('/api/bootstrap',{cookie:peer.cookie})).data.user.badges.includes('community-owner'));
});
test('attachment-only DMs keep file metadata after refresh and fall back to the previous message after deletion',async()=>{
 const a=await register('preview212_one'),b=await register('preview212_two');const dm=(await api('/api/dms',{cookie:a.cookie,method:'POST',body:{userId:b.id}})).data.id;
 const previous=(await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{text:'Earlier context'}})).data.message;
 const form=new FormData();form.append('files',new Blob(['A real saved document'],{type:'text/plain'}),'notes.txt');
 const file=(await api('/api/uploads',{cookie:a.cookie,method:'POST',body:form})).data.files[0];
 const message=(await api(`/api/conversations/${dm}/messages`,{cookie:a.cookie,method:'POST',body:{attachments:[file.id]}})).data.message;
 const snapshot=(await api('/api/bootstrap',{cookie:b.cookie})).data.dms.find(item=>item.id===dm).lastMessage;
 assert.equal(snapshot.id,message.id);assert.equal(snapshot.text,'');assert.equal(snapshot.attachments[0].name,'notes.txt');assert.equal(snapshot.attachments[0].type,message.attachments[0].type);
 assert.equal((await api(`/api/messages/${message.id}`,{cookie:a.cookie,method:'DELETE'})).status,200);
 assert.equal((await api('/api/bootstrap',{cookie:b.cookie})).data.dms.find(item=>item.id===dm).lastMessage.id,previous.id);
});
test('voice arrival advertises preselected mute and deafen from the first participant state',async()=>{
 const host=await register('audio212_host');const server=(await api('/api/servers',{cookie:host.cookie,method:'POST',body:{name:'Audio entry fixture'}})).data.id;
 const channel=(await api('/api/bootstrap',{cookie:host.cookie})).data.servers.find(item=>item.id===server).channels.find(channel=>channel.type==='voice');
 const socket=await connect(host.cookie);const arrival=socket.wait('voice:state',state=>state.participants.some(peer=>peer.userId===host.id));
 assert.equal((await socket.emit('voice:join',{conversationId:channel.id,muted:true,deafened:true})).ok,true);
 const peer=(await arrival).participants.find(peer=>peer.userId===host.id);assert.equal(peer.muted,true);assert.equal(peer.deafened,true);
 assert.ok(socket.events.filter(event=>event.event==='voice:state').every(event=>event.payload.participants.filter(peer=>peer.userId===host.id).every(peer=>peer.muted&&peer.deafened)));
 await socket.emit('voice:leave');
});

test('new interface palettes persist and synchronize between authenticated sessions',async()=>{
 const user=await register('palettes213'),second=(await api('/api/auth/login',{method:'POST',body:{username:user.username,password:PASSWORD}})).cookie,observer=await connect(second);
 for(const palette of ['ruby','ember','citrus','mint','arctic','indigo','plum','sand']){
  const event=observer.wait('preferences:updated',snapshot=>snapshot.preferences.palette===palette);
  assert.equal((await api('/api/preferences',{cookie:user.cookie,method:'PATCH',body:{preferences:{palette}}})).status,200);await event;
  assert.equal((await api('/api/preferences',{cookie:second})).data.preferences.palette,palette);
 }
});

test('the production page serves matching CSS and its complete native module graph after upgrades', async () => {
 const page=await fetch(base+'/'),html=await page.text(),buildId=page.headers.get('x-nexus-build');
 assert.equal(page.headers.get('cache-control'),'no-store');assert.match(buildId,/^[a-f0-9]{20}$/);
 const prefix=`/client/${buildId}/`,entry=html.match(/<script type="module" src="([^"]+)"/)[1],style=html.match(/rel="stylesheet" href="([^"]+)"/)[1];
 assert.equal(entry,prefix+'app.js');assert.equal(style,prefix+'styles.css');
 const stylesheet=await fetch(base+style);assert.equal(stylesheet.status,200);assert.equal(stylesheet.headers.get('x-nexus-build'),buildId);
 assert.ok((await stylesheet.text()).includes('.viewer-close'));
 const queue=[new URL(entry,base).href],seen=new Set();
 while(queue.length){
  const url=queue.shift();if(seen.has(url))continue;seen.add(url);
  const response=await fetch(url);assert.equal(response.status,200,url);assert.equal(response.headers.get('x-nexus-build'),buildId);
  const source=await response.text();
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.js)['"]/g)){
   const dependency=new URL(match[1],url);assert.ok(dependency.pathname.startsWith(prefix));queue.push(dependency.href);
  }
 }
 assert.ok(seen.size>=25,'The real app module graph must be covered, including the media viewer.');
 assert.ok(seen.has(base+prefix+'image-viewer.js'));assert.ok(seen.has(base+prefix+'config.js'));
});

test('people search treats usernames and @usernames alike while preserving literal wildcard searches',async()=>{
 const viewer=await register('search_217_viewer'),target=await register('search_217_literal');await register('searcha217aliteral');
 for(const query of ['search_217_lit','@search_217_lit','  @SEARCH_217_LIT  ']){
  const result=await api('/api/users?'+new URLSearchParams({q:query}),{cookie:viewer.cookie});assert.equal(result.status,200);
  assert.deepEqual(result.data.users.map(user=>user.id),[target.id]);
 }
 assert.deepEqual((await api('/api/users?'+new URLSearchParams({q:'@search_217'}),{cookie:viewer.cookie})).data.users.map(user=>user.id),[target.id]);
 assert.deepEqual((await api('/api/users?'+new URLSearchParams({q:'@search%217'}),{cookie:viewer.cookie})).data.users,[]);
 assert.equal((await api('/api/users?'+new URLSearchParams({q:'@'+'x'.repeat(50)}),{cookie:viewer.cookie})).status,200);
 assert.equal((await api('/api/users?'+new URLSearchParams({q:'x'.repeat(51)}),{cookie:viewer.cookie})).status,400);
 assert.equal((await api('/api/users?'+new URLSearchParams({q:'@a'}),{cookie:viewer.cookie})).status,400);
});

test('unrelated search results can display current profile artwork without exposing drafts or private attachments',async()=>{
 const owner=await register('profile_217_owner'),viewer=await register('profile_217_viewer');
 const bytes=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
 async function upload(name,purpose='profile'){
  const form=new FormData();form.append('files',new Blob([bytes],{type:'image/gif'}),name);
  const result=await api('/api/uploads?purpose='+purpose,{cookie:owner.cookie,method:'POST',body:form});assert.equal(result.status,201);return result.data.files[0];
 }
 const avatar=await upload('avatar.gif'),banner=await upload('banner.gif'),draft=await upload('draft.gif'),privateFile=await upload('private.gif','attachment');
 assert.equal((await api('/api/profile',{cookie:owner.cookie,method:'PATCH',body:{avatar:avatar.url,banner:banner.url}})).status,200);
 const snapshot=(await api('/api/bootstrap',{cookie:viewer.cookie})).data;assert.equal(snapshot.dms.length,0);assert.equal(snapshot.servers.length,0);assert.ok(!snapshot.users.some(user=>user.id===owner.id));
 const found=(await api('/api/users?'+new URLSearchParams({q:'@profile_217_owner'}),{cookie:viewer.cookie})).data.users[0];
 assert.equal(found.id,owner.id);assert.equal(found.avatar,avatar.url);assert.equal(found.banner,banner.url);
 for(const url of [found.avatar,found.banner]){
  const image=await fetch(base+url,{headers:{Cookie:viewer.cookie}});assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/gif/);assert.equal(image.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()),bytes);assert.equal((await fetch(base+url)).status,401);
  assert.equal((await fetch(base+url+'?download=1',{headers:{Cookie:viewer.cookie}})).status,403);
 }
 assert.equal((await fetch(base+draft.url,{headers:{Cookie:viewer.cookie}})).status,404);
 assert.equal((await fetch(base+privateFile.url,{headers:{Cookie:viewer.cookie}})).status,404);
 assert.equal((await fetch(base+draft.url,{headers:{Cookie:owner.cookie}})).status,200);
 assert.equal((await api('/api/bootstrap',{cookie:viewer.cookie})).data.dms.length,0);
 await api('/api/dms',{cookie:viewer.cookie,method:'POST',body:{userId:owner.id}});
 assert.equal((await fetch(base+draft.url,{headers:{Cookie:viewer.cookie}})).status,404);
 await api('/api/profile',{cookie:owner.cookie,method:'PATCH',body:{avatar:draft.url}});
 assert.equal((await fetch(base+avatar.url,{headers:{Cookie:viewer.cookie}})).status,404);
 assert.equal((await fetch(base+banner.url,{headers:{Cookie:viewer.cookie}})).status,200);
 assert.equal((await fetch(base+draft.url,{headers:{Cookie:viewer.cookie}})).status,200);
});

test('blocking in either direction hides current profile images as well as people search results',async()=>{
 const owner=await register('image_217_owner'),viewer=await register('image_217_viewer');
 const form=new FormData();form.append('files',new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64')],{type:'image/gif'}),'avatar.gif');
 const image=(await api('/api/uploads?purpose=profile',{cookie:owner.cookie,method:'POST',body:form})).data.files[0];
 await api('/api/profile',{cookie:owner.cookie,method:'PATCH',body:{avatar:image.url,banner:image.url}});
 assert.equal((await fetch(base+image.url,{headers:{Cookie:viewer.cookie}})).status,200);
 await api('/api/blocks/'+owner.id,{cookie:viewer.cookie,method:'PUT',body:{}});
 assert.equal((await fetch(base+image.url,{headers:{Cookie:viewer.cookie}})).status,404);
 assert.deepEqual((await api('/api/users?q=@image_217_owner',{cookie:viewer.cookie})).data.users,[]);
 await api('/api/blocks/'+owner.id,{cookie:viewer.cookie,method:'DELETE'});
 assert.equal((await fetch(base+image.url,{headers:{Cookie:viewer.cookie}})).status,200);
 await api('/api/blocks/'+viewer.id,{cookie:owner.cookie,method:'PUT',body:{}});
 assert.equal((await fetch(base+image.url,{headers:{Cookie:viewer.cookie}})).status,404);
 assert.deepEqual((await api('/api/users?q=@image_217_owner',{cookie:viewer.cookie})).data.users,[]);
 assert.equal((await fetch(base+image.url,{headers:{Cookie:owner.cookie}})).status,200);
});
