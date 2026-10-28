'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto');

// Quality, worker, retry and disk budgets are grouped in config.js → playback.
const VIDEO_RULES=Object.freeze({profile:1,id:/^f_[a-zA-Z0-9_-]{1,80}$/,generated:/^(f_[a-zA-Z0-9_-]+)-[a-f0-9]{16}\.(mp4|part)$/,maximumLogBytes:65536,maxRememberedJobs:128,maintenanceMs:60000});
const probes=new Map();
function runProcess(executable,args,{timeoutMs,signal}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',settled=false;
    try{if(child.pid)os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{/* Host policies can keep the normal process priority. */}
    const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(output);};
    const abort=()=>{child.kill('SIGKILL');};const timer=setTimeout(abort,timeoutMs);timer.unref?.();
    for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{if(output.length<VIDEO_RULES.maximumLogBytes)output+=data.toString().slice(0,VIDEO_RULES.maximumLogBytes-output.length);});
    child.on('error',finish);child.on('close',(code,killed)=>finish(code===0&&!signal?.aborted?null:new Error(killed?'processing-stopped':'processing-failed')));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  });
}
async function available(options,run) {
  if(!options.enabled)return false;
  if(run!==runProcess)return true;
  if(!probes.has(options.executable))probes.set(options.executable,run(options.executable,['-hide_banner','-encoders'],{timeoutMs:options.probeTimeoutMs}).then(text=>/\blibx264\b/.test(text)&&/\baac\b/.test(text)).catch(()=>false));
  return probes.get(options.executable);
}
function createVideoPlayback({db,config,run=runProcess,autoStart=true,clock=()=>Date.now()}) {
  const options={...require('./config').CONFIG.playback,...config.playback},cache=options.cachePath||path.join(path.dirname(config.uploadPath),'video-playback');
  const jobs=new Map(),maximumAttempts=options.retryDelaysMs.length+1;
  let active=0,closed=false,warned=false,maintenance=Promise.resolve(),pumpTask=null,wakeTimer=null,pausedUntil=0,nextStartAt=0,nextBackfillAt=0,backfillCursor=0;
  const remove=filename=>fs.promises.rm(filename,{force:true}).catch(()=>{});
  const fingerprint=file=>createHash('sha256').update(JSON.stringify([file.id,file.size,file.createdAt,VIDEO_RULES.profile,options.maxSide,options.fps,options.crf,options.bitrateKbps])).digest('hex').slice(0,16);
  const eligible=file=>file?.purpose==='attachment'&&file.mime?.startsWith('video/')&&VIDEO_RULES.id.test(file.id);
  const names=file=>{if(!VIDEO_RULES.id.test(file.id))throw new Error('Invalid media identity.');const key=file.id+'-'+fingerprint(file);return {key,ready:path.join(cache,key+'.mp4'),partial:path.join(cache,key+'.part')};};
  const record=file=>db.prepare('SELECT * FROM video_jobs WHERE fileId=?').get(file.id);
  const update=(file,status,{attempts,nextAttemptAt=0,error=''}={})=>{
    if(closed)return;
    db.prepare('UPDATE video_jobs SET status=?,attempts=COALESCE(?,attempts),nextAttemptAt=?,updatedAt=?,lastError=? WHERE fileId=? AND fingerprint=?').run(status,attempts??null,nextAttemptAt,clock(),error,file.id,fingerprint(file));
  };
  // Reserved and running jobs recover after a stopped host; exhausted failures stay bounded.
  db.prepare("UPDATE video_jobs SET status=CASE WHEN attempts<? THEN 'queued' ELSE 'failed' END,nextAttemptAt=?,updatedAt=? WHERE status='processing'").run(maximumAttempts,clock(),clock());
  function wake(delay=options.cooldownMs) {
    if(!autoStart||closed||wakeTimer!==null)return;
    wakeTimer=setTimeout(()=>{wakeTimer=null;pump();},Math.max(0,delay));wakeTimer.unref?.();
  }
  function enqueue(file,{revive=false}={}) {
    if(closed||!options.enabled||!eligible(file))return false;
    const existing=record(file),signature=fingerprint(file),time=clock();
    if(!existing||existing.fingerprint!==signature){
      db.prepare(`INSERT INTO video_jobs(fileId,fingerprint,status,attempts,nextAttemptAt,createdAt,updatedAt,lastError) VALUES (?,?,'queued',0,?,?,?,'')
        ON CONFLICT(fileId) DO UPDATE SET fingerprint=excluded.fingerprint,status='queued',attempts=0,nextAttemptAt=excluded.nextAttemptAt,updatedAt=excluded.updatedAt,lastError=''`).run(file.id,signature,time,Date.parse(file.createdAt)||time,time);
    }else if(revive&&['ready','evicted'].includes(existing.status)){
      update(file,'queued',{attempts:0,nextAttemptAt:Math.max(time,existing.nextAttemptAt)});
    }
    wake();return true;
  }
  async function cached(file) {const value=names(file);try{const stat=await fs.promises.stat(value.ready);return stat.isFile()&&stat.size>0&&stat.size<options.maxOutputBytes?{...value,stat}:null;}catch{return null;}}
  async function prune(reserve=0) {
    await fs.promises.mkdir(cache,{recursive:true,mode:0o700});const files=[];
    for(const name of await fs.promises.readdir(cache)){
      const match=name.match(VIDEO_RULES.generated);if(!match)continue;
      const filename=path.join(cache,name);let stat;try{stat=await fs.promises.stat(filename);}catch{continue;}
      if([...jobs.values()].some(job=>job.status==='processing'&&job.partial===filename))continue;
      if(closed)return;const file=db.prepare('SELECT * FROM files WHERE id=?').get(match[1]);
      if(match[2]==='part'||!file||names(file).ready!==filename||clock()-stat.mtimeMs>options.cacheAgeMs){
        await remove(filename);if(file&&match[2]==='mp4'&&names(file).ready===filename)update(file,'evicted',{nextAttemptAt:clock()+options.evictedRetryMs});continue;
      }
      files.push({filename,file,size:stat.size,at:stat.mtimeMs});
    }
    let used=files.reduce((total,file)=>total+file.size,0);
    for(const file of files.sort((a,b)=>a.at-b.at))if(used+reserve>options.maxCacheBytes){await fs.promises.rm(file.filename,{force:true});used-=file.size;update(file.file,'evicted',{nextAttemptAt:clock()+options.evictedRetryMs});}
    if(used+reserve>options.maxCacheBytes)throw new Error('storage-budget');
    const disk=await fs.promises.statfs(cache);if(Number(disk.bavail)*Number(disk.bsize)<options.minimumFreeBytes+reserve)throw new Error('storage-space');
  }
  async function snapshot(file) {
    if(closed)return {state:'unavailable'};
    if(await cached(file))return {state:'ready',url:`/files/${file.id}?variant=compat`};
    if(closed)return {state:'unavailable'};
    enqueue(file,{revive:true});
    const job=jobs.get(names(file).key);if(job&&['queued','processing'].includes(job.status))return {state:job.status};
    if(!await available(options,run))return {state:'unavailable'};
    if(closed)return {state:'unavailable'};
    const stored=record(file);
    if(stored?.status==='failed')return {state:'failed',error:'This video is unavailable on this device.'};
    return {state:stored?.status==='processing'?'processing':'queued'};
  }
  // Walk bounded rowid pages once, including old uploads; ready/evicted records never loop.
  function backfill() {
    if(clock()<nextBackfillAt||!options.enabled)return;
    const rows=db.prepare('SELECT rowid AS cursor,* FROM files WHERE rowid>? ORDER BY rowid LIMIT ?').all(backfillCursor,options.backfillBatch);
    for(const file of rows){backfillCursor=file.cursor;enqueue(file);}
    nextBackfillAt=clock()+options.backfillMs;
  }
  function trimJobs() {for(const [key,job] of jobs)if(jobs.size>=VIDEO_RULES.maxRememberedJobs&&job.finishedAt)jobs.delete(key);}
  function drain() {
    if(closed||clock()<Math.max(pausedUntil,nextStartAt))return;
    for(const job of jobs.values()){
      if(active>=options.concurrency)break;if(job.status!=='queued')continue;
      job.status='processing';active++;
      processJob(job).finally(()=>{active--;nextStartAt=clock()+options.cooldownMs;wake(Math.max(options.cooldownMs,pausedUntil-clock()));});
    }
  }
  function pump() {
    if(closed)return Promise.resolve();if(pumpTask)return pumpTask;
    pumpTask=(async()=>{
      backfill();if(clock()<Math.max(pausedUntil,nextStartAt))return;
      const room=options.queueLimit-[...jobs.values()].filter(job=>['queued','processing'].includes(job.status)).length;
      const pending=room>0?db.prepare("SELECT f.* FROM video_jobs j JOIN files f ON f.id=j.fileId WHERE j.status='queued' AND j.nextAttemptAt<=? AND j.attempts<? ORDER BY j.nextAttemptAt,j.createdAt,j.fileId LIMIT ?").all(clock(),maximumAttempts,room):[];
      if(pending.length&&!await available(options,run)){
        if(!closed&&!warned){warned=true;console.warn('[Nexus video] Install FFmpeg with libx264 and AAC on this host, or set FFMPEG_PATH. The durable backlog is retained.');}return;
      }
      if(closed)return;
      for(const file of pending){
        const paths=names(file),present=jobs.get(paths.key);if(present&&!present.finishedAt)continue;
        if(await cached(file)){update(file,'ready');continue;}if(closed)return;
        trimJobs();update(file,'processing');jobs.set(paths.key,{...paths,file,status:'queued',controller:new AbortController()});
      }
      drain();
    })().catch(error=>{if(!closed)console.error('[Nexus video queue]',{reason:error.code||error.message});}).finally(()=>{pumpTask=null;});
    return pumpTask;
  }
  async function processJob(job) {
    let attempts=0;
    try{
      const stored=record(job.file);attempts=(stored?.attempts||0)+1;update(job.file,'processing',{attempts});
      maintenance=maintenance.catch(()=>{}).then(()=>prune(options.maxOutputBytes));await maintenance;
      if(closed||job.controller.signal.aborted)throw new Error('cancelled');
      const file=db.prepare('SELECT * FROM files WHERE id=?').get(job.file.id);if(!file||fingerprint(file)!==fingerprint(job.file))throw new Error('removed');
      const input=path.join(config.uploadPath,file.diskName),stat=await fs.promises.stat(input);if(!stat.isFile()||path.basename(file.diskName)!==file.diskName||stat.size!==file.size)throw new Error('source-size');
      const filter=`scale=w='min(${options.maxSide},iw)':h='min(${options.maxSide},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=${options.fps}`;
      await run(options.executable,['-hide_banner','-loglevel','error','-nostdin','-y','-filter_threads',String(options.threads),'-max_alloc','134217728',
        '-max_pixels','9437184','-protocol_whitelist','file','-format_whitelist','mov,matroska,webm','-threads',String(options.threads),'-i',input,
        '-map','0:v:0','-map','0:a:0?','-sn','-dn','-map_metadata','-1','-map_chapters','-1','-vf',filter,
        '-c:v','libx264','-preset','veryfast','-crf',String(options.crf),'-profile:v','main','-pix_fmt','yuv420p','-threads',String(options.threads),
        '-maxrate',options.bitrateKbps+'k','-bufsize',options.bitrateKbps*2+'k','-c:a','aac','-b:a','128k','-ac','2',
        '-movflags','+faststart','-fs',String(options.maxOutputBytes),'-f','mp4',job.partial],{timeoutMs:options.timeoutMs,signal:job.controller.signal});
      const result=await fs.promises.stat(job.partial);
      // FFmpeg may exit successfully on -fs. Never publish a size-truncated movie.
      if(!result.size||result.size>=options.maxOutputBytes*.95)throw new Error('output-budget');
      if(closed||job.controller.signal.aborted||!db.prepare('SELECT 1 FROM files WHERE id=?').get(file.id))throw new Error('removed');
      await fs.promises.rename(job.partial,job.ready);job.status='ready';update(file,'ready');
    }catch(error){
      await remove(job.partial);job.status='failed';
      if(!closed&&!job.controller.signal.aborted){
        const resource=['storage-budget','storage-space'].includes(error.message)||['ENOSPC','EDQUOT'].includes(error.code),retry=options.retryDelaysMs[attempts-1];
        if(resource){pausedUntil=clock()+options.resourceRetryMs;update(job.file,'queued',{attempts:Math.max(0,attempts-1),nextAttemptAt:pausedUntil,error:error.message});}
        else update(job.file,retry===undefined?'failed':'queued',{attempts,nextAttemptAt:retry===undefined?0:clock()+retry,error:error.code||error.message});
        console.warn('[Nexus video]',{fileId:job.file.id,reason:error.code||error.message,retry:resource||retry!==undefined});
      }
    }finally{job.finishedAt=clock()||1;}
  }
  // Retained for older clients; work beyond the memory window remains in SQLite.
  async function start(file) {const status=await snapshot(file);if(status.state==='queued'){await pump();return snapshot(file);}return status;}
  async function readyPath(file) {
    const result=await cached(file);if(!result)return null;
    if(clock()-result.stat.mtimeMs>=options.cacheTouchMs)fs.promises.utimes(result.ready,new Date(clock()),new Date(clock())).catch(()=>{});
    return result.ready;
  }
  function invalidate(id) {
    if(!closed)db.prepare('DELETE FROM video_jobs WHERE fileId=?').run(id);
    for(const job of jobs.values())if(job.file.id===id){job.controller.abort();jobs.delete(job.key);remove(job.partial);remove(job.ready);}
    fs.promises.readdir(cache).then(files=>Promise.all(files.filter(name=>name.match(VIDEO_RULES.generated)?.[1]===id).map(name=>remove(path.join(cache,name))))).catch(()=>{});
  }
  const timer=autoStart?setInterval(pump,options.pollMs):null;timer?.unref();
  const janitor=autoStart?setInterval(()=>{
    if(closed||active||!options.enabled||!fs.existsSync(cache))return;
    maintenance=maintenance.catch(()=>{}).then(()=>prune()).catch(()=>{});
  },VIDEO_RULES.maintenanceMs):null;janitor?.unref();
  if(autoStart)wake();
  return {snapshot,start,enqueue,readyPath,invalidate,tick:pump,jobs,close(){closed=true;clearInterval(timer);clearInterval(janitor);clearTimeout(wakeTimer);for(const job of jobs.values())job.controller.abort();}};
}
module.exports={VIDEO_RULES,createVideoPlayback,runProcess};
