import { CONFIG } from './config.js';

// Delegation includes status avatars and existing descriptive title attributes.
const TARGETS = '[data-tooltip],button[aria-label],a[aria-label],[title]';
const TOOLTIP_ID = 'nexus-tooltip';
export function tooltipPosition(anchor, size, viewport) {
  const inset = CONFIG.tooltipSafeInset, above = anchor.top - size.height - CONFIG.tooltipGap;
  return {
    left: Math.max(inset, Math.min(anchor.left + (anchor.width - size.width) / 2, viewport.width - size.width - inset)),
    top: Math.max(inset, Math.min(above >= inset ? above : anchor.bottom + CONFIG.tooltipGap, viewport.height - size.height - inset)),
  };
}
export class Tooltips {
  constructor(root = document) {
    this.root = root; this.anchor = null; this.timer = null; this.originalTitle = null;
    this.node = root.createElement('div'); this.node.id = TOOLTIP_ID; this.node.className = 'nexus-tooltip';
    this.node.style.maxWidth = `min(${CONFIG.tooltipMaxWidth}px,calc(100vw - ${CONFIG.tooltipSafeInset * 2}px))`;
    this.node.setAttribute('role', 'tooltip'); this.node.hidden = true; root.body.append(this.node);
    root.addEventListener('pointerover', event => { if (event.pointerType !== 'touch') this.open(event.target, false); });
    root.addEventListener('pointerout', event => { if (this.anchor && !this.anchor.contains(event.relatedTarget)) this.hide(); });
    root.addEventListener('focusin', event => this.open(event.target, true));
    root.addEventListener('focusout', () => this.hide());
    root.addEventListener('pointerdown', () => this.hide(), true);
    root.addEventListener('keydown', event => { if (event.key === 'Escape') this.hide(); }, true);
    root.addEventListener('scroll', () => this.hide(), true);
    globalThis.addEventListener('resize', () => this.hide());
    this.observer = new MutationObserver(() => { if (this.anchor && !this.anchor.isConnected) this.hide(); });
    this.observer.observe(root.body, { childList: true, subtree: true });
    this.anchorObserver = new MutationObserver(() => this.refresh());
  }
  label() { return this.anchor?.dataset.tooltip || this.anchor?.getAttribute('aria-label') || this.anchor?.getAttribute('title') || this.originalTitle || ''; }
  open(target, immediate) {
    const anchor = target.closest?.(TARGETS);
    if (!anchor || anchor.closest('[inert]') || anchor.disabled || anchor === this.anchor) return;
    this.hide(); this.anchor = anchor; this.originalTitle = anchor.getAttribute('title');
    if (!this.label()) { this.anchor = null; this.originalTitle = null; return; }
    anchor.removeAttribute('title');
    this.anchorObserver.observe(anchor, { attributes: true, attributeFilter: ['data-tooltip', 'aria-label', 'title'] });
    this.timer = setTimeout(() => this.show(), immediate ? 0 : CONFIG.tooltipDelayMs);
  }
  refresh() {
    if (!this.anchor?.isConnected) { this.hide(); return; }
    const title = this.anchor.getAttribute('title');
    if (title !== null) { this.originalTitle = title; this.anchor.removeAttribute('title'); }
    if (!this.node.hidden) this.show();
  }
  show() {
    if (!this.anchor?.isConnected) { this.hide(); return; }
    const label = this.label(); if (!label) { this.hide(); return; }
    this.node.textContent = label; this.node.hidden = false;
    const viewport = globalThis.visualViewport, origin = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0 };
    const rect = this.anchor.getBoundingClientRect(), size = this.node.getBoundingClientRect();
    const position = tooltipPosition({ left: rect.left - origin.left, top: rect.top - origin.top, bottom: rect.bottom - origin.top, width: rect.width }, size, { width: viewport?.width || globalThis.innerWidth, height: viewport?.height || globalThis.innerHeight });
    this.node.style.left = `${position.left + origin.left}px`; this.node.style.top = `${position.top + origin.top}px`;
    const describedBy = (this.anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    this.anchor.setAttribute('aria-describedby', [...new Set([...describedBy, TOOLTIP_ID])].join(' '));
  }
  hide() {
    clearTimeout(this.timer); this.anchorObserver?.disconnect(); this.node.hidden = true;
    if (this.anchor) {
      const describedBy = (this.anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== TOOLTIP_ID);
      if (describedBy.length) this.anchor.setAttribute('aria-describedby', describedBy.join(' ')); else this.anchor.removeAttribute('aria-describedby');
      if (this.originalTitle !== null && !this.anchor.hasAttribute('title')) this.anchor.setAttribute('title', this.originalTitle);
    }
    this.anchor = null; this.originalTitle = null;
  }
}
