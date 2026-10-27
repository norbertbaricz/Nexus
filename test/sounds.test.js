'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Test the production browser module with a deterministic audio device substitute.
const moduleUrl = 'data:text/javascript;base64,' + readFileSync(path.join(__dirname, '../public/sounds.js')).toString('base64');
function audioDevice() {
  const notes = [], levels = [];
  const context = { state: 'suspended', currentTime: 1, destination: {},
    async resume() { this.state = 'running'; },
    createGain() { return { gain: { setValueAtTime(value) { levels.push(value); }, linearRampToValueAtTime(value) { levels.push(value); } }, connect() {}, disconnect() {} }; },
    createOscillator() {
      const note = { frequency: { setValueAtTime(value) { note.frequencyValue = value; } },
        connect() {}, disconnect() {}, start(time) { note.startTime = time; },
        stop(time) { note.stopTime = time; if (time === undefined) note.cancelled = true; } };
      notes.push(note); return note;
    },
  };
  return { context, notes, levels };
}
async function fixture() {
  const { NexusSounds } = await import(moduleUrl);
  const device = audioDevice();
  const settings = { sounds: true, soundVolume: 50 };
  let quiet = false, clock = 1000, ringCallback = null, cancelled = false;
  const engine = new NexusSounds({ getSettings: () => settings, isQuiet: () => quiet,
    createContext: () => device.context, now: () => clock,
    schedule: callback => { ringCallback = callback; return 7; }, cancel: () => { cancelled = true; },
  });
  return { engine, settings, ...device, setQuiet: value => { quiet = value; },
    advance: () => { clock += 2000; }, tickRing: () => ringCallback(), cancelled: () => cancelled };
}
test('sounds wait for a user-unlocked audio device and schedule audible, fading notes', async () => {
  const f = await fixture();
  assert.equal(f.engine.play('message'), false); assert.equal(f.notes.length, 0);
  assert.equal(await f.engine.unlock(), true); assert.equal(f.engine.play('message'), true);
  assert.ok(f.notes.length > 0); assert.ok(f.notes.every(note => note.frequencyValue > 0 && note.stopTime > note.startTime));
  assert.ok(f.levels.some(value => value > 0)); assert.equal(f.levels.at(-1), 0);
  const count = f.notes.length;
  assert.equal(f.engine.play('message'), false); assert.equal(f.notes.length, count);
});
test('sound preferences, zero volume and do-not-disturb silence incoming cues', async () => {
  const f = await fixture(); await f.engine.unlock();
  f.settings.sounds = false; assert.equal(f.engine.play('message'), false);
  f.settings.sounds = true; f.settings.soundVolume = 0; assert.equal(f.engine.play('message'), false);
  f.settings.soundVolume = 50; f.setQuiet(true); assert.equal(f.engine.play('message'), false);
  assert.equal(f.engine.play('message', { preview: true }), false);
  assert.equal(f.engine.play('unknown'), false);
});
test('incoming call audio repeats and stops immediately when the call closes', async () => {
  const f = await fixture(); await f.engine.unlock(); f.engine.startRing();
  const initial = f.notes.length; assert.ok(initial > 0);
  f.advance(); f.tickRing(); assert.ok(f.notes.length > initial);
  f.engine.stopRing(); assert.equal(f.cancelled(), true); assert.equal(f.engine.ringing, false);
  assert.ok(f.notes.every(note => note.cancelled));
});
test('unsupported browser audio fails gracefully without blocking the interface', async () => {
  const { NexusSounds } = await import(moduleUrl);
  const engine = new NexusSounds({ getSettings: () => ({ sounds: true, soundVolume: 45 }), createContext: () => null });
  assert.equal(await engine.unlock(), false); assert.equal(engine.play('message'), false);
  engine.stopAll();
});

test('control feedback unlocks audio before a call and can confirm deafen without silencing DND or master preferences',async()=>{
 const {NexusSounds}=await import(moduleUrl),device=audioDevice(),settings={sounds:true,soundVolume:45};let deafened=false,dnd=false,clock=1000;
 const engine=new NexusSounds({getSettings:()=>settings,isQuiet:()=>deafened||dnd,isFeedbackQuiet:()=>dnd,createContext:()=>device.context,now:()=>clock});
 assert.equal(await engine.feedback('mute'),true);assert.equal(device.context.state,'running');assert.equal(device.notes[0].frequencyValue,220);
 clock+=100;deafened=true;assert.equal(engine.play('message'),false);assert.equal(await engine.feedback('deafen'),true);assert.equal(device.notes[0].cancelled,true);assert.equal(engine.feedbackNotes.size,2);
 clock+=100;const count=device.notes.length;dnd=true;assert.equal(await engine.feedback('undeafen'),false);assert.equal(device.notes.length,count);
 dnd=false;settings.sounds=false;assert.equal(await engine.feedback('unmute'),false);settings.sounds=true;settings.soundVolume=0;assert.equal(await engine.feedback('unmute'),false);assert.equal(device.notes.length,count);
 settings.soundVolume=45;clock+=100;assert.equal(await engine.feedback('undeafen'),true);assert.ok(device.levels.some(value=>value>0));
});
test('a later tap supersedes pending feedback and stopping sounds cancels a delayed unlock',async()=>{
 const {NexusSounds}=await import(moduleUrl),device=audioDevice(),resumes=[];device.context.resume=()=>new Promise(resolve=>resumes.push(resolve));
 const engine=new NexusSounds({getSettings:()=>({sounds:true,soundVolume:45}),createContext:()=>device.context});
 const first=engine.feedback('mute'),last=engine.feedback('unmute');device.context.state='running';resumes.splice(0).forEach(resolve=>resolve());
 assert.equal(await first,false);assert.equal(await last,true);assert.equal(device.notes.length,1);assert.equal(device.notes[0].frequencyValue,329.63);
 device.context.state='suspended';const pending=engine.feedback('deafen');engine.stopAll();device.context.state='running';resumes.splice(0).forEach(resolve=>resolve());assert.equal(await pending,false);assert.equal(device.notes.length,1);
});
