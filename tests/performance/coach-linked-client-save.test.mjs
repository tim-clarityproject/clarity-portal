// A coach's save of a client whose account is linked is never refused
// (scale check, step 4, functionality tester, 23 Nov). 049's
// client_profiles_guard refuses any plain save carrying user_id, even
// unchanged, because an upsert is checked as an insert first: moving a
// linked client to another stage on the board answered 42501 "An account
// is linked when the person accepts their invite." The store never sends
// client_profiles.user_id; other tables keep theirs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.window = { localStorage: store(), sessionStorage: store(), addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };
globalThis.__db = { from() { throw new Error('not used'); }, rpc() { throw new Error('not used'); } };

const { rowForDb } = await import('../../src/lib/coach/store.js');

test('a client profile is saved without user_id, with everything else it holds', () => {
  const row = { id: 'p1', coach_id: 'c1', user_id: 'u1', name: 'Cara Brookes', stage: 'active', status: 'active', created_at: 'x', updated_at: 'y' };
  const out = rowForDb('client_profiles', row);
  assert.equal('user_id' in out, false);
  assert.deepEqual(out, { id: 'p1', coach_id: 'c1', name: 'Cara Brookes', stage: 'active', status: 'active' });
});

test('other tables keep a user_id column', () => {
  const out = rowForDb('coach_profiles', { coach_id: 'c1', user_id: 'u1', updated_at: 'y' });
  assert.equal(out.user_id, 'u1');
});
