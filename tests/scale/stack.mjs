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
//     /functions/v1 and /storage/v1 answered here, never forwarded anywhere,
//     and /standin/v1 for two server steps the app's stand-ins can't write.
//
// Every request through the router is counted (GET /__stats?since=<n>):
// path, status, milliseconds, bytes and rows returned. GET /__plan replays a
// GET with EXPLAIN ANALYZE as the same person (PostgREST's plan output).
//
// Dependencies live in tests/scale/package.json (npm install there), never
// in the app's package.json. The secret below is for this local stand-in only.
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { JWT_SECRET, PASSWORD, signJwt, ANON_KEY } from './local-keys.mjs';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';

export { JWT_SECRET, PASSWORD, signJwt, ANON_KEY };

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const snapshot = opt('snapshot');
const PORT = Number(opt('port', 54400));
const DB_PORT = PORT + 1;
const PGRST_PORT = PORT + 2;
const PGRST_BIN = process.env.POSTGREST_BIN || opt('postgrest');

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
  // The authenticator's challenge and code (053, 054): a coach with an
  // authenticator turned on gives any six-digit code and the sign-in becomes
  // aal2, as Supabase's own verify does. The suites' standing coaches use it
  // through tests/signin/aal2.mjs (tests/target.mjs gives them a stand-in key).
  const mfa = /^\/factors\/([^/]+)\/(challenge|verify)$/.exec(path);
  if (mfa && req.method === 'POST') {
    const c = claimsOf(req);
    const p = c && [...people.values()].find((x) => x.id === c.sub);
    if (!p || !p.has_code) return send(res, 422, { code: 'mfa_factor_not_found', msg: 'no authenticator' });
    if (mfa[2] === 'challenge') return send(res, 200, { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    const body = JSON.parse(String(await readBody(req)) || '{}');
    if (!/^\d{6}$/.test(String(body.code || ''))) return send(res, 422, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
    return send(res, 200, sessionFor(p, 'aal2', c.session_id));
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

// ---- the stand-in's own answers for two server steps (Polish 1, FX4: P14, P15) ----
// Off the live site the app answers its server's asks with stand-ins (src/lib/agreements/asks.js), which write nothing.
// Two need the database to follow the flow locally: a quote sent (its Q- number and status in agreement_quotes, the
// server's alone under 065's guard) and a refund or credit (its credit note). POST /standin/v1/quote-sent and
// /standin/v1/credit-note, with the coach's own sign-in: the row is read as them first (their row rules), then written
// as the server would, through PostgREST with a service role token. Only on this local stand-in.
const SERVICE = signJwt({ role: 'service_role', iss: 'scale-local', iat: 1763000000, exp: 2079000000 });
function rest(method, path, body, token) {
  return new Promise((resolveP) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' };
    const up = httpRequest({ host: '127.0.0.1', port: PGRST_PORT, method, path, headers }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => { let json = null; try { json = JSON.parse(String(Buffer.concat(chunks))); } catch { json = null; } resolveP({ status: r.statusCode, json }); });
    });
    up.on('error', () => resolveP({ status: 502, json: null }));
    up.end(data);
  });
}
const dayPlus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function standIn(req, res, path) {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
  const c = claimsOf(req);
  if (!c?.sub || c.role !== 'authenticated') return send(res, 401, { ok: false, message: 'Sign in again to carry on.' });
  const body = JSON.parse(String(await readBody(req)) || '{}');
  const id = String(body.quoteId || body.invoiceId || body.agreementId || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return send(res, 400, { ok: false, message: 'That isn’t here.' });
  if (path === '/pause' || path === '/extend' || path === '/end-early') {
    // The changes to a running agreement, written as api/_routes/coach-agreements.js writes them (its pause, extend and
    // endEarly), so a pause can be followed on the dev server (the Stage D UI tester's fault 2): the same refusals, the
    // same columns, no email and no session touched.
    const mine = await rest('GET', `/agreements?id=eq.${id}&select=id,status,current_version,ends_on,ending_on,ending_by,paused_from,paused_to`, undefined, tok);
    const a = mine.json?.[0];
    if (!a) return send(res, 403, { ok: false, message: 'That agreement isn’t yours.' });
    if (a.status !== 'signed') return send(res, 409, { ok: false, message: 'Only a signed agreement can be changed this way.', calm: true });
    const vs = await rest('GET', `/agreement_versions?agreement_id=eq.${id}&version=eq.${a.current_version}&select=terms`, undefined, tok);
    const end = a.ends_on || (a.ending_on && !a.ending_by ? a.ending_on : null) || vs.json?.[0]?.terms?.endsOn || null;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const { pauseMove, pauseProblem, endEarlyProblem, PAUSED_ALREADY } = await import('../../src/lib/agreements/endDate.js');
    let patch;
    let answer;
    if (path === '/pause') {
      if (!end) return send(res, 409, { ok: false, message: 'This agreement has no end date to move.', calm: true });
      // As the server's pause: an agreement that doesn't allow pausing, one ending early, a pause longer than the
      // screens offer and a second pause are refused (pauseProblem; the claim below takes one only while none is kept).
      if (vs.json?.[0]?.terms?.pausing === false) return send(res, 409, { ok: false, message: 'This agreement doesn’t allow pausing.', calm: true });
      const stop = pauseProblem({ from: body.from, to: body.to, today, end, paused: a.paused_from ? { from: a.paused_from, to: a.paused_to || null } : null, earlyEnd: a.ending_by ? a.ending_on : null });
      if (stop) return send(res, 409, { ok: false, message: stop, calm: true });
      const moved = pauseMove(end, body.from, body.to);
      patch = { paused_from: body.from, paused_to: body.to, ends_on: moved.end };
      answer = { endsOn: moved.end, emailed: false };
    } else if (path === '/extend') {
      if (end && !(body.endsOn > end)) return send(res, 409, { ok: false, message: 'Choose an end date after the current one.', calm: true });
      patch = { ends_on: body.endsOn };
      answer = { endsOn: body.endsOn, emailed: false };
    } else {
      const stop = endEarlyProblem({ on: body.endsOn, today, end, earlyEnd: a.ending_by ? a.ending_on : null });
      if (stop) return send(res, 409, { ok: false, message: stop, calm: true });
      patch = { ending_on: body.endsOn, ending_by: body.by === 'coach' ? 'coach' : 'client' };
      answer = { endingOn: body.endsOn, emailed: false };
    }
    const up = await rest('PATCH', `/agreements?id=eq.${id}${path === '/pause' ? '&paused_from=is.null' : ''}`, patch, SERVICE);
    if (up.status >= 300) return send(res, 409, { ok: false, message: 'That change wasn’t kept on the stand-in.' });
    if (path === '/pause' && !(Array.isArray(up.json) && up.json.length)) {
      return send(res, 409, { ok: false, message: PAUSED_ALREADY, calm: true });
    }
    return send(res, 200, { ok: true, ...answer });
  }
  if (path === '/quote-sent') {
    const mine = await rest('GET', `/agreement_quotes?id=eq.${id}&select=id,status,valid_days`, undefined, tok);
    const q = mine.json?.[0];
    if (!q) return send(res, 403, { ok: false, message: 'That quote isn’t yours.' });
    const n = await rest('POST', '/rpc/quote_take_number', { p_quote: id }, SERVICE);
    const sentAt = new Date().toISOString();
    const validUntil = dayPlus(Number(body.validDays) || Number(q.valid_days) || 30);
    const up = await rest('PATCH', `/agreement_quotes?id=eq.${id}`, { status: 'sent', sent_at: sentAt, valid_until: validUntil }, SERVICE);
    if (n.status >= 300 || up.status >= 300) return send(res, 409, { ok: false, message: 'The quote wasn’t numbered on the stand-in.' });
    return send(res, 200, { ok: true, quoteNumber: Number(n.json) || null, sentAt, validUntil });
  }
  if (path === '/credit-note') {
    const mine = await rest('GET', `/invoices?id=eq.${id}&select=id,coach_id,currency,status,paid_minor`, undefined, tok);
    const inv = mine.json?.[0];
    if (!inv) return send(res, 403, { ok: false, message: 'That invoice isn’t yours.' });
    const kind = body.kind === 'credit' ? 'credit' : 'refund';
    const made = await rest('POST', '/credit_notes', { invoice_id: inv.id, coach_id: inv.coach_id, kind, amount_minor: Math.round(Number(body.amount) || 0),
      currency: inv.currency || 'GBP', reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null }, SERVICE);
    if (made.status >= 300) return send(res, 409, { ok: false, message: 'That’s more than was settled on this invoice.' });
    return send(res, 200, { ok: true, kind, number: made.json?.[0]?.number || null });
  }
  return send(res, 404, { ok: false, message: 'not in the local stand-in' });
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
    } else if (url.pathname.startsWith('/standin/v1/') && req.method === 'POST') {
      entry.bytes = await standIn(req, res, url.pathname.slice(11));
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
