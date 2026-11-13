// A deliberate Sign out removes everything kept on the device for the
// person (Tim, 26 Oct; the break-it tester, 10 Nov: a change left open in a
// guided tool used to stay behind).
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppOwnedKey } from '../../src/lib/clearAppStorage.js';

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
