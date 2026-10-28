// Hardware identifiers belong to this browser and account, never to synced preferences.
export const MEDIA_CONFIG = Object.freeze({
  storagePrefix: 'nexus.media.', deviceIdMaxLength: 512, audioBitrate: 128000,
  resolutions: Object.freeze({ '480': [854, 480], '720': [1280, 720], '1080': [1920, 1080], '1440': [2560, 1440], '2160': [3840, 2160] }),
  frameRates: Object.freeze([15, 24, 30, 60]),
  bitrates: Object.freeze([0, 4, 8, 12, 20, 40]),
});
export const MEDIA_DEFAULTS = Object.freeze({
  microphoneId: '', speakerId: '', cameraId: '',
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  cameraResolution: '1080', cameraFps: 30, cameraBitrate: 0,
  screenResolution: '1080', screenFps: 60, screenBitrate: 0,
});
export const DEVICE_KINDS = Object.freeze({ microphone: 'audioinput', speaker: 'audiooutput', camera: 'videoinput' });
export function normalizeMediaPreferences(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const result = { ...MEDIA_DEFAULTS };
  for (const key of ['microphoneId', 'speakerId', 'cameraId']) if (typeof value[key] === 'string' && value[key].length <= MEDIA_CONFIG.deviceIdMaxLength) result[key] = value[key] === 'default' ? '' : value[key];
  for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) if (typeof value[key] === 'boolean') result[key] = value[key];
  for (const kind of ['camera', 'screen']) {
    const primitive = key => ['string','number'].includes(typeof value[key]);
    if (primitive(`${kind}Resolution`) && Object.hasOwn(MEDIA_CONFIG.resolutions, value[`${kind}Resolution`])) result[`${kind}Resolution`] = String(value[`${kind}Resolution`]);
    if (primitive(`${kind}Fps`) && MEDIA_CONFIG.frameRates.includes(Number(value[`${kind}Fps`]))) result[`${kind}Fps`] = Number(value[`${kind}Fps`]);
    if (primitive(`${kind}Bitrate`) && MEDIA_CONFIG.bitrates.includes(Number(value[`${kind}Bitrate`]))) result[`${kind}Bitrate`] = Number(value[`${kind}Bitrate`]);
  }
  return result;
}
export function microphoneConstraints(value) {
  const prefs = normalizeMediaPreferences(value);
  return { echoCancellation: prefs.echoCancellation, noiseSuppression: prefs.noiseSuppression, autoGainControl: prefs.autoGainControl,
    ...(prefs.microphoneId ? { deviceId: { exact: prefs.microphoneId } } : {}) };
}
export function videoConstraints(kind, value, includeDevice = true) {
  const prefs = normalizeMediaPreferences(value), [width, height] = MEDIA_CONFIG.resolutions[prefs[`${kind}Resolution`]], fps = prefs[`${kind}Fps`];
  // Screen constraints scale the chosen surface; they never preselect or filter it.
  return { width: { ideal: width, max: width }, height: { ideal: height, max: height }, frameRate: { ideal: fps, max: fps },
    ...(kind === 'camera' && includeDevice ? prefs.cameraId ? { deviceId: { exact: prefs.cameraId } } : { facingMode: { ideal: 'user' } } : {}) };
}
export function videoEncoding(kind, value) {
  const prefs = normalizeMediaPreferences(value), height = prefs[`${kind}Resolution`], fps = prefs[`${kind}Fps`];
  const budget = { '480': 1.5, '720': 3, '1080': 6, '1440': 12, '2160': 24 }[height];
  const mbps = prefs[`${kind}Bitrate`] || Math.min(40, budget * (kind === 'screen' ? 4 / 3 : 1) * (fps > 30 ? 1.5 : 1));
  return { maxBitrate: Math.round(mbps * 1000000), maxFramerate: fps };
}
export function mediaError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Device access was denied. Allow access in your browser, then choose the device again.';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'The selected device or quality is unavailable. Reconnect it or choose another option.';
  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') return 'The device could not be opened. Close other apps using it and try again.';
  return error?.message || 'The media setting could not be applied.';
}

export class MediaPreferences {
  constructor({ mediaDevices = globalThis.navigator?.mediaDevices, storage, outputSupported = typeof globalThis.HTMLMediaElement?.prototype?.setSinkId === 'function', onApply = async () => {}, onChange = () => {} } = {}) {
    Object.assign(this, { mediaDevices, storage, outputSupported, onApply, onChange });
    this.preferences = { ...MEDIA_DEFAULTS }; this.devices = []; this.userId = null; this.busy = false; this.revision = 0; this.error = ''; this.enumeration = null; this.preparations = new Map();
    this.deviceChanged = () => this.refresh().catch(() => {});
    mediaDevices?.addEventListener?.('devicechange', this.deviceChanged);
  }
  snapshot() { return { preferences: { ...this.preferences }, devices: this.devices, busy: this.busy, error: this.error,
    captureSupported: Boolean(this.mediaDevices?.getUserMedia), outputSupported: this.outputSupported, outputPromptSupported: Boolean(this.mediaDevices?.selectAudioOutput) }; }
  changed() { this.onChange(this.snapshot()); }
  attach(userId) {
    ++this.revision; this.userId = userId; this.busy = false; this.error = ''; this.devices = []; this.enumeration = null; this.preparations = new Map();
    let stored; try { stored = JSON.parse(this.storage?.getItem(MEDIA_CONFIG.storagePrefix + userId) || '{}'); } catch { /* Storage is optional. */ }
    this.preferences = normalizeMediaPreferences(stored);
    if (!this.outputSupported) this.preferences.speakerId = '';
    this.changed();
  }
  async refresh() {
    if (!this.mediaDevices?.enumerateDevices) { this.devices = []; this.changed(); return; }
    if (this.enumeration) return this.enumeration;
    const revision = this.revision;
    const task = (async () => {
      try {
        const list = await this.mediaDevices.enumerateDevices();
        if (revision !== this.revision) return;
        this.devices = list.filter(device => Object.values(DEVICE_KINDS).includes(device.kind) && device.deviceId).map(device => ({
          kind: device.kind, deviceId: device.deviceId, label: device.label || '',
        }));
        this.error = '';
      } catch (error) { if (revision === this.revision) this.error = mediaError(error); }
      finally { if (revision === this.revision) this.changed(); }
    })();
    this.enumeration = task;
    try { await task; } finally { if (this.enumeration === task) this.enumeration = null; }
  }
  async prepare(kind, preferences = this.preferences) {
    if (!['microphone', 'camera'].includes(kind)) return this.refresh();
    if (!this.mediaDevices?.getUserMedia) throw new Error('Device access needs HTTPS and a supported browser.');
    if (this.devices.some(device => device.kind === DEVICE_KINDS[kind] && device.label)) return this.refresh();
    if (this.preparations.has(kind)) return this.preparations.get(kind);
    const revision = this.revision;
    const task = (async () => {
      let stream;
      try {
        // Device selection itself requests access; no second Allow button is needed.
        stream = await this.mediaDevices.getUserMedia({ audio: kind === 'microphone' ? microphoneConstraints(preferences) : false, video: kind === 'camera' ? videoConstraints('camera', preferences) : false });
        if (revision === this.revision) await this.refresh();
      } catch (error) {
        if (revision === this.revision) { this.error = mediaError(error); this.changed(); }
        throw new Error(mediaError(error));
      } finally { stream?.getTracks().forEach(track => track.stop()); }
    })();
    this.preparations.set(kind, task);
    try { await task; } finally { if (this.preparations.get(kind) === task) this.preparations.delete(kind); }
  }
  async chooseSpeaker(deviceId) {
    if (this.busy) throw new Error('Wait for the current device change to finish.');
    if (!this.outputSupported) throw new Error('This browser uses the system audio output. Choose your speakers in your device settings.');
    // Call the permission picker before awaiting anything: browsers require a user gesture.
    const revision = this.revision, choice = deviceId && this.mediaDevices?.selectAudioOutput ? this.mediaDevices.selectAudioOutput({ deviceId }) : null;
    const selected = choice ? (await choice).deviceId : deviceId;
    if (revision !== this.revision) return;
    await this.update({ speakerId: selected || '' }, { force: true }); await this.refresh();
  }
  async requestSpeaker() {
    if (this.busy) throw new Error('Wait for the current device change to finish.');
    if (!this.outputSupported || !this.mediaDevices?.selectAudioOutput) throw new Error('Choose an available output from the list or use your system sound settings.');
    const revision = this.revision, choice = this.mediaDevices.selectAudioOutput({ deviceId: this.preferences.speakerId });
    const selected = await choice; if (revision !== this.revision) return;
    await this.update({ speakerId: selected.deviceId }, { force: true }); await this.refresh();
  }
  async update(patch, { force = false } = {}) {
    if (this.busy) throw new Error('Wait for the current device change to finish.');
    const previous = this.preferences, next = normalizeMediaPreferences({ ...previous, ...patch });
    if (!force && JSON.stringify(next) === JSON.stringify(previous)) return;
    const revision = this.revision; this.busy = true; this.error = ''; this.changed();
    try {
      await this.onApply(next, previous, { keys: Object.keys(patch), force });
      if (revision !== this.revision) return;
      this.preferences = next;
      try { this.storage?.setItem(MEDIA_CONFIG.storagePrefix + this.userId, JSON.stringify(next)); } catch { /* Device selection still works without storage. */ }
    } catch (error) { if (revision === this.revision) this.error = mediaError(error); throw new Error(mediaError(error)); }
    finally { if (revision === this.revision) { this.busy = false; this.changed(); } }
  }
}

// Route both existing and future peer audio without recreating their media elements.
export class CallAudioOutput {
  constructor({ getElements, createElement, onError = () => {}, onReady = () => {} }) {
    Object.assign(this, { getElements, createElement, onError, onReady }); this.deviceId = ''; this.revision = 0; this.busy = false;
  }
  restore(deviceId) { this.deviceId = deviceId; this.busy = false; ++this.revision; this.onReady(); }
  async setDevice(deviceId) {
    const previous = this.deviceId, elements = [...this.getElements()], probe = this.createElement(), startingRevision = this.revision;
    if (deviceId && !probe.setSinkId) throw new Error('This browser uses the system audio output. Choose your speakers in your device settings.');
    if (!probe.setSinkId) { this.deviceId = ''; return; }
    await probe.setSinkId(deviceId);
    if (this.revision !== startingRevision) return;
    this.busy = true; ++this.revision;
    const revision = this.revision;
    const results = await Promise.allSettled(elements.map(element => element.setSinkId(deviceId)));
    if (revision !== this.revision) return;
    const failed = results.find(result => result.status === 'rejected');
    if (failed) {
      await Promise.all(elements.map(async element => { try { await element.setSinkId(previous); } catch { element.muted = true; } }));
      if (revision !== this.revision) return;
      this.busy = false; this.onReady(); throw failed.reason;
    }
    this.deviceId = deviceId; ++this.revision; this.busy = false; this.onReady();
  }
  route(element) {
    if (this.busy) return false;
    if (!element.setSinkId) return !this.deviceId;
    if (element.sinkId === this.deviceId) return true;
    if (element._nexusOutput === this.deviceId) return false;
    const deviceId = this.deviceId, revision = this.revision; element._nexusOutput = deviceId;
    element.muted = true;
    Promise.resolve(element.setSinkId(deviceId)).then(() => {
      if (revision !== this.revision) { delete element._nexusOutput; }
      this.onReady();
    }).catch(error => { if (revision === this.revision) this.onError(mediaError(error)); });
    return false;
  }
}
