// The sign-in pages' return addresses and deep links (Tim, 11 Nov):
// a return address is worked out from the page's own origin, never
// written out in full; after signing in people land where their link
// pointed, and only ever somewhere inside the portal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { returnAddress, safeNext, SIGN_IN_PATHS } from '../../src/lib/signIn/addresses.js';

test('Google comes back to this page’s own origin, whichever deployment it is', () => {
  assert.equal(returnAddress('google', 'https://portal.theclarityproject.co.uk'), 'https://portal.theclarityproject.co.uk/auth/google');
  assert.equal(returnAddress('google', 'http://localhost:5173'), 'http://localhost:5173/auth/google');
  assert.equal(returnAddress('google', 'https://clarity-portal-app-abc123-theclarityproject.vercel.app'), 'https://clarity-portal-app-abc123-theclarityproject.vercel.app/auth/google');
});

test('a return address never carries a path, query or hash from the page it was made on', () => {
  assert.equal(returnAddress('google', 'https://example.org/auth/login?next=/x#y'), 'https://example.org/auth/google');
});

test('each email link has its own landing page', () => {
  const o = 'http://localhost:5173';
  assert.equal(returnAddress('confirmed', o), `${o}/auth/confirmed`);
  assert.equal(returnAddress('newPassword', o), `${o}/auth/reset-password`);
  assert.equal(returnAddress('emailChange', o), `${o}/my-account/email`);
});

test('no origin, or one that is not a web address, is refused', () => {
  for (const bad of ['', null, undefined, 'not an address', 'javascript:alert(1)', 'file:///tmp/x', 'data:text/html,x']) {
    assert.throws(() => returnAddress('google', bad), /own origin/);
  }
  assert.throws(() => returnAddress('nowhere', 'http://localhost:5173'), /No return address/);
});

test('no sign-in file writes a return address out in full', () => {
  const dirs = ['src/lib/signIn', 'src/pages/signin', 'src/components/signin'];
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (!/\.(js|jsx)$/.test(file)) continue;
      const text = readFileSync(join(dir, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const fixed = text.match(/https?:\/\/[a-z0-9.-]*(theclarityproject|vercel\.app|localhost)[^'"`\s]*/gi) || [];
      assert.deepEqual(fixed, [], `${dir}/${file} holds a fixed address`);
      if (/redirectTo|emailRedirectTo/.test(text)) assert.match(text, /returnAddress\(/, `${dir}/${file} builds its own return address`);
    }
  }
});

test('a deep link survives: the path, its query and its hash', () => {
  assert.equal(safeNext('/dashboard'), '/dashboard');
  assert.equal(safeNext('/my-plans?area=personal&tool=grow#top'), '/my-plans?area=personal&tool=grow#top');
  assert.equal(safeNext('/performance-sprint/debrief/abc/2'), '/performance-sprint/debrief/abc/2');
});

test('only a place inside the portal is ever a destination', () => {
  for (const bad of ['https://example.org/x', '//example.org/x', '/\\example.org', 'http:/example.org', 'javascript:alert(1)', 'dashboard', '', null, undefined, 42, {}, '/a\nb', '/\t/example.org']) {
    assert.equal(safeNext(bad), null, String(bad));
  }
});

test('the sign-in pages themselves are never a destination', () => {
  for (const page of ['/', '/login', '/auth/login', '/auth/sign-up', '/auth/google?code=1', '/auth/reset-password', '/forgot-password', '/forgot-password/check-email', '/coach/sign-in', '/coach/sign-in/code', '/email-confirmation']) {
    assert.equal(safeNext(page), null, page);
  }
  assert.equal(safeNext('/authors'), '/authors');
  assert.equal(safeNext('/coach'), '/coach');
});

test('the coaches’ page has its own address, apart from the clients’', () => {
  assert.equal(SIGN_IN_PATHS.coach, '/coach/sign-in');
  assert.notEqual(SIGN_IN_PATHS.coach, SIGN_IN_PATHS.signIn);
});

// The functionality tester, 13 Nov.
test('after a deliberate Sign out, the page it was pressed on is not somewhere to come back to', async () => {
  const { justSignedOut, noteSignedOut } = await import('../../src/lib/signIn/addresses.js');
  const t0 = Date.parse('2026-11-13T09:00:00Z');
  assert.equal(justSignedOut(t0), false);
  noteSignedOut(t0);
  assert.equal(justSignedOut(t0 + 500), true);
  // Long after, a signed-out visit to a page is a deep link again.
  assert.equal(justSignedOut(t0 + 60 * 1000), false);
  assert.equal(justSignedOut(t0 - 1000), false);
});

// The break-it tester, 13 Nov. Read as an address, "/.//other.site" loses
// its dot and becomes "//other.site", which a browser takes for another site.
test('a place to land that turns into another site once its dots are read is refused', () => {
  for (const bad of ['/.//evil.example', '/..//evil.example', '/a/..//evil.example', '/%2e//evil.example', '/%2E%2e//evil.example/x', '/x/../..//evil.example', '/.%2e//evil.example', '/./..//evil.example?x=1#y']) {
    assert.equal(safeNext(bad), null, bad);
  }
  // Nothing that comes out ever starts with two slashes, a backslash or a scheme.
  const tries = ['/dashboard', '/a/../welcome', '/%2F%2Fevil.example', '/%5Cevil.example', '/@evil.example', '/;//evil.example', '/x?next=//evil.example', '/x#//evil.example', '/／／evil.example', '/javascript:alert(1)', `/${'a'.repeat(5000)}`];
  for (const value of tries) {
    const out = safeNext(value);
    assert.ok(out === null || (/^\/(?![\/\\])/.test(out) && new URL(out, 'https://portal.example').origin === 'https://portal.example'), `${value} gave ${out}`);
  }
  // A walk back out of the sign-in pages is fine; a walk into them is not.
  assert.equal(safeNext('/auth/../welcome'), '/welcome');
  assert.equal(safeNext('/welcome/../auth/login'), null);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', '/\tevil.example', '/\\evil.example', '\\\\evil.example', ' /welcome', {}, ['/welcome'], 7, true]) assert.equal(safeNext(bad), null, String(bad));
});

// The break-it tester, 13 Nov: Sign out in one tab signs the person's other
// tabs out too, and none of them keeps its page for whoever signs in next.
test('a sign-out counts for the other tabs for half a minute, and never from a made-up time', async () => {
  const { leftJustNow } = await import('../../src/lib/signIn/addresses.js');
  const now = Date.parse('2026-11-13T10:00:00Z');
  assert.equal(leftJustNow(String(now - 2000), now), true);
  assert.equal(leftJustNow(String(now - 29000), now), true);
  assert.equal(leftJustNow(String(now - 31000), now), false);
  assert.equal(leftJustNow(String(now + 5000), now), false);
  for (const bad of [null, '', 'soon', '0', '-5', 'NaN', '{}']) assert.equal(leftJustNow(bad, now), false, String(bad));
});
