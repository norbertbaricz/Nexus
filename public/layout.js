import { CONFIG } from './config.js';

// Return bounded widths without allowing either panel to consume half the page.
export function sidebarBounds(viewportWidth, side) {
  const minimum=side==='left'?CONFIG.sidebarLeftMin:CONFIG.sidebarRightMin;
  const maximum=Math.min(side==='left'?CONFIG.sidebarLeftMax:CONFIG.sidebarRightMax,Math.floor(viewportWidth*CONFIG.sidebarMaxFraction));
  return {min:Math.min(minimum,maximum),max:maximum};
}
export function sidebarWidths(viewportWidth,preferences={}) {
  const left=sidebarBounds(viewportWidth,'left'),right=sidebarBounds(viewportWidth,'right');
  const clamp=(value,fallback,bounds)=>Math.round(Math.max(bounds.min,Math.min(bounds.max,Number.isFinite(Number(value))?Number(value):fallback)));
  return {left:clamp(preferences.sidebarLeft,viewportWidth<=CONFIG.membersOverlayBreakpoint?260:280,left),right:clamp(preferences.sidebarRight,340,right)};
}
export class SidebarResize {
  constructor({getPreferences,onSave}) {
    this.getPreferences=getPreferences;this.onSave=onSave;this.drag=null;this.frame=0;
    for(const side of ['left','right']){
      const handle=document.createElement('div');handle.className=`panel-resizer ${side}`;handle.dataset.resizeSide=side;handle.role='separator';handle.tabIndex=0;handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',`Resize ${side==='left'?'navigation':'profile'} sidebar`);handle.setAttribute('aria-controls',side==='left'?'sidebar':'members');document.querySelector('#app').append(handle);
      handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();this.drag={side,node:handle};handle.setPointerCapture(event.pointerId);document.body.classList.add('resizing-panels');});
      handle.addEventListener('pointermove',event=>{if(!this.drag||this.drag.node!==handle)return;this.move(side,side==='left'?event.clientX:window.innerWidth-event.clientX);});
      const finish=()=>{if(!this.drag)return;this.drag=null;document.body.classList.remove('resizing-panels');this.onSave();};
      handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);
      handle.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const bounds=sidebarBounds(window.innerWidth,side),current=sidebarWidths(window.innerWidth,this.getPreferences())[side],direction=(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1);
        this.move(side,event.key==='Home'?bounds.min:event.key==='End'?bounds.max:current+direction*(event.shiftKey?CONFIG.sidebarResizeLargeStep:CONFIG.sidebarResizeStep));this.onSave();
      });
      handle.addEventListener('dblclick',()=>{delete this.getPreferences()[side==='left'?'sidebarLeft':'sidebarRight'];this.apply();this.onSave();});
    }
    window.addEventListener('resize',()=>this.apply());this.apply();
  }
  move(side,value) {
    const bounds=sidebarBounds(window.innerWidth,side);this.getPreferences()[side==='left'?'sidebarLeft':'sidebarRight']=Math.round(Math.max(bounds.min,Math.min(bounds.max,value)));
    if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.apply();});
  }
  apply() {
    const widths=sidebarWidths(window.innerWidth,this.getPreferences());
    for(const side of ['left','right']){
      const value=window.innerWidth<=CONFIG.mobileBreakpoint?(side==='left'?280:340):widths[side];document.documentElement.style.setProperty(side==='left'?'--sidebar-width':'--members-width',`${value}px`);
      const node=document.querySelector(`[data-resize-side=${side}]`),bounds=sidebarBounds(window.innerWidth,side);
      if(node){node.setAttribute('aria-valuemin',String(bounds.min));node.setAttribute('aria-valuemax',String(bounds.max));node.setAttribute('aria-valuenow',String(widths[side]));node.setAttribute('aria-valuetext',`${widths[side]} pixels`);}
    }
  }
}
