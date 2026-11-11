// Health Check email links are built only from an allow-list of the portal's
// own addresses, never from the request's host (Claude's call, 11 Nov,
// 08:25; api/_portalOrigin.js). Run with npm run test:healthcheck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVE_ORIGIN, allowedOrigins, portalOrigin } from '../../api/_portalOrigin.js';
import { linkEmail, completeEmail } from '../../api/_alignmentEmails.js';
import {
  healthCheckFinishedForCoachEmail, healthCheckFinishedNoteEmail, healthCheckResultsEmail,
} from '../../src/lib/email/emails.js';
import { renderEmail } from '../../src/lib/email/template.js';

const LIVE = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'clarity-portal-abc123-invented.vercel.app' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'clarity-portal-abc123-invented.vercel.app', VERCEL_BRANCH_URL: 'clarity-portal-git-feature-performance-overhaul-invented.vercel.app' };
const LOCAL = {};

test('the live address is the portal’s own, and always first on the list', () => {
  assert.equal(LIVE_ORIGIN, 'https://portal.theclarityproject.co.uk');
  for (const env of [LIVE, PREVIEW, LOCAL]) assert.equal(allowedOrigins(env)[0], LIVE_ORIGIN);
  assert.deepEqual(allowedOrigins(LIVE), [LIVE_ORIGIN]);
  assert.deepEqual(allowedOrigins(PREVIEW), [LIVE_ORIGIN, `https://${PREVIEW.VERCEL_BRANCH_URL}`, `https://${PREVIEW.VERCEL_URL}`]);
});

test('a forged host falls back to the live address, on the live site, a preview and a developer’s machine', () => {
  const forged = [
    'evil.example', 'portal.theclarityproject.co.uk.evil.example', 'evil.example/portal.theclarityproject.co.uk',
    'portal.theclarityproject.co.uk@evil.example', 'evil.vercel.app', 'clarity-portal-abc123-invented.vercel.app.evil.example',
    'PORTAL.THECLARITYPROJECT.CO.UK.evil.example', 'localhost.evil.example:5173', 'evil.example:443', '', ' ', 'null',
    'portal.theclarityproject.co.uk:8443', 'xn--prtal-jua.theclarityproject.co.uk', 'evil.example\r\nX-Injected: 1',
  ];
  for (const env of [LIVE, PREVIEW, LOCAL]) {
    for (const host of forged) {
      assert.equal(portalOrigin({ host }, env), LIVE_ORIGIN, `Host: ${JSON.stringify(host)}`);
      assert.equal(portalOrigin({ 'x-forwarded-host': host, host: 'portal.theclarityproject.co.uk' }, env), LIVE_ORIGIN, `X-Forwarded-Host: ${JSON.stringify(host)}`);
    }
    // No headers at all, or odd shapes.
    assert.equal(portalOrigin({}, env), LIVE_ORIGIN);
    assert.equal(portalOrigin(undefined, env), LIVE_ORIGIN);
    assert.equal(portalOrigin({ host: ['evil.example', 'portal.theclarityproject.co.uk'] }, env), LIVE_ORIGIN);
    assert.equal(portalOrigin({ 'x-forwarded-host': 'evil.example, portal.theclarityproject.co.uk' }, env), LIVE_ORIGIN);
  }
});

test('the email itself: a forged host never reaches the link', () => {
  const origin = portalOrigin({ 'x-forwarded-host': 'evil.example', host: 'evil.example' }, LIVE);
  const person = linkEmail({ origin, token: 'test-token-not-real', dateText: 'Wed 11 Nov 2026', clientLabel: 'Quillmark', email: 'someone@example.invalid', code: '482913' });
  const coach = completeEmail({ origin, token: 'test-token-not-real', clientLabel: 'Quillmark', respondentEmail: 'someone@example.invalid', code: '482913', completedText: 'Wed 11 Nov 2026, 09:00 UK time', objective: '', summary: { headline: 'None yet.', line: 50, questions: [] } });
  for (const email of [person, coach]) {
    assert.ok(email.html.includes('https://portal.theclarityproject.co.uk/health-check/test-token-not-real'));
    assert.ok(email.text.includes('https://portal.theclarityproject.co.uk/health-check/test-token-not-real'));
    assert.ok(!/evil\.example/.test(email.html + email.text + email.subject));
  }
});

test('the portal’s own addresses are kept: the live site, this preview’s two addresses, and localhost on a developer’s machine', () => {
  assert.equal(portalOrigin({ host: 'portal.theclarityproject.co.uk' }, LIVE), LIVE_ORIGIN);
  assert.equal(portalOrigin({ host: 'Portal.TheClarityProject.co.uk' }, LIVE), LIVE_ORIGIN);
  assert.equal(portalOrigin({ 'x-forwarded-host': PREVIEW.VERCEL_BRANCH_URL }, PREVIEW), `https://${PREVIEW.VERCEL_BRANCH_URL}`);
  assert.equal(portalOrigin({ host: PREVIEW.VERCEL_URL }, PREVIEW), `https://${PREVIEW.VERCEL_URL}`);
  assert.equal(portalOrigin({ host: 'localhost:5173' }, LOCAL), 'http://localhost:5173');
  assert.equal(portalOrigin({ host: 'localhost:3000' }, LOCAL), 'http://localhost:3000');
});

test('a preview address counts only on a preview, and localhost only on a developer’s machine', () => {
  // The live site never sends a preview or localhost link, whatever the request says.
  assert.equal(portalOrigin({ host: LIVE.VERCEL_URL }, LIVE), LIVE_ORIGIN);
  assert.equal(portalOrigin({ host: 'localhost:5173' }, LIVE), LIVE_ORIGIN);
  assert.equal(portalOrigin({ host: 'localhost:5173' }, PREVIEW), LIVE_ORIGIN);
  // Another project's preview is not this one's.
  assert.equal(portalOrigin({ host: 'someone-elses-app.vercel.app' }, PREVIEW), LIVE_ORIGIN);
  // Localhost needs a port, and nothing after it.
  for (const host of ['localhost', 'localhost:', 'localhost:5173/evil', 'localhost:5173@evil.example', 'localhost:999999', '127.0.0.1:5173']) assert.equal(portalOrigin({ host }, LOCAL), LIVE_ORIGIN, host);
});

test('a preview address that isn’t a vercel.app address is never put on the list', () => {
  const odd = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'evil.example', VERCEL_BRANCH_URL: 'https://evil.example/x.vercel.app', PORTAL_PREVIEW_HOSTS: 'evil.example, also-ours-invented.vercel.app, evil.example/.vercel.app' };
  assert.deepEqual(allowedOrigins(odd), [LIVE_ORIGIN, 'https://also-ours-invented.vercel.app']);
  assert.equal(portalOrigin({ host: 'evil.example' }, odd), LIVE_ORIGIN);
  assert.equal(portalOrigin({ host: 'also-ours-invented.vercel.app' }, odd), 'https://also-ours-invented.vercel.app');
});

test('a localhost link is taken by the template only as http://localhost with a port', () => {
  const doc = (href) => ({ brand: 'portal', subject: 'x', blocks: [{ type: 'button', label: 'Open', href }], footer: { lines: ['x'] } });
  assert.ok(renderEmail(doc('http://localhost:5173/health-check/test-token')).html.includes('http://localhost:5173/health-check/test-token'));
  for (const href of ['http://localhost/health-check/t', 'http://localhost.evil.example:5173/t', 'http://localhost:5173@evil.example/t', 'http://evil.example/t', 'http://localhost:5173/t?next=//evil.example', 'http://127.0.0.1:5173/t']) {
    assert.throws(() => renderEmail(doc(href)), /https address/, href);
  }
});

test('an empty organisation name gives "A Health Check has finished", never a subject that starts with a space', () => {
  const summary = { headline: 'None yet.', line: 50, questions: [] };
  for (const organisation of ['', '   ', null, undefined, '\n\t']) {
    const coach = healthCheckFinishedForCoachEmail({ link: 'https://portal.theclarityproject.co.uk/health-check/t', organisation, email: 'a@example.invalid', code: '1', finishedText: 'Wed 11 Nov 2026, 09:00 UK time', objective: '', summary });
    const note = healthCheckFinishedNoteEmail({ organisation, dateText: 'Wed 11 Nov 2026' });
    for (const doc of [coach, note]) {
      assert.equal(doc.subject, 'A Health Check has finished');
      assert.equal(doc.blocks[0].text, 'A Health Check has finished.');
      const made = renderEmail(doc);
      assert.equal(made.subject, 'A Health Check has finished');
      assert.ok(!/^\s/.test(made.subject) && !/undefined|null/.test(made.subject + made.text));
    }
  }
  assert.equal(healthCheckFinishedForCoachEmail({ link: 'https://portal.theclarityproject.co.uk/health-check/t', organisation: 'Quillmark', email: 'a@example.invalid', code: '1', finishedText: 'x', objective: '', summary }).subject, 'Quillmark finished their Health Check');
  assert.equal(healthCheckFinishedNoteEmail({ organisation: 'Quillmark', dateText: 'x' }).subject, 'Quillmark finished a Health Check');
});

test('the person’s email never has "Talk it through with Tim" or any booking link (Tim, 10 Nov, 23:53)', () => {
  const made = renderEmail(healthCheckResultsEmail({ link: 'https://portal.theclarityproject.co.uk/health-check/t', organisation: 'Quillmark', dateText: 'Wed 11 Nov 2026', email: 'a@example.invalid', code: '482913' }));
  assert.ok(!/talk it through|book a call|\/book\b/i.test(made.html + made.text));
  // One link only: the results.
  assert.deepEqual([...made.html.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]), ['https://portal.theclarityproject.co.uk/health-check/t']);
});
