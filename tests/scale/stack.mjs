// A local stand-in for Supabase, for the scale and speed check (Phase 6a
// scale check, 22 Nov). Nothing hosted is touched and nothing is sent.
//
//   node tests/scale/stack.mjs --snapshot <base-scale.tar> [--port 54400]
//
// One Node process:
//   - PGlite (Postgres in WASM, in memory) loaded from a snapshot made by
//     tests/scale/db.mjs, served on a local socket by @electric-sql/pglite-socket;
//   - the official PostgREST binary (path in POSTGREST_BIN, pinned v16.5 in
//     the README) over that socket, one connection, roles anon and
//     authenticated, so every request runs under the real row rules;
//   - a small stand-in for GoTrue (sign in by password for seeded people,
//     refresh, user, logout): its tokens say aal2 for coaches with an
//     authenticator turned on (053/054), aal1 for everyone else;
//   - one router on --port: /rest/v1 to PostgREST, /auth/v1 to the stand-in,
//     /functions/v1 and /storage/v1 answered here, never forwarded anywhere.
//
// Every request through the router is counted (GET /__stats?since=<n>):
// path, status, milliseconds, bytes and rows returned. GET /__plan replays a
// GET with EXPLAIN ANALYZE as the same person (PostgREST's plan output).
//
// Dependencies live in tests/scale/package.json (npm install there), never
// in the app's package.json. The secret below is for this local stand-in only.
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export const JWT_SECRET = 'local-scale-check-only-not-a-real-secret-0123456789';
export const PASSWORD = 'scale-pass-1234';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const snapshot = opt('snapshot');
const PORT = Number(opt('port', 54400));
const DB_PORT = PORT + 1;
const PGRST_PORT = PORT + 2;
const PGRST_BIN = process.env.POSTGREST_BIN || opt('postgrest');

const b64u = (b) => Buffer.from(b).toString('base64url');
export function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export const ANON_KEY = signJwt({ role: 'anon', iss: 'scale-local', iat: 1763000000, exp: 2079000000 });

if (!snapshot || !PGRST_BIN) {
  console.log('Usage: POSTGREST_BIN=<path> node tests/scale/stack.mjs --snapshot <file.tar> [--port 54400]');
  process.exit(2);
}

const t0 = Date.now();
const db = await PGlite.create({ loadDataDir: new Blob([readFileSync(snapshot)]), extensions: { pgcrypto, uuid_ossp, btree_gist, citext, pg_trgm } });
// The people who can sign in, read once before anything else uses the database.
const people = new Map();
{
  const r = await db.query(`
    select u.id, lower(u.email) as email, coalesce(c.role, '') as coach_role,
           (a.user_id is not null) as has_code, a.factor_id
      from auth.users u
      left join public.coaches c on c.user_id = u.id and c.active
      left join public.coach_authenticators a on a.user_id = u.id
     where u.email is not null`);
  for (const p of r.rows) people.set(p.email, p);
}
const socket = new PGLiteSocketServer({ db, port: DB_PORT, host: '127.0.0.1', maxConnections: 1 });
await socket.start();
console.log(`database ready on ${DB_PORT} (${people.size} people, ${Date.now() - t0} ms)`);

const pgrst = spawn(PGRST_BIN, [], {
  env: {
    PATH: process.env.PATH,
    PGRST_DB_URI: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_DB_POOL: '1',
    PGRST_DB_CHANNEL_ENABLED: 'false',
    PGRST_DB_PLAN_ENABLED: 'true',
    PGRST_DB_PREPARED_STATEMENTS: 'false',
    PGRST_DB_CONFIG: 'false',
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_HOST: '127.0.0.1',
    PGRST_SERVER_PORT: String(PGRST_PORT),
    PGRST_LOG_LEVEL: 'error',
    PGRST_DB_MAX_ROWS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
pgrst.stdout.on('data', (d) => { if (process.env.SCALE_DEBUG) process.stdout.write(`[postgrest] ${d}`); });
pgrst.stderr.on('data', (d) => process.stdout.write(`[postgrest] ${String(d).slice(0, 400)}`));
pgrst.on('exit', (code) => { console.log(`postgrest stopped (${code})`); });

// ---- the stand-in for GoTrue ----
const sessions = new Map(); // refresh token -> { email, aal, sid }
function userFor(p) {
  const factors = p.has_code ? [{ id: p.factor_id || randomUUID(), friendly_name: 'Authenticator', factor_type: 'totp', status: 'verified', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }] : [];
  return { id: p.id, aud: 'authenticated', role: 'authenticated', email: p.email, email_confirmed_at: '2026-01-01T00:00:00Z', confirmed_at: '2026-01-01T00:00:00Z',
    phone: '', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], factors,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), is_anonymous: false };
}
export function sessionFor(p, aal = p.has_code ? 'aal2' : 'aal1', sid = randomUUID()) {
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: 'password', timestamp: now }];
  if (aal === 'aal2') amr.push({ method: 'totp', timestamp: now });
  const access = signJwt({ sub: p.id, aud: 'authenticated', role: 'authenticated', email: p.email, aal, amr, session_id: sid, iat: now, exp: now + 86400, is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {} });
  const refresh = `rt-${randomUUID()}`;
  sessions.set(refresh, { email: p.email, aal, sid });
  return { access_token: access, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: refresh, user: userFor(p) };
}
function claimsOf(req) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()); } catch { return null; }
}
async function readBody(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); }
function send(res, status, obj, headers = {}) {
  const body = obj === null ? '' : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
  return Buffer.byteLength(body);
}
async function gotrue(req, res, path, url) {
  if (path === '/health' || path === '/settings') return send(res, 200, path === '/settings' ? { external: { email: true }, disable_signup: true, mailer_autoconfirm: false } : { name: 'scale-local' });
  if (path === '/token' && req.method === 'POST') {
    const body = JSON.parse(String(await readBody(req)) || '{}');
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const p = people.get(String(body.email || '').toLowerCase());
      if (!p || body.password !== PASSWORD) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' });
      return send(res, 200, sessionFor(p, 'aal1'));
    }
    if (grant === 'refresh_token') {
      const s = sessions.get(body.refresh_token);
      if (!s) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token', code: 'refresh_token_not_found' });
      sessions.delete(body.refresh_token);
      return send(res, 200, sessionFor(people.get(s.email), s.aal, s.sid));
    }
    return send(res, 400, { error: 'unsupported_grant_type' });
  }
  if (path === '/user') {
    const c = claimsOf(req);
    const p = c && [...people.values()].find((x) => x.id === c.sub);
    if (!p) return send(res, 401, { code: 401, msg: 'not signed in' });
    return send(res, 200, userFor(p));
  }
  if (path === '/logout') { res.writeHead(204); res.end(); return 0; }
  // An already-signed-in coach (aal2) never needs these; answered, never sent anywhere.
  return send(res, 404, { code: 404, msg: `not in the local stand-in: ${path}` });
}

// ---- the router ----
const stats = [];
let seq = 0;
function cors(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Profile, X-Total-Count, Preference-Applied',
    'Timing-Allow-Origin': '*',
  };
}
function rowsIn(buf, headers) {
  const range = headers['content-range'];
  try {
    const j = JSON.parse(String(buf));
    if (Array.isArray(j)) return j.length;
    return j && typeof j === 'object' ? 1 : 0;
  } catch { /* not JSON */ }
  if (range && /^(\d+)-(\d+)/.test(range)) { const m = /^(\d+)-(\d+)/.exec(range); return Number(m[2]) - Number(m[1]) + 1; }
  return 0;
}
function proxy(req, res, path, body, extraHeaders = {}) {
  return new Promise((resolveP) => {
    const headers = { ...req.headers, ...extraHeaders };
    delete headers.host;
    delete headers['accept-encoding'];
    const up = httpRequest({ host: '127.0.0.1', port: PGRST_PORT, method: req.method, path, headers }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolveP({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    });
    up.on('error', (e) => resolveP({ status: 502, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ message: `stand-in: ${e.message}` })) }));
    up.end(body);
  });
}
const router = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const c = cors(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, c); res.end(); return; }
  for (const [k, v] of Object.entries(c)) res.setHeader(k, v);
  const started = performance.now();
  const entry = { n: ++seq, at: Date.now(), method: req.method, path: url.pathname + url.search, status: 0, ms: 0, bytes: 0, rows: 0 };
  try {
    if (url.pathname === '/__stats') { send(res, 200, stats.filter((s) => s.n > Number(url.searchParams.get('since') || 0))); return; }
    if (url.pathname === '/__seq') { send(res, 200, { seq }); return; }
    if (url.pathname === '/__session') {
      const p = people.get(String(url.searchParams.get('email') || '').toLowerCase());
      if (!p) { send(res, 404, { msg: 'no such person' }); return; }
      send(res, 200, sessionFor(p, url.searchParams.get('aal') || undefined)); return;
    }
    if (url.pathname === '/__plan') {
      // Replays one GET as the person in the Authorization header, with EXPLAIN ANALYZE.
      const target = url.searchParams.get('path');
      if (!target || !target.startsWith('/rest/v1/')) { send(res, 400, { msg: 'path must be a /rest/v1 GET' }); return; }
      const r = await proxy({ method: 'GET', headers: req.headers }, res, target.slice(8), undefined, { accept: 'application/vnd.pgrst.plan+text; for="application/json"; options=analyze|buffers' });
      res.writeHead(r.status, { 'Content-Type': 'text/plain' }); res.end(r.body); return;
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const r = await proxy(req, res, url.pathname.slice(8) + url.search, body);
      const h = { ...r.headers };
      delete h['transfer-encoding']; delete h.connection; delete h['content-length'];
      // Supabase's edge compresses answers; so does this, so 4G bytes are the real ones.
      let wire = r.body;
      if (r.body.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) { wire = gzipSync(r.body); h['content-encoding'] = 'gzip'; }
      res.writeHead(r.status, h);
      res.end(wire);
      Object.assign(entry, { status: r.status, bytes: r.body.length, wire: wire.length, rows: r.status < 300 ? rowsIn(r.body, r.headers) : 0, startMs: Math.round(started) });
    } else if (url.pathname.startsWith('/auth/v1/')) {
      entry.bytes = await gotrue(req, res, url.pathname.slice(8), url);
      entry.status = res.statusCode;
    } else if (url.pathname.startsWith('/functions/v1/') || url.pathname.startsWith('/storage/v1/')) {
      // Never forwarded: an edge function or a file is answered here as not available.
      entry.bytes = send(res, 404, { message: 'not in the local stand-in' });
      entry.status = 404;
    } else {
      entry.bytes = send(res, 404, { message: 'not found' });
      entry.status = 404;
    }
  } catch (e) {
    if (!res.headersSent) send(res, 500, { message: `stand-in: ${e.message}` });
    entry.status = 500;
  } finally {
    entry.ms = Math.round((performance.now() - started) * 10) / 10;
    if (!url.pathname.startsWith('/__')) stats.push(entry);
  }
});
router.listen(PORT, '127.0.0.1');

// Wait for PostgREST's schema cache.
for (let i = 0; i < 240; i += 1) {
  const ok = await new Promise((r) => {
    const q = httpRequest({ host: '127.0.0.1', port: PGRST_PORT, path: '/', method: 'GET', headers: { Authorization: `Bearer ${ANON_KEY}` } }, (x) => { x.resume(); r(x.statusCode < 500); });
    q.on('error', () => r(false));
    q.end();
  });
  if (ok) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log(`stand-in API ready on http://localhost:${PORT}, ${Math.round((Date.now() - t0) / 1000)} s`);
if (process.env.SCALE_PRINT_ANON) console.log(`anon key (local stand-in only): ${ANON_KEY}`);

async function stop() {
  try { pgrst.kill('SIGTERM'); } catch { /* gone */ }
  router.close();
  await socket.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
