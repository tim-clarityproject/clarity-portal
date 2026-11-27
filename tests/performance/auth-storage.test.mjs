// The sign-in's storage adapter (src/lib/authStorage.js; Polish 1, Stage D, item 17): supabase-js reads it before
// every request, so it keeps an in-memory copy, kept in step with its own writes, another tab's storage event and
// supabase-js's message to its other tabs, Sign out's clearing round it, and at most a second old otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'clarity-portal-auth';

function fakeWindow() {
  const data = new Map();
  let reads = 0;
  const listeners = {};
  const localStorage = {
    getItem: (k) => { reads += 1; return data.has(k) ? data.get(k) : null; },
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
  const window = { localStorage, addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); } };
  return { window, data, reads: () => reads, fire: (type, e) => (listeners[type] || []).forEach((fn) => fn(e)) };
}

const channels = [];
class FakeChannel {
  constructor(name) { this.name = name; channels.push(this); }
}

const w = fakeWindow();
globalThis.window = w.window;
globalThis.BroadcastChannel = FakeChannel;
const realNow = Date.now;
let clock = 1_000_000;
Date.now = () => clock;
const { authStorage, forgetAuthCopy, FRESH_MS } = await import('../../src/lib/authStorage.js');
test.after(() => { Date.now = realNow; delete globalThis.window; delete globalThis.BroadcastChannel; });

test('a burst of reads goes to the device once', () => {
  w.data.set(KEY, 'session-1');
  const before = w.reads();
  for (let i = 0; i < 200; i += 1) assert.equal(authStorage.getItem(KEY), 'session-1');
  assert.equal(w.reads() - before, 1);
});

test('its own writes and removals are read back at once, with no read of the device', () => {
  authStorage.setItem(KEY, 'session-2');
  const before = w.reads();
  assert.equal(authStorage.getItem(KEY), 'session-2');
  authStorage.removeItem(KEY);
  assert.equal(authStorage.getItem(KEY), null);
  assert.equal(w.data.has(KEY), false, 'signing out removes it from the device');
  assert.equal(w.reads() - before, 0);
});

test('another tab signing in or out: the storage event drops the copy', () => {
  authStorage.setItem(KEY, 'mine');
  w.data.set(KEY, 'theirs'); // the other tab's write
  w.fire('storage', { key: KEY });
  assert.equal(authStorage.getItem(KEY), 'theirs');
  w.data.delete(KEY);
  w.fire('storage', { key: null }); // storage cleared there
  assert.equal(authStorage.getItem(KEY), null);
});

test('supabase-js\'s own message to its other tabs drops the copy too', () => {
  authStorage.setItem(KEY, 'before');
  const ch = channels.find((c) => c.name === KEY);
  assert.ok(ch, 'listens on the channel named after the key, as supabase-js does');
  w.data.set(KEY, 'after');
  ch.onmessage({ data: { event: 'SIGNED_OUT' } });
  assert.equal(authStorage.getItem(KEY), 'after');
});

test('Sign out clearing round the adapter (clearAppStorage) is followed by forgetAuthCopy', () => {
  authStorage.setItem(KEY, 'signed-in');
  w.data.delete(KEY);
  forgetAuthCopy();
  assert.equal(authStorage.getItem(KEY), null);
});

test('anything else that changes the device is read within FRESH_MS', () => {
  authStorage.setItem(KEY, 'old');
  w.data.set(KEY, 'changed-round-it');
  assert.equal(authStorage.getItem(KEY), 'old');
  clock += FRESH_MS;
  assert.equal(authStorage.getItem(KEY), 'changed-round-it');
});

test('blocked storage reads as signed out and never throws', () => {
  const real = globalThis.window.localStorage;
  globalThis.window.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  const err = console.error; console.error = () => {};
  try {
    forgetAuthCopy();
    assert.equal(authStorage.getItem('other-key'), null);
    assert.doesNotThrow(() => authStorage.setItem('other-key', 'x'));
    assert.doesNotThrow(() => authStorage.removeItem('other-key'));
  } finally { console.error = err; globalThis.window.localStorage = real; }
});
