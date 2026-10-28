'use strict';
const { verifyRelease, ROOT } = require('../server/release');
const { dependencies } = require('../package.json');
function dependenciesReady() { return Object.entries(dependencies).every(([name,version]) => { try { return require(require.resolve(`${name}/package.json`,{paths:[ROOT]})).version === version; } catch { return false; } }); }
if (require.main === module) {
  try { if (process.argv.includes('--dependencies')) process.exitCode = dependenciesReady() ? 0 : 1; else { const release = verifyRelease(); console.log(`[Nexus] Website ${release.version}: release files verified.`); } }
  catch (error) { console.error('[Nexus update]',error.message); process.exitCode = 1; }
}
module.exports = { dependenciesReady };
