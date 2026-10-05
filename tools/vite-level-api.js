/**
 * Vite dev-server plugin: a tiny REST API so the level editor can save levels straight into the
 * project (`public/levels/<name>.json`). Files in public/ are served as-is in dev and copied into
 * dist/ by `npm run build`, so saved levels are playable at `?level=<name>` everywhere.
 *
 *   GET    /api/levels          → { levels: [{ name, file, title, size, modified }] }
 *   GET    /api/levels/:name    → the level JSON
 *   PUT    /api/levels/:name    → write (content-type: application/json, body = level JSON,
 *                                 validated), → { ok, file }
 *   DELETE /api/levels/:name    → delete, → { ok }
 *
 * Any other method → 405 (writes go only through PUT; POST is refused; OPTIONS: see below). A PUT
 * whose content type is not `application/json` → 415, so no browser can send a write as a CORS
 * "simple" request.
 *
 * Same origin only. Every request (reads too) is refused with 403 before anything is read or
 * written when it comes from a page of another origin: its `Origin` header — or, without one,
 * its `Sec-Fetch-Site` (only `same-origin`, and `none` for a GET typed into the address bar, pass)
 * or `Referer` — must be this dev server, i.e. `http://<request Host>` (https: on TLS), plus
 * `127.0.0.1`, `localhost` and `[::1]` on the same port when the Host is one of those. Pages on
 * other ports are other origins. A request with none of these headers is a command-line client
 * (curl, a node script) and is served: browsers always send `Origin` with PUT and DELETE.
 * No CORS is granted: this plugin answers preflights (OPTIONS) for /api/levels itself — 403 for
 * other origins, else 204 with `Allow` and no CORS headers — ahead of Vite's CORS middleware
 * (which would allow every localhost port), and strips Access-Control-* headers from its answers.
 * DNS rebinding (a foreign name resolving to 127.0.0.1, so Origin matches Host) is refused by
 * Vite's Host check (`server.allowedHosts`), which runs before the handler.
 *
 * Only active in `vite` (serve), never in production.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * @import { IncomingMessage, ServerResponse } from 'node:http'
 * @import { Plugin } from 'vite'
 */

const NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;
/** Windows device names: `con.json` & co. cannot be real files there (LevelStorage.slugify avoids them). */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/;
const MAX_BYTES = 4 * 1024 * 1024;
/** Loopback host names that reach the same server on the same port (Host header spelling). */
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

/**
 * JSON answer; never carries CORS headers (Vite's CORS middleware may have added some).
 * @param {ServerResponse} res
 * @param {number} status
 * @param {unknown} body sent as JSON
 * @param {Record<string, string>} [headers] extra response headers
 */
function send(res, status, body, headers = {}) {
  for (const h of res.getHeaderNames()) if (h.startsWith('access-control-')) res.removeHeader(h);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/**
 * The origins that are this dev server for `req` (from its Host header).
 * @param {IncomingMessage} req
 * @returns {string[]}
 */
function ownOrigins(req) {
  const host = req.headers.host ?? req.headers[':authority'];
  if (!host) return [];
  // (a tls.TLSSocket, which has `encrypted: true`, when the dev server runs on https)
  const scheme = /** @type {{ encrypted?: boolean }} */ (req.socket)?.encrypted ? 'https:' : 'http:';
  let url;
  try { url = new URL(`${scheme}//${host}`); } catch { return []; }
  if (!LOOPBACK.includes(url.hostname)) return [url.origin];
  const port = url.port ? `:${url.port}` : '';
  return [url.origin, ...LOOPBACK.map((h) => `${scheme}//${h}${port}`)];
}

/**
 * `scheme://host[:port]` of a URL (a Referer), or null.
 * @param {string} href
 * @returns {string|null}
 */
function originOf(href) {
  try { return new URL(href).origin; } catch { return null; }
}

/**
 * Why `req` may not use the API — it comes from a page of another origin — or null when it may.
 * Browsers send `Origin` with every cross-origin request that can change something; same-origin
 * GETs carry only `Sec-Fetch-Site` (on http://127.0.0.1 / localhost) and `Referer`.
 * @param {IncomingMessage} req
 * @returns {string|null}
 */
function refusal(req) {
  const own = ownOrigins(req);
  const only = `only pages served by this dev server (${own[0] ?? 'same origin'}) may use the level API`;
  const origin = req.headers.origin;
  if (origin !== undefined) return own.includes(origin) ? null : `request from ${origin} refused: ${only}`;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined) {
    const read = req.method === 'GET' || req.method === 'HEAD';
    return site === 'same-origin' || (site === 'none' && read) ? null : `request refused (Sec-Fetch-Site: ${site}): ${only}`;
  }
  const referer = req.headers.referer;
  if (referer !== undefined) {
    const from = originOf(referer);
    return from && own.includes(from) ? null : `request from ${from ?? 'another page'} refused: ${only}`;
  }
  return null;
}

/**
 * The plugin (vite.config.js).
 * @param {{ dir?: string }} [options] the level folder, relative to the Vite root
 * @returns {Plugin}
 */
export default function levelApi({ dir = 'public/levels' } = {}) {
  let root = '';
  return {
    name: 'lumina-level-api',
    apply: 'serve',
    configResolved(config) {
      root = path.resolve(config.root, dir);
    },
    configureServer(server) {
      // Runs first (moved ahead of Vite's CORS middleware): refuse other origins, answer preflights.
      server.middlewares.use('/api/levels', (req, res, next) => {
        const why = refusal(req);
        if (why) return send(res, 403, { error: why });
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.setHeader('allow', 'GET, PUT, DELETE');
          return res.end();
        }
        return next();
      });
      const stack = server.middlewares.stack;
      if (Array.isArray(stack)) stack.unshift(stack.pop());

      server.middlewares.use('/api/levels', async (req, res) => {
        try {
          const why = refusal(req); // again, in case the guard above could not be moved first
          if (why) return send(res, 403, { error: why });
          await fs.mkdir(root, { recursive: true });
          const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, ''));
          if (!name) {
            if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' }, { allow: 'GET' });
            const files = (await fs.readdir(root)).filter((f) => f.endsWith('.json'));
            const levels = [];
            for (const f of files) {
              const st = await fs.stat(path.join(root, f));
              let title = f.replace(/\.json$/, '');
              try { title = JSON.parse(await fs.readFile(path.join(root, f), 'utf8')).name ?? title; } catch { /* keep file name */ }
              levels.push({ name: f.replace(/\.json$/, ''), file: `levels/${f}`, title, size: st.size, modified: st.mtimeMs });
            }
            levels.sort((a, b) => b.modified - a.modified);
            return send(res, 200, { levels });
          }
          if (!NAME.test(name)) return send(res, 400, { error: 'invalid level name (use a-z, 0-9 and -)' });
          if (RESERVED.test(name)) return send(res, 400, { error: `“${name}” is a reserved file name on Windows — choose another name` });
          const file = path.join(root, `${name}.json`);
          if (req.method === 'GET') {
            try { return send(res, 200, JSON.parse(await fs.readFile(file, 'utf8'))); } catch { return send(res, 404, { error: 'not found' }); }
          }
          if (req.method === 'DELETE') {
            await fs.rm(file, { force: true });
            return send(res, 200, { ok: true });
          }
          if (req.method === 'PUT') {
            const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
            if (type !== 'application/json') return send(res, 415, { error: 'content-type must be application/json' });
            const chunks = [];
            let size = 0;
            for await (const c of req) {
              size += c.length;
              if (size > MAX_BYTES) return send(res, 413, { error: 'level too large' });
              chunks.push(c);
            }
            const text = Buffer.concat(chunks).toString('utf8');
            let data;
            try { data = JSON.parse(text); } catch { return send(res, 400, { error: 'body is not valid JSON' }); }
            if (data?.format !== 'lumina-level' || !Array.isArray(data.tiles) || !Array.isArray(data.heights)) {
              return send(res, 400, { error: 'body is not a lumina-level' });
            }
            const tmp = `${file}.tmp`;
            try {
              await fs.writeFile(tmp, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
              await fs.rename(tmp, file);
            } catch (e) {
              // never leave a .tmp behind (npm run build would copy it into dist/)
              await fs.rm(tmp, { force: true }).catch(() => {});
              const why = ['EPERM', 'EACCES', 'EBUSY'].includes(e?.code)
                ? 'the file is read-only or in use by another program' : (e?.code ?? 'write error');
              return send(res, 500, { error: `Cannot write public/levels/${name}.json (${why})` });
            }
            return send(res, 200, { ok: true, file: `levels/${name}.json` });
          }
          return send(res, 405, { error: 'method not allowed' }, { allow: 'GET, PUT, DELETE' });
        } catch (e) {
          return send(res, 500, { error: String(e?.message ?? e) });
        }
      });
    },
  };
}
