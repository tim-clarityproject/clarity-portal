// One read, shared (src/lib/readShare.js; the scale check, step 3): identical
// database reads at the same moment share one request; writes, other people
// and other filters never get a shared answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareReads, forgetSharedReads } from '../../src/lib/readShare.js';

const BASE = 'http://db.example/rest/v1';
const auth = (who) => ({ Authorization: `Bearer ${who}`, apikey: 'k', Accept: 'application/json' });

function server() {
  const calls = [];
  let n = 0;
  const pending = [];
  const send = (input, init = {}) => {
    calls.push({ url: String(input), method: init.method || 'GET' });
    n += 1;
    const body = JSON.stringify({ n, url: String(input) });
    return new Promise((resolve) => {
      pending.push(() => resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })));
      queueMicrotask(() => { const go = pending.shift(); go?.(); });
    });
  };
  return { send, calls };
}

test('identical reads at the same moment share one request, each with its own body', async () => {
  forgetSharedReads();
  const s = server();
  const f = shareReads(s.send);
  const url = `${BASE}/profiles?select=first_name&id=eq.1`;
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => f(url, { method: 'GET', headers: auth('ann') })));
  assert.equal(s.calls.length, 1);
  const bodies = await Promise.all([a, b, c].map((r) => r.json()));
  assert.deepEqual(bodies.map((x) => x.n), [1, 1, 1]);
  // And a moment later, still the kept answer.
  const d = await f(url, { method: 'GET', headers: auth('ann') });
  assert.equal((await d.json()).n, 1);
  assert.equal(s.calls.length, 1);
});

test('another person, another filter or another Accept is never shared', async () => {
  forgetSharedReads();
  const s = server();
  const f = shareReads(s.send);
  const url = `${BASE}/profiles?select=first_name&id=eq.1`;
  await f(url, { method: 'GET', headers: auth('ann') });
  await f(url, { method: 'GET', headers: auth('bob') });
  await f(`${BASE}/profiles?select=first_name&id=eq.2`, { method: 'GET', headers: auth('bob') });
  await f(url, { method: 'GET', headers: { ...auth('bob'), Accept: 'application/vnd.pgrst.object+json' } });
  assert.equal(s.calls.length, 4);
});

test('a write forgets what was kept, and a read on its way during a write is not kept', async () => {
  forgetSharedReads();
  const s = server();
  const f = shareReads(s.send);
  const url = `${BASE}/todos?select=*&user_id=eq.1`;
  await f(url, { method: 'GET', headers: auth('ann') });
  await f(`${BASE}/todos`, { method: 'POST', headers: auth('ann'), body: '{}' });
  const after = await f(url, { method: 'GET', headers: auth('ann') });
  assert.equal((await after.json()).n, 3);
  // A read started, then a write sent before it answers: a later read asks again.
  forgetSharedReads();
  const going = f(url, { method: 'GET', headers: auth('ann') });
  await f(`${BASE}/rpc/anything`, { method: 'POST', headers: auth('ann'), body: '{}' });
  await going;
  await f(url, { method: 'GET', headers: auth('ann') });
  assert.deepEqual(s.calls.map((c) => c.method), ['GET', 'POST', 'GET', 'GET', 'POST', 'GET']);
});

test('reads with their own abort signal, failed reads and non-database reads are not kept', async () => {
  forgetSharedReads();
  let n = 0;
  const f = shareReads(async (input) => {
    n += 1;
    if (String(input).includes('broken')) return new Response('{}', { status: 503 });
    return new Response('[]', { status: 200 });
  });
  const ac = new AbortController();
  await f(`${BASE}/a`, { method: 'GET', headers: auth('ann'), signal: ac.signal });
  await f(`${BASE}/a`, { method: 'GET', headers: auth('ann'), signal: ac.signal });
  await f(`${BASE}/broken`, { method: 'GET', headers: auth('ann') });
  await f(`${BASE}/broken`, { method: 'GET', headers: auth('ann') });
  await f('http://db.example/auth/v1/user', { method: 'GET', headers: auth('ann') });
  await f('http://db.example/auth/v1/user', { method: 'GET', headers: auth('ann') });
  assert.equal(n, 6);
});

test('a HEAD count answer is shared without a body', async () => {
  forgetSharedReads();
  let n = 0;
  const f = shareReads(async () => { n += 1; return new Response(null, { status: 200, headers: { 'content-range': '0-0/7' } }); });
  const [a, b] = await Promise.all([1, 2].map(() => f(`${BASE}/wins?select=id`, { method: 'HEAD', headers: { ...auth('ann'), Prefer: 'count=exact' } })));
  assert.equal(n, 1);
  assert.equal(a.headers.get('content-range'), '0-0/7');
  assert.equal(b.headers.get('content-range'), '0-0/7');
});

test('a function that only reads (my_coach) keeps the kept reads; any other function forgets them', async () => {
  forgetSharedReads();
  let n = 0;
  const f = shareReads(async () => { n += 1; return new Response('[]', { status: 200 }); });
  const url = `${BASE}/person_settings?select=*&user_id=eq.1`;
  await f(url, { method: 'GET', headers: auth('ann') });
  await f(`${BASE}/rpc/my_coach`, { method: 'POST', headers: auth('ann'), body: '{}' });
  await f(url, { method: 'GET', headers: auth('ann') });
  assert.equal(n, 2);
  await f(`${BASE}/rpc/my_coachx`, { method: 'POST', headers: auth('ann'), body: '{}' });
  await f(url, { method: 'GET', headers: auth('ann') });
  assert.equal(n, 4);
});
