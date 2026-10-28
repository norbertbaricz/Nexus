'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/viewport.js'), 'utf8');
const load = () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('the keyboard close animation retains each visible height after focus leaves the editor', async () => {
  const { viewportFrame } = await load();
  let frame = viewportFrame({ layoutHeight: 844, visual: { height: 844, scale: 1, offsetTop: 0 } }); assert.equal(frame.height, '844px');
  for (const height of [760, 620, 480, 480, 560, 700, 844]) {
    frame = viewportFrame({ layoutHeight: 844, visual: { height, scale: 1, offsetTop: 0 }, previous: frame });
    assert.equal(frame.height, height + 'px'); assert.equal(frame.top, '0px');
  }
});
test('visual panning, pinch zoom, layout-resizing browsers and invalid intermediate reads have safe geometry', async () => {
  const { viewportFrame } = await load();
  const panned = viewportFrame({ layoutHeight: 844, visual: { height: 480, scale: 1, offsetTop: 90 } }); assert.equal(panned.top, '90px');
  assert.equal(viewportFrame({ layoutHeight: 844, visual: { height: 844, scale: 1, offsetTop: 90 } }).top, '0px');
  const zoomed = viewportFrame({ layoutHeight: 844, visual: { height: 422, scale: 2, offsetTop: 90 } }); assert.equal(zoomed.height, '100dvh'); assert.equal(zoomed.top, '0px'); assert.equal(zoomed.visualHeight, '422px');
  assert.equal(viewportFrame({ layoutHeight: 480 }).height, '480px');
  for (const height of [0, -1, NaN, Infinity]) assert.equal(viewportFrame({ layoutHeight: 844, visual: { height }, previous: panned }), panned);
  assert.equal(viewportFrame({ layoutHeight: 0 }).height, '100dvh');
});
function fixture() {
  const values = new Map(), frames = new Map(); let writes = 0, next = 0;
  const doc = new EventTarget(), win = new EventTarget(), visual = new EventTarget();
  doc.documentElement = { style: { getPropertyValue: name => values.get(name) || '', setProperty: (name, value) => { values.set(name, value); writes++; } } };
  Object.assign(visual, { height: 844, scale: 1, offsetTop: 0 });
  Object.assign(win, { document: doc, AbortController, visualViewport: visual, innerHeight: 844, requestAnimationFrame: callback => { frames.set(++next, callback); return next; }, cancelAnimationFrame: id => frames.delete(id) });
  return { win, doc, visual, values, frames, writes: () => writes, flush: () => { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); } };
}
test('resize/focus/scroll notifications share one frame; blur does not restore the full page behind an open keyboard', async () => {
  const { ViewportLayout } = await load(), f = fixture(); let layouts = 0;
  const controller = new ViewportLayout({ window: f.win, document: f.doc, onLayout: () => layouts++ });
  f.visual.height = 480;
  f.visual.dispatchEvent(new Event('resize')); f.win.dispatchEvent(new Event('resize')); f.doc.dispatchEvent(new Event('focusout'));
  assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.values.get('--viewport-height'), '480px');
  const writes = f.writes(); f.doc.dispatchEvent(new Event('focusout')); f.visual.dispatchEvent(new Event('scroll')); f.flush();
  assert.equal(f.values.get('--viewport-height'), '480px'); assert.equal(f.writes(), writes); assert.equal(layouts, 2);
  f.visual.height = 700; f.visual.dispatchEvent(new Event('resize')); f.flush(); assert.equal(f.values.get('--viewport-height'), '700px');
  f.visual.height = 844; f.visual.dispatchEvent(new Event('resize')); f.flush(); assert.equal(f.values.get('--viewport-height'), '844px');
  controller.destroy(); f.win.dispatchEvent(new Event('resize')); assert.equal(f.frames.size, 0);
});
test('a restored page/orientation refreshes geometry without rebuilding the UI or changing input focus', async () => {
  const { ViewportLayout } = await load(), f = fixture(); const editor = {}; f.doc.activeElement = editor;
  const controller = new ViewportLayout({ window: f.win, document: f.doc });
  f.win.innerHeight = f.visual.height = 390; f.win.dispatchEvent(new Event('orientationchange')); f.win.dispatchEvent(new Event('pageshow')); f.flush();
  assert.equal(f.values.get('--viewport-height'), '390px'); assert.equal(f.doc.activeElement, editor); controller.destroy();
});
test('out-of-order keyboard viewport events cannot expand the workspace behind the keyboard', async () => {
  const { viewportFrame } = await load();
  assert.equal(viewportFrame({ layoutHeight: 480, visual: { height: 844, scale: 1, offsetTop: 0 } }).height, '480px');
  assert.equal(viewportFrame({ layoutHeight: 844, visual: { height: 480, scale: 1, offsetTop: 0 } }).height, '480px');
  assert.equal(viewportFrame({ layoutHeight: 844, visual: { height: 844, scale: 1, offsetTop: 0 } }).height, '844px');
});
test('keyboard focus repairs root document panning without moving panels or focus; pinch zoom remains native',async()=>{
 const {ViewportLayout}=await load(),f=fixture(),editor={},panel={scrollTop:220},resets=[];
 f.doc.activeElement=editor;f.doc.scrollingElement={scrollTop:180,scrollLeft:0};f.win.scrollY=180;f.win.scrollX=0;
 f.win.scrollTo=options=>{resets.push(options);f.win.scrollY=f.win.scrollX=0;};
 const controller=new ViewportLayout({window:f.win,document:f.doc});assert.equal(resets.length,1);assert.equal(f.doc.scrollingElement.scrollTop,0);assert.equal(panel.scrollTop,220);assert.equal(f.doc.activeElement,editor);
 f.win.scrollY=200;f.doc.scrollingElement.scrollTop=200;f.win.dispatchEvent(new Event('scroll'));f.flush();assert.equal(resets.length,2);assert.equal(f.doc.scrollingElement.scrollTop,0);
 f.visual.scale=2;f.win.scrollY=160;f.doc.scrollingElement.scrollTop=160;f.visual.dispatchEvent(new Event('scroll'));f.flush();assert.equal(resets.length,2);assert.equal(f.doc.scrollingElement.scrollTop,160);assert.equal(f.doc.activeElement,editor);
 controller.destroy();
});
