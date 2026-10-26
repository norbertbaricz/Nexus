'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PERMISSION_DEFINITIONS,resolvePermissions,normalizeDefaults}=require('../server/permissions');
const {readFileSync}=require('node:fs');
const path=require('node:path');

test('permission resolution preserves basic access, inherited defaults, explicit denials and owner authority',()=>{
  assert.equal(PERMISSION_DEFINITIONS.length,26);
  const basic=resolvePermissions();assert.equal(basic.sendMessages,true);assert.equal(basic.manageServer,false);
  assert.equal(resolvePermissions({sendMessages:false}).sendMessages,false);
  const grants=[{permissions:['sendMessages','moderateMembers','manageMessages'],deniedPermissions:[]}];
  assert.equal(resolvePermissions({sendMessages:false},grants).sendMessages,true);assert.equal(resolvePermissions({},grants).banMembers,true);
  const denied=resolvePermissions({},[...grants,{permissions:[],deniedPermissions:['sendMessages','moderateMembers','pinMessages']}]);
  assert.equal(denied.sendMessages,false);assert.equal(denied.banMembers,false);assert.equal(denied.pinMessages,false);assert.equal(denied.manageTopics,true);
  assert.ok(Object.values(resolvePermissions({sendMessages:false},[{permissions:[],deniedPermissions:PERMISSION_DEFINITIONS.map(item=>item.key)}],true)).every(Boolean));
  assert.throws(()=>normalizeDefaults({manageServer:true}),/valid basic/);assert.throws(()=>normalizeDefaults({sendMessages:'true'}),/valid basic/);
});

test('sidebar sizing clamps persisted values below half the viewport and preserves the desktop conversation area',async()=>{
  const config='data:text/javascript;base64,'+readFileSync(path.join(__dirname,'../public/config.js')).toString('base64');
  const source=readFileSync(path.join(__dirname,'../public/layout.js'),'utf8').replace("'./config.js'",JSON.stringify(config));
  const {sidebarWidths,sidebarBounds}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  for(const width of [761,1024,1281,1366,1920,3440])for(const preferences of [{},{sidebarLeft:99999,sidebarRight:99999},{sidebarLeft:-100,sidebarRight:'bad'}]){
    const sizes=sidebarWidths(width,preferences);for(const side of ['left','right']){assert.ok(sizes[side]<=width*.45);assert.ok(sizes[side]>=sidebarBounds(width,side).min);}
    if(width>1280)assert.ok(width-sizes.left-sizes.right>=360);
  }
});
