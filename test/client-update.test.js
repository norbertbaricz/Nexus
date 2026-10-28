'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const moduleURL='data:text/javascript;base64,'+readFileSync(path.join(__dirname,'../public/client-update.js')).toString('base64');
const FIRST='a'.repeat(20),NEXT='b'.repeat(20);
test('an open website checks uncached metadata and reports a new complete build once',async()=>{
 const {ClientUpdates}=await import(moduleURL),updates=[];let current=FIRST,seen;const client=new ClientUpdates({buildId:FIRST,onUpdate:value=>updates.push(value),fetcher:async(url,options)=>{seen={url,options};return {ok:true,json:async()=>({ok:true,version:'2.23.0',buildId:current})};}});
 await client.check();assert.equal(updates.length,0);current=NEXT;await client.check();await client.check();assert.equal(updates.length,1);assert.equal(client.pending.buildId,NEXT);assert.equal(seen.url,'/api/health');assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.credentials,'same-origin');
});
test('offline or invalid metadata never triggers a reload and simultaneous checks are bounded',async()=>{
 const {ClientUpdates}=await import(moduleURL);let requests=0,resolve,updates=0;const client=new ClientUpdates({buildId:FIRST,onUpdate:()=>updates++,fetcher:()=>{requests++;return new Promise(done=>{resolve=done;});}});
 const pending=client.check();await client.check();assert.equal(requests,1);resolve({ok:true,json:async()=>({ok:true,buildId:'invalid'})});await pending;assert.equal(updates,0);client.fetcher=async()=>{throw new Error('offline');};await client.check();assert.equal(updates,0);assert.equal(client.checking,false);
});
test('default timer callbacks are not invoked with a ClientUpdates object as their browser receiver',async()=>{
 const {ClientUpdates}=await import(moduleURL),originalSet=global.setInterval,originalClear=global.clearInterval;let scheduled=0,cancelled=0;
 global.setInterval=function(){assert.ok(this===undefined||this===globalThis);scheduled++;return 42;};global.clearInterval=function(id){assert.ok(this===undefined||this===globalThis);assert.equal(id,42);cancelled++;};
 try{const client=new ClientUpdates({buildId:FIRST,onUpdate:()=>{}});client.start();client.start();assert.equal(scheduled,1);client.stop();assert.equal(cancelled,1);}finally{global.setInterval=originalSet;global.clearInterval=originalClear;}
});
