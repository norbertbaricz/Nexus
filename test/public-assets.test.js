'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const { installPublicAssets } = require('../server/public-assets');

// Disposable frontend generations exercise a real browser-cache upgrade boundary.
const INITIAL_FILES = Object.freeze({
  'index.html': '<!doctype html><link rel="stylesheet" href="/styles.css"><script type="module" src="/app.js"></script>',
  'styles.css': 'body { color: white; }',
  'app.js': "import './nested/feature.js';",
  'nested/feature.js': "export const generation = 'first';",
  '.env': 'PRIVATE_FIXTURE_ONLY=hidden',
});
function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-assets-')), servers = [];
  for (const [name, text] of Object.entries(INITIAL_FILES)) {
    const filename = path.join(directory, name); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, text);
  }
  t.after(async () => {
    for (const server of servers) await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, async start() {
    const app = express(), assets = installPublicAssets(app, directory);
    app.get('/{*path}', assets.sendIndex);
    const server = http.createServer(app); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return { ...assets, base: `http://127.0.0.1:${server.address().port}` };
  } };
}

test('pages and relative module imports use one complete client build', async t => {
  const fixture = workspace(t), service = await fixture.start();
  for (const route of ['/', '/index.html', '/a/client/route']) {
    const page = await fetch(service.base + route), html = await page.text();
    assert.equal(page.status, 200); assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('x-nexus-build'), service.buildId);
    assert.ok(html.includes(`href="${service.prefix}/styles.css"`)); assert.ok(html.includes(`src="${service.prefix}/app.js"`));
  }
  const entry = await fetch(service.base + service.prefix + '/app.js'), source = await entry.text();
  const imported = new URL(source.match(/import '([^']+)'/)[1], entry.url);
  assert.equal(imported.pathname, service.prefix + '/nested/feature.js');
  assert.equal(await (await fetch(imported)).text(), INITIAL_FILES['nested/feature.js']);
});

test('a running build is immutable and a CSS-only upgrade changes the whole module namespace', async t => {
  const fixture = workspace(t), previous = await fixture.start();
  const oldStyle = await fetch(previous.base + previous.prefix + '/styles.css'), etag = oldStyle.headers.get('etag');
  fs.writeFileSync(path.join(fixture.directory, 'styles.css'), 'body { color: coral; }');
  assert.equal(await (await fetch(previous.base + previous.prefix + '/styles.css')).text(), INITIAL_FILES['styles.css']);
  const upgraded = await fixture.start(); assert.notEqual(upgraded.buildId, previous.buildId);
  const style = await fetch(upgraded.base + upgraded.prefix + '/styles.css', { headers: { 'If-None-Match': etag } });
  assert.equal(style.status, 200); assert.equal(await style.text(), 'body { color: coral; }');
  assert.equal(await (await fetch(upgraded.base + upgraded.prefix + '/app.js')).text(), INITIAL_FILES['app.js']);
  const obsolete = await fetch(upgraded.base + previous.prefix + '/app.js');
  assert.equal(obsolete.status, 404); assert.equal(obsolete.headers.get('cache-control'), 'no-store');
});

test('immutable assets support conditional GET and HEAD with the correct MIME type', async t => {
  const service = await workspace(t).start();
  for (const [name, type] of [['styles.css', 'text/css'], ['app.js', 'text/javascript']]) {
    const url = service.base + service.prefix + '/' + name, first = await fetch(url), etag = first.headers.get('etag');
    assert.match(first.headers.get('cache-control'), /immutable/); assert.match(first.headers.get('content-type'), new RegExp(type));
    assert.equal(first.headers.get('x-nexus-build'), service.buildId);
    assert.equal((await fetch(url, { headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } })).status, 304);
    const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal(head.headers.get('etag'), etag);
  }
});

test('unversioned entry URLs migrate without caching a redirect to an obsolete build', async t => {
  const service = await workspace(t).start();
  for (const name of ['app.js', 'styles.css', 'nested/feature.js']) {
    const legacy = await fetch(service.base + '/' + name, { redirect: 'manual' });
    assert.equal(legacy.status, 307); assert.equal(legacy.headers.get('location'), service.prefix + '/' + name);
    assert.equal(legacy.headers.get('cache-control'), 'no-store');
    const followed = await fetch(service.base + '/' + name);
    assert.equal(followed.url, service.base + service.prefix + '/' + name); assert.equal(await followed.text(), INITIAL_FILES[name]);
  }
});

test('unknown builds, missing modules and private paths never fall back to app HTML', async t => {
  const service = await workspace(t).start();
  for (const route of ['/client/obsolete/app.js', service.prefix + '/missing.js', service.prefix + '/.env',
    service.prefix + '/%2e%2e%2f.env', service.prefix + '/%2e%2e%2fserver%2fapp.js']) {
    const result = await fetch(service.base + route), body = await result.text();
    assert.equal(result.status, 404); assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('content-type'), /text\/plain/); assert.ok(!body.includes('<!doctype')); assert.ok(!body.includes('PRIVATE_FIXTURE_ONLY'));
  }
  const malformed = await fetch(service.base + service.prefix + '/%E0%A4%A'); assert.equal(malformed.status, 400);
});
