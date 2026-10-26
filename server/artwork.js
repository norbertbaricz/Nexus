'use strict';

// Artwork stays byte-for-byte intact; these values control its visible crop.
const ARTWORK_LIMITS = Object.freeze({ minPosition: 0, maxPosition: 100, minZoom: 1, maxZoom: 4 });
const DEFAULT_CROP = Object.freeze({ x: 50, y: 50, zoom: 1 });
function normalizeCrop(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_CROP, key))) throw new Error('Choose a valid image position.');
  const crop = { ...DEFAULT_CROP, ...value };
  for (const key of ['x', 'y', 'zoom']) {
    const low = key === 'zoom' ? ARTWORK_LIMITS.minZoom : ARTWORK_LIMITS.minPosition;
    const high = key === 'zoom' ? ARTWORK_LIMITS.maxZoom : ARTWORK_LIMITS.maxPosition;
    if (typeof crop[key] !== 'number' || !Number.isFinite(crop[key]) || crop[key] < low || crop[key] > high) throw new Error('Choose a valid image position.');
    crop[key] = Math.round(crop[key] * 100) / 100;
  }
  return crop;
}
function readCrop(value) {
  try { return normalizeCrop(typeof value === 'string' ? JSON.parse(value) : value); } catch { return { ...DEFAULT_CROP }; }
}
module.exports = { ARTWORK_LIMITS, DEFAULT_CROP, normalizeCrop, readCrop };
