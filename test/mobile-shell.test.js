'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { installPublicAssets } = require('../server/public-assets');

test('the browser receives a dark canvas before external CSS and installed-site metadata has real Nexus icons', async t => {
  const folder = path.join(__dirname, '../public'), app = express(); installPublicAssets(app, folder); app.use(express.static(folder));
  const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, html = await (await fetch(base)).text();
  assert.ok(html.includes('interactive-widget=resizes-content')); assert.ok(html.includes('name="color-scheme" content="dark"'));
  assert.ok(html.includes('id="startup-screen"')); assert.ok(html.includes('html[data-starting] #app{visibility:hidden}'));
  const earlyStyle = html.indexOf('html,body{background-color:#111216'); assert.ok(earlyStyle > 0 && earlyStyle < html.indexOf('rel="stylesheet"'));
  assert.ok(html.includes('rel="manifest" href="/manifest.webmanifest"'));
  const response = await fetch(base + '/manifest.webmanifest'), manifest = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /manifest\+json/); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(manifest.background_color, '#111216'); assert.equal(manifest.theme_color, '#111216'); assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/'); assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    const response = await fetch(base + icon.src), bytes = Buffer.from(await response.arrayBuffer()); const size = Number(icon.sizes.split('x')[0]);
    assert.equal(response.status, 200); assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
});
