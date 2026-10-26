import { icon } from './icons.js';
import { CONFIG } from './config.js';
import { markdown } from './message-format.js';

export class ImageViewer {
  constructor({getState,showModal,request,toast,escape,canDownload}) {
    Object.assign(this,{getState,showModal,request,toast,escape,canDownload});this.items=[];this.index=0;this.zoom=1;
    document.addEventListener('load',event=>{if(event.target.matches?.('.viewer-image'))this.fit();},true);
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
    const media=image?`<img class="viewer-image" src="${e(file.url)}" alt="${e(file.name)}" draggable="false">`:file.type.startsWith('video/')?`<video class="viewer-video" src="${e(file.url)}" controls playsinline controlsList="nodownload" preload="metadata"></video>`:`<audio class="viewer-audio" src="${e(file.url)}" controls controlsList="nodownload" preload="metadata"></audio>`;
    this.showModal(`<div class="viewer-header"><div><h2 id="modal-title">${e(file.name)}</h2><small>${this.index+1} of ${this.items.length}</small></div><div class="viewer-tools">${image?`<button class="icon-button" data-action="viewer-zoom" data-delta="-1" aria-label="Zoom out">${icon('minus',18)}</button><button class="button-secondary" data-action="viewer-fit">Fit</button><button class="icon-button" data-action="viewer-zoom" data-delta="1" aria-label="Zoom in">${icon('plus',18)}</button>`:''}${!file.cover&&this.canDownload(file)?`<button class="button-secondary" data-action="viewer-download">${icon('download',18)}Download</button>`:''}</div></div><div class="viewer-stage"><div class="viewer-stage-content">${media}</div></div><div class="viewer-footer">${this.items.length>1?`<button class="button-secondary" data-action="viewer-previous">${icon('back',18)}Previous</button><button class="button-secondary" data-action="viewer-next">Next${icon('arrow',18)}</button>`:''}${file.caption?`<div class="media-caption prose">${markdown(file.caption)}</div>`:''}</div>`,{type:'image-viewer',wide:true});
    this.fit();
  }
  navigate(direction) {this.index=(this.index+direction+this.items.length)%this.items.length;this.zoom=1;this.render();}
  zoomBy(direction) {this.zoom=Math.min(CONFIG.viewerMaxZoom,Math.max(1,this.zoom+direction*CONFIG.viewerZoomStep));this.fit();}
  fit() {
    const image=document.querySelector('.viewer-image'),stage=document.querySelector('.viewer-stage');if(!image||!stage||!image.naturalWidth)return;
    stage.classList.toggle('swipe-navigation',this.zoom===1);
    const base=Math.min(image.naturalWidth,stage.clientWidth-32,(stage.clientHeight-32)*image.naturalWidth/image.naturalHeight);
    image.style.width=`${Math.max(1,base*this.zoom)}px`;image.style.height='auto';
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
