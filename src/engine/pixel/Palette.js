/**
 * Souldolls 2.5D pixel-art palette. Every ramp runs dark → light and is hue-shifted the way a
 * pixel artist would paint it (cool, saturated shadows; warm, soft highlights).
 * Using the same ramps for world textures and sprites keeps the whole scene cohesive.
 *
 * BRAND ANCHORS
 *  - OFFICIAL (from theme.json): Fuego #FF6B35, Planta #5CBF5A, Agua #3FA9F5.
 *  - PROPOSED (replace with theme.json values when confirmed): smoked wood, bronze,
 *    parchment, ki, oblivion.
 * The brand colors sit at a fixed index of their ramp (see BRAND_INDEX) so UI and VFX
 * can reference the exact brand color through the same ramp the sprites use.
 *
 * All pre-existing keys and ramp lengths are preserved, so nothing that calls rampAt()
 * needs to change.
 */
export const PALETTE = {
  // ── Souldolls brand ramps (NEW) ────────────────────────────────────────────
  // Elements: brand color is the mid-tone anchor.
  elFire:  ['#4a0f0a', '#9a2410', '#d9461a', '#FF6B35', '#ffb25a', '#fff0cc'], // idx 3 = Fuego
  elPlant: ['#0f2a1c', '#1c4a2a', '#2f7a3a', '#5CBF5A', '#9adf7a', '#d4f2a8'], // idx 3 = Planta
  elWater: ['#0c1f4a', '#16407f', '#2271c0', '#3FA9F5', '#80cdfa', '#c8ebff'], // idx 3 = Agua
  // Identity tokens.
  smokedWood: ['#120c09', '#1c130e', '#2B1D14', '#3E2A1C', '#5a3d28', '#7a5638'],
  bronze:     ['#2a1a0e', '#523319', '#80521f', '#B07A3C', '#D9A441', '#f2d28a'],
  parchment:  ['#4a3b2c', '#7a644a', '#a8916b', '#d0bb92', '#EADCB8', '#f8f0d8'],
  ki:         ['#0b2a33', '#145058', '#23857f', '#4fc1b0', '#7FE3D4', '#d4fff4'],
  oblivion:   ['#2a2a2c', '#4a4943', '#6b685e', '#8A8578', '#b3ae9e', '#d9d4c4'], // forgotten souls / desaturated zones

  // ── Nature ─────────────────────────────────────────────────────────────────
  grass: ['#1f3a2c', '#2e5a34', '#4a7d3a', '#6fb04a', '#a9d462', '#d6e58a'],
  grassDry: ['#3b3a24', '#5d5a2e', '#857d3c', '#ad9f4f', '#cfc27a'],
  leaves: ['#13271d', '#1f4a2e', '#2f6f3a', '#4a9a48', '#5CBF5A', '#b8e08a'], // idx 4 = Planta
  leavesAutumn: ['#3a1a1c', '#6b2a22', '#a44a26', '#d0752f', '#eaa94a', '#f6d77a'],
  pine: ['#0f2226', '#17363a', '#22523f', '#347049', '#57915a'],
  dirt: ['#2a1c18', '#46302a', '#67483a', '#8a6547', '#ad8a5f', '#cfb07f'],
  sand: ['#6b5a45', '#9a8360', '#c2a87a', '#dcc596', '#efe0b8'],
  stone: ['#1e1e2a', '#34364a', '#4f5468', '#727a8a', '#9aa3ad', '#c9cfd0'],
  stoneWarm: ['#2a2426', '#463c3c', '#665a55', '#8a7d72', '#b0a494', '#d8ccb9'],
  moss: ['#1c2f25', '#2e4a31', '#4b6b3a', '#6f8d45'],
  water: ['#0c1d3a', '#143a66', '#1f5f99', '#2f86c9', '#3FA9F5', '#8fd3f2', '#e4f6ee'], // idx 4 = Agua
  bark: ['#1d1412', '#33231c', '#4d352a', '#6b4d37', '#8c6a48'],

  // ── Building materials ─────────────────────────────────────────────────────
  wood: ['#1c120c', '#2B1D14', '#3E2A1C', '#5c3a22', '#7d5230', '#a8723e'], // smoked-wood family
  woodGray: ['#26221f', '#3d3632', '#58504a', '#776d64', '#9a8f84'],
  plaster: ['#6e5f55', '#968474', '#b9a790', '#d6c7ad', '#EADCB8', '#fbf6e8'], // idx 4 = parchment
  brick: ['#2e1414', '#4f1f1a', '#73301f', '#984a2b', '#b8693d'],
  roofRed: ['#2a0f16', '#4d1a1f', '#7a2a26', '#a5402e', '#c9643c', '#e39a5a'],
  roofBlue: ['#131a33', '#1d2a4d', '#2b4169', '#3f5f88', '#6286a6'],
  thatch: ['#3a2a15', '#5e451f', '#84662c', '#a88a3e', '#cfb25a', '#ecd690'],
  slate: ['#16161f', '#25263a', '#383b52', '#50566e', '#707a8e'],
  metal: ['#16151a', '#2d2c34', '#4d4e58', '#7c7f89', '#b6b9bf', '#eef0f2'],
  gold: ['#2a1a0e', '#523319', '#80521f', '#B07A3C', '#D9A441', '#f6e3a4'], // bronze → gold

  // ── Cloth / accents ────────────────────────────────────────────────────────
  red: ['#2e0c14', '#5a1420', '#8c2330', '#bf3b3b', '#e0674f', '#f5a07a'],
  blue: ['#10132e', '#1c2556', '#2a3d86', '#3d5fb4', '#6a8fd6', '#a9c7ee'],
  green: ['#0f261c', '#1a4028', '#2b6236', '#468a45', '#78b35b'],
  purple: ['#1c1029', '#34194a', '#522a6e', '#77428f', '#a569b3'],
  yellow: ['#3a2a0c', '#6e4d12', '#a8781d', '#d9a92e', '#f2d45a', '#fff0a0'],
  cream: ['#5c4d3f', '#8a7862', '#b5a386', '#d9cbaa', '#f2e8cf'],
  brown: ['#1f130e', '#3a2418', '#5a3a24', '#7d5634', '#a27749'],
  black: ['#0d0a09', '#17120f', '#241d19', '#372e2a'], // warm smoked black
  white: ['#8a8f9e', '#b3b8c4', '#d6dae0', '#eef0f2', '#ffffff'],

  // ── Characters ─────────────────────────────────────────────────────────────
  skinLight: ['#6b3b33', '#a15f4c', '#d08f6e', '#eab48f', '#f8d6b4'],
  skinTan: ['#4a2721', '#7a4331', '#a8674a', '#c98a62', '#e2ae84'],
  skinDark: ['#23130f', '#3f231a', '#5e3726', '#80503a', '#a06d50'],
  hairBrown: ['#1e110c', '#3a2014', '#5a331d', '#7e4d2b', '#a36e41'],
  hairBlonde: ['#5c3a14', '#8c5e1f', '#bf8c33', '#e4bb56', '#f7e08e'],
  hairBlack: ['#0b0a12', '#171623', '#262538', '#3b3b52'],
  hairRed: ['#2e0e0e', '#5a1a14', '#8c2c1a', '#bf4a26', '#e0753a'],
  hairWhite: ['#5c5c6b', '#8a8a99', '#b4b4c0', '#dcdce2', '#f6f6f8'],

  // ── Light / glow ───────────────────────────────────────────────────────────
  fire: ['#4a0f0a', '#9a2410', '#d9461a', '#FF6B35', '#ffb25a', '#fff0cc'], // idx 3 = Fuego
  glowWarm: '#ffc27a',
  glowCool: '#9fe8dc', // was icy blue; now leans to ki so cool glows read as "soul"
  glowKi: '#7FE3D4',
  glowForget: '#8A8578',
  outline: '#150e0b', // warm smoked-wood dark instead of purple-black
};

/** Index of the exact brand color inside its ramp. */
export const BRAND_INDEX = {
  elFire: 3,
  elPlant: 3,
  elWater: 3,
  fire: 3,
  leaves: 4,
  water: 4,
  bronze: 3,
  parchment: 4,
  ki: 4,
};

/** Official element colors (theme.json). */
export const ELEMENT_COLORS = {
  fire: '#FF6B35',
  plant: '#5CBF5A',
  water: '#3FA9F5',
};

/** Pick color i from a ramp, clamped. */
export const rampAt = (ramp, i) => ramp[Math.max(0, Math.min(ramp.length - 1, i | 0))];