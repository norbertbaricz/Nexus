'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const url = name => 'data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8')).toString('base64');
const load = name => import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../public', name), 'utf8').replace("'./config.js'", JSON.stringify(url('config.js'))).replace("'./icons.js'", JSON.stringify(url('icons.js'))) + '\n//# sourceURL=nexus-' + name).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));

function element(selectors = [], parent = null) {
  const classes = new Set(), styles = new Map();
  return { parentElement: parent, id: selectors.find(selector=>/^#[\w-]+$/.test(selector))?.slice(1)||'', dataset: {}, disabled: false, isConnected: true, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
    style: { setProperty: (name, value) => styles.set(name, value), removeProperty: name => styles.delete(name) },
    closest(query) { for (let node = this; node; node = node.parentElement) if (query.split(',').some(part => node.selectors.includes(part.trim()))) return node; return null; },
    matches(query) { return query.split(',').some(part=>selectors.includes(part.trim())); },
    contains(target) { for (let node = target; node; node = node.parentElement) if (node === this) return true; return false; }, selectors };
}
function environment() {
  const doc = new EventTarget(), app = element(['#app']), sidebar = element(['#sidebar'], app), message = element(['.message[data-message]'], app), row = element(['button'], sidebar), toast = element(['.toast']), handle = element(['.modal-drag-handle']), viewer = element(['.viewer-stage']);
  message.dataset.message = 'm_touch'; row.context = { kind: 'conversation', id: 'c_touch', node: row };
  const text = element([], message), timers = new Map(), calls = []; let next = 0, enabled = true;
  Object.assign(doc, { querySelector: query => query === '#app' ? app : null, getSelection: () => ({ isCollapsed: true }) });
  const win = { document: doc, innerWidth: 390, PointerEvent: class {}, AbortController, setTimeout: callback => { timers.set(++next, callback); return next; }, clearTimeout: id => timers.delete(id) };
  const fire = (type, target, patch = {}) => { const event = new Event(type, { cancelable: true }); Object.defineProperty(event, 'target', { value: target }); Object.assign(event, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 150, clientY: 200, ...patch }); doc.dispatchEvent(event); return event; };
  const options = { window: win, document: doc, enabled: () => enabled, dismissToast: () => calls.push('toast'), closeModal: () => calls.push('modal'), closePopover: () => calls.push('popover'), viewerNavigate: value => calls.push('viewer:' + value), viewerReady: () => true, hasConversation: () => true, openMembers: () => calls.push('members'), canReply: () => true, reply: id => calls.push('reply:' + id), messageOptions: id => calls.push('message:' + id), contextTarget: target => target.context, contextOptions: value => calls.push('context:' + value.id) };
  return { doc, win, app, sidebar, message, text, row, toast, handle, viewer, calls, timers, options, fire, disable: () => { enabled = false; } };
}

test('reply swipes consume one click; vertical scroll, cancellation, multitouch and a disabled preference never reply', async t => {
  const { installGestures } = await load('gestures.js'), f = environment(); t.after(installGestures(f.options));
  f.fire('pointerdown', f.text); assert.equal(f.fire('pointermove', f.text, { clientX: 230, clientY: 203 }).defaultPrevented, true); f.fire('pointerup', f.text, { clientX: 230, clientY: 203 });
  assert.deepEqual(f.calls, ['reply:m_touch']); assert.equal(f.fire('click', f.text).defaultPrevented, true);
  f.calls.length = 0; f.fire('pointerdown', f.text); f.fire('pointermove', f.text, { clientX: 153, clientY: 260 }); f.fire('pointerup', f.text, { clientX: 240, clientY: 260 }); assert.deepEqual(f.calls, []);
  f.fire('pointerdown', f.text); f.fire('pointercancel', f.text); f.fire('pointerup', f.text, { clientX: 250 }); assert.deepEqual(f.calls, []);
  f.fire('pointerdown', f.text); f.fire('pointerdown', f.text, { pointerId: 2, isPrimary: false }); f.fire('pointerup', f.text, { clientX: 250 }); assert.deepEqual(f.calls, []);
  f.disable(); f.fire('pointerdown', f.text); f.fire('pointerup', f.text, { clientX: 250 }); assert.deepEqual(f.calls, []);
});
test('drawer closing also works over channel buttons, without triggering their hold menu or following click', async t => {
  const { installGestures } = await load('gestures.js'), f = environment(); t.after(installGestures(f.options));
  f.app.classList.add('sidebar-open'); f.fire('pointerdown', f.row, { clientX: 230 }); f.fire('pointermove', f.row, { clientX: 100 }); f.fire('pointerup', f.row, { clientX: 100 });
  assert.equal(f.app.classList.contains('sidebar-open'), false); assert.equal(f.timers.size, 0); assert.deepEqual(f.calls, []); assert.equal(f.fire('click', f.row).defaultPrevented, true);
  f.fire('pointerdown', f.text, { clientX: 10 }); f.fire('pointerup', f.text, { clientX: 110 }); assert.equal(f.app.classList.contains('sidebar-open'), true);
});
test('toast, viewer and downward sheet gestures work; long presses still open target-specific menus', async t => {
  const { installGestures } = await load('gestures.js'), f = environment(); t.after(installGestures(f.options));
  let clock = 1000; t.mock.method(Date, 'now', () => clock);
  for (const target of [f.toast, f.viewer]) { f.fire('pointerdown', target); f.fire('pointermove', target, { clientX: 50 }); f.fire('pointerup', target, { clientX: 50 }); }
  f.fire('pointerdown', f.handle); f.fire('pointermove', f.handle, { clientY: 300 }); f.fire('pointerup', f.handle, { clientY: 300 });
  f.fire('pointerdown', f.row); const hold = [...f.timers.values()][0]; hold();
  assert.deepEqual(f.calls, ['toast', 'viewer:1', 'modal', 'context:c_touch']);
  clock = 3000; assert.equal(f.fire('click', f.row).defaultPrevented, true);
  f.fire('pointerup', f.row); clock = 3200; assert.equal(f.fire('click', f.row).defaultPrevented, true);
  clock = 3500; assert.equal(f.fire('click', f.row).defaultPrevented, false);
  f.fire('pointerdown', f.row); [...f.timers.values()][0](); f.fire('pointercancel', f.row);
  clock = 4000; assert.equal(f.fire('click', f.row).defaultPrevented, false);
});
test('older touch-event engines use the same swipe behavior without double pointer listeners', async t => {
  const { installGestures } = await load('gestures.js'), f = environment(); delete f.win.PointerEvent; t.after(installGestures(f.options));
  const touches = x => [{ identifier: 3, clientX: x, clientY: 200 }];
  f.fire('touchstart', f.text, { changedTouches: touches(140), touches: touches(140) }); f.fire('touchmove', f.text, { changedTouches: touches(230), touches: touches(230) }); f.fire('touchend', f.text, { changedTouches: touches(230), touches: [] });
  assert.deepEqual(f.calls, ['reply:m_touch']);
});
test('send retains the current editor focus while native controls and unrelated actions remain available', async t => {
  const { installComposerInteractions } = await load('composer-interactions.js'), f = environment(), form = element(['#composer']), editor = element(['#message-input'], form), send = element(['#composer button[type="submit"]'], form);
  f.doc.activeElement = editor; f.doc.querySelector = query => query === '#message-input' ? editor : null; t.after(installComposerInteractions({ document: f.doc }));
  assert.equal(f.fire('pointerdown', send, { button: 0 }).defaultPrevented, true); assert.equal(f.doc.activeElement, editor);
  assert.equal(f.fire('mousedown', send, { button: 0 }).defaultPrevented, true);
  assert.equal(f.fire('pointerdown', f.row, { button: 0 }).defaultPrevented, false);
  send.disabled = true; assert.equal(f.fire('pointerdown', send, { button: 0 }).defaultPrevented, false);
  send.disabled = false; f.doc.activeElement = f.row; assert.equal(f.fire('pointerdown', send, { button: 0 }).defaultPrevented, false);
});
test('attachment menu, preview and reply actions retain focus only while the member is editing', async t => {
  const { installComposerInteractions } = await load('composer-interactions.js'), f = environment(), form = element(['#composer']), editor = element(['#message-input'], form), menu = element(['#popover-root .attachment-menu']);
  const actions = ['attach','remove-attachment','toggle-attachment-spoiler','cancel-reply'].map(action => element([`#composer [data-action="${action}"]`], form));
  const choice = element(['#popover-root .attachment-menu button'], menu); actions.push(choice);
  f.doc.activeElement = editor; f.doc.querySelector = query => query === '#message-input' ? editor : null; t.after(installComposerInteractions({ document: f.doc }));
  for(const button of actions){assert.equal(f.fire('pointerdown',button,{button:0}).defaultPrevented,true);assert.equal(f.doc.activeElement,editor);}
  f.doc.activeElement = f.row; assert.equal(f.fire('pointerdown',choice,{button:0}).defaultPrevented,false);
});
test('GIF and emoji buttons preserve the active composer or picker search without blocking search focus and scrolling',async t=>{
 const {installComposerInteractions}=await load('composer-interactions.js'),f=environment(),form=element(['#composer']),editor=element(['#message-input'],form);
 t.after(installComposerInteractions({document:f.doc}));f.doc.activeElement=editor;
 for(const action of ['gif','emoji'])assert.equal(f.fire('pointerdown',element([`#composer [data-action="${action}"]`],form),{button:0}).defaultPrevented,true);
 for(const type of ['emoji','gif']){
  const picker=element([`#popover-root .${type}-picker`]),search=element([`#${type}-search`],picker),button=element([`#popover-root .${type}-picker button`],picker);
  assert.equal(f.fire('pointerdown',button,{button:0,pointerType:'touch'}).defaultPrevented,true);
  assert.equal(f.fire('pointerdown',search,{button:0,pointerType:'touch'}).defaultPrevented,false);
  f.doc.activeElement=search;assert.equal(f.fire('pointerdown',button,{button:0,pointerType:'touch'}).defaultPrevented,true);
  assert.equal(f.fire('pointerdown',picker,{button:0,pointerType:'touch'}).defaultPrevented,false);
  assert.equal(f.fire('pointerdown',button,{button:2}).defaultPrevented,false);f.doc.activeElement=editor;
 }
});
test('the real configured GIF opener keeps a touch editor focused and only focuses search deliberately',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=source.indexOf('function showGifPicker('),end=source.indexOf('async function loadGifResults(',start);let searches=0,loads=0,markup='';
 const editor={},doc={activeElement:null},search={focus(options){assert.equal(options.preventScroll,true);searches++;doc.activeElement=search;}};doc.activeElement=editor;
 const context=vm.createContext({state:{config:{giphyApiKey:'disposable-web-key'}},navigator:{maxTouchPoints:1},gifCatalog:[],gifPage:{},$:()=>search,popover:html=>{markup=html;},loadGifResults:()=>loads++});vm.runInContext(source.slice(start,end),context);
 context.showGifPicker({});assert.equal(searches,0);assert.equal(doc.activeElement,editor);assert.equal(loads,1);assert.ok(markup.includes('Search GIPHY'));assert.ok(!markup.includes('autofocus'));
 context.showGifPicker({},{keyboard:true});assert.equal(searches,1);assert.equal(doc.activeElement,search);
 context.navigator.maxTouchPoints=0;context.showGifPicker({});assert.equal(searches,2);
});
test('a delayed real attachment upload cannot steal focus or reopen the keyboard after the member moves elsewhere', async () => {
  // Exercise the private app handler itself without starting network/media UI.
  const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=source.indexOf('async function queueAttachments('),end=source.indexOf('\nfunction showGifPicker(',start);
  assert.ok(start>=0&&end>start);let finish,focusCalls=0,progress;const uploaded=new Promise(resolve=>{finish=resolve;});
  const editor={disabled:false,focus(){focusCalls++;doc.activeElement=editor;}},elsewhere={},doc={activeElement:editor};
  const state={activeConv:'dm_upload',pending:[],config:{maxAttachments:4,maxUploadBytes:1024}},input={name:'owned-fixture.txt',type:'text/plain',size:3};
  const run=vm.runInNewContext('('+source.slice(start,end)+')',{state,UI:{currentServer:()=>null,activeConversation:()=>({type:'dm'}),canWrite:()=>true},isCollection:()=>false,$:()=>editor,document:doc,URL:{createObjectURL:()=> 'blob:owned-fixture',revokeObjectURL(){}},AbortController,renderPending(){},uploadFile:(file,options)=>{progress=options.onProgress;return uploaded;},request:async()=>{},toast(){}});
  const sending=run([input]);assert.equal(state.pending.length,1);doc.activeElement=elsewhere;progress({progress:50});finish({id:'f_uploaded',name:input.name,size:3});await sending;
  assert.equal(state.pending[0].uploading,false);assert.equal(state.pending[0].id,'f_uploaded');assert.equal(doc.activeElement,elsewhere);assert.equal(focusCalls,0);
});
test('gallery never requests capture; switching from camera to files clears capture and resets multiple selection', async () => {
  const { attachmentMenuMarkup, chooseAttachment } = await load('composer-interactions.js'), attrs = new Map(), choices = [], input = { setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key), click() { choices.push({ accept: this.accept, multiple: this.multiple, capture: attrs.get('capture') }); } };
  chooseAttachment(input, 'photo'); chooseAttachment(input, 'gallery'); chooseAttachment(input, 'video'); chooseAttachment(input, 'files');
  assert.deepEqual(choices, [{ accept: 'image/*', multiple: false, capture: 'environment' }, { accept: 'image/*,video/*', multiple: true, capture: undefined }, { accept: 'video/*', multiple: false, capture: 'environment' }, { accept: '', multiple: true, capture: undefined }]);
  assert.equal(chooseAttachment(input, 'invalid'), false); assert.equal(choices.length, 4);
  assert.match(attachmentMenuMarkup({ camera: true }), /Take a photo/); assert.match(attachmentMenuMarkup(), /Gallery/); assert.doesNotMatch(attachmentMenuMarkup(), /Take a photo/);
});
test('the first-load cover waits for font/layout readiness, dismisses once and is not remounted by a later call', async () => {
  const { finishStartup } = await load('startup.js'), frames = [], timers = new Map(), classes = new Set(); let release, removed = false, next = 0, starting = true;
  const cover = { dataset: {}, setAttribute() {}, classList: { add: value => classes.add(value) }, remove: () => { removed = true; } }, doc = { querySelector: () => removed ? null : cover, fonts: { ready: new Promise(resolve => { release = resolve; }) }, documentElement: { removeAttribute: () => { starting = false; } } };
  const win = { setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => frames.push(fn) };
  const done = finishStartup({ document: doc, window: win }); await finishStartup({ document: doc, window: win }); assert.equal(starting, true); assert.equal(frames.length, 0);
  release(); await tick(); frames.shift()(); await tick(); assert.equal(starting, true); frames.shift()(); await done;
  assert.equal(starting, false); assert.ok(classes.has('is-ready')); [...timers.values()][0](); assert.equal(removed, true); await finishStartup({ document: doc, window: win }); assert.equal(frames.length, 0);
});
test('a slow or failed avatar decode cannot leave startup permanently covered', async () => {
  const { finishStartup, STARTUP_CONFIG } = await load('startup.js'), frames = [], timers = new Map(); let removed = false, visible = false;
  const image = { decode: () => new Promise(() => {}) }, cover = { dataset: {}, setAttribute() {}, classList: { add() {} }, remove: () => { removed = true; } };
  const doc = { querySelector: () => cover, querySelectorAll: () => [image], fonts: { ready: Promise.resolve() }, documentElement: { removeAttribute: () => { visible = true; } } };
  let id = 0; const win = { setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; }, clearTimeout: key => timers.delete(key), requestAnimationFrame: fn => frames.push(fn) };
  const done = finishStartup({ document: doc, window: win }); await tick();
  assert.equal(image.loading, 'eager'); assert.equal(visible, false); [...timers.values()].find(timer => timer.ms === STARTUP_CONFIG.imageWaitMs).fn();
  await tick(); frames.shift()(); await tick(); frames.shift()(); await done; assert.equal(visible, true);
  [...timers.values()].find(timer => timer.ms === STARTUP_CONFIG.fadeMs).fn(); assert.equal(removed, true);
});
