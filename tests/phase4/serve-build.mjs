// A small static server for a built portal (vite build), answering as
// Vercel does with vercel.json: /health-check/* serves health-check.html,
// a real file is served as it is, /api/* is never served (no email can be
// sent from a test), and every other path serves index.html. The same
// Cache-Control headers as vercel.json, so the browser treats sw.js,
// index.html and /assets/ as it will on the live site.
//
//   node tests/phase4/serve-build.mjs <built folder> [port]   (a launcher)
//   import { serveBuild } from './serve-build.mjs'             (offline.mjs)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
};

function cacheControl(path) {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (path === '/version.json') return 'no-store';
  if (path === '/sw.js') return 'no-cache';
  return 'public, max-age=0, must-revalidate';
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {{ root: string, port: number }} opts root may be changed later with setRoot
 * @returns {Promise<{ url: string, setRoot: (dir: string) => void, setDown: (down: boolean) => void,
 *   close: () => Promise<void>, hits: Array<{path: string}> }>}
 */
export async function serveBuild({ root, port }) {
  let dir = resolve(root);
  let down = false;
  const hits = [];
  const server = createServer(async (req, res) => {
    // "No signal": the connection is dropped without an answer.
    if (down) {
      req.socket.destroy();
      return;
    }
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    hits.push({ path, method: req.method });
    if (path.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"ok":false,"error":"failed"}');
      return;
    }
    let file = join(dir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    let served = path;
    if (path.startsWith('/health-check/')) {
      file = join(dir, 'health-check.html');
      served = '/health-check.html';
    } else if (path.endsWith('/') || !(await isFile(file))) {
      if (path.startsWith('/assets/')) {
        res.writeHead(404);
        res.end();
        return;
      }
      file = join(dir, 'index.html');
      served = '/index.html';
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': cacheControl(served) });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => { server.listen(port, '127.0.0.1', r); });
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    setRoot: (next) => { dir = resolve(next); },
    setDown: (value) => { down = value; },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, port = '4173'] = process.argv.slice(2);
  if (!root) throw new Error('Which built folder?');
  const s = await serveBuild({ root, port: Number(port) });
  console.log(`Serving ${root} at ${s.url}`);
}

/**
 * A pass-through to the test database, so a test can drop the database's
 * connection in any browser (WebKit's offline mode stops a service
 * worker's navigations, and its routing doesn't see a controlled page's
 * requests). Every request is recorded. Only ever forwards to `target`.
 *
 * @param {{ target: string, port: number }} opts
 */
export async function proxyTo({ target, port }) {
  const base = new URL(target);
  let down = false;
  let blockWrites = false;
  const hits = [];
  const server = createServer(async (req, res) => {
    const write = /^\/rest\/v1\/(?!rpc\/)/.test(req.url) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (down || (write && blockWrites)) {
      req.socket.destroy();
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (req.method !== 'OPTIONS') hits.push({ method: req.method, url: req.url, body: body.toString('utf8'), write });
    const headers = { ...req.headers, host: base.host };
    delete headers['content-length'];
    delete headers['accept-encoding'];
    try {
      const answer = await fetch(new URL(req.url, base), {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
        redirect: 'manual',
      });
      const out = {};
      answer.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) out[k] = v; });
      res.writeHead(answer.status, out);
      res.end(Buffer.from(await answer.arrayBuffer()));
    } catch {
      req.socket.destroy();
    }
  });
  await new Promise((r) => { server.listen(port, '127.0.0.1', r); });
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    setDown: (value) => { down = value; },
    setBlockWrites: (value) => { blockWrites = value; },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
