'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const url = 'data:text/javascript;base64,' + readFileSync(path.join(__dirname,'../public/participant-audio.js')).toString('base64');
const moduleUnderTest = () => import(url);
const storage = () => { const values=new Map();return {values,getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}; };
function fixture() {
  const nodes=[],streams=[];
  const node=kind=>{const item={kind,connections:[],disconnects:0,connect(to){this.connections.push(to);},disconnect(){this.disconnects++;this.connections=[];}};nodes.push(item);return item;};
  const context={state:'running',currentTime:1,destination:{kind:'physical-speakers'},createMediaStreamSource(stream){const source=node('source');source.stream=stream;return source;},createGain(){const gain=node('gain');gain.gain={value:1,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}};return gain;},createMediaStreamDestination(){const destination=node('destination'),track={stops:0,stop(){this.stops++;}};destination.stream={getTracks:()=>[track],getAudioTracks:()=>[track]};streams.push(destination.stream);return destination;},async resume(){this.state='running';},async close(){this.state='closed';}};
  const track={id:'input-track',kind:'audio',readyState:'live',stops:0,stop(){this.stops++;}};
  const stream={getAudioTracks:()=>[track]};const audio=()=>({volume:1,muted:false,dataset:{},srcObject:null,sinkId:'chosen-headphones'});
  return {context,nodes,streams,track,stream,audio};
}
test('participant settings persist per listener account and remote user, and mute keeps the previous volume',async()=>{
  const {ParticipantAudio,PARTICIPANT_AUDIO_CONFIG}=await moduleUnderTest(),local=storage();const controller=new ParticipantAudio({storage:local,contextFactory:()=>fixture().context});
  controller.attach('alice');controller.setVolume('loud-person',35);controller.setVolume('quiet-person',180);controller.setMuted('loud-person',true);controller.flush();
  assert.deepEqual(controller.get('loud-person'),{volume:35,muted:true});assert.equal(controller.get('quiet-person').volume,180);
  assert.ok(local.values.has(PARTICIPANT_AUDIO_CONFIG.storagePrefix+'alice'));controller.attach('bob');assert.equal(controller.get('loud-person').volume,100);
  controller.attach('alice');assert.deepEqual(controller.get('loud-person'),{volume:35,muted:true});controller.setMuted('loud-person',false);assert.equal(controller.get('loud-person').volume,35);controller.reset('loud-person');assert.deepEqual(controller.get('loud-person'),{volume:100,muted:false});controller.stop();
});
test('participant gains affect only their own stream and never bypass the selected HTML audio output',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),a=f.audio(),b=f.audio(),controller=new ParticipantAudio({contextFactory:()=>f.context});
  controller.setVolume('loud',25);controller.setVolume('quiet',180);
  controller.apply('socket-a','loud',f.stream,a);controller.apply('socket-b','quiet',f.stream,b);
  assert.equal(controller.entries.get('socket-a').gain.gain.value,.25);assert.equal(controller.entries.get('socket-b').gain.gain.value,1.8);assert.notEqual(a.srcObject,b.srcObject);assert.equal(a.sinkId,'chosen-headphones');assert.equal(b.sinkId,'chosen-headphones');
  for(const node of f.nodes)assert.equal(node.connections.includes(f.context.destination),false);
  controller.setVolume('loud',50);controller.apply('socket-a','loud',f.stream,a);assert.equal(controller.entries.get('socket-a').gain.gain.value,.5);assert.equal(controller.entries.get('socket-b').gain.gain.value,1.8);controller.stop();
});
test('deafen, moderation, blocking and output routing silence processed audio immediately, with stable elements',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),audio=f.audio(),controller=new ParticipantAudio({contextFactory:()=>f.context});controller.setVolume('person',60);
  controller.apply('peer','person',f.stream,audio);const output=audio.srcObject;assert.equal(audio.muted,false);
  controller.apply('peer','person',f.stream,audio,true);assert.equal(audio.muted,true);assert.equal(controller.entries.get('peer').gain.gain.value,0);assert.equal(audio.srcObject,output);
  controller.apply('peer','person',f.stream,audio,false);assert.equal(audio.muted,false);assert.equal(audio.srcObject,output);controller.setMuted('person',true);controller.apply('peer','person',f.stream,audio);assert.equal(audio.muted,true);controller.stop();
});
test('reconnects reuse the saved user volume and cleanup stops generated streams without stopping received tracks',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),controller=new ParticipantAudio({contextFactory:()=>f.context});controller.setVolume('person',40);controller.apply('old-peer','person',f.stream,f.audio());controller.retain(new Set());
  assert.equal(f.streams[0].getTracks()[0].stops,1);assert.equal(f.track.stops,0);controller.apply('new-peer','person',f.stream,f.audio());assert.equal(controller.entries.get('new-peer').gain.gain.value,.4);controller.stop();assert.equal(f.track.stops,0);
});
test('suspended gain playback stays silent until a user action resumes it',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture();f.context.state='suspended';const controller=new ParticipantAudio({contextFactory:()=>f.context}),audio=f.audio();controller.setVolume('person',50);
  assert.equal(controller.apply('peer','person',f.stream,audio),false);assert.equal(audio.muted,true);assert.equal(controller.blocked,true);await controller.unlock();controller.apply('peer','person',f.stream,audio);assert.equal(audio.muted,false);assert.equal(controller.blocked,false);controller.stop();
});
test('default volume keeps the native stream and malformed saved values cannot create unbounded gains',async()=>{
  const {ParticipantAudio,normalizedVolume}=await moduleUnderTest(),f=fixture(),controller=new ParticipantAudio({contextFactory:()=>f.context}),audio=f.audio();controller.apply('peer','person',f.stream,audio);assert.equal(audio.srcObject,f.stream);assert.equal(controller.entries.size,0);
  for(const value of [NaN,Infinity,{},undefined,'invalid'])assert.equal(normalizedVolume(value),100);assert.equal(normalizedVolume(-100),0);assert.equal(normalizedVolume(999999),200);assert.equal(normalizedVolume(0),0);controller.stop();
});
test('a failed amplification path stays silent and reports once while another native peer remains audible',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),errors=[],controller=new ParticipantAudio({contextFactory:()=>{throw new Error('Context unavailable');},onError:message=>errors.push(message)}),audio=f.audio(),other=f.audio();
  controller.setVolume('quiet',150);controller.apply('peer','quiet',f.stream,audio);controller.apply('peer','quiet',f.stream,audio);assert.equal(audio.muted,true);assert.equal(controller.blocked,true);assert.equal(errors.length,1);
  controller.apply('other','normal',f.stream,other);assert.equal(other.muted,false);controller.retain(new Set(['other']));assert.equal(controller.blocked,false);controller.stop();
});
test('replaced remote tracks dispose only the old processing graph and keep a zero-volume user silent',async()=>{
  const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),controller=new ParticipantAudio({contextFactory:()=>f.context}),audio=f.audio();controller.setVolume('person',50);controller.apply('peer','person',f.stream,audio);const previous=audio.srcObject;
  f.track.id='replacement-track';controller.setVolume('person',0);controller.apply('peer','person',f.stream,audio);assert.notEqual(audio.srcObject,previous);assert.equal(previous.getTracks()[0].stops,1);assert.equal(controller.entries.get('peer').gain.gain.value,0);assert.equal(audio.muted,true);assert.equal(f.track.stops,0);controller.stop();
});

test('saved amplification waits for a connecting peer track without a false volume error',async()=>{
 const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),errors=[],controller=new ParticipantAudio({contextFactory:()=>f.context,onError:message=>errors.push(message)}),audio=f.audio();let tracks=[];const stream={getAudioTracks:()=>tracks};
 controller.setVolume('person',200);controller.apply('peer','person',stream,audio);assert.equal(errors.length,0);assert.equal(controller.blocked,false);assert.equal(audio.muted,true);
 tracks=[f.track];controller.apply('peer','person',stream,audio);assert.equal(controller.entries.get('peer').gain.gain.value,2);assert.equal(audio.muted,false);controller.stop();
});

test('idle renders and repeated cleanup never rewrite unchanged participant preferences',async()=>{
 const {ParticipantAudio}=await moduleUnderTest();let writes=0;const controller=new ParticipantAudio({storage:{getItem:()=>null,setItem(){writes++;}}});controller.attach('listener');controller.stop();controller.stop();assert.equal(writes,0);
 controller.setVolume('person',40);controller.flush();controller.stop();controller.stop();assert.equal(writes,1);
});

test('an empty connecting stream is not attached until a live remote audio track arrives',async()=>{
 const {ParticipantAudio}=await moduleUnderTest(),f=fixture(),audio=f.audio(),controller=new ParticipantAudio({contextFactory:()=>f.context});let tracks=[];const stream={getAudioTracks:()=>tracks};
 controller.apply('peer','person',stream,audio);assert.equal(audio.srcObject,null);assert.equal(audio.muted,true);
 tracks=[f.track];controller.apply('peer','person',stream,audio);assert.equal(audio.srcObject,stream);assert.equal(audio.muted,false);assert.equal(audio.dataset.attempted,'false');controller.stop();
});
