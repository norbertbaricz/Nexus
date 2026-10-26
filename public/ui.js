import { activeTimeout, remainingTime } from './moderation.js';
import { icon, nexusLogo } from './icons.js';
import { CHAT_CONFIG, CHANNEL_TYPES, groupMessage, isVoice, isForum, isCollection } from './chat-tools.js';
import { CONFIG } from './config.js';
import { PALETTES } from './appearance.js';
import { markdown as formatMarkdown, inlineMarkdown } from './message-format.js';
import { collectionMarkup, collectionMessages } from './collections.js';
import { cropStyle, readCrop } from './artwork.js';
import { memberGroups } from './role-display.js';

export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const color = value => /^#[\da-f]{6}$/i.test(value || '') ? value : '#b9a1f0';
export function artworkControls({ label, uploadAction, adjustAction, removeAction, kind = '', hasImage = false }) {
  const attribute = kind ? ` data-kind="${escape(kind)}"` : '';
  return `<section class="artwork-control" role="group" aria-label="${escape(label)}"><strong class="artwork-control-label">${escape(label)}</strong><div class="artwork-control-buttons"><button type="button" class="button-secondary" data-action="${uploadAction}"${attribute} aria-label="Upload ${escape(label.toLowerCase())}">${icon('image', 16)}Upload</button><button type="button" class="button-secondary" data-action="${adjustAction}"${attribute} aria-label="Adjust ${escape(label.toLowerCase())}" ${hasImage ? '' : 'disabled'}>Adjust</button><button type="button" class="button-secondary artwork-remove" data-action="${removeAction}"${attribute} aria-label="Remove ${escape(label.toLowerCase())}" ${hasImage ? '' : 'disabled'}>Remove</button></div></section>`;
}
export function typingMarkup(users) {
  if (!users.length) return '';
  const names = users.slice(0, CONFIG.typingMaxNames).map(user => `<strong>${escape(user.displayName || user.username || 'Nexus user')}</strong>`);
  const remaining = users.length - names.length;
  if (remaining) names.push(`${remaining} ${remaining === 1 ? 'other' : 'others'}`);
  const people = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `<span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="typing-bar">${people} ${users.length === 1 ? 'is' : 'are'} typing…</span>`;
}
export function safeImage(value) {
  if (typeof value !== 'string') return '';
  return /^(https:\/\/|\/assets\/gifs\/|\/files\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(value) ? value : '';
}
export function presenceSymbol(status='offline') {
  return `<span class="presence-symbol presence-${escape(status)}" aria-hidden="true"><svg viewBox="0 0 100 100" focusable="false"><rect x="3" y="3" width="94" height="94" rx="29" pathLength="100"/></svg></span>`;
}
export function avatar(user = {}, { status = false, className = '' } = {}) {
  const initials=(user.displayName || user.username || '?').split(/\s+/).map(word=>Array.from(word)[0]).slice(0,2).join('').toUpperCase(),image=safeImage(user.avatar);
  const presence=user.status || 'offline';
  return `<span data-user-id="${escape(user.id || '')}" class="avatar ${className} ${status?`presence-${escape(presence)}`:''}" style="--avatar-color:${color(user.accent)}99" ${status?`title="${statusLabel(presence)}"`:''}><span class="avatar-art">${image?`<img src="${escape(image)}" style="${cropStyle(user.avatarCrop)}" alt="" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer">`:escape(initials)}</span>${status?`<svg class="presence-ring" viewBox="0 0 100 100" role="img" aria-label="${statusLabel(presence)}" focusable="false"><rect x="3" y="3" width="94" height="94" rx="29" pathLength="100"/></svg>`:''}</span>`;
}
export function iconButton(name, action, label, extra = '') {
  return `<button class="icon-button" data-action="${action}" aria-label="${escape(label)}" title="${escape(label)}" ${extra}>${icon(name)}</button>`;
}
const userFor = (s, id) => s.users.find(u => u.id === id) || { id, displayName: 'Nexus user', accent: '#8d7d9b', status: 'offline' };
export function activeConversation(s) { return s.servers.flatMap(v => v.channels).find(c => c.id === s.activeConv) || s.dms.find(d => d.id === s.activeConv); }
export function currentServer(s) { return s.servers.find(v => v.id === s.activeServer); }
export function conversationName(s, id = s.activeConv) {
  const c = s.servers.flatMap(v => v.channels).find(c => c.id === id);
  if (c) return c.name;
  const dm = s.dms.find(d => d.id === id);
  return dm ? userFor(s, dm.peerId).displayName : 'Your space';
}
export function hasServerPermission(server, key) { return server?.role === 'owner' || Boolean(server?.permissions?.[key]); }
export function serverAvatar(server = {}, className = '') {
  const image = safeImage(server.icon);
  return `<span class="server-avatar ${className}" style="--server-accent:${color(server.accent)}"><span class="server-art">${image ? `<img src="${escape(image)}" style="${cropStyle(server.iconCrop)}" alt="" loading="lazy" decoding="async" draggable="false" referrerpolicy="no-referrer">` : escape((server.name || '?').slice(0, 2).toUpperCase())}</span></span>`;
}
export function serverCard(server, discover = false) {
  return `<button class="server-card" data-action="${discover ? 'discover-server' : 'server'}" data-id="${escape(server.id)}"><span class="server-card-banner" ${bannerStyle(server)}></span><span class="server-card-copy">${serverAvatar(server)}<strong>${escape(server.name)}</strong><span class="server-card-badges">${server.official ? `<span class="official-badge">${icon('shield', 14)}Official server</span>` : ''}${server.joined ? `<span class="joined-badge">${icon('check',14)}Joined</span>` : ''}</span><small>${escape(server.description || 'Text, voice and your people.')}</small><span class="server-card-meta">${server.memberCount ?? server.members?.length ?? 0} ${(server.memberCount ?? server.members?.length ?? 0) === 1 ? 'member' : 'members'} ${icon('arrow', 16)}</span></span></button>`;
}
export function unreadCount(conversations = []) {
  return conversations.reduce((sum, conversation) => sum + (Number.isSafeInteger(conversation.unread) && conversation.unread > 0 ? conversation.unread : 0), 0);
}
export function serverUnreadCount(server) { return unreadCount(server.channels); }
export function totalUnreadCount(s) { return unreadCount(s.dms) + s.servers.reduce((sum, server) => sum + serverUnreadCount(server), 0); }
function unreadIndicator(count, navigation = false) {
  if (!count) return '';
  const label = `${count} unread ${count === 1 ? 'message' : 'messages'}`;
  return `<span class="${navigation ? 'nav-indicator nav-unread' : 'unread-badge'}" data-unread="${count}" aria-label="${label}" title="${label}">${navigation ? '' : count > CONFIG.unreadBadgeMax ? `${CONFIG.unreadBadgeMax}+` : count}</span>`;
}
export function renderNavigation(s) {
  const inServer = Boolean(currentServer(s)) || s.homeTab !== 'inbox' && s.view === 'home';
  return `<div class="brand" aria-label="Nexus">${nexusLogo()}<span>nexus<span class="brand-dot">.</span></span></div><div class="navigation-tabs" aria-label="Main sections"><button class="navigation-tab ${!inServer ? 'active' : ''}" data-action="inbox">${icon('chat', 18)}Messages${unreadIndicator(unreadCount(s.dms), true)}</button><button class="navigation-tab ${inServer ? 'active' : ''}" data-action="home">${icon('people', 18)}Servers${unreadIndicator(s.servers.reduce((sum, server) => sum + serverUnreadCount(server), 0), true)}</button></div><div class="navigation-actions"><span class="connection-state ${s.connected ? 'online' : ''}" role="status"><span></span>${s.connected ? 'Connected' : 'Connecting…'}</span><button class="navigation-search" data-action="quick-search" aria-label="Search Nexus">${icon('search', 19)}<span>Search</span><kbd>Ctrl K</kbd></button></div>`;
}
export function renderSidebar(s, callState) {
  const server = currentServer(s), serversView = !server && s.homeTab !== 'inbox';
  const manage = hasServerPermission(server, 'manageChannels');
  const channelHtml = channel => {
    const participants = (s.voice || []).filter(peer => peer.conversationId === channel.id);
    return `<div class="channel-group" ${manage ? `draggable="true" data-drag-channel="${escape(channel.id)}" data-drop-channel="${escape(channel.id)}"` : ''}><div class="channel-row"><button class="channel ${s.activeConv === channel.id ? 'active' : ''} ${channel.unread ? 'unread' : ''}" data-action="conversation" data-id="${escape(channel.id)}" ${s.activeConv === channel.id ? 'aria-current="page"' : ''}>${channelGlyph(channel)}<span>${escape(channel.name)}</span>${channel.unread ? `<span class="unread-badge">${channel.unread > 99 ? '99+' : channel.unread}</span>` : participants.length ? `<span class="channel-count neutral">${participants.length}</span>` : ''}</button>${manage ? iconButton('settings', 'edit-channel', `Edit ${channel.name} channel`, `data-id="${escape(channel.id)}"`) : ''}</div>${isVoice(channel) && participants.length ? `<div class="voice-occupants">${participants.map(peer => { const user = userFor(s, peer.userId); return `<button data-action="profile" data-id="${escape(user.id)}">${avatar(user)}<span>${escape(user.displayName)}</span>${peer.muted ? icon('micOff', 15) : ''}${peer.sharing ? icon('screen', 15) : ''}</button>`; }).join('')}</div>` : ''}</div>`;
  };
  const categoryHtml = category => {
    const collapsed = Boolean(s.collapsedCategories?.[category.id]);
    return `<section data-render-key="category-${escape(category.id)}" class="channel-category ${collapsed ? 'collapsed' : ''}" data-drop-category="${escape(category.name)}" ${manage ? `draggable="true" data-drag-category="${escape(category.id)}"` : ''}><div class="category-heading"><button class="category-toggle" data-action="toggle-category" data-id="${escape(category.id)}" aria-expanded="${!collapsed}">${icon('chevron', 16)}<span>${escape(category.name)}</span></button>${manage ? iconButton('settings', 'edit-category', `Edit ${category.name}`, `data-id="${escape(category.id)}"`) : ''}</div><div class="category-channels" ${collapsed ? 'hidden' : ''}>${server.channels.filter(channel => channel.category === category.name).map(channelHtml).join('')}</div></section>`;
  };
  const header = server ? `<div class="sidebar-server-banner" ${bannerStyle(server)}></div><button class="sidebar-server-identity server-menu-trigger" data-action="server-menu">${serverAvatar(server)}<span><strong>${escape(server.name)}</strong><small>${server.official ? 'Official server · ' : ''}${server.members.length} ${server.members.length === 1 ? 'member' : 'members'}</small></span>${icon('chevron', 19)}</button>` : `<div class="sidebar-heading"><h2>${serversView ? 'Your servers' : 'Messages'}</h2><button class="icon-button" data-action="${serversView ? 'join-server' : 'new-dm'}" aria-label="${serversView ? 'Join a server' : 'New message'}">${icon(serversView ? 'link' : 'plus', 20)}</button></div>`;
  const categories = server?.categories || [];
  const channels = server ? `<div class="uncategorized-channels" data-drop-category="">${server.channels.filter(channel => !categories.some(category => category.name === channel.category)).map(channelHtml).join('')}</div>${categories.map(categoryHtml).join('')}` : '';
  const serverRows = s.servers.map(space => `<button class="channel server-link ${serverUnreadCount(space) ? 'unread' : ''}" data-action="server" data-id="${escape(space.id)}">${serverAvatar(space)}<span>${escape(space.name)}</span>${space.official ? icon('shield', 17) : ''}${unreadIndicator(serverUnreadCount(space))}</button>`).join('');
  const dms = s.dms.map(dm => { const user = userFor(s, dm.peerId); return `<button class="channel dm-link ${s.activeConv === dm.id ? 'active' : ''}" data-action="conversation" data-id="${escape(dm.id)}">${avatar(user, { status: true })}<span class="dm-name">${escape(user.displayName)}<small>${escape(dm.lastMessage?.text || 'No messages yet')}</small></span>${dm.unread ? `<span class="unread-badge">${dm.unread}</span>` : ''}</button>`; }).join('');
  return `<button class="icon-button sidebar-dismiss ${server ? 'server-dismiss' : ''}" data-action="toggle-sidebar" aria-label="Close channels">${icon('close', 20)}</button>${header}<div class="sidebar-scroll">${server ? channels : serversView ? `${serverRows || '<p class="sidebar-empty">Create a server or join with an invite.</p>'}` : dms || '<p class="sidebar-empty">Your conversations appear here.</p>'}</div><div class="user-bar"><button data-action="status-menu" aria-label="Change your status">${avatar(s.user, { status: true })}</button><button class="user-info" data-action="status-menu" title="Change status"><strong>${escape(s.user.displayName)}</strong><small>${statusLabel(s.user.preferredStatus === 'online' ? s.user.status : s.user.preferredStatus || s.user.status)}</small></button><div class="user-controls">${callState?.active ? iconButton(callState.muted ? 'micOff' : 'mic', 'mute', 'Toggle microphone',callState.stageListener?'disabled':'') : ''}${iconButton('settings', 'settings', 'Your settings')}</div></div>`;
}
export function channelGlyph(channel, size = 20) {
  return icon(channel.private ? 'lock' : channel.icon || ({ voice: 'voice', stage: 'mic', announcement: 'megaphone', forum: 'chat', media: 'image' })[channel.type] || 'hash', size);
}
export function badgesMarkup(user) {
  const definitions = { creator: ['crown', 'Project creator'], 'community-owner': ['people', 'Community owner'], 'early-member': ['sparkle', 'Early member'] };
  return `<div class="profile-badges" aria-label="Nexus badges">${(user.badges || []).map(badge => definitions[badge] ? `<span class="profile-badge ${badge}" title="${definitions[badge][1]}" role="img" aria-label="${definitions[badge][1]}">${icon(definitions[badge][0], 16)}</span>` : '').join('')}</div>`;
}
export function rolesMarkup(server, member) {
  return `<div class="profile-roles">${(server?.roles || []).filter(role => member?.roleIds?.includes(role.id)).map(role => `<span class="role-chip" style="--role-color:${color(role.color)}">${role.icon?.startsWith('/files/') ? `<span class="role-icon-art"><img src="${escape(role.icon)}" style="${cropStyle(role.iconCrop)}" alt=""></span>` : icon(role.icon || 'shield', 16)}${escape(role.name)}</span>`).join('')}${member?.role === 'owner' ? `<span class="role-chip">${icon('crown', 16)}Server owner</span>` : ''}</div>`;
}

export function statusLabel(status) { return ({ online: 'Online', idle: 'Away', dnd: 'Do not disturb', invisible: 'Invisible', offline: 'Offline' })[status] || 'Online'; }
export function renderMembers(s) {
  const server = currentServer(s);
  if (!server) {
    const dm = s.dms.find(d => d.id === s.activeConv);
    if (!dm) return '';
    const user = userFor(s, dm.peerId);
    return `<div class="members-header">Profile${iconButton('close', 'toggle-members', 'Close members')}</div><div class="members-scroll profile-panel"><div class="profile-banner" ${bannerStyle(user)}></div><div class="profile-avatar-row">${avatar(user, { status: true })}</div><div class="profile-body">${profileName(user,'h2')}${profileIdentity(user)}${profileDetails(user)}<div class="dm-profile-actions"><button class="button-secondary" data-action="profile" data-id="${escape(user.id)}">View profile</button></div></div></div>`;
  }
  const groups=memberGroups(server,s.users);
  const row = user => `<button class="member-row" data-action="profile" data-id="${escape(user.id)}">${avatar(user, { status: true })}<span class="member-name">${escape(user.displayName)}<small>${user.role === 'owner' ? 'Server owner' : user.assignedRoles.length ? user.assignedRoles.map(role => escape(role.name)).join(', ') : statusLabel(user.status)}</small></span>${user.role === 'owner' ? `<span class="owner-crown" title="Server owner" aria-hidden="true">${icon('crown', 16)}</span>` : ''}</button>`;
  return `<div class="members-header">Members<span class="member-total">${server.members.length}</span>${iconButton('close', 'toggle-members', 'Close members')}</div><div class="members-scroll">${groups.map(group=>`<section data-render-key="member-group-${escape(group.key)}"><div class="member-section-title" ${group.role?`style="color:${color(group.role.color)}"`:''}>${escape(group.label)} · ${group.members.length}</div>${group.members.map(row).join('')}</section>`).join('')}</div>`;
}
export function pinButton(s) {
  const pins=activeConversation(s)?.pins || {},count=pins.count ?? s.pins?.length ?? 0;
  return `<button class="icon-button pin-button ${pins.hasNew?'has-new':''}" data-action="pinned" aria-label="Pinned messages${count?` (${count})`:''}${pins.hasNew?' · New pins':''}" title="Pinned messages">${icon('pin',20)}${pins.hasNew?'<span class="pin-dot" aria-hidden="true"></span>':''}</button>`;
}
export function chatHeader(s, title, { topic = '', dm = false, voice = false } = {}) {
  return `<header class="chat-header ${dm?'dm-header':''} ${voice?'voice-header':''}"><button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="Toggle channels">${icon('menu')}</button>${dm ? avatar(userFor(s, activeConversation(s)?.peerId), { status: true }) : `<span class="channel-symbol">${icon(voice ? 'voice' : 'hash', 22)}</span>`}<div class="header-title"><span class="header-name" ${dm?`data-user-name="${escape(activeConversation(s)?.peerId)}"`:''}>${escape(title)}</span>${topic ? `<span class="header-topic" ${dm?`data-presence-label="${escape(activeConversation(s)?.peerId)}"`:''}>${inlineMarkdown(topic)}</span>` : ''}</div><div class="header-actions">${dm && !voice ? `<button class="button-secondary call-button" data-action="start-call" aria-label="Call">${icon('phone', 20)}<span>Call</span></button><button class="icon-button header-secondary" data-action="start-video" aria-label="Start video call">${icon('video',20)}</button>` : ''}${dm && !voice ? `<button class="icon-button header-secondary" data-action="delete-dm" aria-label="Delete conversation for both people" data-id="${escape(s.activeConv)}">${icon('trash',20)}</button>` : ''}${dm ? `<button class="icon-button header-secondary" data-action="block-user" aria-label="Block user" data-id="${escape(activeConversation(s)?.peerId)}">${icon('ban',20)}</button>` : ''}${!voice ? `${iconButton('search', 'search-messages', 'Search messages')}${pinButton(s)}` : ''}${iconButton('people', 'toggle-members', dm ? 'View profile sidebar' : 'Toggle members')}${dm&&!voice?`<button class="icon-button conversation-more" data-action="conversation-menu" aria-label="More conversation actions">${icon('more',20)}</button>`:''}</div></header>`;
}
export function markdown(value) {return formatMarkdown(value);}
export const formatTime = value => new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const formatDate = value => {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return `Today, ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const bytes = size => size >= 1024 ** 3 ? `${(size / 1024 ** 3).toFixed(1)} GB` : size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(0)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
export function canDownload(s,file) {
  if(!file||file.cover)return false;
  const conversation=activeConversation(s),server=currentServer(s);
  if(server&&!hasServerPermission(server,'downloadFiles'))return false;
  return !file.type?.startsWith('image/') || Boolean(conversation?.peerId) || conversation?.type==='media';
}
export function canWrite(s) {
  const conversation=activeConversation(s),server=currentServer(s);
  if (activeTimeout(server)) return false;
  return !server || hasServerPermission(server,'sendMessages') && (!conversation?.readOnly || hasServerPermission(server,'manageMessages')) && (!isForum(conversation) || hasServerPermission(server,s.activeThread?'replyToTopics':'createTopics'));
}
export const spoilerRevealed=(s,message,index)=>!message.attachments?.[index]?.spoiler||s.revealedSpoilers?.has(`${message.id}:${index}`);
const collectionHelpers=s=>({escape,bytes,avatar,formatDate,markdown,userFor:id=>userFor(s,id),canDownload:file=>canDownload(s,file),revealed:(message,index)=>spoilerRevealed(s,message,index)});
export function renderMessage(s, message, grouped = false, highlight = '') {
  const u = userFor(s, message.authorId);
  const server = currentServer(s);
  const isOwner = server?.ownerId === message.authorId;
  const reactionGroups = [...new Set(message.reactions.map(r => r.emoji))];
  const reply = s.messages.find(m => m.id === message.replyTo)||(s.activeThread?.id===message.replyTo?s.activeThread:null);
  const attachments=(message.attachments || []).map((file,index)=>{
    const url=safeImage(file.url)||(String(file.url).startsWith('/files/')?file.url:'');if(!url)return '';
    if(!spoilerRevealed(s,message,index))return `<button class="image-spoiler" data-render-key="attachment-${escape(message.id)}-${index}" data-action="reveal-image" data-id="${escape(message.id)}" data-index="${index}" aria-label="Spoiler attachment. Tap to reveal">${icon('eyeOff',28)}<strong>Spoiler attachment</strong><span>Tap to reveal</span></button>`;
    if(/^image\//.test(file.type))return `<button data-render-key="attachment-${escape(message.id)}-${index}" class="message-media-button ${file.previewCrop?'cropped-preview':''}" data-action="view-image" data-id="${escape(message.id)}" data-index="${index}" aria-label="Open ${escape(file.name)}"><img class="message-image" ${file.previewCrop?`style="${cropStyle(file.previewCrop)}"`:''} src="${escape(url)}" alt="${escape(file.name)}" loading="lazy" decoding="async" draggable="false"></button>`;
    if(/^video\/|^audio\//.test(file.type))return `<button class="attachment-card" data-action="view-image" data-id="${escape(message.id)}" data-index="${index}">${icon(file.type.startsWith('video/')?'video':'music',23)}<span class="file-info"><strong>${escape(file.name)}</strong><small>Open ${file.type.startsWith('video/')?'video':'audio'}</small></span>${icon('play',18)}</button>`;
    return `<button class="attachment-card" data-action="download-file" data-id="${escape(message.id)}" data-index="${index}" ${canDownload(s,file)?'':'disabled'}>${icon('folder',23)}<span class="file-info"><strong>${escape(file.name)}</strong><small>${bytes(file.size)}</small></span>${icon('download',18)}</button>`;
  }).join('');
  return `<article class="message ${message.pinned ? 'pinned' : ''} ${grouped ? 'grouped' : ''} ${message.mentions?.includes(s.user.id) ? 'mentioned' : ''} ${highlight}" id="message-${escape(message.id)}" data-message="${escape(message.id)}"><button data-action="profile" data-id="${escape(u.id)}" aria-label="${escape(u.displayName)}'s profile" style="padding:0">${avatar(u)}</button><div class="message-content">${message.replyTo ? `<button class="reply-snippet" data-action="jump-message" data-id="${escape(message.replyTo)}">${icon('reply', 12)}${reply ? `${escape(userFor(s, reply.authorId).displayName)}: ${escape(reply.text.slice(0, 65))}` : 'View replied message'}</button>` : ''}<div class="message-meta"><button class="author-name" data-action="profile" data-id="${escape(u.id)}">${escape(u.displayName)}</button>${isOwner ? '<span class="message-role">OWNER</span>' : ''}<time class="message-time" datetime="${escape(message.createdAt)}" title="${escape(new Date(message.createdAt).toLocaleString('en-GB'))}">${formatTime(message.createdAt)}${message.editedAt ? ' · edited' : ''}</time>${message.pinned ? `<span class="message-time">${icon('pin', 18)}</span>` : ''}</div><div class="message-text">${mentionMarkup(s, message.text)}</div>${attachments}${reactionGroups.length ? `<div class="reactions">${reactionGroups.map(emoji => `<button class="reaction ${message.reactions.some(r => r.userId === s.user.id && r.emoji === emoji) ? 'mine' : ''}" data-action="reaction" data-id="${escape(message.id)}" data-emoji="${escape(emoji)}" aria-label="React ${escape(emoji)}" ${server&&!hasServerPermission(server,'addReactions')?'disabled':''}><span class="reaction-emoji">${escape(emoji)}</span><span class="reaction-count">${message.reactions.filter(r => r.emoji === emoji).length}</span></button>`).join('')}</div>` : ''}</div><div class="message-actions">${!server||hasServerPermission(server,'addReactions')?iconButton('smile','react-menu','Add a reaction',`data-id="${escape(message.id)}"`):''}${iconButton('reply', 'reply', 'Reply', `data-id="${escape(message.id)}"`)}${iconButton('more', 'message-menu', 'Message options', `data-id="${escape(message.id)}"`)}</div></article>`;
}
export function messagesMarkup(s) {
  if(isCollection(activeConversation(s)))return collectionMessages(s,collectionHelpers(s));
  if (isForum(activeConversation(s)) && !s.activeThread) return forumMarkup(s);
  let previousDate, previous;
  return `${s.activeThread ? renderMessage(s,s.activeThread) : ''}${s.hasMore ? '<button class="load-earlier" data-action="load-earlier">Load earlier messages</button>' : ''}${s.messages.map((message,index) => {
    const date = new Date(message.createdAt).toDateString();
    const divider = previousDate !== date ? `<div class="date-divider">${formatDate(message.createdAt)}</div>` : '';
    previousDate = date;
    const connected=other=>other&&message.mentions?.includes(s.user.id)&&other.mentions?.includes(s.user.id)&&new Date(other.createdAt).toDateString()===date&&Math.abs(Date.parse(other.createdAt)-Date.parse(message.createdAt))<=CHAT_CONFIG.groupMinutes*60000;
    const highlight=`${connected(previous)?'mention-connected-before':''} ${connected(s.messages[index+1])?'mention-connected-after':''} ${groupMessage(message,s.messages[index+1])?'continued':''}`;
    const grouped = groupMessage(previous, message); previous = message;
    return divider + renderMessage(s, message, grouped,highlight);
  }).join('')}${!s.messages.length ? `<div class="empty-state"><h2>${s.activeThread?'No replies yet':'No messages yet'}</h2><div class="prose">${markdown(s.activeThread?'Write the first reply below.':currentServer(s)?.welcomeMessage||'Send the first message below.')}</div></div>` : ''}`;
}
export function chatMarkup(s) {
  const channel=activeConversation(s);
  if(isForum(channel)&&!s.activeThread)return forumBoardMarkup(s);
  if(isCollection(channel))return collectionMarkup(s,{header:chatHeader(s,channel.name,{topic:channel.topic})+timeoutMarkup(currentServer(s)),messages:messagesMarkup(s),canWrite:canWrite(s)&&channel.allowAttachments!==false&&hasServerPermission(currentServer(s),'attachFiles'),channel});
  const conv = activeConversation(s);
  const dm = Boolean(conv?.peerId);
  const name = conversationName(s);
  const user = dm ? userFor(s, conv.peerId) : null;
  const readOnly = !canWrite(s),attachmentsAllowed=dm||hasServerPermission(currentServer(s),'attachFiles')&&conv?.allowAttachments!==false;

  return `${chatHeader(s, name, { dm, topic: dm ? statusLabel(user.status) : conv?.topic })}${s.activeThread ? `<div class="thread-heading"><button class="button-secondary" data-action="close-thread">${icon('back', 17)}All topics</button><strong>${escape(s.activeThread.text.split('\n')[0])}</strong></div>` : ''}<div class="message-scroll" id="message-scroll" tabindex="0" aria-label="Conversation history">${isForum(conv)&&!s.activeThread&&conv.cover?`<button class="forum-cover" data-action="view-channel-cover" aria-label="Open forum cover"><img src="${escape(conv.cover)}" alt="" draggable="false"></button>`:''}<div id="message-list">${s.loadingMessages ? '<div class="empty-state"><p>Loading messages…</p></div>' : messagesMarkup(s)}</div></div><button class="jump-latest" data-action="scroll-bottom" id="jump-latest" hidden>${icon('arrowDown', 18)}Jump to latest</button>${readOnly?(timeoutMarkup(currentServer(s)) || `<div class="read-only-composer">${icon('lock',18)}This channel is read-only for your roles.</div>`):`<div class="composer-area"><form id="composer" class="composer-box ${readOnly ? 'read-only' : ''}"><div id="reply-area"></div><div id="pending-area"></div><div class="composer-row">${attachmentsAllowed?`<button type="button" class="icon-button attach-button" data-action="attach" aria-label="Attach a file">${icon('plus',14)}</button>`:''}<textarea id="message-input" ${readOnly ? 'disabled' : ''} name="message" data-limit="${s.config.maxMessageLength || CONFIG.maxMessageLength}" rows="1" placeholder="${readOnly ? 'This channel is read-only' : dm ? `Message @${escape(user.username)}` : isForum(conv) && !s.activeThread ? 'Start a topic — first line is the title' : conv?.type === 'media' ? 'Add a caption and attach media' : `Message #${escape(name)}`}" aria-label="Message ${escape(name)}"></textarea><div class="composer-tools">${attachmentsAllowed?'<button type="button" class="gif-button" data-action="gif" aria-label="Choose a GIF" title="Choose a GIF">GIF</button>':''}<button type="button" class="icon-button" data-action="emoji" aria-label="Add emoji">${icon('smile', 19)}</button><button type="submit" class="icon-button send-button" aria-label="Send message">${icon('send', 16)}</button></div></div></form><div class="composer-hint" id="typing-hint"><span id="character-count"></span><span id="typing-status" class="typing-status" role="status" aria-live="polite" aria-atomic="true"></span><span class="composer-shortcuts"><strong>Enter</strong> to send &nbsp;·&nbsp; <strong>Shift + Enter</strong> for a new line</span></div></div>`}`;
}
export function homeMarkup(s) {
  const server = currentServer(s);
  const inbox = !server && s.homeTab === 'inbox';
  if (!server && inbox) return `<header class="chat-header"><button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="Toggle channels">${icon('menu')}</button><h1 class="header-name">Messages</h1><div class="header-actions"><button class="button-primary" data-action="new-dm">New message</button></div></header><div class="home-content empty-page"><div class="empty-state">${icon('chat', 42)}<h2>No conversation selected</h2><p>Select someone from the sidebar to open your private messages.</p>${s.dms.length ? '' : '<button class="button-secondary" data-action="new-dm">Find someone</button>'}</div></div>`;
  if (!server) return `<header class="chat-header discovery-header"><button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="Toggle channels">${icon('menu')}</button><h1 class="header-name">Discover servers</h1><div class="header-actions"><button class="button-primary" data-action="create-server">${icon('plus',18)}Create server</button></div></header><div class="home-content"><div class="discovery-heading"><h2>Recommended for you</h2><p>Explore public communities on this Nexus service.</p></div>${s.discoveryLoading ? '<p class="field-hint" role="status">Loading public servers…</p>' : s.discoveryError ? '<div class="empty-state"><h2>Could not load servers</h2><p>Try again when your connection returns.</p><button class="button-secondary" data-action="refresh-discovery">Try again</button></div>' : s.discovery?.length ? `<div class="server-grid">${s.discovery.map(server => serverCard(server, true)).join('')}</div>` : '<div class="empty-state"><h2>No public servers yet</h2><p>Your joined servers are in the sidebar. Server owners can enable discovery in Server settings.</p></div>'}</div>`;
  return `<header class="chat-header"><button class="icon-button mobile-menu" data-action="toggle-sidebar" aria-label="Toggle channels">${icon('menu')}</button><h1 class="header-name">${escape(server.name)}</h1></header><div class="home-content"><section class="server-home-banner" ${bannerStyle(server)}></section><div class="server-home-identity">${serverAvatar(server)}<div><h1>${escape(server.name)}</h1><div class="prose">${markdown(server.description)}</div></div></div><div class="channel-cards">${server.channels.map(channel => `<button class="channel-card" data-action="conversation" data-id="${escape(channel.id)}">${icon(channel.type === 'voice' ? 'voice' : 'hash', 22)}<span><strong>${escape(channel.name)}</strong><small>${channel.type === 'voice' ? 'Voice channel' : 'Text channel'}</small></span>${icon('arrow', 16)}</button>`).join('') || '<p class="field-hint">There are no channels available. A server manager can create one.</p>'}</div></div>`;
}
export function voiceTiles(s) {
  const participants = (s.voice || []).filter(participant => participant.conversationId === s.activeConv);
  return participants.flatMap(participant => [{ ...participant, kind: 'camera' }, ...(participant.sharing ? [{ ...participant, kind: 'screen' }] : [])]);
}
export function voiceTileMarkup(s, tile, featured = false) {
  const user = userFor(s, tile.userId);
  const key = `${tile.socketId}:${tile.kind}`;
  const hasVideo = tile.kind === 'screen' ? tile.sharing : tile.camera;
  return `<div class="voice-tile ${featured ? 'featured' : ''} ${hasVideo ? 'expects-video' : ''}" data-media-key="${escape(key)}" data-peer="${escape(tile.socketId)}" data-kind="${tile.kind}"><span class="speaking-indicator" aria-label="Speaking" role="img" aria-hidden="true"><i></i><i></i><i></i></span><div class="tile-avatar">${avatar(user)}</div><span class="tile-name">${escape(user.displayName)}${tile.kind === 'screen' ? ' · Screen' : user.id === s.user.id ? ' (you)' : ''}</span><span class="tile-state">${tile.muted && tile.kind === 'camera' ? icon('micOff', 16) : ''}</span><div class="tile-actions"><button class="icon-button" data-action="focus-media" data-key="${escape(key)}" aria-label="Focus ${escape(user.displayName)} ${tile.kind}" title="Focus">${icon('screen', 17)}</button><button class="icon-button" data-action="fullscreen-media" data-key="${escape(key)}" aria-label="Fullscreen ${escape(user.displayName)} ${tile.kind}" title="Fullscreen">${icon('expand', 17)}</button></div></div>`;
}
export function voiceLayout(s) {
  const tiles = voiceTiles(s);
  const focus = s.mediaFocus === 'grid' ? null : tiles.find(tile => `${tile.socketId}:${tile.kind}` === s.mediaFocus) || tiles.find(tile => tile.kind === 'screen');
  return { tiles, focusKey: focus ? `${focus.socketId}:${focus.kind}` : null };
}
export function voiceStatus(s, call) {
  if (call.connectionIssue) return call.connectionIssue;
  if (call.joining) return 'Connecting to the call…';
  if (!call.active || call.active.conversationId !== s.activeConv) return 'Join with your microphone. You can turn your camera on later.';
  const others = (s.voice || []).filter(participant => participant.conversationId === s.activeConv && participant.socketId !== s.socketId);
  const connected = [...call.peers.values()].filter(peer => peer.pc.connectionState === 'connected').length;
  return others.length && !connected ? 'Connecting audio and video…' : 'In call';
}
export function voiceMarkup(s, call) {
  const dm = Boolean(activeConversation(s)?.peerId);
  const layout = voiceLayout(s);
  return `${chatHeader(s, conversationName(s), { dm, voice: true })}<div class="voice-view" data-conversation="${escape(s.activeConv)}"><div class="voice-info"><span id="voice-status" role="status">${escape(voiceStatus(s, call))}</span><button class="button-secondary" data-action="clear-media-focus">Grid view</button></div><div id="voice-grid" class="voice-grid ${layout.focusKey ? 'presentation-layout' : ''}">${layout.tiles.map(tile => voiceTileMarkup(s, tile, `${tile.socketId}:${tile.kind}` === layout.focusKey)).join('') || '<div class="voice-empty"><h2>No one is in this call yet</h2><p>Join to start talking.</p></div>'}</div><div class="voice-footer"><div id="voice-controls" class="voice-controls">${voiceControlMarkup(s, call)}</div><div id="voice-playback">${s.audioBlocked ? '<button class="button-primary" data-action="enable-call-audio">Enable call audio</button>' : ''}</div></div></div>`;
}
export function voiceControlMarkup(s, call) {
  if(activeTimeout(currentServer(s)))return timeoutMarkup(currentServer(s));
  return call.active?.conversationId === s.activeConv ? voiceButtons(call, activeConversation(s), currentServer(s)) : `<button class="button-primary" data-action="join-voice" ${call.joining ? 'disabled' : ''}>${icon('phone', 18)}${call.joining ? 'Connecting…' : activeConversation(s)?.type==='stage'&&!hasServerPermission(currentServer(s),'manageChannels')?'Listen to stage':'Join call'}</button>`;
}
export function voiceButtons(call, conversation, server) {
  const btn = (name, action, label, active, extra = '') => `<button class="icon-button ${active ? 'active' : ''} ${extra}" data-action="${action}" aria-label="${label}" aria-pressed="${Boolean(active)}" title="${label}" ${action === 'mute'&&call.stageListener || action === 'toggle-video' && call.cameraPending || action === 'toggle-screen' && call.screenPending ? 'disabled' : ''}>${icon(name, 20)}</button>`;
  const mediaAllowed = (conversation?.type !== 'stage' || hasServerPermission(server,'manageChannels')) && (!conversation?.serverId || conversation.allowMedia !== false || hasServerPermission(server, 'manageChannels'));
  return `${btn(call.muted ? 'micOff' : 'mic', 'mute', call.muted ? 'Unmute microphone' : 'Mute microphone', call.muted)}${btn('headphones', 'deafen', call.deafened ? 'Undeafen' : 'Deafen', call.deafened)}${mediaAllowed&&(!server||hasServerPermission(server,'useVideo'))?btn('video','toggle-video',call.video?'Turn camera off':'Turn camera on',call.video):''}${mediaAllowed&&(!server||hasServerPermission(server,'shareScreen'))?btn('screen','toggle-screen',call.sharing?'Stop sharing screen':'Share screen',call.sharing):''}${btn('hangup', 'leave-voice', 'Leave call', false, 'hangup')}`;
}
export function bannerStyle(user) {
  const image=safeImage(user.banner),crop=readCrop(user.bannerCrop);
  const cssImage=image.replace(/[\"'()\\\r\n]/g,char=>`%${char.charCodeAt(0).toString(16).padStart(2,'0')}`);
  return image?`data-artwork-banner style="--artwork-src:url('${escape(cssImage)}');--artwork-x:${crop.x}%;--artwork-y:${crop.y}%;--artwork-zoom:${crop.zoom}"`:`style="background-color:${color(user.accent)}33"`;
}
export function profileIdentity(user) {
  return `<div class="profile-username">@${escape(user.username)}${user.pronouns?`<span aria-hidden="true"> · </span><span class="profile-pronouns">${escape(user.pronouns)}</span>`:''}</div>`;
}
export function profileDetails(user,server,member) {
  return `<div class="profile-bio prose">${markdown(user.bio||'Every profile has a story. This one is just getting started.')}</div>${identitySections(user,server,member)}${user.createdAt?`<div class="profile-detail">HERE SINCE<strong>${new Date(user.createdAt).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</strong></div>`:''}`;
}
export function profileMarkup(s, user) {
  const self=user.id===s.user.id,server=currentServer(s),membership=server?.members.find(member=>member.userId===user.id);
  return `<div class="profile-banner" ${bannerStyle(user)}></div><div class="profile-avatar-row">${avatar(user,{status:true})}</div><div class="profile-body">${profileName(user,'h2','modal-title')}${profileIdentity(user)}${profileDetails(user,server,membership)}<button class="button-primary full-width" data-action="${self?'edit-profile':'open-dm'}" data-id="${escape(user.id)}" style="margin-top:25px">${icon(self?'edit':'chat',18)}${self?'Edit profile':'Start a conversation'}</button>${!self?`<button class="button-secondary full-width block-profile-button" data-action="block-user" data-id="${escape(user.id)}">${icon('ban',18)}Block user</button>`:''}${membership&&!self&&membership.role!=='owner'&&['moderateMembers','kickMembers','banMembers','timeoutMembers','disconnectMembers'].some(key=>hasServerPermission(server,key))?`<button class="button-secondary full-width" style="margin-top:10px" data-action="moderate-member" data-id="${escape(user.id)}">${icon('shield',18)}Moderate member</button>`:''}</div>`;
}
export function settingsMarkup(s,tab,prefs,draft) {
  const tabs=[['profile','Your profile'],['preferences','Preferences'],['appearance','Appearance'],['blocked','Blocked users'],['account','Account']];
  return `<div class="settings-shell"><header class="settings-header"><h2 id="modal-title">Settings</h2><div class="tab-list account-tabs" role="tablist" aria-label="Settings sections">${tabs.map(([key,label])=>`<button class="tab ${tab===key?'active':''}" role="tab" aria-selected="${tab===key}" aria-controls="settings-page" data-action="settings-tab" data-tab="${key}">${label}</button>`).join('')}</div></header><section id="settings-page" class="settings-page" role="tabpanel" tabindex="0">${settingsPageMarkup(s,tab,prefs,draft)}</section></div>`;
}
export function settingsPageMarkup(s,tab,prefs,draft) {
  const isProfile=tab==='profile';
  return `${tab === 'appearance' ? appearanceMarkup(prefs) : tab === 'blocked' ? '<h3>Blocked users</h3><p class="field-hint">Blocked users stay hidden in your conversations and shared servers. You cannot exchange direct messages or media while a block is active.</p><div id="blocked-users" aria-live="polite">Loading…</div>' : isProfile ? `<form data-form="profile"><div class="settings-layout"><div><label for="profile-name">DISPLAY NAME</label><input id="profile-name" name="displayName" value="${escape(draft.displayName)}" maxlength="32" required><label for="profile-pronouns">PRONOUNS <span style="color:var(--subtle)">· optional</span></label><input id="profile-pronouns" name="pronouns" value="${escape(draft.pronouns)}" maxlength="24" placeholder="A little more you"><label for="profile-bio">ABOUT YOU</label><textarea id="profile-bio" name="bio" maxlength="190" rows="3" placeholder="A thought, a passion, a little personality.">${escape(draft.bio)}</textarea><p class="field-hint">@${escape(s.user.username)} is your permanent username. Your display name can change.</p></div><aside><div class="profile-card" id="profile-card-content">${profileCard(draft,{editable:true})}</div><p class="field-hint artwork-help">Use the edit controls on your picture or banner. PNG, JPG, WebP or GIF · Up to ${bytes(s.config.maxProfileBytes)}.</p></aside></div><div id="form-error"></div><div class="modal-footer"><button class="button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button-primary" type="submit">Save your profile ${icon('check', 14)}</button></div></form>` : tab === 'preferences' ? `<div class="settings-row"><span><strong>Sounds</strong><small>Messages, incoming calls and voice controls.</small></span><button class="toggle ${prefs.sounds ? 'on' : ''}" role="switch" aria-checked="${prefs.sounds}" aria-label="Sounds" data-action="pref-sounds"></button></div><div class="sound-volume"><label for="sound-volume">Volume <output id="sound-volume-value">${Number(prefs.soundVolume) || 0}%</output></label><div><input id="sound-volume" type="range" min="0" max="100" step="1" value="${Number(prefs.soundVolume) || 0}" aria-label="Sound volume"><button class="button-secondary" data-action="test-sound">Test sound</button></div></div><div class="settings-row"><span><strong>Animations</strong><small>Soft transitions and new-message animations.</small></span><button class="toggle ${prefs.motion ? 'on' : ''}" role="switch" aria-checked="${prefs.motion}" aria-label="Animations" data-action="pref-motion"></button></div><div class="settings-row"><span><strong>Touch gestures</strong><small>Swipe notifications away, dismiss a sheet from its handle, and navigate images.</small></span><button class="toggle ${prefs.gestures!==false?'on':''}" role="switch" aria-checked="${prefs.gestures!==false}" aria-label="Touch gestures" data-action="pref-gestures"></button></div><div class="settings-row"><span><strong>Compact messages</strong><small>Reduce spacing between messages.</small></span><button class="toggle ${prefs.compact ? 'on' : ''}" role="switch" aria-checked="${prefs.compact}" aria-label="Compact messages" data-action="pref-compact"></button></div><div class="settings-row"><span><strong>Desktop notifications</strong><small>Notifications for private messages.</small></span><button class="toggle ${prefs.notifications ? 'on' : ''}" role="switch" aria-checked="${prefs.notifications}" aria-label="Desktop notifications" data-action="pref-notifications"></button></div><div class="settings-row"><span><strong>Member sidebar</strong><small>Show members next to the conversation.</small></span><button class="toggle ${prefs.members ? 'on' : ''}" role="switch" aria-checked="${prefs.members}" aria-label="Show members" data-action="pref-members"></button></div><p class="field-hint">Appearance, sounds, animations and compact messages follow your account. Panel sizes and desktop notification permission stay on this device. Sounds start after your first click. Do not disturb silences incoming alerts. Your system’s reduced motion setting is always respected.</p>` : `<div class="settings-row"><span><strong>@${escape(s.user.username)}</strong><small>Your account is connected to the Nexus server.</small></span>${icon('shield', 20)}</div><div class="account-identity"><label for="account-id">Account ID</label><div class="account-id-row"><input id="account-id" value="${escape(s.user.id)}" readonly><button class="button-secondary" type="button" data-action="copy-account-id">Copy ID</button></div><p class="field-hint">${s.user.badges?.includes('creator')?'Creator status: Project creator · Linked permanently to this account.':'Creator status: This account is not linked as project creator.'}</p></div><div class="account-actions"><button class="button-secondary" type="button" data-action="logout">${icon('logout',18)}Sign out</button><button class="button-danger" type="button" data-action="delete-account">${icon('trash',18)}Delete account</button></div>`}`;
}
export function artworkEditButton(purpose,kind,label) {
  return `<button type="button" class="artwork-edit" data-action="artwork-menu" data-purpose="${escape(purpose)}" data-kind="${escape(kind)}" aria-label="Edit ${escape(label)}" title="Edit ${escape(label)}">${icon('edit',18)}</button>`;
}
export function profileCard(draft,{editable=false}={}) {
  return `<div class="profile-banner ${editable?'artwork-surface':''}" ${bannerStyle(draft)}>${editable?artworkEditButton('profile','banner','profile banner'):''}</div>${editable?`<div class="profile-avatar-editor artwork-surface">${avatar(draft,{status:true})}${artworkEditButton('profile','avatar','profile picture')}</div>`:avatar(draft,{status:true})}<div class="profile-body">${profileName(draft,'h3')}${profileIdentity(draft)}${profileDetails(draft)}</div>`;
}

export function serverSettingsMarkup(server, draft, imageLimit, rulesLimit) {
  return `<form data-form="server-settings" data-id="${escape(server.id)}"><div class="server-editor" id="server-image-preview">${serverImagePreview(draft,{editable:true})}</div><p class="field-hint">PNG, JPG, WebP or GIF, up to ${bytes(imageLimit)} each. Animated GIFs are supported.</p><label for="server-edit-name">Server name</label><input id="server-edit-name" name="name" value="${escape(draft.name)}" minlength="2" maxlength="60" required><label for="server-edit-description">Description</label><textarea id="server-edit-description" name="description" maxlength="180" rows="3">${escape(draft.description)}</textarea><label for="server-rules">Server rules</label><textarea id="server-rules" name="rules" maxlength="${rulesLimit}" rows="5" placeholder="Write the rules for this server.">${escape(draft.rules || '')}</textarea><label for="server-welcome">Welcome message</label><textarea id="server-welcome" name="welcomeMessage" maxlength="500" rows="3">${escape(draft.welcomeMessage || '')}</textarea><label for="default-notifications">Default message alerts</label><select id="default-notifications" name="defaultNotifications"><option value="all" ${draft.defaultNotifications !== 'mentions' ? 'selected' : ''}>All messages</option><option value="mentions" ${draft.defaultNotifications === 'mentions' ? 'selected' : ''}>Mentions only</option></select><label class="checkbox-row"><input type="checkbox" name="publicListing" ${draft.publicListing ? 'checked' : ''}><span>List this server in discovery<small>Signed-in users can see its name, images and rules and join without an invitation.</small></span></label><div id="form-error"></div><div class="modal-footer settings-actions">${server.role==='owner'?`<button type="button" class="button-danger compact-delete" data-action="delete-server" data-id="${escape(server.id)}" aria-label="Delete server" title="Delete server">${icon('trash',18)}<span>Delete server</span></button>`:''}<span class="action-spacer" aria-hidden="true"></span><button type="button" class="button-secondary" data-action="close-modal">Cancel</button><button type="submit" class="button-primary">Save changes</button></div></form>`;
}
export function serverImagePreview(draft,{editable=false}={}) {
  return `<div class="server-editor-banner ${editable?'artwork-surface':''}" ${bannerStyle(draft)}>${editable?artworkEditButton('server','banner','server banner'):''}</div><div class="server-editor-identity">${editable?`<div class="server-icon-editor artwork-surface">${serverAvatar(draft)}${artworkEditButton('server','icon','server icon')}</div>`:serverAvatar(draft)}<strong>${escape(draft.name)}</strong></div>`;
}

export function mentionMarkup(s,text) {
  return formatMarkdown(text,{resolveMention:username=>{
    if(username==='everyone'&&currentServer(s)||username==='here'&&activeConversation(s)?.peerId)return {group:true,label:username};
    const user=s.users.find(user=>user.username.toLowerCase()===username);return user?{id:user.id,label:user.displayName}:null;
  }});
}
export function pinnedMarkup() {return '';}
export function forumBoardMarkup(s) {
  const channel=activeConversation(s),layout=s.forumLayout||'grid';
  return `${chatHeader(s,channel.name,{topic:channel.topic})}${timeoutMarkup(currentServer(s))}<div class="collection-toolbar"><div><strong>Forum</strong><small>Start a post with text and attachments. Open a post to join its conversation.</small></div><div class="collection-controls"><div class="view-switch" role="group" aria-label="Forum layout"><button data-action="forum-layout" data-layout="grid" aria-pressed="${layout!=='list'}" aria-label="Grid view">${icon('grid',20)}</button><button data-action="forum-layout" data-layout="list" aria-pressed="${layout==='list'}" aria-label="List view">${icon('list',20)}</button></div>${canWrite(s)?`<button class="button-primary" data-action="forum-post">${icon('plus',20)}New post</button>`:'<span class="read-only-label">Read-only forum</span>'}</div></div><div class="message-scroll forum-scroll" id="message-scroll" tabindex="0" aria-label="Forum posts">${channel.cover?`<button class="forum-cover" data-action="view-channel-cover" aria-label="Open forum cover"><img src="${escape(channel.cover)}" style="${cropStyle(channel.coverCrop)}" alt="" draggable="false"></button>`:''}<div id="message-list">${s.loadingMessages?'<p class="field-hint">Loading posts…</p>':forumMarkup(s)}</div></div>`;
}
export function forumMarkup(s) {
  return `<div class="forum-topics ${s.forumLayout==='list'?'list':'grid'}">${s.hasMore?'<button class="load-earlier" data-action="load-earlier">Load earlier posts</button>':''}${s.messages.map(message=>{
    const coverIndex=(message.attachments||[]).findIndex(file=>file.type?.startsWith('image/')),cover=message.attachments?.[coverIndex],user=userFor(s,message.authorId);
    return `<article class="forum-topic" id="topic-${escape(message.id)}">${cover&&!spoilerRevealed(s,message,coverIndex)?`<button class="forum-topic-cover image-spoiler compact-spoiler" data-action="reveal-image" data-id="${escape(message.id)}" data-index="${coverIndex}" aria-label="Spoiler post image. Tap to reveal">${icon('eyeOff',24)}<small>Spoiler</small></button>`:cover?`<button class="forum-topic-cover" data-action="open-thread" data-id="${escape(message.id)}" aria-label="Open post ${escape(message.text.split('\n')[0]||'with attachment')}"><img src="${escape(cover.url)}" style="${cropStyle(cover.previewCrop)}" alt="" loading="lazy" decoding="async" draggable="false"></button>`:`<button class="forum-topic-symbol" data-action="open-thread" data-id="${escape(message.id)}" aria-label="Open post">${icon('chat',28)}</button>`}<button class="forum-topic-copy" data-action="open-thread" data-id="${escape(message.id)}"><strong>${escape(message.text.split('\n')[0]||'A post with attachments')}</strong><small>${escape(user.displayName)} · ${formatDate(message.createdAt)} · ${message.replyCount||0} replies${message.attachments?.length?` · ${message.attachments.length} attachments`:''}</small></button></article>`;
  }).join('')||'<div class="empty-state"><h2>No posts yet</h2><p>Create a post to start a conversation.</p></div>'}</div>`;
}
export function profileName(user,tag='h2',id='') {
  return `<div class="profile-name-line"><${tag}${id?` id="${escape(id)}"`:''} data-user-name="${escape(user.id)}">${escape(user.displayName)}</${tag}>${badgesMarkup(user)}</div>`;
}
export function identitySections(user,server,member) {
  const roles=(server?.roles || []).some(role=>member?.roleIds?.includes(role.id)) || member?.role==='owner';
  return roles?`<section class="profile-identity-section"><h3>Server roles</h3>${rolesMarkup(server,member)}</section>`:'';
}
export function appearanceMarkup(prefs) {
  return `<h3>Interface color</h3><p class="field-hint">Choose a color for backgrounds, navigation, buttons and highlights. Dark mode stays on.</p><div class="palette-options" role="group" aria-label="Interface colors">${Object.entries(PALETTES).map(([key,palette])=>`<button class="palette-option ${(prefs.palette || 'coral')===key?'selected':''}" data-action="set-palette" data-palette="${key}" aria-pressed="${(prefs.palette || 'coral')===key}"><span class="palette-preview" style="--palette-hue:${palette.hue};--palette-accent:${palette.accent}"><i></i><i></i><i></i></span><span>${palette.name}</span>${icon('check',18)}</button>`).join('')}</div><p class="field-hint">Applied immediately and synced with your account. Offline changes sync when the connection returns.</p>`;
}

export function timeoutMarkup(server) {
  const entry=activeTimeout(server);if(!entry)return '';
  return `<div class="moderation-notice" role="status">${icon('micOff',20)}<div><strong>You are muted in this server</strong><span>Messages, voice and stage are unavailable for <time data-moderation-countdown="${entry.expiresAt ?? ''}">${remainingTime(entry.expiresAt)}</time>.</span>${entry.reason?`<small>Reason: ${escape(entry.reason)}</small>`:''}</div></div>`;
}

export function rulesMarkup(server) {
  const sections=[];
  const content=markdown(server.rules || 'The owner has not added rules yet.').replace(/<h([123])>(.*?)<\/h\1>/g,(match,level,title)=>{
    const id=`rules-section-${sections.length}`;sections.push({id,title:title.replace(/<[^>]*>/g,'')});return `<h${level} id="${id}">${title}</h${level}>`;
  });
  return `<header class="rules-heading">${serverAvatar(server)}<div><h2 id="modal-title">Server rules</h2><p class="modal-description">${escape(server.name)}</p></div></header><div class="rules-reader">${sections.length>1?`<details class="rules-sections" open><summary>Sections</summary><nav aria-label="Rule sections">${sections.map(section=>`<button data-action="rules-section" data-id="${section.id}">${section.title}</button>`).join('')}</nav></details>`:''}<div class="rules-content" tabindex="0" aria-label="Server rules"><article class="server-rules prose">${content}</article></div></div>`;
}
