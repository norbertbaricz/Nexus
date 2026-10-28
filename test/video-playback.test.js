'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createVideoPlayback}=require('../server/video-playback'),{CONFIG}=require('../server/config');
const load=()=>import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../public/video-playback.js')).toString('base64'));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('ISO upload signatures distinguish QuickTime/MP4 video, MP4 audio and unsupported image brands',()=>{
 const {isoMediaType}=require('../server/uploads');
 const header=brand=>{const b=Buffer.alloc(48);b.writeUInt32BE(24,0);b.write('ftyp',4);b.write(brand,8);return b;};
 assert.equal(isoMediaType(header('qt  ')),'video/quicktime');
 for(const brand of ['isom','iso8','hvc1','M4V '])assert.equal(isoMediaType(header(brand)),'video/mp4');
 for(const brand of ['M4A ','M4B '])assert.equal(isoMediaType(header(brand)),'audio/mp4');
 for(const brand of ['heic','avif','mif1','fake'])assert.equal(isoMediaType(header(brand)),null);
 assert.equal(isoMediaType(Buffer.from('ftypqt  ')),null);assert.equal(isoMediaType(Buffer.alloc(48)),null);
});
async function host(t,{run,options={}}={}) {
 const {openDatabase}=require('../server/database'),root=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-video-test-')),uploadPath=path.join(root,'uploads');fs.mkdirSync(uploadPath);const calls=[],db=openDatabase(path.join(root,'nexus.sqlite'));
 db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_video','video_fixture','Video fixture','fixture-hash','2026-10-28');
 const add=id=>{const file={id,ownerId:'u_video',purpose:'attachment',diskName:id,size:16,createdAt:'2026-10-28',mime:'video/mp4'};fs.writeFileSync(path.join(uploadPath,id),Buffer.alloc(16));db.prepare('INSERT INTO files(id,ownerId,purpose,name,mime,size,diskName,createdAt) VALUES (?,?,?,?,?,?,?,?)').run(id,file.ownerId,file.purpose,id,file.mime,file.size,id,file.createdAt);return file;};
 const config={...CONFIG,uploadPath,playback:{...CONFIG.playback,maxOutputBytes:100000,maxCacheBytes:1000000,minimumFreeBytes:0,queueLimit:2,cooldownMs:0,backfillMs:0,retryDelaysMs:[],...options}};
 const runner=async(...args)=>{calls.push(args);if(run)return run(...args);fs.writeFileSync(args[1].at(-1),Buffer.alloc(1000));};
 const service=createVideoPlayback({db,config,run:runner,autoStart:false});
 const settle=async(file,owner=service)=>{for(let n=0;n<5000;n++){await owner.tick();const state=await owner.snapshot(file);if(!['queued','processing'].includes(state.state))return state;await turn();}throw new Error('Fixture processing did not settle.');};
 t.after(()=>{service.close();db.close();fs.rmSync(root,{recursive:true,force:true});});return {root,uploadPath,db,config,runner,calls,add,service,settle,rows:{delete:id=>db.prepare('DELETE FROM files WHERE id=?').run(id)}};
}
test('host processing deduplicates concurrent requests, preserves originals and serves only a completed private copy',async t=>{
 const h=await host(t),file=h.add('f_one');await Promise.all([h.service.start(file),h.service.start(file)]);const result=await h.settle(file);
 assert.equal(result.state,'ready');assert.equal(result.url,'/files/f_one?variant=compat');assert.equal(h.calls.length,1);assert.equal(fs.readFileSync(path.join(h.uploadPath,file.id)).length,16);
 const args=h.calls[0][1];assert.equal(args[args.indexOf('-protocol_whitelist')+1],'file');assert.equal(args[args.indexOf('-format_whitelist')+1],'mov,matroska,webm');assert.ok(args.includes('libx264'));assert.ok(args.includes('aac'));assert.ok(args.includes('+faststart'));assert.ok(args.includes('-fs'));
 assert.ok(await h.service.readyPath(file));h.service.invalidate(file.id);for(let n=0;n<20&&await h.service.readyPath(file);n++)await turn();assert.equal(await h.service.readyPath(file),null);
});
test('a full memory window retains additional work in SQLite and deleting a queued file cancels it',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const h=await host(t,{run:async(exe,args)=>{await gate;fs.writeFileSync(args.at(-1),Buffer.alloc(1000));}});
 const a=h.add('f_a'),b=h.add('f_b'),c=h.add('f_c');await h.service.start(a);await h.service.start(b);assert.equal((await h.service.start(c)).state,'queued');
 assert.ok([...h.service.jobs.values()].filter(job=>['queued','processing'].includes(job.status)).length<=2);assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM video_jobs').get().n,3);
 h.service.invalidate(b.id);h.rows.delete(b.id);release();assert.equal((await h.settle(a)).state,'ready');assert.equal((await h.settle(c)).state,'ready');assert.equal(h.calls.length,2);
});
test('size-truncated and failed outputs are removed instead of being offered as complete videos',async t=>{
 const h=await host(t,{run:async(exe,args)=>fs.writeFileSync(args.at(-1),Buffer.alloc(96000))}),file=h.add('f_budget');await h.service.start(file);assert.equal((await h.settle(file)).state,'failed');assert.equal(await h.service.readyPath(file),null);assert.ok(!fs.readdirSync(path.join(h.root,'video-playback')).some(name=>name.endsWith('.part')));
});
test('invalidation during a running conversion cannot publish its late output',async t=>{
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),running=new Promise(resolve=>{started=resolve;});
 const h=await host(t,{run:async(exe,args)=>{started();await gate;fs.writeFileSync(args.at(-1),Buffer.alloc(1000));}}),file=h.add('f_cancelled');await h.service.start(file);await running;h.service.invalidate(file.id);h.rows.delete(file.id);release();
 for(let n=0;n<30;n++)await turn();assert.equal(await h.service.readyPath(file),null);assert.ok(!fs.readdirSync(path.join(h.root,'video-playback')).length);
});
function client(request) {
 const media=new EventTarget(),timers=new Map(),seen=[],ready=[];let id=0;
 const fixture={request,onStatus:value=>seen.push(value),onReady:value=>ready.push(value),schedule:action=>{timers.set(++id,action);return id;},cancel:key=>timers.delete(key)};
 return {media,timers,seen,ready,fixture,tick(){const entries=[...timers];timers.clear();for(const [,action] of entries)action();}};
}
test('every opened video observes background work silently, without a prepare mutation',async()=>{
 const {VideoPlayback}=await load();let gets=0;const f=client(async(url,options)=>{assert.equal(options.method,undefined);return ++gets===1?{state:'queued'}:{state:'ready',url:'/files/f_movie?variant=compat'};});
 const playback=new VideoPlayback(f.fixture);playback.attach(f.media,{url:'/files/f_movie',size:100});await turn();assert.deepEqual(f.seen,['queued']);f.tick();await turn();assert.deepEqual(f.ready,['/files/f_movie?variant=compat']);assert.equal(playback.optimized,true);assert.equal(f.timers.size,0);playback.ready('https://evil.test/movie');assert.equal(f.ready.length,1);playback.close();
});
test('changing files cancels the old request and a late ready result cannot replace the new video',async()=>{
 const {VideoPlayback}=await load();let finish,signal;const f=client((url,options)=>url.includes('f_old')?new Promise(resolve=>{finish=resolve;signal=options.signal;}):Promise.resolve({state:'queued'})),playback=new VideoPlayback(f.fixture);
 playback.attach(f.media,{url:'/files/f_old'});playback.attach(f.media,{url:'/files/f_new'});assert.equal(signal.aborted,true);finish({state:'ready',url:'/files/f_old?variant=compat'});await turn();assert.equal(f.ready.length,0);assert.equal(playback.id,'f_new');playback.close();assert.equal(f.timers.size,0);
});
test('unavailable hosts remain quiet, external URLs are not polled and close removes timers',async()=>{
 const {VideoPlayback}=await load();let gets=0;const f=client(async()=>{gets++;return {state:'unavailable'};}),p=new VideoPlayback(f.fixture);
 p.attach(f.media,{url:'/files/f_unavailable'});await turn();assert.equal(p.state,'unavailable');assert.equal(gets,1);assert.equal(f.timers.size,1);p.attach(f.media,{url:'https://external.test/video.mp4'});assert.equal(f.timers.size,0);await turn();assert.equal(gets,1);p.close();
});
test('a hidden viewer backs off without making a request and resumes one poll when visible',async()=>{
 const {VideoPlayback}=await load();let visible=false,gets=0;const f=client(async()=>{gets++;return {state:'queued'};}),p=new VideoPlayback({...f.fixture,visible:()=>visible});
 p.attach(f.media,{url:'/files/f_hidden'});await turn();assert.equal(gets,0);assert.equal(f.timers.size,1);visible=true;f.tick();await turn();assert.equal(gets,1);assert.equal(f.timers.size,1);p.close();
});

test('playback endpoints and range responses enforce the same session, conversation and block rules as original files',async t=>{
 const http=require('node:http'),{once}=require('node:events'),{createApp}=require('../server/app');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-video-http-')),config={...CONFIG,databasePath:path.join(root,'nexus.sqlite'),uploadPath:path.join(root,'uploads'),authAttemptsPerMinute:1000,requestsPerMinute:5000,mutationsPerMinute:1000,mail:{},push:{...CONFIG.push,enabled:false},playback:{...CONFIG.playback,maxOutputBytes:100000,maxCacheBytes:1000000,minimumFreeBytes:0,pollMs:10,backfillMs:10,cooldownMs:0,retryDelaysMs:[]}};
 const app=createApp(config,{videoRunner:async(exe,args)=>fs.writeFileSync(args.at(-1),Buffer.from('PLAYBACK'.repeat(100)))}),server=http.createServer(app.app);server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.close();fs.rmSync(root,{recursive:true,force:true});});
 const api=async(route,cookie,body,method=body?'POST':'GET')=>{const r=await fetch(base+route,{method,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const register=async username=>{const r=await api('/api/auth/register',null,{username,displayName:username,password:'Disposable-video-http-password!'});assert.equal(r.status,201);return {cookie:r.cookie,id:r.data.user.id};};
 const a=await register('video_http_a'),b=await register('video_http_b'),other=await register('video_http_other'),id='f_http_video',createdAt=new Date().toISOString();fs.writeFileSync(path.join(config.uploadPath,id),Buffer.from('ORIGINAL'));
 const quicktime=Buffer.alloc(48);quicktime.writeUInt32BE(24,0);quicktime.write('ftypqt  ',4);const form=new FormData();form.append('files',new Blob([quicktime],{type:'application/octet-stream'}),'phone.mov');
 const uploaded=await fetch(base+'/api/uploads',{method:'POST',headers:{Origin:base,Cookie:a.cookie},body:form});assert.equal(uploaded.status,201);const phoneFile=(await uploaded.json()).files[0];assert.equal(phoneFile.type,'video/quicktime');
 for(let n=0;n<1000&&app.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(phoneFile.id)?.status!=='ready';n++)await new Promise(r=>setTimeout(r,2));assert.equal(app.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(phoneFile.id)?.status,'ready');
 app.db.prepare('INSERT INTO files(id,ownerId,purpose,name,mime,size,diskName,createdAt) VALUES (?,?,?,?,?,?,?,?)').run(id,a.id,'attachment','clip.mp4','video/mp4',8,id,createdAt);
 assert.equal((await api('/api/files/'+id+'/playback')).status,401);assert.equal((await api('/api/files/'+id+'/playback',b.cookie)).status,404);
 const dm=(await api('/api/dms',a.cookie,{userId:b.id})).data.id;const sent=await api('/api/conversations/'+dm+'/messages',a.cookie,{text:'Video attachment',attachments:[id]});assert.equal(sent.status,201);
 assert.equal((await api('/api/files/'+id+'/playback',other.cookie)).status,404);assert.ok(['queued','processing','ready'].includes((await api('/api/files/'+id+'/playback',b.cookie,{})).data.state));
 let status;for(let n=0;n<100;n++){status=await api('/api/files/'+id+'/playback',b.cookie);if(status.data.state==='ready')break;await turn();}assert.equal(status.data.state,'ready');
 const range=await fetch(base+status.data.url,{headers:{Cookie:b.cookie,Range:'bytes=0-7'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');assert.equal(Buffer.from(await range.arrayBuffer()).toString(),'PLAYBACK');assert.equal(fs.readFileSync(path.join(config.uploadPath,id)).toString(),'ORIGINAL');
 await api('/api/blocks/'+a.id,b.cookie,{},'PUT');assert.equal((await api('/api/files/'+id+'/playback',b.cookie)).status,404);assert.equal((await fetch(base+status.data.url,{headers:{Cookie:b.cookie}})).status,404);
 await api('/api/blocks/'+a.id,b.cookie,null,'DELETE');assert.equal((await api('/api/messages/'+sent.data.message.id,a.cookie,null,'DELETE')).status,200);assert.equal((await api('/api/files/'+id+'/playback',a.cookie)).status,404);
});

test('default timers retain the Window-style invocation required by browser host methods',async()=>{
 const {VideoPlayback}=await load(),originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let player,cleared=0;
 try{globalThis.setTimeout=function(){assert.notEqual(this,player);return 77;};globalThis.clearTimeout=function(value){assert.notEqual(this,player);assert.equal(value,77);cleared++;};player=new VideoPlayback({request:async()=>({state:'available'})});player.timer(()=>{},100);player.close();assert.equal(cleared,1);}
 finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

test('hundreds of completed uploads stay in the durable backlog with one encoder and a bounded memory window',async t=>{
 let release,inside=0,peak=0;const gate=new Promise(resolve=>{release=resolve;});
 const h=await host(t,{options:{queueLimit:8},run:async(exe,args)=>{inside++;peak=Math.max(peak,inside);await gate;fs.writeFileSync(args.at(-1),Buffer.alloc(1000));inside--;}});
 for(let n=0;n<200;n++)h.service.enqueue(h.add('f_batch_'+String(n).padStart(3,'0')));
 await h.service.tick();assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM video_jobs').get().n,200);assert.ok(h.service.jobs.size<=8);release();
 let memoryPeak=0;
 const until=Date.now()+20000;while(Date.now()<until){
  await h.service.tick();memoryPeak=Math.max(memoryPeak,[...h.service.jobs.values()].filter(job=>['queued','processing'].includes(job.status)).length);
  if(h.db.prepare("SELECT COUNT(*) AS n FROM video_jobs WHERE status='ready'").get().n===200)break;await new Promise(resolve=>setTimeout(resolve,1));
 }
 assert.equal(h.calls.length,200);assert.equal(h.db.prepare("SELECT COUNT(*) AS n FROM video_jobs WHERE status='ready'").get().n,200);assert.equal(peak,1);assert.ok(memoryPeak<=8);assert.ok(h.service.jobs.size<=128);
});
test('old uploads enter the background queue without any viewer or preparation endpoint',async t=>{
 const h=await host(t),file=h.add('f_existing');assert.equal(h.db.prepare('SELECT COUNT(*) AS n FROM video_jobs').get().n,0);
 for(let n=0;n<5000&&h.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(file.id)?.status!=='ready';n++){await h.service.tick();await turn();}
 assert.equal(h.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(file.id).status,'ready');assert.equal(h.calls.length,1);
});
test('a stopped worker recovers its reserved/running work after restart and keeps source bytes',async t=>{
 let started;const running=new Promise(resolve=>{started=resolve;});
 const h=await host(t,{options:{retryDelaysMs:[1000]},run:async(exe,args,{signal})=>{started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('stopped')),{once:true}));}}),file=h.add('f_restart');
 await h.service.start(file);await running;const old=[...h.service.jobs.values()][0];h.service.close();for(let n=0;n<1000&&!old.finishedAt;n++)await turn();
 const resumed=createVideoPlayback({db:h.db,config:h.config,autoStart:false,run:async(exe,args)=>fs.writeFileSync(args.at(-1),Buffer.alloc(1000))});t.after(()=>resumed.close());
 assert.equal((await h.settle(file,resumed)).state,'ready');assert.equal(h.db.prepare('SELECT attempts FROM video_jobs WHERE fileId=?').get(file.id).attempts,2);assert.equal(fs.readFileSync(path.join(h.uploadPath,file.id)).length,16);resumed.close();
});
test('failed encodes back off and exhaust a fixed attempt budget instead of restarting on each view or host restart',async t=>{
 const h=await host(t,{options:{retryDelaysMs:[1000]}}),file=h.add('f_retry');h.service.close();let time=1000,calls=0;
 const config=h.config,run=async()=>{calls++;throw new Error('bad-video');},service=createVideoPlayback({db:h.db,config,run,autoStart:false,clock:()=>time});t.after(()=>service.close());service.enqueue(file);
 for(let n=0;n<1000&&h.db.prepare('SELECT attempts FROM video_jobs WHERE fileId=?').get(file.id).attempts<1;n++){await service.tick();await turn();}
 for(let n=0;n<1000&&h.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(file.id).status==='processing';n++)await turn();
 assert.equal(calls,1);assert.equal(h.db.prepare('SELECT nextAttemptAt FROM video_jobs WHERE fileId=?').get(file.id).nextAttemptAt,2000);
 for(let n=0;n<20;n++){await service.snapshot(file);await service.tick();}assert.equal(calls,1);time=2000;
 for(let n=0;n<1000&&h.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(file.id).status!=='failed';n++){await service.tick();await turn();}
 assert.equal(calls,2);service.close();const restarted=createVideoPlayback({db:h.db,config,run,autoStart:false,clock:()=>time+100000});t.after(()=>restarted.close());await restarted.tick();assert.equal((await restarted.snapshot(file)).state,'failed');assert.equal(calls,2);restarted.close();
});
test('disk budget pressure pauses the whole worker without spending codec retries',async t=>{
 const h=await host(t,{options:{maxCacheBytes:10,resourceRetryMs:30000}}),file=h.add('f_low_disk');await h.service.start(file);
 for(let n=0;n<1000&&h.db.prepare('SELECT status FROM video_jobs WHERE fileId=?').get(file.id).status==='processing';n++)await turn();
 const saved=h.db.prepare('SELECT * FROM video_jobs WHERE fileId=?').get(file.id);assert.equal(saved.status,'queued');assert.equal(saved.attempts,0);assert.ok(saved.nextAttemptAt>Date.now());assert.equal(h.calls.length,0);
 for(let n=0;n<20;n++)await h.service.tick();assert.equal(h.calls.length,0);
});
test('cache eviction does not reconvert old videos in a loop; an authorized view can requeue one evicted source',async t=>{
 const h=await host(t,{options:{maxOutputBytes:10000,maxCacheBytes:15000,evictedRetryMs:0}}),files=Array.from({length:12},(_,n)=>h.add('f_cache_'+String(n).padStart(2,'0')));
 for(let n=0;n<10000;n++){
  await h.service.tick();if(h.db.prepare("SELECT COUNT(*) AS n FROM video_jobs WHERE status IN ('ready','evicted')").get().n===12)break;await turn();
 }
 assert.equal(h.calls.length,12);const evicted=h.db.prepare("SELECT fileId FROM video_jobs WHERE status='evicted' LIMIT 1").get();assert.ok(evicted);
 for(let n=0;n<50;n++)await h.service.tick();assert.equal(h.calls.length,12);const file=files.find(file=>file.id===evicted.fileId);assert.equal((await h.service.snapshot(file)).state,'queued');assert.equal((await h.settle(file)).state,'ready');assert.equal(h.calls.length,13);
});

test('a mismatched ready URL is ignored and the viewer keeps one poll until its own private copy is ready',async()=>{
 const {VideoPlayback}=await load();let gets=0;const f=client(async()=>++gets===1?{state:'ready',url:'/files/f_other?variant=compat'}:{state:'ready',url:'/files/f_current?variant=compat'}),p=new VideoPlayback(f.fixture);
 p.attach(f.media,{url:'/files/f_current'});await turn();assert.equal(p.optimized,false);assert.equal(f.ready.length,0);assert.equal(f.timers.size,1);f.tick();await turn();assert.deepEqual(f.ready,['/files/f_current?variant=compat']);assert.equal(f.timers.size,0);p.close();
});
