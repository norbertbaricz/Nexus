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

test('floating notices retain a stable viewport anchor while controls scroll underneath',async()=>{
 const {Notices}=await browserModule('notices.js');let height=80,boxes=[{left:0,right:390,top:740,bottom:790,width:390,height:50}],width=390,viewportHeight=844;
 const scope={querySelectorAll:()=>boxes.map(box=>({getBoundingClientRect:()=>box}))},root={children:[{}],style:{},getBoundingClientRect:()=>({height})};
 const notices=Object.create(Notices.prototype);notices.root=root;notices.anchor=null;notices.context=()=>({width,height:viewportHeight,top:0,left:0,inSidebar:false,scope});
 notices.resize();const original={top:root.style.top,left:root.style.left,width:root.style.width};
 for(let index=0;index<12;index++){boxes=[{left:0,right:390,top:100+index*35,bottom:140+index*35,width:390,height:40}];notices.resize();assert.deepEqual({top:root.style.top,left:root.style.left,width:root.style.width},original);}
 const bottom=parseFloat(root.style.top)+height;height=140;notices.resize();assert.equal(parseFloat(root.style.top)+height,bottom);
 viewportHeight=390;notices.resize(true);assert.ok(parseFloat(root.style.top)>=12);assert.ok(parseFloat(root.style.top)+height<=378);
});
test('dense notice placement keeps its compact width across observer notifications',async()=>{
 const {Notices}=await browserModule('notices.js');const scope={querySelectorAll:()=>[{getBoundingClientRect:()=>({left:0,right:320,top:0,bottom:480,width:320,height:480})}]};
 const root={children:[{}],style:{},getBoundingClientRect:()=>({height:80})},notices=Object.create(Notices.prototype);notices.root=root;notices.anchor=null;notices.context=()=>({width:320,height:480,top:0,left:0,inSidebar:false,scope});
 notices.resize();assert.equal(root.style.width,'224px');assert.equal(root.style.top,'12px');for(let index=0;index<8;index++){notices.resize();assert.equal(root.style.width,'224px');assert.equal(root.style.top,'12px');}
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
 const stage={isConnected:true,clientWidth:360,clientHeight:480,scrollLeft:0,scrollTop:0,classList:{toggle(){}},querySelector(selector){return selector==='.viewer-stage-content'?content:media;},get scrollWidth(){return Math.max(this.clientWidth,parseFloat(content.style.width)||0);},get scrollHeight(){return Math.max(this.clientHeight,parseFloat(content.style.height)||0);}};
 let paused=0,markup='',renders=0;
 const media={style:{},classList:{contains:name=>name==='viewer-image'&&type.startsWith('image/')},naturalWidth:type.startsWith('image/')?width:0,naturalHeight:type.startsWith('image/')?height:0,videoWidth:type.startsWith('video/')?width:0,videoHeight:type.startsWith('video/')?height:0,addEventListener:(name,callback)=>events.set(name,callback),pause(){paused++;}};
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
 assert.equal(f.media.style.height,'');assert.equal(f.media.style.width,'');
 f.stage.clientWidth=700;f.stage.clientHeight=200;f.observed[0].callback();
 assert.equal(f.media.style.height,'');assert.equal(f.media.style.width,'');
 assert.equal(f.content.style.width,'');assert.equal(f.content.style.height,'');assert.equal(f.renders,1);
 viewer.close();assert.equal(f.paused,1);assert.equal(f.observed[0].node,null);assert.equal(viewer.stage,null);assert.equal(viewer.items.length,0);
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
