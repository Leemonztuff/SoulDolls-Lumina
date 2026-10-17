/**
 * Sandbox: sprite_restyle.html — the interactive editor of the character-art style pipeline.
 *
 * Pick a shipped pack (or paste your own JSON), see every preset sheet side by side with its stock
 * version, and copy the `?style=` URLs to try the look in the real game / gallery. Nothing here
 * touches committed files; the pipeline CLI (tools/restyle-characters.mjs) is what bakes PNGs +
 * hashes for review and commits.
 *
 * Query params:
 *   ?pack=<name|url>   preselect a pack: a shipped name (neon, pastel, retro…) or a URL/relative
 *                      path to a JSON pack (e.g. ../tools/styles/neon.json)
 *   ?z=<n>             sheet zoom (default 3)
 */
import { createCharacterSheet, CHARACTER_PRESETS } from '../src/engine/pixel/CharacterSprites.js';
import { installCharacterStyle, uninstallCharacterStyle } from '../src/engine/pixel/StyleRuntime.js';
import { validatePack } from '../tools/lib/stylePacks.mjs';

const params = new URLSearchParams(location.search);
const Z = Number(params.get('z') || 3);
const app = document.getElementById('app');

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') e.style.cssText = v; else if (k === 'class') className(e, v); else e.setAttribute(k, v);
  }
  for (const k of kids) e.append(k);
  return e;
};
const className = (e, v) => { e.className = v; };

/** Shipped packs discovered through Vite's glob import (tools/styles/*.json). */
const shippedModules = import.meta.glob('../tools/styles/*.json', { query: '?url', import: 'default' });
const shipped = Object.entries(shippedModules)
  .map(([p, url]) => ({ name: p.match(/([^/]+)\.json$/)[1], url }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Header + controls
// ---------------------------------------------------------------------------

app.append(el('h1', {}, 'Sprite restyle — style pack preview'));
app.append(el('div', { class: 'hint' },
  'A style pack is plain JSON: palette remaps, per-preset overrides, random pools and canvas postFx. ',
  'Pick one below or paste your own — every preset sheet renders stock vs styled side by side. ',
  'The same pack works in the game (', el('code', {}, 'game.html?style=…'), ') and the gallery (',
  el('code', {}, 'sprite_art.html?style=…'), ').'));

const select = el('select', {});
select.append(el('option', { value: '' }, '— stock (no pack) —'));
for (const s of shipped) select.append(el('option', { value: s.url }, s.name));
const status = el('span', { class: 'hint' }, '');
const ta = el('textarea', { spellcheck: 'false' });
const applyBtn = el('button', {}, 'Apply pasted JSON');
const fileInput = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
const loadBtn = el('button', {}, 'Load .json…');
loadBtn.onclick = () => fileInput.click();
fileInput.onchange = async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  ta.value = await f.text();
  render(); // apply straight away too
};

let currentPack = null;

/** Validate + install a pack (or clear it when null); returns validation errors. */
function setPack(pack) {
  uninstallCharacterStyle();
  currentPack = null;
  if (!pack) return [];
  const errs = validatePack(pack, { source: 'editor' });
  if (errs.length) return errs;
  installCharacterStyle(pack);
  currentPack = pack;
  return [];
}

async function fetchPack(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Gallery: stock vs styled per preset
// ---------------------------------------------------------------------------

function sheetCanvas(canvas, zoom) {
  const cv = el('canvas', {
    class: 'sheet', width: canvas.width * zoom, height: canvas.height * zoom,
  });
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, cv.width, cv.height);
  return cv;
}

/** Re-runs a sheet builder while the requested hook state is active (hash-safe). */
function buildSheatsWith(build) {
  // hash-safe: build each sheet while the requested hook state is active
  return build();
}

function render() {
  document.getElementById('gallery')?.remove();
  document.getElementById('links')?.remove();
  const grid = el('div', { class: 'grid', id: 'gallery' });
  const specs = [];
  for (const name of Object.keys(CHARACTER_PRESETS)) specs.push([name, { preset: name }]);
  for (let i = 1; i <= 4; i++) specs.push([`random NPC seed ${i}`, { randomize: true, seed: i }]);

  // stock sheets first (hooks cleared), then styled ones — both kept for the side-by-side cards
  const stock = buildSheatsWith(() => {
    uninstallCharacterStyle();
    return specs.map(([label, spec]) => [label, createCharacterSheet(spec)]);
  });
  const styled = currentPack
    ? buildSheatsWith(() => {
      installCharacterStyle(currentPack);
      return specs.map(([label, spec]) => [label, createCharacterSheet(spec)]);
    })
    : null;

  for (let i = 0; i < specs.length; i++) {
    const [label] = specs[i];
    const card = el('div', { class: 'card' }, el('div', { class: 'label' }, label));
    const pair = el('div', { class: 'pair' });
    const figStock = el('figure', {}, sheetCanvas(stock[i][1].canvas, Z), el('figcaption', {}, currentPack ? 'stock' : 'styled'));
    pair.append(figStock);
    if (styled) pair.append(el('figure', {}, sheetCanvas(styled[i][1].canvas, Z), el('figcaption', {}, 'styled')));
    card.append(pair);
    grid.append(card);
  }
  app.append(grid);

  // --- ready-made URLs with the active pack ---
  if (currentPack) {
    const packUrl = select.value && !ta.value.trim() ? select.value : null;
    const links = el('div', { id: 'links' });
    links.append(el('h2', {}, 'Try this pack'));
    if (packUrl) {
      for (const page of ['game.html', '/sandbox/sprite_art.html']) {
        const u = `${page}${page.includes('?') ? '&' : '?'}style=${encodeURIComponent(packUrl)}`;
        links.append(el('div', { class: 'row' }, el('a', { href: u, target: '_blank', rel: 'noopener' }, u)));
      }
      links.append(el('div', { class: 'hint' },
        'CLI equivalent: ', el('code', {}, `npm run restyle -- --pack ${shipped.find((s) => s.url === packUrl)?.name ?? packUrl}`)));
    } else {
      links.append(el('div', { class: 'hint' },
        'Pasted JSON: save it as tools/styles/<name>.json (or pass it to the CLI with --pack <file>) to use it in the game.'));
    }
    app.append(links);
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function applyFromSelect() {
  const url = select.value;
  ta.value = '';
  if (!url) { status.textContent = 'stock art'; status.className = 'hint'; render(); return; }
  try {
    const pack = await fetchPack(url);
    const errs = setPack(pack);
    status.textContent = errs.length ? '' : `installed "${pack.name}"`;
    status.className = errs.length ? 'err' : 'ok hint';
    if (errs.length) status.textContent = errs.join('\n');
  } catch (e) {
    status.textContent = String(e?.message ?? e);
    status.className = 'err';
  }
  render();
}

applyBtn.onclick = () => {
  let pack;
  try {
    pack = JSON.parse(ta.value);
  } catch (e) {
    status.textContent = `invalid JSON: ${e.message}`;
    status.className = 'err';
    render();
    return;
  }
  const errs = setPack(pack);
  status.textContent = errs.length ? errs.join('\n') : `installed "${pack.name}" (pasted)`;
  status.className = errs.length ? 'err' : 'ok hint';
  if (!errs.length) select.value = '';
  render();
};
select.onchange = applyFromSelect;

// initial selection (?pack=<name|url>, default: the first shipped pack)
(async () => {
  const want = params.get('pack');
  let url = '';
  if (want) {
    const hit = shipped.find((s) => s.name === want);
    url = hit ? hit.url : want;
  } else if (shipped.length) url = shipped[0].url;
  if (url) {
    /** @type {any} */
    const sel = select;
    sel.value = url;
    await applyFromSelect();
    if (status.className.includes('err') || !currentPack) {
      // bad ?pack= value: fall back to stock, show the reason
      sel.value = '';
      setPack(null);
      render();
    }
  } else {
    render();
  }
})();
