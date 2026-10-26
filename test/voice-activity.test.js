'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const url='data:text/javascript;base64,'+readFileSync(path.join(__dirname,'../public/voice-activity.js')).toString('base64');
test('input analysis distinguishes silence from actual signal energy',async()=>{
 const {inputLevel}=await import(url);assert.equal(inputLevel(new Float32Array(10)),0);assert.equal(inputLevel([]),0);assert.ok(Math.abs(inputLevel(new Float32Array([.1,-.1,.1,-.1]))-.1)<.00001);
});
test('speaking follows actual samples, holds briefly through silence and respects mute without stopping tracks',async t=>{
 const {VoiceActivity,ACTIVITY_CONFIG}=await import(url);let now=0,value=.1,disconnected=0,closed=0,sources=0;
 const changes=[],track={id:'microphone',readyState:'live',enabled:true,muted:false},stream={getAudioTracks:()=>[track]};
 const node=()=>({connect(){},disconnect(){disconnected++;}}),context={state:'running',destination:{},createMediaStreamSource(){sources++;return node();},createGain(){return {...node(),gain:{value:1}};},createAnalyser(){return {...node(),fftSize:0,getFloatTimeDomainData:array=>array.fill(value)};},async close(){closed++;}};
 const activity=new VoiceActivity({contextFactory:()=>context,now:()=>now,onChange:(id,speaking,level)=>changes.push({id,speaking,level})});t.after(()=>activity.stop());
 activity.watch('self',stream);activity.sample();assert.equal(changes.at(-1).speaking,true);assert.ok(changes.at(-1).level>0);
 activity.watch('self',stream);assert.equal(sources,1);value=0;now+=100;activity.sample();assert.equal(changes.at(-1).speaking,true);
 now+=ACTIVITY_CONFIG.releaseMs;activity.sample();assert.equal(changes.at(-1).speaking,false);
 value=.1;activity.sample();assert.equal(changes.at(-1).speaking,true);activity.watch('self',stream,true);assert.equal(changes.at(-1).speaking,false);
 activity.retain(new Set());assert.equal(activity.entries.size,0);assert.equal(activity.timer,null);assert.equal(disconnected,3);assert.equal(track.readyState,'live');activity.stop();assert.equal(closed,1);
});
