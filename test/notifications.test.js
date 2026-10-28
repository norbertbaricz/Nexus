'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createECDH } = require('node:crypto');
const load = () => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../public/notifications.js'),'utf8')+'\n//# sourceURL=nexus-notifications.js').toString('base64'));
function environment({ permission = 'default', enabled = false, secure = true } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), sw = new EventTarget(), preferences = { notifications: enabled, sounds: true, soundVolume: 45 }, calls = [], shown = [], storage = new Map(); let current = null, quiet = false, delay = null;
  const vapid = createECDH('prime256v1'); vapid.generateKeys(); const server = { configured: true, publicOrigin: 'https://nexus.example.test', applicationServerKey: vapid.getPublicKey().toString('base64url') };
  class Notification { constructor(title,options){calls.push('native-notification');shown.push({title,options});this.close=()=>{};} static permission = permission; static requestPermission() { calls.push('permission'); this.permission = permission === 'denied' ? 'denied' : 'granted'; return Promise.resolve(this.permission); } }
  class Channel { constructor() { this.port1 = { onmessage: null, close() {} }; this.port2 = { postMessage: value => queueMicrotask(() => this.port1.onmessage?.({ data: value })), close() {} }; } }
  const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {} }), unsubscribe: async () => { calls.push('unsubscribe'); current = null; } };
  const registration = { showNotification:async(title,options)=>{calls.push('worker-notification');shown.push({title,options});}, active: { postMessage: (message, ports) => { calls.push(message.type); ports[0].postMessage({ ok: true }); } }, pushManager: { getSubscription: async () => current, subscribe: async options => { calls.push('subscribe'); assert.equal(options.userVisibleOnly, true); assert.equal(options.applicationServerKey.length, 65); current = subscription; return current; } } };
  Object.assign(win, { document: doc, isSecureContext: secure, Notification, PushManager: class {}, crypto: webcrypto, location: new URL(server.publicOrigin), matchMedia: () => ({ matches: true }), MessageChannel: Channel, atob, setTimeout, clearTimeout });
  Object.assign(sw, { ready: Promise.resolve(registration), register: async (script, options) => { calls.push('register'); assert.equal(script, '/service-worker.js'); assert.equal(options.updateViaCache, 'none'); return registration; }, getRegistration: async () => registration });
  const nav = { serviceWorker: sw, userAgent: 'Fixture', setAppBadge: async () => {}, clearAppBadge: async () => {} };
  const request = async (route, options) => { calls.push(route); if (route.startsWith('/api/push/status')) return {...server,enrolled:Boolean(current)}; if (route === '/api/push/subscription' && options.method === 'POST') { if (delay) await delay; return { userId: 'u_test', bindingId: 'b'.repeat(32), deviceId: options.body.deviceId }; } return { ok: true }; };
  return { win, doc, nav, window:win, navigator:nav, preferences, calls, shown, server, registration, subscription, request, storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, getPreferences: () => preferences, isQuiet: () => quiet, onEnabled: value => { preferences.notifications = value; }, setQuiet: value => { quiet = value; }, delay: value => { delay = value; } };
}
test('permission is requested only by explicit enable, before async registration, then background enrollment binds the current device', async () => {
  const { BrowserNotifications } = await load(), f = environment(), notifications = new BrowserNotifications(f); notifications.attach('u_test', f.server);
  assert.deepEqual(f.calls, []); const enabling = notifications.enable(); assert.equal(f.calls[0], 'permission'); await enabling;
  assert.equal(notifications.snapshot().active, true); assert.ok(f.calls.includes('/api/push/subscription')); assert.ok(f.calls.includes('nexus:bind')); assert.equal(f.preferences.notifications, true);
  assert.equal(f.calls.filter(value=>value==='/api/push/test').length,1);
  await notifications.reconcile();assert.equal(f.calls.filter(value=>value==='/api/push/test').length,1);
  await notifications.disable(); assert.equal(f.preferences.notifications, false); assert.ok(f.calls.indexOf('nexus:unbind') < f.calls.indexOf('unsubscribe')); assert.equal(notifications.active, false);
});
test('denied or insecure contexts never subscribe and explain the available path', async () => {
  const { BrowserNotifications, notificationSupport } = await load(), f = environment({ permission: 'denied' }), notifications = new BrowserNotifications(f); notifications.attach('u_test', f.server);
  await assert.rejects(notifications.enable(), /Allow notifications/); assert.ok(!f.calls.includes('subscribe')); assert.equal(f.preferences.notifications, false);
  const insecure = environment({ secure: false }), unavailable = new BrowserNotifications(insecure); assert.match(unavailable.snapshot().hint, /HTTPS/); await assert.rejects(unavailable.enable(), /HTTPS/);
  const ios = notificationSupport({ isSecureContext: true, matchMedia: () => ({ matches: false }) }, { userAgent: 'iPhone' }); assert.equal(ios.ios, true); assert.equal(ios.push, false);
});
test('logout invalidates an in-flight enrollment before it can bind a previous account', async () => {
  const { BrowserNotifications } = await load(), f = environment({ permission: 'granted', enabled: true }); let finish; const gate = new Promise(resolve => { finish = resolve; }); f.delay(gate);
  const notifications = new BrowserNotifications(f); notifications.attach('u_test', f.server);
  for (let index = 0; index < 30 && !f.calls.includes('/api/push/subscription'); index++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.calls.includes('/api/push/subscription')); const pending = notifications.task; await notifications.detach(); finish(); await pending;
  assert.equal(notifications.userId, null); assert.equal(notifications.active, false); assert.ok(!f.calls.includes('nexus:bind'));
});
test('DND changes update the worker once; a bound background subscription suppresses duplicate live notifications', async () => {
  const { BrowserNotifications } = await load(), f = environment({ permission: 'granted', enabled: true }), notifications = new BrowserNotifications(f); notifications.attach('u_test', f.server); await notifications.task;
  f.setQuiet(true); notifications.quiet(); notifications.quiet(); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.calls.filter(value => value === 'nexus:quiet').length, 1);
  f.registration.showNotification = async () => { throw new Error('Live duplicates are forbidden.'); }; await notifications.live({ conversationId: 'dm_test' }); assert.equal(notifications.active, true);
  await notifications.detach();
});
test('explicit activation confirms once, shares pending permission and respects DND',async()=>{
 const {BrowserNotifications}=await load(),f=environment(),n=new BrowserNotifications(f);n.attach('u_test',f.server);
 await Promise.all([n.enable(),n.enable()]);assert.equal(f.calls.filter(v=>v==='permission').length,1);assert.equal(f.calls.filter(v=>v==='/api/push/test').length,1);
 await n.disable();f.setQuiet(true);await n.enable();assert.equal(f.calls.filter(v=>v==='/api/push/test').length,1);assert.match(n.snapshot().hint,/Do not disturb/);
});
test('an unavailable background enrollment retains mobile worker live delivery without a desktop constructor',async()=>{
 const {BrowserNotifications}=await load(),f=environment({permission:'granted',enabled:true});f.server.publicOrigin='https://another.example.test';
 f.win.Notification=class{constructor(){throw new Error('No mobile constructor');}static permission='granted';};
 const n=new BrowserNotifications(f);n.attach('u_test',f.server);await n.task;assert.equal(n.active,false);assert.ok(n.binding);assert.match(n.snapshot().hint,/configured public HTTPS address/);
 assert.equal(await n.live({conversationId:'dm_mobile'}),true);assert.equal(f.shown.length,1);assert.equal(f.shown[0].options.data.conversationId,'dm_mobile');assert.ok(!f.calls.includes('native-notification'));
 await n.detach();await n.live({conversationId:'dm_mobile'});assert.equal(f.shown.length,1);
});
test('live-only activation confirms through the worker and a confirmation failure never claims success',async()=>{
 const {BrowserNotifications}=await load(),f=environment();f.server.configured=false;
 const n=new BrowserNotifications(f);n.attach('u_test',f.server);await n.enable();assert.equal(f.shown.length,1);assert.match(f.shown[0].options.body,/enabled on this device/);assert.ok(!f.calls.includes('/api/push/test'));
 const bad=environment(),request=bad.request;bad.request=async(route,options)=>{if(route==='/api/push/test')throw new Error('Synthetic confirmation failure');return request(route,options);};
 const pending=new BrowserNotifications(bad);pending.attach('u_test',bad.server);await pending.enable();assert.equal(bad.preferences.notifications,true);assert.match(pending.snapshot().hint,/confirmation could not be requested/);
});
test('disabling while the permission prompt is pending cannot enable or confirm the previous attempt',async()=>{
 const {BrowserNotifications}=await load(),f=environment();let finish;f.win.Notification.requestPermission=()=>new Promise(resolve=>{finish=resolve;});
 const n=new BrowserNotifications(f);n.attach('u_test',f.server);const pending=n.enable();await n.disable();f.win.Notification.permission='granted';finish('granted');await pending;
 assert.equal(f.preferences.notifications,false);assert.equal(n.active,false);assert.ok(!f.calls.includes('/api/push/test'));assert.equal(f.shown.length,0);
});
test('read visibility excludes another conversation, an unfocused window, voice, history and dialogs',async()=>{
 const {conversationIsInFocus}=await load(),base={conversationId:'dm_one',activeConversationId:'dm_one',view:'chat',hidden:false,focused:true};assert.equal(conversationIsInFocus(base),true);
 for(const change of [{activeConversationId:'dm_two'},{hidden:true},{focused:false},{view:'voice'},{history:true},{following:false},{loading:true},{modal:true},{conversationId:null}])assert.equal(conversationIsInFocus({...base,...change}),false);
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=source.indexOf('function isReadingConversation('),end=source.indexOf('async function selectConversation(',start),requests=[],doc={hidden:false,hasFocus:()=>false},state={activeConv:'dm_one',view:'chat'};
 const context=vm.createContext({conversationIsInFocus,state,document:doc,followChat:true,modalType:'',clearUnread:()=>{},request:async(route)=>requests.push(route)});vm.runInContext(source.slice(start,end),context);
 await context.markRead('dm_one');assert.equal(requests.length,0);doc.hasFocus=()=>true;await context.markRead('dm_one');assert.equal(requests.length,1);await context.markRead('dm_two');assert.equal(requests.length,1);
});
test('notification settings keep one activation switch with automatic confirmation and no test button',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/notification-ui.js'),'utf8'),{notificationPreferencesMarkup}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const enabled=notificationPreferencesMarkup({notifications:true},{permission:'granted',enabled:true,active:true});assert.ok(!enabled.includes('test-notifications'));assert.ok(enabled.includes('confirmation alert'));assert.equal((enabled.match(/role="switch"/g)||[]).length,1);
 const waiting=notificationPreferencesMarkup({notifications:true},{permission:'granted',enabled:true,active:false,push:true,secure:true,configured:true});assert.ok(waiting.includes('retry-notifications'));assert.ok(!waiting.includes('test-notifications'));
});
test('first-DM realtime metadata alerts before workspace refresh and server mention policy remains authoritative',async()=>{
 const {messageWantsAlert}=await load(),state={userId:'u_reader',dms:[],servers:[]},message={conversationId:'dm_new',notificationPolicy:'all',mentions:[]};
 assert.equal(messageWantsAlert(message,state),true);message.notificationPolicy='mentions';assert.equal(messageWantsAlert(message,state),false);message.mentions=['u_reader'];assert.equal(messageWantsAlert(message,state),true);
 delete message.notificationPolicy;message.mentions=[];assert.equal(messageWantsAlert(message,state),false);state.dms=[{id:'dm_new'}];assert.equal(messageWantsAlert(message,state),true);
});

test('live worker and native notifications display the server-generated detailed envelope',async()=>{
 const {BrowserNotifications}=await load(),f=environment({permission:'granted',enabled:true});f.server.configured=false;
 const n=new BrowserNotifications(f);n.attach('u_test',f.server);await n.task;
 const message={conversationId:'dm_details',notification:{title:'Alex (@alex)',body:'Direct message · Photo'}};
 assert.equal(await n.live(message),true);assert.equal(f.shown[0].title,message.notification.title);assert.equal(f.shown[0].options.body,message.notification.body);
 n.registration=null;n.binding=null;assert.equal(await n.live(message),true);assert.equal(f.shown[1].title,message.notification.title);assert.ok(f.calls.includes('native-notification'));
 f.setQuiet(true);assert.equal(await n.live(message),false);assert.equal(f.shown.length,2);
});
