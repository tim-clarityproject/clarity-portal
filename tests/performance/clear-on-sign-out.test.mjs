// A deliberate Sign out removes everything kept on the device for the
// person (Tim, 26 Oct; the break-it tester, 10 Nov: a change left open in a
// guided tool used to stay behind).
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_ANSWERS_WAITING, clearAppStorage, isAppOwnedKey, keepWaitingToolAnswers } from '../../src/lib/clearAppStorage.js';

const SAM = '022e5568-00f2-4850-b954-000000000000';

test('Sign out clears every copy that carries the person’s id, and where a guided tool was left', () => {
  for (const key of [
    `clarity-cache:${SAM}:performance-plan`, `clarity-draft:${SAM}:day-plan:2026-11-10`, `clarity-queue:${SAM}`, `clarity-sending:${SAM}`,
    `ds-guide:day-plan-${SAM}-2026-11-10`, `ds-guide:debrief-${SAM}-abc-3`,
  ]) assert.equal(isAppOwnedKey(key), true, key);
});

test('Sign out keeps answers that wait on the device for their migration (they carry the person’s id)', () => {
  for (const key of [`clarity-day-plan-local:${SAM}:2026-11-10`, `clarity-day-review-local:${SAM}:2026-11-10`, `clarity-checkin-extras:${SAM}:2026-11-01`]) {
    assert.equal(isAppOwnedKey(key), false, key);
  }
});

test('Sign out leaves the device’s own settings alone', () => {
  for (const key of ['clarity-colour-mode', 'ds-tip-seen:rollover', 'ds-help-seen:plan', 'sb-gqtqljngeenqzxneucoc-auth-token', 'clarity-header-height', 'something-else']) {
    assert.equal(isAppOwnedKey(key), false, key);
  }
});

// The functionality tester, 13 Nov: what the sign-in pages keep for a tab
// (where a link pointed, a tick carried to Google, the email just typed, a
// reset link just opened) is never left for the next person to sign in.
test('Sign out clears what the sign-in pages kept for the tab', () => {
  for (const key of ['clarity-sign-in-next', 'clarity-sign-in-tick', 'clarity-sign-in-google-from', 'clarity-sign-in-email', 'clarity-sign-in-reset']) {
    assert.equal(isAppOwnedKey(key), true, key);
  }
});

// The functionality tester, 14 Nov: before migration 043 has run, a Team
// performance check and an Emotional wash live only in the device's copy,
// and Sign out cleared that copy with the rest, so they were lost for good.
function fakeStorage(start = {}) {
  const store = new Map(Object.entries(start));
  return { store, getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } };
}

test('Sign out sets aside the tool answers that live only on this device, and clears the ones the account holds', () => {
  const JO = '11111111-2222-4333-8444-555555555555';
  const copy = (map) => JSON.stringify({ v: map, at: 1 });
  const local = fakeStorage({
    [`clarity-cache:${SAM}:tool-answers`]: copy({
      a: { id: 'a', tool: 'emotional_wash', title: 'Your wash', sent: false },
      b: { id: 'b', tool: 'team_check', title: 'November team check', sent: true },
      c: { id: 'c', tool: 'team_check', title: 'October team check' },
    }),
    [`clarity-cache:${JO}:tool-answers`]: copy({ z: { id: 'z', tool: 'team_check', sent: true } }),
    [`clarity-cache:${SAM}:saved-plans`]: copy({}),
    [`clarity-draft:${SAM}:emotional-wash:new~tab`]: copy({}),
    'clarity-colour-mode': 'dark',
  });
  globalThis.window = { localStorage: local, sessionStorage: fakeStorage() };
  try {
    clearAppStorage();
    assert.deepEqual([...local.store.keys()].sort(), ['clarity-colour-mode', `${TOOL_ANSWERS_WAITING}${SAM}`].sort());
    const waiting = JSON.parse(local.getItem(`${TOOL_ANSWERS_WAITING}${SAM}`));
    assert.deepEqual(Object.keys(waiting).sort(), ['a', 'c']);
    // The key carries the person's id and is not one Sign out clears.
    assert.equal(isAppOwnedKey(`${TOOL_ANSWERS_WAITING}${SAM}`), false);
    // A second Sign out (nothing new) keeps what was set aside, and adds to it.
    local.setItem(`clarity-cache:${SAM}:tool-answers`, copy({ d: { id: 'd', tool: 'team_check', sent: false } }));
    clearAppStorage();
    assert.deepEqual(Object.keys(JSON.parse(local.getItem(`${TOOL_ANSWERS_WAITING}${SAM}`))).sort(), ['a', 'c', 'd']);
    // The account itself deleted: nothing of it waits here either.
    clearAppStorage({ deletedAccount: SAM });
    assert.equal(local.getItem(`${TOOL_ANSWERS_WAITING}${SAM}`), null);
    // A damaged copy, or one that isn't a map, is nothing to keep.
    const odd = fakeStorage({ [`clarity-cache:${SAM}:tool-answers`]: '{not json', [`clarity-cache:${JO}:tool-answers`]: copy([1, 2]) });
    assert.equal(keepWaitingToolAnswers(odd), 0);
  } finally {
    delete globalThis.window;
  }
});
