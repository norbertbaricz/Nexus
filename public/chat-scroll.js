import { CONFIG } from './config.js';

export function showLatest({ following, history, loading, distance, unread = 0, scrollable = true }) {
  return !loading && (history || scrollable && !following && (distance >= CONFIG.jumpLatestDistance || unread > 0 && distance > CONFIG.followBottomDistance));
}
// Clicking a message is not a request to leave live-follow; actual scrolling is.
export class ChatScroll {
  constructor({getFollow,setFollow,getHistory,motion,onChange}) {Object.assign(this,{getFollow,setFollow,getHistory,motion,onChange});this.node=null;this.mode='follow';this.frame=0;this.anchor=null;this.intentUntil=0;}
  bind(node) {
    this.controller?.abort();this.observer?.disconnect();this.cancel();this.node=node;this.anchor=null;this.intentUntil=0;this.mode=this.getFollow()?'follow':'history';if(!node)return;
    this.controller=new AbortController();const options={passive:true,signal:this.controller.signal};
    for(const event of ['wheel','touchstart','pointerdown'])node.addEventListener(event,()=>this.userIntent(),options);
    node.addEventListener('keydown',event=>{if(['PageUp','PageDown','Home','End','ArrowUp','ArrowDown',' '].includes(event.key))this.userIntent();},{signal:this.controller.signal});
    node.addEventListener('scroll',()=>{
      if(this.frame)return;
      if(performance.now()<this.intentUntil){const bottom=this.distance()<=CONFIG.followBottomDistance&&!this.getHistory();this.setFollow(bottom);this.mode=bottom?'follow':'history';this.onChange();}
    },options);
    if(typeof ResizeObserver!=='undefined') {this.observer=new ResizeObserver(()=>this.resize());for(const item of [node,node.querySelector('#message-list'),document.querySelector('.composer-area')])if(item)this.observer.observe(item);}
  }
  distance(){return this.node?Math.max(0,this.node.scrollHeight-this.node.clientHeight-this.node.scrollTop):0;}
  cancel(){if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  history(){this.cancel();this.mode='history';this.intentUntil=0;this.anchor=null;this.setFollow(false);this.onChange();}
  userIntent(){const animating=Boolean(this.frame);this.cancel();this.anchor=null;this.intentUntil=performance.now()+CONFIG.scrollIntentMs;if(animating){this.setFollow(false);this.mode='history';this.onChange();}}
  bottom({smooth=false}={}) {
    if(!this.node)return;if(this.mode==='latest'&&this.frame)return;
    this.anchor=null;this.setFollow(true);this.onChange();
    if(smooth&&this.motion())this.animate('latest');else {this.cancel();this.mode='follow';this.node.scrollTop=this.node.scrollHeight;}
  }
  jump(target) {if(!this.node||!target)return;this.history();this.anchor=target;if(this.motion())this.animate('anchor');else this.node.scrollTop=this.anchorTop();}
  anchorTop(){const scroller=this.node.getBoundingClientRect(),target=this.anchor.getBoundingClientRect();return Math.max(0,Math.min(this.node.scrollHeight-this.node.clientHeight,this.node.scrollTop+target.top-scroller.top-(this.node.clientHeight-target.height)/2));}
  animate(mode) {
    this.cancel();this.mode=mode;const start=performance.now(),from=this.node.scrollTop,node=this.node;
    const step=time=>{
      if(node!==this.node||!node.isConnected){this.frame=0;return;}
      const target=mode==='latest'?node.scrollHeight-node.clientHeight:this.anchor?.isConnected?this.anchorTop():from;
      const progress=Math.min(1,(time-start)/CONFIG.scrollAnimationMs),eased=1-(1-progress)**3;
      node.scrollTop=from+(target-from)*eased;
      if(progress<1)this.frame=requestAnimationFrame(step);else {this.frame=0;this.mode=mode==='latest'?'follow':'history';this.onChange();}
    };
    this.frame=requestAnimationFrame(step);
  }
  resize(){if(this.frame)return;if(this.getFollow())this.bottom();else if(this.anchor?.isConnected)this.node.scrollTop=this.anchorTop();}
}
