'use strict';

// Keep the launcher and package.json engines aligned; do not reject Node 26.
const NODE_CONFIG = Object.freeze({ minimum24Minor: 15, supportedMajors: Object.freeze([24, 26]) });
function supportsNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return NODE_CONFIG.supportedMajors.includes(major) && (major !== 24 || minor >= NODE_CONFIG.minimum24Minor);
}
function assertSupportedNode(version = process.versions.node, executable = process.execPath) {
  if (!supportsNode(version)) throw new Error(`Nexus requires Node.js 26.x or 24.15+ in the Node 24 release line. Detected ${version} at ${executable}.`);
}
if (require.main === module) {
  try { assertSupportedNode(); console.info(`[Nexus] Node.js ${process.version} (${process.execPath})`); }
  catch (error) { console.error('[Nexus runtime]', error.message); process.exitCode = 1; }
}
module.exports = { NODE_CONFIG, supportsNode, assertSupportedNode };
