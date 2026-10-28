'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const MEDIA_URL = 'data:text/javascript;base64,' + readFileSync(path.join(__dirname, '../public/media-devices.js')).toString('base64');
const MODULE_URL = 'data:text/javascript;base64,' + Buffer.from(readFileSync(path.join(__dirname, '../public/rtc.js'), 'utf8').replace("'./media-devices.js'", JSON.stringify(MEDIA_URL))).toString('base64');
const TEST_CONNECTION_TIMEOUT_MS = 5000;
let nextTrack = 0;
class Stream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks=this.tracks.filter(item=>item!==track); }
}
const track = kind => ({ kind, id: `track-${++nextTrack}`, readyState: 'live', enabled: true, constraints: {}, async applyConstraints(value) { this.constraints = value; }, getConstraints() { return this.constraints; }, stop() { this.readyState = 'ended'; } });
class Peer {
  constructor() { this.signalingState = 'stable'; this.connectionState = 'new'; this.transceivers = []; this.addedCandidates = []; this.offers = []; this.rollbacks = 0; }
  addTransceiver(kind) {
    const transceiver = { mid: null, kind, receiver: {track: track(kind)}, direction: 'sendrecv', stopped: false, stop() { this.stopped=true; this.sender.track=null; }, sender: { track: null, async replaceTrack(value) { this.track = value; }, getParameters() { return { encodings: [{}] }; }, async setParameters(value) { this.parameters = value; } } };
    this.transceivers.push(transceiver); return transceiver;
  }
  async createOffer(options) { this.offers.push(options); this.transceivers.filter(item=>!item.stopped).forEach((transceiver,index)=>{if(transceiver.mid==null)transceiver.mid=String(index);}); return { type: 'offer', sdp: 'fixture offer' }; }
  async createAnswer() { this.transceivers.filter(item=>!item.stopped).forEach((transceiver,index)=>{if(transceiver.mid==null)transceiver.mid=String(index);}); return { type: 'answer', sdp: 'fixture answer' }; }
  async setLocalDescription(description) {
    if (description.type === 'rollback') { this.rollbacks++; this.signalingState = 'stable'; this.localDescription = null; this.transceivers.forEach(item=>{item.mid=null;}); return; }
    this.localDescription = { ...description, toJSON() { return description; } }; this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  getTransceivers() { return this.transceivers; }
  async setRemoteDescription(description) {
    this.remoteDescription=description;this.signalingState=description.type==='offer'?'have-remote-offer':'stable';
    // Match the native answerer rule: local addTransceiver slots are not reused.
    if(description.type==='offer')for(const [index,kind] of ['audio','video','video'].entries()){
      if(!this.transceivers.some(item=>!item.stopped&&item.mid===String(index))){const remote=this.addTransceiver(kind);remote.mid=String(index);}
    }
  }
  async addIceCandidate(candidate) { assert.ok(this.remoteDescription, 'ICE must wait for a remote description'); this.addedCandidates.push(candidate); }
  close() { this.connectionState = 'closed'; }
}
async function fixture(t, overrides = {}) {
  const { NexusCall } = await import(MODULE_URL);
  const events = [], errors = [], peers = [], handlers = {};
  const socket = { id: overrides.socketId || 'local', connected: true, on(event, callback) { handlers[event] = callback; },
    timeout() { return { emit(event, payload, callback) { events.push({ event, payload }); if (event === 'voice:join' && overrides.joinAck) overrides.joinAck(callback); else callback(null, { ok: true, peers: [] }); } }; } };
  const devices = { async getUserMedia(constraints) { return new Stream([...(constraints.audio ? [track('audio')] : []), ...(constraints.video ? [track('video')] : [])]); }, async getDisplayMedia() { return new Stream([track('video')]); }, ...overrides.devices };
  const call = new NexusCall({ getSocket: () => socket, getConfig: () => ({ iceServers: [], rtcConnectionTimeoutMs: TEST_CONNECTION_TIMEOUT_MS, rtcMaxRestarts: 1 }),
    getMediaSettings: () => overrides.preferences || {}, mediaDevices: devices, peerFactory: () => { const peer = new Peer(); peers.push(peer); return peer; }, streamFactory: () => new Stream(),
    onChange() {}, onIncoming() {}, onError: message => errors.push(message), getCanSpeak: () => overrides.canSpeak !== false, getMediaAllowed: () => overrides.mediaAllowed !== false });
  call.bind(socket); t.after(() => call.leave(false));
  return { call, socket, devices, events, errors, peers, handlers };
}
test('camera and screen sharing use independent senders and stop without ending the microphone', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true });
  const peer = await f.call.createPeer('remote', true), camera = f.call.currentCameraTrack(), microphone = f.call.localStream.getAudioTracks()[0];
  await f.call.toggleScreen(); const screen = f.call.currentScreenTrack();
  assert.equal(peer.cameraTransceiver.sender.track, camera); assert.equal(peer.screenTransceiver.sender.track, screen); assert.notEqual(camera, screen);
  await f.call.toggleVideo(); assert.equal(camera.readyState, 'ended'); assert.equal(peer.cameraTransceiver.sender.track, null);
  assert.equal(peer.screenTransceiver.sender.track, screen); assert.equal(screen.readyState, 'live');
  await f.call.stopScreen(); assert.equal(screen.readyState, 'ended'); assert.equal(peer.screenTransceiver.sender.track, null); assert.equal(microphone.readyState, 'live');
});
test('early ICE is queued and remote camera and screen tracks stay in separate streams', async t => {
  const f = await fixture(t); await f.call.join('room');
  await f.call.signal({ from: 'remote', type: 'candidate', data: { candidate: 'fixture candidate' } });
  const peer = f.call.peers.get('remote'); assert.equal(peer.candidates.length, 1);
  await f.call.signal({ from: 'remote', type: 'offer', data: { type: 'offer', sdp: 'fixture' } });
  assert.equal(peer.pc.addedCandidates.length, 1);
  const camera = track('video'), screen = track('video'), audio = track('audio');
  peer.pc.ontrack({ track: camera, transceiver: peer.cameraTransceiver }); peer.pc.ontrack({ track: screen, transceiver: peer.screenTransceiver }); peer.pc.ontrack({ track: audio, transceiver: peer.audioTransceiver });
  assert.deepEqual(peer.cameraStream.getTracks(), [camera]); assert.deepEqual(peer.screenStream.getTracks(), [screen]); assert.deepEqual(peer.stream.getTracks(), [audio]);
});
test('polite peers roll back a colliding offer while impolite peers ignore it', async t => {
  const polite = await fixture(t, { socketId: 'z' }); await polite.call.join('room');
  const p = await polite.call.createPeer('a', true); await polite.call.signal({ from: 'a', type: 'offer', data: { type: 'offer', sdp: 'collision' } });
  assert.equal(p.pc.rollbacks, 1); assert.equal(p.pc.signalingState, 'stable');
  const impolite = await fixture(t, { socketId: 'a' }); await impolite.call.join('room');
  const q = await impolite.call.createPeer('z', true); await impolite.call.signal({ from: 'z', type: 'offer', data: { type: 'offer', sdp: 'collision' } });
  assert.equal(q.ignoreOffer, true); assert.equal(q.pc.rollbacks, 0); assert.equal(q.pc.remoteDescription, undefined);
  await impolite.call.signal({ from: 'z', type: 'answer', data: { type: 'answer', sdp: 'accepted' } });
  assert.equal(q.pc.signalingState, 'stable');
});
test('leaving while capture permission is pending stops late device streams', async t => {
  let resolveCapture;
  const f = await fixture(t, { devices: { getUserMedia: () => new Promise(resolve => { resolveCapture = resolve; }) } });
  const joining = f.call.join('room'); f.call.leave(false);
  const stream = new Stream([track('audio'), track('video')]); resolveCapture(stream); await joining;
  assert.ok(stream.getTracks().every(track => track.readyState === 'ended')); assert.equal(f.call.active, null);
  assert.equal(f.events.some(event => event.event === 'voice:join'), false);
});
test('offers arriving before the room acknowledgement are processed after joining', async t => {
  let finishJoin;
  const f = await fixture(t, { joinAck: callback => { finishJoin = callback; } });
  const joining = f.call.join('room'); await Promise.resolve(); await Promise.resolve();
  await f.call.signal({ conversationId: 'room', from: 'remote', type: 'offer', data: { type: 'offer', sdp: 'early' } });
  assert.equal(f.call.pendingSignals.length, 1); finishJoin(null, { ok: true, peers: [] }); await joining;
  assert.equal(f.call.pendingSignals.length, 0); assert.equal(f.call.peers.get('remote').pc.remoteDescription.sdp, 'early');
});
test('ICE recovery is bounded and permission changes stop captured tracks', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true });
  const peer = await f.call.createPeer('remote', true); await f.call.signal({ from: 'remote', type: 'answer', data: { type: 'answer', sdp: 'fixture' } });
  peer.pc.connectionState = 'failed'; await f.call.restartPeer(peer); assert.equal(peer.pc.offers.at(-1).iceRestart, true);
  await f.call.restartPeer(peer); assert.ok(f.call.connectionIssue); assert.equal(peer.restarts, 1);
  const tracks = f.call.localStream.getTracks(); f.handlers['voice:removed']({ conversationId: 'room', reason: 'Access revoked' });
  assert.equal(f.call.active, null); assert.ok(tracks.every(track => track.readyState === 'ended')); assert.equal(peer.pc.connectionState, 'closed');
});
test('channel media permissions are checked before device capture', async t => {
  const f = await fixture(t, { mediaAllowed: false });
  await assert.rejects(f.call.join('room', { video: true }), /disabled/);
  await f.call.join('room'); await assert.rejects(f.call.toggleVideo(), /disabled/); await assert.rejects(f.call.toggleScreen(), /disabled/);
  assert.equal(f.call.currentCameraTrack(), null); assert.equal(f.call.currentScreenTrack(), null);
});

test('rapid camera taps produce only one capture request', async t => {
  let resolveCamera, captures = 0;
  const f = await fixture(t, { devices: { getUserMedia: constraints => constraints.audio ? Promise.resolve(new Stream([track('audio')])) : (captures++, new Promise(resolve => { resolveCamera = resolve; })) } });
  await f.call.join('room'); const first = f.call.toggleVideo(); await f.call.toggleVideo();
  assert.equal(captures, 1); resolveCamera(new Stream([track('video')])); await first;
  assert.equal(f.call.video, true); assert.equal(f.call.cameraPending, false);
});
test('a rejected media update stops the captured device and clears its sender', async t => {
  const f = await fixture(t); await f.call.join('room'); const peer = await f.call.createPeer('remote',true);
  const previous = f.call.emit.bind(f.call);
  f.call.emit = async (event, payload) => { if (event === 'voice:update' && (payload.camera || payload.sharing)) throw new Error('Media permission denied'); return previous(event, payload); };
  await assert.rejects(f.call.toggleVideo(), /permission denied/);
  assert.equal(f.call.video, false); assert.equal(f.call.cameraStream, null); assert.equal(peer.cameraTransceiver.sender.track, null);
  await assert.rejects(f.call.toggleScreen(), /permission denied/);
  assert.equal(f.call.sharing, false); assert.equal(f.call.screenStream, null); assert.equal(peer.screenTransceiver.sender.track, null);
  assert.equal(f.call.localStream.getAudioTracks()[0].readyState, 'live');
});

test('a lost signaling connection stops devices and reconnects the previous call with fresh tracks',async t=>{
 const f=await fixture(t);await f.call.join('room',{video:true});const first=f.call.localStream;
 f.socket.connected=false;f.handlers.disconnect();assert.equal(f.call.active,null);assert.ok(first.getTracks().every(track=>track.readyState==='ended'));assert.equal(f.call.resumeAfterReconnect.conversationId,'room');
 f.socket.connected=true;await f.call.reconnect();assert.equal(f.call.active.conversationId,'room');assert.equal(f.call.video,true);assert.notEqual(f.call.localStream,first);assert.equal(f.events.filter(event=>event.event==='voice:join').length,2);
});
test('remote MID metadata maps screen tracks independently of locally created transceiver objects',async t=>{
 const f=await fixture(t);await f.call.join('room');await f.call.signal({from:'remote',type:'offer',data:{type:'offer',sdp:'fixture'},media:{audio:'0',camera:'camera-slot',screen:'screen-slot'}});
 const peer=f.call.peers.get('remote'),screen=track('video');peer.pc.ontrack({track:screen,transceiver:{mid:'screen-slot'}});assert.deepEqual(peer.screenStream.getVideoTracks(),[screen]);assert.deepEqual(peer.cameraStream.getVideoTracks(),[]);
});
test('stage listeners receive media without capturing a microphone and cannot unmute',async t=>{
 let captures=0;const f=await fixture(t,{canSpeak:false,devices:{async getUserMedia(){captures++;return new Stream([track('audio')]);}}});await f.call.join('stage');assert.equal(captures,0);assert.equal(f.call.muted,true);f.call.toggleMute();assert.equal(f.call.muted,true);assert.match(f.errors.at(-1),/hosts/);
});

test('blocking closes existing peer transports immediately, clears pending signals and keeps the room active',async t=>{
  const f=await fixture(t);await f.call.join('room');const peer=await f.call.createPeer('blocked-socket',true);
  f.call.pendingSignals.push({from:'blocked-socket',type:'offer'},{from:'other-socket',type:'offer'});
  f.handlers['voice:peer-blocked']({socketIds:['blocked-socket']});
  assert.equal(peer.pc.connectionState,'closed');assert.equal(f.call.peers.has('blocked-socket'),false);assert.equal(f.call.active.conversationId,'room');
  assert.deepEqual(f.call.pendingSignals.map(signal=>signal.from),['other-socket']);
  f.call.getPeerAllowed=()=>false;
  await f.call.signal({from:'blocked-again',userId:'blocked-account',conversationId:'room',type:'offer',data:{type:'offer',sdp:'fixture'}});
  assert.equal(f.call.peers.has('blocked-again'),false);
});

test('the answerer creates no speculative slots and sends only through the offered m-lines',async t=>{
 const f=await fixture(t);await f.call.join('room',{video:true});await f.call.toggleScreen();
 const pending=await f.call.createPeer('remote');assert.equal(pending.pc.getTransceivers().length,0);
 await f.call.signal({from:'remote',type:'offer',data:{type:'offer',sdp:'fixture'},media:{audio:'0',camera:'1',screen:'2'}});
 assert.equal(pending.pc.getTransceivers().length,3);assert.ok(pending.pc.getTransceivers().every(item=>!item.stopped));
 assert.equal(pending.audioTransceiver.sender.track,f.call.localStream.getAudioTracks()[0]);
 assert.equal(pending.cameraTransceiver.sender.track,f.call.currentCameraTrack());assert.equal(pending.screenTransceiver.sender.track,f.call.currentScreenTrack());
 assert.deepEqual(f.call.mediaMids(pending),{audio:'0',camera:'1',screen:'2'});
 await f.call.toggleVideo();assert.equal(pending.cameraTransceiver.sender.track,null);assert.ok(pending.screenTransceiver.sender.track);
});

test('pre-call mute disables the captured microphone before joining and persists between rooms',async t=>{
 const f=await fixture(t);f.call.toggleMute();assert.equal(f.call.muted,true);assert.equal(f.events.length,0);
 await f.call.join('room');assert.equal(f.call.localStream.getAudioTracks()[0].enabled,false);
 assert.deepEqual(f.events.find(event=>event.event==='voice:join').payload,{conversationId:'room',muted:true,deafened:false});
 f.call.leave();assert.equal(f.call.muted,true);await f.call.join('another');assert.equal(f.call.localStream.getAudioTracks()[0].enabled,false);
 f.call.toggleMute();assert.equal(f.call.localStream.getAudioTracks()[0].enabled,true);
});
test('pre-call deafen mutes immediately and undeafen restores the chosen microphone state',async t=>{
 const f=await fixture(t);f.call.toggleDeafen();assert.equal(f.call.muted,true);await f.call.join('room');
 assert.equal(f.call.deafened,true);assert.equal(f.call.localStream.getAudioTracks()[0].enabled,false);
 f.call.toggleDeafen();assert.equal(f.call.muted,false);assert.equal(f.call.localStream.getAudioTracks()[0].enabled,true);
 f.call.toggleMute();f.call.toggleDeafen();f.call.toggleDeafen();assert.equal(f.call.muted,true);
 f.call.toggleDeafen();f.call.toggleMute();assert.equal(f.call.deafened,false);assert.equal(f.call.muted,false);
});
test('stage listener restrictions do not overwrite manual audio choices and reconnect preserves deafen',async t=>{
 const f=await fixture(t,{canSpeak:false});await f.call.join('stage');assert.equal(f.call.muted,true);f.call.leave();assert.equal(f.call.muted,false);
 const g=await fixture(t);g.call.toggleDeafen();await g.call.join('room');g.handlers.disconnect();assert.equal(g.call.deafened,true);
 await g.call.reconnect();assert.equal(g.call.deafened,true);assert.equal(g.call.localStream.getAudioTracks()[0].enabled,false);
});
test('the room acknowledgement can restrict a stale local microphone permission before peers are created',async t=>{
 const f=await fixture(t,{joinAck:callback=>callback(null,{ok:true,peers:[],canSpeak:false})});
 await f.call.join('room');assert.equal(f.call.stageListener,true);assert.equal(f.call.muted,true);assert.equal(f.call.localStream.getAudioTracks()[0].enabled,false);
 assert.ok(f.events.filter(event=>event.event==='voice:update').every(event=>event.payload.muted===true));f.call.leave();assert.equal(f.call.muted,false);
});

test('saved device IDs and high quality constraints are used for every fresh capture', async t => {
  const requests = [], preferences = { microphoneId: 'desk-mic', cameraId: 'usb-camera', cameraResolution: '1440', cameraFps: 60, screenResolution: '2160', screenFps: 60 };
  const f = await fixture(t, { preferences, devices: {
    async getUserMedia(value) { requests.push(value); return new Stream([...(value.audio ? [track('audio')] : []), ...(value.video ? [track('video')] : [])]); },
    async getDisplayMedia(value) { requests.push(value); return new Stream([track('video')]); },
  } });
  await f.call.join('room', { video: true }); const peer = await f.call.createPeer('remote',true); await f.call.toggleScreen();
  assert.deepEqual(requests[0].audio.deviceId, { exact: 'desk-mic' }); assert.deepEqual(requests[0].video.deviceId, { exact: 'usb-camera' });
  assert.equal(requests[0].video.height.ideal, 1440); assert.equal(requests[0].video.frameRate.max, 60);
  assert.equal(requests[1].video.width.max, 3840); assert.equal(requests[1].video.frameRate.max, 60);
  assert.equal(Object.hasOwn(requests[1].video, 'deviceId'), false); assert.equal(f.call.currentScreenTrack().contentHint, 'motion');
  assert.equal(peer.audioTransceiver.sender.parameters.encodings[0].maxBitrate, 128000);
  assert.equal(peer.cameraTransceiver.sender.parameters.encodings[0].maxBitrate, 18000000);
  assert.equal(peer.screenTransceiver.sender.parameters.encodings[0].maxBitrate, 40000000);
});
test('switching a muted microphone replaces all senders before stopping the old track', async t => {
  const f = await fixture(t); f.call.toggleMute(); await f.call.join('room');
  const first = await f.call.createPeer('first',true), second = await f.call.createPeer('second',true), old = f.call.localStream.getAudioTracks()[0], stream = f.call.localStream;
  await f.call.applyMediaPreferences({ microphoneId: 'new-microphone' });
  const current = f.call.localStream.getAudioTracks()[0];
  assert.notEqual(current, old); assert.equal(current.enabled, false); assert.equal(old.readyState, 'ended');
  assert.equal(f.call.localStream, stream); assert.equal(first.audioTransceiver.sender.track, current); assert.equal(second.audioTransceiver.sender.track, current);
  assert.equal(f.events.filter(event => event.event === 'voice:join').length, 1);
});
test('a failed device capture leaves the current camera and microphone live', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true }); const peer = await f.call.createPeer('remote',true);
  const oldCamera = f.call.currentCameraTrack(), oldMicrophone = f.call.localStream.getAudioTracks()[0];
  f.devices.getUserMedia = async () => { const error = new Error('Not available'); error.name = 'NotFoundError'; throw error; };
  await assert.rejects(f.call.applyMediaPreferences({ cameraId: 'missing' }), /Not available/);
  assert.equal(f.call.currentCameraTrack(), oldCamera); assert.equal(oldCamera.readyState, 'live'); assert.equal(oldMicrophone.readyState, 'live');
  assert.equal(peer.cameraTransceiver.sender.track, oldCamera); assert.equal(f.call.video, true); assert.equal(f.call.devicePending, false);
});
test('a partial sender replacement rolls back every peer and releases the new microphone', async t => {
  const f = await fixture(t); await f.call.join('room'); const first = await f.call.createPeer('first',true), second = await f.call.createPeer('second',true);
  const old = f.call.localStream.getAudioTracks()[0], replacement = track('audio');
  f.devices.getUserMedia = async () => new Stream([replacement]);
  second.audioTransceiver.sender.replaceTrack = async function(value) { if (value === replacement) throw new Error('Sender rejected the replacement'); this.track = value; };
  await assert.rejects(f.call.applyMediaPreferences({ microphoneId: 'new-mic' }), /Sender rejected/);
  assert.equal(first.audioTransceiver.sender.track, old); assert.equal(second.audioTransceiver.sender.track, old);
  assert.equal(old.readyState, 'live'); assert.equal(replacement.readyState, 'ended'); assert.equal(f.call.localStream.getAudioTracks()[0], old);
});
test('a camera switch preserves screen sharing, microphone input and the room', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true }); await f.call.toggleScreen(); const peer = await f.call.createPeer('remote',true);
  const previous = f.call.currentCameraTrack(), screen = f.call.currentScreenTrack(), microphone = f.call.localStream.getAudioTracks()[0];
  await f.call.applyMediaPreferences({ cameraId: 'new-camera' });
  assert.equal(previous.readyState, 'ended'); assert.notEqual(peer.cameraTransceiver.sender.track, previous);
  assert.equal(peer.cameraTransceiver.sender.track, f.call.currentCameraTrack()); assert.equal(peer.screenTransceiver.sender.track, screen);
  assert.equal(screen.readyState, 'live'); assert.equal(microphone.readyState, 'live'); assert.equal(f.call.active.conversationId, 'room');
});
test('live quality changes constrain existing tracks and update all negotiated encoding budgets', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true }); await f.call.toggleScreen(); const peer = await f.call.createPeer('remote',true);
  const camera = f.call.currentCameraTrack(), screen = f.call.currentScreenTrack();
  await f.call.applyMediaPreferences({ cameraResolution: '720', cameraFps: 24, screenResolution: '1440', screenFps: 30, screenBitrate: 20 });
  assert.equal(f.call.currentCameraTrack(), camera); assert.equal(f.call.currentScreenTrack(), screen);
  assert.equal(camera.constraints.height.ideal, 720); assert.equal(camera.constraints.frameRate.max, 24);
  assert.equal(screen.constraints.width.max, 2560); assert.equal(screen.constraints.frameRate.max, 30); assert.equal(screen.contentHint, 'detail');
  assert.equal(peer.screenTransceiver.sender.parameters.encodings[0].maxBitrate, 20000000);
});
test('failed live quality changes restore constraints and retain both media tracks', async t => {
  const f = await fixture(t); await f.call.join('room', { video: true }); await f.call.toggleScreen();
  const camera = f.call.currentCameraTrack(), screen = f.call.currentScreenTrack(); camera.constraints = { width: { ideal: 1920 } };
  screen.applyConstraints = async value => { if (value.height?.ideal === 2160) throw new Error('Quality unavailable'); screen.constraints = value; };
  await assert.rejects(f.call.applyMediaPreferences({ cameraResolution: '720', screenResolution: '2160' }), /Quality unavailable/);
  assert.deepEqual(camera.constraints, { width: { ideal: 1920 } }); assert.equal(camera.readyState, 'live'); assert.equal(screen.readyState, 'live');
});
test('leaving during a device switch stops late tracks and never revives the call', async t => {
  const f = await fixture(t); await f.call.join('room'); let resolve;
  f.devices.getUserMedia = () => new Promise(done => { resolve = done; });
  const switching = f.call.applyMediaPreferences({ microphoneId: 'new' }); f.call.leave(false);
  const late = track('audio'); resolve(new Stream([late])); await switching;
  assert.equal(late.readyState, 'ended'); assert.equal(f.call.active, null); assert.equal(f.call.devicePending, false);
});
test('pre-call device changes and stage listeners never acquire unnecessary microphone tracks', async t => {
  let captures = 0; const f = await fixture(t, { canSpeak: false, devices: { async getUserMedia() { captures++; return new Stream([track('audio')]); } } });
  await f.call.applyMediaPreferences({ microphoneId: 'new' }); assert.equal(captures, 0);
  await f.call.join('stage'); await f.call.applyMediaPreferences({ microphoneId: 'another' }); assert.equal(captures, 0); assert.equal(f.call.muted, true);
});

test('an early candidate waits without speculative slots; the initiating join still creates one offer',async t=>{
 const f=await fixture(t);await f.call.join('room');
 await f.call.signal({from:'remote',type:'candidate',data:{candidate:'early'}});
 const peer=f.call.peers.get('remote');assert.equal(peer.pc.getTransceivers().length,0);
 await f.call.createPeer('remote',true);assert.equal(peer.pc.getTransceivers().length,3);assert.equal(peer.pc.offers.length,1);
 await f.call.createPeer('remote',true);assert.equal(peer.pc.offers.length,1);
});
test('colliding local slots become inactive without stopping unassociated m-lines',async t=>{
 const f=await fixture(t,{socketId:'z'});await f.call.join('room',{video:true});const peer=await f.call.createPeer('a',true),original=[...peer.pc.getTransceivers()];
 await f.call.signal({from:'a',type:'offer',data:{type:'offer',sdp:'collision'},media:{audio:'0',camera:'1',screen:'2'}});
 assert.ok(original.every(item=>item.direction==='inactive'&&!item.stopped&&item.sender.track===null));
 assert.equal(peer.audioTransceiver.sender.track,f.call.localStream.getAudioTracks()[0]);assert.equal(peer.cameraTransceiver.sender.track,f.call.currentCameraTrack());
});
test('a receiver replaces obsolete tracks in its stable stream instead of leaving silent first tracks',async t=>{
 const f=await fixture(t);await f.call.join('room');await f.call.signal({from:'remote',type:'offer',data:{type:'offer',sdp:'initial'}});const peer=f.call.peers.get('remote');
 const old=track('audio'),current=track('audio');peer.pc.ontrack({track:old,transceiver:peer.audioTransceiver});peer.pc.ontrack({track:current,transceiver:peer.audioTransceiver});
 assert.deepEqual(peer.stream.getAudioTracks(),[current]);assert.equal(old.readyState,'live');assert.equal(current.readyState,'live');
});
test('queued negotiation requests recheck stable state before making another offer',async t=>{
 const f=await fixture(t);await f.call.join('room');const peer=await f.call.createPeer('remote',true);await f.call.signal({from:'remote',type:'answer',data:{type:'answer',sdp:'initial'}});
 peer.pc.onnegotiationneeded();peer.pc.onnegotiationneeded();await peer.operations;
 assert.equal(peer.pc.offers.length,2);assert.equal(peer.pc.signalingState,'have-local-offer');
});

test('camera orientation refresh keeps microphone, camera and screen tracks and never recaptures',async t=>{
 const f=await fixture(t);await f.call.join('room',{video:true});await f.call.toggleScreen();const camera=f.call.currentCameraTrack(),microphone=f.call.localStream.getAudioTracks()[0],screen=f.call.currentScreenTrack();let captures=0;
 f.devices.getUserMedia=async()=>{captures++;throw new Error('Rotation must not recapture');};await f.call.refreshCameraOrientation();assert.equal(captures,0);assert.equal(f.call.currentCameraTrack(),camera);assert.equal(f.call.currentScreenTrack(),screen);assert.equal(microphone.readyState,'live');assert.equal(camera.constraints.width.max,camera.constraints.height.max);assert.equal(camera.constraints.resizeMode.ideal,'none');
 camera.applyConstraints=async()=>{throw Object.assign(new Error('Unsupported rotation constraint'),{name:'OverconstrainedError'});};await f.call.refreshCameraOrientation();assert.equal(camera.readyState,'live');assert.equal(f.call.video,true);
});
