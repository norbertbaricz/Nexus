import { auditEntryMarkup } from './audit.js';
import { CHAT_CONFIG, CHANNEL_TYPES, isVoice, isForum, isCollection, mentionMatch, uploadFile } from './chat-tools.js';
import { activeTimeout, remainingTime } from './moderation.js';
import { CONFIG } from './config.js';
import { syncMarkup } from './dom.js';
import { ChatScroll, showLatest } from './chat-scroll.js';
import { PreferenceSync, SYNC_DEFAULTS } from './preferences.js';
import { Notices } from './notices.js';
import { installGestures } from './gestures.js';
import { ArtworkEditor, cropStyle, readCrop } from './artwork.js';
import { SelectMenus } from './select-menus.js';
import { orderedRoles } from './role-display.js';
import { SidebarResize } from './layout.js';
import { ImageViewer } from './image-viewer.js';
import { applyPalette } from './appearance.js';
import { emojiPicker, emojiGrid, EMOJI_CATEGORIES, searchGiphy } from './pickers.js';
import { icon, nexusLogo } from './icons.js';
import { NexusCall } from './rtc.js';
import { NexusSounds } from './sounds.js';
import * as UI from './ui.js';
import * as CommunityUI from './community-ui.js';
import { NexusMediaView, toggleMediaFullscreen } from './media-view.js';

// Account preferences sync with the server; device layout and unsent drafts stay local.
const DEFAULT_PREFERENCES = { ...SYNC_DEFAULTS, members: false, notifications: false, collapsedCategories: {}, voiceMembers: false };
const $ = selector => document.querySelector(selector);
const e = UI.escape;
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
let preferences = { ...DEFAULT_PREFERENCES, ...readLocal(CONFIG.preferencesKey, {}) };
let state = {
  user: null, users: [], blockedIds: [], servers: [], dms: [], voice: [], config: { ...CONFIG },
  forumLayout:preferences.forumLayout, revealedSpoilers:new Set(), collectionLayout: preferences.mediaLayout, lastDM: null, activeThread: null, historyWindow: false, pins: [], collapsedCategories: preferences.collapsedCategories, activeServer: null, activeConv: null, view: 'home', homeTab: 'inbox', messages: [], hasMore: false,
  loadingMessages: false, discovery: [], discoveryLoading: false, discoveryError: false, mediaFocus: null, audioBlocked: false, connected: false, sending: false, pending: [], replyTo: null,
};
let socket = null;
let followChat = true;
let unreadBelow = 0;
const settingsScroll = new Map();
const serverSettingsScroll = new Map();
let modalDirty = false;
let profileDirty = false;
let serverGeneralDirty = false;
let serverPoliciesDirty = false;
let roleDirty = false;
let memberRoleDrafts = {};
let composerResizeObserver;
let gifCatalog = [];
let gifRequest;
let gifSearchTimer;
let gifRevision = 0;
let gifPage = { query: '', nextOffset: 0, hasMore: false };
let popoverAnchor = null;
let popoverWidth = 205;
let popoverResizeObserver;
let reconnectTimer;
let connectionNoticeActive = false;
let connectionNoticeNode = null;
let activityAt = Date.now();
let lastActivitySent = 0;
let draggedItem = null;
let imageUploads = 0;
let imageUploadController;
const attachmentNodes = new WeakMap();
let messageRevision = 0;
let workspaceQueue = Promise.resolve();
let modalType = '';
let modalPreviousFocus = null;
let profileDraft = null;
let profileUploadKind = 'avatar';
let serverDraft = null;
let serverUploadKind = 'icon';
let serverSettingsTab = 'general';
let serverChildReturnTab = null;
let roleDraft = null;
let serverMemberId = null;
let discoveryUpdatedAt = 0;
let previousCallId = null;
let previousMuteState = false;
let previousDeafenState = false;
let settingsTab = 'profile';
let incomingCall = null;
let searchResults = [];
let searchRevision = 0;
let searchTimer;
let lastTyping = 0;
const typingUsers = new Map();
const getCall = () => call;
const call = new NexusCall({
  getSocket:()=>socket,getConfig:()=>state.config,
  getMediaAllowed:(conversationId,kind='camera')=>{
    const server=state.servers.find(server=>server.channels.some(channel=>channel.id===conversationId)),channel=server?.channels.find(channel=>channel.id===conversationId);
    return !server || (channel.type!=='stage'||UI.hasServerPermission(server,'manageChannels')) && (channel.allowMedia!==false||UI.hasServerPermission(server,'manageChannels')) && UI.hasServerPermission(server,kind==='screen'?'shareScreen':'useVideo');
  },
  getCanSpeak:conversationId=>{const server=state.servers.find(server=>server.channels.some(channel=>channel.id===conversationId)),channel=server?.channels.find(channel=>channel.id===conversationId);return !server||UI.hasServerPermission(server,'speak')&&(channel.type!=='stage'||UI.hasServerPermission(server,'manageChannels'));},
  getPeerAllowed:userId=>!state.blockedIds.includes(userId),onChange:()=>renderCall(),onIncoming:payload=>showIncomingCall(payload),onError:message=>toast(message,true)
});
const sounds = new NexusSounds({ getSettings: () => preferences, isQuiet: () => call.deafened || state.user?.preferredStatus === 'dnd' || state.user?.status === 'dnd' });
const mediaView = new NexusMediaView({ getState: () => ({ ...state, socketId: socket?.id }), getCall: () => call, getSocketId: () => socket?.id, getRoot: () => $('#main'), getMediaRoot: () => $('#media-root'), onPlaybackBlocked: blocked => { state.audioBlocked = blocked; if (state.view === 'voice') mediaView.update(); } });
const panels=new SidebarResize({getPreferences:()=>preferences,onSave:()=>savePreferences()});
const imageViewer=new ImageViewer({getState:()=>state,showModal,request,toast,escape:e,canDownload:file=>UI.canDownload(state,file)});
const notices=new Notices($('#toasts'));
const artworkEditor=new ArtworkEditor();
const selectMenus=new SelectMenus($('#modal-root'));
const chatScroll=new ChatScroll({getFollow:()=>followChat,setFollow:value=>{followChat=value;if(value)unreadBelow=0;},getHistory:()=>state.historyWindow,motion:()=>preferences.motion!==false&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches,onChange:()=>{updateScrollButton();if(followChat&&!state.historyWindow&&!state.loadingMessages&&!document.hidden&&state.view==='chat'&&UI.activeConversation(state)?.unread)markRead(state.activeConv);}});
const preferenceSync=new PreferenceSync({request,onApply:values=>{Object.assign(preferences,values);persistLocalPreferences();applyPreferences();refreshSettingsControls();},onStatus:()=>{}});

// Browsers permit audio after a deliberate user gesture. Never queue surprise audio.
for (const eventName of ['pointerdown', 'keydown']) document.addEventListener(eventName, () => {
  if (preferences.sounds) sounds.unlock();
}, { capture: true, passive: true });

function persistLocalPreferences() {
  try { const value=JSON.stringify(preferences);if(localStorage.getItem(CONFIG.preferencesKey)!==value)localStorage.setItem(CONFIG.preferencesKey,value); } catch { /* Browser storage is optional. */ }
}
function savePreferences() {
  persistLocalPreferences();applyPreferences();preferenceSync.queue(preferences);
  if (!preferences.sounds || !Number(preferences.soundVolume)) sounds.stopAll();
}
function applyPreferences() {
  if(document.documentElement.dataset.palette!==preferences.palette)applyPalette(preferences.palette);
  document.body.classList.toggle('compact', preferences.compact);
  document.body.classList.toggle('reduce-motion', preferences.motion === false);
  const showMembers=state.view==='voice'?preferences.voiceMembers:preferences.members;
  $('#app').classList.toggle('no-members',!showMembers || !state.activeConv);
  if(state.view==='voice'&&!showMembers)$('#app').classList.remove('show-members');
  state.collectionLayout=preferences.mediaLayout;state.forumLayout=preferences.forumLayout;panels.apply();
  if(isForum(UI.activeConversation(state))&&!state.activeThread){const list=$('.forum-topics');if(list){list.classList.toggle('grid',preferences.forumLayout!=='list');list.classList.toggle('list',preferences.forumLayout==='list');}for(const node of document.querySelectorAll('[data-action=forum-layout]'))node.setAttribute('aria-pressed',String(node.dataset.layout===preferences.forumLayout));}
  if(UI.activeConversation(state)?.type==='media'){const list=$('#message-list');list?.classList.toggle('list',preferences.mediaLayout==='list');$('#message-scroll')?.classList.toggle('list-layout',preferences.mediaLayout==='list');for(const node of document.querySelectorAll('[data-action=collection-layout]'))node.setAttribute('aria-pressed',String(node.dataset.layout===preferences.mediaLayout));}
  if (!preferences.sounds || !Number(preferences.soundVolume)) sounds.stopAll();
}
function refreshSettingsControls() {
  if(modalType!=='settings')return;
  for(const [key,action] of Object.entries({sounds:'pref-sounds',motion:'pref-motion',compact:'pref-compact',gestures:'pref-gestures',members:'pref-members',notifications:'pref-notifications'})){
    const node=$(`#modal-root [data-action=${action}]`);if(node){node.classList.toggle('on',Boolean(preferences[key]));node.setAttribute('aria-checked',String(Boolean(preferences[key])));}
  }
  for(const node of document.querySelectorAll('#modal-root [data-action=set-palette]')){const selected=node.dataset.palette===preferences.palette;node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));}
  const volume=$('#sound-volume');if(volume&&document.activeElement!==volume)volume.value=preferences.soundVolume;
  if($('#sound-volume-value'))$('#sound-volume-value').textContent=`${preferences.soundVolume}%`;

}
function toast(message, error = false) {return notices.show(String(message),error);}
async function request(endpoint, options = {}, refreshSource = true) {
  const opts = { credentials: 'same-origin', ...options, headers: { ...options.headers } };
  if (options.body && !((options.body instanceof FormData || options.body instanceof Blob))) { opts.body = JSON.stringify(options.body); opts.headers['Content-Type'] = 'application/json'; }
  if (!['GET', 'HEAD', 'OPTIONS'].includes((opts.method || 'GET').toUpperCase()) && state.config.csrfToken) opts.headers['X-Nexus-CSRF'] = state.config.csrfToken;
  let response;
  try { response = await fetch(endpoint, opts); } catch (error) { if(error.name==='AbortError')throw error; throw new Error('Nexus is unreachable. Check your connection and try again.'); }
  const result = await response.json().catch(() => ({}));
  if (response.status === 403 && result.code === 'SOURCE_VERIFICATION_FAILED' && refreshSource && endpoint !== '/api/config') {
    const configResponse = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' });
    if (configResponse.ok) {
      Object.assign(state.config, await configResponse.json());
      return request(endpoint, options, false);
    }
  }
  if (!response.ok) {
    if (response.status === 401 && state.user && !endpoint.includes('/auth/')) { socket?.disconnect(); call.leave(false); state.user = null; showAuth(); }
    const error = new Error(result.error || 'This action could not be completed.'); error.status = response.status;error.moderation=result.moderation;error.ownedServers=result.ownedServers;throw error;
  }
  return result;
}
function messageForUI(id) {return state.messages.find(message=>message.id===id)||(state.activeThread?.id===id?state.activeThread:null)||state.pins.find(message=>message.id===id);}
function userFor(id) { return state.users.find(u => u.id === id) || { id, displayName: 'Nexus user', username: 'user', accent: '#b9a1f0' }; }
function rememberView() {
  try { sessionStorage.setItem(`nexus.view.${state.user.id}`, JSON.stringify({ server: state.activeServer, conversation: state.activeConv, view: state.view, homeTab: state.homeTab, lastDM: state.lastDM })); } catch { /* Navigation can work without persistence. */ }
}
function setMarkup(node, html) {
  syncMarkup(node,html);
}
function renderChrome() {
  if (!state.user) return;
  setMarkup($('#workspace-nav'), UI.renderNavigation(state));
  setMarkup($('#sidebar'), UI.renderSidebar(state, getCall()));
  setMarkup($('#members'), UI.renderMembers(state));
  applyPreferences();
  const unread = UI.totalUnreadCount(state);
  document.title = `${unread ? `(${unread}) ` : ''}${state.activeConv ? `${UI.conversationName(state)} · ` : ''}Nexus`;
}
function draftKey() { return `${CONFIG.draftPrefix}${state.user?.id}.${state.activeConv}${state.activeThread?`.${state.activeThread.id}`:''}`; }
function restoreComposer() {
  const input = $('#message-input');
  if (!input) return;
  try { input.value = localStorage.getItem(draftKey()) || ''; } catch { /* Drafts are optional. */ }
  resizeInput(); renderPending();
}
function renderMain({ bottom = false, preservePosition = false } = {}) {
  const oldTop=preservePosition?$('#message-scroll')?.scrollTop:null;
  if (!state.user) return;
  document.body.classList.toggle('has-composer', state.view === 'chat' && !isCollection(UI.activeConversation(state)));
  if (state.view === 'voice' && mediaView.update()) return;
  composerResizeObserver?.disconnect();
  $('#main').innerHTML = state.view === 'home' ? UI.homeMarkup(state) : state.view === 'voice' ? UI.voiceMarkup({ ...state, socketId: socket?.id }, getCall()) : UI.chatMarkup(state);
  if (state.view === 'chat') { restoreComposer();watchComposer();renderTyping(); bindChatScroll(); if (bottom) scrollBottom();else if(oldTop!=null&&$('#message-scroll'))$('#message-scroll').scrollTop=oldTop; }
  if (state.view === 'voice') mediaView.update();
}
function renderAll(options) { renderChrome(); renderMain(options); renderDock(); }
function isBoard(){return isCollection(UI.activeConversation(state))||isForum(UI.activeConversation(state))&&!state.activeThread;}
function scrollBottom(smooth=false) {if(!isBoard())chatScroll.bottom({smooth});}
function updateScrollButton() {const button=$('#jump-latest'),node=$('#message-scroll');if(button){button.hidden=isBoard()||!showLatest({following:followChat,history:state.historyWindow,loading:state.loadingMessages,distance:chatScroll.distance(),unread:unreadBelow,scrollable:node&&node.scrollHeight>node.clientHeight+1});button.innerHTML=`${icon('arrowDown',18)}${unreadBelow?`${unreadBelow} new · `:''}Jump to latest`;}}
function renderMessages(forceBottom = false, animateId = null) {
  const list = $('#message-list'), scroller = $('#message-scroll');
  if (!list || !scroller) return;
  const atBottom = followChat;
  const oldTop = scroller.scrollTop;
  if (state.messages.length > CHAT_CONFIG.maxRenderedMessages && atBottom) {state.messages=state.messages.slice(-CHAT_CONFIG.maxRenderedMessages);state.hasMore=true;}
  syncMarkup(list, UI.messagesMarkup(state));
  if (animateId) document.getElementById(`message-${animateId}`)?.classList.add('new-message');
  if (forceBottom || atBottom) scrollBottom(); else { scroller.scrollTop = oldTop; updateScrollButton(); }
}
function refreshWorkspace() {
  // Serialize snapshots so a late response cannot restore stale membership data.
  const task = workspaceQueue.catch(() => {}).then(async () => {
    const signature=()=>{const c=UI.activeConversation(state);return JSON.stringify([UI.currentServer(state)?.permissions,c&&[c.id,c.type,c.name,c.topic,c.readOnly,c.allowAttachments,c.allowMedia,c.cover,c.coverCrop,c.userLimit,c.slowmodeSeconds],UI.currentServer(state)?.moderation?.expiresAt]);};
    const before=signature();
    const result = await request('/api/bootstrap');
    Object.assign(state, result);
    preferenceSync.attach(state.user.id,result.accountPreferences,preferences);
    const policyChanged=before!==signature();
    if(policyChanged&&state.activeConv&&state.view==='chat'){if(modalType==='collection-upload'&&(!UI.canWrite(state)||!UI.hasServerPermission(UI.currentServer(state),'attachFiles')))closeModal(true,true);renderMain({preservePosition:true});const download=$('[data-action=viewer-download]');if(download)download.hidden=!UI.canDownload(state,imageViewer.items[imageViewer.index]);}
    if (state.activeConv && !state.servers.flatMap(server => server.channels).concat(state.dms).some(conversation => conversation.id === state.activeConv)) {
      ++messageRevision; state.activeConv = null; state.view = 'home'; state.messages = []; state.pending = []; state.replyTo = null;
      if (!state.servers.some(server => server.id === state.activeServer)) state.activeServer = null;
      renderMain();
    }
    renderChrome();
  });
  workspaceQueue = task;
  return task;
}
async function loadWorkspace() {
  state.config = await request('/api/config');
  await refreshWorkspace();
  state.connected = false;
  $('#auth-screen')?.remove();
  $('#app').inert = false; $('#app').removeAttribute('aria-hidden');
  let previous;
  try { previous = JSON.parse(sessionStorage.getItem(`nexus.view.${state.user.id}`)); } catch { /* Begin at the default channel. */ }
  state.lastDM = state.dms.some(dm => dm.id === previous?.lastDM) ? previous.lastDM : null;
  if (previous?.homeTab === 'spaces' || previous?.homeTab === 'inbox') state.homeTab = previous.homeTab;
  const conversations = state.servers.flatMap(s => s.channels).concat(state.dms);
  if (previous?.conversation && conversations.some(c => c.id === previous.conversation)) {
    await selectConversation(previous.conversation,{autoJoin:false});
  } else {
    state.activeServer = null; state.activeConv = null; state.view = 'home'; renderAll();
  }
  await connectRealtime();
  if (state.view === 'home' && !state.activeServer && state.homeTab === 'spaces') refreshDiscovery();
  const invite = new URLSearchParams(location.search).get('invite');
  if (invite) { showJoinServer(invite); history.replaceState(null, '', location.pathname); }
}
async function connectRealtime() {
  if (!window.io) await new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/socket.io/socket.io.js';
    script.onload = resolve; script.onerror = () => reject(new Error('Live connection could not be loaded. Refresh to try again.')); document.head.append(script);
  });
  socket?.disconnect();
  socket = window.io({ withCredentials: true, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 15000, randomizationFactor: 0.4, auth: { csrfToken: state.config.csrfToken } });
  let sourceRetries = 0;
  call.bind(socket);
  socket.on('connect', async () => {
    clearTimeout(reconnectTimer); sourceRetries = 0; console.info('[Nexus] Live connection restored.'); state.connected = true; state.socketId = socket.id;
    try {
      await refreshWorkspace();
      if (state.view === 'chat'&&followChat) await loadMessages(state.activeConv, true);
      renderChrome();syncConnectionBanner();preferenceSync.flush();sendActivity(true);
      if (call.resumeAfterReconnect) await call.reconnect();
    } catch (error) { toast(error.message, true); }
  });
  socket.on('disconnect', reason => { console.info('[Nexus] Live connection interrupted:', reason); state.connected = false; sounds.stopRing(); if(incomingCall){if(modalType==='incoming')closeModal(true);else{sounds.stopRing();incomingCall=null;}} if (state.user) {renderChrome();syncConnectionBanner();} });
  socket.on('connect_error', async error => {
    state.connected = false;
    if (error.data?.code === 'SOURCE_VERIFICATION_FAILED' && sourceRetries++ < 1) {
      try {
        Object.assign(state.config, await request('/api/config'));
        socket.auth = { csrfToken: state.config.csrfToken }; socket.connect(); return;
      } catch (refreshError) { toast(refreshError.message, true); }
    }
    if (error.message === 'Sign in to connect.') { clearTimeout(reconnectTimer); showAuth(); }
    else if (state.user) { renderChrome(); syncConnectionBanner(); clearTimeout(reconnectTimer); reconnectTimer = setTimeout(() => { if (state.user && navigator.onLine) socket.connect(); }, 5000); console.warn('[Nexus] Reconnecting:', error.message); }
  });
  socket.on('account:deleted',finishAccountDeletion);
  socket.on('session:expired', () => { sounds.stopAll(); state.user = null; call.leave(false); showAuth(); toast('Your session expired. Sign in again.'); });
  socket.on('blocks:updated', () => refreshBlockedView().catch(error=>toast(error.message,true)));
  socket.on('discovery:updated', () => { discoveryUpdatedAt = 0; if (state.homeTab === 'spaces' && state.view === 'home' && !state.activeServer) refreshDiscovery(true); });
  socket.on('conversation:deleted', async ({id}) => { if (state.lastDM === id) state.lastDM = null; if (state.activeConv === id) { state.activeConv = null; state.activeThread = null; state.messages = []; state.pending = []; state.view = 'home'; } await refreshWorkspace(); renderAll(); });
  socket.on('workspace:updated', () => refreshWorkspace().then(() => { if (state.view === 'home') renderMain(); }).catch(error => toast(error.message, true)));
  socket.on('preferences:updated',snapshot=>preferenceSync.accept(snapshot));
  socket.on('preferences:status',({status})=>{if(!state.user)return;state.user.preferredStatus=status;if(status==='dnd')sounds.stopAll();renderChrome();});
  socket.on('pins:updated',payload=>{updatePinState(payload);if(payload.conversationId===state.activeConv&&$('#popover-root .pins-panel'))loadPins().then(()=>renderPinPanel()).catch(error=>toast(error.message,true));});
  socket.on('pins:read',updatePinState);
  socket.on('user:updated', user => {
    if(state.blockedIds.includes(user.id))return;
    const previous=state.users.find(item=>item.id===user.id);const identityChanged=previous&&['displayName','username','avatar','banner','avatarCrop','bannerCrop','bio','pronouns'].some(key=>JSON.stringify(previous[key])!==JSON.stringify(user[key]));
    const at = state.users.findIndex(u => u.id === user.id);
    if (at >= 0) state.users[at] = user; else state.users.push(user);
    if (state.user?.id === user.id) state.user = { ...state.user, ...user };
    renderChrome();patchUserPresence(user);if(identityChanged&&state.view==='chat')renderMessages();
  });
  socket.on('message:new', message => {
    if(state.blockedIds.includes(message.authorId))return;
    if (message.conversationId === state.activeConv && typingUsers.delete(message.authorId)) renderTyping();
    const alreadyVisible = state.messages.some(item => item.id === message.id);
    const conversation = state.servers.flatMap(server => server.channels).concat(state.dms).find(item => item.id === message.conversationId);
    if (conversation && !alreadyVisible && message.authorId !== state.user?.id) conversation.unread = (conversation.unread || 0) + 1;
    if (!alreadyVisible && message.authorId !== state.user?.id && shouldSound(message)) sounds.play(message.mentions?.includes(state.user.id) ? 'mention' : 'message');
    if (message.conversationId === state.activeConv && state.view === 'chat') {
      if (!state.historyWindow && (message.threadId || null) === (state.activeThread?.id || null)) { if (!state.messages.some(m => m.id === message.id)) state.messages.push(message); } else { const root = state.messages.find(item => item.id === message.threadId); if (root) root.replyCount = (root.replyCount || 0) + 1; }
      if (!followChat && message.authorId !== state.user.id) unreadBelow++;
      renderMessages(message.authorId === state.user?.id, alreadyVisible ? null : message.id);
      if (document.visibilityState === 'visible' && followChat) markRead(message.conversationId);
    }
    const dm = state.dms.find(d => d.id === message.conversationId);
    if (dm) {
      dm.lastMessage = message;
      state.dms = [dm, ...state.dms.filter(d => d !== dm)];
      if (preferences.notifications && state.user.preferredStatus !== 'dnd' && message.authorId !== state.user?.id && (document.hidden || state.activeConv !== dm.id) && 'Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(`${userFor(message.authorId).displayName} · Nexus`, { body: message.text.slice(0, 120) || 'Sent an attachment', tag: dm.id });
        notification.onclick = () => { window.focus(); selectConversation(dm.id); notification.close(); };
      }
    }
    renderChrome();
  });
  socket.on('message:updated', message => { if(!state.blockedIds.includes(message.authorId))upsertMessage(message); });
  socket.on('message:deleted', payload => {
    if (payload.conversationId === state.activeConv && state.activeThread?.id===payload.id) {state.activeThread=null;loadMessages(state.activeConv).then(()=>renderMain({bottom:true}));}
    if (payload.conversationId === state.activeConv) { state.messages = state.messages.filter(m => m.id !== payload.id); state.pins = state.pins.filter(m => m.id !== payload.id); refreshPinButton(); renderMessages(); }
  });
  socket.on('conversation:read', ({ conversationId }) => { clearUnread(conversationId); });
  socket.on('typing', ({ userId, conversationId }) => {
    if (!state.blockedIds.includes(userId) && userId !== state.user?.id && conversationId === state.activeConv) { typingUsers.set(userId, Date.now()); renderTyping(); }
  });
  socket.on('voice:state', ({ conversationId, participants }) => {
    if (call.active?.conversationId === conversationId) {
      const previous = state.voice.filter(v => v.conversationId === conversationId && v.socketId !== socket.id);
      const current = participants.filter(v => v.socketId !== socket.id);
      if (current.some(v => !previous.some(old => old.socketId === v.socketId))) sounds.play('join');
      else if (previous.some(v => !current.some(next => next.socketId === v.socketId))) sounds.play('leave');
    }
    state.voice = state.voice.filter(v => v.conversationId !== conversationId).concat(participants);
    renderChrome(); renderCall();
    if (incomingCall?.conversationId === conversationId && !participants.some(p => p.userId === incomingCall.user.id)) { if(modalType==='incoming')closeModal(true);else{sounds.stopRing();incomingCall=null;} }
  });
}
function shouldSound(message) {
  if (state.dms.some(dm => dm.id === message.conversationId)) return true;
  const server = state.servers.find(server => server.channels.some(channel => channel.id === message.conversationId));
  return Boolean(server && (server.defaultNotifications !== 'mentions' || message.mentions?.includes(state.user.id)));
}
function upsertMessage(message) {
  if (message.conversationId !== state.activeConv) return;
  if (message.pinned) { const index = state.pins.findIndex(pin => pin.id === message.id); if (index >= 0) state.pins[index] = message; else state.pins.push(message); } else state.pins = state.pins.filter(pin => pin.id !== message.id);
  refreshPinButton();
  if (message.conversationId !== state.activeConv) return;
  if(state.activeThread?.id===message.id){state.activeThread=message;const heading=$('.thread-heading > strong');if(heading)heading.textContent=message.text.split('\n')[0];renderMessages();return;}
  const at = state.messages.findIndex(m => m.id === message.id);
  if (at >= 0) state.messages[at] = message;
  renderMessages();
}
function clearUnread(conversationId) {
  const item = state.servers.flatMap(s => s.channels).concat(state.dms).find(c => c.id === conversationId);
  if (item) item.unread = 0; renderChrome();
}
async function markRead(conversationId) {
  if (!conversationId || document.hidden) return;
  clearUnread(conversationId);
  try { await request(`/api/conversations/${encodeURIComponent(conversationId)}/read`, { method: 'POST', body: {} }); } catch { /* Reconnection reloads the authoritative unread counts. */ }
}
async function selectConversation(conversationId, {autoJoin=true} = {}) {
  const channel = state.servers.flatMap(s => s.channels).find(c => c.id === conversationId);
  const dm = state.dms.find(d => d.id === conversationId);
  if (!channel && !dm) return;
  ++messageRevision;
  state.activeConv = conversationId; state.activeServer = channel?.serverId || null;
  state.homeTab = dm ? 'inbox' : 'spaces'; if (dm) state.lastDM = conversationId;
  state.activeThread = null;state.revealedSpoilers.clear(); state.historyWindow=false; state.pins = []; followChat = true; unreadBelow = 0;
  state.view = isVoice(channel) ? 'voice' : 'chat';
  state.messages = []; state.hasMore = false; state.replyTo = null; clearPending(); typingUsers.clear();
  state.loadingMessages = state.view === 'chat';
  $('#app').classList.remove('sidebar-open', 'show-members');
  $('#attachment-input').accept='';
  rememberView(); closePopover(); renderAll({ bottom: true });
  if (state.view === 'chat') { await Promise.all([loadMessages(conversationId), loadPins(conversationId)]); markRead(conversationId); }
  else if (autoJoin && call.active?.conversationId !== conversationId) await joinVoice(false, false);
}
async function loadMessages(conversationId, quiet = false) {
  const revision = ++messageRevision;
  try {
    const query=new URLSearchParams(state.activeThread?{threadId:state.activeThread.id}:{});
    const result = await request(`/api/conversations/${encodeURIComponent(conversationId)}/messages?${query}`);
    if (revision !== messageRevision || conversationId !== state.activeConv) return;
    state.messages = result.messages; state.hasMore = result.hasMore; state.historyWindow=false; state.loadingMessages = false;
    renderMessages(!quiet);
    if (!quiet) scrollBottom();
  } catch (error) {
    if (revision === messageRevision) { state.loadingMessages = false; renderMessages(); toast(error.message, true); }
  }
}
function selectServer(serverId) {
  const server = state.servers.find(v => v.id === serverId);
  if (!server) return;
  const c = server.channels.find(c => c.name === 'general') || server.channels[0];
  if (c) return selectConversation(c.id,{autoJoin:false});
  state.activeServer = serverId; state.activeConv = null; state.view = 'home'; renderAll();
}
function selectHome(keepServer = false) {
  if (!keepServer && state.homeTab === 'inbox' && state.lastDM && state.dms.some(dm => dm.id === state.lastDM)) return selectConversation(state.lastDM);
  ++messageRevision;
  if (!keepServer) state.activeServer = null;
  state.activeConv = null; state.view = 'home'; clearPending(); state.replyTo = null; rememberView(); renderAll();
  if (!state.activeServer && state.homeTab === 'spaces') refreshDiscovery();
  $('#app').classList.remove('sidebar-open', 'show-members');
}
function watchComposer() {
  const input=$('#main .composer-row textarea');if(!input)return;
  composerResizeObserver ||= new ResizeObserver(syncComposerPlaceholder);
  composerResizeObserver.observe(input);syncComposerPlaceholder();
}
function syncComposerPlaceholder() {
  const input=$('#main .composer-row textarea');if(!input)return;
  input.dataset.contextPlaceholder ||= input.getAttribute('placeholder') || 'Message';
  const value=input.clientWidth<CONFIG.composerContextMinWidth?'Message':input.dataset.contextPlaceholder;
  if(input.placeholder!==value)input.placeholder=value;
}
function resizeInput() {
  const input = $('#message-input');
  if (!input) return;
  syncComposerPlaceholder();
  input.style.height = `${CONFIG.composerMinHeight}px`;
  input.style.height = `${Math.min(CONFIG.composerMaxHeight, Math.max(CONFIG.composerMinHeight, input.scrollHeight))}px`;
  positionCallDock();
}
function clearPending() { for (const file of state.pending) if (file.localUrl) {if(file.uploading)file.controller?.abort();URL.revokeObjectURL(file.localUrl);} state.pending = []; }
function renderPending() {
  const reply = $('#reply-area'), pending = $('#pending-area');
  if (reply) {
    const message = messageForUI(state.replyTo);
    reply.innerHTML = message ? `<div class="reply-bar">${icon('reply', 13)}Replying to <strong>${e(userFor(message.authorId).displayName)}</strong><button type="button" class="icon-button" data-action="cancel-reply" aria-label="Cancel reply">${icon('close', 13)}</button></div>` : '';
  }
  if (pending) {
    if(!state.pending.length)pending.replaceChildren();
    else {
      let list=pending.querySelector('.pending-files');if(!list){list=document.createElement('div');list.className='pending-files';pending.append(list);}
      const live=new Set();
      state.pending.forEach((file,index)=>{
        let card=attachmentNodes.get(file);
        if(!card){card=document.createElement('div');card.className='pending-file';card.innerHTML=`${/^image\//.test(file.type)||file.gifId?`<button type="button" class="pending-thumbnail" data-action="position-attachment" aria-label="Position image preview" title="Position image preview"><img src="${e(file.localUrl||file.url)}" alt="${e(file.name)}"></button>`:icon('attachment',24)}<div><strong>${e(file.name)}</strong><small></small><progress max="100" aria-label="Upload progress"></progress></div><div class="pending-actions"><button type="button" data-action="toggle-attachment-spoiler" class="icon-button" aria-label="Mark as spoiler">${icon('eyeOff',18)}</button><button type="button" data-action="remove-attachment" class="icon-button" aria-label="Remove ${e(file.name)}">${icon('close',18)}</button></div>`;attachmentNodes.set(file,card);}
        card.classList.toggle('uploading',Boolean(file.uploading));card.querySelector('small').textContent=file.uploading?`${file.paused?'Reconnecting · ':''}${file.progress||0}%`:(file.gifId||file.provider)?'GIF':UI.bytes(file.size||0);const progress=card.querySelector('progress');progress.hidden=!file.uploading;progress.value=file.progress||0;for(const button of card.querySelectorAll('[data-index], [data-action=remove-attachment], [data-action=toggle-attachment-spoiler], [data-action=position-attachment]'))button.dataset.index=index;const spoiler=card.querySelector('[data-action=toggle-attachment-spoiler]');spoiler.hidden=false;spoiler.setAttribute('aria-pressed',String(Boolean(file.spoiler)));spoiler.setAttribute('aria-label',file.spoiler?'Remove spoiler':'Mark as spoiler');card.classList.toggle('spoiler-pending',Boolean(file.spoiler));const preview=card.querySelector('.pending-thumbnail img');if(preview)preview.style.cssText=cropStyle(file.previewCrop);
        live.add(card);if(list.children[index]!==card)list.insertBefore(card,list.children[index]||null);
      });
      for(const child of [...list.children])if(!live.has(child))child.remove();
    }
  }
  updateComposerLimit();
}
async function sendMessage() {
  const input = $('#message-input');
  if (!input || input.disabled || state.sending || state.loadingMessages) return;
  const body = input.value.trim(), conversationId = state.activeConv;
  if (!body && !state.pending.length) return;
  if (body.length > state.config.maxMessageLength) { toast(`Messages can contain up to ${state.config.maxMessageLength.toLocaleString('en-US')} characters.`, true); return; }
  if (state.pending.some(file => file.uploading || !file.id && !file.gifId && !file.provider)) { toast('Wait for your attachments to finish uploading.', true); return; }
  if (!state.connected) { toast('Wait for your connection to return before sending.', true); return; }
  state.sending = true;
  $('#composer button[type="submit"]').disabled = true;
  try {
    const result = await request(`/api/conversations/${encodeURIComponent(conversationId)}/messages${state.activeThread ? `?threadId=${encodeURIComponent(state.activeThread.id)}` : ''}`, { method: 'POST', body: {
      text:body,attachmentCrops:Object.fromEntries(state.pending.filter(file=>file.previewCrop).map(file=>[attachmentKey(file),file.previewCrop])),spoilers:state.pending.filter(file=>file.spoiler).map(attachmentKey), attachments: state.pending.filter(f => !f.gifId && !f.provider).map(f => f.id), gifs: state.pending.filter(f => f.gifId).map(f => f.gifId), providerGifs: state.pending.filter(f=>f.provider).map(({provider,providerId,url,title})=>({provider,providerId,url,title})), replyTo: state.replyTo, threadId: state.activeThread?.id || null,
    } });
    sounds.play('sent');
    if (conversationId === state.activeConv) {
      if (!state.messages.some(m => m.id === result.message.id)) state.messages.push(result.message);
      input.value = ''; input.style.height = `${CONFIG.composerMinHeight}px`; clearPending(); state.replyTo = null;
      try { localStorage.removeItem(draftKey()); } catch { /* Draft storage can be unavailable. */ }
      renderMessages(true, result.message.id); renderPending(); if(['collection-upload','forum-post'].includes(modalType))closeModal(false,true);else input.focus(); markRead(conversationId);
    }
  } catch (error) { toast(error.message, true); }
  finally { state.sending = false; const button = $('#composer button[type="submit"]'); if (button) button.disabled = false; }
}
function renderTyping() {
  const hint = $('#typing-status'); if (!hint) return;
  for (const [id, time] of typingUsers) if (Date.now() - time > CONFIG.typingExpiryMs) typingUsers.delete(id);
  const users = [...typingUsers.keys()].filter(id => id !== state.user?.id && !state.blockedIds.includes(id)).map(userFor);
  const markup = UI.typingMarkup(users);
  if (hint._typingMarkup !== markup) { hint.innerHTML = markup; hint._typingMarkup = markup; }
}
setInterval(renderTyping, 1500);
function showModal(content, { type = 'generic', wide = false, profile = false } = {}) {
  dismissConfirmation();closePopover();
  if(modalType==='server-settings'&&$('#server-settings-page'))serverSettingsScroll.set(serverSettingsTab,$('#server-settings-page').scrollTop);
  if (modalType !== type) modalDirty = false;
  $('#app').inert = true; $('#app').setAttribute('aria-hidden', 'true');
  const existing = $('#modal-root .modal');
  const stable = existing && modalType === type && ['settings', 'server-settings','image-viewer'].includes(type);
  const focused = document.activeElement;
  const focusTab = focused?.dataset?.tab;
  if (!existing) modalPreviousFocus = focused;
  if (stable) {
    existing.querySelector('.modal-content').innerHTML = content;
    existing.querySelector('.modal-content').scrollTop = 0;
  } else {
    $('#modal-root').innerHTML = `<div class="modal-overlay"><section class="modal ${wide ? 'wide' : ''} ${profile ? 'profile-modal' : ''} ${['settings', 'server-settings'].includes(type) ? 'settings-dialog' : ''}" data-modal-type="${e(type)}" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="modal-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="Close dialog">${icon('close', 18)}</button><div class="modal-drag-handle" aria-hidden="true"><span></span></div><div class="modal-content">${content}</div></section></div>`;
  }
  modalType = type;
  if(type==='server-rules'&&window.innerWidth<=CONFIG.mobileBreakpoint)$('#modal-root .rules-sections')?.removeAttribute('open');
  if (stable && focusTab) { $('#modal-root')?.querySelector(`[data-tab="${CSS.escape(focusTab)}"]`)?.focus({ preventScroll: true }); return; }
  if (!stable) $('#modal-root .modal')?.focus({preventScroll:true});
}
function closeModal(keepCall = false, force = false) {
  if($('#dialog-guard-root')){dismissConfirmation();if(!force)return;}
  if (imageUploads && !force) {toast('Wait for the image upload to finish before closing settings.');return;}
  if ((modalDirty || modalType==='settings'&&profileDirty || modalType==='server-settings'&&(serverGeneralDirty||serverPoliciesDirty||roleDirty||Object.keys(memberRoleDrafts).length)) && !force && ['settings', 'server-settings', 'channel-settings', 'create-channel', 'category'].includes(modalType)) {
    showConfirmation(`<div class="modal-emblem">${icon('edit',24)}</div><h2 id="confirmation-title">Save your changes?</h2><p class="modal-description">Your edits have not been saved. Save them before leaving, or keep editing.</p><div class="confirmation-actions"><button class="button-primary" data-action="save-modal-drafts">Save changes</button><button class="button-secondary" data-action="keep-editing">Keep editing</button><button class="button-danger" data-action="discard-changes">Discard changes</button></div>`, 'unsaved');return;
  }
  if(serverChildReturnTab && state.user){const tab=serverChildReturnTab;serverChildReturnTab=null;modalDirty=false;showServerSettings(tab,true);return;}
  if(['collection-upload','forum-post'].includes(modalType))clearPending();
  selectMenus.close();
  modalDirty = false; profileDirty=false;serverGeneralDirty=false;serverPoliciesDirty=false;roleDirty=false;memberRoleDrafts={};
  if (modalType === 'incoming') { sounds.stopRing(); if(keepCall)incomingCall = null; }
  $('#modal-root').innerHTML = ''; modalType = ''; ++searchRevision;
  const authenticating = Boolean($('#auth-screen')); $('#app').inert = authenticating;
  if (authenticating) $('#app').setAttribute('aria-hidden', 'true'); else $('#app').removeAttribute('aria-hidden');
  if (modalPreviousFocus?.isConnected) modalPreviousFocus.focus({preventScroll:true});
}
function formError(message) { toast(message, true); const node = $('#dialog-guard-root #form-error') || $('#form-error'); if (node) node.innerHTML = `<p class="form-error" role="alert">${e(message)}</p>`; }
function closePopover() { clearTimeout(gifSearchTimer); gifRequest?.abort(); gifRequest=null; ++gifRevision; popoverResizeObserver?.disconnect(); popoverAnchor=null; $('#popover-root').innerHTML = ''; }
function popover(content, anchor, width = 205) {
  closePopover();
  popoverAnchor=anchor;popoverWidth=width;
  $('#popover-root').innerHTML = `<div class="popover" style="width:${Math.min(width,window.innerWidth - 24)}px">${content}</div>`;
  positionPopover();
  popoverResizeObserver=new ResizeObserver(positionPopover);
  popoverResizeObserver.observe($('#popover-root .popover'));
}
function positionPopover() {
  const node = $('#popover-root .popover');
  if(!node || !popoverAnchor?.isConnected)return;
  const rect=popoverAnchor.getBoundingClientRect(),viewport=window.visualViewport;
  const width=viewport?.width || window.innerWidth,heightAvailable=viewport?.height || window.innerHeight,top=viewport?.offsetTop || 0;
  node.style.width=`${Math.min(popoverWidth,width-24)}px`;
  node.style.maxHeight = `${Math.max(100, Math.min(560,heightAvailable-24))}px`;
  const height = node.offsetHeight;
  node.style.left = `${Math.min(width-node.offsetWidth-12,Math.max(12,rect.left))}px`;
  const desired=rect.bottom+height+20<top+heightAvailable?rect.bottom+8:rect.top-height-8;
  node.style.top=`${Math.max(top+12,Math.min(desired,top+heightAvailable-height-12))}px`;
}
function showAbout() {
  showModal(`<div class="modal-emblem">${nexusLogo()}</div><h2 id="modal-title">Nexus connects your world.</h2><p class="modal-description">Communities, direct conversations and shared voice rooms, connected through your Nexus server.</p><div class="check-list"><div>${icon('check')}Your account and conversations are saved on the server.</div><div>${icon('check')}Invite people to a space or reach someone by username.</div><div>${icon('check')}Make your identity yours with animated profile images.</div><div>${icon('check')}Voice, video and screen sharing use real device connections.</div></div><p class="field-hint">Nexus uses authenticated sessions and conversation permissions. Stored messages are not end-to-end encrypted. <a href="/third-party-notices.txt" target="_blank" rel="noopener noreferrer">Third-party licenses</a>.</p><button class="button-primary full-width" style="margin-top:24px" data-action="close-modal">Back to Nexus ${icon('arrow', 14)}</button>`);
}
function showAddServer() {
  showModal(`<div class="modal-emblem">${icon('people', 25)}</div><h2 id="modal-title">Add a server</h2><p class="modal-description">Create a server or join one with an invite.</p><button class="option-card" data-action="create-server">${icon('plus', 23)}<span><strong>Create server</strong><small>Add text and voice channels.</small></span>${icon('arrow', 16)}</button><button class="option-card" data-action="join-server">${icon('link', 23)}<span><strong>Join server</strong><small>Use an invitation link or code.</small></span>${icon('arrow', 16)}</button>`);
}
function showCreateServer() {
  showModal(`<div class="modal-emblem">${icon('sparkle', 25)}</div><h2 id="modal-title">Create server</h2><p class="modal-description">Add a name and an optional description. You can upload an icon and banner in Server settings.</p><form data-form="create-server"><label for="server-name">SERVER NAME</label><input name="name" id="server-name" maxlength="60" minlength="2" placeholder="Server name" required><label for="server-description">Description</label><textarea name="description" id="server-description" maxlength="180" placeholder="What is this server for?"></textarea><div id="form-error"></div><div class="modal-footer"><button type="button" class="button-secondary" data-action="add-server">Back</button><button class="button-primary">Create your server ${icon('arrow', 14)}</button></div></form>`);
}
function showJoinServer(value = '') {
  showModal(`<div class="modal-emblem">${icon('link', 25)}</div><h2 id="modal-title">Join server</h2><p class="modal-description">Paste an invite link or code.</p><form data-form="join-server"><label for="invite-code">INVITE LINK OR CODE</label><input id="invite-code" name="invite" value="${e(value)}" placeholder="Paste your invitation here" required maxlength="300"><div id="form-error"></div><div class="modal-footer"><button class="button-primary full-width">Join the community ${icon('arrow', 14)}</button></div></form>`);
}
function showAddChannel() {
  if(modalType==='server-settings')serverChildReturnTab=serverSettingsTab;
  const server=UI.currentServer(state);if(!server||!UI.hasServerPermission(server,'manageChannels'))return;
  showModal(CommunityUI.createChannelMarkup(server),{type:'create-channel'});
}
async function showInvite() {
  const server = UI.currentServer(state); if (!server) { showAddServer(); return; }
  if (!UI.hasServerPermission(server, 'inviteMembers')) { toast('Ask a server manager for an invite link.'); return; }
  const { invite } = await request(`/api/servers/${encodeURIComponent(server.id)}/invite`, { method: 'POST', body: {} });
  const link = `${location.origin}/?invite=${invite}`;
  showModal(`<div class="modal-emblem">${icon('people', 25)}</div><h2 id="modal-title">Invite people</h2><p class="modal-description">Invite someone to ${e(server.name)}. Copy the link below to invite someone.</p><label for="share-invite">YOUR INVITE LINK</label><input id="share-invite" value="${e(link)}" readonly><div class="modal-footer"><button class="button-primary full-width" data-action="copy-invite">${icon('copy', 15)}Copy invitation</button></div><p class="field-hint">Anyone with this link can join your server. Share it with people you want to invite.</p>${UI.hasServerPermission(server,'manageInvites')?'<button class="button-secondary" style="margin-top:15px" data-action="rotate-invite">Replace invite link</button>':''}`);
}
function showServerSettings(tab = 'general', keepDraft = false) {
  const server = UI.currentServer(state);
  if (!server || !CommunityUI.MANAGEMENT_KEYS.some(key=>UI.hasServerPermission(server,key))) return;
  if (!keepDraft || serverDraft?.id !== server.id) { serverDraft = { ...server }; roleDraft = null; serverMemberId = null; serverGeneralDirty=false;serverPoliciesDirty=false;roleDirty=false;memberRoleDrafts={};serverSettingsScroll.clear(); }
  const available=CommunityUI.serverTabs(server);if(!available.some(([key])=>key===tab))tab=available[0]?.[0];
  const page=modalType==='server-settings'&&$('#server-settings-page');
  if(page){serverSettingsScroll.set(serverSettingsTab,page.scrollTop);serverSettingsTab=tab;page.innerHTML=CommunityUI.serverAdminMarkup(state,server,serverDraft,tab,roleDraft,serverMemberId,memberRoleDrafts,true);for(const node of document.querySelectorAll('[data-action=server-tab]')){const selected=node.dataset.tab===tab;node.classList.toggle('active',selected);node.setAttribute('aria-selected',String(selected));}page.scrollTop=serverSettingsScroll.get(tab)||0;$(`[data-action=server-tab][data-tab=${tab}]`)?.focus({preventScroll:true});}
  else{serverSettingsTab=tab;showModal(CommunityUI.serverAdminMarkup(state,server,serverDraft,tab,roleDraft,serverMemberId,memberRoleDrafts),{type:'server-settings',wide:true});$('#server-settings-page').scrollTop=serverSettingsScroll.get(tab)||0;}
  if (tab === 'moderation' || tab === 'audit') loadAdministration(tab, server.id).catch(error => toast(error.message,true));
}
function showChannelSettings(channelId) {
  if(modalType==='server-settings')serverChildReturnTab=serverSettingsTab;
  const server = state.servers.find(server => server.channels.some(channel => channel.id === channelId));
  const channel = server?.channels.find(channel => channel.id === channelId);
  if (!channel || !UI.hasServerPermission(server, 'manageChannels')) return;
  showModal(CommunityUI.channelSettingsMarkup(server, channel), { type: 'channel-settings', wide: true });
}
async function refreshDiscovery(force = false) {
  if (state.discoveryLoading || !force && Date.now() - discoveryUpdatedAt < CONFIG.discoveryRefreshMs) return;
  state.discoveryLoading = true; state.discoveryError = false;
  if (state.view === 'home' && !state.activeServer && state.homeTab === 'spaces') renderMain();
  try { state.discovery = (await request('/api/discovery')).servers; discoveryUpdatedAt = Date.now(); }
  catch { state.discoveryError = true; }
  finally { state.discoveryLoading = false; if (state.view === 'home' && !state.activeServer && state.homeTab === 'spaces') renderMain(); }
}
function showPublicServer(serverId) {
  const server = state.discovery.find(server => server.id === serverId); if (!server) return;
  showModal(`<h2 id="modal-title">${e(server.name)}</h2><div class="modal-description prose">${UI.markdown(server.description)}</div><div class="server-editor">${UI.serverImagePreview(server)}</div><h3>Server rules</h3><div class="server-rules">${UI.markdown(server.rules || 'This server has not added any rules yet.')}</div><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-primary" data-action="join-public-server" data-id="${e(server.id)}">Join server</button></div>`);
}
function updateServerImages() {
  for(const button of document.querySelectorAll('[data-action=server-crop], [data-action=remove-server-image]'))button.disabled=!serverDraft?.[button.dataset.kind];
  const node = $('#server-image-preview');
  if (node && serverDraft) syncMarkup(node,UI.serverImagePreview(serverDraft,{editable:true}));
}
function showCollectionUpload() {
  if(!UI.canWrite(state)||!UI.hasServerPermission(UI.currentServer(state),'attachFiles')){toast('You cannot publish attachments in this channel.',true);return;}
  showModal(`<h2 id="modal-title">Add media or files</h2><p class="modal-description">Share images, video, audio or documents. Nothing is published until you select Publish.</p><form id="composer" class="collection-upload-form"><div id="pending-area"></div><button type="button" class="upload-dropzone" data-action="attach">${icon('attachment',28)}<strong>Choose media or files</strong><small>Up to ${UI.bytes(state.config.maxUploadBytes)} per file</small></button><label for="message-input">Caption <span class="field-hint">· optional · Markdown supported</span></label><textarea id="message-input" rows="2" aria-label="Optional caption" placeholder="Add context to your files"></textarea><div id="typing-hint"><span id="character-count"></span></div><div class="modal-footer"><button type="button" class="button-secondary" data-action="close-modal">Cancel</button><button type="button" class="button-secondary" data-action="gif">Choose GIF</button><button type="submit" class="button-primary" disabled>Publish</button></div></form>`,{type:'collection-upload',wide:true});
  renderPending();
}
function showForumPost() {
  if(!isForum(UI.activeConversation(state))||state.activeThread||!UI.canWrite(state))return;
  const attachments=UI.hasServerPermission(UI.currentServer(state),'attachFiles')&&UI.activeConversation(state).allowAttachments!==false;
  showModal(`<h2 id="modal-title">New forum post</h2><p class="modal-description">The first line is your title. Add more text, Markdown and optional attachments below.</p><form id="composer" class="forum-post-form"><label for="message-input">Post</label><textarea id="message-input" rows="6" aria-label="Forum post" placeholder="Give your post a title&#10;Share what you have in mind…"></textarea><div id="pending-area"></div><div id="typing-hint"><span id="character-count"></span></div><div class="modal-footer">${attachments?`<button type="button" class="button-secondary" data-action="attach">${icon('attachment',20)}Add files</button><button type="button" class="button-secondary" data-action="gif">Choose GIF</button>`:''}<button type="button" class="button-secondary" data-action="emoji">${icon('smile',20)}Emoji</button><button type="submit" class="button-primary">Create post</button></div></form>`,{type:'forum-post',wide:true});
  restoreComposer();updateComposerLimit();
}

function syncChannelType() {
  const select=$('#channel-type')||$('#edit-channel-type');if(!select)return;
  const hint=$('#channel-type-hint'),fields=$('#channel-cover-fields');if(hint)hint.textContent=CommunityUI.CHANNEL_DESCRIPTIONS[select.value];if(fields)fields.hidden=!isForum({type:select.value});
}
function showProfile(userId) { if(state.blockedIds.includes(userId))return;showModal(UI.profileMarkup(state, userFor(userId)), { type: 'profile', profile: true }); }
function showSettings(tab = 'profile', keepDraft = false) {
  if (!keepDraft) {profileDraft={...state.user};profileDirty=false;settingsScroll.clear();}
  const stable=modalType==='settings'&&$('#settings-page');
  if(stable) {
    if(settingsTab===tab){refreshSettingsControls();return;}
    settingsScroll.set(settingsTab,$('#settings-page').scrollTop);
    settingsTab=tab;$('#settings-page').innerHTML=UI.settingsPageMarkup(state,tab,preferences,profileDraft);
    for(const node of document.querySelectorAll('#modal-root [data-action=settings-tab]')){const selected=node.dataset.tab===tab;node.classList.toggle('active',selected);node.setAttribute('aria-selected',String(selected));}
    $('#settings-page').scrollTop=settingsScroll.get(tab)||0;
    $(`#modal-root [data-action=settings-tab][data-tab=${tab}]`)?.focus({preventScroll:true});
  } else {settingsTab=tab;showModal(UI.settingsMarkup(state,tab,preferences,profileDraft),{type:'settings',wide:true});}
  refreshSettingsControls();
}
function updateProfileCard() {
  for(const button of document.querySelectorAll('[data-action=profile-crop], [data-action=remove-profile-image]'))button.disabled=!profileDraft?.[button.dataset.kind];
  const profileCard = $('#profile-card-content'); if (profileCard) syncMarkup(profileCard,UI.profileCard(profileDraft,{editable:true}));
}
function showSearch(kind = 'quick') {
  const messageSearch = kind === 'messages' || kind === 'pinned';
  if (messageSearch && !state.activeConv) { toast('Open a conversation to search its messages.'); return; }
  const title = kind === 'new-dm' ? 'New message' : kind === 'pinned' ? 'Pinned messages' : messageSearch ? 'Search messages' : 'Search Nexus';
  showModal(`<h2 id="modal-title">${title}</h2><p class="modal-description">${kind === 'new-dm' ? 'Find someone by their permanent username.' : kind === 'pinned' ? 'Pinned messages in this conversation.' : messageSearch ? `Search in ${e(UI.conversationName(state))}.` : 'Search your channels, communities, and people.'}</p>${kind !== 'pinned' ? `<input id="workspace-search" type="search" placeholder="${kind === 'new-dm' ? 'Type a username…' : messageSearch ? 'Search messages…' : 'Search channels or people…'}" autocomplete="off" aria-label="Search">` : ''}<div class="search-results" id="search-results"></div>`, { type: `search:${kind}` });
  if(kind!=='pinned')$('#workspace-search')?.focus({preventScroll:true});
  runSearch('', kind).catch(error => toast(error.message, true));
}
async function runSearch(query, kind) {
  const revision = ++searchRevision;
  let html = '';
  if (kind === 'messages' || kind === 'pinned') {
    const result = await request(`/api/conversations/${encodeURIComponent(state.activeConv)}/messages?${new URLSearchParams(kind === 'pinned' ? { pinned: 'true' } : { q: query })}`);
    searchResults = result.messages;
    html = searchResults.map(m => `<button class="search-item" data-action="search-result-message" data-id="${e(m.id)}">${UI.avatar(userFor(m.authorId))}<span><strong>${e(userFor(m.authorId).displayName)} <small style="display:inline;margin-left:8px">${UI.formatTime(m.createdAt)}</small></strong><small>${e(m.text || 'An attachment worth keeping.')}</small></span>${icon('arrow', 13)}</button>`).join('');
  } else {
    const q = query.toLowerCase();
    if (kind === 'quick') {
      html = state.servers.flatMap(s => s.channels.map(c => ({ ...c, serverName: s.name }))).filter(c => `${c.name} ${c.serverName}`.toLowerCase().includes(q)).slice(0, 8).map(c => `<button class="search-item" data-action="conversation" data-id="${e(c.id)}">${icon(c.type === 'voice' ? 'voice' : 'hash', 20)}<span><strong>${e(c.name)}</strong><small>${e(c.serverName)}</small></span>${icon('arrow', 13)}</button>`).join('');
    }
    let users = state.users.filter(u => u.id !== state.user.id && u.username.toLowerCase().includes(q));
    if (query.length >= 2) {
      const result = await request(`/api/users?q=${encodeURIComponent(query)}`); users = result.users;
      for (const user of users) if (!state.users.some(u => u.id === user.id)) state.users.push(user);
    }
    html += users.slice(0, 10).map(u => `<button class="search-item" data-action="open-dm" data-id="${e(u.id)}">${UI.avatar(u, { status: true })}<span><strong>${e(u.displayName)}</strong><small>@${e(u.username)}</small></span>${icon('chat', 15)}</button>`).join('');
  }
  if (revision !== searchRevision || modalType !== `search:${kind}`) return;
  $('#search-results').innerHTML = html || `<div class="empty-state">${icon(kind === 'pinned' ? 'pin' : 'search')}<p>${kind === 'pinned' ? 'No pinned messages yet. Keep a good one using the pin button on a message.' : query ? 'Nothing here yet. Try a different name or word.' : kind === 'new-dm' ? 'Search for a username to start your first conversation.' : 'A little quiet here. Start something good.'}</p></div>`;
}
async function openDM(userId) {
  const { id } = await request('/api/dms', { method: 'POST', body: { userId } });
  await refreshWorkspace(); modalDirty = false; closeModal(); state.homeTab = 'inbox'; await selectConversation(id);
}
async function react(messageId, emoji) {
  const result = await request(`/api/messages/${encodeURIComponent(messageId)}/reactions`, { method: 'POST', body: { emoji } });
  upsertMessage(result.message);
}
function positionCallDock() {
  const dock=$('#call-dock');if(!dock||dock.hidden)return;
  const composer=$('#main .composer-area')||$('#main .read-only-composer')||$('#main .moderation-notice');
  const viewport=window.visualViewport,bottom=(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight);
  dock.style.setProperty('--dock-bottom',`${composer?Math.max(16,window.innerHeight-composer.getBoundingClientRect().top+12):Math.max(16,window.innerHeight-bottom+16)}px`);
}
function renderDock() {
  const current = getCall(); const dock = $('#call-dock');
  if (!current.active || state.view === 'voice' && state.activeConv === current.active.conversationId) { dock.hidden = true; return; }
  dock.hidden = false;
  positionCallDock();
  dock.innerHTML = `<div class="dock-info">${icon('voice', 15)}<strong>In voice room</strong><button class="icon-button" data-action="leave-voice" aria-label="Disconnect">${icon('hangup', 15)}</button></div><button data-action="return-to-call">${e(UI.conversationName(state, current.active.conversationId))} ${icon('arrow', 11)}</button>`;
}
function renderCall() {
  const activeId = call.active?.conversationId || null;
  if (activeId !== previousCallId) {
    if (state.user) sounds.play(activeId ? 'join' : 'leave');
    previousCallId = activeId;
  } else if (activeId && (call.muted !== previousMuteState || call.deafened !== previousDeafenState)) {
    sounds.play(call.muted || call.deafened ? 'mute' : 'unmute', { preview: true });
  }
  previousMuteState = call.muted; previousDeafenState = call.deafened;
  if (state.user && state.view === 'voice' && !mediaView.update()) renderMain();
  mediaView.bind(); renderDock();
  if (!getCall().active) $('#media-root').innerHTML = '';
}
function bindMedia() { mediaView.bind(); }
async function joinVoice(video = false, invite = false) {
  if (!state.activeConv || call.joining) return;
  const target = state.activeConv;
  const timeout=activeTimeout(UI.currentServer(state));if(timeout){showModerationRestriction({...timeout,serverName:UI.currentServer(state).name});return;}
  Object.assign(state.config, await request('/api/config'));
  toast(call.getCanSpeak(target) ? 'Waiting for microphone access…' : 'Joining as a stage listener…');
  await call.join(target, { video, invite });
  if (target === state.activeConv) state.view = 'voice';
  renderAll();
}
function showIncomingCall(payload) {
  if(state.blockedIds.includes(payload.user.id))return;
  if (call.active || incomingCall) return;
  incomingCall = payload;
  sounds.startRing();
  if (!state.users.some(u => u.id === payload.user.id)) state.users.push(payload.user);
  showModal(`<div style="text-align:center;padding-top:12px">${UI.avatar(payload.user, { status: true })}<h2 id="modal-title" style="margin:20px 0 10px">${e(payload.user.displayName)}</h2><p class="modal-description">${payload.video ? 'Incoming video call.' : 'Incoming voice call.'}</p><div class="modal-footer" style="justify-content:center"><button class="button-danger" data-action="decline-call">${icon('hangup', 17)}Decline</button><button class="button-primary" data-action="accept-call">${icon(payload.video ? 'video' : 'phone', 17)}Answer</button></div></div>`, { type: 'incoming' });
}
function showAuth(mode = 'login', error = '') {
  composerResizeObserver?.disconnect();preferenceSync.detach();
  document.title = mode === 'register' ? 'Nexus · Create account' : 'Nexus · Sign in';
  closeModal(true); closePopover();
  $('#app').inert = true; $('#app').setAttribute('aria-hidden', 'true');
  $('#auth-screen')?.remove();
  const register = mode === 'register';
  const node = document.createElement('div'); node.id = 'auth-screen'; node.className = 'auth-screen';
  node.innerHTML = `<section class="auth-art"><div class="auth-brand">${nexusLogo()}nexus<span class="auth-brand-caption">NEXUS COMMUNICATIONS</span></div><div><h1>Your world.<br>Connected.</h1><p>Bring your communities, messages and calls into one connected workspace.</p></div></section><div class="auth-form-wrap"><form class="auth-form" data-form="${register ? 'register' : 'login'}"><div class="eyebrow" style="margin-bottom:20px">${register ? 'NEXUS' : 'NEXUS'}</div><h2>${register ? 'Create account' : 'Welcome back.'}</h2><p>${register ? 'Create an account to start chatting.' : 'Sign in to your account.'}</p>${register ? '<label for="auth-name">Display name</label><input name="displayName" id="auth-name" maxlength="32" autocomplete="nickname" placeholder="Your display name" required>' : ''}<label for="auth-user">USERNAME</label><input name="username" id="auth-user" minlength="3" maxlength="24" autocomplete="username" placeholder="Username" required>${register ? `<p class="field-hint">Your username is permanent. People find you with it. You can change your display name anytime.</p><label class="creator-claim-label" for="creator-claim" hidden>Creator claim token</label><input id="creator-claim" name="creatorClaimToken" type="password" autocomplete="off" hidden>` : ''}<label for="auth-password">PASSWORD</label><input type="password" id="auth-password" name="password" minlength="${register ? state.config.minPasswordLength || 10 : 1}" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="${register ? 'At least 10 characters' : 'Your password'}" required><div id="form-error">${error ? `<p class="form-error">${e(error)}</p>` : ''}</div><button class="button-primary full-width" type="submit">${register ? 'Create your account' : 'Sign in'} ${icon('arrow', 15)}</button><div class="auth-switch">${register ? 'Already have an account?' : 'New to Nexus?'}<button type="button" data-action="auth-switch" data-mode="${register ? 'login' : 'register'}">${register ? 'Sign in' : 'Create account'}</button></div></form></div>`;
  document.body.append(node);
}
async function uploadFiles(files, purpose = 'attachment', serverId = null, onProgress, signal) {
  const uploaded = [];
  for (const file of files) uploaded.push(await uploadFile(file, { request, config: state.config, purpose, serverId, onProgress, signal }));
  return uploaded;
}
async function jumpMessage(messageId) {
  chatScroll.history();
  const conversationId=state.activeConv,threadId=state.activeThread?.id||null,revision=++messageRevision;
  if (!state.messages.some(message=>message.id===messageId)&&state.activeThread?.id!==messageId) {
    const result=await request(`/api/conversations/${conversationId}/messages?around=${encodeURIComponent(messageId)}${threadId?`&threadId=${encodeURIComponent(threadId)}`:''}`);
    if(revision!==messageRevision||conversationId!==state.activeConv||threadId!==(state.activeThread?.id||null))return;
    state.messages=result.messages;state.hasMore=result.hasMore;state.historyWindow=Boolean(result.hasNewer);state.loadingMessages=false;renderMessages();
  }
  const node=document.getElementById(`message-${messageId}`)||document.querySelector(`[id^="collection-${CSS.escape(messageId)}-"]`)||document.getElementById(`topic-${messageId}`);
  if(node){chatScroll.jump(node);node.classList.remove('highlight-message');void node.offsetWidth;node.classList.add('highlight-message');}
  else if(state.activeThread?.id===messageId)chatScroll.jump($('#message-list'));
  else toast('That message is no longer available in this conversation.');
  updateScrollButton();
}
async function loadEarlier() {
  if (!state.hasMore || !state.messages.length) return;
  const conv = state.activeConv;
  const scroller = $('#message-scroll'), height = scroller?.scrollHeight || 0, top = scroller?.scrollTop || 0;
  const result = await request(`/api/conversations/${encodeURIComponent(conv)}/messages?before=${encodeURIComponent(state.messages[0].id)}${state.activeThread ? `&threadId=${encodeURIComponent(state.activeThread.id)}` : ''}`);
  if (conv !== state.activeConv) return;
  state.messages = result.messages.concat(state.messages); state.hasMore = result.hasMore;
  chatScroll.history(); renderMessages(); if (scroller) scroller.scrollTop = top + scroller.scrollHeight - height;
}

// One delegated interaction layer keeps freshly rendered views consistent.
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!$('#popover-root').contains(event.target)) closePopover();
  if (event.target.classList.contains('modal-overlay')) { if (!['settings','server-settings','channel-settings','category'].includes(modalType)) closeModal(); return; }
  if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if(['profile-upload','server-upload','profile-crop','server-crop','remove-profile-image','remove-server-image'].includes(action))closePopover();
  try {
    switch (action) {
      case 'home': state.homeTab = 'spaces'; state.activeThread = null; selectHome(); break;
      case 'inbox': state.homeTab = 'inbox'; selectHome(); break;
      case 'community-home': selectHome(true); break;
      case 'server': await selectServer(id); break;
      case 'conversation': closeModal(); await selectConversation(id); break;
      case 'toggle-sidebar': $('#app').classList.toggle('sidebar-open'); break;
      case 'toggle-members': {
        const preference=state.view==='voice'?'voiceMembers':'members';
        if (window.innerWidth <= CONFIG.membersOverlayBreakpoint) { $('#app').classList.toggle('show-members'); if (!preferences[preference]) { preferences[preference] = true; savePreferences(); } }
        else { preferences[preference] = !preferences[preference]; savePreferences(); }
        break; }
      case 'about': showAbout(); break;
      case 'add-server': showAddServer(); break;
      case 'create-server': showCreateServer(); break;
      case 'join-server': showJoinServer(); break;
      case 'add-channel': showAddChannel(); break;
      case 'server-settings': showServerSettings(); break;
      case 'server-tab': showServerSettings(button.dataset.tab, true); break;
      case 'edit-channel': showChannelSettings(id); break;
      case 'rules-section': document.getElementById(id)?.scrollIntoView({block:'start',behavior:preferences.motion===false?'instant':'smooth'});break;
      case 'server-rules': {
        const server = UI.currentServer(state); if (!server) break;
        showModal(UI.rulesMarkup(server),{type:'server-rules',wide:true}); break;
      }
      case 'edit-role': {
        const role=orderedRoles(UI.currentServer(state)).find(role=>role.id===id); if (!role) break;
        roleDraft = { ...role }; showServerSettings('roles', true); break;
      }
      case 'new-role': roleDraft = null; showServerSettings('roles', true); break;
      case 'delete-role':
        showModal(`<h2 id="modal-title">Delete role?</h2><p class="modal-description">This removes the role from every assigned member and updates private channel access.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-delete-role" data-id="${e(id)}">Delete role</button></div>`); break;
      case 'confirm-delete-role':
        await request(`/api/servers/${encodeURIComponent(state.activeServer)}/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await refreshWorkspace(); modalDirty=false;roleDirty=false; roleDraft = null; showServerSettings('roles', true); break;
      case 'delete-channel':
        showModal(`<h2 id="modal-title">Delete channel?</h2><p class="modal-description">The channel, its messages and attached files will be permanently removed.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-delete-channel" data-id="${e(id)}">Delete channel</button></div>`); break;
      case 'confirm-delete-channel':
        await request(`/api/channels/${encodeURIComponent(id)}`, { method: 'DELETE' }); await refreshWorkspace(); closeModal(); renderAll(); toast('Channel deleted.'); break;
      case 'refresh-discovery': await refreshDiscovery(true); break;
      case 'discover-server': showPublicServer(id); break;
      case 'join-public-server': {
        button.disabled = true;
        const result = await request(`/api/servers/${encodeURIComponent(id)}/join-public`, { method: 'POST', body: {} });
        await refreshWorkspace(); state.discovery = state.discovery.filter(server => server.id !== id); closeModal(); await selectServer(result.id); break;
      }
      case 'focus-media': state.mediaFocus = button.dataset.key; renderCall(); break;
      case 'clear-media-focus': state.mediaFocus = 'grid'; renderCall(); break;
      case 'fullscreen-media': await toggleMediaFullscreen(button.closest('[data-media-key]')); break;
      case 'enable-call-audio': await mediaView.enableAudio(); break;

      case 'server-upload': serverUploadKind = button.dataset.kind; $('#server-image-input').click(); break;
      case 'remove-server-image': if (serverDraft) { modalDirty=true;serverGeneralDirty=true; serverDraft[button.dataset.kind] = ''; updateServerImages(); } break;
      case 'invite': await showInvite(); break;
      case 'copy-invite':
        try { await navigator.clipboard.writeText($('#share-invite').value); toast('Invitation copied. Good company is on its way.'); }
        catch { $('#share-invite').select(); toast('Select and copy this invitation link.'); }
        break;
      case 'rotate-invite':
        await request(`/api/servers/${encodeURIComponent(state.activeServer)}/invite`, { method: 'POST', body: { rotate: true } }); await showInvite(); toast('New invitation created. The previous link no longer works.'); break;
      case 'workspace-menu': {
        popover(`${state.servers.length ? state.servers.map(server => `<button class="popover-item" data-action="server" data-id="${e(server.id)}">${icon('folder')}${e(server.name)}</button>`).join('') : '<p class="field-hint" style="padding:8px">Your first community starts here.</p>'}<div class="popover-divider"></div><button class="popover-item" data-action="create-server">${icon('plus')}Create a space</button><button class="popover-item" data-action="join-server">${icon('link')}Join with an invite</button>`, button, 250); break;
      }
      case 'server-menu': {
        const server = UI.currentServer(state);
        popover(`<button class="popover-item" data-action="community-home">${icon('home')}Server overview</button><button class="popover-item" data-action="server-rules">${icon('book')}Rules</button>${UI.hasServerPermission(server,'inviteMembers') ? `<button class="popover-item" data-action="invite">${icon('link')}Invite people</button>` : ''}${UI.hasServerPermission(server,'manageChannels') ? `<button class="popover-item" data-action="add-channel">${icon('plus')}Create channel</button><button class="popover-item" data-action="new-category">${icon('folder')}Create category</button>` : ''}${CommunityUI.MANAGEMENT_KEYS.some(key=>UI.hasServerPermission(server,key)) ? `<button class="popover-item" data-action="server-settings">${icon('settings')}Server settings</button>` : ''}<div class="popover-divider"></div>${server.role==='owner'?`<button class="popover-item danger" data-action="delete-server" data-id="${e(server.id)}">${icon('trash')}Delete server</button>`:`<button class="popover-item danger" data-action="leave-server">${icon('logout')}Leave server</button>`}`,button,250); break;
      }
      case 'profile': showProfile(id); break;
      case 'dismiss-toast': notices.dismiss(button.closest('.toast'));break;
      case 'position-attachment': {const file=state.pending[Number(button.dataset.index)];if(file){const crop=await artworkEditor.open({url:file.localUrl||file.url,crop:file.previewCrop,kind:'attachment',title:'Position image preview'});if(crop&&state.pending.includes(file)){file.previewCrop=crop;renderPending();}}break;}
      case 'toggle-attachment-spoiler': {const file=state.pending[Number(button.dataset.index)];if(file){file.spoiler=!file.spoiler;renderPending();}break;}
      case 'reveal-image': {const message=messageForUI(id),index=Number(button.dataset.index);if(message?.attachments?.[index]?.spoiler){state.revealedSpoilers.add(`${id}:${index}`);renderMessages();}break;}
      case 'conversation-menu': {const peer=UI.activeConversation(state)?.peerId;popover(`<button class="popover-item" data-action="start-call">${icon('phone',20)}Start voice call</button><button class="popover-item" data-action="start-video">${icon('video',20)}Start video call</button><button class="popover-item danger" data-action="delete-dm" data-id="${e(state.activeConv)}">${icon('trash',20)}Delete conversation</button><button class="popover-item danger" data-action="block-user" data-id="${e(peer)}">${icon('ban',20)}Block user</button>`,button,260);break;}
      case 'view-image': imageViewer.open(id,Number(button.dataset.index)); break;
      case 'view-channel-cover': imageViewer.cover(UI.activeConversation(state)); break;
      case 'viewer-next': imageViewer.navigate(1); break;
      case 'viewer-previous': imageViewer.navigate(-1); break;
      case 'viewer-zoom': imageViewer.zoomBy(Number(button.dataset.delta)); break;
      case 'viewer-fit': imageViewer.zoom=1;imageViewer.fit();break;
      case 'viewer-download': await imageViewer.download(); break;
      case 'download-file': {const file=messageForUI(id)?.attachments?.[Number(button.dataset.index)];if(file)await imageViewer.download(file);break;}
      case 'collection-upload': showCollectionUpload();break;
      case 'forum-layout': preferences.forumLayout=button.dataset.layout==='list'?'list':'grid';savePreferences();break;
      case 'forum-post': showForumPost();break;
      case 'collection-layout': preferences.mediaLayout=button.dataset.layout==='list'?'list':'grid';savePreferences();renderMain();break;
      case 'channel-cover-upload': $('#channel-cover-input').click();break;
      case 'remove-channel-cover': {const input=$('#channel-cover-value');if(input){input.value='';$('#channel-cover-preview').innerHTML=`<span>${icon('image',28)}Optional forum cover</span>`;for(const control of document.querySelectorAll('[data-action=channel-cover-crop], [data-action=remove-channel-cover]'))control.disabled=true;modalDirty=true;}break;}
      case 'open-dm': await openDM(id); break;
      case 'new-dm': showSearch('new-dm'); break;
      case 'quick-search': showSearch('quick'); break;
      case 'search-messages': showSearch('messages'); break;
      case 'pinned': await showPins(); break;
      case 'search-result-message': {
        const message = searchResults.find(m => m.id === id); closeModal(); if(message && isForum(UI.activeConversation(state))) await openThread(message.threadId || message.id);
        await jumpMessage(id); break;
      }
      case 'jump-message': await jumpMessage(id); break;
      case 'load-earlier': button.disabled = true; await loadEarlier(); break;
      case 'gif': await showGifPicker(button); break;
      case 'attach':
        if (state.pending.length >= state.config.maxAttachments) { toast(`Up to ${state.config.maxAttachments} files per message.`, true); break; }
        $('#attachment-input').accept=''; $('#attachment-input').click(); break;
      case 'remove-attachment': { const [file] = state.pending.splice(Number(button.dataset.index), 1); if(file?.uploading)file.controller?.abort();if (file?.localUrl) URL.revokeObjectURL(file.localUrl); if(file?.id&&!file.gifId&&!file.provider)request(`/api/files/${file.id}`,{method:'DELETE'}).catch(()=>{}); } renderPending(); break;
      case 'reply': replyToMessage(id);break;
      case 'cancel-reply': state.replyTo = null; renderPending(); break;
      case 'emoji': case 'react-menu':
        popover(emojiPicker(action === 'emoji' ? 'insert-emoji' : 'reaction',id || ''),button,364);
        $('#emoji-tab-Faces')?.focus({preventScroll:true}); break;
      case 'emoji-category': changeEmojiCategory(button.dataset.category); break;
      case 'close-picker': closePopover(); break;
      case 'gif-more': await loadGifResults(true); break;
      case 'gif-retry': await loadGifResults(); break;
      case 'set-palette': preferences.palette=button.dataset.palette; savePreferences(); refreshSettingsControls(); break;
      case 'block-user': showBlockConfirmation(id); break;
      case 'confirm-block-user': await request(`/api/blocks/${encodeURIComponent(id)}`,{method:'PUT',body:{}}); closeModal(false,true); await refreshBlockedView(); toast('User blocked. Their messages and media are hidden.'); break;
      case 'unblock-user': await request(`/api/blocks/${encodeURIComponent(id)}`,{method:'DELETE'}); await refreshBlockedView(); if(modalType==='settings'&&settingsTab==='blocked')await showBlockedUsers(); toast('User unblocked.'); break;
      case 'insert-emoji': {
        const input = $('#message-input'); if (input) { input.setRangeText(button.dataset.emoji, input.selectionStart, input.selectionEnd, 'end'); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); } closePopover(); break;
      }
      case 'reaction': closePopover(); await react(id, button.dataset.emoji); break;
      case 'message-menu': showMessageOptions(id,button);break;
      case 'pin-message': {
        const message = messageForUI(id); await request(`/api/messages/${encodeURIComponent(id)}/pin`, { method: 'POST', body: {} });
        toast(message?.pinned ? 'Message unpinned.' : 'Message pinned.'); break;
      }
      case 'edit-message': {
        const message = messageForUI(id);
        showModal(`<h2 id="modal-title">Edit message</h2><p class="modal-description">Update your message below.</p><form data-form="edit-message" data-id="${e(id)}"><label for="edit-text">YOUR MESSAGE</label><textarea name="text" id="edit-text" maxlength="${state.config.maxMessageLength}" rows="5">${e(message.text)}</textarea><div id="form-error"></div><div class="modal-footer"><button type="button" class="button-secondary" data-action="close-modal">Cancel</button><button class="button-primary">Save changes</button></div></form>`); break;
      }
      case 'delete-message':
        showModal(`<div class="modal-emblem">${icon('trash', 24)}</div><h2 id="modal-title">Delete message?</h2><p class="modal-description">This message and its attachments will be permanently removed from the conversation.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-delete" data-id="${e(id)}">Delete message</button></div>`); break;
      case 'confirm-delete':
        button.disabled = true; await request(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }); state.messages = state.messages.filter(m => m.id !== id); renderMessages(); closeModal(); toast('Message removed.'); break;
      case 'settings': case 'edit-profile': showSettings(); break;
      case 'settings-tab': if(button.dataset.tab==='blocked')await showBlockedUsers(); else showSettings(button.dataset.tab, true); break;
      case 'choose-icon': {
        const input=document.getElementById(button.dataset.input);if(input){input.value=button.dataset.icon;for(const choice of button.parentElement.querySelectorAll('[data-action=choose-icon]')){const selected=choice===button;choice.classList.toggle('selected',selected);choice.setAttribute('aria-pressed',String(selected));}input.dispatchEvent(new Event('input',{bubbles:true}));}break;
      }
      case 'profile-crop': await adjustArtwork(profileDraft,button.dataset.kind,'profile');break;
      case 'server-crop': await adjustArtwork(serverDraft,button.dataset.kind,'server');break;
      case 'channel-cover-crop': await adjustCover();break;
      case 'role-icon-crop': await adjustRoleIcon();break;
      case 'move-role': await moveRole(id,Number(button.dataset.direction));break;
      case 'copy-account-id': await navigator.clipboard.writeText(state.user.id);toast('Account ID copied.');break;
      case 'copy-message': {const message=messageForUI(id);if(message){await navigator.clipboard.writeText(message.text);toast('Message text copied.');}break;}
      case 'artwork-menu': {
        if(imageUploads){toast('Wait for the image upload to finish.');break;}
        const purpose=button.dataset.purpose,kind=button.dataset.kind,draft=purpose==='profile'?profileDraft:serverDraft;
        if(!draft||!['profile','server'].includes(purpose))break;
        const label=purpose==='profile'?(kind==='avatar'?'profile picture':'profile banner'):(kind==='icon'?'server icon':'server banner');
        popover(`<button class="popover-item" data-action="${purpose}-upload" data-kind="${e(kind)}">${icon('image',19)}Upload ${label}</button><button class="popover-item" data-action="${purpose}-crop" data-kind="${e(kind)}" ${draft[kind]?'':'disabled'}>${icon('edit',19)}Adjust position</button><button class="popover-item danger" data-action="remove-${purpose}-image" data-kind="${e(kind)}" ${draft[kind]?'':'disabled'}>${icon('trash',19)}Remove image</button>`,button,CONFIG.artworkMenuWidth);break;
      }
      case 'profile-upload': profileUploadKind = button.dataset.kind; $('#profile-image-input').click(); break;
      case 'remove-profile-image': {
        const kind = button.dataset.kind; modalDirty=true;profileDirty=true; profileDraft[kind] = ''; const input = $(`#profile-${kind}-url`); if (input) input.value = ''; updateProfileCard(); break;
      }
      case 'pref-sounds': preferences.sounds = !preferences.sounds; savePreferences(); refreshSettingsControls(); break;
      case 'pref-gestures': preferences.gestures=!preferences.gestures;savePreferences();refreshSettingsControls();break;
      case 'pref-motion': preferences.motion = !preferences.motion; savePreferences(); refreshSettingsControls(); break;
      case 'test-sound':
        if (state.user.preferredStatus === 'dnd') { toast('Do not disturb is active. Change status to test sounds.'); break; }
        if (!preferences.sounds || !Number(preferences.soundVolume)) { toast('Enable sounds and increase the volume to test.', true); break; }
        if (!await sounds.unlock() || !sounds.play('message', { preview: true })) toast('Audio is unavailable. Check this tab’s audio permissions.', true);
        else toast('Playing test sound.');
        break;
      case 'pref-compact': preferences.compact = !preferences.compact; savePreferences(); refreshSettingsControls(); break;
      case 'pref-members': preferences.members = !preferences.members; savePreferences(); refreshSettingsControls(); break;
      case 'pref-notifications':
        if (!('Notification' in window)) { toast('This browser does not support desktop notifications.', true); break; }
        if (!preferences.notifications && await Notification.requestPermission() !== 'granted') { toast('Enable notifications in your browser to use this setting.', true); break; }
        preferences.notifications = !preferences.notifications; savePreferences(); refreshSettingsControls(); break;
      case 'status-menu':
        popover(['online', 'idle', 'dnd', 'invisible'].map(status => `<button class="popover-item" data-action="set-status" data-status="${status}">${UI.presenceSymbol(status)}${UI.statusLabel(status)}</button>`).join(''), button); break;
      case 'set-status': {
        const status = button.dataset.status;
        const { user } = await request('/api/profile', { method: 'PATCH', body: { status } });
        state.user = { ...state.user, ...user, preferredStatus: status }; state.users = state.users.map(u => u.id === user.id ? state.user : u); closePopover(); if (status === 'dnd') sounds.stopAll(); sendActivity(true); renderChrome(); break;
      }
      case 'join-voice': await joinVoice(false, Boolean(UI.activeConversation(state)?.peerId)); break;
      case 'start-call': case 'start-video': state.view = 'voice'; renderAll(); await joinVoice(action === 'start-video', true); break;
      case 'mute': case 'deafen': case 'toggle-video': case 'toggle-screen': {
        const current = getCall();
        if (!current.active) { toast('Join a voice room or start a call to use these controls.'); break; }
        if (action === 'mute') call.toggleMute(); else if (action === 'deafen') call.toggleDeafen(); else if (action === 'toggle-video') await call.toggleVideo(); else await call.toggleScreen();
        bindMedia(); renderChrome();
        break;
      }
      case 'leave-voice':
        call.leave(); renderCall(); toast('You left the conversation.'); break;
      case 'return-to-call': { const conv = getCall().active?.conversationId; if (conv) { await selectConversation(conv); state.view = 'voice'; renderAll(); } break; }
      case 'decline-call': if(incomingCall)socket?.emit('call:decline',{conversationId:incomingCall.conversationId});closeModal(true);break;
      case 'accept-call': {
        const incoming = incomingCall; closeModal(true); if (!incoming) break;
        await refreshWorkspace(); await selectConversation(incoming.conversationId); state.view = 'voice'; renderAll(); await joinVoice(incoming.video, false); break;
      }
      case 'save-modal-drafts': dismissConfirmation();await saveModalDrafts(); break;
      case 'keep-editing': case 'dismiss-confirmation': dismissConfirmation();break;
      case 'discard-changes': dismissConfirmation();closeModal(false,true); break;
      case 'scroll-bottom': if(state.historyWindow){await loadMessages(state.activeConv,true);}scrollBottom(true);markRead(state.activeConv);break;
      case 'toggle-category': preferences.collapsedCategories[id] = !preferences.collapsedCategories[id]; state.collapsedCategories = preferences.collapsedCategories; savePreferences(); renderChrome(); break;
      case 'new-category': if(modalType==='server-settings')serverChildReturnTab=serverSettingsTab;showModal(CommunityUI.categoryMarkup(),{type:'category'}); break;
      case 'edit-category': if(modalType==='server-settings')serverChildReturnTab=serverSettingsTab;showModal(CommunityUI.categoryMarkup(UI.currentServer(state)?.categories.find(category=>category.id===id)),{type:'category'}); break;
      case 'delete-category': await request(`/api/categories/${encodeURIComponent(id)}`,{method:'DELETE'}); await refreshWorkspace(); modalDirty=false; closeModal(); renderAll(); break;
      case 'move-category': case 'move-channel': await moveLayout(action==='move-category'?'category':'channel',id,Number(button.dataset.direction)); break;
      case 'open-thread': await openThread(id); break;
      case 'close-thread': clearPending();state.activeThread=null; await loadMessages(state.activeConv); renderMain({bottom:true}); break;
      case 'jump-pin': {closePopover();const pin=state.pins.find(item=>item.id===id); if (pin && isForum(UI.activeConversation(state))) await openThread(pin.threadId || pin.id); await jumpMessage(id); break; }
      case 'pick-gif': { if(state.pending.length>=state.config.maxAttachments) throw new Error('Remove an attachment before adding another.'); const gif=gifCatalog.find(gif=>gif.id===id); if(gif) state.pending.push({...gif,name:gif.title,type:'image/gif'}); closePopover(); renderPending(); break; }
      case 'insert-mention': insertMention(button.dataset.username); break;
      case 'delete-dm': showModal(`<h2 id="modal-title">Delete this conversation for both people?</h2><p class="modal-description">Every message and attachment in this DM will be permanently removed for you and the other person. This cannot be undone.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-delete-dm" data-id="${e(id)}">Delete for both people</button></div>`); break;
      case 'confirm-delete-dm': await request(`/api/dms/${encodeURIComponent(id)}`,{method:'DELETE'}); if(state.lastDM===id)state.lastDM=null; await refreshWorkspace(); closeModal(); state.homeTab='inbox'; state.activeServer=null; state.activeConv=null;state.view='home';renderAll(); break;
      case 'delete-server': showDeleteServer(id || state.activeServer);break;
      case 'delete-account': showDeleteAccount();break;
      case 'leave-server': showModal(`<h2 id="modal-title">Leave this server?</h2><p class="modal-description">You can rejoin with an invite unless you are banned. Owners must transfer ownership first.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-leave-server">Leave server</button></div>`);break;
      case 'confirm-leave-server': await request(`/api/servers/${state.activeServer}/leave`,{method:'POST',body:{}});await refreshWorkspace();closeModal();state.homeTab='spaces';selectHome();break;
      case 'moderate-member': showModal(CommunityUI.moderationMarkup(state,id),{type:'moderate'});syncModerationFields();break;
      case 'revoke-moderation': await request(`/api/servers/${state.activeServer}/moderation`,{method:'POST',body:{userId:id,kind:button.dataset.kind}});await loadAdministration('moderation',state.activeServer);break;
      case 'transfer-owner': showModal(`<h2 id="modal-title">Transfer ownership?</h2><p class="modal-description">This member will control the server, including your permissions.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-transfer-owner" data-id="${e(id)}">Transfer ownership</button></div>`);break;
      case 'confirm-transfer-owner':await request(`/api/servers/${state.activeServer}/transfer`,{method:'POST',body:{userId:id}});await refreshWorkspace();closeModal();renderAll();break;
      case 'cancel-image-upload':imageUploadController?.abort();break;
      case 'role-icon-upload': $('#role-icon-input').click();break;
      case 'close-modal': closeModal(); break;
      case 'auth-switch': showAuth(button.dataset.mode); break;
      case 'logout':
        await request('/api/auth/logout', { method: 'POST', body: {} }); sounds.stopAll(); socket?.disconnect(); call.leave(false); state.user = null; showAuth(); break;

    }
  } catch (error) { button.disabled = false;if(error.moderation)showModerationRestriction(error.moderation);else toast(error.message || 'Please try again.', true); }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'composer') { event.preventDefault(); await sendMessage(); return; }
  const form = event.target.closest('[data-form]'); if (!form) return;
  event.preventDefault(); const kind = form.dataset.form, body = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('button[type=submit], button.button-primary:not([type=button])'); if (submit) submit.disabled = true;
  try {
    if (imageUploads) throw new Error('Wait for the image upload to finish before saving.');
    if (kind === 'login' || kind === 'register') {
      await request(`/api/auth/${kind}`, { method: 'POST', body }); await loadWorkspace();
    } else if (kind === 'create-server') {
      const result = await request('/api/servers', { method: 'POST', body }); await refreshWorkspace(); closeModal(); await selectServer(result.id); toast('Server created.');
    } else if (kind === 'delete-server') {
      await request(`/api/servers/${encodeURIComponent(form.dataset.id)}`,{method:'DELETE',body:{confirmName:body.confirmName}});dismissConfirmation();modalDirty=false;closeModal(true,true);await refreshWorkspace();state.homeTab='spaces';state.activeServer=null;selectHome();toast('Server permanently deleted.');
    } else if (kind === 'delete-account') {
      await request('/api/account',{method:'DELETE',body:{password:body.password,confirmUsername:body.confirmUsername,deleteOwnedServers:form.elements.deleteOwnedServers?.checked===true}});finishAccountDeletion();
    } else if (kind === 'server-settings') {
      if (!serverDraft || serverDraft.id !== form.dataset.id) throw new Error('Open Server settings again.');
      await request(`/api/servers/${encodeURIComponent(form.dataset.id)}`, { method: 'PATCH', body: { name: body.name, description: body.description, icon:serverDraft.icon,iconCrop:serverDraft.iconCrop,banner:serverDraft.banner,bannerCrop:serverDraft.bannerCrop,accent: serverDraft.accent, welcomeMessage: body.welcomeMessage, defaultNotifications: body.defaultNotifications, rules: body.rules, publicListing: form.elements.publicListing.checked } });
      await refreshWorkspace(); modalDirty=false;serverGeneralDirty=false; discoveryUpdatedAt=0; closeModal(); renderAll(); toast('Server updated.');
    } else if (kind === 'server-role') {
      const roleId = form.dataset.id;
      await saveRole(roleBody(form),roleId);
      await refreshWorkspace(); modalDirty=false;roleDirty=false; roleDraft = null; showServerSettings('roles', true); toast('Role saved.');
    } else if(kind==='server-permissions'){
      const defaults=Object.fromEntries([...form.querySelectorAll('[data-default-permission]')].map(select=>[select.dataset.defaultPermission,select.value==='allow']));
      await request(`/api/servers/${state.activeServer}/permissions`,{method:'PATCH',body:{defaultPermissions:defaults}});serverDraft.defaultPermissions=defaults;serverPoliciesDirty=false;modalDirty=false;await refreshWorkspace();showServerSettings('permissions',true);toast('Permissions saved.');
    } else if (kind === 'member-roles') {
      await request(`/api/servers/${encodeURIComponent(state.activeServer)}/members/${encodeURIComponent(body.userId)}/roles`, { method: 'PUT', body: { roleIds: new FormData(form).getAll('roleIds') } });
      serverMemberId = body.userId;delete memberRoleDrafts[body.userId]; await refreshWorkspace(); modalDirty=false; showServerSettings('members', true); toast('Member roles saved.');
    } else if (kind === 'channel-settings') {
      await request(`/api/channels/${encodeURIComponent(form.dataset.id)}`, { method: 'PATCH', body: { name: body.name, topic: body.topic, type: body.type, cover:body.cover||'',coverCrop:readCrop(body.coverCrop),icon: body.icon, category: body.category, slowmodeSeconds: Number(body.slowmodeSeconds || 0), userLimit: Number(body.userLimit || 0), ...(form.elements.allowAttachments ? {allowAttachments:form.elements.allowAttachments.checked} : {}), private: form.elements.private.checked, allowedRoleIds: new FormData(form).getAll('allowedRoleIds'), ...(form.elements.readOnly ? { readOnly: form.elements.readOnly.checked } : {}), ...(form.elements.allowMedia ? { allowMedia: form.elements.allowMedia.checked } : {}) } });
      await refreshWorkspace();modalDirty=false; closeModal(); renderAll(); toast('Channel updated.');
    } else if (kind === 'category') {
      await request(form.dataset.id ? `/api/categories/${form.dataset.id}` : `/api/servers/${state.activeServer}/categories`, {method:form.dataset.id?'PATCH':'POST',body}); await refreshWorkspace();modalDirty=false;closeModal();renderAll();
    } else if (kind === 'moderate') {
      await request(`/api/servers/${state.activeServer}/moderation`,{method:'POST',body:{...body,userId:form.dataset.id,hours:Number(body.hours)}});await refreshWorkspace();closeModal();toast('Moderation applied.');
    } else if (kind === 'join-server') {
      let invite = body.invite.trim(); try { const url = new URL(invite); invite = url.searchParams.get('invite') || url.pathname.split('/').filter(Boolean).pop(); } catch { /* Plain invite codes are also valid. */ }
      const result = await request('/api/servers/join', { method: 'POST', body: { invite } }); await refreshWorkspace(); closeModal(); await selectServer(result.id); toast('Joined server.');
    } else if (kind === 'create-channel') {
      const result = await request(`/api/servers/${encodeURIComponent(state.activeServer)}/channels`, { method: 'POST',body:{...body,coverCrop:readCrop(body.coverCrop)} }); await refreshWorkspace(); modalDirty=false;closeModal(); await selectConversation(result.id,{autoJoin:false});
    } else if (kind === 'profile') {
      const result = await request('/api/profile', { method: 'PATCH', body: {
        displayName: body.displayName, bio: body.bio, pronouns: body.pronouns,
        avatar:profileDraft.avatar,avatarCrop:profileDraft.avatarCrop,banner:profileDraft.banner,bannerCrop:profileDraft.bannerCrop,accent: profileDraft.accent,
      } });
      state.user = { ...state.user, ...result.user }; state.users = state.users.map(u => u.id === state.user.id ? state.user : u);
      modalDirty=false;profileDirty=false;closeModal(); renderAll(); toast('Profile saved.');
    } else if (kind === 'edit-message') {
      const { message } = await request(`/api/messages/${encodeURIComponent(form.dataset.id)}`, { method: 'PATCH', body }); upsertMessage(message); closeModal(); toast('The right words, saved.');
    }
  } catch (error) { if(error.moderation)showModerationRestriction(error.moderation);else formError(error.message); }
  finally { if (submit?.isConnected) submit.disabled = false; }
});

document.addEventListener('input', event => {
  const input = event.target;
  if(input.closest('#dialog-guard-root'))return;
  if(input.id==='moderation-action')syncModerationFields();
  if (input.id === 'message-input') {
    resizeInput(); updateComposerLimit(); showMentions(input);
    try { localStorage.setItem(draftKey(), input.value); } catch { /* Draft storage is best effort. */ }
    if (socket?.connected && Date.now() - lastTyping > CONFIG.typingThrottleMs) {
      socket.emit('typing', { conversationId: state.activeConv }); lastTyping = Date.now();
    }
  }
  if (input.id === 'sound-volume') {
    preferences.soundVolume = Math.min(100, Math.max(0, Number(input.value) || 0));
    $('#sound-volume-value').textContent = `${preferences.soundVolume}%`; savePreferences();
  }
  if (modalType === 'server-settings' && serverDraft && input.closest('[data-form=server-settings]') && ['name', 'description', 'rules', 'publicListing', 'welcomeMessage', 'defaultNotifications'].includes(input.name)) {
    serverDraft[input.name] = input.type === 'checkbox' ? input.checked : input.value; if (input.name === 'name') updateServerImages();
  }
  if (input.closest('[data-form=server-role]')) {
    const form = input.closest('form'); roleDraft={id:form.dataset.id,...roleBody(form)};
  }
  if (input.closest('#modal-root form') && !input.closest('.auth-form') && input.id!=='role-member') modalDirty=true;
  if (input.closest('[data-form=profile]')) profileDirty=true;
  if (input.closest('[data-form=server-settings]')) serverGeneralDirty=true;
  if (input.closest('[data-form=server-role]')) roleDirty=true;
  if(input.closest('[data-form=server-permissions]')&&input.dataset.defaultPermission){serverPoliciesDirty=true;serverDraft.defaultPermissions={...serverDraft.defaultPermissions,[input.dataset.defaultPermission]:input.value==='allow'};}
  if(input.id==='channel-type'||input.id==='edit-channel-type')syncChannelType();
  if (input.closest('[data-form=member-roles]') && input.name==='roleIds') { const form=input.closest('form');memberRoleDrafts[form.elements.userId.value]=new FormData(form).getAll('roleIds'); }
  if (input.id === 'auth-user') { const visible = input.value.toLowerCase() === state.config.creatorUsername && state.config.creatorClaimAvailable; const claim=$('#creator-claim'); if(claim) { claim.hidden=!visible; $('.creator-claim-label').hidden=!visible; } }
  if (input.id === 'workspace-search') {
    clearTimeout(searchTimer); const kind = modalType.split(':')[1];
    searchTimer = setTimeout(() => runSearch(input.value.trim(), kind).catch(error => toast(error.message, true)), CONFIG.searchDebounceMs);
  }
  if (modalType === 'settings' && profileDraft && input.closest('[data-form=profile]') && input.name) {
    profileDraft[input.name] = input.value; updateProfileCard();
  }
});
document.addEventListener('change', event => { if (event.target.id === 'role-member') { serverMemberId = event.target.value; showServerSettings('members', true); } });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.querySelectorAll('.media-expanded').forEach(tile => tile.classList.remove('media-expanded')); });
document.addEventListener('keydown', event => {
  if(modalType==='image-viewer'&&['ArrowLeft','ArrowRight','+','-'].includes(event.key)){event.preventDefault();if(event.key==='ArrowLeft'||event.key==='ArrowRight')imageViewer.navigate(event.key==='ArrowRight'?1:-1);else imageViewer.zoomBy(event.key==='+'?1:-1);return;}
  const category=event.target.closest('[data-action=emoji-category]');
  if(category && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();const at=EMOJI_CATEGORIES.indexOf(category.dataset.category);
    const next=event.key==='Home'?0:event.key==='End'?EMOJI_CATEGORIES.length-1:(at+(event.key==='ArrowRight'?1:-1)+EMOJI_CATEGORIES.length)%EMOJI_CATEGORIES.length;
    changeEmojiCategory(EMOJI_CATEGORIES[next]);$(`#emoji-tab-${EMOJI_CATEGORIES[next]}`)?.focus();return;
  }
  const emoji=event.target.closest('#emoji-category-grid button');
  if(emoji && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
    event.preventDefault();const grid=emoji.parentElement,buttons=[...grid.children],at=buttons.indexOf(emoji),columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,at+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns})[event.key]));buttons[next]?.focus();return;
  }
  if (event.key === 'Escape' && document.querySelector('.media-expanded')) { document.querySelectorAll('.media-expanded').forEach(tile => tile.classList.remove('media-expanded')); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); return; }
  if (event.target.id === 'message-input' && $('#popover-root .mention-options') && ['ArrowDown','ArrowUp','Enter','Tab'].includes(event.key)) { event.preventDefault(); const buttons=[...$('#popover-root').querySelectorAll('[data-action=insert-mention]')];let index=buttons.findIndex(button=>button.classList.contains('selected'));if(event.key==='Enter'||event.key==='Tab'){buttons[Math.max(0,index)]?.click();return;} buttons.forEach(button=>button.classList.remove('selected'));index=(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.classList.add('selected');return; }
  if (event.target.id === 'message-input' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendMessage(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.user) { event.preventDefault(); showSearch(); }
  if (event.key === 'Escape') {
    if ($('#popover-root').children.length) closePopover(); else if ($('#modal-root').children.length) closeModal(); else $('#app').classList.remove('sidebar-open', 'show-members');
  }
  if (event.key === 'Tab' && $('#modal-root').children.length) {
    const nodes = [...($('#dialog-guard-root')||$('#modal-root')).querySelectorAll('button:not([disabled]), input:not([hidden]), textarea, select, a[href], summary')].filter(n => n.getClientRects().length);
    const first = nodes[0], last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
$('#attachment-input').addEventListener('change',event=>{ const files=[...event.target.files];event.target.value='';queueAttachments(files).catch(error=>toast(error.message,true)); });
document.addEventListener('paste',event=>{if(event.target.id!=='message-input'&&(!isCollection(UI.activeConversation(state))||modalType))return;const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();queueAttachments(files).catch(error=>toast(error.message,true));}});
$('#server-image-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file || modalType !== 'server-settings' || !serverDraft || imageUploads) return;
  const draft = serverDraft, kind = serverUploadKind;
  const buttons = [...document.querySelectorAll('[data-action=server-upload], [data-form=server-settings] button[type=submit]')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    imageUploads++;imageUploadController=new AbortController();setImageProgress('Server image',{percent:0});
    const [uploaded] = await uploadFiles([file], 'server', draft.id,progress=>setImageProgress('Server image',progress),imageUploadController.signal);
    if (modalType !== 'server-settings' || serverDraft !== draft) return;
    const crop=await artworkEditor.open({url:uploaded.url,kind,title:`Position server ${kind}`});if(!crop)return;draft[kind]=uploaded.url;draft[`${kind}Crop`]=crop;modalDirty=true;serverGeneralDirty=true; updateServerImages(); toast('Image uploaded. Save changes to apply it.');
  } catch (error) { if(error.moderation)showModerationRestriction(error.moderation);else formError(error.message); }
  finally { imageUploads=Math.max(0,imageUploads-1);$('#image-upload-progress')?.remove();buttons.forEach(button => { if (button.isConnected) button.disabled = false; }); }
});
$('#profile-image-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  const kind = profileUploadKind, draft=profileDraft;
  if(modalType!=='settings'||!draft||imageUploads)return;
  try {
    imageUploads++;imageUploadController=new AbortController();setImageProgress(kind==='avatar'?'Avatar':'Banner',{percent:0});
    const [uploaded] = await uploadFiles([file], 'profile',null,progress=>setImageProgress(kind==='avatar'?'Avatar':'Banner',progress),imageUploadController.signal);
    if (modalType !== 'settings' || profileDraft!==draft) return;
    const crop=await artworkEditor.open({url:uploaded.url,kind,title:`Position ${kind}`});if(!crop)return;profileDraft[kind]=uploaded.url;profileDraft[`${kind}Crop`]=crop;modalDirty=true;profileDirty=true;
    const input = $(`#profile-${kind}-url`); if (input) input.value = /^https:\/\//.test(uploaded.url) ? uploaded.url : '';
    updateProfileCard(); toast(`${kind === 'avatar' ? 'Avatar' : 'Banner'} ready. Save your profile to apply it.`);
  } catch (error) { toast(error.message, true); }
  finally { imageUploads=Math.max(0,imageUploads-1);$('#image-upload-progress')?.remove(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user && state.view === 'chat' && followChat) markRead(state.activeConv); });
window.addEventListener('beforeunload', () => { sounds.stopAll(); call.leave(); });
window.addEventListener('resize', positionPopover);
window.visualViewport?.addEventListener('resize',positionPopover);
window.addEventListener('online', () => {preferenceSync.flush(); if (state.user && !socket?.connected) socket?.connect(); if (call.active) call.retryConnections().catch(error => toast(error.message, true)); });
installInteractionHelpers();
applyPreferences();
(async function init() {
  try {
    const health = await fetch('/api/health', { credentials: 'same-origin' });
    if (!health.ok || !(await health.json()).ok) throw new Error('The Nexus server is unavailable. Start it with npm start and reconnect.');
    state.config = { ...CONFIG, ...await request('/api/config') };
    await loadWorkspace();
  } catch (error) {
    showAuth('login', error.message === 'Sign in to continue.' ? '' : error.message);
  }
})();

function updatePinState({conversationId,pins}) {
  const conversation=state.servers.flatMap(server=>server.channels).concat(state.dms).find(item=>item.id===conversationId);
  if(conversation)conversation.pins=pins;if(conversationId===state.activeConv)refreshPinButton();
}
function refreshPinButton() {
  const node=$('#main .pin-button');if(!node)return;
  const wrapper=document.createElement('div');wrapper.innerHTML=UI.pinButton(state);const desired=wrapper.firstElementChild;
  node.className=desired.className;node.setAttribute('aria-label',desired.getAttribute('aria-label'));syncMarkup(node,desired.innerHTML);
}
async function loadPins(conversationId = state.activeConv) {
  if(!conversationId)return;const result=await request(`/api/conversations/${encodeURIComponent(conversationId)}/messages?pinned=true`);
  if(conversationId!==state.activeConv)return;state.pins=result.messages;refreshPinButton();
}
function pinPanelMarkup() {
  return `<section class="pins-panel" aria-label="Pinned messages"><header><strong>${icon('pin',20)}Pinned messages</strong><button class="icon-button" data-action="close-picker" aria-label="Close pinned messages">${icon('close',20)}</button></header><div class="pins-list">${state.pins.length?state.pins.slice().reverse().map(message=>`<button class="pin-item" data-action="jump-pin" data-id="${e(message.id)}">${UI.avatar(userFor(message.authorId))}<span><strong>${e(userFor(message.authorId).displayName)}</strong><small>${e(message.text.slice(0,150)||(message.attachments?.some(file=>file.spoiler)?'Spoiler image':message.attachments?.[0]?.name||'Attachment'))}</small><time>${e(UI.formatDate(message.createdAt))}</time></span>${icon('arrow',18)}</button>`).join(''):'<div class="picker-empty">No pinned messages yet.</div>'}</div></section>`;
}
async function renderPinPanel() {
  const panel=$('#popover-root .pins-panel');if(!panel)return;
  const wrapper=document.createElement('div');wrapper.innerHTML=pinPanelMarkup();syncMarkup(panel,wrapper.firstElementChild.innerHTML);positionPopover();
  const conversationId=state.activeConv,revision=Math.max(0,...state.pins.map(message=>message.pinRevision||0));
  const result=await request(`/api/conversations/${conversationId}/pins/read`,{method:'POST',body:{revision}});updatePinState({conversationId,pins:result.pins});
}
async function showPins() {
  if(!state.activeConv)return;popover(pinPanelMarkup(),$('#main .pin-button'),420);await loadPins();await renderPinPanel();
}
function updateComposerLimit() {
  const input = $('#message-input'); if (!input) return;
  const length = input.value.length, limit = state.config.maxMessageLength;
  const over = length > limit, uploading = state.pending.some(file => file.uploading);
  input.setAttribute('aria-invalid', String(over));
  const count = $('#character-count');
  if (count) { count.textContent = length > limit * .75 ? `${length.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}${over ? ' — message too long' : ''}` : ''; count.classList.toggle('over-limit',over); }
  const send = $('#composer button[type=submit]'); if (send) send.disabled = over || uploading || state.sending || isCollection(UI.activeConversation(state))&&!state.pending.length;
}
async function queueAttachments(files) {
  if(!files.length)return;
  const server=UI.currentServer(state),conversation=UI.activeConversation(state);
  if(server&&(!UI.hasServerPermission(server,'attachFiles')||conversation?.allowAttachments===false))throw new Error('Attachments are disabled for your roles in this channel.');
  if(isCollection(UI.activeConversation(state))&&!$('#message-input'))showCollectionUpload();
  if(!$('#message-input')||$('#message-input').disabled||!UI.canWrite(state))return;
  if (state.pending.length + files.length > state.config.maxAttachments) throw new Error(`Up to ${state.config.maxAttachments} attachments per message.`);
  for (const file of files) if (file.size > state.config.maxUploadBytes) throw new Error(`Files can be up to ${UI.bytes(state.config.maxUploadBytes)} each.`);
  const conversationId = state.activeConv;
  const pending = files.map(file => ({ name:file.name || 'Screenshot.png',type:file.type,size:file.size,localUrl:URL.createObjectURL(file),uploading:true,progress:0,controller:new AbortController() }));
  state.pending.push(...pending); renderPending();
  for (let index=0;index<files.length;index++) {
    const item=pending[index];
    if (conversationId!==state.activeConv || !state.pending.includes(item)) { URL.revokeObjectURL(item.localUrl); continue; }
    try {
      const uploaded=await uploadFile(files[index],{request,config:state.config,signal:item.controller.signal,onProgress:progress=>{Object.assign(item,progress);if(conversationId===state.activeConv && state.pending.includes(item))renderPending();}});
      if (conversationId!==state.activeConv || !state.pending.includes(item)) { request(`/api/files/${uploaded.id}`,{method:'DELETE'}).catch(()=>{}); URL.revokeObjectURL(item.localUrl); continue; }
      Object.assign(item,uploaded,{uploading:false});
    } catch(error) {state.pending=state.pending.filter(file=>file!==item);URL.revokeObjectURL(item.localUrl);if(error.name!=='AbortError')toast(error.message,true);}
    if(conversationId===state.activeConv)renderPending();
  }
  $('#message-input')?.focus();
}
function showGifPicker(anchor) {
  gifCatalog=[];gifPage={query:'',nextOffset:0,hasMore:false};
  popover(`<section class="gif-picker" aria-label="GIF picker"><div class="picker-heading"><strong>GIFs</strong><button class="icon-button" data-action="close-picker" aria-label="Close GIF picker">×</button></div><input id="gif-search" type="search" maxlength="50" placeholder="Search GIPHY" aria-label="Search GIPHY" ${state.config.giphyApiKey?'':'disabled'}><div class="gif-results" aria-live="polite"></div><button class="button-secondary gif-more" data-action="gif-more" hidden>Load more</button><a class="gif-attribution" href="https://giphy.com/" target="_blank" rel="noopener noreferrer">Powered by GIPHY</a></section>`,anchor,380);
  if(state.config.giphyApiKey){$('#gif-search')?.focus();loadGifResults();}
  else $('#popover-root .gif-results').innerHTML='<p class="picker-empty">GIF search is unavailable on this server.</p>';
}
async function loadGifResults(append=false) {
  const input=$('#gif-search'),results=$('#popover-root .gif-results');
  if(!input || !results || !state.config.giphyApiKey)return;
  gifRequest?.abort();gifRequest=new AbortController();const revision=++gifRevision;
  const query=input.value.trim();if(append&&query!==gifPage.query)append=false;
  const offset=append?gifPage.nextOffset:0;
  const more=$('#popover-root .gif-more');more.hidden=true;
  results.setAttribute('aria-busy','true');
  if(!append){gifCatalog=[];results.innerHTML='<p class="picker-empty">Loading GIFs…</p>';}
  try {
    const page=await searchGiphy({key:state.config.giphyApiKey,query,offset,signal:gifRequest.signal});
    if(revision!==gifRevision || !results.isConnected)return;
    const known=new Set(append?gifCatalog.map(gif=>gif.id):[]),fresh=page.gifs.filter(gif=>{if(known.has(gif.id))return false;known.add(gif.id);return true;});
    gifCatalog=append?[...gifCatalog,...fresh]:fresh;
    if(append){if(fresh.length)results.insertAdjacentHTML('beforeend',gifMarkup(fresh));}else results.innerHTML=gifMarkup(fresh);
    gifPage={query,nextOffset:page.nextOffset,hasMore:page.hasMore&&page.nextOffset>offset};more.hidden=!gifPage.hasMore;
  } catch(error) {
    if(error.name==='AbortError' || revision!==gifRevision)return;
    if(!append)results.innerHTML=`<p class="picker-empty">${e(error.message)}<button class="button-secondary" data-action="gif-retry">Try again</button></p>`;
    else {more.hidden=false;toast(error.message,true);}
  } finally {if(revision===gifRevision)results.removeAttribute('aria-busy');}
}
function gifMarkup(gifs) {return gifs.map(gif=>`<button data-action="pick-gif" data-id="${e(gif.id)}" aria-label="Send ${e(gif.title)}"><img src="${e(gif.preview)}" alt="${e(gif.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="160" height="104"><span>${e(gif.title)}</span></button>`).join('') || '<p class="picker-empty">No GIFs found. Try another search.</p>';}
function changeEmojiCategory(category) {
  const picker=$('#popover-root .emoji-picker');if(!picker || !EMOJI_CATEGORIES.includes(category))return;
  for(const tab of picker.querySelectorAll('[role=tab]')){const selected=tab.dataset.category===category;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
  const grid=$('#emoji-category-grid');grid.innerHTML=emojiGrid(category,picker.dataset.emojiAction,picker.dataset.messageId);grid.setAttribute('aria-labelledby',`emoji-tab-${category}`);grid.scrollTop=0;
}
function showBlockConfirmation(id) {
  const user=userFor(id);
  showModal(`<h2 id="modal-title">Block ${e(user.displayName)}?</h2><p class="modal-description">Their DMs, server messages and profile will be hidden from you. Direct calls and voice, camera and screen connections between you will stop. You can unblock them in Settings.</p><div class="modal-footer"><button class="button-secondary" data-action="close-modal">Cancel</button><button class="button-danger" data-action="confirm-block-user" data-id="${e(id)}">Block user</button></div>`);
}
async function refreshBlockedView() {
  if(!state.user)return;
  await refreshWorkspace();
  if(modalType==='profile')closeModal(true,true);
  for(const userId of typingUsers.keys())if(state.blockedIds.includes(userId))typingUsers.delete(userId);
  state.users=state.users.filter(user=>!state.blockedIds.includes(user.id));
  if(state.activeThread && state.blockedIds.includes(state.activeThread.authorId))state.activeThread=null;
  if(state.activeConv && state.view==='chat')await loadMessages(state.activeConv,true);
  if(state.activeConv)await loadPins();
  if(incomingCall && state.blockedIds.includes(incomingCall.user.id)){if(modalType==='incoming')closeModal(true,true);sounds.stopRing();incomingCall=null;}
  renderAll({bottom:followChat});
}
async function showBlockedUsers() {
  showSettings('blocked',true);
  const {users}=await request('/api/blocks');
  if(modalType!=='settings'||settingsTab!=='blocked')return;
  const list=$('#blocked-users');
  if(list)list.innerHTML=users.map(user=>`<div class="blocked-user"><span><strong>${e(user.displayName)}</strong><small>@${e(user.username)}</small></span><button class="button-secondary" data-action="unblock-user" data-id="${e(user.id)}">Unblock</button></div>`).join('') || '<p class="field-hint">You have not blocked anyone.</p>';
}
function showMentions(input) {
  const match=mentionMatch(input);
  if (!match) {if($('#popover-root .mention-options'))closePopover();return;}
  const server=UI.currentServer(state),dm=state.dms.find(dm=>dm.id===state.activeConv);
  const eligible=server?server.members.map(member=>member.userId):[dm?.peerId,state.user.id];
  const users=state.users.filter(user=>eligible.includes(user.id)&&`${user.username} ${user.displayName}`.toLowerCase().includes(match[1].toLowerCase())).slice(0,8);
  const group=server&&UI.hasServerPermission(server,'mentionEveryone')?{name:'everyone',description:'Members who can view this channel'}:dm?{name:'here',description:'Everyone in this DM'}:null;
  const groupMarkup=group&&group.name.includes(match[1].toLowerCase())?`<button class="popover-item" role="option" data-action="insert-mention" data-username="${group.name}">${icon('people',24)}<span><strong>@${group.name}</strong><small>${group.description}</small></span></button>`:'';
  if(!users.length&&!groupMarkup){closePopover();return;}
  popover(`<div class="mention-options" role="listbox" aria-label="Mention someone">${groupMarkup}${users.map((user,index)=>`<button class="popover-item ${!index?'selected':''}" role="option" data-action="insert-mention" data-username="${e(user.username)}">${UI.avatar(user)}<span><strong>${e(user.displayName)}</strong><small>@${e(user.username)}</small></span></button>`).join('')}</div>`,input,340);
}
function insertMention(username) {
  const input=$('#message-input');if(!input)return;const match=mentionMatch(input);if(!match)return;
  const start=input.selectionStart-match[1].length-1;
  input.setRangeText(`@${username} `,start,input.selectionStart,'end');closePopover();input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));
}
async function openThread(id) {
  let root=state.messages.find(message=>message.id===id)||state.pins.find(message=>message.id===id);
  if(!root){root=(await request(`/api/messages/${encodeURIComponent(id)}`)).message;}
  if(root.conversationId!==state.activeConv)throw new Error('This topic belongs to another channel.');
  state.activeThread=root;state.revealedSpoilers.clear();state.historyWindow=false;state.messages=[];state.loadingMessages=true;followChat=true;clearPending();renderMain();await loadMessages(state.activeConv);
}
async function saveLayout(channels,categories) {
  const server=UI.currentServer(state);if(!server)return;
  await request(`/api/servers/${server.id}/layout`,{method:'PUT',body:{channels:channels.map(channel=>({id:channel.id,category:channel.category})),categories:categories.map(category=>({id:category.id}))}});
  await refreshWorkspace();renderChrome();if(modalType==='server-settings')showServerSettings(serverSettingsTab,true);
}
async function moveLayout(kind,id,direction) {
  const server=UI.currentServer(state);if(!server)return;
  const categories=[...server.categories],channels=[...server.channels],items=kind==='category'?categories:channels;
  const index=items.findIndex(item=>item.id===id),next=index+direction;if(index<0||next<0||next>=items.length)return;
  [items[index],items[next]]=[items[next],items[index]];await saveLayout(channels,categories);
}
async function loadAdministration(tab,serverId) {
  const result=await request(`/api/servers/${serverId}/${tab==='audit'?'audit':'moderation'}`);
  if(modalType!=='server-settings'||serverSettingsTab!==tab||state.activeServer!==serverId)return;
  const node=$(tab==='audit'?'#audit-list':'#moderation-list');if(!node)return;
  if(tab==='audit'){node.innerHTML=result.entries.map(auditEntryMarkup).join('')||'<p class="field-hint">No activity yet.</p>';return;}
  node.innerHTML=result.entries.map(entry=>`<div class="admin-list-row"><span>${icon(tab==='audit'?'book':'shield',20)}</span><div><strong>${e(tab==='audit'?entry.action:`${entry.displayName || userFor(entry.userId).displayName} · ${entry.kind}`)}</strong><small>${e(tab==='audit'?`${userFor(entry.actorId).displayName} · ${new Date(entry.createdAt).toLocaleString('en-GB')}`:entry.expiresAt?`Until ${new Date(entry.expiresAt).toLocaleString('en-GB')}`:'Permanent')}${entry.reason?` · ${e(entry.reason)}`:''}</small></div>${tab==='moderation'?`<button class="button-secondary" data-action="revoke-moderation" data-id="${e(entry.userId)}" data-kind="un${entry.kind}">Revoke</button>`:''}</div>`).join('')||'<p class="field-hint">No entries yet.</p>';
}
function sendActivity(force=false) {
  if(!state.user||!socket?.connected)return;
  const away=document.hidden||!document.hasFocus()||Date.now()-activityAt>state.config.idleAfterMs;
  if(!force&&Date.now()-lastActivitySent<30000)return;
  lastActivitySent=Date.now();socket.emit('presence:activity',{away});
}
function installInteractionHelpers() {
  const coverInput=document.createElement('input');coverInput.type='file';coverInput.accept='image/png,image/jpeg,image/gif,image/webp';coverInput.id='channel-cover-input';coverInput.hidden=true;document.body.append(coverInput);
  coverInput.addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||!['create-channel','channel-settings'].includes(modalType)||imageUploads)return;
    try{imageUploads++;imageUploadController=new AbortController();setImageProgress('Channel cover',{percent:0});const [uploaded]=await uploadFiles([file],'channel',state.activeServer,progress=>setImageProgress('Channel cover',progress),imageUploadController.signal);const crop=await artworkEditor.open({url:uploaded.url,kind:'cover',title:'Position forum cover'});if(crop)setCover(uploaded.url,crop);}
    catch(error){if(error.name!=='AbortError')formError(error.message);}
    finally{imageUploads=Math.max(0,imageUploads-1);$('#image-upload-progress')?.remove();}
  });
  const roleInput=document.createElement('input');roleInput.type='file';roleInput.accept='image/png,image/jpeg,image/gif,image/webp';roleInput.id='role-icon-input';roleInput.hidden=true;document.body.append(roleInput);
  roleInput.addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file||modalType!=='server-settings'||imageUploads)return;
    try{imageUploads++;imageUploadController=new AbortController();setImageProgress('Role icon',{percent:0});const [uploaded]=await uploadFiles([file],'role',state.activeServer,progress=>setImageProgress('Role icon',progress),imageUploadController.signal);const crop=await artworkEditor.open({url:uploaded.url,kind:'icon',title:'Position role icon'});if(crop)setRoleIcon(uploaded.url,crop);}
    catch(error){if(error.name!=='AbortError')formError(error.message);}
    finally{imageUploads=Math.max(0,imageUploads-1);$('#image-upload-progress')?.remove();}
  });
  document.addEventListener('input',event=>{if(event.target.id==='gif-search'){clearTimeout(gifSearchTimer);gifRequest?.abort();++gifRevision;gifSearchTimer=setTimeout(()=>loadGifResults(),350);}});
  for(const eventName of ['pointerdown','keydown','touchstart'])document.addEventListener(eventName,()=>{activityAt=Date.now();sendActivity();},{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>sendActivity(true));window.addEventListener('focus',()=>{activityAt=Date.now();sendActivity(true);});window.addEventListener('blur',()=>sendActivity(true));setInterval(()=>sendActivity(true),30000);
  document.addEventListener('change',event=>{if(event.target.closest('#modal-root form')&&!event.target.closest('#dialog-guard-root')){modalDirty=true;event.target.dispatchEvent(new Event('input',{bubbles:true}));}});
  document.addEventListener('dragstart',event=>{const channel=event.target.closest('[data-drag-channel]'),category=event.target.closest('[data-drag-category]');if(channel)draggedItem={kind:'channel',id:channel.dataset.dragChannel};else if(category)draggedItem={kind:'category',id:category.dataset.dragCategory};else return;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedItem.id);});
  document.addEventListener('dragover',event=>{if(draggedItem&&event.target.closest('[data-drop-channel],[data-drop-category]')){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  document.addEventListener('drop',async event=>{if(!draggedItem)return;const targetChannel=event.target.closest('[data-drop-channel]'),targetCategory=event.target.closest('[data-drop-category]'),server=UI.currentServer(state);if(!server||!targetChannel&&!targetCategory)return;event.preventDefault();const dragged=draggedItem;draggedItem=null;const channels=server.channels.map(channel=>({...channel})),categories=[...server.categories];try{if(dragged.kind==='channel'){const index=channels.findIndex(channel=>channel.id===dragged.id);if(index<0)return;const [channel]=channels.splice(index,1);channel.category=targetCategory?.dataset.dropCategory??channels.find(channel=>channel.id===targetChannel?.dataset.dropChannel)?.category??'';const target=channels.findIndex(channel=>channel.id===targetChannel?.dataset.dropChannel);channels.splice(target<0?channels.length:target,0,channel);}else if(targetCategory){const index=categories.findIndex(category=>category.id===dragged.id),target=categories.findIndex(category=>category.name===targetCategory.dataset.dropCategory);if(index<0||target<0)return;const [category]=categories.splice(index,1);categories.splice(target,0,category);}await saveLayout(channels,categories);}catch(error){toast(error.message,true);}});
  document.addEventListener('dragend',()=>{draggedItem=null;});
  window.addEventListener('error',event=>{console.error('[Nexus UI]',event.error||event.message);if(state.user)toast('An unexpected error occurred. Details are in the console.',true);});
  window.addEventListener('unhandledrejection',event=>{console.error('[Nexus async]',event.reason);if(state.user)toast(event.reason?.message||'An action could not be completed. See the console for details.',true);});
}

function bindChatScroll() {chatScroll.bind(isBoard()?null:$('#message-scroll'));updateScrollButton();}

async function saveModalDrafts() {
  if(modalType==='settings') {
    const {user}=await request('/api/profile',{method:'PATCH',body:{displayName:profileDraft.displayName,bio:profileDraft.bio,pronouns:profileDraft.pronouns,avatar:profileDraft.avatar,avatarCrop:profileDraft.avatarCrop,banner:profileDraft.banner,bannerCrop:profileDraft.bannerCrop}});
    state.user={...state.user,...user};state.users=state.users.map(item=>item.id===user.id?state.user:item);profileDirty=false;
  } else if(modalType==='server-settings') {
    if(serverGeneralDirty) {await request(`/api/servers/${serverDraft.id}`,{method:'PATCH',body:{name:serverDraft.name,description:serverDraft.description,rules:serverDraft.rules,welcomeMessage:serverDraft.welcomeMessage,defaultNotifications:serverDraft.defaultNotifications,icon:serverDraft.icon,iconCrop:serverDraft.iconCrop,banner:serverDraft.banner,bannerCrop:serverDraft.bannerCrop,publicListing:Boolean(serverDraft.publicListing)}});serverGeneralDirty=false;}
    if(serverPoliciesDirty){await request(`/api/servers/${serverDraft.id}/permissions`,{method:'PATCH',body:{defaultPermissions:serverDraft.defaultPermissions}});serverPoliciesDirty=false;}
    if(roleDirty&&roleDraft) {await saveRole(roleDraft,roleDraft.id);roleDirty=false;}
    for(const [userId,roleIds] of Object.entries(memberRoleDrafts)){await request(`/api/servers/${serverDraft.id}/members/${userId}/roles`,{method:'PUT',body:{roleIds}});delete memberRoleDrafts[userId];}
    await refreshWorkspace();discoveryUpdatedAt=0;
  } else { $('#modal-root form')?.requestSubmit();return; }
  modalDirty=false;closeModal();renderAll();toast('Changes saved.');
}

function setImageProgress(label,{percent=0,paused=false}) {
  if(!$('#modal-root .modal-content'))return;
  let node=$('#image-upload-progress');
  if(!node){node=document.createElement('div');node.id='image-upload-progress';node.className='image-upload-progress';node.innerHTML='<div><span></span><button class="button-secondary" data-action="cancel-image-upload" type="button">Cancel upload</button></div><progress max="100" aria-label="Image upload progress"></progress>';const description=$('#modal-root .modal-description');if(description)description.after(node);else $('#modal-root .modal-content').prepend(node);}
  node.querySelector('span').textContent=`${label} · ${paused?'Reconnecting · ':''}${percent}%`;
  node.querySelector('progress').value=percent;
}

window.addEventListener('storage',event=>{if(event.key===CONFIG.preferencesKey){preferences={...DEFAULT_PREFERENCES,...readLocal(CONFIG.preferencesKey,{})};state.collapsedCategories=preferences.collapsedCategories;applyPreferences();refreshSettingsControls();}});


function patchUserPresence(user) {
  const status=user.status||'offline';
  for(const node of document.querySelectorAll(`.avatar[data-user-id="${CSS.escape(user.id)}"]`)){
    if(!node.querySelector('.presence-ring'))continue;
    for(const value of ['online','idle','dnd','invisible','offline'])node.classList.toggle(`presence-${value}`,value===status);
    node.title=UI.statusLabel(status);node.querySelector('.presence-ring').setAttribute('aria-label',UI.statusLabel(status));
  }
  for(const node of document.querySelectorAll(`[data-presence-label="${CSS.escape(user.id)}"]`))node.textContent=UI.statusLabel(status);
  for(const node of document.querySelectorAll(`[data-user-name="${CSS.escape(user.id)}"]`))if(!node.closest('#profile-card-content'))node.textContent=user.displayName;
}
function syncConnectionBanner() {
  $('#main .connection-bar')?.remove();
  if (state.connected) { connectionNoticeActive = false; notices.dismiss(connectionNoticeNode); connectionNoticeNode = null; return; }
  if (!connectionNoticeActive && state.user) { connectionNoticeActive = true; connectionNoticeNode = toast('Connection lost. Reconnecting… Please wait before sending messages.', true); }
}

function syncVisualViewport() {
  const viewport=window.visualViewport,height=viewport?.height||window.innerHeight,editing=document.activeElement?.matches('input:not([type=range]):not([type=checkbox]):not([type=color]),textarea,[contenteditable=true]');
  // CSS handles orientation; an overlay keyboard can reserve a smaller viewport.
  const keyboard=editing&&(!viewport||viewport.scale===1)&&window.innerHeight-height>CONFIG.keyboardViewportDifference;
  document.documentElement.style.setProperty('--visual-height',`${height}px`);document.documentElement.style.setProperty('--visual-top',`${keyboard?viewport?.offsetTop||0:0}px`);document.documentElement.style.setProperty('--viewport-height',keyboard?`min(${height}px,100dvh)`:'100dvh');
  syncComposerPlaceholder();positionCallDock();
}
document.addEventListener('focusin',syncVisualViewport);document.addEventListener('focusout',syncVisualViewport);
syncVisualViewport();window.visualViewport?.addEventListener('resize',syncVisualViewport);window.visualViewport?.addEventListener('scroll',syncVisualViewport);window.addEventListener('resize',syncVisualViewport);
installGestures({enabled:()=>preferences.gestures!==false&&!artworkEditor.active,dismissToast:node=>notices.dismiss(node),closeModal:()=>closeModal(),closePopover,viewerNavigate:direction=>imageViewer.navigate(direction),viewerReady:()=>modalType==='image-viewer'&&imageViewer.zoom===1&&imageViewer.items.length>1,hasConversation:()=>Boolean(state.activeConv),canReply:()=>Boolean($('#message-input'))&&UI.canWrite(state),reply:replyToMessage,messageOptions:id=>showMessageOptions(id,document.getElementById(`message-${id}`)),openMembers:()=>{preferences[state.view==='voice'?'voiceMembers':'members']=true;savePreferences();$('#app').classList.add('show-members');}});

function roleBody(form){return {name:form.elements.name.value,color:form.elements.color.value,icon:form.elements.icon.value,iconCrop:readCrop(form.elements.iconCrop?.value),displayMembers:Boolean(form.elements.displayMembers?.checked),...CommunityUI.rolePermissionValues(form)};}
async function saveRole(body,id){return request(`/api/servers/${state.activeServer}/${id==='__owner__'?'owner-role':`roles${id?`/${id}`:''}`}`,{method:id?'PATCH':'POST',body});}
async function moveRole(id,direction){
  const server=UI.currentServer(state),roles=orderedRoles(server),index=roles.findIndex(role=>role.id===id),next=index+direction;if(index<0||next<0||next>=roles.length)return;
  if(roleDirty)throw new Error('Save your role changes before rearranging roles.');
  [roles[index],roles[next]]=[roles[next],roles[index]];await request(`/api/servers/${server.id}/role-order`,{method:'PUT',body:{roleIds:roles.map(role=>role.id)}});await refreshWorkspace();renderChrome();showServerSettings('roles',true);
}
function replyToMessage(id){if(!messageForUI(id)||!UI.canWrite(state)||!$('#message-input'))return;state.replyTo=id;renderPending();$('#message-input').focus();}
async function adjustArtwork(draft,kind,purpose){
  if(!draft?.[kind]||imageUploads)return;const crop=await artworkEditor.open({url:draft[kind],crop:draft[`${kind}Crop`],kind,title:`Position ${kind}`});if(!crop)return;
  draft[`${kind}Crop`]=crop;modalDirty=true;if(purpose==='profile'){profileDirty=true;updateProfileCard();}else{serverGeneralDirty=true;updateServerImages();}
}
function setCover(url,crop){
  const input=$('#channel-cover-value');if(!input)return;input.value=url;$('#channel-cover-crop').value=JSON.stringify(crop);$('#channel-cover-preview').innerHTML=`<img src="${e(url)}" style="${cropStyle(crop)}" alt="Channel cover" draggable="false">`;for(const control of document.querySelectorAll('[data-action=channel-cover-crop], [data-action=remove-channel-cover]'))control.disabled=!url;modalDirty=true;
}
async function adjustCover(){const url=$('#channel-cover-value')?.value;if(!url)return;const crop=await artworkEditor.open({url,crop:readCrop($('#channel-cover-crop').value),kind:'cover',title:'Position forum cover'});if(crop)setCover(url,crop);}
function setRoleIcon(url,crop){const input=$('#role-icon');if(!input)return;input.value=url;$('#role-icon-crop').value=JSON.stringify(crop);input.dispatchEvent(new Event('input',{bubbles:true}));showServerSettings('roles',true);}
async function adjustRoleIcon(){const url=$('#role-icon')?.value;if(!url?.startsWith('/files/'))return;const crop=await artworkEditor.open({url,crop:readCrop($('#role-icon-crop').value),kind:'icon',title:'Position role icon'});if(crop)setRoleIcon(url,crop);}

function showMessageOptions(id,anchor){
        const message = messageForUI(id); if (!message) return;
        const server = UI.currentServer(state);
        const own = message.authorId === state.user.id;
        const owner=UI.hasServerPermission(server,'manageMessages') || isForum(UI.activeConversation(state))&&UI.hasServerPermission(server,'manageTopics');
        const pin=!server||UI.hasServerPermission(server,'pinMessages'); 
        popover(`<button class="popover-item" data-action="copy-message" data-id="${e(id)}">${icon('copy',20)}Copy text</button>${pin ? `<button class="popover-item" data-action="pin-message" data-id="${e(id)}">${icon('pin',20)}${message.pinned ? 'Unpin message' : 'Pin message'}</button>` : ''}${own ? `<button class="popover-item" data-action="edit-message" data-id="${e(id)}">${icon('edit')}Edit message</button>` : ''}${own || owner ? `<button class="popover-item danger" data-action="delete-message" data-id="${e(id)}">${icon('trash')}Delete message</button>` : ''}`, anchor);
}

function attachmentKey(file){return file.provider?`giphy:${file.providerId}`:file.id||file.gifId;}


function dismissConfirmation() {
  const root=$('#dialog-guard-root');if(!root)return;
  const previous=root._previousFocus;root.remove();
  const modal=$('#modal-root > .modal-overlay');if(modal){modal.inert=false;modal.removeAttribute('aria-hidden');}else if(!$('#auth-screen')){$('#app').inert=false;$('#app').removeAttribute('aria-hidden');}
  if(previous?.isConnected)previous.focus({preventScroll:true});
}
function showConfirmation(content,type='confirmation') {
  dismissConfirmation();closePopover();selectMenus.close();
  const previous=document.activeElement,modal=$('#modal-root > .modal-overlay');
  if(modal){modal.inert=true;modal.setAttribute('aria-hidden','true');}else{$('#app').inert=true;$('#app').setAttribute('aria-hidden','true');}
  const root=document.createElement('div');root.id='dialog-guard-root';root.className='confirmation-overlay';root.dataset.confirmationType=type;root._previousFocus=previous;
  root.innerHTML=`<section class="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" tabindex="-1"><button type="button" class="icon-button modal-close" data-action="dismiss-confirmation" aria-label="${type==='unsaved'?'Keep editing and close confirmation':'Close confirmation'}">${icon('close',20)}</button>${content}</section>`;
  $('#modal-root').append(root);root.querySelector('.confirmation-dialog').focus({preventScroll:true});
}
function showDeleteServer(id) {
  const server=state.servers.find(server=>server.id===id);if(!server||server.role!=='owner')return;
  showConfirmation(`<div class="modal-emblem danger">${icon('trash',24)}</div><h2 id="confirmation-title">Delete ${e(server.name)}?</h2><p class="modal-description">This permanently deletes the server for every member, including all channels, messages, files and invitations. This cannot be undone.</p><form data-form="delete-server" data-id="${e(id)}"><label for="delete-server-name">Type the exact server name</label><input id="delete-server-name" name="confirmName" autocomplete="off" required placeholder="${e(server.name)}"><div id="form-error"></div><div class="modal-footer"><button class="button-secondary" type="button" data-action="dismiss-confirmation">Cancel</button><button class="button-danger" type="submit">Delete server permanently</button></div></form>`,'delete-server');
}
function showDeleteAccount() {
  const owned=state.servers.filter(server=>server.ownerId===state.user.id);
  showConfirmation(`<div class="modal-emblem danger">${icon('trash',24)}</div><h2 id="confirmation-title">Delete your account?</h2><p class="modal-description">Your profile, messages and uploads will be removed permanently. Your DMs are deleted for both people, and replies to your forum posts are removed with those posts. All your sessions will end. This cannot be undone.</p><form data-form="delete-account"><label for="delete-account-username">Type your permanent username</label><input id="delete-account-username" name="confirmUsername" autocomplete="off" required placeholder="${e(state.user.username)}"><label for="delete-account-password">Current password</label><input id="delete-account-password" type="password" name="password" autocomplete="current-password" required>${owned.length?`<div class="owned-server-warning"><strong>You own ${owned.length} ${owned.length===1?'server':'servers'}</strong><ul>${owned.map(server=>`<li>${e(server.name)}</li>`).join('')}</ul><p>Transfer ownership before deleting your account, or confirm that every server in this list should also be permanently deleted.</p><label class="checkbox-row"><input type="checkbox" name="deleteOwnedServers"><span>Also permanently delete all servers I own and their contents</span></label></div>`:''}<div id="form-error"></div><div class="modal-footer"><button class="button-secondary" type="button" data-action="dismiss-confirmation">Cancel</button><button class="button-danger" type="submit">Delete account permanently</button></div></form>`,'delete-account');
}
function finishAccountDeletion() {
  if(!state.user)return;
  const userId=state.user.id;sounds.stopAll();incomingCall=null;call.leave(false);socket?.disconnect();preferenceSync.detach();clearPending();
  for(const storage of [localStorage,sessionStorage])try{for(const key of Object.keys(storage))if(key.includes(userId))storage.removeItem(key);}catch{/* Local storage is optional. */}
  try{if(readLocal(CONFIG.preferenceOwnerKey,null)===userId)localStorage.removeItem(CONFIG.preferenceOwnerKey);}catch{/* Optional migration marker. */}
  state.user=null;state.users=[];state.servers=[];state.dms=[];state.voice=[];state.messages=[];state.discovery=[];state.revealedSpoilers.clear();state.activeConv=null;state.activeServer=null;state.lastDM=null;profileDraft=null;serverDraft=null;roleDraft=null;modalDirty=false;closeModal(true,true);for(const selector of ['#main','#sidebar','#members','#workspace-nav']){const node=$(selector);node.replaceChildren();delete node._nexusMarkup;}showAuth();toast('Your account was permanently deleted.');
}
function syncModerationFields() {
  const action=$('#moderation-action'),duration=$('#moderation-duration'),field=$('#moderation-duration-field');if(!action||!duration)return;
  const timed=['mute','ban'].includes(action.value);field.hidden=!timed;duration.disabled=!timed;
  const permanent=duration.querySelector('[value="0"]');permanent.hidden=action.value!=='ban';permanent.disabled=action.value!=='ban';
  if(action.value==='mute'&&duration.value==='0')duration.value='0.1666666667';selectMenus.sync(duration);
}
function showModerationRestriction(entry) {
  showConfirmation(`<div class="modal-emblem danger">${icon(entry.kind==='ban'?'ban':'micOff',24)}</div><h2 id="confirmation-title">${entry.kind==='ban'?'You are banned':'You are muted'}</h2><p class="modal-description">${e(entry.serverName || 'This server')}</p><dl class="restriction-details"><div><dt>Reason</dt><dd>${e(entry.reason || 'No reason was provided.')}</dd></div><div><dt>${entry.expiresAt===null?'Duration':'Time remaining'}</dt><dd><time data-moderation-countdown="${entry.expiresAt ?? ''}">${remainingTime(entry.expiresAt)}</time></dd></div>${entry.expiresAt?`<div><dt>Ends</dt><dd>${e(new Date(entry.expiresAt).toLocaleString())}</dd></div>`:''}</dl><div class="modal-footer"><button class="button-primary" data-action="dismiss-confirmation">Close</button></div>`,'moderation');
}
setInterval(()=>{
  for(const node of document.querySelectorAll('[data-moderation-countdown]'))node.textContent=remainingTime(node.dataset.moderationCountdown===''?null:Number(node.dataset.moderationCountdown));
  let expired=false;for(const server of state.servers)if(server.moderation?.expiresAt&&server.moderation.expiresAt<=Date.now()){server.moderation=null;if(server.id===state.activeServer)expired=true;}
  if(expired&&state.user)renderMain({preservePosition:true});
},1000);
