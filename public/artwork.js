import { CONFIG } from './config.js';
import { icon } from './icons.js';

// Saved positions never rewrite image bytes, so animated GIFs retain every frame.
export const DEFAULT_CROP = Object.freeze({ x: 50, y: 50, zoom: 1 });
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function readCrop(value) {
  try {
    const crop = typeof value === 'string' ? JSON.parse(value) : value;
    return { x: clamp(crop?.x, 0, 100, 50), y: clamp(crop?.y, 0, 100, 50), zoom: clamp(crop?.zoom, 1, CONFIG.artworkMaxZoom, 1) };
  } catch { return { ...DEFAULT_CROP }; }
}
function clamp(value, min, max, fallback) { return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
export function cropStyle(value) {
  const { x, y, zoom } = readCrop(value);
  return `object-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${zoom})`;
}
export class ArtworkEditor {
  constructor() { this.root = document.createElement('div');this.root.id = 'artwork-editor-root';document.body.append(this.root);this.active = false; }
  open({ url, crop, kind = 'avatar', title = 'Position image' }) {
    if (this.active) return Promise.resolve(null);
    this.active = true;this.value = readCrop(crop);this.focus = document.activeElement;
    this.parent=document.querySelector('#modal-root .modal')||document.querySelector('#app');this.wasInert=this.parent?.inert;if(this.parent)this.parent.inert=true;
    const ratio = kind === 'banner' ? CONFIG.artworkBannerRatio : kind === 'cover' ? CONFIG.artworkCoverRatio : kind === 'attachment' ? CONFIG.artworkMediaRatio : 1;
    this.root.innerHTML = `<div class="artwork-overlay"><section class="artwork-dialog" role="dialog" aria-modal="true" aria-labelledby="artwork-title" tabindex="-1"><header><h2 id="artwork-title">${escape(title)}</h2><button type="button" class="icon-button" data-artwork="cancel" aria-label="Cancel image positioning">${icon('close',20)}</button></header><p>Drag the image or use the controls to choose its position.</p><div class="artwork-stage ${ratio === 1 ? 'square' : 'wide'}" style="aspect-ratio:${ratio}"><img src="${escape(url)}" alt="Image position preview" draggable="false"><span class="crop-guides" aria-hidden="true"></span></div><p class="artwork-error" role="status" hidden>This device could not preview this image. Cancel to keep the previous image.</p><div class="crop-controls">${[['zoom','Zoom',1,CONFIG.artworkMaxZoom,CONFIG.artworkZoomStep],['x','Horizontal position',0,100,1],['y','Vertical position',0,100,1]].map(([key,label,min,max,step])=>`<label><span>${label}<output data-crop-output="${key}"></output></span><input type="range" data-crop="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label>`).join('')}</div><footer><button type="button" class="button-secondary" data-artwork="reset">Reset position</button><button type="button" class="button-primary" data-artwork="apply">Use this position</button></footer></section></div>`;
    const dialog = this.root.querySelector('.artwork-dialog'),stage = this.root.querySelector('.artwork-stage'),image = stage.querySelector('img');
    image.addEventListener('error',()=>{this.root.querySelector('.artwork-error').hidden=false;});
    this.controller = new AbortController();const signal = this.controller.signal;
    return new Promise(resolve=>{
      const finish = value => {this.controller.abort();this.root.replaceChildren();this.active=false;if(this.parent?.isConnected)this.parent.inert=Boolean(this.wasInert)||Boolean(document.querySelector('#auth-screen'));if(this.focus?.isConnected)this.focus.focus({preventScroll:true});resolve(value);};
      this.root.addEventListener('click',event=>{event.stopPropagation();const action=event.target.closest('[data-artwork]')?.dataset.artwork;if(action==='cancel')finish(null);if(action==='apply')finish({...this.value});if(action==='reset'){this.value={...DEFAULT_CROP};this.update();}},{signal});
      this.root.addEventListener('input',event=>{event.stopPropagation();if(event.target.dataset.crop){this.value[event.target.dataset.crop]=Number(event.target.value);this.update();}},{signal});
      this.root.addEventListener('keydown',event=>{
        event.stopPropagation();if(event.key==='Escape'){event.preventDefault();finish(null);return;}
        if(event.key==='Tab'){const fields=[...dialog.querySelectorAll('button,input')],at=fields.indexOf(document.activeElement);if(event.shiftKey&&(at<=0)){event.preventDefault();fields.at(-1).focus();}else if(!event.shiftKey&&at===fields.length-1){event.preventDefault();fields[0].focus();}}
      },{signal});
      let drag=null;
      stage.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,crop:{...this.value}};stage.setPointerCapture(event.pointerId);event.preventDefault();},{signal});
      stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const bounds=stage.getBoundingClientRect();this.value.x=Math.round(clamp(drag.crop.x-(event.clientX-drag.x)*100/bounds.width,0,100,50));this.value.y=Math.round(clamp(drag.crop.y-(event.clientY-drag.y)*100/bounds.height,0,100,50));this.update();},{signal});
      for(const name of ['pointerup','pointercancel'])stage.addEventListener(name,()=>{drag=null;},{signal});
      this.update();dialog.focus({preventScroll:true});
    });
  }
  update() {
    this.root.querySelector('.artwork-stage img').style.cssText=cropStyle(this.value);
    for(const input of this.root.querySelectorAll('[data-crop]')){const key=input.dataset.crop;input.value=this.value[key];this.root.querySelector(`[data-crop-output=${key}]`).textContent=key==='zoom'?`${Math.round(this.value[key]*100)}%`:`${Math.round(this.value[key])}%`;}
  }
}
