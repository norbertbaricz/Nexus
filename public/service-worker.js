/* Root-scoped push worker. No fetch handler or application/private-data cache. */
'use strict';
const PUSH_WORKER = Object.freeze({ version: 1, database: 'nexus.push.v1', store: 'state', key: 'binding', maxAgeMs: 5 * 60 * 1000, titleLength:96, bodyLength:240, idPattern: /^[a-zA-Z0-9_.:-]{1,128}$/, bindingPattern: /^[a-f0-9]{32}$/, icon: '/assets/nexus-icon-192.png', badge: '/assets/nexus-notification-badge.png' });
function bindingStore(action, value) {
  return new Promise((resolve, reject) => {
    const open = self.indexedDB.open(PUSH_WORKER.database, 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(PUSH_WORKER.store)) open.result.createObjectStore(PUSH_WORKER.store); };
    open.onerror = () => reject(new Error('Notification storage is unavailable.'));
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(PUSH_WORKER.store, action === 'read' ? 'readonly' : 'readwrite'), store = tx.objectStore(PUSH_WORKER.store);
      const request = action === 'read' ? store.get(PUSH_WORKER.key) : value ? store.put(value, PUSH_WORKER.key) : store.delete(PUSH_WORKER.key);
      tx.oncomplete = () => { db.close(); resolve(action === 'read' ? request.result : value); }; tx.onerror = tx.onabort = () => { db.close(); reject(new Error('Notification storage is unavailable.')); };
    };
  });
}
function validBinding(value) { return value && PUSH_WORKER.bindingPattern.test(value.bindingId || '') && PUSH_WORKER.bindingPattern.test(value.deviceId || '') && PUSH_WORKER.idPattern.test(value.userId || ''); }
function conversation(value) { return typeof value === 'string' && PUSH_WORKER.idPattern.test(value) ? value : ''; }
async function clearNotifications() { for (const notification of await self.registration.getNotifications()) notification.close(); if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge().catch(() => {}); }
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const value = event.data;
  let source; try { source = new URL(event.source?.url); } catch { return; }
  if (source.origin !== self.location.origin || !value || value.version !== PUSH_WORKER.version) return;
  if (!['nexus:bind','nexus:unbind','nexus:quiet'].includes(value.type)) return;
  const task = (async () => {
    if (value.type === 'nexus:bind') {
      if (!validBinding(value.binding)) throw new Error('Invalid notification binding.');
      const previous = await bindingStore('read');
      if (previous?.bindingId !== value.binding.bindingId) await clearNotifications();
      await bindingStore('write', { userId:value.binding.userId,deviceId:value.binding.deviceId,bindingId:value.binding.bindingId,
        applicationServerKey:typeof value.binding.applicationServerKey==='string'&&/^[A-Za-z0-9_-]{87}$/.test(value.binding.applicationServerKey)?value.binding.applicationServerKey:'', enabled:true,quiet:Boolean(value.binding.quiet) });
    } else if (value.type === 'nexus:unbind') { const current = await bindingStore('read'); if (value.userId && current?.userId !== value.userId) { event.ports?.[0]?.postMessage({ ok: true }); return; } await bindingStore('write', null); await clearNotifications(); }
    else { const current = await bindingStore('read'); if (current?.userId === value.userId) { current.quiet = value.quiet === true; await bindingStore('write', current); } }
    event.ports?.[0]?.postMessage({ ok: true });
  })().catch(() => { event.ports?.[0]?.postMessage({ ok: false }); });
  event.waitUntil(task);
});
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload; try { payload = event.data?.json(); } catch { return; }
    if (!payload || payload.version !== PUSH_WORKER.version || !['dm','mention','server','test'].includes(payload.kind) || !Number.isFinite(payload.sentAt) || Math.abs(Date.now() - payload.sentAt) > PUSH_WORKER.maxAgeMs) return;
    const binding = await bindingStore('read');
    // Rare in-flight deliveries after logout/account change must not cross accounts.
    if (!binding?.enabled || binding.bindingId !== payload.bindingId || binding.quiet || self.Notification?.permission !== 'granted') return;
    const id = conversation(payload.conversationId), body = payload.kind === 'test' ? 'Background notifications are connected on this device.' : payload.kind === 'dm' ? 'You have a new direct message.' : payload.kind === 'mention' ? 'You were mentioned in a server.' : 'You have a new server message.';
    const bounded=(value,max)=>typeof value==='string'?Array.from(value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join(''):'';
    const title=payload.kind==='test'?'Nexus':bounded(payload.notification?.title,PUSH_WORKER.titleLength)||'Nexus',detail=payload.kind==='test'?body:bounded(payload.notification?.body,PUSH_WORKER.bodyLength)||body;
    await self.registration.showNotification(title, { body:detail, icon: PUSH_WORKER.icon, badge: PUSH_WORKER.badge, tag: `nexus:${binding.bindingId}:${id || 'test'}`, renotify: false, silent: payload.silent === true,
      data: { version: PUSH_WORKER.version, bindingId: binding.bindingId, conversationId: id } });
    if (payload.kind !== 'test' && self.navigator.setAppBadge) await self.navigator.setAppBadge().catch(() => {});
  })().catch(() => {}));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const binding = await bindingStore('read'), data = event.notification.data || {};
    const id = binding?.enabled && binding.bindingId === data.bindingId ? conversation(data.conversationId) : '';
    const url = new URL('/', self.location.origin); if (id) url.searchParams.set('conversation', id);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const target = clients.find(client => { try { return new URL(client.url).origin === self.location.origin; } catch { return false; } });
    if (target) { await target.focus(); if (id) target.postMessage({ version: PUSH_WORKER.version, type: 'nexus:notification-open', conversationId: id }); }
    else await self.clients.openWindow(url.href);
  })().catch(() => {}));
});
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const binding = await bindingStore('read'); if (!binding?.enabled) return;
    const subscription = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(binding.applicationServerKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)) });
    if (!event.oldSubscription || !subscription) return;
    const response = await fetch('/api/push/renew', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: binding.deviceId, bindingId: binding.bindingId, previousEndpoint: event.oldSubscription.endpoint, subscription: subscription.toJSON() }) });
    const result = await response.json();
    const current = await bindingStore('read');
    if (current?.userId !== binding.userId || current?.bindingId !== binding.bindingId) return;
    if (response.ok && result.userId === binding.userId) await bindingStore('write', { ...binding, bindingId: result.bindingId });
    else if ([401,403,409].includes(response.status)) { await bindingStore('write', null); await clearNotifications(); }
  })().catch(() => {}));
});
