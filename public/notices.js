import { CONFIG } from './config.js';
import { icon } from './icons.js';

// Choose one clear gap per visible batch; scrolling never changes its anchor.
export const NOTICE_CONFIG = Object.freeze({ width: 360, edge: 12, minimumWidth: 200, controlGap: 4, titleClearance: 96 });
export class Notices {
  constructor(root) {
    this.root=root;this.timers=new WeakMap();this.items=new Map();this.anchor=null;this.positionFrame=0;this.resetPending=false;
    root.setAttribute('aria-label','Notifications');document.documentElement.style.setProperty('--notice-height','0px');
    if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(root);}
    const contextChanged=()=>{if(this.root.children.length&&this.anchor?.scope!==this.context().scope)this.schedule(true);};
    this.modalObserver=new MutationObserver(contextChanged);
    const modals=document.querySelector('#modal-root');if(modals)this.modalObserver.observe(modals,{childList:true,subtree:true});
    this.bodyObserver=new MutationObserver(contextChanged);this.bodyObserver.observe(document.body,{childList:true});
    window.addEventListener('resize',()=>this.schedule(true));
    window.visualViewport?.addEventListener('resize',()=>this.schedule(true));
    window.visualViewport?.addEventListener('scroll',()=>this.schedule());
  }
  context() {
    const viewport=window.visualViewport,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
    const top=viewport?.offsetTop||0,left=viewport?.offsetLeft||0;
    const modal=document.querySelector('#dialog-guard-root .confirmation-dialog')||document.querySelector('#artwork-editor-root .artwork-dialog')||document.querySelector('#modal-root .modal');
    const sidebar=document.querySelector('#sidebar'),side=sidebar?.getBoundingClientRect(),inSidebar=!modal&&width>CONFIG.mobileBreakpoint&&side?.width>0;
    return {width,height,top,left,side,inSidebar,scope:modal||(inSidebar?sidebar:document.querySelector('#app'))};
  }
  schedule(reset=false) {
    if(!this.root.children.length)return;
    this.resetPending ||= reset;
    if(this.positionFrame)return;
    this.positionFrame=requestAnimationFrame(()=>{this.positionFrame=0;const reset=this.resetPending;this.resetPending=false;this.resize(reset);});
  }
  resize(reset=false) {
    if(!this.root.children.length){this.anchor=null;return;}
    const layout=this.context(),{width,height,top,side,inSidebar,scope}=layout,edge=NOTICE_CONFIG.edge;
    if(reset||this.anchor?.scope!==scope||this.anchor?.width!==width||this.anchor?.height!==height)this.anchor=null;
    const available=Math.max(1,width-edge*2);
    let noticeWidth=Math.min(NOTICE_CONFIG.width,available),left=layout.left+(width-noticeWidth)/2;
    if(inSidebar){noticeWidth=Math.min(available,Math.max(Math.min(NOTICE_CONFIG.minimumWidth,available),Math.min(noticeWidth,side.width-edge*2)));left=side.left+edge;}
    if(this.anchor?.compact){noticeWidth=Math.min(noticeWidth,Math.max(Math.min(NOTICE_CONFIG.minimumWidth,available),width-NOTICE_CONFIG.titleClearance));left=layout.left+edge;}
    left=Math.max(layout.left+edge,Math.min(left,layout.left+width-edge-noticeWidth));
    this.root.style.width=`${noticeWidth}px`;this.root.style.left=`${left}px`;this.root.style.right='auto';
    let toastHeight=this.root.getBoundingClientRect().height;
    const upper=top+edge;let lower=Math.max(upper,top+height-edge-toastHeight);
    if(!this.anchor) {
      const controls=[...(scope?.querySelectorAll('button:not([disabled]),input:not([type=hidden]),textarea,a[href],summary,label:has(input[type=checkbox])')||[])].map(node=>node.getBoundingClientRect()).filter(box=>box.width&&box.height&&box.right>left&&box.left<left+noticeWidth&&box.bottom>top&&box.top<top+height);
      const candidates=[lower,...controls.flatMap(box=>[box.top-toastHeight-edge,box.bottom+edge])].filter(y=>y>=upper&&y<=lower).sort((a,b)=>b-a);
      const free=candidates.find(y=>controls.every(box=>y+toastHeight<=box.top-NOTICE_CONFIG.controlGap||y>=box.bottom+NOTICE_CONFIG.controlGap));
      // Dense short screens use the title margin. Keep that choice until dismissal.
      if(free===undefined){noticeWidth=Math.min(noticeWidth,Math.max(Math.min(NOTICE_CONFIG.minimumWidth,available),width-NOTICE_CONFIG.titleClearance));this.root.style.width=`${noticeWidth}px`;this.root.style.left=`${layout.left+edge}px`;toastHeight=this.root.getBoundingClientRect().height;lower=Math.max(upper,top+height-edge-toastHeight);}
      const chosen=free??upper;
      this.anchor={scope,width,height,compact:free===undefined,bottomGap:top+height-chosen-toastHeight};
    }
    const position=Math.max(upper,Math.min(lower,top+height-this.anchor.bottomGap-toastHeight));
    this.root.style.top=`${position}px`;this.root.style.bottom='auto';
  }
  dismiss(node) {
    if(!node)return;clearTimeout(this.timers.get(node));this.items.delete(node.dataset.notice);node.remove();this.resize();
  }
  show(message,error=false) {
    const key=`${error}:${message}`,existing=this.items.get(key);
    if(existing?.isConnected){clearTimeout(this.timers.get(existing));this.timers.set(existing,setTimeout(()=>this.dismiss(existing),CONFIG.toastDurationMs));return existing;}
    while(this.root.children.length>=CONFIG.maxToasts)this.dismiss(this.root.firstElementChild);
    const node=document.createElement('div');node.className=`toast${error?' error':''}`;node.dataset.notice=key;
    node.innerHTML=`${icon(error?'bell':'check',18)}<span class="toast-message"></span><button class="icon-button" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon('close',18)}</button>`;
    node.querySelector('.toast-message').textContent=message;
    this.items.set(key,node);this.root.append(node);this.resize();
    const start=()=>{clearTimeout(this.timers.get(node));this.timers.set(node,setTimeout(()=>this.dismiss(node),CONFIG.toastDurationMs));};
    node.addEventListener('pointerenter',()=>clearTimeout(this.timers.get(node)));node.addEventListener('pointerleave',start);
    node.addEventListener('focusin',()=>clearTimeout(this.timers.get(node)));node.addEventListener('focusout',start);start();return node;
  }
}
