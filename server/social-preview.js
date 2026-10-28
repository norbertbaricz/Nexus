'use strict';

const PREVIEW = Object.freeze({
  name: 'Nexus', title: 'Nexus · Your world, connected.',
  description: 'A place for your people. Discover communities, send private messages and spend time together in voice.',
  image: '/assets/nexus-share.png', width: 1200, height: 630,
  imageAlt: 'The official Nexus logo with the words Your world, connected.',
});
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const loopback = hostname => hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(hostname);

function publicOrigin(value) {
  if (!value || /[\s\\]/.test(value)) return '';
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:' && loopback(url.hostname)) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : '';
  } catch { return ''; }
}
function previewOrigin(req, configured = '') {
  // A configured origin always wins. Never accept a forwarded host or a URL from
  // a query string; tunnels normally retain the public HTTP Host header.
  if (configured) return publicOrigin(configured);
  const host = req.headers.host;
  if (typeof host !== 'string' || !host || /[\s\\/@?#<>"',]/.test(host)) return '';
  try {
    const url = new URL(`https://${host}`);
    if (url.host !== host.toLowerCase()) return '';
    return `${loopback(url.hostname) && !req.secure ? 'http:' : 'https:'}//${url.host}`;
  } catch { return ''; }
}
function socialPreview(req, { origin = '', imageRevision = '' } = {}) {
  const base = previewOrigin(req, origin);
  const image = `${base}${PREVIEW.image}${imageRevision ? `?v=${encodeURIComponent(imageRevision)}` : ''}`;
  const tags = [
    ['property', 'og:type', 'website'], ['property', 'og:site_name', PREVIEW.name],
    ['property', 'og:title', PREVIEW.title], ['property', 'og:description', PREVIEW.description],
    ['property', 'og:image', image], ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', PREVIEW.width], ['property', 'og:image:height', PREVIEW.height],
    ['property', 'og:image:alt', PREVIEW.imageAlt],
    ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', PREVIEW.title],
    ['name', 'twitter:description', PREVIEW.description], ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', PREVIEW.imageAlt],
  ];
  if (base) tags.push(['property', 'og:url', `${base}/`]);
  return tags.map(([attribute, name, value]) => `<meta ${attribute}="${name}" content="${escape(value)}">`).join('\n  ')
    + (base ? `\n  <link rel="canonical" href="${escape(base)}/">` : '');
}

module.exports = { PREVIEW, publicOrigin, previewOrigin, socialPreview };
