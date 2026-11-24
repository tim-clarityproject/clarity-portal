// Vercel's Hobby plan takes at most 12 functions in a deployment (Tim, 24 Nov 2026: no paid plans). Every file in api/
// whose name doesn't start with _ (and every file in a folder that doesn't) is a function, so this fails the build's
// tests if there are ever more than 10, leaving room. New addresses join a router (api/_router.js) instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = new URL('../../api/', import.meta.url).pathname;
const functionsIn = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (e.name.startsWith('_') || e.name.startsWith('.')) return [];
  if (e.isDirectory()) return functionsIn(join(dir, e.name));
  return /\.(js|mjs|cjs|ts)$/.test(e.name) ? [join(dir, e.name)] : [];
});

test('api/ holds at most 10 functions (Vercel Hobby allows 12)', () => {
  const found = functionsIn(API);
  assert.ok(found.length <= 10, `api/ has ${found.length} functions: ${found.map((f) => f.slice(API.length)).join(', ')}`);
});

test('every old address is rewritten to a router that serves it, and every routed handler has an address', async () => {
  const v = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  const routed = v.rewrites.filter((r) => /^\/api\/[a-z-]+\?__route=[a-z-]+$/.test(r.destination));
  const handlers = readdirSync(join(API, '_routes')).filter((n) => n.endsWith('.js')).map((n) => n.slice(0, -3)).sort();
  assert.deepEqual(routed.map((r) => r.source.slice(5)).sort(), handlers);
  for (const r of routed) {
    const [fn, name] = r.destination.slice(5).split('?__route=');
    assert.equal(r.source, `/api/${name}`);
    const src = readFileSync(join(API, `${fn}.js`), 'utf8');
    assert.match(src, new RegExp(`'${name}':`), `${fn}.js serves ${name}`);
  }
  // The routing rules come before the page fallback, which leaves /api/ alone.
  assert.ok(v.rewrites.findIndex((r) => r.destination === '/index.html') > routed.length - 1);
  assert.equal(v.crons, undefined, 'no Vercel cron (coach-portal rule 22)');
});

test('a router hands each address to its own handler with the query as sent, and refuses any other', async () => {
  const { route } = await import('../../api/_router.js');
  const seen = [];
  const h = route({ 'coach-send': (req) => { seen.push(['send', { ...req.query }]); }, 'coach-invite': () => seen.push(['invite']) });
  const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, setHeader() { return r; }, json(b) { r.body = b; } }; return r; };
  await h({ query: { __route: 'coach-send', code: 'abc', state: 'xyz' } }, res());
  assert.deepEqual(seen[0], ['send', { code: 'abc', state: 'xyz' }]);
  for (const bad of ['', 'constructor', '__proto__', 'toString', 'coach-billing']) {
    const r = res();
    await h({ query: { __route: bad } }, r);
    assert.equal(r.code, 404, bad);
  }
});
