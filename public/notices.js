import { CONFIG } from './config.js';
import { icon } from './icons.js';
import { viewportFrame } from './viewport.js';

// Anchor above fixed footer surfaces, never search for gaps in scrollable content.
export const NOTICE_CONFIG = Object.freeze({ width:360, edge:12, modalFooterClearance:80, minimumHeight:44, maxStackHeight:200 });
export class Notices {
  constructor(root) {
    this.root=root;this.timers=new WeakMap();this.items=new Map();this.positionFrame=0;this.lastFrame=null;
    root.setAttribute('aria-label','Notifications');document.documentElement.style.setProperty('--notice-height','0px');
    if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(root);}
    const contextChanged=()=>{if(this.root.children.length)this.schedule();};
    this.modalObserver=new MutationObserver(contextChanged);
    const modals=document.querySelector('#modal-root');if(modals)this.modalObserver.observe(modals,{childList:true,subtree:true});
    this.bodyObserver=new MutationObserver(contextChanged);this.bodyObserver.observe(document.body,{childList:true});
    const app=document.querySelector('#app');if(app)this.bodyObserver.observe(app,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',()=>this.schedule(true));
    window.visualViewport?.addEventListener('resize',()=>this.schedule(true));
    window.visualViewport?.addEventListener('scroll',()=>this.schedule());
  }
  context() {
    const viewport=window.visualViewport,frame=viewportFrame({layoutHeight:window.innerHeight,visual:viewport,previous:this.lastFrame});this.lastFrame=frame;
    const zoomed=Math.abs((viewport?.scale||1)-1)>.02;
    const width=Math.min(window.innerWidth,viewport?.width||window.innerWidth),height=frame.height.endsWith('px')?parseFloat(frame.height):viewport?.height||window.innerHeight;
    const top=zoomed?viewport?.offsetTop||0:parseFloat(frame.top),left=viewport?.offsetLeft||0,edge=NOTICE_CONFIG.edge;
    const modal=document.querySelector('#dialog-guard-root .confirmation-dialog')||document.querySelector('#artwork-editor-root .artwork-dialog')||document.querySelector('#modal-root .modal');
    const auth=document.querySelector('#auth-screen'),sidebar=document.querySelector('#sidebar'),side=sidebar?.getBoundingClientRect(),inSidebar=!modal&&!auth&&side?.width>0&&width<=CONFIG.mobileBreakpoint&&Boolean(document.querySelector('#app.sidebar-open'));
    let bottom=top+height,noticeWidth=Math.min(NOTICE_CONFIG.width,width-edge*2),anchorLeft=left+width-edge-noticeWidth;
    if(modal){const box=modal.getBoundingClientRect();
      // Prefer the free space below a centered dialog, never its action row.
      const stackHeight=Math.min(NOTICE_CONFIG.maxStackHeight,Math.max(NOTICE_CONFIG.minimumHeight,this.root.getBoundingClientRect().height));
      if(top+height-box.bottom>=Math.max(NOTICE_CONFIG.modalFooterClearance,stackHeight+edge))bottom=top+height;
      else{noticeWidth=Math.min(noticeWidth,Math.max(1,box.width-edge*2));anchorLeft=box.left+(box.width-noticeWidth)/2;const actions=modal.querySelector?.('.confirmation-actions')?.getBoundingClientRect();bottom=Math.min(bottom,box.bottom-NOTICE_CONFIG.modalFooterClearance,actions?.top||Infinity);}
    }
    else if(!auth) {
      const nodes=inSidebar?[document.querySelector('#sidebar > .call-dock:not([hidden])'),document.querySelector('#sidebar > .user-bar')]:[...document.querySelectorAll('#main > .composer-area,#main > .read-only-composer,#main > .moderation-notice,#main > .voice-view > .voice-footer,#app > .call-dock:not([hidden])')];
      if(inSidebar){noticeWidth=Math.min(noticeWidth,Math.max(1,side.width-edge*2));anchorLeft=side.left+edge;}
      for(const node of nodes){const box=node?.getBoundingClientRect();if(box?.width&&box.height&&box.top<top+height&&box.bottom>top)bottom=Math.min(bottom,box.top);}
    }
    return {width,height,top,left,bottom,noticeWidth,anchorLeft};
  }
  schedule() {
    if(!this.root.children.length)return;
    if(this.positionFrame)return;
    this.positionFrame=requestAnimationFrame(()=>{this.positionFrame=0;this.resize();});
  }
  resize() {
    if(!this.root.children.length)return;
    const {width,height,top,left,bottom,noticeWidth,anchorLeft}=this.context(),edge=NOTICE_CONFIG.edge;
    const available=Math.max(1,width-edge*2),size=Math.max(1,Math.min(noticeWidth,available));
    this.root.style.width=`${size}px`;this.root.style.left=`${Math.max(left+edge,Math.min(anchorLeft,left+width-edge-size))}px`;this.root.style.right='auto';
    const floor=Math.max(top+edge+NOTICE_CONFIG.minimumHeight,Math.min(bottom,top+height)-edge);
    this.root.style.maxHeight=`${Math.max(NOTICE_CONFIG.minimumHeight,Math.min(NOTICE_CONFIG.maxStackHeight,floor-top-edge))}px`;
    const toastHeight=this.root.getBoundingClientRect().height;
    const position=Math.max(top+edge,Math.min(floor-toastHeight,top+height-edge-toastHeight));
    this.root.style.top=`${position}px`;this.root.style.bottom='auto';
  }
  dismiss(node) {
    if(!node)return;clearTimeout(this.timers.get(node));this.items.delete(node.dataset.notice);node.remove();this.resize();
  }
  dismissAction(action) {for(const node of [...this.root.children])if(node.querySelector(`[data-action="${action}"]`))this.dismiss(node);}
  show(message,error=false,{duration=CONFIG.toastDurationMs,action=null}={}) {
    const key=`${error}:${message}`,existing=this.items.get(key);
    if(existing?.isConnected){clearTimeout(this.timers.get(existing));if(duration>0)this.timers.set(existing,setTimeout(()=>this.dismiss(existing),duration));return existing;}
    while(this.root.children.length>=CONFIG.maxToasts)this.dismiss(this.root.firstElementChild);
    const node=document.createElement('div');node.className=`toast${error?' error':''}`;node.dataset.notice=key;
    node.innerHTML=`${icon(error?'bell':'check',18)}<span class="toast-message"></span><button class="icon-button" type="button" data-action="dismiss-toast" aria-label="Dismiss notification">${icon('close',18)}</button>`;
    node.querySelector('.toast-message').textContent=message;
    if(action){const button=document.createElement('button');button.type='button';button.className='toast-action';button.dataset.action=action.name;button.textContent=action.label;node.insertBefore(button,node.lastElementChild);}
    this.items.set(key,node);this.root.append(node);this.resize();
    const start=()=>{clearTimeout(this.timers.get(node));if(duration>0)this.timers.set(node,setTimeout(()=>this.dismiss(node),duration));};
    node.addEventListener('pointerenter',()=>clearTimeout(this.timers.get(node)));node.addEventListener('pointerleave',start);
    node.addEventListener('focusin',()=>clearTimeout(this.timers.get(node)));node.addEventListener('focusout',start);start();return node;
  }
}
