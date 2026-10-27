import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { markdown } from './message-format.js';

export class ImageViewer {
  constructor({getState,showModal,request,toast,escape,canDownload}) {
    Object.assign(this,{getState,showModal,request,toast,escape,canDownload});this.items=[];this.index=0;this.zoom=1;
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
    const file=this.items[this.index];if(!file)return;const e=this.escape,image=file.type.startsWith('image/');
    this.media?.pause?.();this.resizeObserver.disconnect();
    const media=image?`<img class="viewer-image" src="${e(file.url)}" alt="${e(file.name)}" draggable="false">`:file.type.startsWith('video/')?`<video class="viewer-video" src="${e(file.url)}" controls playsinline controlsList="nodownload" preload="metadata"></video>`:`<audio class="viewer-audio" src="${e(file.url)}" controls controlsList="nodownload" preload="metadata"></audio>`;
    const navigation=this.items.length>1?`<div class="viewer-navigation" role="group" aria-label="Media navigation"><button class="button-secondary" data-action="viewer-previous">${icon('back',20)}<span>Previous</span></button><button class="button-secondary" data-action="viewer-next"><span>Next</span>${icon('arrow',20)}</button></div>`:'';
    const caption=file.caption?`<div class="media-caption prose">${markdown(file.caption)}</div>`:'';
    this.showModal(`<header class="viewer-header"><div class="viewer-heading"><h2 id="modal-title">${e(file.name)}</h2><small>${this.index+1} of ${this.items.length}</small></div><div class="viewer-tools">${image?`<div class="viewer-zoom-controls" role="group" aria-label="Image zoom"><button class="icon-button" data-action="viewer-zoom" data-delta="-1" aria-label="Zoom out">${icon('minus',20)}</button><button class="button-secondary" data-action="viewer-fit" aria-label="Fit image">Fit</button><button class="icon-button" data-action="viewer-zoom" data-delta="1" aria-label="Zoom in">${icon('plus',20)}</button></div>`:''}${!file.cover&&this.canDownload(file)?`<button class="button-secondary viewer-download" data-action="viewer-download" aria-label="Download file">${icon('download',20)}<span>Download</span></button>`:''}</div><button class="icon-button viewer-close" data-action="close-modal" aria-label="Close dialog">${icon('close',20)}</button></header><div class="viewer-stage"><div class="viewer-stage-content">${media}</div></div>${navigation||caption?`<footer class="viewer-footer">${navigation}${caption}</footer>`:''}`,{type:'image-viewer',wide:true});
    this.stage=document.querySelector('.viewer-stage');this.media=this.stage?.querySelector('.viewer-image,.viewer-video,.viewer-audio');
    this.media?.addEventListener(image?'load':'loadedmetadata',()=>this.fit(),{once:true});
    if(this.stage)this.resizeObserver.observe(this.stage);
    this.fit();
  }
  navigate(direction) {if(!this.items.length)return;this.index=(this.index+direction+this.items.length)%this.items.length;this.zoom=1;this.render();}
  zoomBy(direction) {if(!this.items[this.index]?.type.startsWith('image/'))return;this.zoom=Math.min(CONFIG.viewerMaxZoom,Math.max(1,this.zoom+direction*CONFIG.viewerZoomStep));this.fit();}
  resetZoom() {this.zoom=1;this.fit();}
  close() {this.resizeObserver.disconnect();this.media?.pause?.();this.stage=null;this.media=null;this.items=[];}
  fit() {
    const stage=this.stage,media=this.media;if(!stage?.isConnected||!media)return;
    const centerX=(stage.scrollLeft+stage.clientWidth/2)/Math.max(1,stage.scrollWidth),centerY=(stage.scrollTop+stage.clientHeight/2)/Math.max(1,stage.scrollHeight);
    stage.classList.toggle('swipe-navigation',this.zoom===1);
    const image=media.classList.contains('viewer-image'),enlarged=image&&this.zoom>1,content=stage.querySelector('.viewer-stage-content');
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
    stage.scrollLeft=this.zoom===1?0:centerX*contentWidth-stage.clientWidth/2;stage.scrollTop=this.zoom===1?0:centerY*contentHeight-stage.clientHeight/2;
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
