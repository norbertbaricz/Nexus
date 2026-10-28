'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { PREVIEW, publicOrigin, previewOrigin, socialPreview } = require('../server/social-preview');
const { installPublicAssets } = require('../server/public-assets');

test('social origins prefer the configured HTTPS address and never trust forwarded hosts or link parameters', () => {
  const req = { headers: { host: 'my-nexus.ngrok-free.app', 'x-forwarded-host': 'attacker.example' }, secure: false, url: '/?invite=private&token=secret' };
  assert.equal(previewOrigin(req), 'https://my-nexus.ngrok-free.app');
  assert.equal(previewOrigin(req, 'https://nexus.example/'), 'https://nexus.example');
  assert.equal(previewOrigin({ headers: { host: 'localhost:3000' } }), 'http://localhost:3000');
  assert.equal(previewOrigin({ headers: { host: '[::1]:3000' }, secure: true }), 'https://[::1]:3000');
  for (const value of ['http://nexus.example', 'https://a.example/private', 'https://a.example/?token=x', 'https://user:password@a.example', 'javascript:alert(1)', 'https://a.example/#secret']) assert.equal(publicOrigin(value), '', value);
  for (const host of ['a.example,evil.example', 'user@evil.example', 'a.example/<script>', 'a.example" onload="x', 'a.example\\evil']) assert.equal(previewOrigin({ headers: { host } }), '', host);
  assert.equal(previewOrigin(req, 'invalid-configured-origin'), '');
  const markup = socialPreview(req, { imageRevision: 'safe-revision' });
  assert.ok(markup.includes('https://my-nexus.ngrok-free.app/assets/nexus-share.png?v=safe-revision'));
  assert.ok(!markup.includes('attacker') && !markup.includes('invite=private') && !markup.includes('secret'));
});

test('unauthenticated link crawlers receive complete branded metadata and a real PNG without running JavaScript', async t => {
  const directory = path.join(__dirname, '../public'), app = express();
  const assets = installPublicAssets(app, directory, { publicOrigin: 'https://my-nexus.ngrok-free.app' });
  app.use(express.static(directory, { index: false })); app.get('/{*path}', assets.sendIndex);
  const server = http.createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base + '/?invite=do-not-publish', { headers: { 'User-Agent': 'Discordbot/2.0' } }), html = await page.text();
  assert.equal(page.status, 200); assert.equal(page.headers.get('cache-control'), 'no-store');
  for (const field of ['og:title', 'og:type', 'og:description', 'og:site_name', 'og:url', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:image']) assert.ok(html.includes(`"${field}"`), field);
  assert.ok(html.includes('summary_large_image')); assert.ok(!html.includes('do-not-publish')); assert.ok(!html.includes('<!-- nexus-social-preview -->'));
  const imageURL = new URL(html.match(/property="og:image" content="([^"]+)"/)[1]);
  assert.equal(imageURL.origin, 'https://my-nexus.ngrok-free.app'); assert.match(imageURL.search, /^\?v=[a-f0-9]{16}$/);
  for (const route of [imageURL.pathname + imageURL.search, '/assets/nexus-icon-192.png', '/assets/nexus-icon-180.png']) {
    const response = await fetch(base + route), bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/); assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const size = route.includes('192') ? 192 : route.includes('180') ? 180 : null;
    assert.equal(bytes.readUInt32BE(16), size || PREVIEW.width); assert.equal(bytes.readUInt32BE(20), size || PREVIEW.height);
  }
  assert.ok(fs.statSync(path.join(directory, PREVIEW.image.slice(1))).size < 200 * 1024);
});
