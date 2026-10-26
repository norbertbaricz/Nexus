import { CONFIG } from './config.js';

export function swipeDirection(dx,dy,distance) {
  if(Math.abs(dx)>=distance&&Math.abs(dx)>Math.abs(dy)*CONFIG.gestureAxisRatio)return dx>0?'right':'left';
  if(Math.abs(dy)>=distance&&Math.abs(dy)>Math.abs(dx)*CONFIG.gestureAxisRatio)return dy>0?'down':'up';
  return null;
}
// Vertical scrolling and text selection stay native; horizontal message swipes reply.
export function installGestures({enabled,dismissToast,closeModal,closePopover,viewerNavigate,viewerReady,hasConversation,openMembers,canReply,reply,messageOptions}) {
  let start=null,hold=0,suppress=null;
  const reset=()=>{clearTimeout(hold);if(start?.kind==='message'){start.node.style.removeProperty('--swipe-x');start.node.classList.remove('swiping');}start=null;};
  document.addEventListener('pointerdown',event=>{
    reset();if(!enabled()||event.pointerType!=='touch'&&event.pointerType!=='pen'||event.isPrimary===false)return;
    const target=event.target,toast=target.closest('.toast'),handle=target.closest('.modal-drag-handle'),viewer=target.closest('.viewer-stage'),app=document.querySelector('#app'),message=target.closest('.message[data-message]');
    if(toast&&!target.closest('button'))start={kind:'toast',node:toast};
    else if(handle)start={kind:'modal',node:handle};
    else if(viewer&&viewerReady()&&!target.closest('button,video,audio'))start={kind:'viewer',node:viewer};
    else if(message&&!target.closest('button,a,input,textarea,select,video,audio')&&!document.querySelector('#modal-root .modal')&&document.getSelection()?.isCollapsed!==false){
      start={kind:'message',node:message,messageId:message.dataset.message};const current=start;
      hold=setTimeout(()=>{if(start!==current)return;suppress={node:message,until:Date.now()+CONFIG.messageHoldMs};messageOptions?.(current.messageId);reset();},CONFIG.messageHoldMs);
    } else if(window.innerWidth<=CONFIG.mobileBreakpoint&&!document.querySelector('#modal-root .modal')&&!target.closest('input,textarea,button,a,select,[contenteditable=true]')) {
      const left=app.classList.contains('sidebar-open'),right=app.classList.contains('show-members');
      if(left&&target.closest('#sidebar'))start={kind:'left-close',node:app};
      else if(right&&target.closest('#members'))start={kind:'right-close',node:app};
      else if(event.clientX<=CONFIG.gestureEdgeWidth)start={kind:'left-open',node:app};
      else if(window.innerWidth-event.clientX<=CONFIG.gestureEdgeWidth&&hasConversation())start={kind:'right-open',node:app};
    }
    if(start)Object.assign(start,{id:event.pointerId,x:event.clientX,y:event.clientY});
  },{passive:true});
  document.addEventListener('pointermove',event=>{
    if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.hypot(dx,dy)>CONFIG.gestureCancelDistance)clearTimeout(hold);
    if(start.kind==='message'&&Math.abs(dx)>CONFIG.gestureCancelDistance&&Math.abs(dx)>Math.abs(dy)*CONFIG.gestureAxisRatio){event.preventDefault();start.node.classList.add('swiping');start.node.style.setProperty('--swipe-x',`${Math.max(-CONFIG.gesturePreviewDistance,Math.min(CONFIG.gesturePreviewDistance,dx))}px`);}
  },{passive:false});
  document.addEventListener('pointerup',event=>{
    const current=start;if(!current||current.id!==event.pointerId){reset();return;}
    const threshold=current.kind==='toast'?CONFIG.toastSwipeDistance:current.kind==='modal'?CONFIG.modalSwipeDistance:current.kind==='message'?CONFIG.replySwipeDistance:CONFIG.drawerSwipeDistance;
    const direction=swipeDirection(event.clientX-current.x,event.clientY-current.y,threshold);reset();
    if(current.kind==='message'&&['left','right'].includes(direction)){suppress={node:current.node,until:Date.now()+CONFIG.gestureClickSuppressMs};if(direction==='right'&&canReply?.())reply?.(current.messageId);else messageOptions?.(current.messageId);}
    else if(current.kind==='toast'&&['left','right'].includes(direction))dismissToast(current.node);
    else if(current.kind==='modal'&&direction==='down')closeModal();
    else if(current.kind==='viewer'&&['left','right'].includes(direction))viewerNavigate(direction==='left'?1:-1);
    else if(current.kind==='left-open'&&direction==='right'){closePopover();current.node.classList.add('sidebar-open');}
    else if(current.kind==='left-close'&&direction==='left')current.node.classList.remove('sidebar-open');
    else if(current.kind==='right-open'&&direction==='left'){closePopover();openMembers();}
    else if(current.kind==='right-close'&&direction==='right')current.node.classList.remove('show-members');
  },{passive:true});
  document.addEventListener('pointercancel',reset,{passive:true});
  for(const type of ['click','contextmenu'])document.addEventListener(type,event=>{if(suppress&&Date.now()<suppress.until&&suppress.node.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
}
