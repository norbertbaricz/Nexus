import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { markdown } from './message-format.js';
import { motionImageAttributes } from './animated-media.js';
import { VideoPlayback } from './video-playback.js';
import { ImageControls } from './image-controls.js';

// Native decoding remains browser-owned; never leave audio-only decode as a black video.
export const VIEWER_MEDIA_CONFIG=Object.freeze({readyState:2,minimumSize:1});
export function videoPlaybackIssue(media) {
  if(media?.error?.code===2)return 'The video could not load. Check your connection and reopen it.';
  if([3,4].includes(media?.error?.code))return 'This browser could not decode this video. Contact the server administrator if this continues.';
  if(media?.readyState>=VIEWER_MEDIA_CONFIG.readyState&&(!media.videoWidth||!media.videoHeight))return 'The audio is available, but this browser could not decode the video picture. Contact the server administrator if this continues.';
  return '';
}
export function containedVideoSize(width,height,availableWidth,availableHeight) {
  if(![width,height,availableWidth,availableHeight].every(value=>Number.isFinite(value)&&value>0))return null;
  const scale=Math.min(availableWidth/width,availableHeight/height);
  return {width:Math.max(VIEWER_MEDIA_CONFIG.minimumSize,width*scale),height:Math.max(VIEWER_MEDIA_CONFIG.minimumSize,height*scale)};
}
export class ImageViewer {
  constructor({getState,showModal,request,toast,escape,canDownload}) {
    Object.assign(this,{getState,showModal,request,toast,escape,canDownload});this.items=[];this.index=0;this.zoom=1;this.mediaRevision=0;
    this.mediaEvents=[];this.mediaChanged=()=>this.fit();
    this.controls=new ImageControls({getZoom:()=>this.zoom,zoomTo:(zoom,pointer)=>this.setZoom(zoom,pointer)});
    this.playback=new VideoPlayback({request,onStatus:()=>this.fit(),onReady:url=>this.usePreparedVideo(url)});
    this.resizeObserver=new ResizeObserver(()=>this.fit());
    window.addEventListener('resize',()=>this.fit());
  }
  entries() {
    const state=this.getState(),messages=[...(state.activeThread?[state.activeThread]:[]),...state.messages];
    return messages.flatMap(message=>(message.attachments||[]).map((file,index)=>({...file,messageId:message.id,attachmentIndex:index,caption:message.text}))).filter(file=>(!file.spoiler||state.revealedSpoilers?.has(`${file.messageId}:${file.attachmentIndex}`))&&/^image\/|^video\/|^audio\//.test(file.type));
  }
  open(messageId,index=0) {
    this.items=this.entries();this.index=this.items.findIndex(file=>file.messageId===messageId&&file.attachmentIndex===index);if(this.index<0)return;this.zoom=1;this.render();
  }
  cover(channel) {if(!channel?.cover)return;this.items=[{url:channel.cover,type:'image/cover',name:`${channel.name} cover`,cover:true}];this.index=0;this.zoom=1;this.render();}
  render() {
    const file=this.items[this.index];if(!file)return;this.mediaRevision++;const e=this.escape,image=file.type.startsWith('image/');this.reportedIssue='';
    this.controls.detach();this.playback.close();this.unwatchMedia();this.media?.pause?.();this.resizeObserver.disconnect();
    const media=image?`<img class="viewer-image" src="${e(file.url)}" ${motionImageAttributes(file)} alt="${e(file.name)}" draggable="false">`:file.type.startsWith('video/')?`<video class="viewer-video" src="${e(file.url)}" controls playsinline controlsList="nodownload" preload="metadata"></video>`:`<audio class="viewer-audio" src="${e(file.url)}" controls controlsList="nodownload" preload="metadata"></audio>`;
    const navigation=this.items.length>1?`<div class="viewer-navigation" role="group" aria-label="Media navigation"><button class="button-secondary" data-action="viewer-previous" aria-label="Previous">${icon('back',20)}<span>Previous</span></button><button class="button-secondary" data-action="viewer-next" aria-label="Next"><span>Next</span>${icon('arrow',20)}</button></div>`:'';
    const caption=file.caption?`<div class="media-caption prose">${markdown(file.caption)}</div>`:'';
    this.showModal(`<header class="viewer-header"><div class="viewer-heading"><h2 id="modal-title">${e(file.name)}</h2><small>${this.index+1} of ${this.items.length}</small></div><div class="viewer-tools">${image?`<div class="viewer-zoom-controls" role="group" aria-label="Image zoom"><button class="icon-button" data-action="viewer-zoom" data-delta="-1" aria-label="Zoom out">${icon('minus',20)}</button><button class="button-secondary" data-action="viewer-fit" aria-label="Fit image">Fit</button><button class="icon-button" data-action="viewer-zoom" data-delta="1" aria-label="Zoom in">${icon('plus',20)}</button></div>`:''}${!file.cover&&this.canDownload(file)?`<button class="button-secondary viewer-download" data-action="viewer-download" aria-label="Download file">${icon('download',20)}<span>Download</span></button>`:''}</div><button class="icon-button viewer-close" data-action="close-modal" aria-label="Close dialog">${icon('close',20)}</button></header><div class="viewer-stage"><div class="viewer-stage-content">${media}</div></div>${navigation||caption?`<footer class="viewer-footer">${navigation}${caption}</footer>`:''}`,{type:'image-viewer',wide:true});
    this.stage=document.querySelector('.viewer-stage');this.media=this.stage?.querySelector('.viewer-image,.viewer-video,.viewer-audio');
    // Metadata and decoded dimensions can arrive separately. Refit on both.
    this.mediaEvents=image?['load']:['loadedmetadata','loadeddata','resize','error'];
    for(const event of this.mediaEvents)this.media?.addEventListener(event,this.mediaChanged);
    if(this.stage)this.resizeObserver.observe(this.stage);
    if(image)this.controls.attach(this.stage);
    if(file.type.startsWith('video/'))this.playback.attach(this.media,file);
    this.fit();
  }
  navigate(direction) {if(!this.items.length)return;this.index=(this.index+direction+this.items.length)%this.items.length;this.zoom=1;this.render();}
  zoomBy(direction) {this.setZoom(this.zoom+direction*CONFIG.viewerZoomStep);}
  setZoom(value,pointer) {
    if(!this.items[this.index]?.type.startsWith('image/'))return;
    const zoom=Math.min(CONFIG.viewerMaxZoom,Math.max(1,value));if(zoom===this.zoom)return;
    let anchor;const stage=this.stage,media=this.media;
    if(pointer&&stage&&media){
      const box=media.getBoundingClientRect(),frame=stage.getBoundingClientRect();
      if(box.width&&box.height)anchor={x:Math.max(0,Math.min(1,(pointer.x-box.left)/box.width)),y:Math.max(0,Math.min(1,(pointer.y-box.top)/box.height)),localX:pointer.x-frame.left-(stage.clientLeft||0),localY:pointer.y-frame.top-(stage.clientTop||0)};
    }
    this.zoom=zoom;this.fit(anchor);
  }
  resetZoom() {this.controls.reset();this.zoom=1;this.fit();}
  usePreparedVideo(url) {
    const media=this.media;if(!media?.classList.contains('viewer-video'))return;const at=media.currentTime||0,playing=!media.paused&&!media.ended,revision=this.mediaRevision;
    media.addEventListener('loadedmetadata',()=>{if(this.media!==media||revision!==this.mediaRevision)return;try{media.currentTime=Math.min(at,Number.isFinite(media.duration)?Math.max(0,media.duration-.05):at);}catch{/* Keep native seek controls available. */}if(playing)media.play().catch(()=>{});this.fit();},{once:true});
    media.src=url;media.load();this.fit();
  }
  unwatchMedia() {for(const event of this.mediaEvents)this.media?.removeEventListener(event,this.mediaChanged);this.mediaEvents=[];}
  close() {this.mediaRevision++;this.controls.detach();this.playback.close();this.unwatchMedia();this.resizeObserver.disconnect();this.media?.pause?.();this.stage=null;this.media=null;this.items=[];}
  fit(anchor) {
    const stage=this.stage,media=this.media;if(!stage?.isConnected||!media)return;
    const centerX=(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,stage.scrollWidth),centerY=(stage.scrollTop+stage.clientHeight/2)/Math.max(1,stage.scrollHeight);
    stage.classList.toggle('swipe-navigation',this.zoom===1);
    const image=media.classList.contains('viewer-image'),enlarged=image&&this.zoom>1,content=stage.querySelector('.viewer-stage-content');
    if(media.classList.contains('viewer-video')){
      const nativeIssue=videoPlaybackIssue(media),waiting=this.playback.id&&!['failed','unavailable'].includes(this.playback.state);const issue=waiting&&media.error?.code!==2?'':nativeIssue;let status=stage.previousElementSibling?.classList.contains('viewer-media-status')?stage.previousElementSibling:null;
      if(issue&&!status){status=document.createElement('p');status.className='viewer-media-status';status.setAttribute('role','status');stage.before(status);}
      if(status){status.hidden=!issue;if(status.textContent!==issue)status.textContent=issue;}
      if(issue&&issue!==this.reportedIssue){this.reportedIssue=issue;console.warn('[Nexus video]',{code:media.error?.code||'no-video-picture',type:this.items[this.index]?.type});}
      const style=getComputedStyle(content),size=containedVideoSize(media.videoWidth,media.videoHeight,stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
      if(size){media.style.width=`${size.width}px`;media.style.height=`${size.height}px`;}else{media.style.width='';media.style.height='';}
      content.style.width='';content.style.height='';stage.classList.remove('is-zoomed');return;
    }
    stage.classList.toggle('is-zoomed',enlarged);
    const zoomOut=document.querySelector('[data-action=viewer-zoom][data-delta="-1"]'),zoomIn=document.querySelector('[data-action=viewer-zoom][data-delta="1"]');
    if(zoomOut)zoomOut.disabled=this.zoom<=1;if(zoomIn)zoomIn.disabled=this.zoom>=CONFIG.viewerMaxZoom;
    // CSS contains unzoomed media immediately, even while a resize callback is pending.
    if(!enlarged){media.style.width='';media.style.height='';content.style.width='';content.style.height='';stage.scrollLeft=0;stage.scrollTop=0;return;}
    const mediaWidth=media.naturalWidth,mediaHeight=media.naturalHeight;
    if(!mediaWidth||!mediaHeight)return;
    const style=getComputedStyle(content),horizontal=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),vertical=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom);
    const scale=Math.min(1,Math.max(1,stage.clientWidth-horizontal)/mediaWidth,Math.max(1,stage.clientHeight-vertical)/mediaHeight)*this.zoom;
    const width=mediaWidth*scale,height=mediaHeight*scale,contentWidth=Math.max(stage.clientWidth,width+horizontal),contentHeight=Math.max(stage.clientHeight,height+vertical);
    media.style.width=`${width}px`;media.style.height=`${height}px`;
    content.style.width=`${contentWidth}px`;content.style.height=`${contentHeight}px`;
    const left=anchor?parseFloat(style.paddingLeft)+(contentWidth-horizontal-width)/2+anchor.x*width-anchor.localX:centerX*contentWidth-stage.clientWidth/2;
    const top=anchor?parseFloat(style.paddingTop)+(contentHeight-vertical-height)/2+anchor.y*height-anchor.localY:centerY*contentHeight-stage.clientHeight/2;
    stage.scrollLeft=Math.max(0,Math.min(contentWidth-stage.clientWidth,left));stage.scrollTop=Math.max(0,Math.min(contentHeight-stage.clientHeight,top));
  }
  async download(file=this.items[this.index]) {
    if(!file||file.cover||!this.canDownload(file))throw new Error('This image has no download action in this channel.');
    let url=file.url,objectUrl;
    if(url.startsWith('/files/'))url=(await this.request(`${url}?download=1&info=1`)).url;
    else {
      if(file.provider!=='giphy'||!/^https:\/\/media[0-4]?\.giphy\.com\//.test(url))throw new Error('This media provider does not support downloads.');
      const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok||!response.body)throw new Error('The media provider did not allow this download.');
      const reader=response.body.getReader(),parts=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>CONFIG.providerDownloadMaxBytes){await reader.cancel();throw new Error('This provider image is too large to download here.');}parts.push(value);}
      url=objectUrl=URL.createObjectURL(new Blob(parts,{type:'image/gif'}));
    }
    const link=document.createElement('a');link.href=url;link.download=file.name||'image.gif';document.body.append(link);link.click();link.remove();if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),CONFIG.downloadUrlLifetimeMs);
  }
}
