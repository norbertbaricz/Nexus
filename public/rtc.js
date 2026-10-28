import { MEDIA_CONFIG, normalizeMediaPreferences, microphoneConstraints, videoConstraints, videoEncoding } from './media-devices.js';

// Easy-to-tune recovery limits. Per-device capture and quality live in media-devices.js.
export const RTC_CONFIG = Object.freeze({
  ackTimeoutMs: 10000, connectionTimeoutMs: 25000, restartDelayMs: 4000, maxRestarts: 2,
  maxPendingSignals: 80,
});
const stopStream = stream => stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });

export class NexusCall {
  constructor({ getSocket, getConfig, onChange, onIncoming, onError, mediaDevices = globalThis.navigator?.mediaDevices,
    peerFactory = config => new RTCPeerConnection(config), streamFactory = () => new MediaStream(), getMediaAllowed = () => true, getCanSpeak = () => true, getPeerAllowed = () => true, onAudioState = () => {}, getMediaSettings = () => ({}) }) {
    Object.assign(this, { getSocket, getConfig, onChange, onIncoming, onError, mediaDevices, peerFactory, streamFactory, getMediaAllowed, getCanSpeak, getPeerAllowed, onAudioState, getMediaSettings });
    this.active = null; this.peers = new Map(); this.pendingSignals = []; this.generation = 0;
    this.localStream = null; this.cameraStream = null; this.screenStream = null;
    this.preferredMuted = false; this.muted = false; this.deafened = false; this.video = false; this.sharing = false; this.joining = false;
    this.connectionIssue = ''; this.cameraPending = false; this.screenPending = false; this.devicePending = false; this.resumeAfterReconnect = null; this.stageListener = false;
  }
  bind(socket) {
    socket.on('rtc:signal', signal => this.signal(signal).catch(error => this.onError(error.message)));
    socket.on('voice:peer-blocked', ({socketIds}) => {
      for (const socketId of socketIds) { this.disposePeer(this.peers.get(socketId)); this.peers.delete(socketId); }
      this.pendingSignals=this.pendingSignals.filter(signal=>!socketIds.includes(signal.from));
      if (![...this.peers.values()].some(peer=>peer.reportedIssue)) this.connectionIssue='';
      this.onChange();
    });
    socket.on('voice:peer-available', ({conversationId,peer}) => {
      if(this.active?.conversationId===conversationId && this.getPeerAllowed(peer.userId)) this.createPeer(peer.socketId,true).catch(error=>this.onError(error.message));
    });
    socket.on('voice:left', ({ socketId }) => {
      const peer = this.peers.get(socketId); this.disposePeer(peer); this.peers.delete(socketId);
      if (![...this.peers.values()].some(item => item.reportedIssue)) this.connectionIssue = '';
      this.onChange();
    });
    socket.on('voice:removed', ({ conversationId, reason }) => {
      if (this.active?.conversationId === conversationId) { this.leave(false); this.onError(reason || 'Your channel access changed.'); }
    });
    socket.on('call:incoming', this.onIncoming);
    socket.on('call:declined', ({ conversationId }) => {
      if (this.active?.conversationId === conversationId) { this.leave(); this.onError('The call was declined.'); }
    });
    socket.on('disconnect', () => {
      if (this.active || this.joining) {
        const resume = this.active ? { conversationId: this.active.conversationId, video: this.video } : null;
        this.leave(false); this.resumeAfterReconnect = resume;
        this.onError('Connection interrupted. Your call will reconnect when the network returns.');
      }
    });
  }
  async emit(event, payload = {}) {
    const socket = this.getSocket();
    if (!socket?.connected) throw new Error('Connect to Nexus before joining a call.');
    return new Promise((resolve, reject) => socket.timeout(RTC_CONFIG.ackTimeoutMs).emit(event, payload, (error, response) => {
      if (error) reject(new Error('The server did not respond. Please try again.'));
      else if (!response?.ok) { const failure=new Error(response?.error || 'The call could not connect.');failure.moderation=response?.moderation;reject(failure); }
      else resolve(response);
    }));
  }
  async join(conversationId, { video = false, invite = false } = {}) {
    if (this.joining || this.active?.conversationId === conversationId) return;
    if (video && !this.getMediaAllowed(conversationId)) throw new Error('Camera and screen sharing are disabled in this channel.');
    const canSpeak = this.getCanSpeak(conversationId);
    if ((canSpeak || video) && !this.mediaDevices?.getUserMedia) throw new Error('Calls need HTTPS or localhost, microphone access and a supported browser.');
    if (this.active) this.leave();
    const generation = ++this.generation;
    this.joining = true; this.onChange();
    try {
      const stream = canSpeak || video ? await this.mediaDevices.getUserMedia({ audio: canSpeak ? microphoneConstraints(this.getMediaSettings()) : false, video: video ? this.cameraConstraints() : false }) : this.streamFactory();
      if (generation !== this.generation) { stopStream(stream); return; }
      this.localStream = stream; this.video = video; this.stageListener = !canSpeak; this.connectionIssue = '';
      this.watchInputTracks();
      this.applyAudioState(); // Disable captured audio before any peer can receive it.
      const result = await this.emit('voice:join', { conversationId, muted: this.muted, deafened: this.deafened });
      if (generation !== this.generation) return;
      this.stageListener = !canSpeak || result.canSpeak === false || Boolean(result.stageListener);
      this.applyAudioState();
      this.active = { conversationId, startedAt: Date.now() }; this.onChange();
      const pending = this.pendingSignals.splice(0);
      for (const signal of pending) await this.signal(signal);
      for (const peer of result.peers) await this.createPeer(peer.socketId, true);
      await this.update();
      if (invite) await this.emit('call:invite', { conversationId, video });
    } catch (error) {
      if (generation !== this.generation) return;
      this.leave();
      if (error.name === 'NotAllowedError') throw new Error('Microphone or camera access was denied. Allow it in your browser and try again.');
      if (error.name === 'NotFoundError') throw new Error('No microphone or camera was found. Connect a device and try again.');
      if (error.name === 'NotReadableError') throw new Error('Another app is using this device. Close it and try again.');
      throw error;
    } finally { if (generation === this.generation) { this.joining = false; this.onChange(); } }
  }
  cameraConstraints() { return videoConstraints('camera', this.getMediaSettings()); }
  watchInputTracks() {
    for (const track of [...(this.localStream?.getAudioTracks() || []), ...(this.currentCameraTrack() ? [this.currentCameraTrack()] : [])]) {
      track.onended = () => { if (this.active) { this.onError(`${track.kind === 'audio' ? 'Microphone' : 'Camera'} disconnected. Choose a connected device from the call controls.`); this.onChange(); } };
    }
  }
  currentCameraTrack() { return this.cameraStream?.getVideoTracks().find(track => track.readyState === 'live') || this.localStream?.getVideoTracks().find(track => track.readyState === 'live') || null; }
  currentScreenTrack() { return this.screenStream?.getVideoTracks().find(track => track.readyState === 'live') || null; }
  currentVideoTrack() { return this.currentScreenTrack() || this.currentCameraTrack(); }
  enqueue(peer, action) { const task = peer.operations.catch(() => {}).then(action); peer.operations = task; return task; }
  async createPeer(socketId, offer = false) {
    if (this.peers.has(socketId)) return this.peers.get(socketId);
    const config = this.getConfig();
    const pc = this.peerFactory({ iceServers: config.iceServers || [], iceTransportPolicy: config.iceTransportPolicy || 'all', bundlePolicy: 'max-bundle' });
    const peer = { pc, socketId, stream: this.streamFactory(), cameraStream: this.streamFactory(), screenStream: this.streamFactory(),
      candidates: [], operations: Promise.resolve(), makingOffer: false, ignoreOffer: false,
      polite: String(this.getSocket()?.id).localeCompare(socketId) > 0,
      reportedIssue: false, localCandidates: 0, restarts: 0, timer: null, restartTimer: null, remoteMids: null, negotiated: false };
    this.peers.set(socketId, peer);
    // Pre-negotiate separate slots so camera and screen can run at the same time.
    peer.audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    peer.cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    peer.screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    peer.videoSender = peer.cameraTransceiver.sender;
    // Explicit stream associations and MID metadata keep two video sources distinct.
    for (const [transceiver, stream] of [[peer.audioTransceiver, this.localStream], [peer.cameraTransceiver, this.cameraStream || this.localStream], [peer.screenTransceiver, this.screenStream]]) {
      if (stream && transceiver.sender.setStreams) transceiver.sender.setStreams(stream);
    }
    peer.ready = Promise.all([
      peer.audioTransceiver.sender.replaceTrack(this.localStream?.getAudioTracks()[0] || null),
      peer.cameraTransceiver.sender.replaceTrack(this.currentCameraTrack()),
      peer.screenTransceiver.sender.replaceTrack(this.currentScreenTrack()),
    ]);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) { peer.localCandidates++; this.emit('rtc:signal', { to: socketId, type: 'candidate', data: candidate.toJSON() }).catch(() => {}); }
    };
    pc.ontrack = ({ track, transceiver }) => {
      const screen = peer.remoteMids?.screen != null ? transceiver?.mid === peer.remoteMids.screen : transceiver === peer.screenTransceiver || transceiver?.mid != null && transceiver.mid === peer.screenTransceiver.mid || transceiver === pc.getTransceivers().filter(item => item.mid != null && item.receiver?.track?.kind === 'video')[1];
      const stream = track.kind === 'audio' ? peer.stream : screen ? peer.screenStream : peer.cameraStream;
      if (!stream.getTracks().some(item => item.id === track.id)) stream.addTrack(track);
      track.onunmute = () => this.onChange(); track.onmute = () => this.onChange(); track.onended = () => this.onChange(); this.onChange();
    };
    pc.onnegotiationneeded = () => {
      if (peer.negotiated && pc.signalingState === 'stable' && !peer.makingOffer) this.enqueue(peer, () => this.makeOffer(peer)).catch(error => this.report(peer,error.message));
    };
    pc.onicecandidateerror = event => console.warn('[Nexus media] ICE gathering issue', { code: event.errorCode, candidates: peer.localCandidates });
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(peer.timer); clearTimeout(peer.restartTimer); peer.reportedIssue = false;
        if (![...this.peers.values()].some(item => item.reportedIssue)) this.connectionIssue = '';
      } else if (['failed', 'disconnected'].includes(pc.connectionState) && !peer.restartTimer) {
        peer.restartTimer = setTimeout(() => {
          peer.restartTimer = null;
          if (!['connected', 'closed'].includes(pc.connectionState)) this.restartPeer(peer).catch(error => this.report(peer, error.message));
        }, config.rtcRestartDelayMs || RTC_CONFIG.restartDelayMs);
      }
      this.onChange();
    };
    peer.timer = setTimeout(() => {
      if (pc.connectionState !== 'connected') this.report(peer, config.hasTurn
        ? 'The media connection could not be established. Rejoin and check the relay connection.'
        : 'No direct media connection was found. This deployment needs a working TURN relay for this network.');
    }, config.rtcConnectionTimeoutMs || RTC_CONFIG.connectionTimeoutMs);
    await peer.ready; await this.configureSenders(peer);
    if (offer) await this.enqueue(peer, () => this.makeOffer(peer));
    return peer;
  }
  report(peer, message) {
    if (peer.reportedIssue || !this.active || peer.pc.connectionState === 'closed') return;
    console.error('[Nexus media]', { connection: peer.pc.connectionState, signaling: peer.pc.signalingState, candidates: peer.localCandidates, restarts: peer.restarts, message });
    peer.reportedIssue = true; this.connectionIssue = message; this.onError(message); this.onChange();
  }
  async configureSenders(peer, preferences = this.getMediaSettings()) {
    for (const [sender, encoding] of [[peer.audioTransceiver.sender, { maxBitrate: MEDIA_CONFIG.audioBitrate }], [peer.cameraTransceiver.sender, videoEncoding('camera', preferences)], [peer.screenTransceiver.sender, videoEncoding('screen', preferences)]]) {
      if (!sender.getParameters || !sender.setParameters) continue;
      try { const parameters = sender.getParameters(); if (parameters.encodings?.length) { for (const item of parameters.encodings) Object.assign(item, encoding); await sender.setParameters(parameters); } }
      catch (error) { console.warn('[Nexus media] Browser could not apply an encoding preference.', { name: error.name }); }
    }
  }
  async makeOffer(peer, restart = false) {
    if (!this.active || peer.pc.connectionState === 'closed') return;
    try {
      peer.makingOffer = true;
      await peer.pc.setLocalDescription(await peer.pc.createOffer(restart ? { iceRestart: true } : {}));
      await this.emit('rtc:signal', { to: peer.socketId, type: 'offer', data: peer.pc.localDescription.toJSON(), media: this.mediaMids(peer) });
    } finally { peer.makingOffer = false; }
  }
  async signal(signal) {
    if(signal.userId && !this.getPeerAllowed(signal.userId))return;
    if (!this.active) {
      if (this.joining && this.pendingSignals.length < RTC_CONFIG.maxPendingSignals) this.pendingSignals.push(signal);
      return;
    }
    if (signal.conversationId && signal.conversationId !== this.active.conversationId) return;
    const { from, type, data } = signal;
    const peer = await this.createPeer(from); await peer.ready;
    return this.enqueue(peer, async () => {
      const pc = peer.pc;
      if (pc.connectionState === 'closed') return;
      if (type === 'candidate') {
        if (peer.ignoreOffer) return;
        if (pc.remoteDescription) await pc.addIceCandidate(data); else peer.candidates.push(data);
        return;
      }
      const collision = type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && collision;
      if (peer.ignoreOffer) return;
      if (collision && pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
      if (signal.media) peer.remoteMids = signal.media;
      await pc.setRemoteDescription(data);
      if (type === 'offer') await this.adoptOfferedSlots(peer);
      for (const candidate of peer.candidates.splice(0)) await pc.addIceCandidate(candidate);
      if (type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        await this.emit('rtc:signal', { to: from, type: 'answer', data: pc.localDescription.toJSON(), media: this.mediaMids(peer) });
      }
      peer.negotiated = true; await this.configureSenders(peer);
    });
  }
  async adoptOfferedSlots(peer) {
    // addTransceiver-created slots on an answerer are not reused by a remote offer.
    // Bind senders to the actual offered m-lines before creating the answer.
    const offered = peer.pc.getTransceivers().filter(item => item.mid != null && !item.stopped);
    const kind = item => item.receiver?.track?.kind || item.sender.track?.kind;
    const video = offered.filter(item => kind(item) === 'video');
    const resolve = (name, fallback) => offered.find(item => item.mid === peer.remoteMids?.[name]) || fallback;
    const audio = resolve('audio', offered.find(item => kind(item) === 'audio'));
    const camera = resolve('camera', video[0]), screen = resolve('screen', video[1]);
    if (!audio || !camera || !screen || camera === screen) throw new Error('The remote call did not offer separate audio, camera and screen slots. Rejoin with an updated client.');
    const selected = new Set([audio, camera, screen]);
    for (const transceiver of peer.pc.getTransceivers()) {
      if (selected.has(transceiver) || transceiver.stopped) continue;
      await transceiver.sender.replaceTrack(null);
      transceiver.stop();
    }
    peer.audioTransceiver = audio; peer.cameraTransceiver = camera; peer.screenTransceiver = screen; peer.videoSender = camera.sender;
    for (const [transceiver, track, stream] of [[audio, this.localStream?.getAudioTracks()[0] || null, this.localStream], [camera, this.currentCameraTrack(), this.cameraStream || this.localStream], [screen, this.currentScreenTrack(), this.screenStream]]) {
      transceiver.direction = 'sendrecv';
      if (stream && transceiver.sender.setStreams) transceiver.sender.setStreams(stream);
      await transceiver.sender.replaceTrack(track);
    }
  }
  async restartPeer(peer) {
    if (!this.active || peer.pc.connectionState === 'closed' || peer.pc.connectionState === 'connected') return;
    const max = this.getConfig().rtcMaxRestarts ?? RTC_CONFIG.maxRestarts;
    if (peer.restarts >= max) { this.report(peer, 'The media connection was lost. Rejoin the call and check the TURN relay.'); return; }
    peer.restarts++; await this.enqueue(peer, () => this.makeOffer(peer, true));
  }
  async retryConnections() { await Promise.all([...this.peers.values()].map(peer => this.restartPeer(peer))); }
  async update() {
    if (!this.active) return;
    await this.emit('voice:update', { muted: this.muted, deafened: this.deafened, camera: this.video, sharing: this.sharing }); this.onChange();
  }
  mediaMids(peer) { return { audio: peer.audioTransceiver.mid, camera: peer.cameraTransceiver.mid, screen: peer.screenTransceiver.mid }; }
  async reconnect() { const resume = this.resumeAfterReconnect; this.resumeAfterReconnect = null; if (resume && this.getSocket()?.connected) await this.join(resume.conversationId, { video: resume.video }); }
  applyAudioState() { this.muted = this.preferredMuted || this.deafened || this.stageListener; this.syncAudio(); }
  setAudioState({ muted = false, deafened = false } = {}) {
    this.preferredMuted = Boolean(muted); this.deafened = Boolean(deafened); this.applyAudioState();
    this.onAudioState({ muted: this.preferredMuted, deafened: this.deafened }); this.onChange();
    this.update().catch(error => this.onError(error.message));
  }
  toggleMute() {
    if (this.stageListener) { this.onError('You are listening to this stage. Only hosts can speak.'); return; }
    this.setAudioState({ muted: this.deafened ? false : !this.preferredMuted, deafened: false });
  }
  toggleDeafen() { this.setAudioState({ muted: this.preferredMuted, deafened: !this.deafened }); }
  syncAudio() { this.localStream?.getAudioTracks().forEach(track => { track.enabled = !this.muted && !this.deafened; }); }
  async applyMediaPreferences(value, previousValue = this.getMediaSettings()) {
    const next = normalizeMediaPreferences(value), previous = normalizeMediaPreferences(previousValue);
    if (this.joining || this.cameraPending || this.screenPending || this.devicePending) throw new Error('Wait for the current capture request to finish.');
    if (!this.active) return;
    const generation = this.generation, oldMicrophone = this.localStream?.getAudioTracks()[0], oldCamera = this.currentCameraTrack(), screen = this.currentScreenTrack();
    const microphoneChanged = oldMicrophone?.readyState === 'ended' || ['microphoneId', 'echoCancellation', 'noiseSuppression', 'autoGainControl'].some(key => next[key] !== previous[key]);
    const cameraChanged = next.cameraId !== previous.cameraId || this.video && !oldCamera;
    const qualityChanged = kind => ['Resolution', 'Fps'].some(key => next[kind + key] !== previous[kind + key]);
    let microphoneStream, cameraStream; const replacements = [], constrained = [];
    this.devicePending = true; this.onChange();
    const stillActive = () => generation === this.generation && Boolean(this.active);
    try {
      if (microphoneChanged && !this.stageListener && this.getCanSpeak(this.active.conversationId)) {
        microphoneStream = await this.mediaDevices.getUserMedia({ audio: microphoneConstraints(next), video: false });
        if (!stillActive()) return;
        const track = microphoneStream.getAudioTracks()[0];
        if (!track) throw new Error('The selected microphone did not provide an audio track.');
        track.enabled = !this.muted && !this.deafened;
      }
      if (cameraChanged && this.video && this.getMediaAllowed(this.active.conversationId, 'camera')) {
        cameraStream = await this.mediaDevices.getUserMedia({ video: videoConstraints('camera', next), audio: false });
        if (!stillActive()) return;
        const track = cameraStream.getVideoTracks()[0];
        if (!track) throw new Error('The selected camera did not provide a video track.');
      }
      for (const [kind, track] of [['camera', cameraChanged ? null : oldCamera], ['screen', screen]]) {
        if (track && qualityChanged(kind)) {
          const rollback = track.getConstraints?.() || videoConstraints(kind, previous, false);
          constrained.push({ track, rollback });
          await track.applyConstraints(videoConstraints(kind, next, false));
          if (!stillActive()) return;
        }
      }
      for (const peer of this.peers.values()) {
        if (microphoneStream) replacements.push({ sender: peer.audioTransceiver.sender, next: microphoneStream.getAudioTracks()[0], previous: oldMicrophone || null });
        if (cameraStream) replacements.push({ sender: peer.cameraTransceiver.sender, next: cameraStream.getVideoTracks()[0], previous: oldCamera });
      }
      // Wait for every sender before releasing the old hardware; partial failures roll back.
      const results = await Promise.allSettled(replacements.map(item => item.sender.replaceTrack(item.next)));
      if (!stillActive()) return;
      const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
      if (cameraStream) for (const peer of this.peers.values()) peer.cameraTransceiver.sender.setStreams?.(cameraStream);
      if (microphoneStream) {
        if (oldMicrophone) { oldMicrophone.onended = null; this.localStream.removeTrack(oldMicrophone); oldMicrophone.stop(); }
        this.localStream.addTrack(microphoneStream.getAudioTracks()[0]); microphoneStream = null;
      }
      if (cameraStream) {
        stopStream(this.cameraStream);
        for (const track of this.localStream.getVideoTracks()) { track.onended = null; this.localStream.removeTrack(track); track.stop(); }
        this.cameraStream = cameraStream; cameraStream = null;
      }
      if (screen) screen.contentHint = next.screenFps > 30 ? 'motion' : 'detail';
      this.watchInputTracks(); this.onChange();
      await Promise.all([...this.peers.values()].map(peer => this.configureSenders(peer, next)));
    } catch (error) {
      if (stillActive()) {
        await Promise.allSettled(replacements.map(item => item.sender.replaceTrack(item.previous)));
        await Promise.allSettled(constrained.map(({ track, rollback }) => track.applyConstraints(rollback)));
      }
      throw error;
    } finally {
      stopStream(microphoneStream); stopStream(cameraStream);
      if (generation === this.generation) { this.devicePending = false; this.onChange(); }
    }
  }
  async replaceVideo() {
    await Promise.all([...this.peers.values()].flatMap(peer => [peer.cameraTransceiver.sender.replaceTrack(this.currentCameraTrack()), peer.screenTransceiver.sender.replaceTrack(this.currentScreenTrack())]));
    for (const peer of this.peers.values()) {
      if (peer.cameraTransceiver.sender.setStreams && this.cameraStream) peer.cameraTransceiver.sender.setStreams(this.cameraStream);
      if (peer.screenTransceiver.sender.setStreams && this.screenStream) peer.screenTransceiver.sender.setStreams(this.screenStream);
      await this.configureSenders(peer);
    }
    await this.update();
  }
  async toggleVideo() {
    if (!this.active || this.cameraPending || this.devicePending) return;
    if (!this.getMediaAllowed(this.active.conversationId,'camera')) throw new Error('Camera and screen sharing are disabled in this channel.');
    const generation = this.generation;
    this.cameraPending = true; this.onChange();
    try {
      if (this.video) {
        stopStream(this.cameraStream); this.cameraStream = null;
        this.localStream?.getVideoTracks().forEach(track => track.stop()); this.video = false;
      } else {
        const stream = await this.mediaDevices.getUserMedia({ video: this.cameraConstraints(), audio: false });
        if (generation !== this.generation) { stopStream(stream); return; }
        this.cameraStream = stream; this.video = true;
        this.watchInputTracks();
      }
      await this.replaceVideo();
    } catch (error) {
      stopStream(this.cameraStream); this.cameraStream = null;
      this.localStream?.getVideoTracks().forEach(track => track.stop()); this.video = false;
      await Promise.all([...this.peers.values()].map(peer => peer.cameraTransceiver.sender.replaceTrack(null).catch(() => {})));
      throw error;
    } finally { this.cameraPending = false; this.onChange(); }
  }
  async toggleScreen() {
    if (!this.active || this.screenPending || this.devicePending) return;
    if (!this.getMediaAllowed(this.active.conversationId,'screen')) throw new Error('Camera and screen sharing are disabled in this channel.');
    this.screenPending = true; this.onChange();
    const generation = this.generation;
    try {
      if (this.sharing) { await this.stopScreen(); return; }
      if (!this.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot share its screen. You can still watch other people’s shared screens.');
      const stream = await this.mediaDevices.getDisplayMedia({ video: videoConstraints('screen', this.getMediaSettings()), audio: false });
      if (generation !== this.generation) { stopStream(stream); return; }
      this.screenStream = stream; this.sharing = true;
      const track = stream.getVideoTracks()[0];
      if (track) { track.contentHint = normalizeMediaPreferences(this.getMediaSettings()).screenFps > 30 ? 'motion' : 'detail'; track.onended = () => this.stopScreen().catch(error => this.onError(error.message)); }
      await this.replaceVideo();
    } catch (error) {
      stopStream(this.screenStream); this.screenStream = null; this.sharing = false;
      await Promise.all([...this.peers.values()].map(peer => peer.screenTransceiver.sender.replaceTrack(null).catch(() => {})));
      throw error;
    } finally { this.screenPending = false; this.onChange(); }
  }
  async stopScreen() { stopStream(this.screenStream); this.screenStream = null; this.sharing = false; if (this.active) await this.replaceVideo(); }
  disposePeer(peer) {
    if (!peer) return; clearTimeout(peer.timer); clearTimeout(peer.restartTimer);
    peer.pc.onconnectionstatechange = null; peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.onnegotiationneeded = null; peer.pc.onicecandidateerror = null; peer.pc.close();
  }
  leave(notify = true) {
    ++this.generation;
    if (notify && this.getSocket()?.connected) this.emit('voice:leave').catch(() => {});
    for (const peer of this.peers.values()) this.disposePeer(peer);
    this.peers.clear(); this.pendingSignals = [];
    for (const stream of [this.localStream, this.cameraStream, this.screenStream]) stopStream(stream);
    this.active = null; this.localStream = null; this.cameraStream = null; this.screenStream = null;
    this.resumeAfterReconnect = null; this.stageListener = false;
    this.applyAudioState(); this.video = false; this.sharing = false; this.joining = false; this.connectionIssue = ''; this.cameraPending = false; this.screenPending = false; this.devicePending = false; this.onChange();
  }
}
