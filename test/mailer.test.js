'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createMailer,recoveryOrigin}=require('../server/mailer');
const {CONFIG}=require('../server/config');

test('recovery links accept only an explicit HTTPS origin or a local development origin',()=>{
 for(const value of ['http://attacker.example','https://user:secret@nexus.example','https://nexus.example/path','https://nexus.example/?query=1','javascript:alert(1)'])assert.equal(recoveryOrigin(value),'');
 assert.equal(recoveryOrigin('https://nexus.example/'),'https://nexus.example');assert.equal(recoveryOrigin('http://localhost:3000'),'http://localhost:3000');
});
test('email secrets use fragments and messages never include passwords or raw HTML from callers',async()=>{
 const delivered=[],service=createMailer({...CONFIG,publicOrigin:'https://nexus.example'}, {async sendMail(message){delivered.push(message);},close(){}});
 const message=service.message('reset','person@example.test','A'.repeat(43),20);assert.match(message.text,/#reset-password=/);assert.doesNotMatch(message.html,/\?token=/);assert.equal(service.enqueue(message),true);await service.idle();assert.equal(delivered.length,1);assert.equal(delivered[0].disableUrlAccess,true);assert.equal(delivered[0].disableFileAccess,true);service.close();
});
test('delivery queues are bounded and an unavailable mail service fails closed',async()=>{
 let finish;const service=createMailer({...CONFIG,publicOrigin:'https://nexus.example',mail:{...CONFIG.mail,maxQueue:1,concurrency:1}}, {sendMail:()=>new Promise(resolve=>{finish=resolve;}),close(){}});
 assert.equal(service.enqueue({to:'one@example.test',text:'one'}),true);assert.equal(service.capacity,false);assert.equal(service.enqueue({to:'two@example.test',text:'two'}),false);await Promise.resolve();finish({});await service.idle();assert.equal(service.capacity,true);service.close();
 const absent=createMailer({...CONFIG,publicOrigin:'',mail:{...CONFIG.mail,host:''}});assert.equal(absent.available,false);assert.equal(absent.enqueue({text:'not sent'}),false);absent.close();
});
test('SMTP failures log bounded classifications without provider messages or credentials',async t=>{
 const logs=[];t.mock.method(console,'error',(...values)=>logs.push(values));
 const secret='private-token-and-password';
 const service=createMailer({...CONFIG,publicOrigin:'https://nexus.example'}, {async sendMail(){throw Object.assign(new Error(secret),{code:'EAUTH',command:'AUTH '+secret});},close(){}});
 service.enqueue({to:'private@example.test',text:secret});await service.idle();service.close();
 assert.equal(logs.length,1);assert.deepEqual(logs[0][1],{code:'EAUTH',command:'AUTH'});assert.doesNotMatch(JSON.stringify(logs),/private-token|private@example/);
});
