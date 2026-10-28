'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {once}=require('node:events');
const {createApp}=require('../server/app');
const {CONFIG}=require('../server/config');

test('signed-in readiness heartbeats use account limits rather than exhausting a shared NAT address',async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-ready-'));
 const instance=createApp({...CONFIG,databasePath:path.join(folder,'db.sqlite'),uploadPath:path.join(folder,'uploads'),requestsPerMinute:2,authAttemptsPerMinute:20});
 const server=http.createServer(instance.app),io=instance.attachRealtime(server);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>io.close(resolve));instance.close();fs.rmSync(folder,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,cookies=[];
 for(const username of ['ready_alice','ready_bob']){
  const response=await fetch(base+'/api/auth/register',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username,displayName:username,password:'readiness-test-only-password-72!'})});
  assert.equal(response.status,201);cookies.push(response.headers.get('set-cookie').split(';')[0]);
 }
 for(let n=0;n<2;n++)for(const cookie of cookies){const response=await fetch(base+'/api/ready',{headers:{Cookie:cookie}});assert.equal(response.status,200);assert.equal((await response.json()).database,'ready');}
 for(const cookie of cookies)assert.equal((await fetch(base+'/api/ready',{headers:{Cookie:cookie}})).status,429);
 // Anonymous probes keep their own bounded bucket and cannot spend an account's quota.
 for(let n=0;n<2;n++)assert.equal((await fetch(base+'/api/ready')).status,200);
 assert.equal((await fetch(base+'/api/ready')).status,429);
});
