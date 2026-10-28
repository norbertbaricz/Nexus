// Only channels in the current authorized workspace can be restored.
export const NAVIGATION_CONFIG=Object.freeze({prefix:'nexus.view.'});
export function readNavigation(userId,{local,session}={}) {
  if(!userId)return null;
  for(const storage of [()=>session===undefined?globalThis.sessionStorage:session,()=>local===undefined?globalThis.localStorage:local])try{
    const value=JSON.parse(storage()?.getItem(NAVIGATION_CONFIG.prefix+userId)||'null');
    if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  }catch{/* Try the independent durable/tab store. */}
  return null;
}
export function saveNavigation(state,{local,session}={}) {
  if(!state.user?.id)return;
  const value=JSON.stringify({server:state.activeServer,conversation:state.activeConv,view:state.view,homeTab:state.homeTab,lastDM:state.lastDM,lastChannels:state.lastChannels});
  for(const storage of [()=>local===undefined?globalThis.localStorage:local,()=>session===undefined?globalThis.sessionStorage:session])try{storage()?.setItem(NAVIGATION_CONFIG.prefix+state.user.id,value);}catch{/* One unavailable store must not disable the other. */}
}
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
