'use strict';

// Provider requests originate in the browser. Only allow GIPHY media references
// in stored messages; arbitrary external URLs and executable formats are rejected.
function providerGif(value) {
  if (!value || value.provider !== 'giphy' || !/^[a-zA-Z0-9]{1,80}$/.test(value.providerId || '')) return null;
  let url;
  try { url = new URL(value.url); } catch { return null; }
  const parts = url.pathname.split('/');
  if (url.protocol !== 'https:' || !/^media[0-4]?\.giphy\.com$/.test(url.hostname) || url.port || url.username || url.password || url.hash || !url.pathname.startsWith('/media/') || parts.at(-2) !== value.providerId || !/^[a-zA-Z0-9_-]+\.gif$/.test(parts.at(-1)) || value.url.length > 2048) return null;
  const title = typeof value.title === 'string' ? value.title.slice(0, 140) : 'GIF';
  let still;
  if (value.still) {
    if (typeof value.still !== 'string' || value.still.length > 2048) return null;
    const reference = providerGif({ provider: value.provider, providerId: value.providerId, url: value.still });
    if (!reference || !/_s\.gif$/.test(new URL(reference.url).pathname)) return null;
    still = reference.url;
  }
  return { id: `giphy:${value.providerId}`, provider: 'giphy', providerId: value.providerId, url: url.href, ...(still ? { still } : {}), name: title || 'GIF', title: title || 'GIF', type: 'image/gif', size: 0 };
}

module.exports = { providerGif };
