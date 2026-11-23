// Tidy follow-up 3 (the scale check's 5): Sign out clears every copy the
// portal keeps on the device for the person, own questions' wording, the
// day's plan order, peak moments and travel plans included.
//
// This reads every storage key the app's own code names (src/), and fails
// when Sign out (isAppOwnedKey in src/lib/clearAppStorage.js) wouldn't clear
// one, unless it is listed below as holding nothing of the person's, with
// the reason. A new key is therefore either cleared or explained here.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PERSONAL_KINDS, isAppOwnedKey } from '../../src/lib/clearAppStorage.js';
import { DEVICE_PREFIXES } from '../../src/lib/deviceStore.js';

const ROOT = new URL('../../src/', import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'designReference' ? [] : files(path);
    return /\.(jsx?|mjs)$/.test(name) ? [path] : [];
  });
}

// Kept on purpose: none of it is a copy of the person's data.
const NOT_PERSONAL = {
  'clarity-colour-mode': 'the device’s Light, Dark or Match my device',
  'clarity-orb-style': 'the breathing orb’s look on this device',
  'clarity-timer-minutes': 'the timer length with nobody signed in (a signed-in person’s is a page copy)',
  'clarity-chat-app': 'which chat app this device opens',
  'clarity-chunk-reload-at': 'a time: when the page last reloaded for a new version',
  'clarity-diag': 'whether the diagnostics log is on',
  'clarity-tab-id': 'this tab’s id (sessionStorage)',
  'clarity-queue-tab': 'this tab’s id for the queue (sessionStorage)',
  'clarity-hidden-help': 'hidden help with nobody signed in (a signed-in person’s is in the account)',
  'clarity-offers': 'offers with nobody signed in (a signed-in person’s are in the account)',
  'clarity-extras-040': 'only that the database has 040’s columns',
  'clarity-coach-crm-seen': 'only that 052’s tables have answered',
  'clarity-left-at': 'a time: when the portal was last left',
  'clarity-coach-low-codes-told': 'that this sign-in was told its recovery codes are low',
  'clarity-coach-offer-off': 'Today’s offer hidden for the day (sessionStorage)',
  'clarity-coach-test-calls': 'the coach portal’s test stand-in, never on the live site',
  'clarity-coach-test-finances': 'the coach portal’s test stand-in, never on the live site',
  'clarity-portal-auth': 'the sign-in library’s own session, removed by its own sign-out',
  'clarity-guest:': 'a guest’s visit to a link in this tab (sessionStorage), not an account',
  'clarity-share:': 'a guest’s sharing choice for this visit (sessionStorage), not an account',
  'clarity-tool-answers-local:': 'checks and washes set aside on purpose until 043 (clearAppStorage.js)',
  'clarity-coach': 'the coach portal’s IndexedDB copy, cleared by clearDeviceCopies',
  'clarity-app-': 'the service worker’s copy of the app’s own files',
  'clarity-on-demand': 'the service worker’s copy of fonts used once',
  'dsPanelDepth': 'how many panels are open in this tab (sessionStorage)',
  'ds-tip-seen:': 'a first-visit tip already seen on this device',
  'ds-help-seen:': 'a first-visit line already seen on this device',
  'alignment-access:': 'the outside Health Check’s link, not an account (no Sign out there)',
  'alignment-backup:': 'the outside Health Check’s link, not an account (no Sign out there)',
  'hc-last-saved:': 'the outside Health Check’s link, not an account',
  'hc-seen:': 'the outside Health Check’s link, not an account',
  'hc-coach-036:': 'the outside Health Check’s link, not an account',
  'hc-told:': 'the outside Health Check’s link, not an account',
  'hc-quick-guide-watched': 'that the Quick guide was watched on this device',
};
// Names that look like keys but are events, channels, locks, image names
// or settings kept in the account (page_preferences).
const NOT_KEYS = new Set(['dashboard', 'patterns', 'sleep_target', 'clarity-coach-sync:', 'clarity-saved-items-changed', 'clarity-plan-changed', 'clarity-health-checks-moved', 'clarity-coach-copy', 'clarity-crosshair', 'clarity-project', 'clarity-timer-minutes-event', 'clarity-hidden-help-event', 'clarity-sign-in-', 'clarity-', 'clarity.wol.', 'clarity-take-over']);

/** Every storage key or key prefix the app's own code names, with where. */
function keysInSource() {
  const found = new Map();
  const add = (key, file) => { if (!found.has(key)) found.set(key, file.replace(ROOT, 'src/')); };
  for (const file of files(ROOT)) {
    const text = readFileSync(file, 'utf8');
    // deviceKey('kind', person, ...) and deviceKey(LOCAL, ...) with LOCAL = 'kind'.
    for (const m of text.matchAll(/deviceKey\('([a-z0-9-]+)'/g)) add(`clarity-${m[1]}:`, file);
    if (/deviceKey\(LOCAL\b/.test(text)) for (const m of text.matchAll(/const LOCAL = '([a-z0-9-]+)'/g)) add(`clarity-${m[1]}:`, file);
    // Constants: KEY, PREFIX, NOT_YET_KEY, DRAFT_PREFIX, DB_NAME and the like.
    // (A page copy's own name, deviceKey('cache', person, NAME), is inside clarity-cache:.)
    for (const m of text.matchAll(/\b[A-Z_]*(?:KEY|PREFIX|DB_NAME|WAITING|CACHE)\s*=\s*'((?:clarity|ds|hc-|alignment|strategic-alignment)[^']*)'/g)) add(m[1], file);
    for (const m of text.matchAll(/storageKey:\s*'([^']+)'/g)) add(m[1], file);
    // Keys built in place: `clarity-…${…}`, `hc-…:${…}`, `alignment-…:${…}`.
    for (const m of text.matchAll(/`(clarity[-_.][A-Za-z0-9_.:-]*|(?:hc|alignment)-[A-Za-z0-9_.-]*:)\$\{/g)) add(m[1], file);
    // A literal read from or written straight into storage.
    for (const m of text.matchAll(/[sS]torage\??\.(?:setItem|getItem)\((['"])([^'"]+)\1/g)) add(m[2], file);
  }
  return found;
}

const sampleOf = (key) => (/[:._-]$/.test(key) ? `${key}u1:x` : key);

test('Sign out clears every key the app keeps for a person, or it is listed here as holding nothing of theirs', () => {
  const found = keysInSource();
  const missed = [];
  for (const [key, file] of found) {
    if (NOT_KEYS.has(key) || NOT_PERSONAL[key]) continue;
    // "Not yet" marks hold a time only: when a migration's table was last
    // found missing, so it is asked again later.
    if (/-not-yet$/.test(key)) continue;
    if (!isAppOwnedKey(sampleOf(key))) missed.push(`${key} (${file})`);
  }
  assert.deepEqual(missed, [], `Sign out leaves these on the device:\n${missed.join('\n')}`);
  // The scan really reads the stores it is about.
  for (const key of ['clarity-own-questions-local:', 'clarity-day-plan-local:', 'clarity-peak-moments-local:', 'clarity-travel-plans-local:', 'clarity-cache:', 'ds-draft:', 'ds-guide:']) {
    assert.ok(found.has(key), `${key} is found in src`);
  }
});

test('own questions’ wording, the day’s plan order, peak moments and travel plans are cleared on Sign out', () => {
  for (const kind of ['own-questions-local', 'day-plan-local', 'peak-moments-local', 'travel-plans-local', 'day-review-local', 'checkin-extras']) {
    assert.ok(PERSONAL_KINDS.includes(kind), kind);
    assert.equal(isAppOwnedKey(`clarity-${kind}:5f0c:2026-11-23`), true, kind);
  }
  for (const prefix of DEVICE_PREFIXES) assert.equal(isAppOwnedKey(`${prefix}u1:x`), true, prefix);
  // Device settings stay.
  assert.equal(isAppOwnedKey('clarity-colour-mode'), false);
  // A coach's copies too (tidy follow-up 3): what waits is sent first, or the coach chose Sign out anyway.
  assert.equal(isAppOwnedKey('clarity-coach-local:u1'), true, 'a coach’s copy is cleared once what waits has been sent');
  assert.equal(isAppOwnedKey('clarity-coach-network-local:u1'), true, 'a coach’s Network copy from before 052 too');
});

test('every key listed as kept is still in the code (no stale reasons)', () => {
  const found = keysInSource();
  const stale = Object.keys(NOT_PERSONAL).filter((key) => !found.has(key));
  assert.deepEqual(stale, []);
});

test('Sign out waits for own copies that haven’t reached the account, never for sent or refused ones', async () => {
  const store = new Map();
  globalThis.window = globalThis.window || {};
  globalThis.window.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { copiesWaiting } = await import('../../src/lib/signOutCopies.js');
  assert.equal(copiesWaiting('u1'), 0);
  store.set('clarity-own-questions-local:u1', JSON.stringify({
    questions: { a: { wording: 'What went well?', sent: true }, b: { wording: 'Who did I help?', sent: false }, c: { wording: 'A third', sent: false, refused: 'full' } },
    answers: { 'b:2026-11-23': { sent: false } },
    suggestions: { s1: { unsent: true } },
  }));
  store.set('clarity-peak-moments-local:u1', JSON.stringify({ moments: { m1: { sent: false }, m2: { sent: true } }, reviews: {} }));
  store.set('clarity-travel-plans-local:u1', JSON.stringify({ plans: { p1: { sent: false, refused: true } }, ticks: {} }));
  assert.equal(copiesWaiting('u1'), 4, 'question b, its answer, the suggestion’s choice and moment m1');
  assert.equal(copiesWaiting('someone-else'), 0);
  assert.equal(copiesWaiting(null), 0);
});

test('a coach’s waiting changes are counted for Sign out, and sent across first (tidy follow-up 3, the scale check’s 5)', async () => {
  const store = new Map();
  globalThis.window = globalThis.window || {};
  globalThis.window.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { coachRowsWaiting, networkRowsWaiting } = await import('../../src/lib/coach/copyWaiting.js');
  const copy = {
    rows: { coach_todos: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' }, d: { id: 'd' } }, activity_log: { x: { id: 'x' } } },
    marks: { coach_todos: { a: { sent: true }, b: { sent: false }, c: { sent: true, gone: true }, d: { sent: false, refused: true } } },
  };
  assert.equal(coachRowsWaiting(copy), 2, 'b not sent, c a removal still to send; a sent, d refused; the activity log is only read');
  assert.equal(coachRowsWaiting(null), 0);
  assert.equal(networkRowsWaiting({ people: { p1: {}, p2: {} }, gives: { g1: {} }, ratings: [{}] }), 4);
  assert.equal(networkRowsWaiting('nonsense'), 0);
  const { copiesWaiting, sendCopiesBeforeSignOut } = await import('../../src/lib/signOutCopies.js');
  store.set('clarity-coach-local:c1', JSON.stringify(copy));
  store.set('clarity-coach-network-local:c1', JSON.stringify({ people: { p1: {} }, gives: {}, ratings: [] }));
  assert.equal(copiesWaiting('c1'), 3, 'two coach rows and one Network person, so "Some changes haven’t synced yet." covers them');
  // Send first: the coach store's own load is asked for (it sends what waits, parents first); offline here, it can't,
  // so what waits is still counted and nothing is lost.
  const { waiting } = await sendCopiesBeforeSignOut('c1', { loadCoach: async () => { throw new Error('offline'); } });
  assert.equal(waiting, 3);
  // Online: the load sends them (here it empties the copy as the store does once all is in) and nothing waits.
  const asked = [];
  const sent = await sendCopiesBeforeSignOut('c1', { loadCoach: async (id, opts) => { asked.push([id, opts]); store.delete('clarity-coach-local:c1'); store.delete('clarity-coach-network-local:c1'); return true; } });
  assert.deepEqual(asked, [['c1', { again: true }]], 'the coach store’s load is asked for once, as a load again');
  assert.equal(sent.waiting, 0);
  // Nothing waiting: the coach store isn't loaded at all.
  const none = [];
  await sendCopiesBeforeSignOut('c1', { loadCoach: async (id) => { none.push(id); } });
  assert.deepEqual(none, []);
  assert.equal(copiesWaiting('a-client'), 0, 'a client with no coach copy waits for nothing');
});
