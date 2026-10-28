// One viewport owner for keyboard animation, browser chrome and orientation.
// Focus may disappear before the keyboard closes; geometry must not depend on it.
export const VIEWPORT_CONFIG = Object.freeze({ scaleTolerance: 0.02, minDimension: 1, rootScrollTolerance: 1 });
const positive = value => Number.isFinite(value) && value >= VIEWPORT_CONFIG.minDimension;
const pixels = value => `${Math.round(value * 100) / 100}px`;

export function viewportFrame({ layoutHeight, visual, previous } = {}) {
  const layout = positive(layoutHeight) ? layoutHeight : null;
  if (visual && !positive(visual.height) && previous) return previous;
  // Some engines dispatch layout/visual resize events in different frames.
  // Never expand the app beyond the smaller valid viewport during that gap.
  const height = positive(visual?.height) ? layout ? Math.min(visual.height, layout) : visual.height : layout;
  if (!height) return previous || { height: '100dvh', top: '0px', visualHeight: '100dvh' };
  const scale = Number.isFinite(visual?.scale) ? visual.scale : 1;
  // Do not reflow a zoomed page to the smaller magnified viewport.
  const zoomed = Math.abs(scale - 1) > VIEWPORT_CONFIG.scaleTolerance;
  const rawTop = Number.isFinite(visual?.offsetTop) ? Math.max(0, visual.offsetTop) : 0;
  const top = zoomed ? 0 : Math.min(rawTop, layout ? Math.max(0, layout - height) : rawTop);
  return { height: zoomed ? '100dvh' : pixels(height), top: pixels(top), visualHeight: pixels(height) };
}

export class ViewportLayout {
  constructor({ window: win = window, document: doc = win.document, onLayout = () => {} } = {}) {
    this.win = win; this.doc = doc; this.onLayout = onLayout; this.pending = null; this.last = null;
    this.controller = new win.AbortController(); const signal = this.controller.signal;
    const schedule = () => this.schedule();
    for (const event of ['resize', 'scroll', 'orientationchange', 'pageshow']) win.addEventListener(event, schedule, { passive: true, signal });
    for (const event of ['resize', 'scroll']) win.visualViewport?.addEventListener(event, schedule, { passive: true, signal });
    for (const event of ['focusin', 'focusout']) doc.addEventListener(event, schedule, { signal });
    this.sync();
  }
  schedule() {
    if (this.pending !== null) return;
    this.pending = this.win.requestAnimationFrame(() => { this.pending = null; this.sync(); });
  }
  sync() {
    // Safari can scroll the document itself to a focused editor even though
    // Nexus owns fixed geometry and all content scrolls in inner panels.
    // Repair only that root displacement; pinch zoom and panel scrolling remain native.
    const scale = this.win.visualViewport?.scale || 1, root = this.doc.scrollingElement;
    if (Math.abs(scale - 1) <= VIEWPORT_CONFIG.scaleTolerance && [this.win.scrollX,this.win.scrollY,root?.scrollTop,root?.scrollLeft].some(value => Math.abs(value || 0) > VIEWPORT_CONFIG.rootScrollTolerance)) {
      this.win.scrollTo?.(0,0);
      if (root) { root.scrollTop = 0; root.scrollLeft = 0; }
    }
    const frame = viewportFrame({ layoutHeight: this.win.innerHeight, visual: this.win.visualViewport, previous: this.last });
    let changed = false;
    for (const [name, value] of [['--visual-height', frame.visualHeight], ['--visual-top', frame.top], ['--viewport-height', frame.height]]) {
      if (this.doc.documentElement.style.getPropertyValue(name) === value) continue;
      this.doc.documentElement.style.setProperty(name, value); changed = true;
    }
    this.last = frame;
    if (changed) this.onLayout(frame);
  }
  destroy() { this.controller.abort(); if (this.pending !== null) this.win.cancelAnimationFrame(this.pending); this.pending = null; }
}
