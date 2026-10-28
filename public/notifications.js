export const NOTIFICATION_CONFIG = Object.freeze({ worker: '/service-worker.js', deviceKey: 'nexus.push.device.v1', publicKeyKey: 'nexus.push.public-key.v1', readyTimeoutMs: 8000, workerTimeoutMs: 3000, protocol: 1, titleLength:96, bodyLength:240 });
const idPattern = /^[a-zA-Z0-9_.:-]{1,128}$/;
// Focus on another channel, a call, history or a dialog is not reading this message.
export function conversationIsInFocus({ conversationId, activeConversationId, view, hidden, focused, following = true, history = false, loading = false, modal = false } = {}) {
  return Boolean(conversationId && conversationId === activeConversationId && view === 'chat' && !hidden && focused && following && !history && !loading && !modal);
}
export function messageWantsAlert(message, { userId, dms = [], servers = [] } = {}) {
  // Realtime metadata also covers a first DM arriving before workspace refresh.
  if (message.notificationPolicy === 'all') return true;
  if (message.notificationPolicy === 'mentions') return Boolean(message.mentions?.includes(userId));
  if (dms.some(dm=>dm.id===message.conversationId)) return true;
  const server=servers.find(server=>server.channels.some(channel=>channel.id===message.conversationId));
  return Boolean(server&&(server.defaultNotifications!=='mentions'||message.mentions?.includes(userId)));
}
export function notificationSupport(win, nav) {
  const installed = Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '') || nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
  return { secure: Boolean(win.isSecureContext), notification: Boolean(win.Notification), push: Boolean(nav.serviceWorker && win.PushManager), installed, ios };
}
export function applicationServerKey(value, decode = atob) {
  const binary = decode(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
export class BrowserNotifications {
  constructor({ request, getPreferences, isQuiet, onChange = () => {}, onEnabled = () => {}, onOpen = () => {}, window: win = window, navigator: nav = win.navigator, storage = win.localStorage }) {
    Object.assign(this, { request, getPreferences, isQuiet, onChange, onEnabled, onOpen, win, nav, storage });
    this.userId = null; this.server = { configured: false }; this.active = false; this.registration = null; this.binding = null; this.epoch = 0; this.task = null; this.enabling = null; this.error = ''; this.lastQuiet = null; this.lastBadge = null;
    try { this.deviceId = storage?.getItem(NOTIFICATION_CONFIG.deviceKey) || ''; } catch { this.deviceId = ''; }
    if (!/^[a-f0-9]{32}$/.test(this.deviceId)) { const bytes = new Uint8Array(16); win.crypto?.getRandomValues(bytes); this.deviceId = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); try { storage?.setItem(NOTIFICATION_CONFIG.deviceKey, this.deviceId); } catch { /* Optional device hint. */ } }
    nav.serviceWorker?.addEventListener('message', event => {
      let script; try { script = new URL(event.source?.scriptURL); } catch { return; }
      if (script.origin !== win.location.origin || script.pathname !== NOTIFICATION_CONFIG.worker || event.data?.version !== NOTIFICATION_CONFIG.protocol || event.data.type !== 'nexus:notification-open' || !idPattern.test(event.data.conversationId || '')) return;
      this.onOpen(event.data.conversationId);
    });
    for (const name of ['online', 'pageshow']) win.addEventListener(name, () => this.reconcile());
    win.document.addEventListener('visibilitychange', () => { if (!win.document.hidden) this.reconcile(); });
    try { nav.permissions?.query({ name: 'notifications' }).then(permission => permission.addEventListener('change', () => {
      if (this.win.Notification?.permission === 'denied') this.disable(); else this.reconcile();
    })).catch(() => {}); } catch { /* Permission queries are optional on older browsers. */ }
  }
  snapshot() {
    const support = notificationSupport(this.win, this.nav), permission = this.win.Notification?.permission || 'unsupported';
    let hint = this.active ? 'Background delivery is connected on this device. Messages open their conversation when selected.' : this.getPreferences().notifications ? 'Live notifications are enabled while Nexus remains open.' : 'Enable notifications for direct messages and server alerts on this device.';
    if (!support.secure) hint = 'Open Nexus over HTTPS to enable system notifications.';
    else if (!support.notification) hint = support.ios && !support.installed ? 'Add Nexus to Home Screen on iPhone or iPad, then enable notifications from that installed copy.' : 'This browser does not expose system notifications.';
    else if (permission === 'denied') hint = 'Notifications are blocked in browser or device settings. Allow them there before enabling this option.';
    else if (this.getPreferences().notifications && this.isQuiet()) hint = 'Notifications are enabled. Do not disturb pauses alerts and the activation confirmation.';
    else if (this.error) hint = this.error;
    else if (this.getPreferences().notifications && !this.server.configured) hint = this.server.reason === 'origin' ? 'Live notifications are enabled. The host needs a valid HTTPS PUBLIC_ORIGIN for background delivery.' : 'Live notifications are enabled. Background delivery is currently unavailable on the host.';
    else if (this.getPreferences().notifications && !support.push) hint = 'This browser supports live notifications while Nexus is open; background delivery is unavailable here.';
    return { ...support, configured:Boolean(this.server.configured), permission, active: this.active, busy: Boolean(this.task || this.enabling), enabled: this.getPreferences().notifications && permission === 'granted', hint };
  }
  changed() { this.onChange(this.snapshot()); }
  attach(userId, server) {
    if (this.userId !== userId) { this.epoch++; this.userId = userId; this.active = false; this.binding = null; this.task = null; this.enabling = null; }
    this.server = server || { configured: false }; this.changed(); this.reconcile();
  }
  async detach() {
    const userId = this.userId, epoch = ++this.epoch; this.userId = null; this.active = false; this.binding = null; this.task = null; this.enabling = null; this.lastQuiet = null; this.badge(0); this.changed();
    if (!userId) return;
    try { const registration = this.registration || await this.nav.serviceWorker?.getRegistration('/'); if (registration?.active && epoch === this.epoch && !this.userId) await this.worker({ type: 'nexus:unbind', userId }, registration); } catch { /* Session revocation also removes server bindings. */ }
  }
  async enable() {
    if (this.enabling) return this.enabling;
    const support = notificationSupport(this.win, this.nav);
    if (!support.secure || !support.notification) throw new Error(this.snapshot().hint);
    const epoch=this.epoch,userId=this.userId;
    if(!userId)throw new Error('Sign in before enabling notifications.');
    // This call starts directly in the user's click handler, before any await.
    const permission = this.win.Notification.requestPermission();
    const enabling=(async()=>{
      const allowed=await permission;if(epoch!==this.epoch||userId!==this.userId)return;
      if (allowed !== 'granted') throw new Error('Allow notifications in the browser or device prompt to enable them.');
      this.onEnabled(true); await this.reconcile();
      if(epoch!==this.epoch||userId!==this.userId||!this.getPreferences().notifications||this.isQuiet())return;
      // Confirm only explicit activation, never ordinary tab restoration/reconnect.
      try { await this.test(); }
      catch { if(epoch===this.epoch){this.error='Notifications are enabled, but the confirmation could not be requested. Check this device’s notification settings and reconnect.';this.changed();} }
    })();
    this.enabling=enabling;this.changed();
    try { await enabling; } finally { if(this.enabling===enabling){this.enabling=null;this.changed();} }
  }
  async disable() {
    const epoch = ++this.epoch, userId = this.userId; this.onEnabled(false); this.active = false; this.binding = null; this.task = null; this.enabling = null; this.error = ''; this.changed(); this.badge(0);
    try { const registration = this.registration || await this.nav.serviceWorker?.getRegistration('/'); if (epoch !== this.epoch) return; if (registration?.active) await this.worker({ type: 'nexus:unbind', userId }, registration); const subscription = await registration?.pushManager?.getSubscription(); await subscription?.unsubscribe(); } catch { /* Retry on the next explicit enable. */ }
    if (userId && epoch === this.epoch) { try { await this.request('/api/push/subscription', { method: 'DELETE', body: { deviceId: this.deviceId } }); } catch { /* Unsubscribed endpoints expire at the push service. */ } }
  }
  async registrationReady() {
    if (this.registration?.active) return this.registration;
    let timer;
    try {
      this.registration = await Promise.race([(async () => { await this.nav.serviceWorker.register(NOTIFICATION_CONFIG.worker, { scope: '/', updateViaCache: 'none' }); return this.nav.serviceWorker.ready; })(), new Promise((_, reject) => { timer = this.win.setTimeout(() => reject(new Error('The notification worker could not connect. Reconnect notifications after the connection returns.')), NOTIFICATION_CONFIG.readyTimeoutMs); })]);
      return this.registration;
    } finally { this.win.clearTimeout(timer); }
  }
  worker(value, registration = this.registration) {
    return new Promise((resolve, reject) => {
      if (!registration?.active) return reject(new Error('The notification worker is not active yet.'));
      const channel = new this.win.MessageChannel(); let timer;
      const finish = error => { this.win.clearTimeout(timer); channel.port1.close(); error ? reject(error) : resolve(); };
      channel.port1.onmessage = event => finish(event.data?.ok ? null : new Error('Notification storage could not be updated.'));
      timer = this.win.setTimeout(() => finish(new Error('The notification worker did not respond.')), NOTIFICATION_CONFIG.workerTimeoutMs);
      registration.active.postMessage({ ...value, version: NOTIFICATION_CONFIG.protocol }, [channel.port2]);
    });
  }
  reconcile() {
    if (this.task) return this.task;
    const support = notificationSupport(this.win, this.nav);
    if (!this.userId || !this.getPreferences().notifications || this.win.Notification?.permission !== 'granted' || !support.secure) { this.changed(); return Promise.resolve(); }
    const epoch = this.epoch, userId = this.userId;
    this.task = (async () => {
      if (!this.nav.serviceWorker) return;
      const registration = await this.registrationReady(); if (epoch !== this.epoch) return;
      this.server = await this.request('/api/push/status?deviceId='+this.deviceId); if (epoch !== this.epoch) return;
      let result;
      if (this.server.configured && support.push) {
        if (this.server.publicOrigin !== this.win.location.origin) throw new Error('Open Nexus at its configured public HTTPS address to connect background notifications.');
        let subscription = await registration.pushManager.getSubscription(), previousKey = '';
        try { previousKey = this.storage?.getItem(NOTIFICATION_CONFIG.publicKeyKey) || ''; } catch { /* Optional key-rotation hint. */ }
        const desiredKey = applicationServerKey(this.server.applicationServerKey, this.win.atob.bind(this.win)), actualKey = subscription?.options?.applicationServerKey && new Uint8Array(subscription.options.applicationServerKey);
        const keyChanged = actualKey && (actualKey.length !== desiredKey.length || actualKey.some((value, index) => value !== desiredKey[index]));
        if (subscription && (!this.server.enrolled || keyChanged || previousKey && previousKey !== this.server.applicationServerKey || subscription.expirationTime && subscription.expirationTime <= Date.now())) { await subscription.unsubscribe(); subscription = null; }
        subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desiredKey });
        if (epoch !== this.epoch) return;
        result = await this.request('/api/push/subscription', { method: 'POST', body: { deviceId: this.deviceId, subscription: subscription.toJSON() } });
        if (epoch !== this.epoch) return;
        if (result.userId !== userId) throw new Error('The signed-in account changed. Reopen Nexus to connect notifications.');
        try { this.storage?.setItem(NOTIFICATION_CONFIG.publicKeyKey, this.server.applicationServerKey); } catch { /* Browser key options still protect the subscription. */ }
      } else {
        if(this.binding?.userId===userId)result=this.binding;
        else{const bytes = new Uint8Array(16); this.win.crypto.getRandomValues(bytes);result = { userId, deviceId: this.deviceId, bindingId: [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') };}
      }
      this.binding = { ...result, applicationServerKey: this.server.applicationServerKey || '', quiet: Boolean(this.isQuiet()) };
      try { await this.worker({ type: 'nexus:bind', binding: this.binding }); }
      catch (error) { if (this.server.configured) { try { await this.request('/api/push/subscription', { method: 'DELETE', body: { deviceId: this.deviceId } }); } catch { /* Session revocation remains authoritative. */ } } throw error; }
      if (epoch !== this.epoch) return;
      this.active = Boolean(this.server.configured && support.push); this.lastQuiet = this.binding.quiet; this.error = '';
    })().catch(async error => {
      if (epoch !== this.epoch) return;
      this.active = false;
      this.error = error.message === 'Open Nexus at its configured public HTTPS address to connect background notifications.' ? error.message : 'Background connection is pending. Reconnect notifications when the server is available.';
      // A background enrollment failure must not disable worker-based live alerts
      // on phones, where the Notification constructor cannot display them.
      if (!this.binding && this.registration?.active) {
        const bytes=new Uint8Array(16);this.win.crypto.getRandomValues(bytes);
        const binding={userId,deviceId:this.deviceId,bindingId:[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join(''),applicationServerKey:'',quiet:Boolean(this.isQuiet())};
        try { await this.worker({type:'nexus:bind',binding});if(epoch===this.epoch)this.binding=binding;else await this.worker({type:'nexus:unbind',userId}); } catch { /* Keep the enrollment warning visible. */ }
      }
    }).finally(() => { if (epoch === this.epoch) { this.task = null; this.changed(); } });
    this.changed(); return this.task;
  }
  quiet() {
    const quiet = Boolean(this.isQuiet()); if (quiet === this.lastQuiet) return; this.lastQuiet = quiet;
    if (this.userId && this.registration?.active && this.binding) this.worker({ type: 'nexus:quiet', userId: this.userId, quiet }).catch(() => {});
  }
  badge(count) {
    const value = this.userId && this.getPreferences().notifications ? Math.max(0, Number(count) || 0) : 0;
    if (value === this.lastBadge) return; this.lastBadge = value;
    try { const operation = value ? this.nav.setAppBadge?.(value) : this.nav.clearAppBadge?.(); operation?.catch(() => {}); } catch { /* Badging support is optional. */ }
  }
  async live(message) {
    const epoch=this.epoch;
    if(this.task)await this.task;
    if (epoch!==this.epoch || this.active || !this.userId || !this.getPreferences().notifications || this.isQuiet() || this.win.Notification?.permission !== 'granted' || !idPattern.test(message.conversationId||'')) return false;
    try { return await this.show(message); } catch { return false; }
  }
  async show(message,{test=false}={}) {
    const epoch=this.epoch,id=test?'':message.conversationId;
    const bounded=(value,max)=>typeof value==='string'?Array.from(value.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join(''):'';
    const title=test?'Nexus':bounded(message.notification?.title,NOTIFICATION_CONFIG.titleLength)||'Nexus';
    const options = { body: test ? 'Notifications are enabled on this device.' : bounded(message.notification?.body,NOTIFICATION_CONFIG.bodyLength)||'You have a new message.', icon: '/assets/nexus-icon-192.png', tag: `nexus:${this.binding?.bindingId||this.deviceId}:${id||'test'}`, silent: !this.getPreferences().sounds || !this.getPreferences().soundVolume, data:{version:NOTIFICATION_CONFIG.protocol,bindingId:this.binding?.bindingId||'',conversationId:id} };
    try {
      if (this.registration?.active && this.binding) { await this.registration.showNotification(title,options); return true; }
      const notification = new this.win.Notification(title, options); notification.onclick = () => { if(epoch===this.epoch&&this.userId){this.win.focus();if(id)this.onOpen(id);} notification.close(); };return true;
    } catch { throw new Error('This device could not display the notification. Check browser and device notification settings.'); }
  }
  async test() {
    if (this.isQuiet()) throw new Error('Turn off Do not disturb before testing notifications.');
    if (!this.userId || !this.getPreferences().notifications || this.win.Notification?.permission!=='granted')throw new Error('Enable notifications on this device first.');
    if (!this.active) return this.show({},{test:true});
    try { await this.request('/api/push/test', { method: 'POST', body: { deviceId: this.deviceId } }); }
    catch(error){if(error.status!==409)throw error;await this.reconcile();if(!this.active)throw error;await this.request('/api/push/test',{method:'POST',body:{deviceId:this.deviceId}});}
  }
}
