// Break-it tester, 11 Nov: odd requests and odd ports. A request with no
// headers at all still gets the live address (it used to stop the email
// with an error), and a localhost link only ever has a real port.
// Run with npm run test:healthcheck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_ORIGIN, portalOrigin } from '../../api/_portalOrigin.js';
import { safeHref } from '../../src/lib/email/template.js';

const LOCAL = {};
const LIVE = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'clarity-portal-abc123-invented.vercel.app' };

test('no headers at all, or headers of an odd shape, get the live address and never an error', () => {
  for (const env of [LOCAL, LIVE, { VERCEL: '1' }]) {
    for (const headers of [null, undefined, 5, 'text', [], { host: null }, { host: 5 }, { host: {} }, { host: [] }, { 'x-forwarded-host': '', host: 'localhost:5173' }]) {
      assert.equal(portalOrigin(headers, env), LIVE_ORIGIN, JSON.stringify(headers));
    }
  }
});

test('a localhost link has a real port, 1 to 65535, on a developer’s machine only', () => {
  assert.equal(portalOrigin({ host: 'localhost:5173' }, LOCAL), 'http://localhost:5173');
  assert.equal(portalOrigin({ host: 'localhost:65535' }, LOCAL), 'http://localhost:65535');
  assert.equal(portalOrigin({ host: 'localhost:08080' }, LOCAL), 'http://localhost:8080');
  for (const host of ['localhost:00', 'localhost:000', 'localhost:65536', 'localhost:99999', 'localhost:0', 'localhost:1', 'localhost:+80', 'localhost:999999', 'localhost:5173@evil.example', 'localhost:5173.evil.example']) {
    assert.equal(portalOrigin({ host }, LOCAL), LIVE_ORIGIN, host);
  }
  // Vercel says it is a deployment, even with nothing else set: never localhost.
  for (const env of [LIVE, { VERCEL: '1' }, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }]) {
    assert.equal(portalOrigin({ host: 'localhost:5173' }, env), LIVE_ORIGIN, JSON.stringify(env));
  }
});

test('the template takes a localhost link only with a real port and a plain path', () => {
  assert.equal(safeHref('http://localhost:5173/health-check/test-token-not-real'), 'http://localhost:5173/health-check/test-token-not-real');
  for (const href of [
    'http://localhost:99999/x', 'http://localhost:65536/x', 'http://localhost:00/x', 'http://localhost:5173', 'http://localhost:5173/@evil.example',
    'http://localhost:5173/\\evil.example', 'http://localhost:5173/x\n', 'http://localhost:5173/x?next=1', 'http://localhost:5173/%2f%2fevil.example',
    'http://user@localhost:5173/x', 'http://localhost.evil.example:5173/x', 'http://localhost:5173.evil.example/x', 'HTTP://localhost:5173/x',
    ' http://localhost:5173/x', 'http://127.0.0.1:5173/x', 'http://evil.example/x', ['http://localhost:5173/x'],
  ]) {
    assert.throws(() => safeHref(href), /https address/, JSON.stringify(href));
  }
});
