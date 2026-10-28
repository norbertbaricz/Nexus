'use strict';
const http = require('node:http');
const { CONFIG } = require('./server/config');
const { VERSION, ROOT, verifyRelease } = require('./server/release');
const { assertSupportedNode } = require('./scripts/require-node');
// Diagnostics identify the exact process/folder being updated.
const START_CONFIG = Object.freeze({ occupiedPortTimeoutMs: 2000 });
function start(config=CONFIG) {
  const { createApp } = require('./server/app');
  const instance=createApp(config),{app,attachRealtime,close}=instance,server=http.createServer(app),io=attachRealtime(server);let closing=false;
  server.listen(config.port,config.host,()=>{
    console.info(`[Nexus] Website ${VERSION}`);console.info('[Nexus] Installation:',ROOT);console.info('[Nexus] Database:',config.databasePath);console.info('[Nexus] Uploads:',config.uploadPath);console.info('[Nexus] Client build:',instance.buildId);console.info('[Nexus] Account recovery:',instance.mailer.available?'recovery codes and configured email delivery':'recovery codes; email delivery is not configured');
    console.info('[Nexus] Storage and upload service ready.',{maxFileGB:config.maxUploadBytes/1024**3,relayConfigured:config.iceServers.some(item=>[].concat(item.urls).some(url=>/^turns?:/i.test(url)))});console.log(`Nexus is ready at http://${config.host}:${server.address().port}`);
  });
  function shutdown(){if(closing)return;closing=true;io.close();if(server.listening)server.close(()=>close());else close();}
  server.on('error',async error=>{
    shutdown();process.exitCode=1;
    if(error.code==='EADDRINUSE'){
      const host=['0.0.0.0','::'].includes(config.host)?'127.0.0.1':config.host;let active='';
      try{const response=await fetch(`http://${host.includes(':')?`[${host}]`:host}:${config.port}/api/health`,{signal:AbortSignal.timeout(START_CONFIG.occupiedPortTimeoutMs)}),health=await response.json();if(health.ok&&health.version)active=` Nexus ${health.version} is already running.`;}catch{/* The port may belong to a different app. */}
      console.error(`[Nexus] Port ${config.port} is already in use.${active}`);console.error('[Nexus] Stop the existing terminal/service, then start the updated installation:',ROOT);console.error('[Nexus] Copying files or refreshing the browser does not restart a Node process.');
    }else console.error('[Nexus server]',error.stack);
  });
  return {server,io,shutdown};
}
if(require.main===module){process.on('uncaughtExceptionMonitor',error=>console.error('[Nexus fatal]',error.stack));process.on('warning',warning=>console.warn('[Nexus runtime]',warning.name,warning.message));try{assertSupportedNode();if(!process.argv.includes('--development'))verifyRelease();const running=start();process.once('SIGTERM',running.shutdown);process.once('SIGINT',running.shutdown);}catch(error){console.error('[Nexus startup]',error.message);process.exitCode=1;}}
module.exports={start};
