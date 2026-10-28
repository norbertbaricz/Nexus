'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const URL = 'data:text/javascript;base64,' + readFileSync(path.join(__dirname, '../public/media-devices.js')).toString('base64');
const moduleUnderTest = () => import(URL);
const storage = () => { const values = new Map(); return { values, getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

test('hardware and quality preferences reject invalid data and never accept arbitrary fields', async () => {
  const { normalizeMediaPreferences, MEDIA_DEFAULTS, videoConstraints, videoEncoding } = await moduleUnderTest();
  const prefs = normalizeMediaPreferences({ microphoneId: 'm'.repeat(600), cameraId: 'usb', speakerId: 'default', cameraFps: 1000, screenResolution: '__proto__', screenBitrate: 1000, noiseSuppression: 'false', secret: 'x' });
  assert.deepEqual(prefs, { ...MEDIA_DEFAULTS, cameraId: 'usb' });
  assert.deepEqual(videoConstraints('camera', prefs).deviceId, { exact: 'usb' });
  for (const constraint of Object.values(videoConstraints('screen', { screenResolution: '2160', screenFps: 60 }))) { assert.equal(Object.hasOwn(constraint, 'min'), false); assert.equal(Object.hasOwn(constraint, 'exact'), false); }
  assert.equal(videoEncoding('screen', { screenResolution: '2160', screenFps: 60 }).maxBitrate, 40000000);
});
test('device selections are local to an account and successful changes persist only after application', async () => {
  const { MediaPreferences, MEDIA_CONFIG } = await moduleUnderTest(); const local = storage(); let finish;
  const manager = new MediaPreferences({ storage: local, outputSupported: true, onApply: () => new Promise(resolve => { finish = resolve; }) });
  manager.attach('alice'); const applying = manager.update({ microphoneId: 'desk-mic' });
  assert.equal(manager.preferences.microphoneId, ''); assert.equal(local.getItem(MEDIA_CONFIG.storagePrefix + 'alice'), undefined);
  finish(); await applying; assert.equal(manager.preferences.microphoneId, 'desk-mic');
  manager.attach('bob'); assert.equal(manager.preferences.microphoneId, '');
  manager.attach('alice'); assert.equal(manager.preferences.microphoneId, 'desk-mic');
});
test('a rejected switch leaves the saved selection unchanged and reports a useful permission error', async () => {
  const { MediaPreferences } = await moduleUnderTest(); const local = storage();
  const manager = new MediaPreferences({ storage: local, onApply: async () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; } }); manager.attach('alice');
  await assert.rejects(manager.update({ microphoneId: 'denied' }), /Allow access/);
  assert.equal(manager.preferences.microphoneId, ''); assert.equal(local.values.size, 0); assert.equal(manager.busy, false); assert.match(manager.error, /denied/);
});
test('opening an input selector requests access once and releases temporary tracks; passive enumeration never captures', async () => {
  const { MediaPreferences } = await moduleUnderTest(); let captures = 0, stops = 0, enumerations = 0, finish;
  const manager = new MediaPreferences({ mediaDevices: { async enumerateDevices() { enumerations++; return [{ kind: 'audioinput', deviceId: 'mic', label: 'Desk microphone' }]; }, getUserMedia(constraints) { captures++; assert.equal(constraints.audio.echoCancellation,true); assert.equal(constraints.video,false);return new Promise(resolve=>{finish=resolve;}); } } });
  await manager.refresh();assert.equal(captures,0);
  await manager.prepare('microphone');assert.equal(captures,0); // Named devices already have access.
  manager.devices=[];const first=manager.prepare('microphone'),second=manager.prepare('microphone');assert.equal(captures,1);
  finish({getTracks:()=>[{stop(){stops++;}}]});await Promise.all([first,second]);assert.equal(stops,1);assert.equal(enumerations,3);
});
test('denied automatic access reports the browser decision without retrying or saving a selection', async () => {
  const { MediaPreferences } = await moduleUnderTest();let requests=0;const local=storage();
  const manager=new MediaPreferences({storage:local,mediaDevices:{async getUserMedia(){requests++;const error=new Error();error.name='NotAllowedError';throw error;}}});manager.attach('alice');
  await assert.rejects(manager.prepare('camera'),/denied/);assert.equal(requests,1);assert.equal(local.values.size,0);assert.match(manager.error,/browser/);assert.equal(manager.preparations.size,0);
});
test('a late selector permission result closes its camera and cannot update a different account', async () => {
  const { MediaPreferences }=await moduleUnderTest();let finish,stops=0,enumerations=0;
  const manager=new MediaPreferences({mediaDevices:{getUserMedia(constraints){assert.equal(constraints.audio,false);assert.ok(constraints.video.width);return new Promise(resolve=>{finish=resolve;});},async enumerateDevices(){enumerations++;return [];}}});manager.attach('alice');
  const pending=manager.prepare('camera');manager.attach('bob');finish({getTracks:()=>[{stop(){stops++;}}]});await pending;assert.equal(stops,1);assert.equal(enumerations,0);assert.deepEqual(manager.devices,[]);
});
test('speaker permission is requested inside the original user action and stores the returned device ID', async () => {
  const { MediaPreferences } = await moduleUnderTest(); const order = []; let finish;
  const manager = new MediaPreferences({ storage: storage(), outputSupported: true, mediaDevices: { selectAudioOutput(options) { order.push(options.deviceId); return new Promise(resolve => { finish = resolve; }); } }, onApply: async next => order.push(next.speakerId) }); manager.attach('alice');
  const selection = manager.chooseSpeaker('old-output'); assert.deepEqual(order, ['old-output']); finish({ deviceId: 'new-permission-id' }); await selection;
  assert.equal(manager.preferences.speakerId, 'new-permission-id'); assert.deepEqual(order, ['old-output', 'new-permission-id']);
});
test('reauthorizing the same speaker reapplies routing rather than keeping a previously failed route', async () => {
  const { MediaPreferences } = await moduleUnderTest(); let applications = 0;
  const manager = new MediaPreferences({ outputSupported: true, mediaDevices: { async selectAudioOutput() { return { deviceId: 'headset' }; } }, onApply: async () => applications++ }); manager.attach('alice');
  await manager.chooseSpeaker('headset'); await manager.chooseSpeaker('headset'); assert.equal(applications, 2);
});
test('an account change while a permission operation is pending cannot persist into the next account', async () => {
  const { MediaPreferences } = await moduleUnderTest(); const local = storage(); let finish;
  const manager = new MediaPreferences({ storage: local, onApply: () => new Promise(resolve => { finish = resolve; }) }); manager.attach('alice');
  const applying = manager.update({ microphoneId: 'a' }); manager.attach('bob'); finish(); await applying;
  assert.equal(manager.preferences.microphoneId, ''); assert.equal(local.values.size, 0); assert.equal(manager.busy, false);
});
function outputElement(sinkId = '') { return { sinkId, muted: false, async setSinkId(value) { this.sinkId = value; } }; }
test('call audio uses the chosen output for current and future peers without replacing elements', async () => {
  const { CallAudioOutput } = await moduleUnderTest(); const first = outputElement(), second = outputElement(), elements = [first, second];
  const output = new CallAudioOutput({ getElements: () => elements, createElement: outputElement });
  await output.setDevice('headset'); assert.equal(first.sinkId, 'headset'); assert.equal(second.sinkId, 'headset'); assert.equal(output.route(first), true);
  const arriving = outputElement(); elements.push(arriving); assert.equal(output.route(arriving), false); assert.equal(arriving.muted, true);
  await Promise.resolve(); await Promise.resolve(); assert.equal(output.route(arriving), true); assert.equal(arriving.sinkId, 'headset');
});
test('an output failure rolls back previously routed peers to their working output', async () => {
  const { CallAudioOutput } = await moduleUnderTest(); const first = outputElement('headset'), second = outputElement('headset');
  second.setSinkId = async function(value) { if (value === 'broken') throw new Error('Output unavailable'); this.sinkId = value; };
  const output = new CallAudioOutput({ getElements: () => [first, second], createElement: outputElement }); output.restore('headset');
  await assert.rejects(output.setDevice('broken'), /unavailable/); assert.equal(first.sinkId, 'headset'); assert.equal(second.sinkId, 'headset'); assert.equal(output.deviceId, 'headset');
});
test('a revoked saved output keeps new peer audio silent and can be reauthorized', async () => {
  const { CallAudioOutput } = await moduleUnderTest(); const errors = [], element = outputElement(); let denied = true;
  element.setSinkId = async function(value) { if (denied) throw new Error('Output permission required'); this.sinkId = value; };
  const output = new CallAudioOutput({ getElements: () => [element], createElement: outputElement, onError: message => errors.push(message) });
  output.restore('private-headset'); assert.equal(output.route(element), false); await new Promise(resolve => setImmediate(resolve));
  assert.equal(element.muted, true); assert.equal(output.route(element), false); assert.equal(errors.length, 1);
  denied = false; await output.setDevice('private-headset'); assert.equal(output.route(element), true); assert.equal(element.sinkId, 'private-headset');
});
test('browsers without output routing expose a system default and reject unsupported custom outputs', async () => {
  const { MediaPreferences, CallAudioOutput, MEDIA_CONFIG } = await moduleUnderTest(); const local = storage(); local.setItem(MEDIA_CONFIG.storagePrefix + 'alice', '{"speakerId":"old-headset"}');
  const manager = new MediaPreferences({ storage: local, outputSupported: false }); manager.attach('alice'); assert.equal(manager.preferences.speakerId, '');
  await assert.rejects(manager.chooseSpeaker('other'), /system audio output/);
  const element = { muted: false }, output = new CallAudioOutput({ getElements: () => [element], createElement: () => ({}) }); assert.equal(output.route(element), true); await assert.rejects(output.setDevice('other'), /system audio output/);
});

test('switching accounts during output validation cannot overwrite the new account output', async () => {
  const { CallAudioOutput } = await moduleUnderTest(); let resolve;
  const output = new CallAudioOutput({ getElements: () => [], createElement: () => ({ setSinkId: () => new Promise(done => { resolve = done; }) }) });
  const pending = output.setDevice('alice-headset'); output.restore('bob-speakers'); resolve(); await pending;
  assert.equal(output.deviceId, 'bob-speakers'); assert.equal(output.busy, false);
});

test('a speaker permission picker opened for an old account cannot change a newly signed-in account', async () => {
  const { MediaPreferences } = await moduleUnderTest(); let resolve, applications = 0;
  const manager = new MediaPreferences({ outputSupported: true, mediaDevices: { selectAudioOutput: () => new Promise(done => { resolve = done; }) }, onApply: async () => applications++ });
  manager.attach('alice'); const pending = manager.chooseSpeaker('headset'); manager.attach('bob'); resolve({ deviceId: 'alice-headset' }); await pending;
  assert.equal(manager.preferences.speakerId, ''); assert.equal(applications, 0);
});
