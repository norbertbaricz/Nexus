import {icon} from './icons.js';
import * as UI from './ui.js';
import {MANAGEMENT_KEYS} from './community-ui.js';
import {isVoice,isForum} from './chat-tools.js';

// One menu model serves mouse, keyboard and touch without intercepting editors.
export const CONTEXT_MENU_CONFIG=Object.freeze({width:292,iconSize:20,maximumTitleLength:120});
const e=UI.escape;
const item=(key,label,glyph,action,data={},extra={})=>({key,label,glyph,action,...data,...extra});
const divider=()=>({separator:true});
const findMessage=(state,id)=>state.messages?.find(message=>message.id===id)||(state.activeThread?.id===id?state.activeThread:null)||state.pins?.find(message=>message.id===id);
export function resolveContextTarget(target,activeServer){
 if(!target?.closest||target.closest('input,textarea,select,[contenteditable]:not([contenteditable=false]),a[href],video,audio,[data-context-menu],[data-participant-menu]'))return null;
 const surface=target.closest('.artwork-surface');
 let node=target.closest('[data-action=artwork-menu]')||surface?.querySelector?.('[data-action=artwork-menu]');
 if(node)return {kind:'artwork',purpose:node.dataset.purpose,imageKind:node.dataset.kind,node:surface||node};
 node=target.closest('.user-bar [data-action=status-menu]');if(node)return {kind:'self',node};
 node=target.closest('.voice-tile[data-user-id], [data-action=profile][data-id]');if(node)return {kind:'person',id:node.dataset.userId||node.dataset.id,node};
 node=target.closest('[data-action=server][data-id],[data-action=discover-server][data-id]');if(node)return {kind:'server',id:node.dataset.id,node};
 node=target.closest('.server-menu-trigger');if(node)return {kind:'server',id:activeServer,node};
 node=target.closest('[data-action=conversation][data-id]');if(node)return {kind:'conversation',id:node.dataset.id,node};
 node=target.closest('[data-action=toggle-category][data-id]');if(node)return {kind:'category',id:node.dataset.id,node};
 node=target.closest('.message[data-message],.collection-item[data-message],.forum-topic[data-message]');
 if(node){const attachment=target.closest('[data-index][data-id]');return {kind:'message',id:node.dataset.message,index:attachment?Number(attachment.dataset.index):null,node};}
 node=target.closest('.avatar[data-user-id]');if(node)return {kind:'person',id:node.dataset.userId,node};
 return null;
}
export function contextMenuModel(state,target,{call={},profileDraft,serverDraft}={}){
 if(!state.user||!target)return null;
 const items=[];let title='Options';
 const copy=(key,label,value)=>item(key,label,'copy','context-copy',{value});
 const scoped=(server,option)=>({...option,serverId:server.id});
 if(target.kind==='server'){
  const server=state.servers.find(server=>server.id===target.id);
  const discover=server||state.discovery?.find(server=>server.id===target.id);
  if(!discover)return null;title=discover.name;
  if(!server)items.push(item('details','View server','people','discover-server',{id:target.id}),copy('name','Copy server name',title));
  else{
   items.push(item('open','Open server','arrow','server',{id:server.id}));
   items.push(scoped(server,item('overview','Server overview','home','community-home')),scoped(server,item('rules','Rules','book','server-rules')));
   if(UI.serverUnreadCount(server))items.push(item('read','Mark server as read','check','context-mark-read',{id:server.id,kind:'server'}));
   if(UI.hasServerPermission(server,'inviteMembers'))items.push(scoped(server,item('invite','Invite people','link','invite')));
   if(UI.hasServerPermission(server,'manageChannels'))items.push(divider(),scoped(server,item('channel','Create channel','plus','add-channel')),scoped(server,item('category','Create category','folder','new-category')));
   if(MANAGEMENT_KEYS.some(key=>UI.hasServerPermission(server,key)))items.push(scoped(server,item('settings','Server settings','settings','server-settings')));
   items.push(copy('id','Copy server ID',server.id),divider(),scoped(server,server.role==='owner'?item('delete','Delete server','trash','delete-server',{id:server.id},{danger:true}):item('leave','Leave server','logout','leave-server',{}, {danger:true})));
  }
 }else if(target.kind==='conversation'){
  const server=state.servers.find(server=>server.channels.some(channel=>channel.id===target.id));
  const channel=server?.channels.find(channel=>channel.id===target.id),dm=state.dms.find(dm=>dm.id===target.id);
  if(channel){
   title=channel.name;items.push(item('open',isVoice(channel)?call.active?.conversationId===channel.id?'Open voice room':'Join voice room':'Open channel',isVoice(channel)?'voice':'hash','conversation',{id:channel.id}));
   if(channel.unread)items.push(item('read','Mark as read','check','context-mark-read',{id:channel.id,kind:'conversation'}));
   items.push(copy('name','Copy channel name',channel.name),copy('id','Copy channel ID',channel.id));
   if(UI.hasServerPermission(server,'manageChannels')){
    items.push(divider(),scoped(server,item('settings','Channel settings','settings','edit-channel',{id:channel.id})));
    const at=server.channels.findIndex(item=>item.id===channel.id);
    if(at>0)items.push(scoped(server,item('up','Move up','arrowUp','move-channel',{id:channel.id,direction:-1})));
    if(at<server.channels.length-1)items.push(scoped(server,item('down','Move down','arrowDown','move-channel',{id:channel.id,direction:1})));
    items.push(scoped(server,item('delete','Delete channel','trash','delete-channel',{id:channel.id},{danger:true})));
   }
  }else if(dm){
   const user=state.users.find(user=>user.id===dm.peerId);if(!user||(state.blockedIds||[]).includes(user.id))return null;title=user.displayName;
   items.push(item('open','Open conversation','chat','conversation',{id:dm.id}),item('profile','View profile','user','profile',{id:user.id}),item('call','Start voice call','phone','context-start-call',{id:dm.id}));
   if(dm.unread)items.push(item('read','Mark as read','check','context-mark-read',{id:dm.id,kind:'conversation'}));
   items.push(copy('username','Copy username','@'+user.username),divider(),item('block','Block user','ban','block-user',{id:user.id},{danger:true}),item('delete','Delete conversation','trash','delete-dm',{id:dm.id},{danger:true}));
  }else return null;
 }else if(target.kind==='category'){
  const server=state.servers.find(server=>server.categories?.some(category=>category.id===target.id)),category=server?.categories.find(category=>category.id===target.id);if(!category)return null;
  title=category.name;const collapsed=Boolean(state.collapsedCategories?.[category.id]);
  items.push(item('toggle',collapsed?'Expand category':'Collapse category','chevron','toggle-category',{id:category.id}));
  if(UI.hasServerPermission(server,'manageChannels')){
   items.push(scoped(server,item('edit','Edit category','edit','edit-category',{id:category.id})));
   const at=server.categories.findIndex(item=>item.id===category.id);
   if(at>0)items.push(scoped(server,item('up','Move up','arrowUp','move-category',{id:category.id,direction:-1})));
   if(at<server.categories.length-1)items.push(scoped(server,item('down','Move down','arrowDown','move-category',{id:category.id,direction:1})));
  }
  items.push(copy('name','Copy category name',category.name));
 }else if(target.kind==='message'){
  const message=findMessage(state,target.id);if(!message)return null;
  const server=UI.currentServer(state),conversation=UI.activeConversation(state),own=message.authorId===state.user.id;
  const canManage=UI.hasServerPermission(server,'manageMessages')||isForum(conversation)&&UI.hasServerPermission(server,'manageTopics');
  const file=Number.isInteger(target.index)?message.attachments?.[target.index]:null;
  title=file?'Attachment':isForum(conversation)&&!state.activeThread?'Forum post':'Message';
  if(file){
   const hidden=file.spoiler&&!state.revealedSpoilers?.has(`${message.id}:${target.index}`);
   if(hidden)items.push(item('reveal','Reveal spoiler','eyeOff','reveal-image',{id:message.id,index:target.index}));
   else{
    title=file.name;
    if(/^(image|video|audio)\//.test(file.type||''))items.push(item('view','Open attachment','expand','view-image',{id:message.id,index:target.index}));
    if(UI.canDownload(state,file))items.push(item('download','Download file','download','download-file',{id:message.id,index:target.index}));
    items.push(copy('filename','Copy file name',file.name));
   }
   items.push(divider());
  }
  if(isForum(conversation)&&!state.activeThread)items.push(item('open','Open post','chat','open-thread',{id:message.id}));
  if(UI.canWrite(state)&&!['media'].includes(conversation?.type)&&(!isForum(conversation)||state.activeThread))items.push(item('reply','Reply','reply','reply',{id:message.id}));
  if(message.text)items.push(item('copy','Copy text','copy','copy-message',{id:message.id}));
  if(!server||UI.hasServerPermission(server,'addReactions'))items.push(item('reaction','Add reaction','smile','react-menu',{id:message.id}));
  if(!server||UI.hasServerPermission(server,'pinMessages'))items.push(item('pin',message.pinned?'Unpin message':'Pin message','pin','pin-message',{id:message.id}));
  if(own)items.push(item('edit','Edit message','edit','edit-message',{id:message.id}));
  items.push(copy('id','Copy message ID',message.id));
  if(own||canManage)items.push(divider(),item('delete','Delete message','trash','delete-message',{id:message.id},{danger:true}));
 }else if(target.kind==='self'){
  title=state.user.displayName;items.push(item('profile','View profile','user','profile',{id:state.user.id}),item('settings','Your settings','settings','settings'),copy('username','Copy username','@'+state.user.username),divider());
  for(const status of ['online','idle','dnd','invisible'])items.push(item('status-'+status,UI.statusLabel(status),null,'set-status',{status},{selected:status===(state.user.preferredStatus||state.user.status)}));
 }else if(target.kind==='artwork'){
  const profile=target.purpose==='profile',draft=profile?profileDraft:target.purpose==='server'?serverDraft:null;
  if(!draft||!(profile?['avatar','banner']:['icon','banner']).includes(target.imageKind)||!profile&&!UI.hasServerPermission(state.servers.find(server=>server.id===draft.id),'manageServer'))return null;
  title=profile?target.imageKind==='avatar'?'Profile picture':'Profile banner':target.imageKind==='icon'?'Server icon':'Server banner';
  const data={kind:target.imageKind};items.push(item('upload','Upload image','image',target.purpose+'-upload',data));
  if(draft[target.imageKind])items.push(item('adjust','Adjust position','edit',target.purpose+'-crop',data),item('remove','Remove image','trash','remove-'+target.purpose+'-image',data,{danger:true}));
 }else return null;
 return {title,items:items.filter((option,index)=>!option.separator||index>0&&!items[index-1].separator&&index<items.length-1)};
}
export function contextMenuMarkup(model){
 return `<section class="context-menu" data-context-menu role="menu" aria-label="${e(model.title)} options"><div class="picker-heading"><strong>${e(model.title.slice(0,CONTEXT_MENU_CONFIG.maximumTitleLength))}</strong><button class="icon-button" role="menuitem" data-action="close-picker" aria-label="Close options">${icon('close',18)}</button></div>${model.items.map(option=>option.separator?'<div class="popover-divider" role="separator"></div>':`<button type="button" role="menuitem" class="popover-item ${option.danger?'danger':''} ${option.selected?'selected':''}" data-action="${e(option.action)}" data-context-key="${e(option.key)}"${['id','serverId','value','kind','index','direction','status'].filter(key=>option[key]!==undefined).map(key=>` data-${key.replace(/[A-Z]/g,character=>'-'+character.toLowerCase())}="${e(option[key])}"`).join('')}>${option.status?UI.presenceSymbol(option.status):icon(option.glyph,CONTEXT_MENU_CONFIG.iconSize)}<span>${e(option.label)}</span></button>`).join('')}</section>`;
}
