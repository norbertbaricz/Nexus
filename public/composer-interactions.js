import { icon } from './icons.js';

// These actions do not require leaving an active message editor.
export const COMPOSER_INTERACTION_CONFIG = Object.freeze({
  editors: '#message-input,#gif-search,#emoji-search',
  picker: '#popover-root .attachment-menu,#popover-root .emoji-picker,#popover-root .gif-picker',
  retainFocus: '#composer button[type="submit"],#composer [data-action="attach"],#composer [data-action="gif"],#composer [data-action="emoji"],#composer [data-action="remove-attachment"],#composer [data-action="toggle-attachment-spoiler"],#composer [data-action="cancel-reply"],#popover-root .attachment-menu button,#popover-root .emoji-picker button,#popover-root .gif-picker button',
});

// Picker choices stay explicit; capture is requested only by a camera action.
export const ATTACHMENT_CHOICES = Object.freeze({
  gallery: { label: 'Gallery', description: 'Photos and videos', icon: 'image', accept: 'image/*,video/*', multiple: true },
  photo: { label: 'Take a photo', description: 'Use your camera', icon: 'camera', accept: 'image/*', capture: 'environment', multiple: false },
  video: { label: 'Record a video', description: 'Use your camera', icon: 'video', accept: 'video/*', capture: 'environment', multiple: false },
  audio: { label: 'Audio', description: 'Choose an audio file', icon: 'music', accept: 'audio/*', multiple: true },
  files: { label: 'Files', description: 'Documents and other files', icon: 'folder', accept: '', multiple: true },
});

export function attachmentMenuMarkup({ camera = false } = {}) {
  return `<section class="attachment-menu" aria-label="Add an attachment"><div class="picker-heading"><strong>Add an attachment</strong><button type="button" class="icon-button" data-action="close-picker" aria-label="Close attachment menu">${icon('close')}</button></div>${Object.entries(ATTACHMENT_CHOICES).filter(([key]) => camera || !['photo','video'].includes(key)).map(([key, value]) => `<button type="button" class="attachment-choice" data-action="attachment-source" data-source="${key}">${icon(value.icon, 22)}<span><strong>${value.label}</strong><small>${value.description}</small></span>${icon('chevron', 16)}</button>`).join('')}</section>`;
}

export function chooseAttachment(input, source) {
  const choice = ATTACHMENT_CHOICES[source];
  if (!input || !choice) return false;
  input.value = ''; input.accept = choice.accept; input.multiple = choice.multiple;
  input.removeAttribute('capture');
  if (choice.capture) input.setAttribute('capture', choice.capture);
  // Keep this synchronous inside the member's click, as required by mobile pickers.
  input.click(); return true;
}

export function installComposerInteractions({ document: doc = document } = {}) {
  const retainFocus = event => {
    if (event.isPrimary === false || event.button > 0) return;
    const button = event.target.closest?.(COMPOSER_INTERACTION_CONFIG.retainFocus), editor = doc.activeElement;
    if (!button || button.disabled || !editor?.matches?.(COMPOSER_INTERACTION_CONFIG.editors) || editor.disabled) return;
    const picker = button.closest(COMPOSER_INTERACTION_CONFIG.picker);
    if (!button.closest('#composer')?.contains(editor) && !(picker && (editor.id === 'message-input' || picker.contains(editor)))) return;
    // Buttons keep the current text keyboard; selecting a search input still
    // transfers focus normally. Scrolling and native picker clicks stay intact.
    if (event.cancelable) event.preventDefault();
  };
  doc.addEventListener('pointerdown', retainFocus, { capture: true, passive: false });
  doc.addEventListener('mousedown', retainFocus, { capture: true, passive: false });
  return () => { doc.removeEventListener('pointerdown', retainFocus, true); doc.removeEventListener('mousedown', retainFocus, true); };
}
