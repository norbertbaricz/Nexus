// Native image elements have no pause API. Replace their source with a bounded
// still frame instead, so the animated decoder can actually stop doing work.
export const ANIMATED_MEDIA_CONFIG = Object.freeze({
  maxPosterEdge: 1280, maxPosterPixels: 1280 * 720, posterQuality: 0.82,
  cacheEntries: 48, cacheBytes: 12 * 1024 ** 2, concurrency: 2,
  idleTimeoutMs: 180, imageTimeoutMs: 10000,
  sourceDecodeMs: 4000, sourceDecodeConcurrency: 4,
});
const FALLBACK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="100%" height="100%" fill="#25252b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#b7b7c4">GIF</text></svg>');

export function mediaCanPlay({ motion = true, systemReduced = false, hidden = false, visible = true, hovered = false, focused = false, pressed = false }) {
  return !hidden && visible && (motion && !systemReduced || hovered || focused || pressed);
}
export function giphyIdentity(source) {
  try {
    const url = new URL(source);
    const parts = url.pathname.split('/');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash && /^media[0-4]?\.giphy\.com$/.test(url.hostname) && url.pathname.startsWith('/media/') && /^[a-zA-Z0-9]{1,80}$/.test(parts.at(-2)) && /^[\w-]+\.gif$/.test(parts.at(-1)) ? parts.at(-2) : '';
  } catch { return ''; }
}
export function trustedStill(source, still) { const id = giphyIdentity(source); return id && giphyIdentity(still) === id && /_s\.gif$/.test(new URL(still).pathname) ? still : ''; }
export function motionImageAttributes(file = {}) {
  const still = trustedStill(file.url, file.still); if (!still) return '';
  return `data-motion-still="${still.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))}"`;
}
export class PosterCache {
  constructor({ entries = ANIMATED_MEDIA_CONFIG.cacheEntries, bytes = ANIMATED_MEDIA_CONFIG.cacheBytes } = {}) { this.entries = entries; this.bytes = bytes; this.items = new Map(); this.size = 0; }
  get(key) { const value = this.items.get(key); if (value) { this.items.delete(key); this.items.set(key, value); } return value?.url; }
  set(key, url) {
    if (this.items.has(key)) { this.size -= this.items.get(key).bytes; this.items.delete(key); }
    const bytes = url.length * 2;
    if (bytes > this.bytes) return;
    this.items.set(key, { url, bytes }); this.size += bytes;
    while (this.items.size > this.entries || this.size > this.bytes) { const first = this.items.keys().next().value; this.size -= this.items.get(first).bytes; this.items.delete(first); }
  }
  clear() { this.items.clear(); this.size = 0; }
}
function imageValue(node) {
  if (node.tagName === 'IMG') return { source: node.getAttribute('src') || '', kind: 'image' };
  const value = node.style.getPropertyValue('--artwork-src');
  return { source: value.match(/^url\(["']?(.*?)["']?\)$/)?.[1] || '', value, kind: 'banner' };
}
function managedSource(source, base) {
  if (/^blob:|^data:image\/(?:gif|webp|png)/i.test(source)) return true;
  try { const url = new URL(source, base); return url.origin === new URL(base).origin && /^\/files\/|^\/assets\/gifs\//.test(url.pathname) || /\.(?:gif|webp)(?:$|[?#])/i.test(url.href); } catch { return false; }
}

// Reconciliation must compare the original source, not restart every GIF when a
// presence, reaction, badge or unread count changes. Crop values still update.
export function preserveMotionSource(current, desired) {
  const record = current._nexusMotion;
  if (!record || !record.active) return;
  const next = imageValue(desired);
  if (next.kind !== record.kind || next.source !== record.source) return;
  if (record.kind === 'image') desired.setAttribute('src', record.applied);
  else desired.style.setProperty('--artwork-src', `url("${record.applied}")`);
  if (current.hasAttribute('data-motion-state')) desired.setAttribute('data-motion-state', current.getAttribute('data-motion-state'));
}

export class AnimatedMedia {
  constructor({ root = document.body, motion = true, snapshot, providerStill = async () => '', window: win = root.ownerDocument.defaultView } = {}) {
    this.root = root; this.win = win; this.doc = root.ownerDocument; this.motion = motion;
    this.records = new Map(); this.hosts = new Map(); this.pressed = new Set(); this.cache = new PosterCache(); this.pending = new Map(); this.jobs = []; this.running = 0; this.scanQueue = new Set(); this.epoch = 0;
    this.sourceJobs = []; this.sourcePending = new Map(); this.sourceRunning = 0;
    // Provider stills come from the API unchanged; do not rewrite its URLs or
    // copy its media into local canvas/frame caches.
    this.snapshot = snapshot || (async (source, node) => giphyIdentity(source) ? await providerStill(source) || FALLBACK : this.capture(source, node));
    this.controller = new win.AbortController(); const signal = this.controller.signal;
    this.system = win.matchMedia('(prefers-reduced-motion: reduce)');
    this.system.addEventListener('change', () => this.updateAll(), { signal });
    this.doc.addEventListener('visibilitychange', () => this.updateAll(), { signal });
    this.observer = new win.MutationObserver(changes => {
      let removed = false;
      for (const change of changes) {
        if (change.type === 'attributes') { if (change.attributeName === 'inert') this.updateAll(); else this.queueScan(change.target); }
        else { if (change.removedNodes.length) removed = true; for (const node of change.addedNodes) if (node.nodeType === 1) this.queueScan(node); }
      }
      if (removed) this.prune();
    });
    if (win.IntersectionObserver) this.intersection = new win.IntersectionObserver(entries => {
      for (const entry of entries) { const record = this.records.get(entry.target); if (record) { record.visible = entry.isIntersecting; this.update(record); } }
    });
    this.observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'style', 'data-motion-still', 'inert'] });
    root.addEventListener('load', event => { const record = this.records.get(event.target); if (record) this.update(record); }, { capture: true, signal });
    root.addEventListener('error', event => {
      const record = this.records.get(event.target);
      if (record && record.applied !== record.source) { record.stillFailed = true; record.still = ''; this.cache.set(record.source, FALLBACK); if (!this.playing(record)) this.apply(record, FALLBACK, 'paused'); }
    }, { capture: true, signal });
    for (const [name, key, value] of [['pointerover','hovered',true], ['pointerout','hovered',false], ['focusin','focused',true], ['focusout','focused',false], ['pointerdown','pressed',true], ['pointerup','pressed',false], ['pointercancel','pressed',false]]) {
      root.addEventListener(name, event => {
        if (key === 'hovered' && event.pointerType === 'touch') return;
        // Resolve only ancestors of the pointer/focus target. Walking the entire
        // image list for every mouse movement scales poorly in busy communities.
        for (let host = event.target; host; host = host.parentElement) {
          const records = this.hosts.get(host); if (!records || event.relatedTarget && host.contains(event.relatedTarget)) continue;
          for (const record of records) { record[key] = value; if (key === 'pressed') value ? this.pressed.add(record) : this.pressed.delete(record); this.update(record); }
          if (host === this.root) break;
        }
        if (name === 'pointerup' || name === 'pointercancel') { for (const record of this.pressed) { record.pressed = false; this.update(record); } this.pressed.clear(); }
      }, { passive: true, signal });
    }
    this.scan(root);
  }
  queueScan(node) {
    this.scanQueue.add(node); if (this.scanScheduled) return; this.scanScheduled = true;
    queueMicrotask(() => { this.scanScheduled = false; const nodes = [...this.scanQueue]; this.scanQueue.clear(); for (const item of nodes) if (item.isConnected) this.scan(item); });
  }
  scan(root) {
    if (root.matches?.('img[src],[data-artwork-banner]')) this.register(root);
    for (const node of root.querySelectorAll('img[src],[data-artwork-banner]')) this.register(node);
  }
  register(node) {
    const value = imageValue(node), previous = this.records.get(node);
    if (previous && (value.source === previous.applied || value.source === previous.source)) {
      previous.still = previous.stillFailed ? '' : trustedStill(previous.source, node.getAttribute('data-motion-still')); this.bindHost(previous); this.update(previous); return;
    }
    if (previous) this.remove(previous);
    if (!managedSource(value.source, this.doc.baseURI)) return;
    const record = { ...value, node, applied: value.source, still: trustedStill(value.source, node.getAttribute('data-motion-still')), visible: true, active: true, hovered: false, focused: false, pressed: false };
    node._nexusMotion = record; this.records.set(node, record); this.bindHost(record); this.intersection?.observe(node); this.update(record);
  }
  bindHost(record) {
    const host = record.node.closest('button,a,[tabindex],.artwork-surface') || record.node;
    if (record.host === host) return;
    if (record.host) { const previous = this.hosts.get(record.host); previous?.delete(record); if (!previous?.size) this.hosts.delete(record.host); }
    record.host = host; if (!this.hosts.has(host)) this.hosts.set(host, new Set()); this.hosts.get(host).add(record);
  }
  playing(record) { return !record.node.closest('[inert]') && mediaCanPlay({ ...record, motion: this.motion, systemReduced: this.system.matches, hidden: this.doc.hidden }); }
  setMotion(value) { if (this.motion === value) return; this.motion = value; this.updateAll(); }
  updateAll() { this.prune(); for (const record of this.records.values()) this.update(record); }
  apply(record, source, state) {
    if (!record.active || !record.node.isConnected) return;
    const unchanged = record.targetSource === source; record.targetSource = source; record.targetState = state;
    const commit = () => {
      if (!record.active || !record.node.isConnected || record.targetSource !== source) return;
      if (source !== record.applied) {
        record.applied = source;
        if (record.kind === 'image') record.node.setAttribute('src', source);
        else record.node.style.setProperty('--artwork-src', `url("${source}")`);
      }
      if (record.node.getAttribute('data-motion-state') !== record.targetState) record.node.setAttribute('data-motion-state', record.targetState);
    };
    if (source === record.applied || !this.win.Image) { commit(); return; }
    if (unchanged) return;
    // Decode an alternate still/original before swapping a visible source. The
    // current frame stays mounted while a returned tab resumes its images.
    this.decodeSource(source).then(commit);
  }
  decodeSource(source) {
    if (this.sourcePending.has(source)) return this.sourcePending.get(source);
    const job = { source }, task = new Promise(resolve => { job.resolve = resolve; }); job.task = task; this.sourceJobs.push(job);
    this.sourcePending.set(source, task); this.decodeNext(); return task;
  }
  decodeNext() {
    while (this.sourceRunning < ANIMATED_MEDIA_CONFIG.sourceDecodeConcurrency && this.sourceJobs.length) {
      const job = this.sourceJobs.shift(), image = new this.win.Image(); this.sourceRunning++; let finished = false;
      const finish = () => {
        if (finished) return; finished = true;
        this.win.clearTimeout(timer); image.onload = image.onerror = null;
        this.sourceRunning--; if(this.sourcePending.get(job.source)===job.task)this.sourcePending.delete(job.source); job.resolve(); this.decodeNext();
      };
      const timer = this.win.setTimeout(finish, ANIMATED_MEDIA_CONFIG.sourceDecodeMs);
      image.onload = () => { Promise.resolve().then(() => image.decode?.()).catch(() => {}).then(finish); };
      image.onerror = finish; image.referrerPolicy = 'no-referrer'; image.src = job.source;
    }
  }
  update(record) {
    if (!record.active) return;
    if (this.playing(record)) { this.apply(record, record.source, 'playing'); return; }
    const poster = record.still || this.cache.get(record.source);
    if (poster) { this.apply(record, poster, 'paused'); return; }
    // Lazy images below the viewport must not be loaded just to freeze them.
    if (giphyIdentity(record.source)) this.apply(record, FALLBACK, 'paused');
    else if (record.kind === 'image' && !record.node.complete) return;
    if (record.waiting) return; record.waiting = true;
    this.poster(record.source, record.kind === 'image' ? record.node : null).then(url => {
      record.waiting = false;
      if (record.active && !this.playing(record)) this.apply(record, url, 'paused');
    });
  }
  poster(source, node) {
    const cached = this.cache.get(source); if (cached) return Promise.resolve(cached);
    if (this.pending.has(source)) return this.pending.get(source);
    const promise = new Promise(resolve => { this.jobs.push({ source, node, resolve, epoch: this.epoch }); this.schedule(); });
    this.pending.set(source, promise); return promise;
  }
  schedule() {
    if (this.scheduled) return; this.scheduled = true;
    const run = () => { this.scheduled = false; while (this.running < ANIMATED_MEDIA_CONFIG.concurrency && this.jobs.length) {
      const job = this.jobs.shift(); this.running++;
      Promise.resolve().then(() => this.snapshot(job.source, job.node)).catch(() => FALLBACK).then(url => {
        const poster = url || FALLBACK;
        if (job.epoch === this.epoch) { this.cache.set(job.source, poster); this.pending.delete(job.source); }
        this.running--; job.resolve(poster); if (this.jobs.length) this.schedule();
      });
    } };
    if (this.win.requestIdleCallback) this.win.requestIdleCallback(run, { timeout: ANIMATED_MEDIA_CONFIG.idleTimeoutMs }); else this.win.setTimeout(run, 0);
  }
  async capture(source, node) {
    let image = node;
    if (!image?.naturalWidth || image.getAttribute('src') !== source) {
      image = new this.win.Image(); image.referrerPolicy = 'no-referrer';
      if (new URL(source, this.doc.baseURI).origin !== new URL(this.doc.baseURI).origin) image.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        const timer = this.win.setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('Image preview timed out.')); }, ANIMATED_MEDIA_CONFIG.imageTimeoutMs);
        image.onload = () => { this.win.clearTimeout(timer); resolve(); }; image.onerror = () => { this.win.clearTimeout(timer); reject(new Error('Image preview unavailable.')); }; image.src = source;
      });
    }
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height) throw new Error('Image has no dimensions.');
    const scale = Math.min(1, ANIMATED_MEDIA_CONFIG.maxPosterEdge / Math.max(width, height), Math.sqrt(ANIMATED_MEDIA_CONFIG.maxPosterPixels / (width * height)));
    const canvas = this.doc.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', ANIMATED_MEDIA_CONFIG.posterQuality));
      if (!blob) throw new Error('Image preview could not be encoded.');
      return await new Promise((resolve, reject) => { const reader = new this.win.FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    } finally { canvas.width = canvas.height = 0; }
  }
  remove(record) { record.active = false; this.intersection?.unobserve(record.node); this.records.delete(record.node); this.pressed.delete(record); const hosts = this.hosts.get(record.host); hosts?.delete(record); if (!hosts?.size) this.hosts.delete(record.host); if (record.node._nexusMotion === record) delete record.node._nexusMotion; }
  prune() { for (const record of this.records.values()) if (!record.node.isConnected) this.remove(record); }
  reset() { this.epoch++; for (const record of this.records.values()) this.remove(record); for (const job of this.jobs.splice(0)) job.resolve(FALLBACK); for (const job of this.sourceJobs.splice(0)) job.resolve(); this.sourcePending.clear(); this.pending.clear(); this.cache.clear(); }
  destroy() { this.controller.abort(); this.observer.disconnect(); this.intersection?.disconnect(); this.reset(); }
}
