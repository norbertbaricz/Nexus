'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { VERSION } = require('./release');

// Keep each page's stylesheet and complete module graph on the same client build.
const ASSET_SETTINGS = Object.freeze({ prefix: '/client', hashLength: 20, maxAgeSeconds: 31536000 });
const MIME_TYPES = Object.freeze({ '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' });

function installPublicAssets(app, directory, { version = VERSION } = {}) {
  const assets = new Map();
  function collect(folder, relative = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const name = relative + entry.name, filename = path.join(folder, entry.name);
      if (entry.isDirectory()) collect(filename, name + '/');
      else if (entry.isFile() && MIME_TYPES[path.extname(name)]) {
        const bytes = fs.readFileSync(filename);
        assets.set(name, { bytes, type: MIME_TYPES[path.extname(name)], etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"' });
      }
    }
  }
  collect(directory);
  const template = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
  const hash = createHash('sha256').update('index.html\0').update(template).update('\0version\0' + version);
  for (const [name, asset] of assets) hash.update('\0' + name + '\0').update(asset.bytes);
  const buildId = hash.digest('hex').slice(0, ASSET_SETTINGS.hashLength), prefix = `${ASSET_SETTINGS.prefix}/${buildId}`;
  const versioned = template.replace(/\b(src|href)=(['"])\/([^'"?#]+\.(?:js|css))(?:\?[^'"]*)?\2/g,
    (match, attribute, quote, name) => assets.has(name) ? `${attribute}=${quote}${prefix}/${name}${quote}` : match);
  const metadata = `<meta name="nexus-version" content="${version}"><meta name="nexus-build" content="${buildId}">`;
  const html = versioned.includes('<head>') ? versioned.replace('<head>', '<head>' + metadata) : metadata + versioned;

  function sendIndex(req, res) {
    res.set({ 'Cache-Control': 'no-store', 'X-Nexus-Build': buildId, 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }
  function missing(res, status = 404) {
    return res.status(status).set('Cache-Control', 'no-store').type('text/plain').send('Client asset unavailable. Reload Nexus.');
  }

  app.get(['/', '/index.html'], sendIndex);
  app.use(ASSET_SETTINGS.prefix, (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.set({ Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).status(405).end();
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return missing(res, 400); }
    const match = pathname.match(/^\/([^/]+)\/(.+)$/);
    if (!match || match[1] !== buildId) return missing(res);
    const asset = assets.get(match[2]);
    if (!asset) return missing(res);
    res.set({ 'Cache-Control': `public, max-age=${ASSET_SETTINGS.maxAgeSeconds}, immutable`,
      'X-Nexus-Build': buildId, 'Content-Type': asset.type, ETag: asset.etag });
    res.send(asset.bytes);
  });
  // Old entry URLs migrate to the current build; relative ESM imports retain its prefix.
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    let name;
    try { name = decodeURIComponent(req.path).slice(1); } catch { return missing(res, 400); }
    if (!assets.has(name)) return next();
    res.set('Cache-Control', 'no-store').redirect(307, `${prefix}/${name}`);
  });
  return Object.freeze({ buildId, prefix, sendIndex });
}

module.exports = { installPublicAssets, ASSET_SETTINGS };
