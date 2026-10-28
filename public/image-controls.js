import { CONFIG } from './config.js';

// Wheel delta is normalized across mouse wheels and high-resolution trackpads.
export const IMAGE_CONTROL_CONFIG=Object.freeze({wheelSensitivity:.0025,linePixels:16,maximumWheelDelta:240,minimumDragPixels:3});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export class ImageControls {
  constructor({getZoom,zoomTo,schedule=action=>window.requestAnimationFrame(action),cancel=frame=>window.cancelAnimationFrame(frame)}) {
    Object.assign(this,{getZoom,zoomTo,schedule,cancel});this.listeners=[];this.frame=null;this.wheelDelta=0;
  }
  attach(stage) {
    this.detach();if(!stage?.addEventListener)return;this.stage=stage;
    const listen=(type,callback,options)=>{stage.addEventListener(type,callback,options);this.listeners.push([type,callback,options]);};
    listen('wheel',event=>this.wheel(event),{passive:false});
    listen('pointerdown',event=>this.down(event));listen('pointermove',event=>this.move(event));
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,event=>{if(this.drag?.id===event.pointerId)this.endDrag();});
    listen('dragstart',event=>event.preventDefault());
  }
  wheel(event) {
    // Browser pinch/page zoom and horizontal trackpad panning stay native.
    if(event.ctrlKey||event.metaKey||!Number.isFinite(event.deltaY)||!event.deltaY||Math.abs(event.deltaX||0)>Math.abs(event.deltaY))return;
    const scale=event.deltaMode===1?IMAGE_CONTROL_CONFIG.linePixels:event.deltaMode===2?this.stage.clientHeight:1;
    event.preventDefault();this.endDrag();this.pointer={x:event.clientX,y:event.clientY};
    this.wheelDelta=clamp(this.wheelDelta+event.deltaY*scale,-IMAGE_CONTROL_CONFIG.maximumWheelDelta,IMAGE_CONTROL_CONFIG.maximumWheelDelta);
    if(this.frame!==null)return;
    this.frame=this.schedule(()=>{
      this.frame=null;const delta=this.wheelDelta;this.wheelDelta=0;if(!this.stage?.isConnected)return;
      const zoom=clamp(this.getZoom()*Math.exp(-delta*IMAGE_CONTROL_CONFIG.wheelSensitivity),1,CONFIG.viewerMaxZoom);this.zoomTo(zoom,this.pointer);
    });
  }
  down(event) {
    if(event.button!==0||event.isPrimary===false||event.pointerType==='touch'||this.getZoom()<=1)return;
    if(event.target?.closest?.('button,a,input,textarea,video,audio'))return;
    const stage=this.stage,maxX=Math.max(0,stage.scrollWidth-stage.clientWidth),maxY=Math.max(0,stage.scrollHeight-stage.clientHeight);
    if(!maxX&&!maxY)return;
    event.preventDefault();this.drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:stage.scrollLeft,top:stage.scrollTop,maxX,maxY};
    stage.classList.add('is-dragging');try{stage.setPointerCapture(event.pointerId);}catch{/* Pointer capture is optional on older engines. */}
  }
  move(event) {
    const drag=this.drag;if(!drag||drag.id!==event.pointerId)return;event.preventDefault();
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<IMAGE_CONTROL_CONFIG.minimumDragPixels)return;
    drag.moved=true;this.stage.scrollLeft=clamp(drag.left-dx,0,drag.maxX);this.stage.scrollTop=clamp(drag.top-dy,0,drag.maxY);
  }
  endDrag() {
    const drag=this.drag;this.drag=null;this.stage?.classList.remove('is-dragging');
    if(drag)try{this.stage?.releasePointerCapture(drag.id);}catch{/* The browser may already have released capture. */}
  }
  reset() {this.endDrag();if(this.frame!==null)this.cancel(this.frame);this.frame=null;this.wheelDelta=0;}
  detach() {this.reset();for(const args of this.listeners)this.stage?.removeEventListener(...args);this.listeners=[];this.stage=null;}
}
