'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { CONFIG } = require('../server/config');
const { openDatabase } = require('../server/database');
const { createCommunityInstaller } = require('../server/community-template');

// Explicit local import only. Running or registering with Nexus never provisions a community.
function setupCommunity(manifest,config=CONFIG) {
  if(!manifest)throw new Error('Provide a community JSON file: npm run setup:community -- path/to/community.json');
  const manifestPath=path.resolve(manifest);
  if(!fs.existsSync(manifestPath))throw new Error('The community JSON file could not be found.');
  const db=openDatabase(config.databasePath);
  try {
    const creatorId=db.prepare("SELECT value FROM app_settings WHERE key='creatorUserId'").get()?.value;
    if(!creatorId||!db.prepare('SELECT 1 FROM users WHERE id=?').get(creatorId))throw new Error('Identify your creator account in Nexus first, then stop Nexus and run this import.');
    fs.mkdirSync(config.uploadPath,{recursive:true});
    const serverId=createCommunityInstaller(db,{...config,communityTemplatePath:manifestPath}).install(creatorId);
    const server=db.prepare('SELECT id,name FROM servers WHERE id=?').get(serverId);
    if(!server)throw new Error('This imported community was deliberately deleted. Create a new community in Nexus instead of restoring a deleted import automatically.');
    const result={serverId:server.id,name:server.name,channels:db.prepare('SELECT count(*) AS n FROM channels WHERE serverId=?').get(server.id).n,roles:db.prepare('SELECT count(*) AS n FROM server_roles WHERE serverId=?').get(server.id).n};
    console.info('[Nexus] Personal community ready:',result.name,`· ${result.channels} channels · ${result.roles} roles. Restart Nexus to open it.`);
    return result;
  }finally{db.close();}
}
if(require.main===module){try{setupCommunity(process.argv[2]);}catch(error){console.error('[Nexus community import]',error.message);process.exitCode=1;}}
module.exports={setupCommunity};
