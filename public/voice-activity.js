// Local-only input analysis; no audio samples or speaking events leave the browser.
export const ACTIVITY_CONFIG = Object.freeze({ intervalMs: 100, fftSize: 512, threshold: 0.018, releaseMs: 280, levelScale: 5 });
export function inputLevel(samples) {
  if (!samples.length) return 0;
  let sum = 0; for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
export class VoiceActivity {
  constructor({ onChange, contextFactory = () => new (window.AudioContext || window.webkitAudioContext)(), now = () => performance.now() }) {
    Object.assign(this, { onChange, contextFactory, now }); this.entries = new Map(); this.context = null; this.timer = null;
  }
  watch(key, stream, muted = false) {
    const tracks = stream?.getAudioTracks().filter(track => track.readyState === 'live') || [];
    const signature = tracks.map(track => track.id).join(','); let entry = this.entries.get(key);
    if (!signature) { this.remove(key); return; }
    if (!entry || entry.signature !== signature) {
      this.remove(key);
      try {
        this.context ||= this.contextFactory();
        const source = this.context.createMediaStreamSource(stream), analyser = this.context.createAnalyser(), silent = this.context.createGain();
        analyser.fftSize = ACTIVITY_CONFIG.fftSize; silent.gain.value = 0;
        source.connect(analyser); analyser.connect(silent); silent.connect(this.context.destination);
        entry = { signature, source, analyser, silent, samples: new Float32Array(analyser.fftSize), stream, muted, speaking: false, lastActive: -Infinity, level: 0 };
        this.entries.set(key, entry); this.timer ||= setInterval(() => this.sample(), ACTIVITY_CONFIG.intervalMs); this.resume();
      } catch { return; }
    }
    entry.muted = muted;
    this.onChange(key, entry.speaking && !muted, muted ? 0 : entry.level);
    if (muted && entry.speaking) { entry.speaking = false; entry.level = 0; this.onChange(key, false, 0); }
  }
  sample() {
    for (const [key, entry] of this.entries) {
      let rms = 0;
      if (!entry.muted && this.context?.state === 'running' && entry.stream.getAudioTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted)) {
        entry.analyser.getFloatTimeDomainData(entry.samples); rms = inputLevel(entry.samples);
      }
      const now = this.now(); if (rms >= ACTIVITY_CONFIG.threshold) entry.lastActive = now;
      const speaking = !entry.muted && now - entry.lastActive < ACTIVITY_CONFIG.releaseMs, level = Math.min(1, rms * ACTIVITY_CONFIG.levelScale);
      if (speaking !== entry.speaking || Math.abs(level - entry.level) >= .1) { entry.speaking = speaking; entry.level = level; this.onChange(key, speaking, level); }
    }
  }
  resume() { if (this.context?.state === 'suspended') this.context.resume().catch(() => {}); }
  remove(key) {
    const entry = this.entries.get(key); if (!entry) return;
    entry.source.disconnect(); entry.analyser.disconnect(); entry.silent.disconnect(); this.entries.delete(key); this.onChange(key, false, 0);
    if (!this.entries.size) { clearInterval(this.timer); this.timer = null; }
  }
  retain(keys) { for (const key of this.entries.keys()) if (!keys.has(key)) this.remove(key); }
  stop() { this.retain(new Set()); this.context?.close().catch(() => {}); this.context = null; }
}
