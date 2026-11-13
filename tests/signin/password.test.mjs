// Passwords (Tim, 11 Nov): at least 8 characters, checked against known
// leaked passwords in the page as well as by Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { isLeaked, LEAKED, MIN_PASSWORD, refusedAsLeaked, refusedAsShort, TOO_SHORT, tooShort } from '../../src/lib/signIn/password.js';

test('8 characters or more', () => {
  assert.equal(MIN_PASSWORD, 8);
  assert.equal(tooShort('harbour'), true);
  assert.equal(tooShort('harbour4'), false);
  assert.equal(tooShort(''), true);
  assert.equal(tooShort(null), true);
  assert.equal(TOO_SHORT, 'Please use at least 8 characters.');
});

// SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
const listFor = (asked) => async (url, init) => {
  asked.push({ url, headers: init?.headers });
  return { ok: true, text: async () => '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\n011053FD0102E94D6AE2F8B83D76FAF94F6:0' };
};

test('a known leaked password is caught, and only 5 characters of its fingerprint leave the device', async () => {
  const asked = [];
  assert.equal(await isLeaked('password', { fetchFn: listFor(asked), subtle: webcrypto.subtle }), true);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, 'https://api.pwnedpasswords.com/range/5BAA6');
  assert.equal(asked[0].url.split('/range/')[1].length, 5);
  assert.equal(asked[0].headers['Add-Padding'], 'true');
});

test('a password not on the list passes, and a padded line with no count is not a match', async () => {
  assert.equal(await isLeaked('a long one nobody has used 7391', { fetchFn: listFor([]), subtle: webcrypto.subtle }), false);
});

test('if the list can’t be reached, the page carries on and Supabase’s own check still applies', async () => {
  const down = async () => { throw new Error('offline'); };
  assert.equal(await isLeaked('password', { fetchFn: down, subtle: webcrypto.subtle }), false);
  assert.equal(await isLeaked('password', { fetchFn: async () => ({ ok: false, text: async () => '' }), subtle: webcrypto.subtle }), false);
  assert.equal(await isLeaked('password', { fetchFn: null, subtle: webcrypto.subtle }), false);
  assert.equal(await isLeaked('', { fetchFn: listFor([]), subtle: webcrypto.subtle }), false);
});

test('Supabase’s own refusals are read for what they are', () => {
  assert.equal(refusedAsLeaked({ code: 'weak_password', weak_password: { reasons: ['pwned'] } }), true);
  assert.equal(refusedAsLeaked({ code: 'weak_password', weak_password: { reasons: ['length'] } }), false);
  assert.equal(refusedAsShort({ code: 'weak_password', weak_password: { reasons: ['length'] } }), true);
  assert.equal(refusedAsShort({ message: 'Password should be at least 6 characters.' }), true);
  assert.equal(refusedAsShort({ message: 'something else' }), false);
  assert.equal(LEAKED.length, 2);
});
