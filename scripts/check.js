'use strict';

const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

// Browser modules are checked as ESM; the retained server uses CommonJS.
const ROOT = join(__dirname, '..');
const SERVER_FOLDERS = ['server', 'scripts', 'test'];
const SKIP = new Set(['node_modules', 'resources', 'dist', 'build', '.gradle']);
function scripts(folder) { return readdirSync(join(ROOT, folder), {withFileTypes:true}).flatMap(entry => SKIP.has(entry.name) ? [] : entry.isDirectory() ? scripts(`${folder}/${entry.name}`) : /\.(?:js|cjs)$/.test(entry.name) ? [`${folder}/${entry.name}`] : []); }
const browserFiles = readdirSync(join(ROOT, 'public')).filter(name => name.endsWith('.js'));
const serverFiles = ['server.js', ...SERVER_FOLDERS.flatMap(scripts)];
let failures = 0;
for (const filename of serverFiles) {
  const result = spawnSync(process.execPath, ['--check', join(ROOT, filename)], { encoding: 'utf8' });
  if (result.status) { console.error(filename, result.stderr); failures++; }
}
for (const filename of browserFiles) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(join(ROOT, 'public', filename), 'utf8'), encoding: 'utf8' });
  if (result.status) { console.error(filename, result.stderr); failures++; }
}
if (failures) process.exitCode = 1;
else console.log(`Syntax verified: ${serverFiles.length} server/test scripts and ${browserFiles.length} browser modules.`);
