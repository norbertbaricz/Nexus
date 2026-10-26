'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {normalizeCrop}=require('../server/artwork');

// Import the actual browser helpers without bundling or a second implementation.
const MODULE_ROOT=path.join(__dirname,'../public');
const sourceUrls=new Map();
function sourceUrl(name){
 if(sourceUrls.has(name))return sourceUrls.get(name);
 let source=readFileSync(path.join(MODULE_ROOT,name),'utf8');
 const imports=[...new Set([...source.matchAll(/['"](.\/[^'"\n]+\.js)['"]/g)].map(match=>match[1]))];
 for(const relative of imports){const target=path.posix.normalize(path.posix.join(path.posix.dirname(name),relative));source=source.split(`'${relative}'`).join(JSON.stringify(sourceUrl(target))).split(`"${relative}"`).join(JSON.stringify(sourceUrl(target)));}
 const url='data:text/javascript;base64,'+Buffer.from(source+'\n//# sourceURL=nexus-public/'+name).toString('base64');sourceUrls.set(name,url);return url;
}
const browserModule=name=>import(sourceUrl(name));
function globalValue(t,key,value){const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key]);}
function fixture(type='text'){
 const user={id:'u_one',username:'one',displayName:'One',pronouns:'they/them',bio:'**A bio**',createdAt:'2026-01-01',status:'online',badges:[]};
 const server={id:'s_one',ownerId:user.id,role:'owner',roles:[],members:[{userId:user.id,role:'owner',roleIds:[]}],channels:[{id:'c_one',serverId:'s_one',name:'general',type,topic:'',allowAttachments:true}]};
 return {config:{maxMessageLength:8000},user,users:[user],servers:[server],dms:[],activeServer:server.id,activeConv:'c_one',messages:[],pins:[],connected:true,revealedSpoilers:new Set(),forumLayout:'grid',collectionLayout:'grid'};
}

test('latest indicator ignores small scrolls, clicks, loading and non-scrollable history',async()=>{
 const {showLatest,ChatScroll}=await browserModule('chat-scroll.js');
 const base={following:false,history:false,loading:false,distance:0,unread:0,scrollable:true};
 for(const distance of [0,1,50,179])assert.equal(showLatest({...base,distance}),false);
 assert.equal(showLatest({...base,distance:180}),true);assert.equal(showLatest({...base,distance:500,following:true}),false);assert.equal(showLatest({...base,distance:500,loading:true}),false);assert.equal(showLatest({...base,distance:500,scrollable:false}),false);assert.equal(showLatest({...base,history:true,scrollable:false}),true);
 let following=true;const scroll=new ChatScroll({getFollow:()=>following,setFollow:value=>{following=value;},getHistory:()=>false,motion:()=>false,onChange:()=>{}});scroll.userIntent();assert.equal(following,true);
});
test('member groups use the first displayed role once, preserve role order and collect every offline member',async()=>{
 const {memberGroups}=await browserModule('role-display.js');
 const roles=[{id:'r_low',name:'Lower',position:2,displayMembers:true},{id:'r_high',name:'Higher',position:1,displayMembers:true},{id:'r_hidden',name:'Hidden',position:0,displayMembers:false}];
 const server={roles,ownerRolePosition:3,ownerRoleDisplay:true,members:[{userId:'owner',role:'owner',roleIds:[]},{userId:'both',role:'member',roleIds:['r_low','r_high']},{userId:'hidden',role:'member',roleIds:['r_hidden']},{userId:'offline',role:'member',roleIds:['r_high']},{userId:'none',role:'member',roleIds:[]}]};
 const users=server.members.map(member=>({id:member.userId,displayName:member.userId,status:member.userId==='offline'?'offline':'online'}));
 const groups=memberGroups(server,users);assert.deepEqual(groups.map(group=>group.key),['r_high','__owner__','online','offline']);assert.deepEqual(groups[0].members.map(user=>user.id),['both']);assert.deepEqual(groups.at(-1).members.map(user=>user.id),['offline']);assert.equal(new Set(groups.flatMap(group=>group.members.map(user=>user.id))).size,5);
 server.ownerRoleDisplay=false;roles.forEach(role=>{role.displayMembers=false;});assert.deepEqual(memberGroups(server,users).map(group=>group.key),['online','offline']);
});
test('crop rendering is bounded and cannot inject CSS from persisted metadata',async()=>{
 const {readCrop,cropStyle}=await browserModule('artwork.js');
 const crop={x:10,y:90,zoom:2};assert.deepEqual(readCrop(crop),crop);assert.match(cropStyle(crop),/object-position:10% 90%/);assert.match(cropStyle(crop),/scale\(2\)/);
 assert.equal(readCrop({x:'url(evil)',y:-1,zoom:100}).x,50);assert.equal(readCrop({zoom:100}).zoom,4);assert.ok(!cropStyle({x:'0;url(evil)'}).includes('evil'));
 assert.throws(()=>normalizeCrop({x:'0'}));assert.throws(()=>normalizeCrop({zoom:0}));assert.throws(()=>normalizeCrop({unknown:1}));assert.deepEqual(normalizeCrop({x:0,y:100,zoom:4}),{x:0,y:100,zoom:4});
});
test('profiles place pronouns beside the username and biography before roles without duplicating the server name',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();
 const html=ui.profileMarkup(state,state.user);assert.ok(html.indexOf('they/them')<html.indexOf('profile-bio'));assert.ok(html.indexOf('<strong>A bio</strong>')<html.indexOf('Server roles'));assert.ok(html.indexOf('Server roles')<html.indexOf('HERE SINCE'));assert.ok(!html.includes('Server roles <span>'));
 state.activeServer=null;const dm=ui.profileMarkup(state,state.user);assert.ok(!dm.includes('Server roles'));assert.ok(dm.includes('they/them'));
});
test('typing labels retain complete display names, escape them and summarize multiple writers',async()=>{
 const ui=await browserModule('ui.js');
 assert.equal(ui.typingMarkup([]),'');
 const single=ui.typingMarkup([{displayName:'QA Bob Smith <img src=x onerror=alert(1)>'}]);
 assert.ok(single.includes('QA Bob Smith &lt;img'));assert.ok(single.includes('is typing…'));assert.ok(!single.includes('<img'));
 const pair=ui.typingMarkup([{displayName:'Alice Green'},{displayName:'Bob Smith'}]);assert.ok(pair.includes('Alice Green</strong> and <strong>Bob Smith'));assert.ok(pair.includes('are typing…'));
 const many=ui.typingMarkup(['A','B','C','D','E'].map(displayName=>({displayName})));assert.ok(many.includes('and 2 others'));assert.ok(!many.includes('<strong>D</strong>'));
 const chat=ui.chatMarkup(fixture());assert.ok(chat.includes('id="typing-status"'));assert.ok(chat.includes('class="composer-shortcuts"'));assert.ok(chat.includes('id="character-count"'));
});
test('forum roots use grid/list publishing while opened posts retain the chat composer',async()=>{
 const ui=await browserModule('ui.js'),state=fixture('forum');
 const root=ui.chatMarkup(state);assert.ok(root.includes('data-action="forum-post"'));assert.ok(root.includes('aria-label="Forum layout"'));assert.ok(!root.includes('id="message-input"'));assert.ok(!root.includes('id="jump-latest"'));
 const post={id:'m_root',authorId:state.user.id,conversationId:state.activeConv,text:'A post',createdAt:'2026-01-01',reactions:[],attachments:[]};state.activeThread=post;assert.ok(ui.chatMarkup(state).includes('id="message-input"'));
 state.activeThread=null;state.servers[0].channels[0].type='media';const media=ui.chatMarkup(state);assert.ok(media.includes('Add media or files'));assert.ok(!media.includes('id="jump-latest"'));
});
test('consecutive mention highlights join and document spoilers mount no file URL until revealed',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();
 state.messages=[0,1,2].map((value)=>({id:'m_'+value,conversationId:state.activeConv,authorId:state.user.id,text:'@everyone '+value,createdAt:`2026-01-01T12:00:0${value}Z`,mentions:[state.user.id],reactions:[],attachments:[]}));
 let html=ui.messagesMarkup(state);assert.equal((html.match(/mention-connected-before/g)||[]).length,2);assert.equal((html.match(/mention-connected-after/g)||[]).length,2);
 state.messages[1].mentions=[];html=ui.messagesMarkup(state);assert.ok(!html.includes('mention-connected-before'));
 const message={...state.messages[0],attachments:[{id:'f_doc',name:'private.pdf',url:'/files/f_doc',type:'application/pdf',size:100,spoiler:true}]};html=ui.renderMessage(state,message);assert.ok(html.includes('Spoiler attachment'));assert.ok(!html.includes('/files/f_doc'));assert.ok(!html.includes('data-action="download-file"'));
 state.revealedSpoilers.add('m_0:0');assert.ok(ui.renderMessage(state,message).includes('data-action="download-file"'));
});
test('touch message gestures reply, expose actions and cancel a long press after movement',async t=>{
 const handlers=new Map(),classes=new Set(),style=new Map(),actions=[],message={dataset:{message:'m_one'},style:{setProperty:(key,value)=>style.set(key,value),removeProperty:key=>style.delete(key)},classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)},contains:target=>target===content};
 const content={closest:selector=>selector==='.message[data-message]'?message:null},document={addEventListener:(type,fn)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);},querySelector:selector=>selector==='#app'?{classList:{contains:()=>false}}:null,getSelection:()=>({isCollapsed:true})};
 globalValue(t,'document',document);globalValue(t,'window',{innerWidth:390});t.mock.timers.enable({apis:['setTimeout']});
 const {installGestures}=await browserModule('gestures.js');installGestures({enabled:()=>true,reply:id=>actions.push(['reply',id]),messageOptions:id=>actions.push(['options',id]),canReply:()=>true});
 const fire=(type,x,y)=>{const event={target:content,pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,preventDefault:()=>{},stopImmediatePropagation:()=>{}};for(const fn of handlers.get(type)||[])fn(event);};
 fire('pointerdown',100,200);fire('pointermove',180,205);fire('pointerup',180,205);assert.deepEqual(actions,[['reply','m_one']]);assert.equal(style.size,0);
 fire('pointerdown',180,200);fire('pointerup',100,205);assert.deepEqual(actions.at(-1),['options','m_one']);
 fire('pointerdown',100,200);fire('pointermove',102,240);t.mock.timers.tick(600);fire('pointerup',102,240);assert.equal(actions.length,2);
 fire('pointerdown',100,200);t.mock.timers.tick(600);assert.deepEqual(actions.at(-1),['options','m_one']);assert.equal(actions.length,3);
});

test('unread activity aggregates server channels independently from DMs and preserves official markers',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();
 state.servers[0].official=true;state.servers[0].channels[0].unread=2;state.servers[0].channels.push({id:'c_two',name:'second',type:'text',unread:4});state.dms=[{id:'d_one',peerId:state.user.id,unread:3}];
 assert.equal(ui.serverUnreadCount(state.servers[0]),6);assert.equal(ui.totalUnreadCount(state),9);
 const navigation=ui.renderNavigation(state);assert.ok(navigation.includes('data-unread="6"'));assert.ok(navigation.includes('data-unread="3"'));
 state.activeServer=null;state.homeTab='spaces';const sidebar=ui.renderSidebar(state,{});assert.ok(sidebar.includes('data-unread="6"'));assert.ok(sidebar.includes((await browserModule('icons.js')).icon('shield',17)));assert.ok(sidebar.includes('6 unread messages'));
 state.servers[0].channels[0].unread=0;assert.equal(ui.serverUnreadCount(state.servers[0]),4);assert.equal(ui.totalUnreadCount(state),7);
 state.servers[0].channels[1].unread=150;assert.ok(ui.renderSidebar(state,{}).includes('99+'));assert.ok(ui.renderSidebar(state,{}).includes('150 unread messages'));
 state.servers[0].channels[1].unread=0;assert.ok(!ui.renderNavigation(state).includes('data-unread="0"'));assert.equal(ui.totalUnreadCount(state),3);
 assert.equal(ui.unreadCount([{unread:-1},{unread:NaN},{unread:'2'},{unread:1}]),1);
});
test('message groups mark continuation for text and emoji and stop at author, reply and time boundaries',async()=>{
 const ui=await browserModule('ui.js'),{groupMessage}=await browserModule('chat-tools.js'),state=fixture();
 state.messages=['Sooo','What do you think?','There are a lot of changes','😍','😀'].map((text,index)=>({id:'m_spacing_'+index,conversationId:state.activeConv,authorId:state.user.id,text,createdAt:`2026-10-26T12:00:0${index}Z`,reactions:[],attachments:[]}));
 let html=ui.messagesMarkup(state);assert.equal((html.match(/\bcontinued\b/g)||[]).length,4);assert.equal((html.match(/\bgrouped\b/g)||[]).length,4);assert.equal((html.match(/class="emoji-message"/g)||[]).length,2);
 const previous=state.messages[0];assert.equal(groupMessage(previous,undefined),false);assert.equal(groupMessage(previous,{...previous,authorId:'other'}),false);assert.equal(groupMessage(previous,{...previous,replyTo:'m_other'}),false);assert.equal(groupMessage(previous,{...previous,createdAt:'2026-10-26T12:06:00Z'}),false);assert.equal(groupMessage(previous,{...previous,createdAt:'2026-10-26T13:00:00Z'}),false);
 state.messages[2].authorId='other';html=ui.messagesMarkup(state);assert.equal((html.match(/\bcontinued\b/g)||[]).length,2);
});

test('a timeout removes write and call controls, preserves its reason and shows an accurate countdown',async()=>{
 const ui=await browserModule('ui.js'),{remainingTime,activeTimeout}=await browserModule('moderation.js'),state=fixture();
 const now=Date.now();state.servers[0].moderation={kind:'mute',expiresAt:now+90061000,reason:'Repeated spam'};
 assert.equal(ui.canWrite(state),false);const html=ui.chatMarkup(state);assert.ok(!html.includes('id="message-input"'));assert.ok(html.includes('Repeated spam'));assert.ok(html.includes('data-moderation-countdown'));
 assert.ok(!ui.voiceControlMarkup(state,{active:null}).includes('data-action="join-voice"'));
 assert.equal(remainingTime(now+90061000,now),'1 day 1 hour 1 minute 1 second');assert.equal(remainingTime(null,now),'Permanent');assert.equal(remainingTime(now-100,now),'Expired');
 state.servers[0].moderation.expiresAt=now-100;assert.equal(activeTimeout(state.servers[0],now),null);assert.equal(ui.canWrite(state),true);
});
test('server discovery has one creation action and the sidebar has one join action',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();state.activeServer=null;state.activeConv=null;state.homeTab='spaces';state.view='home';state.discovery=[];
 const sidebar=ui.renderSidebar(state,{}),home=ui.homeMarkup(state);
 assert.equal((sidebar.match(/data-action="join-server"/g)||[]).length,1);assert.ok(!sidebar.includes('data-action="create-server"'));assert.ok(!home.includes('data-action="join-server"'));assert.equal((home.match(/data-action="create-server"/g)||[]).length,1);
});
test('long rulebooks use safe section navigation and retain complete Markdown content',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();state.servers[0].rules='# Welcome\n## Respect\nBe **kind**.\n## Privacy\n<script>alert(1)</script>';
 const html=ui.rulesMarkup(state.servers[0]);assert.ok(html.includes('rules-reader'));assert.equal((html.match(/data-action="rules-section"/g)||[]).length,3);assert.ok(html.includes('<strong>kind</strong>'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('rules-section-2'));
});

test('settings expose artwork editing on the preview and keep destructive actions beside normal actions',async()=>{
 const ui=await browserModule('ui.js'),state=fixture(),prefs={};state.user.avatar='/files/f_avatar';state.user.banner='/files/f_banner';
 const html=ui.settingsMarkup(state,'profile',prefs,state.user);
 assert.ok(!html.includes('Profile, sounds and appearance.'));assert.ok(!html.includes('data-sync-status'));assert.ok(!html.includes('artwork-controls'));
 assert.ok(html.includes('aria-label="Edit profile picture"'));assert.ok(html.includes('aria-label="Edit profile banner"'));
 const account=ui.settingsPageMarkup(state,'account',prefs,state.user);assert.match(account,/<div class="account-actions">[\s\S]*data-action="logout"[\s\S]*data-action="delete-account"/);assert.ok(!account.includes('danger-zone'));
 const server=state.servers[0],settings=ui.serverSettingsMarkup(server,server,1024,32000);assert.match(settings,/<div class="modal-footer settings-actions">[\s\S]*data-action="delete-server"[\s\S]*Save changes/);assert.ok(!settings.includes('danger-zone'));assert.ok(settings.includes('aria-label="Edit server icon"'));assert.ok(settings.includes('aria-label="Edit server banner"'));
 const publicCard=ui.profileCard(state.user),publicServer=ui.serverImagePreview(server);assert.ok(!publicCard.includes('data-action="artwork-menu"'));assert.ok(!publicServer.includes('data-action="artwork-menu"'));
});
test('activity rendering explains legacy actions and escapes structured changes and actor names',async()=>{
 const {auditEntryMarkup}=await browserModule('audit.js');
 const html=auditEntryMarkup({action:'server.updated',createdAt:'2026-10-26T12:00:00Z',actorName:'<b>Actor</b>',actorUsername:'actor',metadata:{targetName:'A server',changes:[{label:'Name',before:'Old name',after:'<img src=x onerror=alert(1)>'}]}});
 assert.ok(html.includes('Server settings updated'));assert.ok(html.includes('Old name'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;b&gt;Actor'));
 assert.ok(auditEntryMarkup({action:'layout.updated',createdAt:'2026-01-01',metadata:{}}).includes('Channels and categories rearranged'));
});
