import { CONFIG } from './config.js';

// Preview uses existing call tracks only; it never captures, joins or owns a track.
export const CALL_PREVIEW_CONFIG = Object.freeze({ readyState:2, kinds:Object.freeze(['screen','camera']) });
export function callPreviewSources(state, call, socketId = state.socketId) {
  if(!state.user || !call.active)return [];
  const sources=[];
  for(const kind of CALL_PREVIEW_CONFIG.kinds) {
    const people=(state.voice||[]).filter(person=>person.conversationId===call.active.conversationId && !state.blockedIds?.includes(person.userId));
    people.sort((a,b)=>Number(a.socketId===socketId)-Number(b.socketId===socketId));
    for(const person of people) {
      if(!(kind==='screen'?person.sharing:person.camera))continue;
      const local=person.socketId===socketId,peer=call.peers?.get(person.socketId);
      const stream=local ? kind==='screen'?call.screenStream:call.cameraStream||call.localStream : kind==='screen'?peer?.screenStream:peer?.cameraStream;
      const track=stream?.getVideoTracks().find(track=>track.readyState==='live');if(!track)continue;
      const user=state.users.find(user=>user.id===person.userId);
      sources.push({key:`${person.socketId}:${kind}`,kind,stream,track,userId:person.userId,name:user?.displayName||'Nexus user',local});
    }
  }
  return sources;
}
export function placeCallDock({ dock, app, sidebar, userBar, width }) {
  if(!dock || !app || !sidebar || !userBar)return;
  if(width>CONFIG.mobileBreakpoint) {
    if(dock.parentElement!==sidebar || dock.nextElementSibling!==userBar)sidebar.insertBefore(dock,userBar);
  } else if(dock.parentElement!==app)app.append(dock);
}
export class CallPreview {
  constructor({ getState, getCall, getSocketId, getRoot, onChange = () => {} }) {
    Object.assign(this,{getState,getCall,getSocketId,getRoot,onChange});
    this.video=null;this.caption=null;this.open=null;this.callId=null;this.currentKey=null;this.selectedKey=null;this.currentStream=null;this.watched=new Map();
  }
  sources() { return callPreviewSources(this.getState(),this.getCall(),this.getSocketId()); }
  mount(root) {
    const doc=root.ownerDocument;
    this.open=doc.createElement('button');this.open.type='button';this.open.className='call-preview-open';this.open.dataset.action='return-to-call';
    this.video=doc.createElement('video');this.video.autoplay=true;this.video.playsInline=true;this.video.muted=true;this.video.defaultMuted=true;this.video.disablePictureInPicture=true;this.video.setAttribute('playsinline','');this.video.setAttribute('aria-hidden','true');
    this.caption=doc.createElement('span');this.caption.className='call-preview-caption';this.open.append(this.video,this.caption);root.replaceChildren(this.open);
    this.video.addEventListener('loadeddata',()=>this.ready());
  }
  ready() {
    this.getRoot()?.classList.toggle('is-ready',Boolean(this.currentStream && this.video?.srcObject===this.currentStream && this.video.readyState>=CALL_PREVIEW_CONFIG.readyState));
  }
  watch(sources) {
    const tracks=new Set(sources.map(source=>source.track));
    for(const [track,changed] of this.watched)if(!tracks.has(track)){for(const event of ['ended','mute','unmute'])track.removeEventListener?.(event,changed);this.watched.delete(track);}
    for(const track of tracks)if(!this.watched.has(track)){const changed=()=>this.onChange();for(const event of ['ended','mute','unmute'])track.addEventListener?.(event,changed);this.watched.set(track,changed);}
  }
  clear() {
    this.watch([]);this.currentKey=null;this.currentStream=null;
    if(this.video){this.video.pause();this.video.srcObject=null;}
    const root=this.getRoot();if(root){root.hidden=true;root.classList.remove('is-ready','is-paused');}
  }
  update(visible, sources = this.sources()) {
    const root=this.getRoot(),id=this.getCall().active?.conversationId||null;
    if(this.callId!==id){this.callId=id;this.selectedKey=null;}
    if(!visible || !root || !sources.length){this.clear();return false;}
    const source=sources.find(source=>source.key===this.selectedKey)||sources[0];
    if(!this.video || this.open.parentElement!==root)this.mount(root);
    this.watch(sources);root.hidden=false;root.classList.toggle('is-paused',Boolean(source.track.muted));
    this.currentKey=source.key;this.currentStream=source.stream;
    const label=`${source.name} · ${source.kind==='screen'?'Screen sharing':'Camera'}`;
    if(this.caption.textContent!==label)this.caption.textContent=label;
    this.open.setAttribute('aria-label',`Return to call · ${label}`);this.open.title=`Return to call · ${label}`;
    if(this.video.srcObject!==source.stream){this.video.srcObject=source.stream;this.video.play().catch(()=>{});}
    else if(this.video.paused)this.video.play().catch(()=>{});
    this.ready();return true;
  }
  next() {
    const sources=this.sources();if(!sources.length)return;
    const at=Math.max(0,sources.findIndex(source=>source.key===this.currentKey));this.selectedKey=sources[(at+1)%sources.length].key;
  }
}
