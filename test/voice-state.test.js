'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../public'),urls=new Map();
function sourceUrl(name){if(urls.has(name))return urls.get(name);let code=fs.readFileSync(path.join(root,name),'utf8');for(const relative of new Set([...code.matchAll(/['"](.\/[^'"\n]+\.js)['"]/g)].map(match=>match[1])))code=code.split(`'${relative}'`).join(JSON.stringify(sourceUrl(path.posix.join(path.posix.dirname(name),relative)))).split(`"${relative}"`).join(JSON.stringify(sourceUrl(path.posix.join(path.posix.dirname(name),relative))));const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(name,url);return url;}
const member=(socketId,room='room',extra={})=>({socketId,userId:'u_'+socketId,conversationId:room,muted:false,deafened:false,stageSpeaker:true,canSpeak:true,...extra});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('late HTTP voice data preserves a newer room join and fresh unmute/deafen state',async()=>{
 const {VoiceSnapshots}=await import(sourceUrl('voice-state.js')),snapshots=new VoiceSnapshots(),ticket=snapshots.begin('listener'),main=member('main');
 snapshots.changed('room');const result=snapshots.merge(ticket,[member('friend'),{...main,muted:true,deafened:true}],[member('friend'),main]);assert.equal(result.find(p=>p.socketId==='main').muted,false);assert.equal(result.find(p=>p.socketId==='main').deafened,false);snapshots.finish(ticket);assert.equal(snapshots.pending.size,0);
});
test('a room emptied during a request stays empty while other rooms accept the snapshot',async()=>{
 const {VoiceSnapshots}=await import(sourceUrl('voice-state.js')),snapshots=new VoiceSnapshots(),ticket=snapshots.begin('listener');snapshots.changed('room');
 assert.deepEqual(snapshots.merge(ticket,[member('left'),member('other','another')],[]),[member('other','another')]);snapshots.finish(ticket);
});
test('new live membership cannot restore access removed by the current authorized workspace',async()=>{
 const {VoiceSnapshots}=await import(sourceUrl('voice-state.js')),snapshots=new VoiceSnapshots(),ticket=snapshots.begin('listener');snapshots.changed('private-room');assert.deepEqual(snapshots.merge(ticket,[],[member('main','private-room')],new Set(['room'])),[]);snapshots.finish(ticket);
});
test('older concurrent snapshots and previous account generations cannot replace a newer result',async()=>{
 const {VoiceSnapshots}=await import(sourceUrl('voice-state.js')),snapshots=new VoiceSnapshots(),old=snapshots.begin('first'),current=snapshots.begin('first');assert.deepEqual(snapshots.merge(current,[member('current')],[]),[member('current')]);assert.equal(snapshots.merge(old,[member('stale')],[]),null);snapshots.finish(old);snapshots.finish(current);
 const beforeReset=snapshots.begin('first');snapshots.reset();assert.equal(snapshots.current(beforeReset),false);assert.equal(snapshots.merge(beforeReset,[member('stale')],[]),null);assert.equal(snapshots.pending.size,0);
});
async function appFixture(t){
 const {VoiceSnapshots}=await import(sourceUrl('voice-state.js')),{NexusMediaView}=await import(sourceUrl('media-view.js')),{ParticipantAudio}=await import(sourceUrl('participant-audio.js'));
 const original=new Map(['document','CSS'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),elements=[];
 const document={createElement:()=>({dataset:{},muted:true,volume:1,srcObject:null,isConnected:true,plays:0,setAttribute(){},async play(){this.plays++;this.paused=false;},remove(){this.isConnected=false;}})};
 for(const [key,value] of Object.entries({document,CSS:{escape:value=>value}}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>{for(const [key,descriptor] of original)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const channel={id:'room',name:'Voice',type:'voice'},server={id:'server',channels:[channel]},friend=member('friend'),main=member('main'),secondary=member('secondary','room',{muted:true});
 const track={id:'main-audio',kind:'audio',readyState:'live',enabled:true,stops:0,stop(){this.stops++;}},stream={getAudioTracks:()=>[track]};
 const state={user:{id:'u_friend'},servers:[server],dms:[],lastChannels:{},activeConv:'room',view:'voice',voice:[friend],blockedIds:[],audioBlocked:false};
 const call={active:{conversationId:'room'},joining:false,localStream:null,peers:new Map([['main',{stream}]]),deafened:false};
 const media={querySelector:selector=>elements.find(audio=>audio.isConnected&&selector.includes(`"${audio.dataset.audioPeer}"`)),querySelectorAll:()=>elements.filter(audio=>audio.isConnected),append:audio=>elements.push(audio),replaceChildren(){elements.length=0;}};
 const view=Object.create(NexusMediaView.prototype);Object.assign(view,{getState:()=>state,getCall:()=>call,getSocketId:()=>'friend',getRoot:()=>({querySelectorAll:()=>[]}),getMediaRoot:()=>media,onPlaybackBlocked:value=>{state.audioBlocked=value;},activity:{watch(){},retain(){},stop(){}},audio:new ParticipantAudio({contextFactory:()=>null}),output:{route:()=>true},update(){return true;}});
 let release,reject;const response=new Promise((resolve,no)=>{release=resolve;reject=no;});const voiceSnapshots=new VoiceSnapshots();
 const context=vm.createContext({state,call,voiceSnapshots,workspaceQueue:Promise.resolve(),preferences:{},request:()=>response,UI:{activeConversation:()=>channel,currentServer:()=>server},validChannelHistory:()=>({}),preferenceSync:{attach(){}},mediaView:view,renderChrome(){},renderCall:()=>view.bind(),renderMain(){},rememberView(){},socket:{id:'friend'},sounds:{play(){},stopRing(){}},incomingCall:null,modalType:null});
 // Execute the production response and voice-event handlers, not an alternate merge flow.
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8'),refresh=app.slice(app.indexOf('function refreshWorkspace() {'),app.indexOf('async function loadWorkspace()')),receive=app.slice(app.indexOf('function receiveVoiceState('),app.indexOf('function shouldSound('));vm.runInContext(refresh+'\n'+receive+'\nthis.refresh=refreshWorkspace;this.receive=receiveVoiceState;',context);
 const snapshot=voice=>({user:{id:'u_friend'},servers:[server],dms:[],voice});return {state,call,view,track,elements,friend,main,secondary,context,voiceSnapshots,release,reject,snapshot};
}
test('the production late-bootstrap sequence keeps the main account audible without a third participant',async t=>{
 const f=await appFixture(t),loading=f.context.refresh();await turn();f.context.receive({conversationId:'room',participants:[f.friend,f.main]});await turn();const player=f.elements.find(a=>a.dataset.audioPeer==='main');assert.equal(player.muted,false);assert.equal(player.plays,1);
 f.release(f.snapshot([f.friend,{...f.main,muted:true,deafened:true}]));await loading;assert.equal(f.state.voice.find(p=>p.socketId==='main').muted,false);assert.equal(player.muted,false);assert.equal(player.plays,1);assert.equal(f.voiceSnapshots.pending.size,0);
 f.call.peers.set('secondary',{stream:{getAudioTracks:()=>[f.track]}});f.context.receive({conversationId:'room',participants:[f.friend,f.main,f.secondary]});assert.equal(f.elements.find(a=>a.dataset.audioPeer==='main'),player);assert.equal(player.muted,false);assert.equal(f.elements.find(a=>a.dataset.audioPeer==='secondary').muted,true);assert.equal(f.track.stops,0);
});
test('an HTTP-only roster completion binds audio immediately instead of waiting for another room event',async t=>{
 const f=await appFixture(t);f.view.bind();const player=f.elements[0];assert.equal(player.muted,true);const loading=f.context.refresh();await turn();f.release(f.snapshot([f.friend,f.main]));await loading;await turn();assert.equal(player.muted,false);assert.equal(player.plays,1);
});
test('the first authenticated bootstrap hydrates the account before local user state exists',async t=>{
 const f=await appFixture(t);f.state.user=null;const loading=f.context.refresh();await turn();f.release(f.snapshot([f.friend,f.main]));await loading;assert.equal(f.state.user?.id,'u_friend');assert.equal(f.state.voice.length,2);assert.equal(f.voiceSnapshots.pending.size,0);
});
test('an authenticated response for a different account cannot replace the active account',async t=>{
 const f=await appFixture(t),loading=f.context.refresh();await turn();f.release({...f.snapshot([f.friend,f.main]),user:{id:'another-account'}});await loading;assert.equal(f.state.user.id,'u_friend');assert.equal(f.state.voice.length,1);assert.equal(f.voiceSnapshots.pending.size,0);
});
test('resetting the initial load invalidates a pending response even before an account is attached',async t=>{
 const f=await appFixture(t);f.state.user=null;const loading=f.context.refresh();await turn();f.voiceSnapshots.reset();f.release(f.snapshot([f.friend,f.main]));await loading;assert.equal(f.state.user,null);assert.equal(f.state.voice.length,1);assert.equal(f.voiceSnapshots.pending.size,0);
});
test('a late response from the previous account is discarded and pending guards are released on errors',async t=>{
 const f=await appFixture(t),loading=f.context.refresh();await turn();f.state.user={id:'another-account'};f.voiceSnapshots.reset();f.release(f.snapshot([f.friend,f.main]));await loading;assert.equal(f.state.user.id,'another-account');assert.equal(f.state.voice.length,1);assert.equal(f.voiceSnapshots.pending.size,0);
});
test('failed bootstrap requests do not leave voice guards behind',async t=>{
 const f=await appFixture(t),loading=f.context.refresh();await turn();f.reject(new Error('Offline fixture'));await assert.rejects(loading,/Offline fixture/);assert.equal(f.voiceSnapshots.pending.size,0);
});
