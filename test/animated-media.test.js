'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const load = () => import('data:text/javascript;base64,' + Buffer.from(readFileSync(path.join(__dirname, '../public/animated-media.js'))).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let count = 0; count < 100; count++) { if (predicate()) return; await tick(); } assert.ok(predicate(), 'asynchronous media operation completes'); }

test('reduced motion is a still frame by default; deliberate interaction can play but background/offscreen media cannot', async () => {
  const { mediaCanPlay } = await load();
  assert.equal(mediaCanPlay({}), true);
  assert.equal(mediaCanPlay({ motion: false }), false);
  assert.equal(mediaCanPlay({ systemReduced: true }), false);
  for (const key of ['hovered', 'focused', 'pressed']) {
    assert.equal(mediaCanPlay({ motion: false, [key]: true }), true);
    assert.equal(mediaCanPlay({ systemReduced: true, [key]: true }), true);
    assert.equal(mediaCanPlay({ hidden: true, [key]: true }), false);
    assert.equal(mediaCanPlay({ visible: false, [key]: true }), false);
  }
});
test('GIPHY stills must come from the same trusted provider identity, with query strings unchanged', async () => {
  const { giphyIdentity, trustedStill, motionImageAttributes } = await load();
  const source='https://media2.giphy.com/media/v1.safe/ABC/100.gif?cid=original',still='https://media2.giphy.com/media/ABC/100_s.gif?cid=original&rid=100';
  assert.equal(giphyIdentity(source),'ABC'); assert.equal(trustedStill(source,still),still);
  assert.ok(motionImageAttributes({url:source,still}).includes('cid=original&amp;rid=100'));
  assert.equal(trustedStill(source,'https://media2.giphy.com/media/OTHER/100_s.gif'),'');
  for (const url of ['https://media.giphy.com.evil.example/media/ABC/100.gif', 'http://media.giphy.com/media/ABC/100.gif', 'https://user@media.giphy.com/media/ABC/100.gif', 'javascript:alert(1)']) assert.equal(giphyIdentity(url), '');
});
test('poster caching evicts by both bytes and LRU count and never retains an oversized entry', async () => {
  const { PosterCache } = await load(), cache = new PosterCache({ entries: 2, bytes: 20 });
  cache.set('one', '1111'); cache.set('two', '2222'); assert.equal(cache.get('one'), '1111'); cache.set('three', '3333');
  assert.equal(cache.get('two'), undefined); assert.equal(cache.items.size, 2); assert.ok(cache.size <= 20);
  cache.set('huge', 'x'.repeat(30)); assert.equal(cache.get('huge'), undefined);
  cache.set('one', '1'); assert.equal(cache.size, 10); cache.clear(); assert.equal(cache.size, 0);
});

class Element extends EventTarget {
  constructor(source, doc, banner = false) {
    super(); this.nodeType = 1; this.tagName = banner ? 'DIV' : 'IMG'; this.ownerDocument = doc; this.isConnected = true; this.complete = true; this.naturalWidth = 640; this.naturalHeight = 400;
    this.attributesMap = new Map(); this.styles = new Map(); this.style = { getPropertyValue: key => this.styles.get(key) || '', setProperty: (key, value) => this.styles.set(key, value) };
    if (banner) { this.setAttribute('data-artwork-banner', ''); this.style.setProperty('--artwork-src', `url('${source}')`); } else this.setAttribute('src', source);
  }
  setAttribute(key, value) { this.attributesMap.set(key, value); }
  getAttribute(key) { return this.attributesMap.get(key) ?? null; }
  hasAttribute(key) { return this.attributesMap.has(key); }
  closest() { return null; }
  contains(node) { return node === this; }
  matches() { return this.tagName === 'IMG' || this.hasAttribute('data-artwork-banner'); }
  querySelectorAll() { return []; }
}
function environment() {
  const doc = new EventTarget(); doc.baseURI = 'https://nexus.example/'; doc.hidden = false;
  const system = new EventTarget(); system.matches = false;
  const win = { AbortController, matchMedia: () => system, setTimeout: callback => setImmediate(callback), MutationObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} } };
  doc.defaultView = win;
  const root = new EventTarget(); root.ownerDocument = doc; root.querySelectorAll = () => []; root.matches = () => false;
  return { doc, win, root, system };
}
test('the controller deduplicates frame work, restores interaction playback and ignores a stale pause after re-enabling animations', async () => {
  const { AnimatedMedia } = await load(), env = environment(), gates = [], poster = 'data:image/webp;base64,fixture'; let captures = 0;
  const manager = new AnimatedMedia({ ...env, motion: false, snapshot: () => { captures++; return new Promise(resolve => gates.push(resolve)); } });
  const one = new Element('/files/avatar', env.doc), two = new Element('/files/avatar', env.doc);
  manager.register(one); manager.register(two); await until(() => gates.length === 1); assert.equal(captures, 1);
  manager.setMotion(true); gates[0](poster); await until(() => manager.pending.size === 0);
  assert.equal(one.getAttribute('src'), '/files/avatar');
  manager.setMotion(false); assert.equal(one.getAttribute('src'), poster); assert.equal(two.getAttribute('src'), poster);
  const record = manager.records.get(one); record.hovered = true; manager.update(record); assert.equal(one.getAttribute('src'), '/files/avatar');
  record.hovered = false; manager.update(record); assert.equal(one.getAttribute('src'), poster); assert.equal(captures, 1);
  env.doc.hidden = true; record.hovered = true; manager.updateAll(); assert.equal(one.getAttribute('src'), poster);
  one.isConnected = false; manager.prune(); assert.equal(manager.records.has(one), false); manager.destroy();
});
test('poster jobs are bounded; removing/account-resetting media prevents late frames from returning to the cache', async () => {
  const { AnimatedMedia, ANIMATED_MEDIA_CONFIG } = await load(), env = environment(), gates = [];
  const manager = new AnimatedMedia({ ...env, motion: false, snapshot: () => new Promise(resolve => gates.push(resolve)) });
  for (let index = 0; index < 8; index++) manager.register(new Element(`/files/${index}`, env.doc));
  await until(() => gates.length === ANIMATED_MEDIA_CONFIG.concurrency); assert.equal(manager.running, 2);
  manager.reset(); for (const resolve of gates) resolve('data:image/webp;base64,old-account');
  await until(() => manager.running === 0); assert.equal(manager.cache.items.size, 0); assert.equal(manager.records.size, 0); assert.equal(manager.pending.size, 0); manager.destroy();
});
test('legacy provider media pauses immediately while the exact API still is resolving', async () => {
  const { AnimatedMedia } = await load(), env = environment(); let finish;
  const manager = new AnimatedMedia({ ...env, motion: false, providerStill: () => new Promise(resolve => { finish = resolve; }) });
  const node = new Element('https://media.giphy.com/media/ABC/200.gif', env.doc); node.complete = false;
  manager.register(node); assert.equal(node.getAttribute('data-motion-state'), 'paused'); assert.match(node.getAttribute('src'), /^data:image\/svg/);
  await until(() => finish); const still = 'https://media2.giphy.com/media/ABC/200_s.gif?cid=unchanged'; finish(still);
  await until(() => node.getAttribute('src') === still); assert.equal(node.getAttribute('data-motion-state'), 'paused'); manager.destroy();
});
test('reconciliation preserves paused image sources and crops without hiding a newly assigned image', async () => {
  const { preserveMotionSource } = await load(), env = environment();
  const current = new Element('/files/original', env.doc), desired = new Element('/files/original', env.doc);
  current._nexusMotion = { active: true, kind: 'image', source: '/files/original', applied: 'data:image/webp;base64,still' }; current.setAttribute('data-motion-state', 'paused');
  preserveMotionSource(current, desired); assert.equal(desired.getAttribute('src'), current._nexusMotion.applied);
  const replacement = new Element('/files/new', env.doc); preserveMotionSource(current, replacement); assert.equal(replacement.getAttribute('src'), '/files/new');
  const banner = new Element('/files/banner', env.doc, true), draft = new Element('/files/banner', env.doc, true);
  banner._nexusMotion = { active: true, kind: 'banner', source: '/files/banner', applied: 'data:image/webp;base64,banner' };
  draft.style.setProperty('--artwork-x', '72%'); preserveMotionSource(banner, draft);
  assert.equal(draft.style.getPropertyValue('--artwork-src'), 'url("data:image/webp;base64,banner")'); assert.equal(draft.style.getPropertyValue('--artwork-x'), '72%');
});
test('resuming a tab keeps the current image until its replacement decodes and ignores a reversed or removed request', async () => {
  const { AnimatedMedia } = await load(), env = environment(), decoding = [];
  env.win.setTimeout = setTimeout; env.win.clearTimeout = clearTimeout;
  env.win.Image = class { set src(value) { this.source = value; decoding.push(this); } decode() { return Promise.resolve(); } };
  const poster = 'data:image/webp;base64,prepared', node = new Element('/files/resume', env.doc);
  const manager = new AnimatedMedia({ ...env, motion: false, snapshot: async () => poster }); manager.register(node);
  await until(() => decoding.length === 1); assert.equal(node.getAttribute('src'), '/files/resume'); decoding.shift().onload(); await until(() => node.getAttribute('src') === poster);
  const record = manager.records.get(node); record.hovered = true; manager.update(record); assert.equal(node.getAttribute('src'), poster);
  record.hovered = false; manager.update(record); decoding.shift().onload(); await tick(); assert.equal(node.getAttribute('src'), poster);
  record.hovered = true; manager.update(record); decoding.shift().onload(); await until(() => node.getAttribute('src') === '/files/resume');
  record.hovered = false; manager.update(record); const pending = decoding.shift(); manager.reset(); pending.onload(); await tick(); assert.equal(node.getAttribute('src'), '/files/resume'); manager.destroy();
});
