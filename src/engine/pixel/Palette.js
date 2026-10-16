/**
 * SOULDOLLS 2.5D pixel-art palette — brand-derived.
 *
 * Every ramp in this file is GENERATED from a small set of brand anchors, so the whole
 * scene (tiles, props, sprites, VFX) shares one identity:
 *   - all shadows fall toward the brand inks (warm wine-wood or cool ki-teal),
 *   - all highlights rise toward parchment (warm) or ki-glow (cool),
 *   - generic hues (red, blue, purple…) are rotated/mixed from Fire, Water, Plant.
 * Change a value in BRAND and the entire palette follows.
 *
 * Every ramp runs dark → light. Keys and ramp lengths are identical to the previous
 * palette, so rampAt() and every sprite/tile recipe keep working untouched.
 *
 * OFFICIAL (theme.json): fire, plant, water.
 * PROPOSED (replace with theme.json values when confirmed): everything else in BRAND.
 */

// ───────────────────────────── Brand anchors ─────────────────────────────
export const BRAND = {
  // Official elements
  fire: '#FF6B35',
  plant: '#5CBF5A',
  water: '#3FA9F5',
  // Proposed identity tokens
  smokedWood: '#3E2A1C', // smoked wood (surface)
  bronze: '#B07A3C', // bronze (border)
  bronzeLight: '#D9A441', // bronze (accent)
  parchment: '#EADCB8', // parchment (text on wood)
  ki: '#7FE3D4', // ki (soul glow)
  oblivion: '#8A8578', // forgotten / desaturated
  ink: '#150e0b', // outline / deepest ink
};

// ───────────────────────────── Color math (OKLab) ─────────────────────────────
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGam = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function hexToLab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, a, b]) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    rgb
      .map((v) => Math.round(clamp01(toGam(clamp01(v))) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Perceptual mix of two hex colors. t=0 → a, t=1 → b. */
export const mix = (a, b, t) => {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const A = hexToLab(a);
  const B = hexToLab(b);
  return labToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};

/** Rotate hue (degrees) keeping lightness and chroma. */
const hue = (hex, deg) => {
  const [L, a, b] = hexToLab(hex);
  const C = Math.hypot(a, b);
  const h = Math.atan2(b, a) + (deg * Math.PI) / 180;
  return labToHex([L, C * Math.cos(h), C * Math.sin(h)]);
};

// ───────────────────────────── Ramp generator ─────────────────────────────
// Shadows/highlights are tinted toward brand inks, never toward neutral black/white.
const TONE = {
  warm: { shadow: '#2a0f16', light: '#fff1d0' }, // wine-wood shadows, parchment highlights
  cool: { shadow: '#0b2a33', light: '#dffff4' }, // ki-teal shadows, ki-glow highlights
  ink: { shadow: '#050304', light: '#fff1d0' }, // for already-dark ramps (black, hairBlack)
};

/**
 * Build a dark→light ramp of n colors. `anchor` sits exactly at index `ai`.
 * @param tone 'warm' | 'cool' | 'ink'  @param depth how far the darkest step goes toward the shadow ink
 * @param lift how far the lightest step goes toward the highlight tint
 */
const R = (anchor, n, ai, tone = 'warm', depth = 0.8, lift = 0.82) => {
  const { shadow, light } = TONE[tone];
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === ai) out.push(anchor);
    else if (i < ai) out.push(mix(anchor, shadow, ((ai - i) / ai) * depth));
    else out.push(mix(anchor, light, ((i - ai) / (n - 1 - ai)) * lift));
  }
  return out;
};

const B = BRAND;

// ───────────────────────────── Palette ─────────────────────────────
export const PALETTE = {
  // ── Brand ramps (NEW) ───────────────────────────────────────────────────
  elFire: R(B.fire, 6, 3, 'warm', 0.85, 0.85), //  idx 3 = Fire
  elPlant: R(B.plant, 6, 3, 'cool', 0.85, 0.8), // idx 3 = Plant
  elWater: R(B.water, 6, 3, 'cool', 0.85, 0.82), //  idx 3 = Water
  smokedWood: R(B.smokedWood, 6, 3, 'warm', 0.85, 0.5),
  bronze: R(B.bronze, 6, 3, 'warm', 0.8, 0.7),
  parchment: R(B.parchment, 6, 4, 'warm', 0.7, 0.7),
  ki: R(B.ki, 6, 4, 'cool', 0.88, 0.85),
  oblivion: R(B.oblivion, 6, 3, 'warm', 0.7, 0.65),

  // ── Nature ──────────────────────────────────────────────────────────────
  grass: R(mix(B.plant, B.bronzeLight, 0.2), 6, 3, 'cool', 0.85, 0.8),
  grassDry: R(mix(B.plant, B.bronze, 0.6), 5, 2, 'warm', 0.7, 0.75),
  leaves: R(B.plant, 6, 4, 'cool', 0.88, 0.7), // idx 4 = Plant
  leavesAutumn: R(mix(B.fire, B.bronze, 0.35), 6, 3, 'warm', 0.85, 0.8),
  pine: R(mix(B.plant, B.ki, 0.3), 5, 3, 'cool', 0.9, 0.4),
  dirt: R(mix(B.smokedWood, B.bronze, 0.45), 6, 3, 'warm', 0.8, 0.75),
  sand: R(mix(B.parchment, B.bronze, 0.3), 5, 2, 'warm', 0.55, 0.7),
  stone: R(mix(B.oblivion, B.water, 0.18), 6, 3, 'cool', 0.8, 0.7),
  stoneWarm: R(mix(B.oblivion, B.smokedWood, 0.25), 6, 3, 'warm', 0.8, 0.7),
  moss: R(mix(B.plant, B.oblivion, 0.5), 4, 2, 'cool', 0.8, 0.5),
  water: R(B.water, 7, 4, 'cool', 0.88, 0.9), // idx 4 = Water
  bark: R(mix(B.smokedWood, B.bronze, 0.2), 5, 2, 'warm', 0.8, 0.7),

  // ── Building materials ──────────────────────────────────────────────────
  wood: R(mix(B.smokedWood, B.bronze, 0.4), 6, 3, 'warm', 0.85, 0.7),
  woodGray: R(mix(B.smokedWood, B.oblivion, 0.55), 5, 2, 'warm', 0.75, 0.65),
  plaster: R(B.parchment, 6, 4, 'warm', 0.75, 0.75), // idx 4 = Parchment
  brick: R(mix(B.fire, B.smokedWood, 0.55), 5, 2, 'warm', 0.8, 0.6),
  roofRed: R(mix(B.fire, B.smokedWood, 0.3), 6, 3, 'warm', 0.85, 0.7),
  roofBlue: R(mix(B.water, B.ink, 0.4), 5, 3, 'cool', 0.85, 0.55),
  thatch: R(mix(B.bronze, B.parchment, 0.35), 6, 3, 'warm', 0.8, 0.75),
  slate: R(mix(mix(B.water, B.oblivion, 0.65), B.ink, 0.25), 5, 2, 'cool', 0.85, 0.6),
  metal: R(mix(B.oblivion, B.water, 0.12), 6, 3, 'cool', 0.85, 0.85),
  gold: R(B.bronzeLight, 6, 3, 'warm', 0.85, 0.85), // idx 3 = Bronze accent

  // ── Cloth / accents (generic hues rotated from the brand) ───────────────
  red: R(hue(mix(B.fire, B.smokedWood, 0.15), -16), 6, 3, 'warm', 0.85, 0.7),
  blue: R(mix(B.water, B.ink, 0.3), 6, 3, 'cool', 0.85, 0.75),
  green: R(mix(B.plant, B.ink, 0.28), 5, 3, 'cool', 0.85, 0.5),
  purple: R(mix(hue(B.water, 85), B.ink, 0.3), 5, 3, 'cool', 0.85, 0.55),
  yellow: R(hue(B.bronzeLight, 12), 6, 3, 'warm', 0.85, 0.85),
  cream: R(mix(B.parchment, B.bronze, 0.12), 5, 3, 'warm', 0.7, 0.7),
  brown: R(mix(B.smokedWood, B.bronze, 0.5), 5, 3, 'warm', 0.85, 0.5),
  black: R(mix(B.smokedWood, B.oblivion, 0.2), 4, 3, 'ink', 0.9, 0),
  white: R(mix(B.parchment, '#ffffff', 0.55), 5, 3, 'cool', 0.45, 0.85),

  // ── Characters ──────────────────────────────────────────────────────────
  skinLight: R(mix(B.parchment, B.fire, 0.28), 5, 3, 'warm', 0.75, 0.6),
  skinTan: R(mix(B.bronze, B.fire, 0.3), 5, 3, 'warm', 0.75, 0.6),
  skinDark: R(mix(B.smokedWood, B.bronze, 0.6), 5, 3, 'warm', 0.8, 0.55),
  hairBrown: R(mix(B.smokedWood, B.bronze, 0.55), 5, 3, 'warm', 0.85, 0.55),
  hairBlonde: R(mix(B.bronzeLight, B.parchment, 0.25), 5, 3, 'warm', 0.8, 0.7),
  hairBlack: R(mix(mix(B.water, B.oblivion, 0.4), B.ink, 0.7), 4, 3, 'ink', 0.9, 0),
  hairRed: R(mix(B.fire, B.smokedWood, 0.2), 5, 3, 'warm', 0.85, 0.5),
  hairWhite: R(mix(B.ki, '#ffffff', 0.8), 5, 3, 'cool', 0.55, 0.8),

  // ── Light / glow ────────────────────────────────────────────────────────
  fire: R(B.fire, 6, 3, 'warm', 0.85, 0.85), // idx 3 = Fire
  glowWarm: mix(B.fire, B.parchment, 0.55),
  glowCool: mix(B.ki, B.water, 0.2),
  glowKi: B.ki,
  glowForget: B.oblivion,
  outline: B.ink,
};

/** Index of the exact brand color inside its ramp. */
export const BRAND_INDEX = {
  elFire: 3,
  elPlant: 3,
  elWater: 3,
  fire: 3,
  leaves: 4,
  water: 4,
  smokedWood: 3,
  bronze: 3,
  parchment: 4,
  ki: 4,
  gold: 3,
  plaster: 4,
};

/** Official element colors (theme.json). */
export const ELEMENT_COLORS = { fire: B.fire, plant: B.plant, water: B.water };

/** Pick color i from a ramp, clamped. */
export const rampAt = (ramp, i) => ramp[Math.max(0, Math.min(ramp.length - 1, i | 0))];
