// Health Check 3, part 4: the completion email to the link's coach summarises the
// results with the same headline and questions as the results page and the
// PDF, from the same model. Renders the email body only: nothing is sent.
// Run with npm run test:healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeEmail, completionSummary, finishedEmail, linkEmail, ukDate, ukDateTime } from '../../api/_alignmentEmails.js';
import { draftFromData } from '../../src/pages/alignment/alignmentFlow.js';
import { headlineSentence, resultsModel } from '../../src/health-check/words.js';

// Saved answers as alignment_sessions.data holds them (ratings under the owner).
const saved = (extra = {}) => ({
  objective: 'Double recurring revenue by the end of 2027.',
  csfs: [
    { id: 'f1', text: 'Win enterprise customers in the US', level: 3 },
    { id: 'f2', text: 'A product customers can’t do without' },
    { id: 'f3', text: 'Cash to reach break-even', level: 1 },
  ],
  projects: [
    { id: 'p1', text: 'Enterprise sales team', started: '2026-02', due: '2026-12' },
    { id: 'p2', text: 'Customer success & retention', due: '2027-09' },
    { id: 'p3', text: 'New office fit-out' },
  ],
  ratings: {
    owner: {
      p1: { contrib: { f1: 3, f2: 3, f3: 2 }, progress: 2, resource: 4 },
      p2: { contrib: { f1: 3, f2: 2, f3: 2 }, progress: 2, resource: 3 },
      p3: { contrib: { f1: 0, f2: 1, f3: 0 }, progress: 4, resource: 5 },
    },
  },
  ...extra,
});
const COMPLETED = '2026-10-26T08:30:00'; // as the database gives it: UTC, no ending

const render = (data) => completeEmail({
  origin: 'https://example.invalid',
  token: 'test-token-not-real',
  clientLabel: 'Quillmark',
  respondentEmail: 'someone@example.invalid',
  code: '482913',
  completedText: 'Mon 26 Oct 2026, 08:30 UK time',
  objective: data.objective,
  summary: completionSummary(data, COMPLETED),
});

test('the email\'s headline and questions are the results page\'s, about the respondent', () => {
  const data = saved();
  const model = resultsModel(draftFromData(data), { asOf: '2026-10-26', theirs: true });
  const s = completionSummary(data, COMPLETED);
  assert.equal(s.headline, headlineSentence(model.headline));
  assert.deepEqual(s.questions, model.questions.map(({ label, question, reason }) => ({ label, question, reason })));
  assert.equal(s.line, 50);
  assert.deepEqual(s.questions.map((q) => q.label), ['Timing', 'Progress', 'Resource']);
  assert.match(s.questions[0].reason, /^They rated its progress “Bad”, and it’s due to finish in 2 months\.$/);
  assert.equal(s.headline, '0 of 2 important projects are moving well. 2 need attention.');
});

test('the email body holds the headline, the line and every question with its reason', () => {
  const data = saved();
  const s = completionSummary(data, COMPLETED);
  const { html, text, subject } = render(data);
  assert.equal(subject, 'Quillmark finished their Health Check');
  for (const words of [s.headline, 'Important means above 50%.', 'Questions to start with', ...s.questions.flatMap((q) => [q.label, q.reason])]) {
    assert.ok(html.includes(words), `the HTML is missing "${words}"`);
    assert.ok(text.includes(words), `the text is missing "${words}"`);
  }
  // names are escaped in the HTML, and in full in the text
  const q = s.questions.find((x) => x.kind === undefined && x.question.includes('Customer success'));
  assert.ok(q, 'the Progress question names Customer success & retention');
  assert.ok(html.includes('Customer success &amp; retention'));
  assert.ok(text.includes('Customer success & retention'));
  assert.ok(!html.includes('Most in need of attention'), 'the old top-three list is gone');
});

test('the headline comes first and the questions to start with come last (rule 29ar)', () => {
  const data = saved();
  const s = completionSummary(data, COMPLETED);
  const { html, text } = render(data);
  for (const body of [html, text]) {
    const at = (w) => body.indexOf(w);
    const order = [s.headline, 'Important means above 50%.', 'Objective', 'Double recurring revenue', 'Questions to start with', s.questions[0].label].map(at);
    assert.ok(order.every((n) => n >= 0), 'every part is there');
    assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'At a glance, the objective, then the questions');
    // nothing of the results follows the questions: the last one's reason is the last of the summary
    assert.ok(at(s.questions.at(-1).reason) > at('Questions to start with'));
    assert.ok(at(s.questions.at(-1).reason) > at('Objective'));
  }
});

test('the Resource question words the rating as the results page does', () => {
  const s = completionSummary(saved(), COMPLETED);
  const q = s.questions.find((x) => x.label === 'Resource');
  assert.equal(q.reason, 'They rated its resource requirements “Very high”, and its strategic importance is 11%.');
  const { html, text } = render(saved());
  assert.ok(html.includes(q.reason) && text.includes(q.reason));
});

test('the person\'s own line changes the email as it changes the page', () => {
  const s80 = completionSummary(saved({ importantLine: 80 }), COMPLETED);
  assert.equal(s80.line, 80);
  assert.ok(render(saved({ importantLine: 80 })).html.includes('Important means above 80%.'));
  const s30 = completionSummary(saved({ importantLine: 30 }), COMPLETED);
  assert.notEqual(s30.headline, s80.headline);
});

test('an older Health Check (no levels, no line) and an empty one still make an email', () => {
  const old = saved();
  old.csfs = old.csfs.map(({ level: _level, ...c }) => c);
  const s = completionSummary(old, COMPLETED);
  assert.equal(s.line, 50);
  assert.ok(s.questions.length >= 1);
  const empty = completionSummary({}, COMPLETED);
  assert.equal(empty.headline, 'None of their important projects is under way yet.');
  assert.deepEqual(empty.questions.map((q) => q.label), ['On track']);
  assert.ok(render({ objective: '' }).html.includes('On track'));
});

test('without dates there is no Timing question; the date counts in the UK', () => {
  const data = saved();
  data.projects = data.projects.map(({ started: _s, due: _d, ...p }) => p);
  assert.ok(!completionSummary(data, COMPLETED).questions.some((q) => q.label === 'Timing'));
  // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in the UK (summer time): 2 months, not 3, to Dec
  const late = completionSummary(saved(), '2026-09-30T23:30:00');
  assert.match(late.questions[0].reason, /due to finish in 2 months/);
});

// ---------------------------------------------------------------- the shared template (Tim, 10 Nov)
test('the coach’s email and the person’s email show the email address and the access code in the sign-in box', () => {
  const coach = render(saved());
  const person = linkEmail({ origin: 'https://example.invalid', token: 'test-token-not-real', dateText: 'Tue 10 Nov 2026', clientLabel: 'Quillmark', email: 'someone@example.invalid', code: '482913' });
  for (const e of [coach, person]) {
    for (const words of ['Email', 'someone@example.invalid', 'Access code', '482913']) {
      assert.ok(e.html.includes(words), `the HTML is missing "${words}"`);
      assert.ok(e.text.includes(words), `the text is missing "${words}"`);
    }
    assert.ok(e.text.includes('Access code: 482913'));
    assert.ok(e.html.includes('https://example.invalid/health-check/test-token-not-real'));
    assert.ok(e.text.includes('https://example.invalid/health-check/test-token-not-real'));
  }
  assert.equal(person.subject, 'Your Health Check results for Quillmark');
  assert.ok(person.text.includes('Your Health Check results are ready.'));
  assert.ok(person.text.includes('Quillmark, Tue 10 Nov 2026.'));
  assert.ok(person.text.includes('Open my results'));
  assert.ok(coach.text.includes('Open the results'));
  assert.ok(coach.text.includes('You made this Health Check link.'));
});

test('the owner’s note never holds the answers, the link, the email address or the access code', () => {
  const note = finishedEmail({ clientLabel: 'Quillmark', dateText: 'Tue 10 Nov 2026' });
  assert.equal(note.subject, 'Quillmark finished a Health Check');
  for (const part of [note.html, note.text]) {
    assert.ok(part.includes('The answers went only to the coach who sent the link.'));
    assert.ok(!/482913|Access code|someone@|health-check\/|Questions to start with/.test(part));
  }
});

test('every Health Check email is the shared template: light, signed off, with a plain-text version and its image inside', () => {
  const emails = [
    render(saved()),
    linkEmail({ origin: 'https://example.invalid', token: 't', dateText: 'Tue 10 Nov 2026', clientLabel: 'Quillmark', email: 'a@example.invalid', code: '1' }),
    finishedEmail({ clientLabel: 'Quillmark', dateText: 'Tue 10 Nov 2026' }),
  ];
  for (const e of emails) {
    assert.ok(e.html.includes('The Clarity Project LTD, founded by Dr. Tim Dutton'));
    assert.ok(e.text.includes('The Clarity Project LTD, founded by Dr. Tim Dutton'));
    assert.ok(e.html.includes('background:#F9F8F5'), 'light');
    assert.ok(!/#000000;[^"]*color:#FFFFFF/i.test(e.html), 'never the old dark email');
    assert.ok(e.html.includes('cid:clarity-crosshair'));
    assert.equal(e.attachments.length, 1);
    assert.equal(e.attachments[0].content_id, 'clarity-crosshair');
    assert.equal(e.attachments[0].disposition, 'inline');
    assert.ok(e.attachments[0].content.length > 100);
    assert.ok(e.text.startsWith('The Clarity Portal'));
    assert.ok(!/<[a-z]/i.test(e.text), 'no HTML in the plain text');
  }
});

test('dates in the emails are in words, and a time says whose time it is', () => {
  assert.equal(ukDate(new Date('2026-11-10T12:00:00Z')), 'Tue 10 Nov 2026');
  assert.equal(ukDateTime('2026-10-26T08:30:00'), 'Mon 26 Oct 2026, 08:30 UK time');
  assert.equal(ukDateTime('2026-07-01T08:30:00'), 'Wed 1 Jul 2026, 09:30 UK time');
});
