'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase}=require('../server/database');
const {createCommunityInstaller}=require('../server/community-template');
const {CONFIG}=require('../server/config');
const CREATED='2026-01-01T00:00:00.000Z';
function fixture(t){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-community-')),db=openDatabase(':memory:');
  const config={...CONFIG,uploadPath:folder,communityTemplatePath:path.join(__dirname,'../setup/community.json')};db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_creator','maxultimat3','Creator','not-a-login-hash',CREATED);
  t.after(()=>{db.close();fs.rmSync(folder,{recursive:true,force:true});});return {db,config,install:()=>createCommunityInstaller(db,config).install('u_creator')};
}
test('the prepared community installs once, preserves original PNG and animated GIF bytes, and keeps subsequent edits',t=>{
  const {db,config,install}=fixture(t),id=install(),server=db.prepare('SELECT * FROM servers WHERE id=?').get(id);
  assert.equal(server.name,'Skypixel Framework');assert.equal(server.publicListing,1);assert.match(server.rules,/# Skypixel Framework/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM channels WHERE serverId=?').get(id).n,15);
  for(const [key,file] of [['icon','icon.png'],['banner','banner.gif']])assert.deepEqual(fs.readFileSync(path.join(config.uploadPath,server[key].slice(7))),fs.readFileSync(path.join(__dirname,'../setup/assets',file)));
  db.prepare("UPDATE servers SET rules='Owner edited rules',name='A new name' WHERE id=?").run(id);db.prepare("DELETE FROM channels WHERE serverId=? AND name='general'").run(id);
  assert.equal(install(),id);assert.equal(db.prepare('SELECT count(*) AS n FROM servers').get().n,1);assert.equal(db.prepare('SELECT rules FROM servers').get().rules,'Owner edited rules');assert.equal(db.prepare('SELECT count(*) AS n FROM channels WHERE serverId=?').get(id).n,14);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('an existing creator community is adopted once with the prepared rulebook while preserving existing channels and history',t=>{
  const {db,install}=fixture(t);
  db.prepare('INSERT INTO servers(id,name,ownerId,invite,createdAt,rules) VALUES (?,?,?,?,?,?)').run('s_existing','Skypixel Framework','u_creator','existing-invite',CREATED,'Existing custom rules');
  db.prepare("INSERT INTO members VALUES ('s_existing','u_creator','owner',?)").run(CREATED);
  db.prepare("INSERT INTO channels(id,serverId,name,topic) VALUES ('c_existing','s_existing','general','A custom topic')").run();
  assert.equal(install(),'s_existing');assert.match(db.prepare('SELECT rules FROM servers').get().rules,/# Skypixel Framework community rules/);assert.equal(db.prepare("SELECT topic FROM channels WHERE id='c_existing'").get().topic,'A custom topic');
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='officialServerId'").get().value,'s_existing');
  // An explicit deletion marker is intentionally retained and never re-provisions a deleted server.
  db.prepare("INSERT INTO app_settings VALUES ('communityTemplate:another-setup','deleted')").run();
});
test('resetting a database restores the prepared community only after a creator is identified',t=>{
  const first=fixture(t),second=fixture(t);assert.equal(createCommunityInstaller(first.db,first.config).install(''),null);assert.equal(first.db.prepare('SELECT count(*) AS n FROM servers').get().n,0);
  const a=first.install(),b=second.install();assert.notEqual(a,b);assert.equal(second.db.prepare('SELECT ownerId FROM servers WHERE id=?').get(b).ownerId,'u_creator');
  const disabled={...second.config,communityTemplatePath:''};assert.equal(createCommunityInstaller(second.db,disabled).install('u_creator'),null);
});

test('normal startup does not create a personal community or grant official status by name',t=>{
  const {createApp}=require('../server/app');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-official-')),filename=path.join(folder,'nexus.sqlite');
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const db=openDatabase(filename);
  db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_legacy','maxultimat3','Legacy creator','not-a-login-hash',CREATED);
  for(const [id,createdAt] of [['s_first','2026-01-01'],['s_duplicate','2026-02-01']])db.prepare('INSERT INTO servers(id,name,ownerId,invite,createdAt) VALUES (?,?,?,?,?)').run(id,'Skypixel Framework','u_legacy',id,createdAt);
  db.close();const config={...CONFIG,databasePath:filename,uploadPath:path.join(folder,'uploads'),communityTemplatePath:''};
  const first=createApp(config);assert.equal(first.db.prepare("SELECT value FROM app_settings WHERE key='officialServerId'").get(),undefined);assert.equal(first.db.prepare('SELECT count(*) AS n FROM servers').get().n,2);
  first.db.prepare("DELETE FROM servers WHERE id='s_first'").run();first.db.prepare("DELETE FROM app_settings WHERE key='officialServerId'").run();first.close();
  const restarted=createApp(config);assert.equal(restarted.db.prepare("SELECT value FROM app_settings WHERE key='officialServerId'").get(),undefined);restarted.close();
});


test('a template can preserve existing community copy when replacement is disabled',t=>{
  const {db,config,install}=fixture(t),bundle=path.join(config.uploadPath,'bundle');
  fs.cpSync(path.join(__dirname,'../setup'),bundle,{recursive:true});
  const manifest=path.join(bundle,'community.json'),data=JSON.parse(fs.readFileSync(manifest));data.replaceExistingContent=false;fs.writeFileSync(manifest,JSON.stringify(data));config.communityTemplatePath=manifest;
  db.prepare('INSERT INTO servers(id,name,ownerId,invite,createdAt,rules) VALUES (?,?,?,?,?,?)').run('s_preserved','Skypixel Framework','u_creator','keep-invite',CREATED,'Keep this rulebook');
  install();assert.equal(db.prepare('SELECT rules FROM servers').get().rules,'Keep this rulebook');
});

test('explicit personal import upgrades Tester assignments without changing unrelated servers or restarting into a new community',t=>{
 const {setupCommunity}=require('../scripts/setup-community'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-personal-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const config={...CONFIG,databasePath:path.join(folder,'nexus.sqlite'),uploadPath:path.join(folder,'uploads')},manifest=path.join(__dirname,'../setup/community.json');
 let db=openDatabase(config.databasePath);db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_personal','maxultimat3','Creator','not-a-login-hash',CREATED);db.prepare("INSERT INTO app_settings VALUES ('creatorUserId','u_personal')").run();db.close();
 const first=setupCommunity(manifest,config);assert.equal(first.roles,5);
 db=openDatabase(config.databasePath);db.prepare('INSERT INTO users(id,username,displayName,passwordHash,createdAt) VALUES (?,?,?,?,?)').run('u_tester','tester_fixture','Tester','not-a-login-hash',CREATED);db.prepare("INSERT INTO members VALUES (?,?,'member',?)").run(first.serverId,'u_tester',CREATED);
 db.prepare('INSERT INTO server_roles(id,serverId,name,color) VALUES (?,?,?,?)').run('r_old_tester',first.serverId,'Best Tester','#aabbcc');db.prepare('INSERT INTO member_roles VALUES (?,?,?)').run(first.serverId,'u_tester','r_old_tester');
 db.prepare("UPDATE app_settings SET value='1' WHERE key='communityTemplate:skypixel-framework:revision'").run();db.prepare("UPDATE servers SET rules='My custom rules' WHERE id=?").run(first.serverId);db.close();
 const second=setupCommunity(manifest,config);assert.equal(second.serverId,first.serverId);assert.equal(second.roles,5);
 db=openDatabase(config.databasePath);assert.equal(db.prepare('SELECT 1 FROM server_roles WHERE id=?').get('r_old_tester'),undefined);assert.equal(db.prepare('SELECT r.name FROM member_roles m JOIN server_roles r ON r.id=m.roleId WHERE m.userId=?').get('u_tester').name,'Tester');assert.equal(db.prepare('SELECT rules FROM servers WHERE id=?').get(first.serverId).rules,'My custom rules');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);db.close();
});
