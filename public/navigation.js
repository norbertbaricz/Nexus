// Only channels in the current authorized workspace can be restored.
export function validChannelHistory(servers, history) {
  if (!history || typeof history !== 'object' || Array.isArray(history)) return {};
  return Object.fromEntries(servers.flatMap(server => {
    const id = Object.hasOwn(history, server.id) ? history[server.id] : null;
    return typeof id === 'string' && server.channels.some(channel => channel.id === id) ? [[server.id, id]] : [];
  }));
}

export function lastServerChannel(server, history) {
  const id = history && Object.hasOwn(history, server.id) ? history[server.id] : null;
  return server.channels.find(channel => channel.id === id)
    || server.channels.find(channel => channel.name === 'general') || server.channels[0] || null;
}
