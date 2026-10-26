import { EMOJI_GROUPS } from './chat-tools.js';
import { escape } from './ui.js';

export const EMOJI_CATEGORIES = Object.keys(EMOJI_GROUPS);
export function emojiGrid(category, action, messageId = '') {
  return (EMOJI_GROUPS[category] || EMOJI_GROUPS.Faces).split(' ').map(emoji => `<button type="button" data-action="${action}" data-id="${escape(messageId)}" data-emoji="${escape(emoji)}" aria-label="${escape(emoji)}">${emoji}</button>`).join('');
}
export function emojiPicker(action, messageId = '') {
  return `<section class="emoji-picker" aria-label="Emoji picker" data-emoji-action="${action}" data-message-id="${escape(messageId)}"><div class="picker-heading"><strong>Emoji</strong><button class="icon-button" data-action="close-picker" aria-label="Close emoji picker">×</button></div><div class="emoji-tabs" role="tablist" aria-label="Emoji categories">${EMOJI_CATEGORIES.map((category, index) => `<button type="button" role="tab" id="emoji-tab-${category}" aria-controls="emoji-category-grid" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-action="emoji-category" data-category="${category}">${category}</button>`).join('')}</div><div class="emoji-grid" id="emoji-category-grid" role="group" aria-labelledby="emoji-tab-Faces">${emojiGrid('Faces', action, messageId)}</div></section>`;
}

// API keys for the GIPHY web API are browser-visible. Restrict the production
// key to the deployment's domains in the provider dashboard.
export async function searchGiphy({ key, query = '', offset = 0, signal, fetcher = fetch }) {
  const url = new URL(`https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}`);
  const limit = 24;
  url.search = new URLSearchParams({ api_key: key, limit: String(limit), offset: String(offset), rating: 'pg', ...(query ? { q: query.slice(0, 50), lang: 'en' } : {}) });
  const response = await fetcher(url.href, { credentials: 'omit', signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!response.ok) throw new Error(response.status === 429 ? 'GIF search is busy. Please try again shortly.' : 'GIF search is unavailable. Please try again.');
  const result = await response.json();
  const gifs = (Array.isArray(result.data) ? result.data : []).map(gif => ({
    id: `giphy:${gif.id}`, provider: 'giphy', providerId: String(gif.id), title: String(gif.title || 'GIF'),
    url: gif.images?.fixed_height?.url || gif.images?.original?.url,
    preview: gif.images?.fixed_width_small?.url || gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url,
  })).filter(gif => gif.url && gif.preview);
  const next = offset + (result.pagination?.count ?? gifs.length);
  return { gifs, nextOffset: next, hasMore: next < Math.min(499, result.pagination?.total_count ?? next) };
}
