'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {mentionTokens,markSpoilers}=require('../server/message-content');
const {normalizePreferences}=require('../server/preferences');
const CONFIG_URL='data:text/javascript;base64,'+readFileSync(path.join(__dirname,'../public/config.js')).toString('base64');
async function browserModule(name){const source=readFileSync(path.join(__dirname,'../public',name),'utf8').replace("'./config.js'",JSON.stringify(CONFIG_URL));return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));}
function replaceGlobal(t,key,value){const original=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>{if(original)Object.defineProperty(globalThis,key,original);else delete globalThis[key];});}

test('Markdown formats messages without interpreting raw HTML, executable links or code mentions',async()=>{
 const {markdown}=await browserModule('message-format.js');
 const html=markdown('# Large\n##Medium\n### Small\n\n**Bold** and *italic* and __underline__ and ~~old~~.\n- One\n- Two\n> A quote\n```js\n<img onerror=alert(1)> @everyone\n```');
 for(const tag of ['h1','h2','h3','strong','em','u','s','ul','li','blockquote','pre','code'])assert.ok(html.includes('<'+tag),tag);
 assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);
 const dangerous=markdown('<script>bad()</script> [x](javascript:alert(1)) [safe](https://example.com/a?q="bad")');
 assert.ok(!dangerous.includes('<script'));assert.ok(!dangerous.includes('href="javascript:'));assert.ok(!dangerous.includes('onerror='));assert.match(dangerous,/rel="noopener noreferrer"/);
 let called=0;const formatted=markdown('`@everyone` @alex **safe**',{resolveMention:name=>{called++;return {id:'u_safe',label:name};}});assert.equal(called,1);assert.match(formatted,/<code>@everyone<\/code>/);
 assert.doesNotThrow(()=>markdown('*'.repeat(8000)));assert.doesNotThrow(()=>markdown('['.repeat(8000)));
});
test('mention parsing ignores escaped mentions and code; spoiler metadata accepts only attached files',()=>{
 assert.deepEqual([...mentionTokens('@everyone @here @alex `@nobody` \\@escaped\n```\n@hidden\n```')],['everyone','here','alex']);
 assert.deepEqual([...mentionTokens('**@everyone** #@here')],['everyone','here']);
 const files=[{id:'image',type:'image/png'},{id:'document',type:'application/octet-stream'}];
 assert.equal(markSpoilers(files,['image'],4)[0].spoiler,true);assert.equal(files[0].spoiler,undefined);
 assert.equal(markSpoilers(files,['document'],4)[1].spoiler,true);
 for(const value of [['missing'],['image','image'],true])assert.throws(()=>markSpoilers(files,value,4),/valid attachment/);
 assert.deepEqual(normalizePreferences({palette:'blue',soundVolume:0,motion:false}),{palette:'blue',soundVolume:0,motion:false});
 for(const patch of [{palette:'unknown'},{soundVolume:101},{sounds:'yes'},{sidebarLeft:500},{userId:'other'}])assert.throws(()=>normalizePreferences(patch),/valid account/);
});
test('pin navigation remains in history mode through native scroll events and later image resizing',async t=>{
 const {ChatScroll}=await browserModule('chat-scroll.js');let follow=true,historyWindow=true,clock=0,nextId=0;const frames=new Map();
 replaceGlobal(t,'requestAnimationFrame',callback=>{frames.set(++nextId,callback);return nextId;});replaceGlobal(t,'cancelAnimationFrame',id=>frames.delete(id));t.mock.method(performance,'now',()=>clock);
 const node=new EventTarget();Object.assign(node,{scrollTop:800,scrollHeight:1000,clientHeight:200,isConnected:true,querySelector:()=>null,getBoundingClientRect:()=>({top:0,height:200})});
 const target={isConnected:true,getBoundingClientRect:()=>({top:600-node.scrollTop,height:40})};
 const scroll=new ChatScroll({getFollow:()=>follow,setFollow:value=>{follow=value;},getHistory:()=>historyWindow,motion:()=>true,onChange:()=>{}});scroll.bind(node);scroll.jump(target);
 node.dispatchEvent(new Event('scroll'));assert.equal(follow,false);
 clock=480;const current=[...frames.values()];frames.clear();current.forEach(callback=>callback(clock));assert.equal(Math.round(node.scrollTop),520);assert.equal(follow,false);
 node.scrollHeight=1400;scroll.resize();assert.equal(Math.round(node.scrollTop),520);assert.equal(follow,false);
 scroll.bottom({smooth:true});assert.equal(node.scrollTop,520);clock+=240;const middle=[...frames.values()];frames.clear();middle.forEach(callback=>callback(clock));assert.ok(node.scrollTop>520&&node.scrollTop<1200);
 node.dispatchEvent(new Event('wheel'));assert.equal(follow,false);assert.equal(frames.size,0);
 node.scrollTop=1200;node.dispatchEvent(new Event('scroll'));assert.equal(follow,false);historyWindow=false;node.dispatchEvent(new Event('scroll'));assert.equal(follow,true);scroll.controller.abort();
});
test('account preference sync preserves a reversal made while the previous patch is in flight',async t=>{
 const {PreferenceSync}=await browserModule('preferences.js');const storage=new Map(),writes=[],applied=[];
 replaceGlobal(t,'localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});replaceGlobal(t,'navigator',{onLine:true});
 let complete;const sync=new PreferenceSync({request:async(route,options)=>{writes.push(options.body.preferences);if(writes.length===1)return new Promise(resolve=>{complete=resolve;});return {preferences:{palette:'coral'},revision:3};},onApply:value=>applied.push(value),onStatus:()=>{}});t.after(()=>clearTimeout(sync.timer));
 sync.attach('u_one',{preferences:{palette:'coral'},revision:1},{});sync.queue({palette:'blue'});const first=sync.flush();sync.queue({palette:'coral'});
 complete({preferences:{palette:'blue'},revision:2});await first;assert.equal(applied.at(-1).palette,'coral');assert.equal(sync.pending.palette,'coral');await sync.flush();
 assert.deepEqual(writes,[{palette:'blue'},{palette:'coral'}]);assert.deepEqual(sync.pending,{});assert.equal(applied.at(-1).palette,'coral');
});
test('offline account preference edits survive another client instance and sync after reconnection',async t=>{
 const {PreferenceSync}=await browserModule('preferences.js');const storage=new Map();replaceGlobal(t,'localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});replaceGlobal(t,'navigator',{onLine:false});
 const values=[];let requests=0;const args={request:async(route,options)=>{requests++;return {preferences:options.body.preferences,revision:2};},onApply:value=>values.push(value),onStatus:()=>{}};
 const first=new PreferenceSync(args);first.attach('u_offline',{preferences:{palette:'coral'},revision:1},{});first.queue({palette:'teal',motion:false});await first.flush();assert.equal(requests,0);clearTimeout(first.timer);
 const reopened=new PreferenceSync(args);t.after(()=>clearTimeout(reopened.timer));reopened.attach('u_offline',{preferences:{palette:'coral'},revision:1},{});assert.equal(values.at(-1).palette,'teal');assert.equal(values.at(-1).motion,false);
 navigator.onLine=true;await reopened.flush();assert.equal(requests,1);assert.deepEqual(reopened.pending,{});assert.equal(values.at(-1).palette,'teal');
});
test('touch swipe classification requires distance and a clear axis',async()=>{
 const {swipeDirection}=await browserModule('gestures.js');assert.equal(swipeDirection(90,10,72),'right');assert.equal(swipeDirection(-90,10,72),'left');assert.equal(swipeDirection(5,100,80),'down');assert.equal(swipeDirection(60,50,64),null);assert.equal(swipeDirection(20,10,64),null);
});


test('an old preference response cannot apply after sign-out or switching accounts',async t=>{
 const {PreferenceSync}=await browserModule('preferences.js'),storage=new Map(),applied=[];replaceGlobal(t,'localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});replaceGlobal(t,'navigator',{onLine:true});let complete;
 const sync=new PreferenceSync({request:()=>new Promise(resolve=>{complete=resolve;}),onApply:value=>applied.push(value),onStatus:()=>{}});t.after(()=>clearTimeout(sync.timer));
 sync.attach('u_old',{preferences:{palette:'coral'},revision:1},{});sync.queue({palette:'rose'});const pending=sync.flush();sync.detach();sync.attach('u_new',{preferences:{palette:'blue'},revision:4},{});
 complete({preferences:{palette:'rose'},revision:2});await pending;assert.equal(applied.at(-1).palette,'blue');assert.equal(sync.userId,'u_new');assert.deepEqual(sync.pending,{});assert.equal(JSON.parse(storage.get('nexus.sync.queue.u_old')).pending.palette,'rose');
});
