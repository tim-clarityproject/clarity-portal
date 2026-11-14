// Team performance check (M10, version 5.6): the tool's rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/team-check.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIGNMENT, ALIGNMENT_SAID, AUTONOMY, AUTONOMY_SAID, QUESTIONS_TITLE, REQUIRED, TOOL_NAME, TOOL_PATH, TRUST,
  addPerson, areaOf, barColours, chartDots, chartFrame, checkFrom, checkTitle, countLine, dotTip, emptyCheck,
  firstName, firstUnanswered, hasAnswers, headline, isComplete, lastMonth, lastWords, newestFinished, nudge,
  options, past, percentAt, question, ratingSteps, removePerson, requiredMessage, restorePerson, savedAnswers,
  setRating, startQuestions, tableRows, trustRows, word,
} from '../../src/lib/teamCheck/model.js';
import { HUBS, TOOLS, areaOf as menuAreaOf } from '../../src/lib/navigation.js';
import { planRows } from '../../src/lib/savedItems.js';

// M10's own invented team: [now, at the last check], 1 to 5.
const PPL = [
  { id: 'p1', name: 'Priya Shah', role: 'Head of Operations', t: [5, 4], a: [4, 3], u: [4, 4] },
  { id: 'p2', name: 'Tom Ellis', role: 'Sales Director', t: [2, 4], a: [4, 4], u: [3, 3] },
  { id: 'p3', name: 'Grace Okafor', role: 'Finance Lead', t: [5, 5], a: [5, 4], u: [2, 2] },
  { id: 'p4', name: 'Daniel Reyes', role: 'Product Lead', t: [4, 4], a: [2, 2], u: [4, 4] },
  { id: 'p5', name: 'Leila Haddad', role: 'People Lead', t: [3, 3], a: [2, 2], u: [2, 1] },
];
const NOW = new Date(2026, 10, 14, 12);
const OCTOBER = new Date(2026, 9, 14, 9).toISOString();
const m10 = () => ({
  people: PPL.map((p) => ({ id: p.id, name: p.name, role: p.role, t: p.t[0], a: p.a[0], u: p.u[0] })),
  shared: false,
  last: { at: OCTOBER, people: Object.fromEntries(PPL.map((p) => [p.id, { t: p.t[1], a: p.a[1], u: p.u[1] }])) },
});
const team = (rows, last = null) => ({
  people: rows.map(([name, t, a, u], i) => ({ id: `q${i + 1}`, name, role: '', t, a, u })),
  shared: false,
  last,
});
const words = (s) => s.trim().split(/\s+/).length;

test('trust is Tim’s five levels, lowest first, each with its line', () => {
  assert.deepEqual(TRUST.map((x) => x.label), ['Silent resistance', 'Open resistance', 'Uncommitted', 'Token cheerleader', 'Committed']);
  assert.equal(TRUST[0].hint, 'They seem to go along with you, but quietly work against your decisions.');
  assert.equal(TRUST[1].hint, 'They push back openly on your decisions.');
  assert.equal(TRUST[2].hint, 'They go along with things without really backing them.');
  assert.equal(TRUST[3].hint, 'They say yes to your face, but do little to back it.');
  assert.equal(TRUST[4].hint, 'They back your decisions and act on them as their own.');
  assert.deepEqual(options('t').map((o) => o.value), [1, 2, 3, 4, 5]);
  assert.equal(options('t')[4].hint, TRUST[4].hint);
});

test('alignment and autonomy are five-word scales, said back as sentences', () => {
  assert.deepEqual(ALIGNMENT, ['Not well at all', 'Slightly well', 'Moderately well', 'Very well', 'Extremely well']);
  assert.deepEqual(AUTONOMY, ['None at all', 'A little', 'A moderate amount', 'A lot', 'A great deal']);
  assert.equal(ALIGNMENT_SAID.length, 5);
  assert.equal(AUTONOMY_SAID.length, 5);
  assert.equal(ALIGNMENT_SAID[0], 'doesn’t yet understand what you’re trying to achieve');
  assert.equal(AUTONOMY_SAID[4], 'has a great deal of autonomy to decide how to deliver');
  assert.equal(past(ALIGNMENT_SAID[0]), 'didn’t yet understand what you’re trying to achieve');
  assert.equal(past(ALIGNMENT_SAID[3]), 'understood what you’re trying to achieve very well');
  assert.equal(past(AUTONOMY_SAID[1]), 'had a little autonomy to decide how to deliver');
  assert.deepEqual(options('a').map((o) => o.label), ALIGNMENT);
  assert.equal(options('a')[0].hint, undefined, 'no second line that only repeats the answer (rule 29ap)');
  assert.equal(word('t', 4), 'Token cheerleader');
  assert.equal(word('a', 4), 'Very well');
  assert.equal(word('u', 4), 'A lot');
  assert.equal(word('u', 9), '');
  for (const kind of ['t', 'a', 'u']) for (const o of options(kind)) assert.ok(!/\d/.test(o.label), 'ratings are words, never numbers');
});

test('the questions name the person in curly quotes, word for word', () => {
  const p = { name: 'Priya Shah' };
  assert.equal(question('people'), 'Who reports to you?');
  assert.equal(nudge('people'), 'Add each person you lead directly.');
  assert.equal(question('t', p), 'How much does “Priya Shah” trust you as their leader?');
  assert.equal(nudge('t'), 'Choose the one that fits best.');
  assert.equal(question('a', p), 'How well does “Priya Shah” understand what you’re trying to achieve?');
  assert.equal(nudge('a'), 'Think about why it matters and what they’re accountable for.');
  assert.equal(question('u', p), 'How much autonomy does “Priya Shah” have to decide how to deliver?');
  assert.equal(nudge('u'), 'Think about the boundaries you’ve agreed.');
  assert.equal(countLine(1, 5), 'Person 1 of 5');
  assert.equal(QUESTIONS_TITLE, 'Questions to start with:');
});

test('the screens: three questions for each person, in the list’s order, and M10’s % bar', () => {
  const steps = ratingSteps(m10());
  assert.equal(steps.length, 15);
  assert.deepEqual(steps.slice(0, 4).map((s) => s.key), ['t:p1', 'a:p1', 'u:p1', 't:p2']);
  assert.deepEqual([steps[0].n, steps[0].of, steps[14].n], [1, 5, 5]);
  assert.deepEqual([0, 1, 2, 3].map((at) => percentAt(at, 5)), [0, 7, 13, 20]);
  assert.equal(percentAt(15, 5), 100);
  assert.equal(percentAt(3, 0), 0);
});

test('the list: adding, removing, Undo, and never a greyed-out button', () => {
  let c = emptyCheck();
  assert.deepEqual(c, { people: [], shared: false, last: null });
  assert.equal(requiredMessage(c), 'Add at least one person to carry on.');
  assert.equal(REQUIRED.name, 'Type their name to carry on.');
  assert.equal(hasAnswers(c), false);
  assert.equal(addPerson(c, { id: 'a', name: '   ', role: 'x' }), c, 'no name, nobody added');
  c = addPerson(c, { id: 'a', name: '  Sam   Carter ', role: ' Head of Marketing ' });
  c = addPerson(c, { id: 'b', name: 'Jo', role: '' });
  assert.deepEqual(c.people.map((p) => [p.name, p.role]), [['Sam Carter', 'Head of Marketing'], ['Jo', '']]);
  assert.equal(requiredMessage(c), null);
  assert.equal(firstUnanswered(c), 't:a');
  c = setRating(c, 'a', 't', 5);
  c = setRating(c, 'a', 'a', 4);
  c = setRating(c, 'a', 'u', 9); // not an answer
  assert.equal(firstUnanswered(c), 'u:a');
  c = setRating(c, 'a', 'u', 4);
  assert.equal(firstUnanswered(c), 't:b');
  assert.equal(isComplete(c), false);
  const sam = c.people[0];
  const without = removePerson(c, 'a');
  assert.deepEqual(without.people.map((p) => p.id), ['b']);
  const back = restorePerson(without, sam, 0);
  assert.deepEqual(back.people.map((p) => p.id), ['a', 'b']);
  assert.equal(back.people[0].t, 5, 'Undo brings the answers back too');
  assert.equal(restorePerson(back, sam, 0), back, 'never twice');
});

test('the three named areas', () => {
  assert.equal(areaOf({ a: 4, u: 4 }), 'hp');
  assert.equal(areaOf({ a: 5, u: 3 }), 'ps');
  assert.equal(areaOf({ a: 3, u: 4 }), 'ch');
  assert.equal(areaOf({ a: 3, u: 3 }), '');
  assert.deepEqual(m10().people.map(areaOf), ['hp', 'ps', 'ps', 'ch', '']);
});

test('the opening sentence is a sentence, never a big figure', () => {
  assert.equal(headline(m10()), '1 of your 5 people is in the high-performance area right now.');
  assert.equal(headline(team([['A B', 5, 4, 4], ['C D', 5, 5, 5], ['E F', 1, 1, 1]])), '2 of your 3 people are in the high-performance area right now.');
  assert.equal(headline(team([['A B', 5, 1, 4], ['C D', 5, 2, 5]])), 'None of your 2 people are in the high-performance area right now.');
  assert.equal(headline(team([['Sam Carter', 5, 5, 5]])), 'Sam is in the high-performance area right now.');
  assert.equal(headline(team([['Sam Carter', 5, 2, 5]])), 'Sam isn’t in the high-performance area right now.');
  assert.equal(headline(emptyCheck()), '');
  // Someone not yet rated is not counted.
  const part = team([['A B', 5, 4, 4], ['C D', null, null, null]]);
  assert.equal(headline(part), 'A is in the high-performance area right now.');
});

test('“now” and “At your last check, in October”: the real month, never “this month”', () => {
  const c = m10();
  assert.equal(lastMonth(c.last, NOW), 'October');
  assert.equal(lastWords(c.last, NOW), 'At your last check, in October');
  assert.equal(lastWords({ at: new Date(2025, 11, 3).toISOString(), people: {} }, NOW), 'At your last check, in December 2025');
  assert.equal(lastWords(null, NOW), '');
  const priya = dotTip(c, c.people[0], NOW);
  assert.equal(priya.value, 'Priya Shah');
  assert.equal(priya.when, 'Now');
  assert.deepEqual(priya.extra, [
    'Priya understands what you’re trying to achieve very well.',
    'Priya has a lot of autonomy to decide how to deliver.',
    'At your last check, in October, Priya understood what you’re trying to achieve moderately well.',
  ]);
  assert.equal(priya.label, 'Priya Shah. Priya understands what you’re trying to achieve very well and has a lot of autonomy to decide how to deliver.');
  const tom = dotTip(c, c.people[1], NOW);
  assert.equal(tom.extra[2], 'It’s the same as at your last check, in October.');
  const leila = dotTip(c, c.people[4], NOW);
  assert.equal(leila.extra[2], 'At your last check, in October, Leila had no autonomy to decide how to deliver.');
  const both = dotTip({ ...c, last: { at: OCTOBER, people: { p1: { t: 3, a: 1, u: 1 } } } }, c.people[0], NOW);
  assert.equal(both.extra[2], 'At your last check, in October, Priya didn’t yet understand what you’re trying to achieve and had no autonomy to decide how to deliver.');
  // A first check, or someone new: nothing is said about a last check.
  assert.equal(dotTip({ ...c, last: null }, c.people[0], NOW).extra.length, 2);
  assert.equal(dotTip({ ...c, last: { at: OCTOBER, people: {} } }, c.people[0], NOW).extra.length, 2);
  for (const p of c.people) for (const line of dotTip(c, p, NOW).extra) assert.ok(!/this month|last month/i.test(line));
});

test('the chart: M10’s own measures, dots side by side on a shared spot, the last check’s ring', () => {
  const f = chartFrame(false);
  assert.deepEqual([f.W, f.H, f.R], [680, 440, 8]);
  const ph = chartFrame(true);
  assert.deepEqual([ph.W, ph.H, ph.R], [340, 340, 7]);
  const dots = chartDots(m10(), f);
  assert.equal(dots.length, 5);
  assert.deepEqual(dots.map((d) => d.good), [true, false, false, false, false], 'only High-performance is filled');
  // Priya moved (alignment 3 to 4): a ring where she was; Tom didn’t: no ring.
  assert.ok(dots[0].ring && Math.abs(dots[0].ring.x - f.X(4)) < 0.01 && Math.abs(dots[0].ring.y - f.Y(3)) < 0.01);
  assert.equal(dots[1].ring, null);
  assert.ok(dots[0].line, 'a line from where she was');
  // Two people on one spot sit side by side, R*2+52 apart.
  const shared = chartDots(team([['A B', 3, 3, 3], ['C D', 3, 3, 3]]), f);
  assert.ok(Math.abs((shared[1].x - shared[0].x) - (f.R * 2 + 52)) < 0.01);
  assert.equal(shared[0].y, shared[1].y);
  // Someone not rated has no dot.
  assert.equal(chartDots(team([['A B', 3, 3, 3], ['C D', 3, null, 3]]), f).length, 1);
});

test('the colour rules: coral marks the alignment of anyone in Chaotic', () => {
  const c = barColours(m10());
  // Daniel is in Chaotic: his alignment is coral and his autonomy grey.
  assert.deepEqual(c.map((x) => x.alignment), ['good', 'good', 'good', 'low', ''], 'Leila’s equal-lowest alignment stays grey while someone is in Chaotic');
  assert.deepEqual(c.map((x) => x.autonomy), ['good', '', '', '', '']);
  assert.deepEqual(c.map((x) => x.trust), ['good', 'low', 'good', '', '']);
  // Two people in Chaotic: both.
  const two = barColours(team([['A', 3, 2, 5], ['B', 3, 3, 4], ['C', 3, 1, 1]]));
  assert.deepEqual(two.map((x) => x.alignment), ['low', 'low', '']);
  assert.deepEqual(two.map((x) => x.autonomy), ['', '', '']);
});

test('the colour rules: with no one in Chaotic, the lowest alignment, ties included', () => {
  const c = barColours(team([['A', 4, 2, 2], ['B', 4, 2, 3], ['C', 4, 3, 3], ['D', 4, 5, 5]]));
  assert.deepEqual(c.map((x) => x.alignment), ['low', 'low', '', 'good']);
  // Everyone at 4 or 5: nothing is coral.
  const high = barColours(team([['A', 4, 4, 4], ['B', 4, 5, 3]]));
  assert.deepEqual(high.map((x) => x.alignment), ['good', 'good']);
  // One person: their own alignment is the lowest.
  assert.deepEqual(barColours(team([['A', 4, 3, 3]])).map((x) => x.alignment), ['low']);
});

test('the colour rules: autonomy is never coral, and trust keeps its single lowest', () => {
  const every = [];
  for (let a = 1; a <= 5; a += 1) for (let u = 1; u <= 5; u += 1) every.push([`P${a}${u}`, ((a + u) % 5) + 1, a, u]);
  const c = barColours(team(every));
  assert.ok(c.every((x) => x.autonomy !== 'low'));
  assert.equal(c.filter((x) => x.trust === 'low').length, 1, 'one coral trust bar, however many share the lowest');
  // Tied lowest trust: the first on the list.
  const tied = barColours(team([['A', 3, 4, 4], ['B', 2, 4, 4], ['C', 2, 4, 4]]));
  assert.deepEqual(tied.map((x) => x.trust), ['', 'low', '']);
  // Everyone Committed: mint, never coral.
  assert.deepEqual(barColours(team([['A', 5, 4, 4], ['B', 5, 4, 4]])).map((x) => x.trust), ['good', 'good']);
  // A Chaotic person's autonomy is grey even at 5.
  assert.equal(barColours(team([['A', 3, 1, 5]]))[0].autonomy, '');
});

test('the trust list and the table say each answer in words', () => {
  const rows = trustRows(m10());
  assert.deepEqual(rows.map((r) => [r.name, r.word, r.tone]), [
    ['Priya Shah', 'Committed', 'good'], ['Tom Ellis', 'Open resistance', 'low'], ['Grace Okafor', 'Committed', 'good'],
    ['Daniel Reyes', 'Token cheerleader', ''], ['Leila Haddad', 'Uncommitted', ''],
  ]);
  assert.equal(rows[1].label, 'Tom Ellis. Trust: Open resistance.');
  const t = tableRows(m10());
  assert.deepEqual(t[3], { id: 'p4', name: 'Daniel Reyes', role: 'Product Lead', alignment: { value: 2, word: 'Slightly well', tone: 'low' }, autonomy: { value: 4, word: 'A lot', tone: '' } });
  assert.deepEqual(t[0].autonomy, { value: 4, word: 'A lot', tone: 'good' });
});

test('Questions to start with: Chaotic first, then trust, then autonomy, each naming its person', () => {
  const qs = startQuestions(m10());
  assert.deepEqual(qs.map((q) => q.kind), ['chaotic', 'trust', 'autonomy']);
  assert.deepEqual(qs.map((q) => q.text), [
    'What would help “Daniel Reyes” explain the organisation’s intent in their own words?',
    'What has changed for “Tom Ellis”, and what would rebuild their trust?',
    'Which decisions could “Grace Okafor” own, within clear boundaries, to ease your load?',
  ]);
  for (const q of qs) assert.ok(words(q.text) <= 15, `${words(q.text)} words: ${q.text}`);
});

test('Questions to start with: about 15 words or fewer whatever the name, and only what applies', () => {
  const long = 'Dr. Maria-José Fernández de la Vega y Castellanos';
  const c = team([[long, 4, 2, 5], ['Anne-Marie van der Berg-Smythe the Third', 1, 5, 2], ['Xi', 5, 5, 1]], {
    at: OCTOBER, people: { q2: { t: 4, a: 5, u: 2 } },
  });
  const qs = startQuestions(c);
  assert.deepEqual(qs.map((q) => q.kind), ['chaotic', 'trust', 'autonomy']);
  for (const q of qs) assert.ok(words(q.text) <= 15, `${words(q.text)} words: ${q.text}`);
  assert.ok(qs[0].text.includes(`“${firstName(long)}”`), 'a very long name is said as its first word');
  assert.ok(qs[2].text.includes('“Xi”'));
  // No last check: no trust question (nothing has fallen). No one in Chaotic or seeking permission: none at all.
  assert.deepEqual(startQuestions(team([['A B', 1, 3, 3]])), []);
  assert.deepEqual(startQuestions(team([['A B', 1, 5, 5]])), []);
  // The biggest fall in trust is the one asked about; the Chaotic person is never asked about twice.
  const falls = team([['A', 3, 2, 5], ['B', 3, 3, 3], ['C', 1, 3, 3]], { at: OCTOBER, people: { q1: { t: 5, a: 2, u: 5 }, q2: { t: 4, a: 3, u: 3 }, q3: { t: 4, a: 3, u: 3 } } });
  assert.deepEqual(startQuestions(falls).map((q) => [q.kind, q.id]), [['chaotic', 'q1'], ['trust', 'q3']]);
  // Never more than three.
  assert.ok(startQuestions(m10()).length <= 3);
});

test('a new check starts from the last one’s people, with nothing answered', () => {
  const done = m10();
  const records = [
    { id: 'old', status: 'completed', answers: savedAnswers(done), shared: true, finishedAt: OCTOBER },
    { id: 'older', status: 'completed', answers: savedAnswers(team([['Z', 1, 1, 1]])), finishedAt: new Date(2026, 8, 1).toISOString() },
    { id: 'draft', status: 'draft', answers: savedAnswers(team([['Y', 1, 1, 1]])), updatedAt: new Date(2026, 10, 1).toISOString() },
    { id: 'gone', status: 'completed', gone: true, answers: savedAnswers(team([['X', 1, 1, 1]])), finishedAt: new Date(2026, 10, 2).toISOString() },
  ];
  const before = newestFinished(records);
  assert.equal(before.at, OCTOBER);
  const next = emptyCheck(before);
  assert.deepEqual(next.people.map((p) => [p.id, p.name, p.t, p.a, p.u]), PPL.map((p) => [p.id, p.name, null, null, null]));
  assert.equal(next.shared, true, 'who can see it carries over');
  assert.deepEqual(next.last.people.p2, { t: 2, a: 4, u: 3 });
  assert.equal(next.last.at, OCTOBER);
  assert.equal(newestFinished(records, 'old').people[0].name, 'Z');
  assert.equal(newestFinished([]), null);
});

test('saving: the answers go round trip, and a damaged row reads as not answered', () => {
  const c = m10();
  const saved = savedAnswers(c);
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.people[1], { id: 'p2', name: 'Tom Ellis', role: 'Sales Director', trust: 2, alignment: 4, autonomy: 3 });
  assert.deepEqual(checkFrom(saved, false), c);
  assert.equal(isComplete(c), true);
  assert.deepEqual(checkFrom(null), { people: [], shared: false, last: null });
  const odd = checkFrom({ people: [{ id: 'a', name: 'A', trust: 7, alignment: '3', autonomy: 2 }, { name: 'no id' }, null], last: { at: OCTOBER, people: { a: { t: 1 } } } });
  assert.deepEqual(odd.people, [{ id: 'a', name: 'A', role: '', t: null, a: null, u: 2 }]);
  assert.equal(odd.last, null);
  assert.equal(checkTitle(NOW), 'November team check');
  assert.equal(checkTitle('nonsense').endsWith(' team check'), true);
});

test('the tool has its tile, its one time and its place in the lists', () => {
  assert.equal(TOOLS.team.name, TOOL_NAME);
  assert.equal(TOOLS.team.to, TOOL_PATH);
  assert.match(TOOLS.team.time, /^~\d+ minutes$/);
  assert.ok(HUBS.interpersonal.groups.some((g) => g.tools.includes('team')));
  assert.equal(menuAreaOf(TOOL_PATH), 'interpersonal');
  const rows = planRows({
    toolAnswers: [
      { id: 'r1', tool: 'team_check', title: 'November team check', status: 'completed', answers: savedAnswers(m10()), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), finishedAt: NOW.toISOString() },
      { id: 'r2', tool: 'team_check', title: 'November team check', status: 'draft', answers: savedAnswers(m10()), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    ],
  }, '2026-11-14');
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].title, rows[0].typeLabel, rows[0].area, rows[0].isDraft, rows[0].dateLabel], ['November team check', 'Team performance check', 'interpersonal', false, 'Today']);
  assert.equal(rows[0].to.path, TOOL_PATH);
  assert.equal(rows[0].to.state.checkId, 'r1');
  assert.equal(rows[1].isDraft, true);
  assert.equal(rows[1].edit.path, TOOL_PATH, 'a draft carries on from the list');
});
