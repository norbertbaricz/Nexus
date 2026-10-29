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

test('return-to-call strip follows the active call across DMs, servers and other views',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();
 const room={id:'v_live',serverId:'s_one',name:'The Lounge',type:'voice'};state.servers[0].channels.push(room);
 const call={active:{conversationId:room.id}};
 for(const view of ['chat','home','voice']){
  state.view=view;
  const html=ui.callDockMarkup(state,call);
  assert.ok(html.includes('The Lounge'));assert.ok(html.includes('In voice room'));
  assert.equal((html.match(/data-action="return-to-call"/g)||[]).length,1);
  assert.equal((html.match(/data-action="leave-voice"/g)||[]).length,1);
 }
 state.activeConv=room.id;state.view='voice';assert.equal(ui.callDockMarkup(state,call),'');
 state.view='chat';assert.ok(ui.callDockMarkup(state,call));
 const peer={id:'u_peer',displayName:'Member <test> "one"',username:'peer'};state.users.push(peer);state.dms.push({id:'dm_live',peerId:peer.id});
 state.activeServer=null;state.activeConv='dm_live';call.active.conversationId='dm_live';
 const html=ui.callDockMarkup(state,call);assert.ok(html.includes('In voice call'));assert.ok(html.includes('Member &lt;test&gt; &quot;one&quot;'));assert.ok(!html.includes('<test>'));
 state.view='voice';assert.equal(ui.callDockMarkup(state,call),'');
 state.view='chat';state.activeServer='s_one';state.activeConv='c_one';assert.ok(ui.callDockMarkup(state,call).includes('In voice call'));
 for(const stopped of [{},{active:null},{active:{}}])assert.equal(ui.callDockMarkup(state,stopped),'');
 state.user=null;assert.equal(ui.callDockMarkup(state,call),'');
});

test('sign-in accepts complete copied usernames and recovery forms keep secrets out of markup',async()=>{
 const security=await browserModule('security-ui.js'),config={minPasswordLength:10};
 const login=security.authScreenMarkup('login',config,{notice:'<img src=x onerror=alert(1)>'});
 assert.match(login,/name="username"[^>]*maxlength="128"/);assert.ok(login.includes('Forgot password?'));assert.ok(login.includes('&lt;img'));assert.ok(!login.includes('<img'));
 const registration=security.authScreenMarkup('register',config);assert.match(registration,/name="username"[^>]*maxlength="24"/);
 const token='A'.repeat(43);assert.deepEqual(security.readRecoveryFragment('#reset-password='+token),{mode:'reset-password',token});assert.deepEqual(security.readRecoveryFragment('#verify-email='+token),{mode:'verify-email',token});
 for(const invalid of ['#reset-password=short','#reset-password='+token+'&next=evil','#other='+token])assert.equal(security.readRecoveryFragment(invalid),null);
 const reset=security.authScreenMarkup('reset-password',config);assert.ok(reset.includes('name="confirmPassword"'));assert.ok(!reset.includes(token));assert.ok(!reset.includes('type="hidden"'));
 const codes=security.authScreenMarkup('recovery-code',config);assert.ok(codes.includes('name="recoveryCode"'));assert.ok(codes.includes('contact your server administrator'));
});
test('private recovery settings escape addresses, require current passwords and support offline codes',async()=>{
 const security=await browserModule('security-ui.js');
 const value={email:'<unsafe>@example.test',pendingEmail:'pending@example.test',remainingCodes:8,emailAvailable:false};
 const panel=security.accountSecurityMarkup(value);assert.ok(panel.includes('&lt;unsafe&gt;'));assert.ok(!panel.includes('<unsafe>'));assert.ok(panel.includes('data-action="generate-recovery-codes"'));assert.ok(panel.includes('data-action="setup-recovery-email"'));assert.ok(!panel.includes('data-action="setup-recovery-email" disabled'));assert.ok(panel.includes('host has not enabled email delivery')); assert.ok(panel.includes('8 codes remaining'));
 for(const html of [security.recoveryEmailFormMarkup(value),security.recoveryEmailFormMarkup(value,true),security.recoveryCodesFormMarkup()])assert.ok(html.includes('autocomplete="current-password"'));
 const codes=security.recoveryCodesMarkup(['NXS-<unsafe>']);assert.ok(codes.includes('NXS-&lt;unsafe&gt;'));assert.ok(codes.includes('data-action="download-recovery-codes"'));assert.ok(!codes.includes('<unsafe>'));
});
test('context menus follow server permissions and keep destructive actions behind existing confirmations',async()=>{
 const {contextMenuModel,contextMenuMarkup}=await browserModule('context-menu.js'),state=fixture(),server=state.servers[0];server.name='A <private> server';server.categories=[];
 let model=contextMenuModel(state,{kind:'server',id:server.id});assert.ok(model.items.some(item=>item.action==='delete-server'));assert.ok(!model.items.some(item=>item.action==='leave-server'));assert.ok(model.items.some(item=>item.action==='server-settings'));
 const html=contextMenuMarkup(model);assert.ok(html.includes('role="menu"'));assert.ok(html.includes('role="menuitem"'));assert.ok(html.includes('A &lt;private&gt; server'));assert.ok(!html.includes('<private>'));assert.ok(!html.includes('confirm-delete-server'));
 server.role='member';server.permissions={};model=contextMenuModel(state,{kind:'server',id:server.id});assert.ok(model.items.some(item=>item.action==='leave-server'));assert.ok(!model.items.some(item=>['server-settings','add-channel','delete-server','invite'].includes(item.action)));
 state.servers=[];state.discovery=[{id:'s_public',name:'Public fixture'}];model=contextMenuModel(state,{kind:'server',id:'s_public'});assert.deepEqual(model.items.map(item=>item.action),['discover-server','context-copy']);
});
test('channel, category and DM menus retain the clicked target when another conversation is active',async()=>{
 const {contextMenuModel}=await browserModule('context-menu.js'),state=fixture(),server=state.servers[0];
 server.categories=[{id:'cat_one',name:'FIRST'},{id:'cat_two',name:'SECOND'}];server.channels.push({id:'c_voice',serverId:server.id,name:'Voice',type:'voice',unread:2});
 let model=contextMenuModel(state,{kind:'conversation',id:'c_voice'});assert.equal(model.items.find(item=>item.key==='open').label,'Join voice room');assert.equal(model.items.find(item=>item.key==='settings').id,'c_voice');assert.equal(model.items.find(item=>item.key==='settings').serverId,server.id);
 state.collapsedCategories={cat_two:true};model=contextMenuModel(state,{kind:'category',id:'cat_two'});assert.equal(model.items.find(item=>item.key==='toggle').label,'Expand category');assert.ok(model.items.some(item=>item.key==='up'));assert.ok(!model.items.some(item=>item.key==='down'));
 state.users.push({id:'u_peer',username:'peer',displayName:'Peer'});state.dms=[{id:'dm_other',peerId:'u_peer',unread:3}];model=contextMenuModel(state,{kind:'conversation',id:'dm_other'});assert.equal(model.items.find(item=>item.key==='delete').id,'dm_other');assert.equal(model.items.find(item=>item.key==='call').id,'dm_other');assert.equal(model.items.find(item=>item.key==='profile').id,'u_peer');
 state.blockedIds=['u_peer'];assert.equal(contextMenuModel(state,{kind:'conversation',id:'dm_other'}),null);
});
test('attachment context actions preserve spoilers and the existing per-channel download policy',async()=>{
 const {contextMenuModel,contextMenuMarkup}=await browserModule('context-menu.js'),state=fixture(),server=state.servers[0];
 const message={id:'m_attachment',conversationId:state.activeConv,authorId:state.user.id,text:'A caption',attachments:[{name:'Secret <image>.png',type:'image/png',url:'/files/private',spoiler:true}]};state.messages=[message];
 const target={kind:'message',id:message.id,index:0};let model=contextMenuModel(state,target);assert.ok(model.items.some(item=>item.key==='reveal'));assert.ok(!model.items.some(item=>['view','download','filename'].includes(item.key)));assert.ok(!contextMenuMarkup(model).includes('/files/private'));
 state.revealedSpoilers.add(message.id+':0');model=contextMenuModel(state,target);assert.ok(model.items.some(item=>item.key==='view'));assert.ok(!model.items.some(item=>item.key==='download'));
 server.channels[0].type='media';assert.ok(contextMenuModel(state,target).items.some(item=>item.key==='download'));
 server.role='member';server.permissions={downloadFiles:false,sendMessages:false};assert.ok(!contextMenuModel(state,target).items.some(item=>item.key==='download'));
});
test('forum menus open posts, self menus expose status, and artwork choices require editable ownership',async()=>{
 const {contextMenuModel}=await browserModule('context-menu.js'),ui=await browserModule('ui.js'),state=fixture('forum');
 state.messages=[{id:'m_forum',authorId:state.user.id,text:'A post',createdAt:'2026-01-01',attachments:[],replyCount:0}];assert.ok(ui.forumMarkup(state).includes('data-message="m_forum"'));assert.ok(contextMenuModel(state,{kind:'message',id:'m_forum'}).items.some(item=>item.key==='open'));
 const self=contextMenuModel(state,{kind:'self'});assert.equal(self.items.filter(item=>item.action==='set-status').length,4);
 const target={kind:'artwork',purpose:'server',imageKind:'banner'},draft={id:state.servers[0].id,banner:'/files/banner'};assert.ok(contextMenuModel(state,target,{serverDraft:draft}).items.some(item=>item.key==='adjust'));
 state.servers[0].role='member';state.servers[0].permissions={};assert.equal(contextMenuModel(state,target,{serverDraft:draft}),null);
});
test('context targeting preserves native text/link/media menus and ignores unrelated blank surfaces',async()=>{
 const {resolveContextTarget}=await browserModule('context-menu.js');
 for(const marker of ['input','textarea','select','a[href]','video','audio'])assert.equal(resolveContextTarget({closest:selector=>selector.includes(marker)?{}:null},'s_one'),null);
 assert.equal(resolveContextTarget({closest:()=>null},'s_one'),null);
 const node={dataset:{id:'c_target'}};const target=resolveContextTarget({closest:selector=>selector==='[data-action=conversation][data-id]'?node:null},'s_one');assert.equal(target.kind,'conversation');assert.equal(target.id,'c_target');
 const edit={dataset:{purpose:'profile',kind:'avatar'}},surface={querySelector:()=>edit};
 const artwork=resolveContextTarget({closest:selector=>selector==='.artwork-surface'?surface:null},'s_one');assert.equal(artwork.kind,'artwork');assert.equal(artwork.imageKind,'avatar');assert.equal(artwork.node,surface);
});
test('long-press context actions cancel during scrolling and suppress the following native click',async t=>{
 const handlers=new Map(),opened=[],node={contains:target=>target===content},content={closest:()=>null};
 globalValue(t,'document',{addEventListener:(type,handler)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(handler);},querySelector:()=>null,getSelection:()=>({isCollapsed:true})});globalValue(t,'window',{innerWidth:390,document:globalThis.document,AbortController,PointerEvent:class{},setTimeout:(...args)=>setTimeout(...args),clearTimeout:(...args)=>clearTimeout(...args)});t.mock.timers.enable({apis:['setTimeout']});
 const {installGestures}=await browserModule('gestures.js');installGestures({enabled:()=>true,contextTarget:()=>({kind:'conversation',id:'c_touch',node}),contextOptions:target=>opened.push(target.id)});
 const fire=(type,x,y)=>{let prevented=false;const event={target:content,pointerType:'touch',pointerId:1,isPrimary:true,clientX:x,clientY:y,preventDefault(){prevented=true;},stopImmediatePropagation(){}};for(const handler of handlers.get(type)||[])handler(event);return prevented;};
 fire('pointerdown',100,200);fire('pointermove',102,240);t.mock.timers.tick(600);fire('pointerup',102,240);assert.equal(opened.length,0);
 fire('pointerdown',100,200);t.mock.timers.tick(600);assert.deepEqual(opened,['c_touch']);assert.equal(fire('click',100,200),true);
});

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
 globalValue(t,'document',document);globalValue(t,'window',{innerWidth:390,document:globalThis.document,AbortController,PointerEvent:class{},setTimeout:(...args)=>setTimeout(...args),clearTimeout:(...args)=>clearTimeout(...args)});t.mock.timers.enable({apis:['setTimeout']});
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

test('member rows omit role subtitles, keep grouping and profiles retain the full role list',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();state.servers[0].roles=[{id:'r',name:'Tester',displayMembers:true,position:1}];state.servers[0].members[0].roleIds=['r'];
 const rows=ui.renderMembers(state);assert.ok(rows.includes('member-section-title'));assert.ok(!rows.includes('<small>'));assert.ok(ui.profileMarkup(state,state.user).includes('Tester'));
 const sidebar=ui.renderSidebar(state,{muted:true,deafened:true});assert.ok(sidebar.includes('aria-label="Unmute microphone"'));assert.ok(sidebar.includes('aria-label="Undeafen"'));
 const header=ui.chatHeader({...state,dms:[{id:'d',peerId:state.user.id}],activeConv:'d',activeServer:null},'One',{dm:true});assert.ok(header.includes('data-action="start-call"'));assert.ok(!header.includes('start-video'));
 state.activeServer=null;state.homeTab='spaces';assert.ok(ui.homeMarkup(state).includes('data-action="search-discovery"'));
});
test('DM previews describe actual files and protect spoiler names instead of claiming there are no messages',async()=>{
 const {messagePreview}=await browserModule('message-preview.js'),ui=await browserModule('ui.js'),state=fixture();
 assert.equal(messagePreview(null),'No messages yet');
 for(const [type,label] of [['image/png','Photo'],['image/gif','GIF'],['video/mp4','Video'],['audio/ogg','Audio'],['application/pdf','Document · guide.pdf'],['application/zip','File · bundle.zip']]){
  const message={text:'',attachments:[{type,name:type==='application/pdf'?'guide.pdf':'bundle.zip'}]};assert.equal(messagePreview(message),label);
 }
 assert.equal(messagePreview({attachments:[{type:'image/png',spoiler:true,name:'secret.png'}]}),'Spoiler attachment');assert.equal(messagePreview({attachments:[{},{}]}),'2 attachments');
 state.activeServer=null;state.homeTab='inbox';state.dms=[{id:'d',peerId:state.user.id,lastMessage:{attachments:[{type:'application/pdf',name:'<script>.pdf'}]}}];
 const html=ui.renderSidebar(state,{});assert.ok(html.includes('Document · &lt;script&gt;.pdf'));assert.ok(!html.includes('No messages yet'));
});
test('public discovery ignores stale responses, appends unique results and retains errors for retry',async()=>{
 const {DiscoverySearch}=await browserModule('discovery.js'),pending=[];
 const page=new DiscoverySearch({request:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})),onChange:()=>{}});
 const old=page.search('old'),fresh=page.search('fresh');pending[1].resolve({servers:[{id:'1'}],hasMore:true,nextOffset:24});await fresh;
 pending[0].resolve({servers:[{id:'old'}],hasMore:false});await old;assert.deepEqual(page.servers,[{id:'1'}]);assert.equal(page.query,'fresh');
 const more=page.more();assert.ok(pending[2].url.includes('offset=24'));pending[2].resolve({servers:[{id:'1'},{id:'2'}],hasMore:false,nextOffset:null});await more;assert.equal(page.servers.length,2);
 const failed=page.search('failure');pending[3].reject(new Error('Offline'));await failed;assert.equal(page.error,'Offline');assert.equal(page.loading,false);
 const cancelled=page.search('cancelled');page.cancel();pending[4].resolve({servers:[{id:'late'}],hasMore:false});await cancelled;assert.equal(page.servers.length,0);
});
test('shared tooltip geometry keeps labels inside narrow viewport edges',async()=>{
 const {tooltipPosition}=await browserModule('tooltips.js');
 const top=tooltipPosition({left:0,top:0,bottom:40,width:30},{width:270,height:70},{width:320,height:480});assert.ok(top.left>=8);assert.ok(top.top>=40);assert.ok(top.left+270<=312);
 const bottom=tooltipPosition({left:300,top:450,bottom:480,width:20},{width:200,height:40},{width:320,height:480});assert.ok(bottom.left+200<=312);assert.ok(bottom.top+40<450);
});

test('notices stay above the composer while message controls scroll and stack height changes',async t=>{
 const {Notices}=await browserModule('notices.js');let height=80;
 const visual={width:390,height:844,scale:1,offsetTop:0,offsetLeft:0},composer={getBoundingClientRect:()=>({top:740,bottom:844,width:390,height:104})};
 globalValue(t,'window',{innerWidth:390,innerHeight:844,visualViewport:visual});globalValue(t,'document',{querySelector:()=>null,querySelectorAll:selector=>{assert.ok(!selector.includes('button'));return[composer];}});
 const root={children:[{}],style:{},getBoundingClientRect:()=>({height:Math.min(height,parseFloat(root.style.maxHeight)||Infinity)})},notices=Object.create(Notices.prototype);notices.root=root;
 notices.resize();const original={top:root.style.top,left:root.style.left,width:root.style.width};
 for(let index=0;index<12;index++){notices.resize(true);assert.deepEqual({top:root.style.top,left:root.style.left,width:root.style.width},original);}
 const bottom=parseFloat(root.style.top)+height;height=140;notices.resize();assert.equal(parseFloat(root.style.top)+height,bottom);
 window.innerHeight=visual.height=390;notices.resize();assert.ok(parseFloat(root.style.top)>=12);assert.ok(parseFloat(root.style.top)+140<=378);
});
test('modal notices keep a deterministic bottom anchor without reading scrolling inner buttons',async t=>{
 const {Notices}=await browserModule('notices.js'),box={left:12,width:296,bottom:468},modal={getBoundingClientRect:()=>box,querySelectorAll:()=>{throw new Error('Do not scan scrolling controls');}};
 globalValue(t,'window',{innerWidth:320,innerHeight:480});globalValue(t,'document',{querySelector:selector=>selector==='#modal-root .modal'?modal:null});
 const root={children:[{}],style:{},getBoundingClientRect:()=>({height:80})},notices=Object.create(Notices.prototype);notices.root=root;
 notices.resize();const original={top:root.style.top,left:root.style.left,width:root.style.width};assert.equal(root.style.top,'296px');
 for(let index=0;index<8;index++){notices.resize(true);assert.deepEqual({top:root.style.top,left:root.style.left,width:root.style.width},original);}
});
test('a tall notice stack does not overlap dialog actions through an insufficient gap below the dialog',async t=>{
 const {Notices}=await browserModule('notices.js'),modal={getBoundingClientRect:()=>({left:12,width:296,bottom:380}),querySelector:()=>({getBoundingClientRect:()=>({top:320})})};
 globalValue(t,'window',{innerWidth:320,innerHeight:480});globalValue(t,'document',{querySelector:selector=>selector==='#modal-root .modal'?modal:null});
 const root={children:[{}],style:{},getBoundingClientRect:()=>({height:140})},notices=Object.create(Notices.prototype);notices.root=root;notices.resize();assert.ok(parseFloat(root.style.top)+140<320);
});
test('all interface palettes are accepted by account sync and retain readable dark surfaces',async()=>{
 const {PALETTES,paletteTokens}=await browserModule('appearance.js'),ui=await browserModule('ui.js'),{normalizePreferences}=require('../server/preferences');assert.equal(Object.keys(PALETTES).length,16);
 const luminance=hex=>{const rgb=hex.match(/[\da-f]{2}/gi).map(part=>parseInt(part,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 for(const [key,palette] of Object.entries(PALETTES)){assert.equal(normalizePreferences({palette:key}).palette,key);const tokens=paletteTokens(key);assert.match(tokens['--bg'],/13% 7%/);assert.ok((luminance(palette.accent)+.05)/(luminance(tokens['--accent-ink'])+.05)>7);assert.ok(ui.appearanceMarkup({palette:key}).includes(`data-palette="${key}" aria-pressed="true"`));}
});
test('status avatars use shared descriptions and standalone profiles support keyboard focus',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();state.user.displayName='A < B';state.user.status='dnd';
 const html=ui.profileMarkup(state,state.user);assert.ok(html.includes('data-tooltip="A &lt; B · Do not disturb"'));assert.ok(html.includes('tabindex="0" role="img" aria-label="A &lt; B · Do not disturb"'));
 const sidebar=ui.renderSidebar(state,{});assert.ok(!sidebar.includes('tabindex="0" role="img"'));assert.ok(!html.includes('title="Do not disturb"'));
});
test('an open shared tooltip follows status changes and preserves the latest native description on exit',async()=>{
 const {Tooltips}=await browserModule('tooltips.js'),attributes=new Map([['title','Away']]),seen=[];
 const anchor={isConnected:true,dataset:{tooltip:'Person · Away'},getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),hasAttribute:key=>attributes.has(key)};
 const tooltip=Object.create(Tooltips.prototype);Object.assign(tooltip,{anchor,originalTitle:'Online',node:{hidden:false},anchorObserver:{disconnect(){}},show(){seen.push(this.label());}});
 tooltip.refresh();assert.deepEqual(seen,['Person · Away']);assert.equal(attributes.has('title'),false);attributes.set('title','Do not disturb');anchor.dataset.tooltip='Person · Do not disturb';tooltip.refresh();tooltip.hide();assert.equal(attributes.get('title'),'Do not disturb');assert.equal(tooltip.node.hidden,true);
});

function viewerFixture(t,{type='image/png',width=1600,height=900}={}){
 const observed=[],events=new Map(),content={style:{}},out={disabled:false},inside={disabled:false};
 const stage={isConnected:true,clientWidth:360,clientHeight:480,scrollLeft:0,scrollTop:0,classList:{toggle(){},remove(){}},querySelector(selector){return selector==='.viewer-stage-content'?content:media;},get scrollWidth(){return Math.max(this.clientWidth,parseFloat(content.style.width)||0);},get scrollHeight(){return Math.max(this.clientHeight,parseFloat(content.style.height)||0);}};
 let paused=0,markup='',renders=0;
 const media={style:{},classList:{contains:name=>name==='viewer-image'&&type.startsWith('image/')||name==='viewer-video'&&type.startsWith('video/')},naturalWidth:type.startsWith('image/')?width:0,naturalHeight:type.startsWith('image/')?height:0,videoWidth:type.startsWith('video/')?width:0,videoHeight:type.startsWith('video/')?height:0,addEventListener:(name,callback)=>events.set(name,callback),removeEventListener:(name,callback)=>{if(events.get(name)===callback)events.delete(name);},pause(){paused++;}};
 class Observer {constructor(callback){this.callback=callback;observed.push(this);}observe(node){this.node=node;}disconnect(){this.node=null;}}
 globalValue(t,'window',{addEventListener(){}});globalValue(t,'document',{querySelector:selector=>selector==='.viewer-stage'?stage:selector.includes('data-delta="-1"')?out:inside});globalValue(t,'ResizeObserver',Observer);globalValue(t,'getComputedStyle',()=>({paddingLeft:'12px',paddingRight:'12px',paddingTop:'12px',paddingBottom:'12px'}));
 const state={messages:[{id:'m_viewer',text:'A caption',attachments:[{url:'/files/fixture',name:'fixture',type}]}]};
 return {state,stage,media,content,events,observed,out,inside,options:{getState:()=>state,showModal:html=>{markup=html;renders++;},escape:value=>String(value),canDownload:()=>false},get markup(){return markup;},get renders(){return renders;},get paused(){return paused;}};
}

test('image zoom stays bounded, preserves the open viewer and Fit resets its scroll',async t=>{
 const f=viewerFixture(t),{ImageViewer}=await browserModule('image-viewer.js'),viewer=new ImageViewer(f.options);
 viewer.open('m_viewer');assert.equal(f.out.disabled,true);assert.equal(f.renders,1);
 assert.equal(f.media.style.width,'');assert.equal(f.content.style.height,'');
 for(let n=0;n<30;n++)viewer.zoomBy(1);
 assert.equal(viewer.zoom,4);assert.equal(f.inside.disabled,true);assert.equal(f.renders,1);assert.ok(f.stage.scrollLeft>0);
 viewer.resetZoom();assert.equal(viewer.zoom,1);assert.equal(f.stage.scrollLeft,0);assert.equal(f.stage.scrollTop,0);assert.equal(f.out.disabled,true);assert.equal(f.inside.disabled,false);
 for(let n=0;n<30;n++)viewer.zoomBy(-1);assert.equal(viewer.zoom,1);
});

test('video retains automatic containment through metadata and resizing, and closing releases playback',async t=>{
 const f=viewerFixture(t,{type:'video/mp4',width:0,height:0}),{ImageViewer}=await browserModule('image-viewer.js'),viewer=new ImageViewer(f.options);
 viewer.open('m_viewer');assert.ok(!f.markup.includes('data-action="viewer-zoom"'));assert.equal(f.observed[0].node,f.stage);
 viewer.zoomBy(1);assert.equal(viewer.zoom,1);
 f.media.videoWidth=1080;f.media.videoHeight=1920;f.events.get('loadedmetadata')();
 assert.equal(f.media.style.height,'456px');assert.equal(f.media.style.width,'256.5px');
 f.stage.clientWidth=700;f.stage.clientHeight=200;f.observed[0].callback();
 assert.equal(f.media.style.height,'176px');assert.equal(f.media.style.width,'99px');
 assert.equal(f.content.style.width,'');assert.equal(f.content.style.height,'');assert.equal(f.renders,1);
 viewer.close();assert.equal(f.events.size,0);assert.equal(f.paused,1);assert.equal(f.observed[0].node,null);assert.equal(viewer.stage,null);assert.equal(viewer.items.length,0);
});

test('switching media pauses playback and keeps one close action with no empty footer',async t=>{
 const f=viewerFixture(t,{type:'audio/wav'}),{ImageViewer}=await browserModule('image-viewer.js'),viewer=new ImageViewer(f.options);
 f.state.messages[0].text='';f.state.messages[0].attachments.push({url:'/files/second',name:'Second',type:'audio/wav'});
 viewer.open('m_viewer');assert.equal((f.markup.match(/data-action="close-modal"/g)||[]).length,1);assert.ok(f.markup.includes('aria-label="Media navigation"'));
 viewer.navigate(1);assert.equal(viewer.index,1);assert.equal(f.paused,1);assert.equal(f.renders,2);
 f.state.messages[0].attachments.pop();viewer.open('m_viewer');assert.ok(!f.markup.includes('viewer-footer'));assert.ok(!f.markup.includes('viewer-download'));
});

test('each server restores its last channel across every supported channel type',async()=>{
 const {lastServerChannel,validChannelHistory}=await browserModule('navigation.js');
 for(const type of ['text','announcement','forum','media','voice','stage']){
  const server={id:'s_one',channels:[{id:'c_general',name:'general',type:'text'},{id:'c_last',name:'Last channel',type}]};
  const history=validChannelHistory([server],JSON.parse(JSON.stringify({s_one:'c_last'})));
  assert.equal(lastServerChannel(server,history).id,'c_last',type);
 }
});

test('server history remains independent across servers, channel renames and reordering',async()=>{
 const {lastServerChannel,validChannelHistory}=await browserModule('navigation.js');
 const servers=[{id:'s_one',channels:[{id:'c_one',name:'Renamed',type:'forum'},{id:'c_general',name:'general',type:'text'}]},
  {id:'s_two',channels:[{id:'c_other',name:'Different first channel',type:'text'},{id:'c_two',name:'Stage',type:'stage'}]}];
 const history=validChannelHistory(servers,JSON.parse(JSON.stringify({s_one:'c_one',s_two:'c_two'})));
 assert.equal(lastServerChannel(servers[0],history).id,'c_one');assert.equal(lastServerChannel(servers[1],history).id,'c_two');
 servers[0].channels.reverse();assert.equal(lastServerChannel(servers[0],history).id,'c_one');
 assert.deepEqual(history,{s_one:'c_one',s_two:'c_two'});
});

test('removed channels, lost server access and channel IDs from another server are pruned',async()=>{
 const {lastServerChannel,validChannelHistory}=await browserModule('navigation.js');
 const servers=[{id:'s_one',channels:[{id:'c_general',name:'general',type:'text'}]},
  {id:'s_two',channels:[{id:'c_two',name:'Allowed',type:'text'}]}];
 const history=validChannelHistory(servers,{s_one:'c_removed',s_two:'c_general',s_left:'c_hidden'});
 assert.deepEqual(history,{});assert.equal(lastServerChannel(servers[0],history).id,'c_general');
 assert.deepEqual(validChannelHistory(servers,{s_one:'c_general',s_two:'c_two',s_left:'c_hidden'}),{s_one:'c_general',s_two:'c_two'});
 servers[0].channels=[];assert.equal(lastServerChannel(servers[0],{s_one:'c_general'}),null);
});

test('first visits and old or malformed navigation records retain the existing default channel',async()=>{
 const {lastServerChannel,validChannelHistory}=await browserModule('navigation.js');
 const server={id:'s_one',channels:[{id:'c_first',name:'First',type:'announcement'},{id:'c_general',name:'general',type:'text'}]};
 for(const history of [undefined,null,0,'invalid',[],{s_one:[]},{s_one:{id:'c_first'}}]){
  const clean=validChannelHistory([server],history);assert.deepEqual(clean,{});assert.equal(lastServerChannel(server,clean).id,'c_general');
 }
 assert.deepEqual(validChannelHistory([server],Object.create({s_one:'c_first'})),{});
 server.channels.pop();assert.equal(lastServerChannel(server,{}).id,'c_first');server.channels=[];assert.equal(lastServerChannel(server,{}),null);
});

test('people query normalization accepts one optional @ and keeps short-input handling predictable',async()=>{
 const {normalizeUsernameQuery}=await browserModule('chat-tools.js');
 for(const query of ['maxultimat3','@maxultimat3','  @maxultimat3  ','@ maxultimat3'])assert.equal(normalizeUsernameQuery(query),'maxultimat3');
 assert.equal(normalizeUsernameQuery('@'),'');assert.equal(normalizeUsernameQuery('@a'),'a');assert.equal(normalizeUsernameQuery('@@user'),'@user');
 assert.equal(normalizeUsernameQuery('hello@user'),'hello@user');assert.equal(normalizeUsernameQuery(null),'');
});

test('failed avatar images use safe initials without changing other media or the presence wrapper',async()=>{
 const ui=await browserModule('ui.js'),art={dataset:{avatarInitials:'KG'},textContent:''};
 const avatar=ui.avatar({id:'u_kg',displayName:'KG Member',avatar:'/files/f_image',status:'online'},{status:true});
 assert.ok(avatar.includes('data-avatar-initials="KM"'));assert.ok(avatar.includes('presence-ring'));assert.ok(avatar.includes('/files/f_image'));
 assert.equal(ui.avatarImageFailed({matches:selector=>selector==='.avatar-art > img',parentElement:art}),true);assert.equal(art.textContent,'KG');
 art.dataset.avatarInitials='<safe>';ui.avatarImageFailed({matches:()=>true,parentElement:art});assert.equal(art.textContent,'<safe>');
 assert.equal(ui.avatarImageFailed({matches:()=>false,parentElement:art}),false);assert.equal(ui.avatarImageFailed(null),false);
});

test('voice controls keep camera and audio available while hiding unsupported screen broadcasting',async()=>{
 const ui=await browserModule('ui.js'),call={muted:false,deafened:false,active:{conversationId:'native-voice'}};
 const desktop=ui.voiceButtons(call,{type:'dm'},null,true);assert.ok(desktop.includes('data-action="toggle-screen"'));assert.ok(desktop.includes('data-action="toggle-video"'));
 const mobile=ui.voiceButtons(call,{type:'dm'},null,false);assert.ok(!mobile.includes('data-action="toggle-screen"'));for(const action of ['mute','deafen','toggle-video','leave-voice'])assert.ok(mobile.includes(`data-action="${action}"`));
 const state={user:{id:'u'},activeConv:'native-voice',activeServer:null,servers:[],dms:[{id:'native-voice',type:'dm'}],screenCaptureAvailable:false};assert.ok(!ui.voiceControlMarkup(state,call).includes('data-action="toggle-screen"'));
});
test('call tile media and member actions share one group while local tiles retain only their own media actions',async()=>{
 const ui=await browserModule('ui.js'),state=fixture();state.users.push({id:'u_remote',displayName:'Remote <member>',username:'remote'});
 const remote={socketId:'peer_remote',userId:'u_remote',kind:'screen',sharing:true},html=ui.voiceTileMarkup(state,remote),group=html.indexOf('class="tile-actions"');
 assert.ok(group>=0);for(const action of ['focus-media','fullscreen-media','participant-menu'])assert.ok(html.indexOf(`data-action="${action}"`)>group,action);
 assert.equal((html.match(/class="tile-actions"/g)||[]).length,1);assert.match(html,/Remote &lt;member&gt;/);assert.ok(!html.includes('Remote <member>'));
 const local=ui.voiceTileActionsMarkup(state,{...remote,userId:state.user.id});assert.ok(local.includes('fullscreen-media'));assert.ok(!local.includes('participant-menu'));
 state.users.find(user=>user.id==='u_remote').displayName='New name';assert.match(ui.voiceTileActionsMarkup(state,remote),/Options for New name/);
});

test('device menus render escaped hardware names and expose selected and unavailable choices',async()=>{
 const {mediaMenuMarkup,mediaSettingsMarkup}=await browserModule('media-ui.js');
 const model={preferences:{microphoneId:'usb-mic',cameraId:'missing'},captureSupported:true,outputSupported:true,devices:[{kind:'audioinput',deviceId:'usb-mic',label:'USB <microphone> "input"'}]};
 const menu=mediaMenuMarkup('microphone',model);assert.match(menu,/USB &lt;microphone&gt; &quot;input&quot;/);assert.doesNotMatch(menu,/<microphone>/);assert.match(menu,/data-device="usb-mic" aria-pressed="true"/);
 const settings=mediaSettingsMarkup(model,true);assert.match(settings,/Saved device · unavailable or access required/);assert.match(settings,/data-media-setting="cameraId"/);assert.match(settings,/data-media-setting="screenFps"/);
 const unsupported=mediaSettingsMarkup({...model,outputSupported:false},false);assert.match(unsupported,/Change speakers in your device sound settings/);assert.match(unsupported,/cannot broadcast its own screen/);
});

test('media settings and selectors have no separate permission buttons',async()=>{
 const {mediaMenuMarkup,mediaSettingsMarkup}=await browserModule('media-ui.js');
 const model={captureSupported:true,outputSupported:true,outputPromptSupported:true,preferences:{}};
 for(const markup of [mediaSettingsMarkup(model),mediaMenuMarkup('microphone',model),mediaMenuMarkup('camera',model)]){
  assert.doesNotMatch(markup,/media-allow|Allow microphone access|Allow camera access/);
 }
 assert.match(mediaSettingsMarkup(model),/access is requested when you use/);
});
test('participant controls escape names, expose a usable slider and keep moderation and self actions conditional',async()=>{
 const {participantMenuMarkup}=await browserModule('media-ui.js'),ui=await browserModule('ui.js'),state=fixture();
 const user={id:'u_two',username:'two',displayName:'Two <script>'};state.users.push(user);
 const menu=participantMenuMarkup(user,{volume:45,muted:false},{canAdjust:true,canModerate:false});
 assert.match(menu,/Two &lt;script&gt;/);assert.doesNotMatch(menu,/<script>/);assert.match(menu,/max="200"/);assert.match(menu,/value="45"/);assert.match(menu,/Only you hear this change/);assert.doesNotMatch(menu,/data-action="moderate-member"/);
 const self=participantMenuMarkup(state.user,{volume:100,muted:false},{self:true});assert.doesNotMatch(self,/participant-volume|block-user|open-dm/);
 const tile=ui.voiceTileMarkup(state,{socketId:'peer',userId:'u_two',kind:'camera',camera:false});assert.match(tile,/data-user-id="u_two"/);assert.match(tile,/data-action="participant-menu"/);assert.match(tile,/tabindex="0"/);
});

test('mute and deafen are separate accessible overlays on camera and screen tiles and channel occupants',async()=>{
 const ui=await browserModule('ui.js'),state=fixture('voice');state.voice=[{userId:state.user.id,socketId:'peer',conversationId:'c_one',muted:true,deafened:true,camera:true,sharing:true}];
 for(const kind of ['camera','screen']){const html=ui.voiceTileMarkup(state,{...state.voice[0],kind});assert.ok(html.includes('aria-label="Microphone muted"'));assert.ok(html.includes('aria-label="Deafened"'));}
 const sidebar=ui.renderSidebar(state,{});assert.ok(sidebar.includes('aria-label="Deafened"'));assert.equal(ui.voiceAudioStateMarkup({muted:false,deafened:false}),'');
});
test('sharing and simultaneous camera use one stable participant card in grid and focus layouts',async()=>{
 const ui=await browserModule('ui.js'),state=fixture('voice');state.users.push({id:'u_two',displayName:'Two',username:'two'});
 state.voice=[{userId:'u_one',socketId:'one',conversationId:'c_one',camera:true,sharing:false},{userId:'u_two',socketId:'two',conversationId:'c_one',camera:true,sharing:false}];
 const first=ui.voiceTiles(state),key=ui.voiceTileKey(first[1]);assert.equal(first.length,2);state.voice[1].sharing=true;
 for(const focus of [undefined,'grid',key]){state.mediaFocus=focus;const layout=ui.voiceLayout(state);assert.equal(layout.tiles.length,2);assert.equal(layout.tiles.filter(tile=>tile.socketId==='two').length,1);assert.equal(layout.tiles[1].kind,'screen');assert.equal(ui.voiceTileKey(layout.tiles[1]),key);assert.equal(layout.focusKey,focus==='grid'?null:key);}
 state.voice[1].sharing=false;state.mediaFocus=key;assert.equal(ui.voiceLayout(state).focusKey,key);assert.equal(ui.voiceTiles(state)[1].kind,'camera');
 state.activeConv='dm_one';state.dms=[{id:'dm_one',peerId:'u_two'}];state.voice.forEach(person=>person.conversationId='dm_one');state.voice[1].sharing=true;assert.equal(ui.voiceTiles(state).length,2);assert.equal(ui.voiceLayout(state).focusKey,key);
});

test('reset writes the live slider property and visible value even when HTML already has the default attribute',async()=>{
 const {syncParticipantAudioControls}=await browserModule('media-ui.js'),input={max:'200',value:'35',attributes:{},setAttribute(key,value){this.attributes[key]=value;}},output={textContent:'35%'},root={querySelector:selector=>selector==='[data-participant-volume]'?input:output};
 syncParticipantAudioControls(root,{volume:100,muted:false});assert.equal(input.value,'100');assert.equal(output.textContent,'100%');assert.equal(input.attributes['aria-valuetext'],'100 percent');
 input.max='100';syncParticipantAudioControls(root,{volume:150});assert.equal(input.value,'100');assert.equal(output.textContent,'100%');syncParticipantAudioControls(null,{volume:100});
});
test('file video fitting preserves portrait/landscape ratios and detects audio-only unsupported video decode',async()=>{
 const {containedVideoSize,videoPlaybackIssue}=await browserModule('image-viewer.js');
 assert.deepEqual(containedVideoSize(1920,1080,320,300),{width:320,height:180});const portrait=containedVideoSize(360,640,320,480);assert.equal(portrait.height,480);assert.equal(portrait.width,270);
 assert.equal(containedVideoSize(0,0,300,300),null);assert.equal(videoPlaybackIssue({readyState:1,videoWidth:0,videoHeight:0}),'');assert.match(videoPlaybackIssue({readyState:4,videoWidth:0,videoHeight:0}),/audio is available/);
 assert.equal(videoPlaybackIssue({readyState:4,videoWidth:640,videoHeight:360}),'');assert.match(videoPlaybackIssue({error:{code:3}}),/decode/);assert.match(videoPlaybackIssue({error:{code:2}}),/connection/);
});

test('account navigation survives a closed tab and cannot leak another account or an inaccessible channel',async()=>{
 const {saveNavigation,readNavigation,validChannelHistory,lastServerChannel}=await browserModule('navigation.js'),values=new Map(),tab=new Map(),store=map=>({getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)}),state=fixture('voice');state.lastChannels={s_one:'c_one'};state.lastDM='dm_one';state.homeTab='spaces';state.view='voice';
 saveNavigation(state,{local:store(values),session:store(tab)});assert.equal(readNavigation(state.user.id,{local:store(values),session:store(new Map())}).conversation,'c_one');assert.equal(readNavigation('another',{local:store(values),session:store(tab)}),null);
 assert.equal(lastServerChannel(state.servers[0],validChannelHistory(state.servers,readNavigation(state.user.id,{local:store(values),session:null}).lastChannels)).id,'c_one');state.servers[0].channels=[];assert.deepEqual(validChannelHistory(state.servers,{s_one:'c_one'}),{});
 const blocked={getItem(){throw new Error('Storage denied');},setItem(){throw new Error('Storage denied');}};saveNavigation(state,{local:blocked,session:store(tab)});assert.equal(readNavigation(state.user.id,{local:blocked,session:store(tab)}).lastDM,'dm_one');
});
test('reload action notifications can be removed without discarding another error notice',async()=>{
 const {Notices}=await browserModule('notices.js'),removed=[],update={querySelector:()=>({})},error={querySelector:()=>null},n=Object.create(Notices.prototype);n.root={children:[update,error]};n.dismiss=node=>removed.push(node);n.dismissAction('reload-client');assert.deepEqual(removed,[update]);
});

function imageControlFixture() {
 const events=new Map(),timers=new Map(),classes=new Set(),calls=[];let sequence=0,zoom=2,released=0;
 const stage={isConnected:true,clientWidth:300,clientHeight:200,scrollWidth:900,scrollHeight:600,scrollLeft:100,scrollTop:80,classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)},addEventListener:(type,callback)=>events.set(type,callback),removeEventListener:type=>events.delete(type),setPointerCapture(){},releasePointerCapture(){released++;}};
 const event=(extra={})=>({deltaY:-100,deltaMode:0,clientX:120,clientY:90,button:0,pointerType:'mouse',pointerId:7,prevented:false,preventDefault(){this.prevented=true;},...extra});
 return {stage,events,timers,classes,calls,event,get released(){return released;},options:{getZoom:()=>zoom,zoomTo:(value,pointer)=>{zoom=value;calls.push([value,pointer]);},schedule:callback=>{timers.set(++sequence,callback);return sequence;},cancel:id=>timers.delete(id)},flush(){const pending=[...timers.values()];timers.clear();pending.forEach(callback=>callback());}};
}
test('image wheel zoom coalesces per frame, follows the pointer and preserves native browser zoom',async()=>{
 const {ImageControls}=await browserModule('image-controls.js'),f=imageControlFixture(),controls=new ImageControls(f.options);controls.attach(f.stage);
 const first=f.event(),second=f.event({clientX:140});f.events.get('wheel')(first);f.events.get('wheel')(second);assert.equal(first.prevented,true);assert.equal(f.timers.size,1);f.flush();assert.equal(f.calls.length,1);assert.ok(f.calls[0][0]>2);assert.deepEqual(f.calls[0][1],{x:140,y:90});
 const native=f.event({ctrlKey:true});f.events.get('wheel')(native);assert.equal(native.prevented,false);assert.equal(f.timers.size,0);
 f.events.get('wheel')(f.event({deltaY:10000}));f.flush();assert.ok(f.calls.at(-1)[0]>=1);controls.detach();assert.equal(f.events.size,0);
});
test('enlarged image dragging captures only the primary pointer, clamps edges and releases on cancellation',async()=>{
 const {ImageControls}=await browserModule('image-controls.js'),f=imageControlFixture(),controls=new ImageControls(f.options);controls.attach(f.stage);
 f.events.get('pointerdown')(f.event());assert.ok(f.classes.has('is-dragging'));f.events.get('pointermove')(f.event({clientX:20,clientY:10}));assert.equal(f.stage.scrollLeft,200);assert.equal(f.stage.scrollTop,160);
 f.events.get('pointermove')(f.event({pointerId:8,clientX:4000}));assert.equal(f.stage.scrollLeft,200);
 f.events.get('pointermove')(f.event({clientX:4000,clientY:4000}));assert.equal(f.stage.scrollLeft,0);assert.equal(f.stage.scrollTop,0);
 f.events.get('pointercancel')(f.event());assert.equal(f.classes.has('is-dragging'),false);assert.equal(f.released,1);
 const touch=f.event({pointerType:'touch'});f.events.get('pointerdown')(touch);assert.equal(touch.prevented,false);controls.detach();
});
test('closing an image cancels a scheduled wheel action and old stage handlers cannot accumulate',async()=>{
 const {ImageControls}=await browserModule('image-controls.js'),f=imageControlFixture(),controls=new ImageControls(f.options);controls.attach(f.stage);f.events.get('wheel')(f.event());controls.detach();f.flush();assert.equal(f.calls.length,0);assert.equal(f.events.size,0);controls.attach(f.stage);assert.equal(f.events.size,7);controls.detach();
});
test('wheel zoom retains the image point under the cursor and Fit restores the centered image',async t=>{
 const f=viewerFixture(t),{ImageViewer}=await browserModule('image-viewer.js'),viewer=new ImageViewer(f.options);viewer.open('m_viewer');
 f.stage.getBoundingClientRect=()=>({left:0,top:0});f.media.getBoundingClientRect=()=>{const width=parseFloat(f.media.style.width)||336,height=parseFloat(f.media.style.height)||189;return {width,height,left:(f.stage.scrollWidth-width)/2-f.stage.scrollLeft,top:(f.stage.scrollHeight-height)/2-f.stage.scrollTop};};
 const pointer={x:100,y:240},before=(pointer.x-f.media.getBoundingClientRect().left)/336;viewer.setZoom(2,pointer);const after=(pointer.x-f.media.getBoundingClientRect().left)/parseFloat(f.media.style.width);assert.ok(Math.abs(before-after)<.000001);assert.equal(f.stage.scrollLeft,88);assert.equal(f.renders,1);
 viewer.setZoom(4,pointer);assert.ok(f.stage.scrollTop>0);viewer.resetZoom();assert.equal(f.stage.scrollLeft,0);assert.equal(f.stage.scrollTop,0);assert.equal(viewer.zoom,1);viewer.close();
});
