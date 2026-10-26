import * as UI from './ui.js';
import { VoiceActivity } from './voice-activity.js';

const MEDIA_READY_STATE = 2;

// Reuse media elements during presence, mute and layout updates.
export class NexusMediaView {
  constructor({ getState, getCall, getSocketId, getRoot, getMediaRoot, onPlaybackBlocked }) {
    Object.assign(this, { getState, getCall, getSocketId, getRoot, getMediaRoot, onPlaybackBlocked });
    this.activity = new VoiceActivity({ onChange: (key, speaking, level) => {
      for (const tile of this.getRoot()?.querySelectorAll(`.voice-tile[data-peer="${CSS.escape(key)}"]`) || []) {
        tile.classList.toggle('is-speaking', speaking);
        const indicator = tile.querySelector('.speaking-indicator');
        if (indicator) { indicator.setAttribute('aria-hidden', String(!speaking)); indicator.title = `Microphone input: ${Math.round(level * 100)}%`; }
      }
    } });
  }
  markup(node, html) { if (node && node._nexusMarkup !== html) { node.innerHTML = html; node._nexusMarkup = html; } }
  update() {
    const state = this.getState(), call = this.getCall();
    const view = this.getRoot()?.querySelector('.voice-view');
    if (!view || view.dataset.conversation !== state.activeConv) return false;
    const layout = UI.voiceLayout(state), grid = view.querySelector('#voice-grid');
    grid.classList.toggle('presentation-layout', Boolean(layout.focusKey));
    const existing = new Map([...grid.querySelectorAll('[data-media-key]')].map(tile => [tile.dataset.mediaKey, tile]));
    const keys = new Set(layout.tiles.map(tile => `${tile.socketId}:${tile.kind}`));
    for (const [key, tile] of existing) if (!keys.has(key)) tile.remove();
    const host = className => {
      let node = [...grid.children].find(child => child.classList.contains(className));
      if (!node) { node = document.createElement('div'); node.className = className; grid.append(node); }
      return node;
    };
    const primary = layout.focusKey ? host('media-primary') : host('voice-tiles');
    const thumbnails = layout.focusKey ? host('media-thumbnails') : primary;
    const hosts = new Set([primary, thumbnails]);
    const positions = new Map([[primary, 0], [thumbnails, 0]]);
    for (const empty of grid.querySelectorAll('.voice-empty')) empty.remove();
    layout.tiles.forEach(descriptor => {
      const key = `${descriptor.socketId}:${descriptor.kind}`;
      const template = document.createElement('template');
      template.innerHTML = UI.voiceTileMarkup(state, descriptor, key === layout.focusKey);
      const desired = template.content.firstElementChild;
      let tile = existing.get(key);
      if (!tile) tile = desired;
      else {
        tile.classList.toggle('featured', key === layout.focusKey);
        tile.classList.toggle('expects-video', descriptor.kind === 'screen' ? descriptor.sharing : descriptor.camera);
        for (const selector of ['.tile-avatar', '.tile-name', '.tile-state']) this.markup(tile.querySelector(selector), desired.querySelector(selector).innerHTML);
      }
      const target = key === layout.focusKey ? primary : thumbnails;
      const index = positions.get(target); positions.set(target, index + 1);
      if (target.children[index] !== tile) target.insertBefore(tile, target.children[index] || null);
    });
    if (!layout.tiles.length) primary.innerHTML = '<div class="voice-empty"><h2>No one is in this call yet</h2><p>Join to start talking.</p></div>';
    for (const child of [...grid.children]) if (!hosts.has(child)) child.remove();
    view.querySelector('#voice-status').textContent = UI.voiceStatus(state, call);
    this.markup(view.querySelector('#voice-controls'), UI.voiceControlMarkup(state, call));
    this.markup(view.querySelector('#voice-playback'), state.audioBlocked ? '<button class="button-primary" data-action="enable-call-audio">Enable call audio</button>' : '');
    this.bind(); return true;
  }
  playAudio(audio) {
    if (audio.dataset.attempted === 'true' || !audio.srcObject?.getAudioTracks().length) return;
    audio.dataset.attempted = 'true';
    audio.play().then(() => { audio.dataset.blocked = 'false'; this.checkPlayback(); }).catch(() => {
      if (!audio.isConnected || !this.getCall().active) return;
      audio.dataset.blocked = 'true'; this.checkPlayback();
    });
  }
  checkPlayback() {
    const blocked = Boolean(this.getMediaRoot()?.querySelector('audio[data-blocked=true]'));
    if (blocked !== this.getState().audioBlocked) this.onPlaybackBlocked(blocked);
  }
  async enableAudio() {
    this.activity.resume();
    const audios = [...this.getMediaRoot().querySelectorAll('audio')];
    await Promise.all(audios.map(async audio => { audio.dataset.attempted = 'false'; this.playAudio(audio); }));
  }
  bind() {
    const call = this.getCall(), state = this.getState(), media = this.getMediaRoot();
    if (!call.active) {
      this.activity.stop(); media.replaceChildren();
      for (const tile of this.getRoot()?.querySelectorAll('.voice-tile') || []) { tile.querySelector('video')?.remove(); tile.classList.remove('has-video'); }
      this.checkPlayback(); return;
    }
    const live = new Set();
    const localId = this.getSocketId(); this.activity.watch(localId, call.localStream, call.muted || call.deafened || call.stageListener);
    const activityKeys = new Set([localId]);
    for (const [socketId, peer] of call.peers) {
      live.add(socketId);
      let audio = media.querySelector(`[data-audio-peer="${CSS.escape(socketId)}"]`);
      if (!audio) { audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.dataset.audioPeer = socketId; media.append(audio); }
      if (audio.srcObject !== peer.stream) { audio.srcObject = peer.stream; audio.dataset.attempted = 'false'; audio.dataset.blocked = 'false'; }
      const participant = state.voice.find(person => person.socketId === socketId);
      audio.muted = call.deafened || participant?.stageSpeaker === false || participant?.canSpeak === false || state.blockedIds?.includes(participant?.userId); this.playAudio(audio);
      activityKeys.add(socketId); this.activity.watch(socketId, peer.stream, audio.muted || participant?.muted);
    }
    this.activity.retain(activityKeys);
    for (const audio of media.querySelectorAll('audio')) if (!live.has(audio.dataset.audioPeer)) audio.remove();
    for (const tile of this.getRoot()?.querySelectorAll('.voice-tile[data-media-key]') || []) {
      const local = tile.dataset.peer === this.getSocketId();
      const participant = state.voice.find(person => person.socketId === tile.dataset.peer);
      const screen = tile.dataset.kind === 'screen';
      const peer = call.peers.get(tile.dataset.peer);
      const stream = local ? screen ? call.screenStream : call.cameraStream || call.localStream : screen ? peer?.screenStream : peer?.cameraStream;
      const visible = call.active.conversationId === state.activeConv && participant && (screen ? participant.sharing : participant.camera) && stream?.getVideoTracks().some(track => track.readyState === 'live');
      let video = tile.querySelector('video');
      if (!visible) { video?.remove(); tile.classList.remove('has-video'); continue; }
      if (!video) { video = document.createElement('video'); video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.muted = true; video.addEventListener('loadeddata', () => { if (video.isConnected) tile.classList.add('has-video'); }); tile.prepend(video); }
      if (video.srcObject !== stream) { video.srcObject = stream; video.play().catch(() => {}); }
      else if (video.paused && video.readyState >= MEDIA_READY_STATE) video.play().catch(() => {});
      tile.classList.toggle('has-video', video.readyState >= MEDIA_READY_STATE);
    }
    this.checkPlayback();
  }
}

export async function toggleMediaFullscreen(tile) {
  if (!tile) return;
  if (tile.classList.contains('media-expanded') || document.fullscreenElement === tile) {
    tile.classList.remove('media-expanded');
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(() => {});
    return;
  }
  // A full-viewport fallback works when native fullscreen is blocked or unsupported.
  tile.classList.add('media-expanded');
  if (tile.requestFullscreen) await tile.requestFullscreen().catch(() => {});
}
