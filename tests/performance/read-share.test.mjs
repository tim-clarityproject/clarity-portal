// One read, shared (src/lib/readShare.js; the scale check, step 3): identical
// database reads at the same moment share one request; writes, other people
// and other filters never get a shared answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, shareReads, forgetSharedReads } from '../../src/lib/readShare.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

// Fixer D (22 Nov): the portal's own server writes too (an email sent and logged, a guest's copy claimed, a coach
// invited, a calendar connected): every client call to /api goes through apiFetch, which forgets the kept reads.
test('a POST to /api forgets the kept reads, before it is sent and when it is answered; a GET to /api keeps them', async () => {
  forgetSharedReads();
  const s = server();
  const f = shareReads(s.send);
  const url = `${BASE}/coach_sessions?select=*`;
  const realFetch = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async (input, init = {}) => {
      // While the server is writing, a read already sees nothing kept.
      await f(url, { method: 'GET', headers: auth('ann') });
      seen.push({ url: String(input), method: init.method || 'GET', dbCalls: s.calls.length });
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await f(url, { method: 'GET', headers: auth('ann') });
    assert.equal(s.calls.length, 1);
    const res = await apiFetch('/api/coach-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal((await res.json()).ok, true);
    assert.equal(seen[0].dbCalls, 2, 'the read made while the /api call was on its way went to the database');
    await f(url, { method: 'GET', headers: auth('ann') });
    assert.equal(s.calls.length, 3, 'the read after the /api call went to the database');
    // A GET to /api writes nothing: the kept read stays.
    await apiFetch('/api/something', { method: 'GET' });
    const before = s.calls.length;
    await f(url, { method: 'GET', headers: auth('ann') });
    assert.equal(s.calls.length, before, 'a GET to /api kept the kept read');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a failed /api call still forgets the kept reads', async () => {
  forgetSharedReads();
  const s = server();
  const f = shareReads(s.send);
  const url = `${BASE}/profiles?select=first_name`;
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await f(url, { method: 'GET', headers: auth('ann') });
    await assert.rejects(apiFetch('/api/guest-copy', { method: 'POST', body: '{}' }));
    await f(url, { method: 'GET', headers: auth('ann') });
    assert.equal(s.calls.length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('every client call to /api goes through apiFetch', () => {
  const root = new URL('../../src/', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== 'serviceWorker') walk(full); } else if (/\.(js|jsx)$/.test(name)) files.push(full);
    }
  };
  walk(root);
  const raw = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // A plain fetch whose address is /api/… (or a path variable given to a plain fetch in a file that names /api/).
    if (/(?<![A-Za-z])fetch\(\s*['"`]\/api\//.test(text)) raw.push(file.slice(root.length));
    if (/['"`]\/api\//.test(text) && /(?<![A-Za-z.])fetch\(\s*path\b/.test(text)) raw.push(file.slice(root.length));
  }
  assert.deepEqual(raw, []);
});

test('another tab’s change, showing the tab again and coming back from the browser’s cache forget the kept reads (break-it tester)', async () => {
  // A fresh copy of the module with a window to listen to.
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const had = { window: globalThis.window, document: globalThis.document };
  globalThis.window = win;
  globalThis.document = doc;
  let mod;
  try {
    mod = await import(`../../src/lib/readShare.js?tabs=${Date.now()}`);
  } finally {
    globalThis.window = had.window;
    globalThis.document = had.document;
  }
  const s = server();
  const f = mod.shareReads(s.send);
  const url = `${BASE}/todos?select=id&user_id=eq.1`;
  const read = async () => (await (await f(url, { method: 'GET', headers: auth('ann') })).json()).n;
  assert.equal(await read(), 1);
  assert.equal(await read(), 1, 'kept for a moment');
  win.dispatchEvent(new Event('storage'));
  assert.equal(await read(), 2, 'another tab saved: read again');
  const shown = new Event('visibilitychange');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(shown);
  assert.equal(await read(), 2, 'hiding the tab keeps them');
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(await read(), 3, 'the tab shown again: read again');
  win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
  assert.equal(await read(), 3, 'the first load’s pageshow keeps the opening reads');
  win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
  assert.equal(await read(), 4, 'back from the browser’s cache: read again');
  win.dispatchEvent(new Event('online'));
  assert.equal(await read(), 5, 'the connection back: read again');
});
