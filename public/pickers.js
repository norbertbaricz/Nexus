import { EMOJI_GROUPS } from './chat-tools.js';
import { EMOJI_LABELS } from './emoji-labels.js';
import { escape } from './ui.js';
import { giphyIdentity, trustedStill } from './animated-media.js';

const GIPHY_CONFIG = Object.freeze({ pageSize: 24, maxOffset: 499, lookupTimeoutMs: 6000 });
export const EMOJI_SEARCH_CONFIG = Object.freeze({ maxQueryLength:80, maxResults:96 });
const EMOJI_ALIASES = Object.freeze({ '❤️':'love inima dragoste', '🔥':'fire flame foc', '😂':'laugh lol happy ras', '😭':'cry sad plans', '👍':'thumbs up like yes ok', '👎':'thumbs down dislike no', '🎉':'party celebration petrecere', '🐺':'wolf lup', '🐶':'dog caine', '🐱':'cat pisica', '🙏':'pray thanks multumesc', '💻':'computer laptop pc', '🎮':'game gaming joc', '🧡':'orange heart love', '💛':'yellow heart love', '💚':'green heart love', '💙':'blue heart love', '💜':'purple heart love', '🖤':'black heart love', '🤍':'white heart love', '🤎':'brown heart love' });
const normalizeEmojiQuery = value => String(value || '').slice(0,EMOJI_SEARCH_CONFIG.maxQueryLength).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[:_]+/g,' ').trim();
let emojiCatalog;
function catalog() {
  // Build once on first use; initial page rendering never creates a full emoji grid.
  return emojiCatalog ||= [...new Map(Object.entries(EMOJI_GROUPS).flatMap(([category,value])=>value.split(' ').map(emoji=>[emoji,{emoji,category,label:EMOJI_LABELS[emoji] || category,terms:normalizeEmojiQuery(`${emoji} ${EMOJI_LABELS[emoji] || ''} ${category} ${EMOJI_ALIASES[emoji] || ''}`)}]))).values()];
}
export function searchEmoji(query, category = 'Faces') {
  const normalized=normalizeEmojiQuery(query), terms=normalized.split(/\s+/);
  return normalized ? catalog().filter(item=>terms.every(term=>item.terms.includes(term))).slice(0,EMOJI_SEARCH_CONFIG.maxResults) : catalog().filter(item=>item.category===category);
}

export const EMOJI_CATEGORIES = Object.keys(EMOJI_GROUPS);
export function emojiGrid(category, action, messageId = '', query = '') {
  return searchEmoji(query,EMOJI_CATEGORIES.includes(category)?category:'Faces').map(({emoji,label}) => `<button type="button" data-action="${escape(action)}" data-id="${escape(messageId)}" data-emoji="${escape(emoji)}" aria-label="${escape(label)}" title="${escape(label)}">${emoji}</button>`).join('') || '<p class="picker-empty">No emoji found. Try another search.</p>';
}
export function emojiPicker(action, messageId = '') {
  return `<section class="emoji-picker" aria-label="Emoji picker" data-emoji-action="${escape(action)}" data-message-id="${escape(messageId)}" data-category="Faces"><div class="picker-heading"><strong>Emoji</strong><button type="button" class="icon-button" data-action="close-picker" aria-label="Close emoji picker">×</button></div><input id="emoji-search" type="search" inputmode="search" maxlength="${EMOJI_SEARCH_CONFIG.maxQueryLength}" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="emoji-tabs" role="tablist" aria-label="Emoji categories">${EMOJI_CATEGORIES.map((category, index) => `<button type="button" role="tab" id="emoji-tab-${category}" aria-controls="emoji-category-grid" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-action="emoji-category" data-category="${category}">${category}</button>`).join('')}</div><div class="emoji-grid" id="emoji-category-grid" role="group" aria-labelledby="emoji-tab-Faces">${emojiGrid('Faces', action, messageId)}</div><small class="emoji-result-status" id="emoji-result-status" role="status" aria-live="polite"></small></section>`;
}

// API keys for the GIPHY web API are browser-visible. Restrict the production
// key to the deployment's domains in the provider dashboard.
export async function searchGiphy({ key, query = '', offset = 0, signal, fetcher = fetch }) {
  const url = new URL(`https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}`);
  const limit = GIPHY_CONFIG.pageSize;
  url.search = new URLSearchParams({ api_key: key, limit: String(limit), offset: String(offset), rating: 'pg', ...(query ? { q: query.slice(0, 50), lang: 'en' } : {}) });
  const response = await fetcher(url.href, { credentials: 'omit', signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!response.ok) throw new Error(response.status === 429 ? 'GIF search is busy. Please try again shortly.' : 'GIF search is unavailable. Please try again.');
  const result = await response.json();
  const gifs = (Array.isArray(result.data) ? result.data : []).map(gif => ({
    id: `giphy:${gif.id}`, provider: 'giphy', providerId: String(gif.id), title: String(gif.title || 'GIF'),
    url: gif.images?.fixed_height?.url || gif.images?.original?.url,
    preview: gif.images?.fixed_width_small?.url || gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url,
    still: gif.images?.fixed_width_small_still?.url || gif.images?.fixed_height_small_still?.url || gif.images?.fixed_height_still?.url || '',
  })).filter(gif => gif.url && gif.preview);
  const next = offset + (result.pagination?.count ?? gifs.length);
  return { gifs, nextOffset: next, hasMore: next < Math.min(GIPHY_CONFIG.maxOffset, result.pagination?.total_count ?? next) };
}

// Older messages have no saved still rendition. Resolve one lazily through the
// documented single-GIF endpoint, directly from the signed-in browser.
export async function lookupGiphyStill({ key, source, fetcher = fetch }) {
  const id = giphyIdentity(source); if (!key || !id) return '';
  const url = new URL(`https://api.giphy.com/v1/gifs/${id}`); url.searchParams.set('api_key', key);
  const response = await fetcher(url.href, { credentials: 'omit', signal: AbortSignal.timeout(GIPHY_CONFIG.lookupTimeoutMs), referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!response.ok) return '';
  const result = await response.json(), images = result.data?.images;
  return trustedStill(source, images?.fixed_height_still?.url || images?.downsized_still?.url || images?.original_still?.url);
}
