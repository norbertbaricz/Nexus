'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');
const { CONFIG } = require('../server/config');
const { createApp } = require('../server/app');

// Disposable fixtures exercise the public API, including proxy-rewritten origins.
const PUBLIC_ORIGIN = 'https://nexus.example.test';
const OTHER_ORIGIN = 'https://untrusted.example.test';
const PASSWORD = 'request-regression-only-72!';
const SOCKET_TIMEOUT_MS = 2500;
const SOURCE_ERROR_CODE = 'SOURCE_VERIFICATION_FAILED';

async function service(t, settings = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-source-'));
  const instance = createApp({ ...CONFIG, publicOrigin: '', trustProxy: false, secureCookies: false,
    databasePath: path.join(folder, 'nexus.sqlite'), uploadPath: path.join(folder, 'uploads'),
    authAttemptsPerMinute: 100, requestsPerMinute: 1000, ...settings });
  const server = http.createServer(instance.app);
  const io = instance.attachRealtime(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => io.close(resolve));
    instance.close(); fs.rmSync(folder, { recursive: true, force: true });
  });
  async function api(route, { method = 'GET', headers = {}, body } = {}) {
    const response = await fetch(base + route, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const cookies = response.headers.getSetCookie().map(value => value.split(';')[0]);
    return { status: response.status, data: await response.json(), cookies,
      cookie: cookies.join('; '), headers: response.headers };
  }
  return { api, base, db: instance.db };
}
function credentials(username) { return { username, displayName: username, password: PASSWORD }; }
function connect(base, cookie, origin, csrfToken) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/socket.io/?EIO=4&transport=websocket', {
      headers: { Cookie: cookie, Origin: origin },
    });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Connection timed out')); }, SOCKET_TIMEOUT_MS);
    const fail = error => { clearTimeout(timer); ws.close(); reject(error); };
    ws.on('error', fail);
    ws.on('message', bytes => {
      const packet = bytes.toString();
      if (packet.startsWith('0')) ws.send(`40${JSON.stringify({ csrfToken })}`);
      else if (packet === '2') ws.send('3');
      else if (packet.startsWith('40')) { clearTimeout(timer); ws.close(); resolve(); }
      else if (packet.startsWith('44')) {
        const payload = JSON.parse(packet.slice(2));
        const error = new Error(payload.message); error.code = payload.data?.code; fail(error);
      }
    });
  });
}

test('registration accepts a same-origin browser request after a reverse proxy rewrites the host and scheme', async t => {
  const { api, db } = await service(t, { publicOrigin: 'https://previous-host.example.test' });
  const result = await api('/api/auth/register', { method: 'POST',
    headers: { Origin: PUBLIC_ORIGIN, 'Sec-Fetch-Site': 'same-origin' }, body: credentials('proxy_user') });
  assert.equal(result.status, 201);
  const workspace = await api('/api/bootstrap', { headers: { Cookie: result.cookie } });
  assert.equal(workspace.status, 200); assert.equal(workspace.data.user.username, 'proxy_user');
  assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count, 1);
});

test('public origins use URL semantics and reject deceptive or null origins', async t => {
  const { api, db } = await service(t, { publicOrigin: '  HTTPS://NEXUS.EXAMPLE.TEST:443/  ' });
  const allowed = await api('/api/auth/register', { method: 'POST', headers: { Origin: PUBLIC_ORIGIN }, body: credentials('canonical') });
  assert.equal(allowed.status, 201);
  for (const origin of ['null', 'https://nexus.example.test.attacker.test', 'https://nexus.example.test/path', 'https://person@nexus.example.test']) {
    const denied = await api('/api/auth/register', { method: 'POST', headers: { Origin: origin }, body: credentials('blocked') });
    assert.equal(denied.status, 403); assert.equal(denied.data.code, SOURCE_ERROR_CODE);
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM users').get().count, 1);
});

test('forwarded target headers are accepted only with explicitly configured proxy trust', async t => {
  const headers = { Origin: PUBLIC_ORIGIN, 'X-Forwarded-Host': 'nexus.example.test', 'X-Forwarded-Proto': 'https' };
  const direct = await service(t);
  const denied = await direct.api('/api/auth/register', { method: 'POST', headers, body: credentials('untrusted_proxy') });
  assert.equal(denied.status, 403);
  const proxied = await service(t, { trustProxy: true });
  const allowed = await proxied.api('/api/auth/register', { method: 'POST', headers, body: credentials('trusted_proxy') });
  assert.equal(allowed.status, 201);
});

test('signed request proofs allow registration without fetch metadata and remain tied to browser and session', async t => {
  const { api } = await service(t);
  const config = await api('/api/config');
  assert.match(config.headers.get('cache-control'), /no-store/);
  assert.match(config.headers.get('set-cookie'), /HttpOnly/);
  assert.match(config.headers.get('set-cookie'), /SameSite=Strict/);
  const proofHeaders = { Origin: PUBLIC_ORIGIN, Cookie: config.cookie, 'X-Nexus-CSRF': config.data.csrfToken };
  const registered = await api('/api/auth/register', { method: 'POST', headers: proofHeaders, body: credentials('signed_user') });
  assert.equal(registered.status, 201);
  const cookie = [config.cookie, registered.cookie].join('; ');
  const stale = await api('/api/profile', { method: 'PATCH', headers: { ...proofHeaders, Cookie: cookie }, body: { displayName: 'Stale token' } });
  assert.equal(stale.status, 403);
  const current = await api('/api/config', { headers: { Cookie: cookie } });
  const authenticatedHeaders = { Origin: PUBLIC_ORIGIN, Cookie: cookie, 'X-Nexus-CSRF': current.data.csrfToken };
  assert.equal((await api('/api/profile', { method: 'PATCH', headers: authenticatedHeaders, body: { displayName: 'Saved profile' } })).status, 200);
  const other = await api('/api/config');
  assert.equal((await api('/api/auth/register', { method: 'POST', headers: { ...proofHeaders, Cookie: other.cookie }, body: credentials('other_browser') })).status, 403);
  assert.equal((await api('/api/profile', { method: 'PATCH', headers: { ...authenticatedHeaders, 'X-Nexus-CSRF': 'invalid' }, body: { displayName: 'Tampered' } })).status, 403);
  assert.equal((await api('/api/profile', { method: 'PATCH', headers: { ...authenticatedHeaders, 'Sec-Fetch-Site': 'cross-site' }, body: { displayName: 'Cross site' } })).status, 403);
  assert.equal((await api('/api/profile', { method: 'PATCH', headers: { ...authenticatedHeaders, Origin: 'null' }, body: { displayName: 'Null origin' } })).status, 403);
  const missing = await api('/api/profile', { method: 'PATCH', headers: { Cookie: cookie }, body: { displayName: 'Missing proof' } });
  assert.equal(missing.status, 403);
});

test('an expired request proof is rejected without ending the account session', async t => {
  const { api, base } = await service(t, { csrfLifetimeMs: -1000 });
  const registered = await api('/api/auth/register', { method: 'POST', headers: { Origin: base }, body: credentials('expired_proof') });
  const config = await api('/api/config', { headers: { Cookie: registered.cookie } });
  const expired = await api('/api/profile', { method: 'PATCH', headers: { Origin: PUBLIC_ORIGIN,
    Cookie: [registered.cookie, config.cookie].join('; '), 'X-Nexus-CSRF': config.data.csrfToken }, body: { displayName: 'Expired' } });
  assert.equal(expired.status, 403); assert.equal(expired.data.code, SOURCE_ERROR_CODE);
  assert.equal((await api('/api/bootstrap', { headers: { Cookie: registered.cookie } })).status, 200);
});

test('realtime authentication accepts a session-bound proof across a rewritten origin and rejects an untrusted socket', async t => {
  const { api, base } = await service(t);
  const registered = await api('/api/auth/register', { method: 'POST', headers: { Origin: base }, body: credentials('live_proof') });
  const config = await api('/api/config', { headers: { Cookie: registered.cookie } });
  const cookie = [registered.cookie, config.cookie].join('; ');
  await connect(base, cookie, PUBLIC_ORIGIN, config.data.csrfToken);
  await assert.rejects(connect(base, cookie, OTHER_ORIGIN), error => error.code === SOURCE_ERROR_CODE);
});
