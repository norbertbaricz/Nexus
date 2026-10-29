'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source='data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../public/participant-audio.js')).toString('base64');
const turn=()=>new Promise(resolve=>setImmediate(resolve));

// Model a receiver whose Web Audio samples depend on a running raw-stream player.
// Local oscillator streams do not have this WebRTC playout dependency.
function receiverFixture(){
 const elements=[],track={id:'received-audio',kind:'audio',readyState:'live',stops:0,stop(){this.stops++;}},stream={getAudioTracks:()=>[track],energy:()=>.04};
 const createElement=()=>{const audio={dataset:{},volume:1,muted:true,defaultMuted:false,srcObject:null,readyState:4,paused:true,plays:0,pauses:0,setAttribute(){},addEventListener(){},removeEventListener(){},play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.pauses++;this.paused=true;},remove(){}};elements.push(audio);return audio;};
 const node=()=>({connect(to){to.input=this;},disconnect(){}}),context={state:'running',currentTime:0,destination:{physical:true},createMediaStreamSource(input){return {...node(),energy:()=>elements.some(audio=>audio.srcObject===input&&!audio.paused)?input.energy():0};},createGain(){const gain=node();gain.gain={value:1,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}};gain.energy=()=>gain.input.energy()*gain.gain.value;return gain;},createMediaStreamDestination(){const destination=node(),generated={stops:0,stop(){this.stops++;}};destination.stream={getTracks:()=>[generated],getAudioTracks:()=>[generated],energy:()=>destination.input.energy()};return destination;},async resume(){this.state='running';},async close(){this.state='closed';}};
 const audio=createElement();audio.srcObject=stream;audio.muted=false;audio.play();return{elements,track,stream,createElement,context,audio};
}

test('crossing 100% preserves a live WebRTC playout driver and delivers amplified samples without another participant',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement});
 for(const volume of [100,101,126,150,200,100,35,150]){controller.setVolume('main',volume);controller.apply('peer','main',f.stream,f.audio);await turn();controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.muted,false);assert.ok(Math.abs(f.audio.srcObject.energy()*f.audio.volume-.04*volume/100)<1e-8,`${volume}% must retain real receiver samples`);}
 controller.stop();assert.equal(f.track.stops,0);
});

test('unavailable amplification preserves native 100% playback while all external silence gates still apply',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),messages=[],controller=new ParticipantAudio({contextFactory:()=>{throw Error('No processing context');},createElement:f.createElement,onError:message=>messages.push(message)});
 controller.setVolume('main',150);controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(f.audio.volume,1);assert.equal(controller.blocked,false);assert.equal(controller.get('main').volume,150);
 controller.apply('peer','main',f.stream,f.audio);assert.equal(messages.length,1);controller.apply('peer','main',f.stream,f.audio,true);assert.equal(f.audio.muted,true);controller.setMuted('main',true);controller.apply('peer','main',f.stream,f.audio,false);assert.equal(f.audio.muted,true);controller.reset('main');controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.muted,false);controller.stop();
});

test('the receive driver stays muted at zero volume and never connects to physical speakers',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement});f.audio.sinkId='chosen-headphones';
 controller.setVolume('main',126);controller.apply('peer','main',f.stream,f.audio);await turn();controller.apply('peer','main',f.stream,f.audio);const entry=controller.entries.get('peer');
 assert.equal(entry.input.srcObject,f.stream);assert.equal(entry.input.muted,true);assert.equal(entry.input.defaultMuted,true);assert.equal(entry.input.volume,0);assert.equal(entry.input.paused,false);assert.equal(f.audio.sinkId,'chosen-headphones');assert.equal(entry.gain.input,entry.source);assert.equal(entry.destination.input,entry.gain);assert.equal(f.context.destination.input,undefined);
 controller.reset('main');controller.apply('peer','main',f.stream,f.audio);assert.equal(entry.input.paused,true);assert.equal(entry.input.srcObject,null);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(entry.destination.stream.getTracks()[0].stops,1);assert.equal(f.track.stops,0);controller.stop();
});

test('a pending input cannot resurrect its graph or callback after Reset or switching listener accounts',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture();let release,notifications=0,input;
 const controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:()=>{input=f.createElement();input.readyState=0;input.play=()=>{input.paused=false;return new Promise(resolve=>{release=resolve;});};return input;},onReady:()=>{notifications++;}});
 controller.attach('listener');controller.setVolume('main',150);controller.apply('peer','main',f.stream,f.audio);const old=controller.entries.get('peer');assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);
 controller.reset('main');controller.apply('peer','main',f.stream,f.audio);controller.attach('another-listener');release();await turn();assert.equal(notifications,0);assert.equal(controller.entries.size,0);assert.equal(input.srcObject,null);assert.equal(input.paused,true);assert.equal(old.destination.stream.getTracks()[0].stops,1);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.track.stops,0);controller.stop();
});

test('suspended amplification keeps speech at unity and resumes the saved boost without a reconnect',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),messages=[],controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement,onError:message=>messages.push(message)});f.context.state='suspended';controller.setVolume('main',175);controller.apply('peer','main',f.stream,f.audio);await turn();
 assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(controller.blocked,false);assert.equal(controller.get('main').volume,175);
 await controller.unlock();controller.apply('peer','main',f.stream,f.audio);assert.ok(Math.abs(f.audio.srcObject.energy()-.07)<1e-8);assert.equal(f.audio.muted,false);
 f.context.state='interrupted';controller.apply('peer','main',f.stream,f.audio);controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(messages.length,1);controller.stop();
});

test('a failed input start retains native speech and one later user action retries only that input',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),messages=[];let input;
 const controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:()=>{input=f.createElement();input.readyState=0;input.play=()=>Promise.reject(new Error('Autoplay unavailable'));return input;},onError:message=>messages.push(message)});
 controller.setVolume('main',150);controller.apply('peer','main',f.stream,f.audio);await turn();controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(messages.length,1);
 for(let i=0;i<10;i++)controller.apply('peer','main',f.stream,f.audio);assert.equal(messages.length,1);
 input.readyState=4;input.play=()=>{input.paused=false;return Promise.resolve();};await controller.unlock();controller.apply('peer','main',f.stream,f.audio);assert.ok(Math.abs(f.audio.srcObject.energy()-.06)<1e-8);assert.equal(controller.entries.size,1);controller.stop();
});

test('per-person amplification, zero, local mute and native fallback never affect another person',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),otherStream={getAudioTracks:()=>[f.track],energy:()=>.02},other=f.createElement(),controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement});other.srcObject=otherStream;other.muted=false;other.play();
 controller.setVolume('main',150);controller.setVolume('other',50);controller.apply('a','main',f.stream,f.audio);controller.apply('b','other',otherStream,other);await turn();controller.apply('a','main',f.stream,f.audio);assert.equal(other.volume,.5);assert.equal(other.muted,false);assert.equal(other.srcObject,otherStream);
 controller.setMuted('main',true);controller.apply('a','main',f.stream,f.audio);assert.equal(f.audio.muted,true);assert.equal(other.muted,false);controller.reset('main');controller.apply('a','main',f.stream,f.audio);assert.equal(f.audio.muted,false);assert.equal(other.volume,.5);assert.equal(controller.get('other').volume,50);controller.stop();
});

test('external restrictions keep both processed and fallback playback silent at every boost level',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement});
 for(const level of [101,126,150,200]){controller.setVolume('main',level);controller.apply('peer','main',f.stream,f.audio,true);await turn();controller.apply('peer','main',f.stream,f.audio,true);const entry=controller.entries.get('peer');assert.equal(f.audio.muted,true);assert.equal(entry.input.muted,true);assert.equal(entry.level,0);f.context.state='interrupted';controller.apply('peer','main',f.stream,f.audio,true);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,true);f.context.state='running';}
 controller.stop();assert.equal(f.track.stops,0);
});

test('a rejected processed output falls back to the received stream and a user action retries the boost',async()=>{
 const {ParticipantAudio}=await import(source),f=receiverFixture(),messages=[],controller=new ParticipantAudio({contextFactory:()=>f.context,createElement:f.createElement,onError:message=>messages.push(message)});
 controller.setVolume('main',150);controller.apply('peer','main',f.stream,f.audio);await turn();controller.apply('peer','main',f.stream,f.audio);const processed=f.audio.srcObject;
 assert.equal(controller.outputFailed('peer',f.audio,processed),true);controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.srcObject,f.stream);assert.equal(f.audio.muted,false);assert.equal(controller.blocked,false);assert.equal(messages.length,1);
 assert.equal(controller.outputFailed('peer',f.audio,f.stream),false);await controller.unlock();controller.apply('peer','main',f.stream,f.audio);assert.equal(f.audio.srcObject,processed);assert.ok(f.audio.srcObject.energy()>f.stream.energy());controller.stop();
});

test('a late context unlock cannot warn or rebind a different listener account',async()=>{
 const {ParticipantAudio}=await import(source),first=receiverFixture(),second=receiverFixture();let selected=first,release,notifications=0;const messages=[];
 first.context.state='suspended';first.context.resume=()=>new Promise(resolve=>{release=resolve;});
 const controller=new ParticipantAudio({contextFactory:()=>selected.context,createElement:()=>selected.createElement(),onReady:()=>{notifications++;},onError:message=>messages.push(message)});
 controller.attach('first-listener');controller.setVolume('main',150);controller.apply('a','main',first.stream,first.audio);const unlocking=controller.unlock();
 controller.attach('second-listener');selected=second;controller.setVolume('other',175);controller.apply('b','other',second.stream,second.audio);await turn();const before=notifications;
 release();assert.equal(await unlocking,false);await turn();assert.equal(notifications,before);assert.equal(messages.length,0);assert.equal(controller.context,second.context);assert.equal(controller.get('main').volume,100);assert.equal(controller.get('other').volume,175);assert.equal(controller.entries.size,1);controller.stop();
});
