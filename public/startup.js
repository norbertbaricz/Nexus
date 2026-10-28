// A single opaque cover shields first hydration; returning to a tab never remounts it.
export const STARTUP_CONFIG = Object.freeze({ fontWaitMs: 900, imageWaitMs: 650, imageLimit: 12, fadeMs: 140, layoutFrames: 2 });
export async function finishStartup({ document: doc = document, window: win = window } = {}) {
  const cover = doc.querySelector('#startup-screen');
  if (!cover || cover.dataset.finishing) return;
  cover.dataset.finishing = 'true';
  let timer;
  try { await Promise.race([Promise.resolve(doc.fonts?.ready).catch(() => {}), new Promise(resolve => { timer = win.setTimeout(resolve, STARTUP_CONFIG.fontWaitMs); })]); }
  finally { win.clearTimeout(timer); }
  const images = [...(doc.querySelectorAll?.('.chat-header img,.user-bar img,.sidebar .server-avatar img,.workspace-nav img') || [])].slice(0, STARTUP_CONFIG.imageLimit);
  if (images.length) {
    const ready = Promise.allSettled(images.map(image => { image.loading = 'eager'; return Promise.resolve().then(() => image.decode?.()); }));
    try { await Promise.race([ready, new Promise(resolve => { timer = win.setTimeout(resolve, STARTUP_CONFIG.imageWaitMs); })]); }
    finally { win.clearTimeout(timer); }
  }
  for (let index = 0; index < STARTUP_CONFIG.layoutFrames; index++) await new Promise(resolve => win.requestAnimationFrame(resolve));
  doc.documentElement.removeAttribute('data-starting');
  cover.setAttribute('aria-hidden', 'true'); cover.classList.add('is-ready');
  win.setTimeout(() => cover.remove(), STARTUP_CONFIG.fadeMs);
}
