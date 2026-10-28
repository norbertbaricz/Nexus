'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { supportsNode, assertSupportedNode } = require('../scripts/require-node');
const { digest, jsonDigest, verifyRelease } = require('../server/release');

function releaseFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-startup-'));
  const project = { name: 'nexus-chat', version: '2.23.0', dependencies: { express: '5.3.0' } };
  const lock = { name: project.name, version: project.version, lockfileVersion: 3, packages: {
    '': project,
    'node_modules/express': { version: '5.3.0', resolved: 'https://registry.npmjs.org/express/-/express-5.3.0.tgz', integrity: 'sha512-fixture-only' },
  } };
  const files = { 'package.json': JSON.stringify(project, null, 2), 'package-lock.json': JSON.stringify(lock, null, 2) };
  for (const name of ['server.js','public/app.js','public/ui.js','public/styles.css','public/media-ui.js']) files[name] = 'fixture ' + name;
  for (const [name, body] of Object.entries(files)) { const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); }
  const entries = Object.fromEntries(Object.entries(files).map(([name, body]) => [name, {
    bytes: Buffer.byteLength(body), sha256: digest(body), ...(['package.json','package-lock.json'].includes(name) ? { jsonSha256: jsonDigest(body) } : {}),
  }]));
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({ format: 1, version: project.version, files: entries }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, lock, writeLock: value => fs.writeFileSync(path.join(root, 'package-lock.json'), value) };
}

test('runtime support includes the reported Node 26.12.1 and retained Node 24 releases', () => {
  for (const version of ['24.15.0','24.22.1','26.0.0','26.12.1','v26.12.1']) assert.equal(supportsNode(version), true, version);
  for (const version of ['22.23.4','24.14.9','25.9.0','27.0.0','26.12.1-rc.1','26','invalid']) assert.equal(supportsNode(version), false, version);
  assert.doesNotThrow(() => assertSupportedNode('26.12.1', 'test-node'));
  assert.throws(() => assertSupportedNode('24.14.0', 'C:\\old\\node.exe'), /Detected 24\.14\.0 at C:\\old\\node\.exe/);
});

test('the actual runtime check succeeds and reports the executable used by the launcher', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../scripts/require-node.js')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(process.version)); assert.ok(result.stdout.includes(process.execPath));
  assert.equal(result.stderr, '');
});

test('the delivered npm lock pins every direct production and development dependency to the declared version', () => {
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
  assert.equal(lock.name, project.name); assert.equal(lock.version, project.version);
  assert.equal(lock.packages[''].version, project.version);
  assert.deepEqual(lock.packages[''].engines, project.engines);
  for (const group of ['dependencies','devDependencies']) {
    assert.deepEqual(lock.packages[''][group], project[group]);
    for (const [name, version] of Object.entries(project[group])) assert.equal(lock.packages['node_modules/' + name]?.version, version, name);
  }
});

test('equivalent lock JSON survives CRLF, whitespace and reordered keys during production startup checks', t => {
  const fixture = releaseFixture(t);
  function reverseKeys(value) {
    if (Array.isArray(value)) return value.map(reverseKeys);
    return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)])) : value;
  }
  fixture.writeLock(JSON.stringify(reverseKeys(fixture.lock), null, 4).replace(/\n/g, '\r\n') + '\r\n');
  assert.equal(verifyRelease(fixture.root).version, '2.23.0');
  // Full archive checks still require the exact packaged bytes.
  assert.throws(() => verifyRelease(fixture.root, { all: true }), /package-lock\.json/);
});

test('changed dependency versions, sources and integrity are still rejected with a lock-specific recovery action', t => {
  const fixture = releaseFixture(t), original = structuredClone(fixture.lock);
  for (const [key, value] of [['version','0.0.0'],['resolved','file:unexpected'],['integrity','sha512-changed']]) {
    const changed = structuredClone(original); changed.packages['node_modules/express'][key] = value; fixture.writeLock(JSON.stringify(changed));
    assert.throws(() => verifyRelease(fixture.root), error => /package-lock\.json/.test(error.message) && /replace package-lock\.json/.test(error.message) && !/Install Node/.test(error.message));
  }
  fixture.writeLock('broken JSON'); assert.throws(() => verifyRelease(fixture.root), /package-lock\.json/);
  fs.unlinkSync(path.join(fixture.root, 'package-lock.json')); assert.throws(() => verifyRelease(fixture.root), /package-lock\.json is missing/);
});

test('JSON tolerance does not bypass mixed executable source checks', t => {
  const fixture = releaseFixture(t); fs.writeFileSync(path.join(fixture.root, 'public/app.js'), 'old UI');
  assert.throws(() => verifyRelease(fixture.root), /mixed-version files: public\/app\.js/);
});
