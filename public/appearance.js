// Every palette keeps a dark background and changes shared interface tokens.
export const PALETTES = Object.freeze({
  coral: { name: 'Coral', accent: '#ff8c84', hue: 230 },
  violet: { name: 'Violet', accent: '#c0a4ff', hue: 265 },
  blue: { name: 'Ocean', accent: '#85baff', hue: 217 },
  teal: { name: 'Lagoon', accent: '#73d9d0', hue: 177 },
  green: { name: 'Forest', accent: '#99d795', hue: 127 },
  gold: { name: 'Amber', accent: '#edc87a', hue: 40 },
  rose: { name: 'Rose', accent: '#ef9ec2', hue: 332 },
  slate: { name: 'Graphite', accent: '#c1cadb', hue: 221 },
  ruby: { name: 'Ruby', accent: '#ff8fa1', hue: 350 },
  ember: { name: 'Ember', accent: '#f5ad7a', hue: 24 },
  citrus: { name: 'Citrus', accent: '#d4df83', hue: 68 },
  mint: { name: 'Mint', accent: '#8cddbc', hue: 154 },
  arctic: { name: 'Arctic', accent: '#94dbe9', hue: 193 },
  indigo: { name: 'Indigo', accent: '#a6b0ff', hue: 237 },
  plum: { name: 'Plum', accent: '#d2a0e3', hue: 285 },
  sand: { name: 'Sand', accent: '#ddc3a2', hue: 31 },
});
export function paletteTokens(key) {
  const { accent, hue } = PALETTES[key] || PALETTES.coral;
  return { '--accent': accent, '--accent-soft': `${accent}18`, '--accent-text': accent,
    '--accent-border': `${accent}55`, '--accent-ink': '#14171e', '--accent-hover': `color-mix(in srgb, ${accent} 85%, white)`,
    '--bg': `hsl(${hue} 13% 7%)`, '--sidebar': `hsl(${hue} 13% 10%)`, '--panel': `hsl(${hue} 13% 10%)`,
    '--surface': `hsl(${hue} 14% 14%)`, '--surface-hover': `hsl(${hue} 14% 18%)`,
    '--input': `hsl(${hue} 13% 8%)`, '--composer': `hsl(${hue} 14% 12%)`, '--elevated': `hsl(${hue} 15% 17%)` };
}
export function applyPalette(key, root = document.documentElement) {
  for (const [name, value] of Object.entries(paletteTokens(key))) root.style.setProperty(name, value);
  root.dataset.palette = PALETTES[key] ? key : 'coral';
}
