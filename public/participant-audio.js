// Listener-owned settings: account + remote user, stored only on this device.
export const PARTICIPANT_AUDIO_CONFIG = Object.freeze({
  storagePrefix: 'nexus.participant-audio.', minimum: 0, maximum: 200, defaultVolume: 100,
  step: 1, rampSeconds: 0.025, nativeVolumeTolerance: 0.01, inputReadyState: 2,
  saveDelayMs: 150, maxProfiles: 2000, menuWidth: 290,
});
const defaultContextFactory = () => {
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Constructor ? new Constructor() : null;
};
const defaultElementFactory = () => globalThis.document?.createElement('audio');
export function normalizedVolume(value) {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(Math.max(PARTICIPANT_AUDIO_CONFIG.minimum, Math.min(PARTICIPANT_AUDIO_CONFIG.maximum, number))) : PARTICIPANT_AUDIO_CONFIG.defaultVolume;
}
export class ParticipantAudio {
  constructor({ storage, contextFactory = defaultContextFactory, createElement = defaultElementFactory, onReady = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { storage, contextFactory, createElement, onReady, onError });
    this.context = null; this.entries = new Map(); this.settings = new Map(); this.userId = null;
    this.saveTimer = null; this.dirty = false; this.resuming = null; this.reported = new Set(); this.blockedPeers = new Set();
    this.maximum = contextFactory !== defaultContextFactory || globalThis.AudioContext || globalThis.webkitAudioContext ? PARTICIPANT_AUDIO_CONFIG.maximum : 100;
  }
  attach(userId) {
    this.flush(); this.stop(); this.userId = userId; this.settings.clear();
    let stored; try { stored = JSON.parse(this.storage?.getItem(PARTICIPANT_AUDIO_CONFIG.storagePrefix + userId) || '{}'); } catch { stored = {}; }
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      for (const [id, value] of Object.entries(stored).slice(-PARTICIPANT_AUDIO_CONFIG.maxProfiles)) {
        if (!value || typeof value !== 'object') continue;
        this.settings.set(id, { volume: Math.min(this.maximum, normalizedVolume(value.volume)), muted: value.muted === true });
      }
    }
  }
  get(userId) { return { volume: PARTICIPANT_AUDIO_CONFIG.defaultVolume, muted: false, ...this.settings.get(userId) }; }
  save(userId, value) {
    if (!userId || typeof userId !== 'string') return;
    this.settings.delete(userId);
    if (value.volume !== PARTICIPANT_AUDIO_CONFIG.defaultVolume || value.muted) this.settings.set(userId, value);
    while (this.settings.size > PARTICIPANT_AUDIO_CONFIG.maxProfiles) this.settings.delete(this.settings.keys().next().value);
    this.dirty = true; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.flush(), PARTICIPANT_AUDIO_CONFIG.saveDelayMs);
  }
  setVolume(userId, value) { const current = this.get(userId); this.save(userId, { ...current, volume: Math.min(this.maximum, normalizedVolume(value)) }); }
  setMuted(userId, muted) { this.save(userId, { ...this.get(userId), muted: Boolean(muted) }); }
  reset(userId) { this.save(userId, { volume: PARTICIPANT_AUDIO_CONFIG.defaultVolume, muted: false }); }
  flush() {
    clearTimeout(this.saveTimer); this.saveTimer = null;
    if (!this.userId || !this.dirty) return;
    this.dirty = false;
    try { this.storage?.setItem(PARTICIPANT_AUDIO_CONFIG.storagePrefix + this.userId, JSON.stringify(Object.fromEntries(this.settings))); } catch { /* Live controls still work without persistent storage. */ }
  }
  ensureContext() {
    if (this.context?.state === 'closed') { this.context = null; this.resuming = null; }
    if (this.context) return this.context;
    const context = this.contextFactory();
    if (!context) return null;
    this.context = context;
    context.addEventListener?.('statechange', () => { if (this.context === context) this.onReady(); });
    return context;
  }
  async unlock() {
    // Called by the join/volume interaction, before any network await.
    let ready = false, context;
    try {
      context = this.ensureContext();
      for (const entry of this.entries.values()) { entry.outputBlocked = false; this.startInput(entry, true); }
      ready = await this.resume();
    } catch { /* A boost may fall back to native unity without muting the person. */ }
    if (context !== this.context) return false;
    if (!ready) for (const entry of this.entries.values()) this.reportInputFailure(entry);
    if (ready) this.onReady();
    return ready;
  }
  async resume() {
    const context = this.context;
    if (!context || context.state === 'closed') return false;
    if (context.state === 'running') return true;
    if (this.resuming) return this.resuming;
    const pending = (async () => {
      try { await context.resume(); return context.state === 'running'; }
      catch { return false; }
      finally { if (this.context === context) this.onReady(); }
    })();
    this.resuming = pending;
    try { return await pending; } finally { if (this.resuming === pending) this.resuming = null; }
  }
  report(key, boost = false) {
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.onError(boost ? 'Amplification is unavailable. Normal 100% playback is used instead.' : 'Individual volume could not be applied. Enable call audio or reset this person to 100%.');
  }
  reportInputFailure(entry) {
    const setting = this.get(entry.userId);
    if (!entry.silenced && !setting.muted && setting.volume > 0) this.report(entry.key, setting.volume > PARTICIPANT_AUDIO_CONFIG.defaultVolume);
  }
  outputFailed(key, audio, stream) {
    const entry = this.entries.get(key);
    if (!entry || entry.audio !== audio || entry.destination.stream !== stream) return false;
    entry.outputBlocked = true; this.reportInputFailure(entry); this.onReady();
    return true;
  }
  startInput(entry, retry = false) {
    if (this.entries.get(entry.key) !== entry || entry.pending || entry.ready && !entry.input.paused || entry.failed && !retry) return;
    entry.failed = false; entry.ready = false;
    const attempt = ++entry.attempt;
    const current = () => this.entries.get(entry.key) === entry && entry.attempt === attempt;
    try {
      const playing = entry.input.play();
      entry.ready = entry.input.readyState >= PARTICIPANT_AUDIO_CONFIG.inputReadyState && !entry.input.paused;
      entry.pending = Promise.resolve(playing).then(() => {
        if (!current()) return;
        entry.pending = null; entry.ready = !entry.input.paused; entry.failed = !entry.ready;
        if (entry.failed) this.reportInputFailure(entry);
        this.onReady();
      }, () => {
        if (!current()) return;
        entry.pending = null; entry.ready = false; entry.failed = true;
        this.reportInputFailure(entry); this.onReady();
      });
    } catch {
      entry.pending = null; entry.ready = false; entry.failed = true;
      this.reportInputFailure(entry);
    }
  }
  apply(key, userId, stream, audio, silenced = false) {
    const setting = this.get(userId), tracks = stream?.getAudioTracks().filter(track => track.readyState === 'live') || [];
    const signature = tracks.map(track => track.id).join(',');
    const boost = setting.volume > PARTICIPANT_AUDIO_CONFIG.defaultVolume;
    const nativeLevel = Math.min(1, setting.volume / PARTICIPANT_AUDIO_CONFIG.defaultVolume);
    let native = false;
    // Reductions keep the received stream; fixed-volume devices use a gain fallback.
    try {
      audio.volume = nativeLevel;
      native = !boost && Math.abs(audio.volume - nativeLevel) <= PARTICIPANT_AUDIO_CONFIG.nativeVolumeTolerance;
    } catch { /* Devices without writable volume use the processing fallback. */ }
    if (setting.volume === 0) native = true;
    let entry = this.entries.get(key);
    if (entry && (native || entry.signature !== signature || entry.stream !== stream || entry.userId !== userId || entry.audio !== audio || entry.context !== this.context || entry.context.state === 'closed')) { this.remove(key); entry = null; }
    if (!entry && signature && !native) {
      let source, gain, destination, input;
      try {
        const context = this.ensureContext();
        if (!context) throw new Error('Audio processing is unavailable.');
        input = this.createElement();
        if (!input?.play) throw new Error('Audio input playback is unavailable.');
        // Keep a native raw-stream player alive for WebRTC's receive/playout pump.
        // This private, detached input is always silent and never a speaker output.
        input.muted = true; input.defaultMuted = true; input.autoplay = true; input.playsInline = true;
        input.setAttribute('muted', ''); input.setAttribute('playsinline', '');
        try { input.volume = 0; } catch { /* The input's mute gate remains authoritative. */ }
        input.srcObject = stream;
        source = context.createMediaStreamSource(stream); gain = context.createGain(); destination = context.createMediaStreamDestination();
        gain.gain.value = setting.muted || silenced ? 0 : setting.volume / 100;
        source.connect(gain); gain.connect(destination);
        // Only the existing routed HTML output can play the processed stream.
        entry = { key, source, gain, destination, input, signature, stream, userId, audio, context, level: gain.gain.value, silenced, ready: false, failed: false, outputBlocked: false, pending: null, attempt: 0 };
        this.entries.set(key, entry);
        entry.interrupted = () => {
          if (this.entries.get(key) !== entry || !entry.ready) return;
          ++entry.attempt; entry.pending = null; entry.ready = false; entry.failed = true;
          this.reportInputFailure(entry); this.onReady();
        };
        input.addEventListener?.('pause', entry.interrupted); input.addEventListener?.('error', entry.interrupted);
        this.startInput(entry);
      } catch {
        for (const node of [source, gain, destination]) try { node?.disconnect(); } catch { /* Release a partial graph. */ }
        if (input) { input.pause?.(); input.srcObject = null; }
        destination?.stream.getTracks().forEach(track => track.stop());
        if (!silenced && !setting.muted) this.report(key, boost);
      }
    }
    // Empty connecting streams wait for ontrack without a false playback error.
    let desired = signature ? stream : null;
    let processing = false;
    if (entry) {
      entry.silenced = silenced;
      const level = silenced || setting.muted ? 0 : setting.volume / 100;
      if (entry.level !== level) {
        const now = entry.context.currentTime;
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setTargetAtTime(level, now, PARTICIPANT_AUDIO_CONFIG.rampSeconds);
        entry.level = level;
      }
      this.startInput(entry);
      processing = entry.context.state === 'running' && entry.ready && !entry.outputBlocked;
      if (processing) { desired = entry.destination.stream; entry.usedProcessing = true; this.reported.delete(key); }
      else if (entry.failed || entry.usedProcessing && entry.context.state !== 'running') this.reportInputFailure(entry);
    }
    // A pending/unavailable boost must preserve native 100% speech. Reductions on
    // fixed-volume devices stay gated until their exact lower level can be applied.
    const blocked = Boolean(signature && !native && !processing && !boost);
    if (processing || boost) try { audio.volume = 1; } catch { /* Fixed-volume devices already use unity. */ }
    audio.muted = silenced || !signature || setting.muted || setting.volume === 0 || blocked;
    if (audio.srcObject !== desired) {
      audio.srcObject = desired; audio.dataset.attempted = 'false'; audio.dataset.blocked = 'false';
    }
    if (native) this.reported.delete(key);
    if (blocked && !silenced && !setting.muted && setting.volume > 0) this.blockedPeers.add(key); else this.blockedPeers.delete(key);
    return !blocked;
  }
  get blocked() { return this.blockedPeers.size > 0; }
  remove(key) {
    this.blockedPeers.delete(key); this.reported.delete(key);
    const entry = this.entries.get(key); if (!entry) return;
    this.entries.delete(key); ++entry.attempt;
    entry.input.removeEventListener?.('pause', entry.interrupted); entry.input.removeEventListener?.('error', entry.interrupted);
    entry.input.pause(); entry.input.srcObject = null;
    for (const node of [entry.source, entry.gain, entry.destination]) try { node.disconnect(); } catch { /* Already disconnected. */ }
    entry.destination.stream.getTracks().forEach(track => track.stop());
  }
  retain(keys) { for (const key of new Set([...this.entries.keys(), ...this.blockedPeers, ...this.reported])) if (!keys.has(key)) this.remove(key); }
  stop() {
    this.flush(); this.retain(new Set()); const context = this.context; this.context = null; this.resuming = null; this.reported.clear(); this.blockedPeers.clear();
    context?.close().catch(() => {});
  }
}
