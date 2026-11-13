// Passwords (Tim, 11 Nov): at least 8 characters, checked against known
// leaked passwords in the page as well as by Supabase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { isLeaked, LEAKED, MAX_PASSWORD_BYTES, MIN_PASSWORD, refusedAsLeaked, refusedAsLong, refusedAsShort, TOO_LONG, TOO_SHORT, tooLong, tooShort } from '../../src/lib/signIn/password.js';
import { checkCurrentPassword } from '../../src/lib/signIn/account.js';
import { cleanName, looksLikeEmail } from '../../src/lib/signIn/words.js';

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

// ---------------------------------------------------------------- the break-it tester, 13 Nov

test('a password is never trimmed, and spaces count as characters', () => {
  assert.equal(tooShort('        '), false);
  assert.equal(tooShort(' harbou '), false);
  assert.equal(tooShort('1234567'), true);
});

test('72 characters at most (Supabase keeps no more), said in the page', () => {
  assert.equal(MAX_PASSWORD_BYTES, 72);
  assert.equal(tooLong('a'.repeat(72)), false);
  assert.equal(tooLong('a'.repeat(73)), true);
  assert.equal(tooLong('a'.repeat(1000)), true);
  // An accented letter or an emoji counts for more than one.
  assert.equal(tooLong('é'.repeat(36)), false);
  assert.equal(tooLong('é'.repeat(37)), true);
  assert.equal(tooLong('🙂'.repeat(19)), true);
  assert.equal(tooLong(''), false);
  assert.equal(tooLong(null), false);
  assert.equal(TOO_LONG, 'Please use 72 characters or fewer.');
  assert.equal(refusedAsLong({ code: 'validation_failed', message: 'Password cannot be longer than 72 characters' }), true);
  assert.equal(refusedAsLong({ code: 'weak_password', message: 'Password should be at least 8 characters.' }), false);
  assert.equal(refusedAsLong(null), false);
});

test('the leaked-password check gives up on a list that never answers, and says "not known"', async () => {
  const never = (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const began = Date.now();
  assert.equal(await isLeaked('password', { fetchFn: never, subtle: webcrypto.subtle, timeoutMs: 50 }), false);
  assert.ok(Date.now() - began < 2000);
  // Answers that make no sense are "not known" too, never an error.
  for (const text of ['', '<html>Bad gateway</html>', ':::', '1E4C9B93F3F0682250B6CF8331B7EE68FD8', '1E4C9B93F3F0682250B6CF8331B7EE68FD8:lots']) {
    assert.equal(await isLeaked('password', { fetchFn: async () => ({ ok: true, text: async () => text }), subtle: webcrypto.subtle }), false, text);
  }
  assert.equal(await isLeaked('password', { fetchFn: async () => ({ ok: true, text: async () => { throw new Error('cut off'); } }), subtle: webcrypto.subtle }), false);
});

const client = { supabaseUrl: 'https://test.invalid', supabaseKey: 'k' };

test('checking the current password: each answer is read for what it is', async () => {
  const answers = (status, body = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'x', answers(400)), 'no');
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'x', answers(429)), 'busy');
  for (const status of [500, 502, 503, 504]) assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'x', answers(status)), 'error', String(status));
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'x', async () => { throw new TypeError('Failed to fetch'); }), 'error');
  assert.equal(await checkCurrentPassword(client, '', 'x', answers(200)), 'no');
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', '', answers(200)), 'no');
});

test('checking the current password: the extra sign-in is let go at once, on this device only', async () => {
  const asked = [];
  const fetchFn = async (url, init) => {
    asked.push({ url, init });
    return { status: 200, ok: true, json: async () => ({ access_token: 'the-extra-one' }) };
  };
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'right', fetchFn), 'ok');
  assert.equal(asked.length, 2);
  assert.equal(asked[1].url, 'https://test.invalid/auth/v1/logout?scope=local');
  assert.equal(asked[1].init.headers.Authorization, 'Bearer the-extra-one');
});

test('checking the current password gives up on an answer that never comes', async () => {
  const never = (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });
  const began = Date.now();
  assert.equal(await checkCurrentPassword(client, 'sam@harbourlane.co', 'x', never, 50), 'error');
  assert.ok(Date.now() - began < 2000);
});

test('a first name of nothing anyone can see is no name', () => {
  assert.equal(cleanName('  Sam  '), 'Sam');
  assert.equal(cleanName('   '), '');
  assert.equal(cleanName('\u200b\u2060\ufeff'), '');
  assert.equal(cleanName('\u202eSam\u202c'), 'Sam');
  assert.equal(cleanName('Sam\u0000\u0007'), 'Sam');
  // Real names are left alone: other alphabets, accents, an emoji with its joiners.
  for (const name of ['سام', 'Zoë', 'Sam-Lee', 'O’Neil', '👩‍👧', 'می‌خواهم']) assert.equal(cleanName(name), name);
  assert.equal(cleanName(null), '');
});

test('an email with something unseen in it is not an email', () => {
  assert.equal(looksLikeEmail('sam.carter+portal@harbourlane.co'), true);
  assert.equal(looksLikeEmail('  Sam.Carter@HarbourLane.co  '), true);
  assert.equal(looksLikeEmail('sam\u200b@harbourlane.co'), false);
  assert.equal(looksLikeEmail('sam@harbour\u202elane.co'), false);
  assert.equal(looksLikeEmail('sam@harbourlane'), false);
  assert.equal(looksLikeEmail('sam @harbourlane.co'), false);
});
