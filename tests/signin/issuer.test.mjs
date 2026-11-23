// The name an authenticator app shows for the coach's code is always
// exactly "The Clarity Portal", whatever address the portal runs on (Tim,
// 23 Nov 2026: a preview's address showed as "clarity-portal-app-git-
// feature-per…"), with the coach's email as the account name.
// The browser check reads the QR code back on two addresses:
// tests/signin/coach-auth.mjs (set-up), with the stand-in naming the code
// after the page's own host when no issuer is asked for, as Supabase does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHENTICATOR_ISSUER, authenticatorAddress, enrolOptions, plainKey } from '../../src/lib/signIn/coachAuth.js';

const EMAIL = 'maya.okafor@northbridge.example';
const KEY = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
// What Supabase hands back when the issuer isn't given: its Site URL's host.
const fromSupabase = (host) => `otpauth://totp/${encodeURIComponent(host)}:${encodeURIComponent(EMAIL)}?secret=${KEY}&issuer=${encodeURIComponent(host)}&algorithm=SHA1&digits=6&period=30`;
const read = (uri) => {
  const u = new URL(uri.replace('otpauth://', 'https://'));
  const label = decodeURIComponent(u.pathname.replace(/^\//, ''));
  return { label, issuer: u.searchParams.get('issuer'), secret: u.searchParams.get('secret'), rest: [...u.searchParams.keys()] };
};

test('the issuer is exactly "The Clarity Portal"', () => {
  assert.equal(AUTHENTICATOR_ISSUER, 'The Clarity Portal');
});

test('set-up asks Supabase for a TOTP factor named "The Clarity Portal"', () => {
  const o = enrolOptions(1700000000000);
  assert.deepEqual(o, { factorType: 'totp', friendlyName: 'Authenticator 1700000000000', issuer: 'The Clarity Portal' });
});

for (const host of ['clarity-portal-app-git-feature-performance-overhaul-tim.vercel.app', 'portal.theclarityproject.co.uk', 'localhost:5173']) {
  test(`on ${host}, the QR address names The Clarity Portal and the coach's email, with the same key`, () => {
    const uri = authenticatorAddress(fromSupabase(host), EMAIL);
    const r = read(uri);
    assert.equal(r.issuer, 'The Clarity Portal');
    assert.equal(r.label, `The Clarity Portal:${EMAIL}`);
    assert.equal(r.secret, KEY);
    assert.equal(plainKey(r.secret), KEY);
    assert.ok(!uri.includes(host.split(':')[0]), 'the address never shows the host');
    // The code's settings are kept as Supabase gave them.
    assert.deepEqual(r.rest, ['secret', 'issuer', 'algorithm', 'digits', 'period']);
    // Spaces as %20, never "+", which some apps show as a plus.
    assert.ok(uri.startsWith('otpauth://totp/The%20Clarity%20Portal:') && uri.includes('&issuer=The%20Clarity%20Portal'));
  });
}

test('with no email to hand, the account name Supabase gave is kept', () => {
  const r = read(authenticatorAddress(fromSupabase('portal.theclarityproject.co.uk'), ''));
  assert.equal(r.label, `The Clarity Portal:${EMAIL}`);
});

test('anything that is not a TOTP address with a key gives nothing', () => {
  assert.equal(authenticatorAddress('', EMAIL), '');
  assert.equal(authenticatorAddress('https://example.com/?secret=ABC', EMAIL), '');
  assert.equal(authenticatorAddress('otpauth://totp/x:y?issuer=x', EMAIL), '');
});

test('on odd addresses (an IP, a port, punycode) the app still shows "The Clarity Portal" and the right account (break-it tester, tidy follow-up 3)', () => {
  const read = (uri, email) => { const u = new URL(authenticatorAddress(uri, email)); return [decodeURIComponent(u.pathname).replace(/^\//, ""), u.searchParams.get('issuer'), u.searchParams.get('secret')]; };
  assert.deepEqual(read('otpauth://totp/192.168.1.20:tess@example.com?secret=ABCD&issuer=192.168.1.20', 'tess@example.com'), ['The Clarity Portal:tess@example.com', 'The Clarity Portal', 'ABCD']);
  assert.deepEqual(read('otpauth://totp/xn--bcher-kva.example:tess@example.com?secret=ABCD&issuer=xn--bcher-kva.example', null), ['The Clarity Portal:tess@example.com', 'The Clarity Portal', 'ABCD']);
  // A Site URL with a port: the issuer "localhost:5361" comes off whole, so the account isn't "5361:tess@…".
  assert.deepEqual(read('otpauth://totp/localhost%3A5361:tess%40example.com?secret=ABCD&issuer=localhost%3A5361', ''), ['The Clarity Portal:tess@example.com', 'The Clarity Portal', 'ABCD']);
  assert.deepEqual(read('otpauth://totp/127.0.0.1:4371:tess@example.com?secret=ABCD', null), ['The Clarity Portal:tess@example.com', 'The Clarity Portal', 'ABCD']);
  assert.deepEqual(read('otpauth://totp/x?secret=ABCD', 'a+b@example.com'), ['The Clarity Portal:a+b@example.com', 'The Clarity Portal', 'ABCD']);
  assert.equal(authenticatorAddress('otpauth://totp/%E0%A4%A?secret=ABCD', null).startsWith('otpauth://totp/The%20Clarity%20Portal:'), true, 'a damaged label is kept as it came');
});
