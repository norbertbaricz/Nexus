// Public discovery has its own result set; quick search keeps its existing scope.
export class DiscoverySearch {
  constructor({ request, onChange }) {
    Object.assign(this, { request, onChange });
    this.query = ''; this.servers = []; this.hasMore = false; this.nextOffset = 0;
    this.loading = false; this.error = ''; this.revision = 0;
  }
  search(query) { return this.load(query.trim(), false); }
  more() { if (!this.loading && this.hasMore) return this.load(this.query, true); }
  cancel() { ++this.revision; this.loading = false; }
  async load(query, append) {
    const revision = ++this.revision, offset = append ? this.nextOffset : 0;
    this.query = query; this.loading = true; this.error = '';
    if (!append) { this.servers = []; this.hasMore = false; this.nextOffset = 0; }
    this.onChange();
    try {
      const result = await this.request(`/api/discovery?${new URLSearchParams({ q: query, offset: String(offset) })}`);
      if (revision !== this.revision) return;
      const seen = new Set(append ? this.servers.map(server => server.id) : []);
      const incoming = result.servers.filter(server => { if (seen.has(server.id)) return false; seen.add(server.id); return true; });
      this.servers = append ? [...this.servers, ...incoming] : incoming;
      this.hasMore = Boolean(result.hasMore); this.nextOffset = result.nextOffset;
    } catch (error) {
      if (revision !== this.revision) return;
      this.error = error.message || 'Public servers could not be loaded.';
    } finally {
      if (revision === this.revision) { this.loading = false; this.onChange(); }
    }
  }
}
