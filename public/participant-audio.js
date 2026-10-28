// Listener-owned settings: account + remote user, stored only on this device.
export const PARTICIPANT_AUDIO_CONFIG = Object.freeze({
  storagePrefix: 'nexus.participant-audio.', minimum: 0, maximum: 200, defaultVolume: 100,
  step: 1, rampSeconds: 0.025, saveDelayMs: 150, maxProfiles: 2000, menuWidth: 290,
});
const defaultContextFactory = () => {
  const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
  return Constructor ? new Constructor() : null;
};
export function normalizedVolume(value) {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(Math.max(PARTICIPANT_AUDIO_CONFIG.minimum, Math.min(PARTICIPANT_AUDIO_CONFIG.maximum, number))) : PARTICIPANT_AUDIO_CONFIG.defaultVolume;
}
export class ParticipantAudio {
  constructor({ storage, contextFactory = defaultContextFactory, onReady = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { storage, contextFactory, onReady, onError });
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
    if (this.context?.state === 'closed') this.context = null;
    if (this.context) return this.context;
    const context = this.contextFactory();
    if (!context) return null;
    this.context = context;
    context.addEventListener?.('statechange', () => { if (this.context === context) this.onReady(); });
    return context;
  }
  async unlock() {
    // Call from the join button or volume interaction, before any network await.
    try { this.ensureContext(); return await this.resume(); } catch { return false; }
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
  report(key) {
    if (this.reported.has(key)) return;
    this.reported.add(key); this.onError('Individual volume could not be applied. Enable call audio or reset this person to 100%.');
  }
  apply(key, userId, stream, audio, silenced = false) {
    const setting = this.get(userId), tracks = stream?.getAudioTracks().filter(track => track.readyState === 'live') || [];
    const signature = tracks.map(track => track.id).join(',');
    let entry = this.entries.get(key);
    if (entry && (entry.signature !== signature || entry.stream !== stream || entry.userId !== userId || entry.audio !== audio)) { this.remove(key); entry = null; }
    if (!entry && signature && setting.volume !== PARTICIPANT_AUDIO_CONFIG.defaultVolume) {
      let source, gain, destination;
      try {
        const context = this.ensureContext();
        if (context) {
          source = context.createMediaStreamSource(stream); gain = context.createGain(); destination = context.createMediaStreamDestination();
          gain.gain.value = setting.muted || silenced ? 0 : setting.volume / 100;
          source.connect(gain); gain.connect(destination);
          // Never connect to context.destination: HTML audio retains the selected speaker and mute gates.
          entry = { source, gain, destination, signature, stream, userId, audio, level: gain.gain.value };
          this.entries.set(key, entry);
        }
      } catch {
        for (const node of [source, gain, destination]) try { node?.disconnect(); } catch { /* Release a partially constructed graph. */ }
        destination?.stream.getTracks().forEach(track => track.stop()); this.report(key);
      }
    }
    // Do not attach an empty stream before ontrack. Some engines keep that
    // player waiting until another participant causes a media refresh.
    let desired = signature ? stream : null, blocked = false;
    if (entry) {
      const level = silenced || setting.muted ? 0 : setting.volume / 100;
      if (entry.level !== level) {
        const now = this.context.currentTime;
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setTargetAtTime(level, now, PARTICIPANT_AUDIO_CONFIG.rampSeconds);
        entry.level = level;
      }
      entry.silenced = silenced;
      desired = entry.destination.stream; audio.volume = 1; blocked = this.context.state !== 'running';
    } else {
      const level = Math.min(1, setting.volume / 100);
      audio.volume = level;
      if (signature && (Math.abs(audio.volume - level) > .01 || setting.volume > 100)) { blocked = true; this.report(key); }
    }
    // Muting/deafening/blocking/routing also silence the processed stream immediately.
    audio.muted = silenced || !signature || setting.muted || setting.volume === 0 || blocked;
    if (audio.srcObject !== desired) {
      audio.srcObject = desired; audio.dataset.attempted = 'false'; audio.dataset.blocked = 'false';
    }
    if(blocked&&!silenced&&!setting.muted&&setting.volume>0)this.blockedPeers.add(key);else this.blockedPeers.delete(key);
    return !blocked;
  }
  get blocked() { return this.blockedPeers.size > 0; }
  remove(key) {
    this.blockedPeers.delete(key);this.reported.delete(key);
    const entry = this.entries.get(key); if (!entry) return;
    for (const node of [entry.source, entry.gain, entry.destination]) try { node.disconnect(); } catch { /* Already disconnected. */ }
    entry.destination.stream.getTracks().forEach(track => track.stop()); this.entries.delete(key);
  }
  retain(keys) { for (const key of new Set([...this.entries.keys(),...this.blockedPeers])) if (!keys.has(key)) this.remove(key); }
  stop() {
    this.flush(); this.retain(new Set()); const context = this.context; this.context = null; this.resuming = null; this.reported.clear(); this.blockedPeers.clear();
    context?.close().catch(() => {});
  }
}
