#!/usr/bin/env node
/**
 * Headless browser check harness.
 *
 * Starts a Vite dev server, opens a page in headless Chrome (real GPU when available),
 * collects console errors / warnings / page errors / failed requests, runs an optional
 * action script, measures FPS and writes screenshots + a JSON report.
 *
 * Usage:
 *   npm run check -- [--page=index.html] [--query=autostart=1] [--out=name]
 *                    [--wait=4000] [--width=1600] [--height=900]
 *                    [--script=path/to/actions.json] [--fps=3000] [--headful] [--keep-cache]
 *
 * Each run gets its own Vite dependency cache, node_modules/.vite-check/<out>-<pid>, and deletes it
 * when it ends — also after a failure, an uncaught error or Ctrl+C (only a hard-killed process
 * leaves one behind; delete node_modules/.vite-check/ any time no check is running). A warm cache
 * saves under a second per run. --keep-cache keeps the old behaviour: one cache per --out name,
 * node_modules/.vite-check/<out>, kept and reused by the next run with the same --out.
 *
 * Action script: JSON array of steps, executed in order after the initial wait:
 *   { "wait": 1000 }                         sleep ms
 *   { "key": "KeyW", "hold": 800 }           hold a key (KeyboardEvent.code) for ms
 *   { "press": "Space" }                     tap a key
 *   { "eval": "window.__game.setTime(21)" }  run JS in page (result logged)
 *   { "shot": "night" }                      save screenshot .check/<out>/<name>.png
 *   { "fps": 2000, "label": "night" }        measure fps over ms
 *   { "click": [x, y], "button"?, "count"? }  mouse click at viewport coords ('left'|'right'|'middle')
 *   { "dblclick": [x, y] }                   double click
 *   { "move": [x, y], "steps"? }             move the mouse (hover)
 *   { "mouse": "down"|"up", "button"? }      press / release at the current mouse position
 *   { "drag": [[x0,y0], [x1,y1], ...], "button"?, "steps"?, "pause"?, "modifiers"?: ["Shift"] }
 *                                            real mouse drag through the points
 *   { "wheel": [x, y], "deltaY": -240 }      mouse wheel at a point
 *   { "type": "text", "selector"? }          type text (selector: triple-click that field first)
 *   { "combo": ["Control", "KeyZ"] }         key chord (hold all but the last key)
 *   { "goto": "editor.html?open=x" }         navigate (relative to the dev server)
 *   { "tab": "last" | 0 }                    continue in another tab, e.g. the one the editor's
 *                                            Play button opened (it does not wait for a new tab:
 *                                            TOOL-11 — test play-tests with a goto step)
 *
 * Output: .check/<out>/report.json, .check/<out>/*.png ; exit code 1 on page errors.
 */
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @import { KeyInput, MouseButton, Page } from 'puppeteer-core' */

/**
 * One action-script step (the format in the header). A step does what the first of these keys it
 * has says, in this order: wait, key, press, eval, shot, fps, click, dblclick, move, mouse, drag,
 * wheel, type, combo, goto, tab; the other keys are that action's options.
 * @typedef {object} Step
 * @property {number} [wait] sleep (ms)
 * @property {KeyInput} [key] hold a key (KeyboardEvent.code) for `hold` ms (300)
 * @property {number} [hold]
 * @property {KeyInput} [press] tap a key
 * @property {string} [eval] JS run in the page (result or error logged in the report)
 * @property {string} [shot] screenshot name (.check/<out>/<name>.png)
 * @property {number} [fps] measure fps over this many ms, as `label`
 * @property {string} [label]
 * @property {[number, number]} [click] click at viewport coordinates (`button`, `count` presses)
 * @property {MouseButton} [button] click / mouse / drag button ('left')
 * @property {number} [count]
 * @property {[number, number]} [dblclick]
 * @property {[number, number]} [move] move the mouse there in `steps` moves (1)
 * @property {number} [steps] drag: moves per segment (8)
 * @property {'down'|'up'} [mouse] press / release at the current mouse position
 * @property {[number, number][]} [drag] drag through the points, `pause` ms after each segment
 * @property {number} [pause]
 * @property {KeyInput[]} [modifiers] drag: keys held during the drag
 * @property {[number, number]} [wheel] wheel at a point by `deltaY` (-240)
 * @property {number} [deltaY]
 * @property {string} [type] text to type (`selector`: triple-click that field first; `delay` 10 ms)
 * @property {string} [selector]
 * @property {number} [delay]
 * @property {KeyInput[]} [combo] hold all but the last key, tap the last
 * @property {string} [goto] navigate (relative to the dev server, or an http URL)
 * @property {'last'|number} [tab] continue in the last tab or tab n (no wait for a new one: TOOL-11)
 */

/**
 * One fps measurement (`label` added by the caller).
 * @typedef {{ fps: number, p50ms: number, p95ms: number }} FpsSample
 */

/**
 * What .check/<out>/report.json holds.
 * @typedef {object} Report
 * @property {string} page
 * @property {string} query
 * @property {{ type: string, text: string }[]} console every console message
 * @property {string[]} errors console errors (favicon / 404 noise left out)
 * @property {string[]} warnings
 * @property {string[]} pageErrors uncaught page errors, and `HARNESS: …` when a step threw
 * @property {string[]} failedRequests
 * @property {{ code: string, result?: unknown, error?: string }[]} evals eval steps, tab switches
 * @property {({ label: string } & FpsSample)[]} fps
 * @property {string[]} shots screenshot paths relative to the repository
 * @property {string|null} gl the WebGL2 renderer string ('NO WEBGL2' without WebGL2)
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const pagePath = String(args.page ?? 'index.html').replace(/^\//, '');
const query = args.query !== undefined ? String(args.query) : 'autostart=1';
const outName = String(args.out ?? path.basename(pagePath, '.html'));
const outDir = path.join(root, '.check', outName);
const width = Number(args.width ?? 1600);
const height = Number(args.height ?? 900);
const initialWait = Number(args.wait ?? 4000);
const fpsWindow = Number(args.fps ?? 3000);
/** @type {Step[]} */
const script = args.script ? JSON.parse(fs.readFileSync(path.resolve(root, String(args.script)), 'utf8')) : [];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) { console.error('No Chrome/Edge found; set CHROME_PATH'); process.exit(2); }

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png') || f === 'report.json') fs.rmSync(path.join(outDir, f));

/** @param {number} ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** @type {Report} */
const report = { page: pagePath, query, console: [], errors: [], warnings: [], pageErrors: [], failedRequests: [], evals: [], fps: [], shots: [], gl: null };

const port = 5200 + Math.floor(Math.random() * 700);
// A separate dep-optimizer cache per run lets several checks run concurrently without racing, and
// deleting it at the end keeps node_modules/.vite-check/ from growing by ~5–20 MB per run (it had
// reached 36 GB). --keep-cache: one cache per --out name, kept for the next run with that name.
const keepCache = Boolean(args['keep-cache']);
const cacheName = outName.replace(/[^\w-]/g, '_') + (keepCache ? '' : `-${process.pid}`);
const cacheDir = path.join(root, 'node_modules', '.vite-check', cacheName);
/** Delete this run's cache (synchronous, so it also works from the 'exit' handler); idempotent. */
const removeCache = () => {
  if (keepCache) return;
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (e) {
    console.warn(`Could not delete the Vite cache ${cacheDir}: ${e?.message ?? e}`);
  }
};
// every way out: process.exit / the end of the script, an uncaught error, Ctrl+C (SIGINT and the
// others exit without 'exit' handlers by default, so turn them into a normal exit first)
process.on('exit', removeCache);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.once(sig, () => process.exit(130));

const server = await createServer({
  root, cacheDir, logLevel: 'error', configFile: path.join(root, 'vite.config.js'),
  server: { port, strictPort: false, host: '127.0.0.1', hmr: false },
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const url = `${base}/${pagePath}${query ? `?${query}` : ''}`;

const browser = await puppeteer.launch({
  executablePath,
  // @ts-expect-error puppeteer ≥ 22 types drop 'new'; it still runs as true (--headless=new)
  headless: args.headful ? false : 'new',
  args: [
    `--window-size=${width},${height}`,
    '--ignore-gpu-blocklist', '--enable-gpu', '--enable-webgl', '--use-angle=d3d11',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
  ],
  defaultViewport: { width, height },
});

let exitCode = 0;
try {
  const watched = new Set();
  /** @param {Page|null} p a tab to collect console output, errors and failed requests from */
  const watch = (p) => {
    if (!p || watched.has(p)) return;
    watched.add(p);
    p.on('console', (msg) => {
      /** @type {{ type: string, text: string }} (older puppeteer reported 'warning') */
      const entry = { type: msg.type(), text: msg.text() };
      report.console.push(entry);
      if (entry.type === 'error' && !/favicon|status of 404 \(Not Found\)/.test(entry.text)) report.errors.push(entry.text);
      if (entry.type === 'warn' || entry.type === 'warning') report.warnings.push(entry.text);
    });
    // puppeteer types the payload `Error | unknown` (anything thrown); ?. and ?? cover non-Errors
    p.on('pageerror', (err) => report.pageErrors.push(String(/** @type {Error} */ (err)?.stack ?? err)));
    p.on('requestfailed', (req) => report.failedRequests.push(`${req.url()} ${req.failure()?.errorText}`));
    p.on('response', (res) => { if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) report.failedRequests.push(`${res.url()} HTTP ${res.status()}`); });
  };
  let page = await browser.newPage();
  watch(page);
  // tabs the page opens (the editor's Play button) are watched from their first request
  browser.on('targetcreated', async (t) => { if (t.type() === 'page') watch(await t.page().catch(() => null)); });

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  report.gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return 'NO WEBGL2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await sleep(initialWait);

  /**
   * Frame rate and frame-time percentiles over `ms`, from requestAnimationFrame in the page.
   * @param {number} ms
   * @returns {Promise<FpsSample>}
   */
  const measureFps = async (ms) => page.evaluate((ms) => new Promise((resolve) => {
    let frames = 0; const t0 = performance.now(); const times = []; let last = t0;
    const tick = (t) => {
      frames++; times.push(t - last); last = t;
      if (t - t0 < ms) { requestAnimationFrame(tick); return; }
      times.sort((a, b) => a - b);
      resolve({ fps: +(frames * 1000 / (t - t0)).toFixed(1), p50ms: +times[Math.floor(times.length * 0.5)].toFixed(2), p95ms: +times[Math.floor(times.length * 0.95)].toFixed(2) });
    };
    requestAnimationFrame(tick);
  }), ms);

  /** @param {string} name screenshot file name (.check/<out>/<name>.png) */
  const shot = async (name) => {
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    report.shots.push(path.relative(root, file).replace(/\\/g, '/'));
  };

  await shot('initial');
  if (fpsWindow > 0) report.fps.push({ label: 'initial', ...(await measureFps(fpsWindow)) });

  for (const step of script) {
    if (step.wait) await sleep(step.wait);
    else if (step.key) { await page.keyboard.down(step.key); await sleep(step.hold ?? 300); await page.keyboard.up(step.key); }
    else if (step.press) await page.keyboard.press(step.press);
    else if (step.eval) {
      try { const r = await page.evaluate(step.eval); report.evals.push({ code: step.eval, result: r ?? null }); }
      catch (e) { report.evals.push({ code: step.eval, error: String(e) }); }
    }
    else if (step.shot) await shot(step.shot);
    else if (step.fps) report.fps.push({ label: step.label ?? `fps${report.fps.length}`, ...(await measureFps(step.fps)) });
    else if (step.click) {
      // (puppeteer ≥ 22: `count` presses the button that many times — clickCount 1, 2, … — so the
      // page gets a real 'dblclick'; a lone `clickCount` option is overridden by it)
      await page.mouse.click(step.click[0], step.click[1], { button: step.button ?? 'left', count: step.count ?? 1 });
    }
    else if (step.dblclick) await page.mouse.click(step.dblclick[0], step.dblclick[1], { count: 2 });
    else if (step.move) await page.mouse.move(step.move[0], step.move[1], { steps: step.steps ?? 1 });
    else if (step.mouse === 'down' || step.mouse === 'up') {
      await page.mouse[step.mouse]({ button: step.button ?? 'left' });
    }
    else if (step.drag) {
      // real mouse drag through the points [[x,y], ...] (steps interpolated moves per segment)
      const pts = step.drag;
      const button = step.button ?? 'left';
      if (step.modifiers) for (const m of step.modifiers) await page.keyboard.down(m);
      await page.mouse.move(pts[0][0], pts[0][1]);
      await page.mouse.down({ button });
      for (let k = 1; k < pts.length; k++) {
        await page.mouse.move(pts[k][0], pts[k][1], { steps: step.steps ?? 8 });
        if (step.pause) await sleep(step.pause);
      }
      await page.mouse.up({ button });
      if (step.modifiers) for (const m of [...step.modifiers].reverse()) await page.keyboard.up(m);
    }
    else if (step.wheel) {
      await page.mouse.move(step.wheel[0], step.wheel[1]);
      await page.mouse.wheel({ deltaY: step.deltaY ?? -240 });
    }
    else if (step.type !== undefined) {
      if (step.selector) await page.click(step.selector, { count: 3 }); // (triple click: select the text)
      await page.keyboard.type(String(step.type), { delay: step.delay ?? 10 });
    }
    else if (step.combo) {
      // e.g. { "combo": ["Control", "KeyZ"] } — hold all but the last key, tap the last
      const keys = step.combo;
      for (const k of keys.slice(0, -1)) await page.keyboard.down(k);
      await page.keyboard.press(keys[keys.length - 1]);
      for (const k of keys.slice(0, -1).reverse()) await page.keyboard.up(k);
    }
    else if (step.goto) {
      const target = step.goto.startsWith('http') ? step.goto : `${base}/${step.goto.replace(/^\//, '')}`;
      await page.goto(target, { waitUntil: 'load', timeout: 60000 });
    }
    else if (step.tab !== undefined) {
      // continue in another tab (e.g. the one the editor's Play button opened): 'last' or an index
      const t0 = Date.now();
      let pages = await browser.pages();
      while (step.tab === 'last' && pages.length < 2 && Date.now() - t0 < 10000) { await sleep(200); pages = await browser.pages(); }
      const next = step.tab === 'last' ? pages[pages.length - 1] : pages[Number(step.tab)];
      if (!next) throw new Error(`no tab ${step.tab} (${pages.length} open)`);
      if (next !== page) {
        watch(next);
        page = next;
        await page.setViewport({ width, height });
        await page.bringToFront();
        report.evals.push({ code: `tab ${step.tab}`, result: page.url() });
      }
    }
  }
} catch (e) {
  report.pageErrors.push(`HARNESS: ${e?.stack ?? e}`);
} finally {
  await browser.close();
  await server.close();
}

if (report.pageErrors.length) exitCode = 1;
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));

/** @param {string[]} a */
const uniq = (a) => [...new Set(a)];
console.log(`URL: ${url}`);
console.log(`GPU: ${report.gl}`);
console.log(`FPS: ${report.fps.map((f) => `${f.label}=${f.fps} (p50 ${f.p50ms}ms, p95 ${f.p95ms}ms)`).join(' | ') || 'n/a'}`);
console.log(`Page errors (${report.pageErrors.length}):`);
uniq(report.pageErrors).slice(0, 20).forEach((e) => console.log('  ' + e.split('\n').slice(0, 6).join('\n    ')));
console.log(`Console errors (${report.errors.length}):`);
uniq(report.errors).slice(0, 20).forEach((e) => console.log('  ' + e.slice(0, 500)));
console.log(`Console warnings (${report.warnings.length}):`);
uniq(report.warnings).slice(0, 10).forEach((e) => console.log('  ' + e.slice(0, 300)));
console.log(`Failed requests (${report.failedRequests.length}):`);
uniq(report.failedRequests).slice(0, 10).forEach((e) => console.log('  ' + e));
if (report.evals.length) {
  console.log('Evals:');
  report.evals.forEach((e) => console.log(`  ${e.code} => ${String(JSON.stringify(e.result ?? e.error ?? null)).slice(0, 400)}`));
}
console.log(`Screenshots: ${report.shots.join(', ')}`);
process.exit(exitCode);
