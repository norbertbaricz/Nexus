'use strict';

const http = require('node:http');
const { CONFIG } = require('./server/config');
const { createApp } = require('./server/app');

// npm start loads optional .env through Node's native --env-file-if-exists flag.
function start(config = CONFIG) {
  const { app, attachRealtime, close } = createApp(config);
  const server = http.createServer(app);
  const io = attachRealtime(server);
  server.listen(config.port, config.host, () => {
    console.info('[Nexus] Storage and upload service ready.', { maxFileGB: config.maxUploadBytes / 1024 ** 3, relayConfigured: config.iceServers.some(item=>[].concat(item.urls).some(url=>/^turns?:/i.test(url))) });
    console.log(`Nexus is ready at http://${config.host}:${server.address().port}`);
  });
  server.on('error', error => { console.error('[Nexus server]', error.stack); process.exitCode=1; });
  let closing = false;
  function shutdown() {
    if (closing) return;
    closing = true;
    io.close();
    server.close(() => { close(); });
  }
  return { server, io, shutdown };
}

if (require.main === module) {
  process.on('uncaughtExceptionMonitor', error => console.error('[Nexus fatal]',error.stack));
  process.on('warning', warning => console.warn('[Nexus runtime]',warning.name,warning.message));
  const running = start();
  process.once('SIGTERM', running.shutdown);
  process.once('SIGINT', running.shutdown);
}

module.exports = { start };
