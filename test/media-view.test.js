'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const urls=new Map();
function source(name){
 if(urls.has(name))return urls.get(name);let code=fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
 for(const relative of new Set([...code.matchAll(/['"](.\/[^'"\n]+\.js)['"]/g)].map(match=>match[1])))code=code.split(`'${relative}'`).join(JSON.stringify(source(path.posix.join(path.posix.dirname(name),relative)))).split(`"${relative}"`).join(JSON.stringify(source(path.posix.join(path.posix.dirname(name),relative))));
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64');urls.set(name,url);return url;
}
test('remote audio starts on track arrival and each mute/deafen/block gate stays independent of other arrivals',async t=>{
 const {NexusMediaView}=await import(source('media-view.js')),{ParticipantAudio}=await import(source('participant-audio.js'));
 const originals=new Map(['document','CSS'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries({CSS:{escape:value=>value},document:{createElement:()=>({dataset:{},muted:true,volume:1,srcObject:null,isConnected:true,plays:0,setAttribute(){},async play(){this.plays++;this.paused=false;},remove(){this.isConnected=false;}})}}))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 t.after(()=>{for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const elements=[],media={querySelector:selector=>elements.find(audio=>selector.includes(`"${audio.dataset.audioPeer}"`)),querySelectorAll:()=>elements,append:audio=>elements.push(audio),replaceChildren(){elements.length=0;}};
 const track={id:'live-audio',kind:'audio',readyState:'live',enabled:true,stops:0,stop(){this.stops++;}};let tracks=[];
 const stream={getAudioTracks:()=>tracks},otherStream={getAudioTracks:()=>[track]},people=[{socketId:'one',userId:'u_one',conversationId:'room',muted:false},{socketId:'two',userId:'u_two',conversationId:'room',muted:true}];
 const state={voice:people,blockedIds:[],audioBlocked:false},call={active:{conversationId:'room'},localStream:null,peers:new Map([['one',{stream}],['two',{stream:otherStream}]]),deafened:false};
 const view=Object.create(NexusMediaView.prototype);Object.assign(view,{getState:()=>state,getCall:()=>call,getSocketId:()=>'self',getRoot:()=>({querySelectorAll:()=>[]}),getMediaRoot:()=>media,onPlaybackBlocked:value=>{state.audioBlocked=value;},activity:{watch(){},retain(){},stop(){}},audio:new ParticipantAudio({contextFactory:()=>null}),output:{route:()=>true}});
 view.bind();const one=elements.find(a=>a.dataset.audioPeer==='one'),two=elements.find(a=>a.dataset.audioPeer==='two');assert.equal(one.srcObject,null);assert.equal(one.plays,0);assert.equal(two.muted,true);
 tracks=[track];view.bind();await Promise.resolve();assert.equal(one.srcObject,stream);assert.equal(one.plays,1);assert.equal(one.muted,false);assert.equal(two.muted,true);
 people.push({socketId:'three',userId:'u_three',conversationId:'room',muted:true});call.peers.set('three',{stream:otherStream});view.bind();assert.equal(elements.find(a=>a.dataset.audioPeer==='one'),one);assert.equal(one.plays,1);assert.equal(one.muted,false);
 call.deafened=true;view.bind();assert.ok(elements.every(a=>a.muted));call.deafened=false;people[1].muted=false;people[1].deafened=true;view.bind();assert.equal(one.muted,false);assert.equal(two.muted,true);
 state.blockedIds=['u_one'];people[1].deafened=false;view.bind();assert.equal(one.muted,true);assert.equal(two.muted,false);
 people[1].canSpeak=false;view.bind();assert.equal(two.muted,true);call.active=null;view.bind();assert.equal(elements.length,0);assert.equal(track.stops,0);
});
