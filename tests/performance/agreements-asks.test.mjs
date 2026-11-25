// src/lib/agreements/asks.js: one shape for every ask, calm answers, stand-ins only off the live site (Phase 6b run 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as a from '../../src/lib/agreements/asks.js';

const reply = (status, body) => async () => ({ status, json: async () => body });

test('every ask has a stand-in, and every stand-in route is a known ask', () => {
  for (const [route, kinds] of Object.entries(a.ASKS)) {
    for (const kind of Object.keys(kinds)) assert.equal(typeof a.STAND_INS[route][kind], 'function', `${route}.${kind}`);
  }
  for (const [route, kinds] of Object.entries(a.STAND_INS)) for (const kind of Object.keys(kinds)) assert.ok(a.isAsk(route, kind));
});

test('a good answer is passed on; the body carries its kind and the sign-in', async () => {
  let seen = null;
  const got = await a.askWith({ route: 'agreements', kind: 'send', body: { versionId: 'v' }, token: 'tok', send: async (url, init) => { seen = [url, init]; return { status: 200, json: async () => ({ ok: true, sentAt: 'x' }) }; } });
  assert.deepEqual(got, { ok: true, sentAt: 'x' });
  assert.equal(seen[0], '/api/coach-agreements');
  assert.deepEqual(JSON.parse(seen[1].body), { kind: 'send', versionId: 'v' });
  assert.equal(seen[1].headers.Authorization, 'Bearer tok');
});

test('calm words for every refusal; the server’s own text only when it is calm', async () => {
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: reply(401, {}) })).message, a.WORDS.signIn);
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: reply(403, { ok: false, message: 'permission denied for table x' }) })).message, a.WORDS.notYours);
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: reply(409, { ok: false, message: 'This agreement is already signed.' }) })).message, 'This agreement is already signed.');
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: reply(500, { ok: false, message: 'TypeError: x is undefined' }) })).message, a.WORDS.tryAgain);
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: async () => { throw new Error('offline'); } })).message, a.WORDS.notReached);
  assert.equal((await a.askWith({ route: 'agreements', kind: 'send', token: null, send: reply(200, { ok: true }) })).message, a.WORDS.signIn, 'no sign-in, no ask');
  assert.equal((await a.askWith({ route: 'agreements', kind: 'nonsense', token: 't', send: reply(200, { ok: true }) })).ok, false);
});

test('a route not built yet (501) answers with its stand-in, never on the live site', async () => {
  const off = await a.askWith({ route: 'settle', kind: 'start', body: { versionId: 'v' }, token: 't', send: reply(501, { ok: false }) });
  assert.equal(off.ok, true);
  assert.equal(off.standIn, true);
  assert.equal(off.clientSecret, 'stand_in_secret');
  const live = await a.askWith({ route: 'settle', kind: 'start', token: 't', send: reply(501, { ok: false }), live: true });
  assert.deepEqual([live.ok, live.message], [false, a.WORDS.notReady]);
  const link = await a.askWith({ route: 'link', kind: 'quote_pdf', body: { token: 'x' }, send: reply(501, {}) });
  assert.equal(link.ok, true, 'a link ask needs no sign-in');
});

test('off the live site a plain 404 (no api/ here) answers with the stand-in; our own 404 and the live site do not', async () => {
  const off = await a.askWith({ route: 'link', kind: 'quote_question', body: { token: 'x', text: 'Hi' }, send: async () => ({ status: 404, json: async () => { throw new Error('html'); } }) });
  assert.equal(off.ok, true);
  assert.equal(off.standIn, true);
  const ours = await a.askWith({ route: 'agreements', kind: 'send', token: 't', send: reply(404, { ok: false, message: 'x' }) });
  assert.equal(ours.ok, false);
  assert.equal(ours.standIn, undefined);
  const live = await a.askWith({ route: 'link', kind: 'quote_pdf', body: { token: 'x' }, send: reply(404, null), live: true });
  assert.equal(live.ok, false);
  assert.equal(live.standIn, undefined);
});
