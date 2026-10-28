'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function worker({ fetch: fetchRequest = async () => { throw new Error('No external request is permitted in this fixture.'); } } = {}) {
  const events = new Map(), stored = new Map(), shown = [], opened = [], posted = []; let storeExists = false, currentClients = [];
  const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const db = { objectStoreNames: { contains: () => storeExists }, createObjectStore: () => { storeExists = true; }, close() {}, transaction: () => {
    const tx = { objectStore: () => Object.fromEntries(['get','put','delete'].map(action => [action, (value, key) => {
      const request = {}; queueMicrotask(() => { if (action === 'get') request.result = copy(stored.get(value)); else if (action === 'put') stored.set(key, copy(value)); else stored.delete(value); tx.oncomplete?.(); }); return request;
    }])) }; return tx;
  } };
  const self = { location: { origin: 'https://nexus.example.test' }, Notification: { permission: 'granted' }, navigator: { setAppBadge: async () => {}, clearAppBadge: async () => {} }, indexedDB: { open: () => { const request = { result: db }; queueMicrotask(() => { if (!storeExists) request.onupgradeneeded?.(); request.onsuccess?.(); }); return request; } },
    addEventListener: (name, action) => events.set(name, action), skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => currentClients, openWindow: async url => { opened.push(url); } },
    registration: { showNotification: async (title, options) => { shown.push({ title, options, closed: false }); }, getNotifications: async () => shown.map(item => ({ close: () => { item.closed = true; } })) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/service-worker.js'), 'utf8'), { self, URL, Uint8Array, atob, fetch: fetchRequest });
  const fire = async (name, value = {}) => { let task; events.get(name)({ ...value, waitUntil: promise => { task = promise; } }); if (task) await task; };
  const binding = { userId: 'u_worker', deviceId: 'd'.repeat(32), bindingId: 'b'.repeat(32), applicationServerKey: 'A'.repeat(87), quiet: false };
  const message = value => fire('message', { data: { version: 1, ...value }, source: { url: 'https://nexus.example.test/' }, ports: [{ postMessage: value => posted.push(value) }] });
  return { events, stored, shown, opened, posted, self, binding, fire, message, clients: value => { currentClients = value; }, bind: () => message({ type: 'nexus:bind', binding }), push: (patch = {}) => fire('push', { data: { json: () => ({ version: 1, kind: 'dm', sentAt: Date.now(), bindingId: binding.bindingId, conversationId: 'dm_fixture', ...patch }) } }) };
}
test('a background push shows a generic branded notification without a loaded page or private message preview', async () => {
  const w = worker(); await w.bind(); await w.push({ body: 'Private text', title: 'Untrusted title', url: 'https://evil.example/' });
  assert.equal(w.shown.length, 1); assert.equal(w.shown[0].title, 'Nexus'); assert.equal(w.shown[0].options.body, 'You have a new direct message.');
  assert.equal(w.shown[0].options.icon, '/assets/nexus-icon-192.png'); assert.equal(w.shown[0].options.badge, '/assets/nexus-notification-badge.png'); assert.ok(!JSON.stringify(w.shown).includes('Private text')); assert.ok(!w.events.has('fetch'));
});
test('stale, malformed, denied, quiet and previous-account pushes cannot display private activity', async () => {
  const w = worker(); await w.bind();
  await w.push({ bindingId: 'e'.repeat(32) }); await w.push({ kind: 'unsupported' }); await w.push({ sentAt: Date.now() - 600000 }); assert.equal(w.shown.length, 0);
  await w.message({ type: 'nexus:quiet', userId: w.binding.userId, quiet: true }); await w.push(); assert.equal(w.shown.length, 0);
  await w.message({ type: 'nexus:quiet', userId: w.binding.userId, quiet: false }); w.self.Notification.permission = 'denied'; await w.push(); assert.equal(w.shown.length, 0);
  w.self.Notification.permission = 'granted'; await w.message({ type: 'nexus:unbind', userId: w.binding.userId }); await w.push(); assert.equal(w.shown.length, 0);
});
test('a stale window cannot unbind another account; a real unbind clears displayed alerts and stored binding', async () => {
  const w = worker(); await w.bind(); await w.push(); await w.message({ type: 'nexus:unbind', userId: 'u_previous' }); assert.equal(w.stored.size, 1); assert.equal(w.shown[0].closed, false);
  await w.message({ type: 'nexus:unbind', userId: w.binding.userId }); assert.equal(w.stored.size, 0); assert.equal(w.shown[0].closed, true);
});
test('notification clicks focus a current client or open only a validated same-origin conversation', async () => {
  const w = worker(); await w.bind(); await w.push();
  await w.fire('notificationclick', { notification: { data: w.shown[0].options.data, close() {} } }); assert.equal(w.opened[0], 'https://nexus.example.test/?conversation=dm_fixture');
  let focused = 0; const messages = []; w.clients([{ url: 'https://nexus.example.test/?other', focus: async () => { focused++; }, postMessage: value => messages.push(value) }]);
  await w.fire('notificationclick', { notification: { data: w.shown[0].options.data, close() {} } }); assert.equal(focused, 1); assert.equal(messages[0].conversationId, 'dm_fixture');
  w.clients([]); await w.fire('notificationclick', { notification: { data: { ...w.shown[0].options.data, conversationId: 'https://evil.example/' }, close() {} } }); assert.equal(w.opened.at(-1), 'https://nexus.example.test/');
  await w.message({ type: 'nexus:unbind', userId: w.binding.userId }); await w.fire('notificationclick', { notification: { data: w.shown[0].options.data, close() {} } }); assert.equal(w.opened.at(-1), 'https://nexus.example.test/');
});
test('worker bindings keep only required device identity and ignore messages from foreign clients', async () => {
  const w = worker(); await w.message({ type: 'nexus:bind', binding: { ...w.binding, subscription: { endpoint: 'private endpoint must not be stored here' }, privateField: 'discard' } });
  const value = [...w.stored.values()][0]; assert.deepEqual(Object.keys(value).sort(), ['applicationServerKey','bindingId','deviceId','enabled','quiet','userId']);
  await w.fire('message', { data: { version: 1, type: 'nexus:unbind' }, source: { url: 'https://evil.example/' } }); assert.equal(w.stored.size, 1);
});
test('browser subscription renewal cannot restore an account replaced while the request was in flight', async () => {
  let finish, started;
  const requested = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { finish = resolve; });
  const w = worker({ fetch: async (url, options) => {
    assert.equal(url, '/api/push/renew'); assert.equal(options.credentials, 'same-origin');
    const body = JSON.parse(options.body); assert.equal(body.bindingId, w.binding.bindingId); started(); await gate;
    return { ok: true, json: async () => ({ userId: w.binding.userId, bindingId: 'c'.repeat(32) }) };
  } });
  await w.bind();
  const pending = w.fire('pushsubscriptionchange', { oldSubscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/old' }, newSubscription: { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/new' }) } });
  await requested;
  await w.message({ type: 'nexus:bind', binding: { ...w.binding, userId: 'u_next', bindingId: 'e'.repeat(32) } });
  finish(); await pending;
  const saved = [...w.stored.values()][0]; assert.equal(saved.userId, 'u_next'); assert.equal(saved.bindingId, 'e'.repeat(32));
});

test('current-account push details show sender/location and excerpt, bounded as text without a private fetch',async()=>{
 const w=worker();await w.bind();await w.push({kind:'server',notification:{title:'Community · #general',body:'Alex (@alex): Hello there'}});
 assert.equal(w.shown[0].title,'Community · #general');assert.equal(w.shown[0].options.body,'Alex (@alex): Hello there');
 await w.push({notification:{title:'X'.repeat(300),body:'Y'.repeat(800)}});assert.equal(w.shown[1].title.length,96);assert.equal(w.shown[1].options.body.length,240);
 await w.push({bindingId:'e'.repeat(32),notification:{title:'Previous account',body:'Do not display'}});assert.equal(w.shown.length,2);
});
