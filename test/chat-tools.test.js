'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const url='data:text/javascript;base64,'+readFileSync(path.join(__dirname,'../public/chat-tools.js')).toString('base64');
test('message grouping respects sender, elapsed time, hour boundaries, dates and replies',async()=>{
 const {groupMessage}=await import(url);
 const previous={authorId:'alice',createdAt:'2026-01-01T12:55:00Z'},message={authorId:'alice',createdAt:'2026-01-01T12:59:00Z'};
 assert.equal(groupMessage(previous,message),true);
 for(const changed of [{...message,authorId:'bob'},{...message,createdAt:'2026-01-01T13:00:00Z'},{...message,createdAt:'2026-01-02T12:56:00Z'},{...message,replyTo:'message'}])assert.equal(groupMessage(previous,changed),false);
 assert.equal(groupMessage(null,message),false);
});
test('emoji categories provide hundreds of choices and detect mention prefixes at the caret',async()=>{
 const {EMOJIS,mentionMatch}=await import(url);assert.ok(new Set(EMOJIS).size>700);
 assert.equal(mentionMatch({value:'Hi @max',selectionStart:7})[1],'max');
 assert.equal(mentionMatch({value:'email@example.com',selectionStart:17}),null);
});
test('client uploads resume acknowledged byte offsets after lost responses and repeated offline status checks',async()=>{
 const {uploadFile}=await import(url);const file=new File(['abcdefg'],'test.txt');let received=0,failedChunk=false,failedStatus=false,failedComplete=false,completes=0;const chunks=[],progress=[];
 const request=async(route,options={})=>{
  if(route.startsWith('/api/uploads/start'))return {id:'upload-test',chunkBytes:3};
  if(route.includes('/chunks')){const offset=Number(route.split('offset=')[1]);assert.equal(offset,received);const bytes=Buffer.from(await options.body.arrayBuffer());chunks.push(bytes);received+=bytes.length;if(!failedChunk){failedChunk=true;throw new Error('Lost upload response');}return {received};}
  if(route.endsWith('/complete')){completes++;if(!failedComplete){failedComplete=true;throw new Error('Lost completion response');}return {files:[{id:'file-test',size:7}]};}
  if(options.method==='DELETE')throw new Error('A completed upload must not be cancelled');
  if(!failedStatus){failedStatus=true;throw new Error('Still offline');}return {received};
 };
 const result=await uploadFile(file,{request,config:{maxUploadBytes:100},onProgress:state=>progress.push(state),wait:async()=>{}});
 assert.equal(result.id,'file-test');assert.equal(Buffer.concat(chunks).toString(),'abcdefg');assert.equal(received,7);assert.equal(completes,2);assert.ok(progress.some(state=>state.paused));
});
test('oversized files are rejected before opening an upload session',async()=>{
 const {uploadFile}=await import(url);let requests=0;
 await assert.rejects(uploadFile({size:5*1024**3+1},{request:async()=>{requests++;},config:{maxUploadBytes:5*1024**3}}),/5 GB/);assert.equal(requests,0);
});
test('cancelling an attachment stops retries and removes its temporary upload session',async()=>{
 const {uploadFile}=await import(url),controller=new AbortController();let cancelled=false;
 const request=async(route,options={})=>{if(route.includes('/start'))return {id:'cancel-test',chunkBytes:3};if(options.method==='DELETE'){cancelled=true;return {};}throw new Error('Disconnected');};
 await assert.rejects(uploadFile(new File(['test'],'cancel.txt'),{request,config:{maxUploadBytes:100},signal:controller.signal,wait:async()=>controller.abort()}),{name:'AbortError'});assert.equal(cancelled,true);
});
