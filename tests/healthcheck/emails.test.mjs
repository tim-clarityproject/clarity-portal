// Health Check 3, part 4: the completion email to Tim and Adie summarises the
// results with the same headline and questions as the results page and the
// PDF, from the same model. Renders the email body only: nothing is sent.
// Run with npm run test:healthcheck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeEmail, completionSummary } from '../../api/_alignmentEmails.js';
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
  completedText: '26 October 2026, 09:30',
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
  assert.equal(subject, 'Strategic Alignment Health Check completed: Quillmark');
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
