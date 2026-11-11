// The one shared email template (src/lib/email; Tim, 10 Nov 2026): the
// HTML and the plain text come from the same document, and what people
// type can never become markup. The browser checks are tests/email/emails.mjs.
// Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EMAIL_SIGN_OFF, imagesFor, renderEmail, safeHref } from '../../src/lib/email/template.js';
import { healthCheckResultsEmail, healthCheckFinishedForCoachEmail, healthCheckFinishedNoteEmail, sessionInOneHourEmail, sessionTomorrowEmail, leadingIdeasClientEmail } from '../../src/lib/email/emails.js';
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

// ---------------------------------------------------------------- the break-it pass (10 Nov)
test('a link in an email is an https address or a service’s own placeholder, whole; anything else is refused', () => {
  const doc = (href) => ({ subject: 's', blocks: [{ type: 'button', label: 'b', href }], footer: { lines: [] } });
  for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:x', 'http://plain.example/', '//other.example/x', '/relative', 'file:///etc/passwd', 'mailto:x@example.invalid', 'https://ok.example/"onmouseover="x', 'https://ok.example/\nhttps://other.example', 'https://portal.example.invalid@other.example/', 'https://', 'https:///health-check/x', '{{ .ConfirmationURL }}javascript:1', '{{ other }}', '{{ .SiteURL }}', '', null, undefined, 5, {}]) {
    assert.throws(() => renderEmail(doc(href)), /https address/, String(href));
    for (const type of ['link', 'coral-link']) assert.throws(() => renderEmail({ subject: 's', blocks: [{ type, label: 'l', href }], footer: { lines: [] } }), /https address/, `${type} ${String(href)}`);
    assert.throws(() => renderEmail({ subject: 's', blocks: [], footer: { lines: [{ label: 'f', href }] } }), /https address/, `footer ${String(href)}`);
    assert.throws(() => renderEmail({ subject: 's', blocks: [], footer: { lines: [[{ label: 'f', href: 'https://ok.example/' }, { label: 'g', href }]] } }), /https address/, `footer pair ${String(href)}`);
  }
  for (const href of ['https://portal.example.invalid/health-check/abc', 'https://localhost:5173/x?y=1&z=2#w', '{{ .ConfirmationURL }}', '{{ unsubscribe_url }}']) {
    assert.equal(safeHref(href), href);
    assert.ok(renderEmail(doc(href)).html.includes(`href="${href.replace(/&/g, '&amp;')}"`), href);
  }
  // the image is inside the email, on https, or one of the build's own files
  for (const src of ['javascript:alert(1)', 'http://x.example/a.png', '//x.example/a.png', 'x" onerror="alert(1)']) assert.throws(() => renderEmail(doc('https://ok.example/'), { image: () => src }), /https address/, src);
  // only Kit's own message placeholder is ever written unescaped
  assert.throws(() => renderEmail({ subject: 's', blocks: [{ type: 'slot', placeholder: '<script>alert(1)</script>' }], footer: { lines: [] } }), /slot/);
});

test('a subject stays one line, and the plain text gains no footer or link line, whatever is typed', () => {
  const fake = 'Acme\r\nBcc: other@example.invalid\n----\nThe Clarity Project LTD\nUnsubscribe: https://other.example/u\u2028x\u2029y\u0085z\u000bv\u000cf\u0000n';
  const summary = { line: 50, headline: fake, questions: [{ label: fake, question: fake, reason: fake }] };
  const emails = [
    healthCheckResultsEmail({ link: 'https://example.invalid/health-check/t', organisation: fake, dateText: 'Tue 10 Nov 2026', email: fake, code: fake }),
    healthCheckFinishedForCoachEmail({ link: 'https://example.invalid/health-check/t', organisation: fake, email: fake, code: fake, finishedText: fake, objective: fake, summary }),
    healthCheckFinishedNoteEmail({ organisation: fake, dateText: fake }),
    sessionInOneHourEmail({ coach: fake, zoomLink: 'https://z.example/', preferencesLink: 'https://c.example/' }),
    leadingIdeasClientEmail({ issue: fake, theme: fake, quote: fake, by: fake, question: fake, tailoredLine: fake, shareLink: 'https://s.example/', portalLink: 'https://p.example/', preferencesLink: 'https://c.example/' }),
  ];
  for (const doc of emails) {
    const r = renderEmail(doc);
    // eslint-disable-next-line no-control-regex
    assert.doesNotMatch(r.subject, /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/, r.subject.slice(0, 40));
    const lines = r.text.split('\n');
    assert.equal(lines.filter((l) => l === '----').length, 1, 'one footer line only');
    assert.ok(!lines.some((l) => /^(Bcc:|Unsubscribe:|The Clarity Project LTD$)/.test(l)), 'no line of its own for what was typed');
    assert.ok(!r.html.includes('<script'));
  }
  // the characters that turn text round never reach a subject
  assert.equal(renderEmail(healthCheckFinishedNoteEmail({ organisation: 'Acme \u202Egnp.exe\u202C', dateText: 'x' })).subject, 'Acme gnp.exe finished a Health Check');
});

test('markup, comments and other services’ placeholders typed by a person are only ever text', () => {
  const typed = ['"><img src=x onerror=alert(1)>', '\'><svg/onload=alert(1)>', '</td></tr></table><h1>x</h1>', '<style>*{display:none}</style>', '<!--[if mso]><b>x</b><![endif]-->', '<![endif]-->', '-->', '</title><script>1</script>', '{{ unsubscribe_url }}', '{{ .ConfirmationURL }}', 'X'.repeat(10000), '😀 \u05E9\u05DC\u05D5\u05DD a\u200Bb'];
  for (const p of typed) {
    const r = renderEmail(healthCheckFinishedForCoachEmail({ link: 'https://example.invalid/health-check/t', organisation: p, email: p, code: p, finishedText: p, objective: p, summary: { line: 50, headline: p, questions: [{ label: p, question: p, reason: p }] } }));
    const tags = new Set([...r.html.matchAll(/<\/?([a-z0-9!]+)/gi)].map((m) => m[1].toLowerCase()));
    for (const tag of tags) assert.ok(['!doctype', '!', 'html', 'head', 'meta', 'title', 'link', 'style', 'body', 'div', 'table', 'tr', 'td', 'img', 'h1', 'a', 'span', 'br'].includes(tag), `${tag} from ${p.slice(0, 20)}`);
    assert.equal((r.html.match(/<!--/g) || []).length, 2, 'only the template’s own two Outlook comments');
    assert.equal((r.html.match(/<style/g) || []).length, 1);
    // the only addresses are the template's own and the link it was given
    const addresses = [...r.html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(addresses.filter((a) => !a.startsWith('https://fonts.googleapis.com/') && a !== 'cid:clarity-crosshair'), ['https://example.invalid/health-check/t']);
  }
});

