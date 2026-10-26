import { CONFIG } from './config.js';
import { icon } from './icons.js';

// Floating notices use the sidebar corner or sit above active bottom controls.
export const NOTICE_CONFIG = Object.freeze({ width: 360, edge: 12, minimumWidth: 200, controlGap: 4 });
export class Notices {
  constructor(root){this.root=root;this.timers=new WeakMap();this.items=new Map();root.setAttribute('aria-label','Notifications');document.documentElement.style.setProperty('--notice-height','0px');if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(root);}this.modalObserver=new MutationObserver(()=>this.resize());const modals=document.querySelector('#modal-root');if(modals)this.modalObserver.observe(modals,{childList:true,subtree:true});document.addEventListener('scroll',()=>{if(!this.root.children.length||this.positionFrame)return;this.positionFrame=requestAnimationFrame(()=>{this.positionFrame=0;this.resize();});},{capture:true,passive:true});window.addEventListener('resize',()=>this.resize());window.visualViewport?.addEventListener('resize',()=>this.resize());this.resize();}
  resize(){
    if(!this.root.children.length)return;
    const viewport=window.visualViewport,width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0,modal=document.querySelector('#dialog-guard-root .confirmation-dialog')||document.querySelector('#artwork-editor-root .artwork-dialog')||document.querySelector('#modal-root .modal'),sidebar=document.querySelector('#sidebar'),side=sidebar?.getBoundingClientRect();
    const inSidebar=!modal&&width>CONFIG.mobileBreakpoint&&side?.width>0;
    let noticeWidth=Math.min(NOTICE_CONFIG.width,width-NOTICE_CONFIG.edge*2),left=NOTICE_CONFIG.edge;
    if(inSidebar){noticeWidth=Math.max(NOTICE_CONFIG.minimumWidth,Math.min(noticeWidth,side.width-NOTICE_CONFIG.edge*2));left=side.left+NOTICE_CONFIG.edge;}else left=Math.max(NOTICE_CONFIG.edge,(width-noticeWidth)/2);
    this.root.style.width=`${noticeWidth}px`;this.root.style.left=`${left}px`;
    const toastHeight=this.root.getBoundingClientRect().height,scope=modal||(inSidebar?sidebar:document.querySelector('#app'));
    const controls=[...(scope?.querySelectorAll('button:not([disabled]),input:not([type=hidden]),textarea,a[href],summary,label:has(input[type=checkbox])')||[])].map(node=>node.getBoundingClientRect()).filter(box=>box.width&&box.height&&box.right>left&&box.left<left+noticeWidth&&box.bottom>top&&box.top<top+height);
    // Prefer the lowest free gap. Keep active controls clear when a gap is available.
    const upper=top+NOTICE_CONFIG.edge,lower=top+height-NOTICE_CONFIG.edge-toastHeight;
    const candidates=[lower,...controls.flatMap(box=>[box.top-toastHeight-NOTICE_CONFIG.edge,box.bottom+NOTICE_CONFIG.edge])].filter(y=>y>=upper&&y<=lower).sort((a,b)=>b-a);
    const free=candidates.find(y=>controls.every(box=>y+toastHeight<=box.top-NOTICE_CONFIG.controlGap||y>=box.bottom+NOTICE_CONFIG.controlGap));
    if(free!==undefined){this.root.style.top=`${free}px`;this.root.style.bottom='auto';}
    else {
      // Dense short screens use the title margin, leaving the close control free.
      noticeWidth=Math.min(noticeWidth,Math.max(NOTICE_CONFIG.minimumWidth,width-96));this.root.style.width=`${noticeWidth}px`;this.root.style.left=`${NOTICE_CONFIG.edge}px`;this.root.style.top=`${upper}px`;this.root.style.bottom='auto';
    }
  }
  dismiss(node){if(!node)return;clearTimeout(this.timers.get(node));this.items.delete(node.dataset.notice);node.remove();this.resize();}
  show(message,error=false) {
    const key=`${error}:${message}`,existing=this.items.get(key);if(existing?.isConnected){clearTimeout(this.timers.get(existing));this.timers.set(existing,setTimeout(()=>this.dismiss(existing),CONFIG.toastDurationMs));return existing;}
    while(this.root.children.length>=CONFIG.maxToasts)this.dismiss(this.root.firstElementChild);
    const node=document.createElement('div');node.className=`toast${error?' error':''}`;node.dataset.notice=key;
    node.innerHTML=`${icon(error?'bell':'check',18)}<span class="toast-message"></span><button class="icon-button" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon('close',18)}</button>`;node.querySelector('.toast-message').textContent=message;
    this.items.set(key,node);this.root.append(node);this.resize();
    const start=()=>{clearTimeout(this.timers.get(node));this.timers.set(node,setTimeout(()=>this.dismiss(node),CONFIG.toastDurationMs));};
    node.addEventListener('pointerenter',()=>clearTimeout(this.timers.get(node)));node.addEventListener('pointerleave',start);node.addEventListener('focusin',()=>clearTimeout(this.timers.get(node)));node.addEventListener('focusout',start);start();return node;
  }
}
