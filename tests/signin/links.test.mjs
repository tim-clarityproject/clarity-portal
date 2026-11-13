// What an email link's landing page may trust (the functionality tester,
// 13 Nov). New password and the invite's page set a password without
// asking for the old one, so they open only for the account a link has
// really just brought: never for a session that was already on the
// device, and never for an address made to look like a link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeWasSwapped, noteStands } from '../../src/lib/signIn/linkRules.js';

test('a code counts only once Supabase has taken it out of the address', () => {
  // Swapped for a session: Supabase tidies the address.
  assert.equal(codeWasSwapped({ code: true }, ''), true);
  assert.equal(codeWasSwapped({ code: true }, '?area=personal'), true);
  // Made up, opened in another browser, or used before: it is still there.
  assert.equal(codeWasSwapped({ code: true }, '?code=made-up'), false);
  // No code in the address the visit began with: nothing was swapped.
  assert.equal(codeWasSwapped({ code: false }, ''), false);
  assert.equal(codeWasSwapped({}, ''), false);
});

test('a link opened in this tab is remembered for its own account, for an hour', () => {
  const now = Date.parse('2026-11-13T10:00:00Z');
  const note = (at, id = 'u1') => JSON.stringify({ at, id });
  assert.equal(noteStands(note(now - 5 * 60 * 1000), 'u1', now), true);
  assert.equal(noteStands(note(now - 59 * 60 * 1000), 'u1', now), true);
  assert.equal(noteStands(note(now - 61 * 60 * 1000), 'u1', now), false);
  assert.equal(noteStands(note(now + 60 * 1000), 'u1', now), false);
  // Never for another account that signs in on the same tab afterwards.
  assert.equal(noteStands(note(now - 1000, 'u1'), 'u2', now), false);
  assert.equal(noteStands(note(now - 1000, 'u1'), '', now), false);
  // The older note (a bare time, which anyone signed in could write) no longer counts.
  assert.equal(noteStands(String(now - 1000), 'u1', now), false);
  for (const bad of [null, '', 'yes', '{}', '{"at":"soon","id":"u1"}']) assert.equal(noteStands(bad, 'u1', now), false, String(bad));
});
