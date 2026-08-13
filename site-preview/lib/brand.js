/**
 * White-label palette generator (spec §VIII "UI fully in the customer's
 * brand"). From ONE theme color, derive the shades the player UI needs
 * and publish them as CSS vars (teal defaults live in globals.css):
 *
 *   --brand         accent (buttons, progress, icons)
 *   --brand-dark    text on light pills
 *   --brand-light   eyebrow labels on dark hero
 *   --brand-hero-a / --brand-hero-b   hero gradient stops (dark blends)
 */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Blend color toward target by factor f (0..1). */
function blend(rgb, target, f) {
  return rgb.map((v, i) => v + (target[i] - v) * f);
}

const DEEP = [7, 22, 28];    // near-black blue-ish base for hero depth
const WHITE = [255, 255, 255];

/** Palette from one color — usable server-side (event website SSR). */
export function brandPalette(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  return {
    brand: toHex(rgb),
    dark: toHex(blend(rgb, DEEP, 0.35)),
    light: toHex(blend(rgb, WHITE, 0.55)),
    heroA: toHex(blend(rgb, DEEP, 0.55)),
    heroB: toHex(blend(rgb, DEEP, 0.8)),
  };
}

export function applyBrand(color, root = typeof document !== 'undefined' ? document.documentElement : null) {
  const p = brandPalette(color);
  if (!p || !root) return;
  root.style.setProperty('--brand', p.brand);
  root.style.setProperty('--brand-dark', p.dark);
  root.style.setProperty('--brand-light', p.light);
  root.style.setProperty('--brand-hero-a', p.heroA);
  root.style.setProperty('--brand-hero-b', p.heroB);
}
