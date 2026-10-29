import * as UI from './ui.js';
import { VoiceActivity } from './voice-activity.js';
import { syncMarkup } from './dom.js';
import { CallAudioOutput } from './media-devices.js';
import { ParticipantAudio } from './participant-audio.js';

const MEDIA_READY_STATE = 2;

// Reuse media elements during presence, mute and layout updates.
export class NexusMediaView {
  constructor({ getState, getCall, getSocketId, getRoot, getMediaRoot, onPlaybackBlocked, onOutputError = () => {}, storage }) {
    Object.assign(this, { getState, getCall, getSocketId, getRoot, getMediaRoot, onPlaybackBlocked });
    this.audio = new ParticipantAudio({ storage, onReady: () => this.bind(), onError: onOutputError });
    this.output = new CallAudioOutput({ getElements: () => this.getMediaRoot()?.querySelectorAll('audio') || [], createElement: () => document.createElement('audio'), onReady: () => this.bind(), onError: onOutputError });
    this.activity = new VoiceActivity({ onChange: (key, speaking, level) => {
      for (const tile of this.getRoot()?.querySelectorAll(`.voice-tile[data-peer="${CSS.escape(key)}"]`) || []) {
        tile.classList.toggle('is-speaking', speaking);
        const indicator = tile.querySelector('.speaking-indicator');
        if (indicator) { indicator.setAttribute('aria-hidden', String(!speaking)); indicator.title = `Microphone input: ${Math.round(level * 100)}%`; }
      }
    } });
  }
  markup(node, html) { syncMarkup(node, html); }
  releaseVideoTiles() {
    for(const tile of this.getRoot()?.querySelectorAll('.voice-tile') || []) {
      for(const video of tile.querySelectorAll('video')){video.pause();video.srcObject=null;video.remove();}
      tile.querySelector('.tile-camera')?.remove();tile.classList.remove('has-video','has-camera-inset','is-portrait');
    }
  }
  update() {
    const state = this.getState(), call = this.getCall();
    const view = this.getRoot()?.querySelector('.voice-view');
    if (!view || view.dataset.conversation !== state.activeConv) return false;
    const layout = UI.voiceLayout(state), grid = view.querySelector('#voice-grid');
    grid.classList.toggle('presentation-layout', Boolean(layout.focusKey));
    const existing = new Map([...grid.querySelectorAll('[data-media-key]')].map(tile => [tile.dataset.mediaKey, tile]));
    const keys = new Set(layout.tiles.map(tile => UI.voiceTileKey(tile)));
    for (const [key, tile] of existing) if (!keys.has(key)) { for(const video of tile.querySelectorAll('video')){video.pause();video.srcObject=null;}tile.remove(); }
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
      const key = UI.voiceTileKey(descriptor);
      const template = document.createElement('template');
      template.innerHTML = UI.voiceTileMarkup(state, descriptor, key === layout.focusKey);
      const desired = template.content.firstElementChild;
      let tile = existing.get(key);
      if (!tile) tile = desired;
      else {
        tile.classList.toggle('featured', key === layout.focusKey);
        tile.classList.toggle('expects-video', descriptor.kind === 'screen' ? descriptor.sharing : descriptor.camera);
        tile.dataset.kind=descriptor.kind;tile.setAttribute('aria-label',desired.getAttribute('aria-label'));
        for (const selector of ['.tile-avatar', '.tile-name', '.tile-state', '.tile-actions']) this.markup(tile.querySelector(selector), desired.querySelector(selector).innerHTML);
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
    const stream=audio.srcObject;
    audio.play().then(() => { if(audio.srcObject!==stream||!audio.isConnected)return;audio.dataset.blocked = 'false'; this.checkPlayback(); }).catch(() => {
      if (!audio.isConnected || !this.getCall().active || audio.srcObject!==stream) return;
      audio.dataset.blocked = 'true';
      if (!this.audio.outputFailed(audio.dataset.audioPeer, audio, stream)) this.checkPlayback();
    });
  }
  checkPlayback() {
    const blocked = this.audio.blocked || [...this.getMediaRoot()?.querySelectorAll('audio') || []].some(audio=>!audio.muted&&audio.dataset.blocked==='true');
    if (blocked !== this.getState().audioBlocked) this.onPlaybackBlocked(blocked);
  }
  async enableAudio() {
    const resumed = this.audio.unlock();
    this.activity.resume();
    await resumed; this.bind();
    const audios = [...this.getMediaRoot().querySelectorAll('audio')];
    await Promise.all(audios.map(async audio => { audio.dataset.attempted = 'false'; this.playAudio(audio); }));
  }
  bindVideo(tile, stream, role = 'primary') {
    let video=tile.querySelector(`video[data-media-role="${role}"]`);
    const visible=stream?.getVideoTracks().some(track=>track.readyState==='live');
    if(!visible){if(video){video.pause();video.srcObject=null;video.remove();}if(role==='primary')tile.classList.remove('has-video','is-portrait');else{tile.querySelector('.tile-camera')?.remove();tile.classList.remove('has-camera-inset');}return;}
    if(!video){
      video=document.createElement('video');video.dataset.mediaRole=role;video.autoplay=true;video.playsInline=true;video.setAttribute('playsinline','');video.muted=true;
      const dimensions=()=>{
        if(!video.isConnected)return;
        tile.classList.toggle(role==='primary'?'has-video':'has-camera-inset',video.readyState>=MEDIA_READY_STATE);
        if(role==='primary'){tile.classList.toggle('is-portrait',video.videoHeight>video.videoWidth);if(video.videoWidth&&video.videoHeight)tile.style.setProperty('--video-aspect',`${video.videoWidth} / ${video.videoHeight}`);}
      };
      video.addEventListener('loadeddata',dimensions);video.addEventListener('resize',dimensions);
      if(role==='primary')tile.prepend(video);
      else{let inset=tile.querySelector('.tile-camera');if(!inset){inset=document.createElement('div');inset.className='tile-camera';inset.setAttribute('role','img');inset.setAttribute('aria-label','Camera while sharing');tile.append(inset);}inset.append(video);}
    }
    if(video.srcObject!==stream){video.srcObject=stream;video.play().catch(()=>{});}
    else if(video.paused&&video.readyState>=MEDIA_READY_STATE)video.play().catch(()=>{});
    tile.classList.toggle(role==='primary'?'has-video':'has-camera-inset',video.readyState>=MEDIA_READY_STATE);
  }
  bind() {
    const call = this.getCall(), state = this.getState(), media = this.getMediaRoot();
    if (!call.active) {
      this.activity.stop(); if(!call.joining&&!this.preparingAudio)this.audio.stop(); media.replaceChildren();
      this.releaseVideoTiles();
      this.checkPlayback(); return;
    }
    const live = new Set();
    const localId = this.getSocketId(); this.activity.watch(localId, call.localStream, call.muted || call.deafened || call.stageListener);
    const activityKeys = new Set([localId]);
    for (const [socketId, peer] of call.peers) {
      live.add(socketId);
      let audio = media.querySelector(`[data-audio-peer="${CSS.escape(socketId)}"]`);
      if (!audio) { audio = document.createElement('audio'); audio.muted = true; audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.dataset.audioPeer = socketId; media.append(audio); }
      const participant = state.voice.find(person => person.socketId === socketId);
      const routed = this.output.route(audio);
      const silenced = !routed || !participant || call.deafened || participant.muted || participant.deafened || participant.stageSpeaker === false || participant.canSpeak === false || state.blockedIds?.includes(participant.userId);
      this.audio.apply(socketId, participant?.userId, peer.stream, audio, silenced); if (routed && !audio.muted) this.playAudio(audio);
      activityKeys.add(socketId); this.activity.watch(socketId, peer.stream, audio.muted || participant?.muted);
    }
    this.activity.retain(activityKeys); this.audio.retain(live);
    for (const audio of media.querySelectorAll('audio')) if (!live.has(audio.dataset.audioPeer)) audio.remove();
    for (const tile of this.getRoot()?.querySelectorAll('.voice-tile[data-media-key]') || []) {
      const local = tile.dataset.peer === this.getSocketId();
      const participant = state.voice.find(person => person.socketId === tile.dataset.peer);
      const screen = tile.dataset.kind === 'screen';
      const peer = call.peers.get(tile.dataset.peer);
      const camera=local?call.cameraStream||call.localStream:peer?.cameraStream;
      const stream=screen?(local?call.screenStream:peer?.screenStream):camera;
      const visible=call.active.conversationId===state.activeConv&&participant&&!state.blockedIds?.includes(participant.userId);
      this.bindVideo(tile,visible&&(screen?participant.sharing:participant.camera)?stream:null);
      this.bindVideo(tile,visible&&screen&&participant.camera?camera:null,'camera');
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
