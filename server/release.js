'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Executable source is verified together; personal community data stays editable.
const RELEASE_CONFIG = Object.freeze({ filename: 'release.json', format: 1, reportLimit: 8 });
const VERSION = require('../package.json').version;
const ROOT = path.resolve(__dirname, '..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// JSON formatting, key order and CRLF changes do not change an npm dependency tree.
function canonicalJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJSON(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const jsonDigest = bytes => digest(canonicalJSON(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))));
const runtimeFile = name => ['server.js','package.json','package-lock.json'].includes(name) || /^(public|server|scripts)\//.test(name);
function safeRelative(name) {
  return typeof name === 'string' && name.length > 0 && !name.includes(':') && !name.includes('\\') && !name.includes('\0') && !path.posix.isAbsolute(name)
    && !name.split('/').some(part => !part || part === '.' || part === '..') && !/^(data|backups|node_modules|\.git)(\/|$)/.test(name)
    && (name === '.env.example' || !name.startsWith('.env'));
}
function regularPath(root, name) {
  if (!safeRelative(name)) throw new Error('The release contains an invalid file path.');
  let current = root;
  for (const part of name.split('/')) { current = path.join(current, part); if (fs.lstatSync(current,{throwIfNoEntry:false})?.isSymbolicLink()) throw new Error(`Refusing a linked release path: ${name}`); }
  return current;
}
function verifyRelease(root = ROOT, { required = true, all = false } = {}) {
  const filename = path.join(root, RELEASE_CONFIG.filename);
  if (!fs.existsSync(filename)) { if (!required) return null; throw new Error('release.json is missing. Extract the complete website ZIP, then run start.bat or start.sh.'); }
  let release;
  try { release = JSON.parse(fs.readFileSync(filename,'utf8')); } catch { throw new Error('release.json is invalid. Extract the complete website ZIP again.'); }
  const project = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if (release.format !== RELEASE_CONFIG.format || release.version !== project.version || project.name !== 'nexus-chat' || !release.files || typeof release.files !== 'object') throw new Error('The release metadata and project version do not match. Do not mix files from different ZIPs.');
  for (const name of ['server.js','package.json','package-lock.json','public/app.js','public/ui.js','public/styles.css','public/media-ui.js']) if (!release.files[name]) throw new Error(`The release is incomplete: ${name}`);
  const failed = [];
  for (const [name,entry] of Object.entries(release.files)) {
    const file = regularPath(root,name);
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error('A release fingerprint is invalid.');
    if (entry.jsonSha256 !== undefined && (!['package.json','package-lock.json'].includes(name) || !/^[a-f0-9]{64}$/.test(entry.jsonSha256))) throw new Error('A release JSON fingerprint is invalid.');
    if (!all && !runtimeFile(name)) continue;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { failed.push(name); continue; }
    const bytes = fs.readFileSync(file);
    if (digest(bytes) === entry.sha256) continue;
    // Full archive checks stay byte-exact. Installed JSON may be reformatted.
    if (!all && entry.jsonSha256) {
      try { if (jsonDigest(bytes) === entry.jsonSha256) continue; } catch { /* Invalid JSON is not an equivalent dependency manifest. */ }
    }
    failed.push(name);
  }
  if (failed.length === 1 && failed[0] === 'package-lock.json') throw new Error('package-lock.json is missing, invalid or has different dependency metadata. Stop Nexus, then replace package-lock.json with the file from this same complete ZIP. Preserve .env and data/.');
  if (failed.length) throw new Error(`Installation contains missing or mixed-version files: ${failed.slice(0,RELEASE_CONFIG.reportLimit).join(', ')}. Stop Nexus, then copy all application files and release.json from the same complete ZIP into this installation. Preserve .env and data/.`);
  return release;
}
module.exports = { VERSION, ROOT, RELEASE_CONFIG, digest, jsonDigest, runtimeFile, safeRelative, regularPath, verifyRelease };
