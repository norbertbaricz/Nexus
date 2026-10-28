import { CONFIG } from './config.js';

export function swipeDirection(dx, dy, distance) {
  if (Math.abs(dx) >= distance && Math.abs(dx) > Math.abs(dy) * CONFIG.gestureAxisRatio) return dx > 0 ? 'right' : 'left';
  if (Math.abs(dy) >= distance && Math.abs(dy) > Math.abs(dx) * CONFIG.gestureAxisRatio) return dy > 0 ? 'down' : 'up';
  return null;
}

// Native vertical scrolling/pinch zoom remain available. A completed custom
// swipe suppresses its following click so it cannot also open the touched item.
export function installGestures({ enabled, dismissToast, closeModal, closePopover, viewerNavigate, viewerReady, hasConversation, openMembers, canReply, reply, messageOptions, userOptions, contextTarget, contextOptions, window: win = window, document: doc = win.document }) {
  let start = null, hold = null, suppress = null;
  const controller = new win.AbortController(), signal = controller.signal;
  const clearHold = () => { if (hold !== null) win.clearTimeout(hold); hold = null; };
  const reset = () => {
    clearHold();
    if (start?.kind === 'message') { start.node.style.removeProperty('--swipe-x'); start.node.classList.remove('swiping'); }
    start = null;
  };
  const cancel = () => { if(suppress?.awaitingRelease){suppress.awaitingRelease=false;suppress.until=Date.now()+CONFIG.gestureClickSuppressMs;}reset(); };
  const consumed = node => { suppress = { node, until: Date.now() + CONFIG.gestureClickSuppressMs }; };
  const drawerAt = (target, x) => {
    const app = doc.querySelector('#app');
    if (!app || win.innerWidth > CONFIG.mobileBreakpoint || doc.querySelector('#modal-root .modal') || target.closest('input,textarea,select,[contenteditable=true],video,audio')) return null;
    if (app.classList.contains('sidebar-open') && target.closest('#sidebar')) return { direction: 'left', action: () => app.classList.remove('sidebar-open') };
    if (app.classList.contains('show-members') && target.closest('#members')) return { direction: 'right', action: () => app.classList.remove('show-members') };
    if (x <= CONFIG.gestureEdgeWidth) return { direction: 'right', action: () => { closePopover(); app.classList.add('sidebar-open'); } };
    if (win.innerWidth - x <= CONFIG.gestureEdgeWidth && hasConversation()) return { direction: 'left', action: () => { closePopover(); openMembers(); } };
    return null;
  };
  const openHold = current => {
    if (start !== current || current.cancelled || !enabled()) return;
    consumed(current.node);
    suppress.pointerId = current.id; suppress.awaitingRelease = true;
    if (current.kind === 'context') contextOptions?.(current.context);
    else if (current.kind === 'person') userOptions?.(current.userId, current.node);
    else if (current.kind === 'message') messageOptions?.(current.messageId);
    reset();
  };
  const down = event => {
    reset();
    if (!enabled() || !['touch','pen'].includes(event.pointerType) || event.isPrimary === false) return;
    const target = event.target;
    if (!target?.closest || target.closest('input,textarea,select,[contenteditable=true],video,audio')) return;
    const toast = target.closest('.toast'), handle = target.closest('.modal-drag-handle'), viewer = target.closest('.viewer-stage');
    const message = target.closest('.message[data-message]'), context = contextTarget?.(target), drawer = drawerAt(target, event.clientX);
    if (toast && !target.closest('button')) start = { kind: 'toast', node: toast };
    else if (handle) start = { kind: 'modal', node: handle };
    else if (viewer && viewerReady() && !target.closest('button')) start = { kind: 'viewer', node: viewer };
    else if (contextOptions && context && (context.kind !== 'message' || !message)) start = { kind: 'context', node: context.node, context };
    else if (userOptions && target.closest('.voice-tile[data-user-id], [data-action=profile][data-id]')) {
      const node = target.closest('.voice-tile[data-user-id], [data-action=profile][data-id]');
      start = { kind: 'person', node, userId: node.dataset.userId || node.dataset.id };
    } else if (message && !target.closest('button,a') && !doc.querySelector('#modal-root .modal') && doc.getSelection()?.isCollapsed !== false) start = { kind: 'message', node: message, messageId: message.dataset.message };
    else if (contextOptions && context) start = { kind: 'context', node: context.node, context };
    else if (drawer) start = { kind: 'drawer', node: doc.querySelector('#app') };
    if (!start) return;
    Object.assign(start, { id: event.pointerId, x: event.clientX, y: event.clientY, drawer: ['message','context','person','drawer'].includes(start.kind) ? drawer : null });
    if (['message','context','person'].includes(start.kind)) { const current = start; hold = win.setTimeout(() => openHold(current), CONFIG.messageHoldMs); }
  };
  const move = event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > CONFIG.gestureCancelDistance) clearHold();
    if (currentVerticalScroll(start.kind, dx, dy)) { start.cancelled = true; return; }
    if (start.cancelled || Math.abs(dx) <= CONFIG.gestureCancelDistance || Math.abs(dx) <= Math.abs(dy) * CONFIG.gestureAxisRatio) return;
    if (start.kind === 'message' || start.kind === 'toast' || start.kind === 'viewer' || start.drawer) {
      if (event.cancelable) event.preventDefault();
      try { start.node.setPointerCapture?.(event.pointerId); } catch { /* Optional on older touch engines. */ }
      if (start.kind === 'message' && !start.drawer) { start.node.classList.add('swiping'); start.node.style.setProperty('--swipe-x', `${Math.max(-CONFIG.gesturePreviewDistance, Math.min(CONFIG.gesturePreviewDistance, dx))}px`); }
    }
  };
  const up = event => {
    if (suppress?.awaitingRelease && suppress.pointerId === event.pointerId) { suppress.awaitingRelease = false; suppress.until = Date.now() + CONFIG.gestureClickSuppressMs; }
    const current = start;
    if (!current || current.id !== event.pointerId) { reset(); return; }
    const threshold = current.kind === 'toast' ? CONFIG.toastSwipeDistance : current.kind === 'modal' ? CONFIG.modalSwipeDistance : current.kind === 'message' ? CONFIG.replySwipeDistance : CONFIG.drawerSwipeDistance;
    const dx = event.clientX - current.x, dy = event.clientY - current.y, direction = swipeDirection(dx, dy, threshold);
    reset();
    if (!enabled() || current.cancelled) return;
    if (current.drawer && swipeDirection(dx, dy, CONFIG.drawerSwipeDistance) === current.drawer.direction) { consumed(current.node); current.drawer.action(); }
    else if (current.kind === 'message' && ['left','right'].includes(direction)) { consumed(current.node); if (direction === 'right' && canReply?.()) reply?.(current.messageId); else messageOptions?.(current.messageId); }
    else if (current.kind === 'toast' && ['left','right'].includes(direction)) { consumed(current.node); dismissToast(current.node); }
    else if (current.kind === 'modal' && direction === 'down') { consumed(current.node); closeModal(); }
    else if (current.kind === 'viewer' && ['left','right'].includes(direction)) { consumed(current.node); viewerNavigate(direction === 'left' ? 1 : -1); }
  };
  if (win.PointerEvent) {
    doc.addEventListener('pointerdown', down, { passive: true, signal });
    doc.addEventListener('pointermove', move, { passive: false, signal });
    doc.addEventListener('pointerup', up, { passive: true, signal });
    doc.addEventListener('pointercancel', cancel, { passive: true, signal });
  } else {
    const touch = handler => event => {
      const point = event.changedTouches?.[0]; if (!point) { reset(); return; }
      handler({ target: event.target, pointerId: point.identifier, pointerType: 'touch', isPrimary: event.touches.length <= 1, clientX: point.clientX, clientY: point.clientY, cancelable: event.cancelable, preventDefault: () => event.preventDefault() });
    };
    doc.addEventListener('touchstart', touch(down), { passive: true, signal });
    doc.addEventListener('touchmove', touch(move), { passive: false, signal });
    doc.addEventListener('touchend', touch(up), { passive: true, signal });
    doc.addEventListener('touchcancel', cancel, { passive: true, signal });
  }
  doc.addEventListener('visibilitychange', () => { if(doc.hidden)cancel(); }, { signal });
  for (const type of ['click','contextmenu']) doc.addEventListener(type, event => {
    if (suppress && (suppress.awaitingRelease || Date.now() < suppress.until) && suppress.node.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    else if (type === 'contextmenu' && start && !start.cancelled && ['person','context','message'].includes(start.kind)) { event.preventDefault(); event.stopImmediatePropagation(); openHold(start); }
  }, { capture: true, signal });
  return () => { cancel(); controller.abort(); };
}

function currentVerticalScroll(kind, dx, dy) { return kind !== 'modal' && Math.abs(dy) > CONFIG.gestureCancelDistance && Math.abs(dy) > Math.abs(dx) * CONFIG.gestureAxisRatio; }
