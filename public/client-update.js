// Each page uses one complete build; only uncached metadata is polled.
export const UPDATE_CONFIG = Object.freeze({ intervalMs: 60000, timeoutMs: 5000 });
export const CLIENT_METADATA = Object.freeze({
  version: globalThis.document?.querySelector('meta[name="nexus-version"]')?.content || '',
  buildId: globalThis.document?.querySelector('meta[name="nexus-build"]')?.content || '',
});
export class ClientUpdates {
  constructor({ buildId = CLIENT_METADATA.buildId, fetcher = (...args) => fetch(...args), onUpdate, schedule = (fn,ms) => setInterval(fn,ms), cancel = id => clearInterval(id) }) {
    Object.assign(this,{buildId,fetcher,onUpdate,schedule,cancel}); this.pending = null; this.checking = false; this.timer = null;
  }
  start() { if (!this.timer && this.buildId) this.timer = this.schedule(() => this.check(),UPDATE_CONFIG.intervalMs); }
  stop() { if (this.timer) this.cancel(this.timer); this.timer = null; }
  async check() {
    if (!this.buildId || this.checking) return;
    this.checking = true; const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),UPDATE_CONFIG.timeoutMs);
    try {
      const response = await this.fetcher('/api/health',{credentials:'same-origin',cache:'no-store',signal:controller.signal}); if (!response.ok) return;
      const current = await response.json();
      if (current.ok && /^[a-f0-9]{20}$/.test(current.buildId || '') && current.buildId !== this.buildId && current.buildId !== this.pending?.buildId) { this.pending = {version:String(current.version || ''),buildId:current.buildId}; this.onUpdate(this.pending); }
    } catch { /* Existing connection recovery owns outage notices. */ }
    finally { clearTimeout(timeout); this.checking = false; }
  }
}
