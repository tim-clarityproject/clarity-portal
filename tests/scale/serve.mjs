// Serves a built portal the way Vercel does for the scale check: the same
// rewrites and Cache-Control headers as tests/phase4/serve-build.mjs and
// vercel.json, plus brotli or gzip, as Vercel's edge sends them, so the bytes
// a phone downloads on 4G are the real ones. /api/* is never served (nothing
// can be sent from a test).
//
//   node tests/scale/serve.mjs <built folder> [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8',
};
const SQUEEZE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.vtt']);
function cacheControl(path) {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (path === '/version.json') return 'no-store';
  if (path === '/sw.js') return 'no-cache';
  return 'public, max-age=0, must-revalidate';
}
const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

export async function serveScale({ root, port }) {
  const dir = resolve(root);
  const packed = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}'); return; }
    let file = join(dir, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    let served = path;
    if (path.startsWith('/health-check/')) { file = join(dir, 'health-check.html'); served = '/health-check.html'; } else if (path.endsWith('/') || !(await isFile(file))) {
      if (path.startsWith('/assets/')) { res.writeHead(404); res.end(); return; }
      file = join(dir, 'index.html'); served = '/index.html';
    }
    try {
      const ext = extname(file);
      let body = await readFile(file);
      const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cacheControl(served), 'Timing-Allow-Origin': '*', Vary: 'Accept-Encoding' };
      const accept = String(req.headers['accept-encoding'] || '');
      if (SQUEEZE.has(ext) && body.length > 1024) {
        const enc = /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null;
        if (enc) {
          const key = `${file}|${enc}`;
          if (!packed.has(key)) packed.set(key, enc === 'br' ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzipSync(body, { level: 9 }));
          body = packed.get(key);
          headers['Content-Encoding'] = enc;
        }
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => { server.listen(port, '127.0.0.1', r); });
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, port = '4319'] = process.argv.slice(2);
  if (!root) throw new Error('Which built folder?');
  const s = await serveScale({ root, port: Number(port) });
  console.log(`Serving ${root} at ${s.url}`);
}
