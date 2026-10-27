// Original Nexus sound cues, synthesized locally. No downloaded recordings.
export const SOUND_CONFIG = Object.freeze({
  defaultVolume: 45,
  maxVolume: 100,
  peakGain: 0.085,
  attackSeconds: 0.035,
  fadeSeconds: 0.12,
  startDelaySeconds: 0.015,
  minimumIntervalMs: 350,
  feedbackIntervalMs: 70, // Deliberate control taps receive a prompt confirmation.
  ringIntervalMs: 1800,
  maxActiveNotes: 24,
});

// Each note is [frequency in Hz, delay in seconds, duration in seconds].
const CUES = Object.freeze({
  message: [[392, 0, .28], [523.25, .12, .34]],
  mention: [[440, 0, .25], [554.37, .14, .28], [659.25, .29, .35]],
  sent: [[329.63, 0, .20]],
  join: [[293.66, 0, .25], [392, .15, .30]],
  leave: [[392, 0, .23], [293.66, .16, .31]],
  mute: [[220, 0, .20]],
  unmute: [[329.63, 0, .22]],
  deafen: [[261.63, 0, .18], [196, .09, .22]],
  undeafen: [[196, 0, .18], [261.63, .09, .22]],
  incoming: [[349.23, 0, .28], [440, .20, .30], [523.25, .42, .40]],
});

export class NexusSounds {
  constructor({ getSettings, isQuiet = () => false, isFeedbackQuiet = isQuiet, createContext, now = () => Date.now(),
    schedule = (fn, ms) => setInterval(fn, ms), cancel = id => clearInterval(id) }) {
    Object.assign(this, { getSettings, isQuiet, isFeedbackQuiet, now, schedule, cancel });
    this.createContext = createContext || (() => {
      const Context = window.AudioContext || window.webkitAudioContext;
      return Context ? new Context() : null;
    });
    this.context = null;
    this.notes = new Map();
    this.lastPlayed = new Map();
    this.feedbackNotes = new Set(); this.feedbackGeneration = 0;
    this.ringTimer = null;
    this.ringing = false;
  }
  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') this.context = this.createContext();
      if (this.context?.state === 'suspended') await this.context.resume();
      return this.context?.state === 'running';
    } catch { return false; }
  }
  async feedback(name) {
    const generation=++this.feedbackGeneration;
    if(!this.getSettings().sounds||this.isFeedbackQuiet())return false;
    if(!await this.unlock()||generation!==this.feedbackGeneration)return false;
    return this.play(name,{feedback:true});
  }
  play(name, { preview = false, feedback = false } = {}) {
    const settings = this.getSettings();
    const rawVolume = Number(settings.soundVolume);
    const volume = Math.min(SOUND_CONFIG.maxVolume, Math.max(0, Number.isFinite(rawVolume) ? rawVolume : SOUND_CONFIG.defaultVolume));
    if (!settings.sounds || !volume || (feedback ? this.isFeedbackQuiet() : this.isQuiet()) || this.context?.state !== 'running' || !CUES[name]) return false;
    const time = this.now();
    if (time - (this.lastPlayed.get(name) ?? -Infinity) < (feedback ? SOUND_CONFIG.feedbackIntervalMs : SOUND_CONFIG.minimumIntervalMs)) return false;
    this.lastPlayed.set(name, time);
    if(feedback){for(const note of this.feedbackNotes){try{note.stop();}catch{/* A completed note is already silent. */}this.notes.delete(note);}this.feedbackNotes.clear();}
    for (const [frequency, delay, duration] of CUES[name]) {
      if (this.notes.size >= SOUND_CONFIG.maxActiveNotes) break;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = this.context.currentTime + SOUND_CONFIG.startDelaySeconds + delay;
      const end = start + duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(SOUND_CONFIG.peakGain * volume / SOUND_CONFIG.maxVolume, start + SOUND_CONFIG.attackSeconds);
      gain.gain.setValueAtTime(SOUND_CONFIG.peakGain * volume / SOUND_CONFIG.maxVolume, Math.max(start + SOUND_CONFIG.attackSeconds, end - SOUND_CONFIG.fadeSeconds));
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain); gain.connect(this.context.destination);
      this.notes.set(oscillator, name);
      if(feedback)this.feedbackNotes.add(oscillator);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.notes.delete(oscillator); this.feedbackNotes.delete(oscillator); };
      oscillator.start(start); oscillator.stop(end);
    }
    return true;
  }
  startRing() {
    if (this.ringing) return;
    this.ringing = true;
    this.play('incoming');
    this.ringTimer = this.schedule(() => this.play('incoming'), SOUND_CONFIG.ringIntervalMs);
  }
  stopRing() {
    if (this.ringTimer !== null) this.cancel(this.ringTimer);
    this.ringTimer = null; this.ringing = false;
    for (const [oscillator, name] of this.notes) if (name === 'incoming') {
      try { oscillator.stop(); } catch { /* The note may already have ended. */ }
    }
  }
  stopAll() {
    ++this.feedbackGeneration;this.feedbackNotes.clear();
    this.stopRing();
    for (const oscillator of this.notes.keys()) {
      try { oscillator.stop(); } catch { /* Safe when a note has already stopped. */ }
    }
  }
}
