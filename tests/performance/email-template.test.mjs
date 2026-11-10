// The one shared email template (src/lib/email; Tim, 10 Nov 2026): the
// HTML and the plain text come from the same document, and what people
// type can never become markup. The browser checks are tests/email/emails.mjs.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EMAIL_SIGN_OFF, imagesFor, renderEmail } from '../../src/lib/email/template.js';
import { healthCheckResultsEmail, healthCheckFinishedNoteEmail, sessionInOneHourEmail, sessionTomorrowEmail, leadingIdeasClientEmail } from '../../src/lib/email/emails.js';
import { EMAIL_EXAMPLES } from '../../src/pages/emailPreview/examples.js';
import { instantAt } from '../../src/lib/time/index.js';

test('what people type is shown as text, never as markup, in an email', () => {
  const r = renderEmail(healthCheckResultsEmail({ link: 'https://example.invalid/health-check/t', organisation: 'A & B <script>alert(1)</script>\nLtd', dateText: 'Tue 10 Nov 2026', email: 'a"b@example.invalid', code: '<b>1</b>' }));
  assert.ok(!r.html.includes('<script>alert'));
  assert.ok(r.html.includes('A &amp; B &lt;script&gt;alert(1)&lt;/script&gt; Ltd'));
  assert.ok(r.html.includes('&lt;b&gt;1&lt;/b&gt;'));
  assert.ok(r.text.includes('A & B <script>alert(1)</script> Ltd, Tue 10 Nov 2026.'));
  assert.equal(r.subject, 'Your Health Check results for A & B <script>alert(1)</script> Ltd');
  assert.ok(!r.subject.includes('\n'));
});

test('one document makes both versions: every line of the plain text is in the HTML', () => {
  for (const e of EMAIL_EXAMPLES) {
    const r = renderEmail(e.doc());
    // The logo's words are its alt text: what shows with images blocked.
    const words = r.html.replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, ' $1 ').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
    for (const line of r.text.split('\n').filter((l) => l && l !== '----' && !/^https:|^\{\{/.test(l))) {
      const said = line.replace(/: https:\S+$|: \{\{ [a-z_.A-Z ]+ \}\}$/, '').replace(/ \(~\d+ minutes\):$/, '').replace(/:$/, '').replace(/^- /, '');
      // A sign-in detail is "Email: …" in the text and two cells in the HTML.
      for (const part of (words.includes(said) ? [said] : said.split(': '))) assert.ok(words.includes(part), `${e.key}: "${part}" is only in the plain text`);
    }
  }
});

test('an email with no such part is refused, not sent half built', () => {
  assert.throws(() => renderEmail({ subject: 'x', blocks: [{ type: 'banner', text: 'x' }], footer: { lines: [] } }), /no "banner" part/);
});

test('the sign-off, and no postal address, on every portal email', () => {
  assert.equal(EMAIL_SIGN_OFF, 'The Clarity Project LTD, founded by Dr. Tim Dutton');
  for (const e of EMAIL_EXAMPLES.filter((x) => !x.key.startsWith('leading-ideas'))) assert.ok(renderEmail(e.doc()).text.includes(EMAIL_SIGN_OFF), e.key);
  assert.ok(!renderEmail(healthCheckFinishedNoteEmail({ organisation: 'X', dateText: 'Tue 10 Nov 2026' })).text.includes('Access code'));
});

test('the travel line shows only for a frequent traveller, and the 1-hour reminder has no clock time', () => {
  const base = { coach: 'Tim', at: instantAt('2026-11-11', '10:00', 'America/New_York'), zone: 'America/New_York', prepLink: 'https://p', zoomLink: 'https://z', preferencesLink: 'https://c', now: new Date('2026-11-10T15:00:00Z') };
  assert.ok(!renderEmail(sessionTomorrowEmail(base)).text.includes('Travelling?'));
  assert.ok(!renderEmail(sessionTomorrowEmail({ ...base, frequentTraveller: false })).html.includes('Travelling?'));
  assert.ok(renderEmail(sessionTomorrowEmail({ ...base, frequentTraveller: true })).text.includes('Travelling? Your calendar invite moves with you.'));
  assert.equal(renderEmail(sessionTomorrowEmail(base)).subject, 'Your coaching session with Tim is tomorrow at 10:00 am New York time');
  const hour = renderEmail(sessionInOneHourEmail({ coach: 'Tim', zoomLink: 'https://z', preferencesLink: 'https://c' }));
  assert.doesNotMatch(`${hour.subject} ${hour.text}`, /\d{1,2}:\d{2}| am\b| pm\b/);
});

test('Leading Ideas for a client has no button and nothing to answer', () => {
  const r = renderEmail(leadingIdeasClientEmail({ issue: 32, theme: 't', quote: 'q', by: 'b', question: 'w?', tailoredLine: 'Sam, this one’s for you.', shareLink: 'https://s', portalLink: 'https://p', preferencesLink: 'https://c' }));
  assert.ok(!r.html.includes('class="btn"'));
  assert.equal(r.subject, 'Leading Ideas #32: t');
  assert.deepEqual(r.images, ['project']);
  assert.equal(imagesFor(r.images, { project: 'AAAA' })[0].content_id, 'clarity-project');
});

test('the templates saved outside the code (Supabase, Kit) are made from the shared template and up to date', () => {
  const out = execFileSync('node', ['scripts/make-email-templates.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});
