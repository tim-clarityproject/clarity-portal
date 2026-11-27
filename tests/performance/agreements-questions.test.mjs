// src/lib/agreements/questions.js and its engine parts (Polish 1, Stage C; M28 version 6, "build"; Tim, 25 Nov 18:10):
// the builder as a questionnaire, the fee in pounds first and the figure the client sees, a momentum phase of any
// length, the term's sessions and end date, places and currencies typed as words, and the standard terms' dated
// versions (a signed agreement keeps the wording it was signed with).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as q from '../../src/lib/agreements/questions.js';
import { afterRhythm, isRhythm, momentumWeeks, rhythmOf, sessionsInTerm, suggestEnd, gapWeeks } from '../../src/lib/agreements/endDate.js';
import { blankTerms, checkTerms } from '../../src/lib/agreements/terms.js';
import { localFigures, underWarning } from '../../src/lib/agreements/fx.js';
import { equalCount, schedule, settleOptions } from '../../src/lib/agreements/settling.js';
import { findCurrencies, findPlaces, offsetWords, placeLine } from '../../src/lib/agreements/places.js';
import { buildClauses, forStorage, resolveChoice } from '../../src/lib/agreements/clauses.js';
import { newStandardRow, standardsChangedAt, standardsFor, clauseVersions, versionFields } from '../../src/lib/coach/agreementBuilder.js';

// M28 version 6's Sam: six months of one-to-one coaching from Mon 4 Jan 2027, weekly for 6 weeks then every 2 weeks.
const sam = () => q.asQuestionnaire({ ...blankTerms('sessions'), coaching: 'Six months of one-to-one coaching', clientFirst: 'Sam', startsOn: '2027-01-04', totalMinor: 450000, months: 6 });

test('a momentum phase of any length is one rhythm sentence, read back as its two answers', () => {
  assert.equal(rhythmOf(6, 'Every 2 weeks'), 'Weekly for 6 weeks, then every 2 weeks');
  assert.equal(rhythmOf(8, 'Monthly'), 'Weekly for 8 weeks, then monthly');
  assert.equal(rhythmOf(0, 'Weekly'), 'Weekly');
  assert.equal(momentumWeeks('Weekly for 4 weeks, then every 2 weeks'), 4);
  assert.equal(afterRhythm('Weekly for 4 weeks, then monthly'), 'Monthly');
  assert.ok(isRhythm('Weekly for 8 weeks, then as we agree'));
  assert.ok(isRhythm('Every 2 weeks'));
  assert.ok(!isRhythm('Weekly for 40 weeks, then every 2 weeks'));
  assert.ok(!isRhythm('Fortnightly-ish'));
  // Run 3's own rhythm keeps its gaps exactly.
  assert.deepEqual([5, 6, 7, 8].map((i) => gapWeeks(i, 'Weekly for 6 weeks, then every 2 weeks')), [1, 1, 2, 2]);
  assert.deepEqual([4, 5].map((i) => gapWeeks(i, 'Weekly for 4 weeks, then monthly')), [1, 4]);
});

test('Sam: 16 sessions over 6 months, ending Fri 2 Jul 2027 (the week of the last session), the first longer', () => {
  const t = sam();
  assert.equal(t.priceMode, 'monthly');
  assert.equal(t.monthlyMinor, 75000);
  assert.equal(t.gbpMinor, 75000);
  assert.equal(sessionsInTerm('2027-01-04', t.rhythm, 6), 16);
  assert.deepEqual(t.blocks, [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }]);
  assert.equal(t.endsOn, '2027-07-02');
  assert.equal(t.endsOn, suggestEnd('2027-01-04', t.blocks, t.rhythm));
  assert.deepEqual(q.termRows(t), { count: '16 sessions', countNote: '6 weekly, then 10 every 2 weeks', end: 'Fri 2 Jul 2027' });
  assert.deepEqual(checkTerms(t), []);
});

test('the answers change the terms: term, momentum, how often and length recount the sessions and the end', () => {
  let t = sam();
  t = q.answer(t, 'term', 12);
  assert.equal(t.months, 12);
  t = q.answer(t, 'mom', false);
  assert.equal(t.rhythm, 'Every 2 weeks');
  t = q.answer(t, 'often', 'Monthly');
  assert.equal(t.rhythm, 'Monthly');
  t = q.answer(t, 'len', '45');
  assert.deepEqual(t.blocks, [{ n: sessionsInTerm('2027-01-04', 'Monthly', 12), minutes: 45 }]);
  assert.equal(q.lengthOf(q.answer(t, 'len', '90-60')), '90-60');
  t = q.answer(t, 'mom', true);
  assert.equal(t.rhythm, 'Weekly for 6 weeks, then monthly');
  t = q.answer(t, 'mlen', 8);
  assert.equal(t.rhythm, 'Weekly for 8 weeks, then monthly');
  assert.equal(q.answer(t, 'notice', 48).noticeHours, 48);
  assert.equal(q.answer(t, 'after', 'renew').after, 'renew');
});

test('M28 version 6’s order and groups, the funded questions only when an organisation pays, the fx one only off pounds', () => {
  const t = sam();
  assert.deepEqual(q.questionKeys(t), ['payer', 'offer', 'start', 'mom', 'mlen', 'often', 'term', 'len', 'where', 'tz', 'fee', 'cur', 'settle', 'disc', 'extras', 'notice', 'after', 'check']);
  const org = q.answer(t, 'payer', 'org', { orgName: 'Morrow Cycles' });
  assert.deepEqual(q.questionKeys(org).slice(0, 5), ['payer', 'org', 'sponsor', 'po', 'offer']);
  const cad = q.answer(t, 'cur', 'CAD', { rate: 1.7544 });
  assert.ok(q.questionKeys(cad).includes('local'));
  assert.deepEqual(['payer', 'offer', 'start', 'fee', 'extras', 'notice', 'check'].map(q.groupOf), ['Who', 'What', 'When', 'Money', 'Included', 'Terms', 'Check']);
  assert.equal(q.firstOfGroup(q.questionKeys(t), 'When'), 'start');
  // A package's own questions: a name first and the note last, no client, no dates.
  assert.deepEqual(q.questionKeys(t, { pkgMode: true }), ['pname', 'mom', 'mlen', 'often', 'term', 'len', 'where', 'fee', 'settle', 'extras', 'notice', 'after', 'pnote']);
  assert.deepEqual(q.questionKeys(q.asQuestionnaire(blankTerms('retainer'))), ['payer', 'offer', 'start', 'rsess', 'where', 'tz', 'fee', 'cur', 'settle', 'extras', 'notice', 'check']);
  assert.equal(q.questionKeys(q.asQuestionnaire(blankTerms('team'))).includes('payer'), false);
});

test('the words: M28 version 6’s questions, with the client’s name', () => {
  const t = sam();
  const ctx = { first: 'Sam' };
  assert.equal(q.questionWords('fee', t, ctx).question, 'What’s your fee each month, in pounds?');
  assert.equal(q.questionWords('fee', t, ctx).hint, 'Always set in pounds first. If Sam settles in another currency, you’ll see it in theirs next.');
  assert.equal(q.questionWords('tz', t, ctx).question, 'Where is Sam based?');
  assert.equal(q.questionWords('often', t, ctx).question, 'After that, how often will you meet?');
  assert.equal(q.questionWords('after', t, ctx).question, 'What happens after the six months?');
  assert.equal(q.questionWords('check', t, ctx).question, 'Does this read right?');
});

test('"So far:" says what has been answered before the question, and nothing on the check', () => {
  const t = sam();
  const keys = q.questionKeys(t);
  assert.equal(q.soFar(t, 'payer', keys, { first: 'Sam', coachFirst: 'Tim' }), '');
  assert.equal(q.soFar(t, 'offer', keys, { first: 'Sam', coachFirst: 'Tim' }), 'So far: Tim · funded by Sam');
  assert.equal(q.soFar(t, 'cur', keys, { first: 'Sam', coachFirst: 'Tim' }),
    'So far: Tim · funded by Sam · Six months of one-to-one coaching · from Mon 4 Jan · 16 sessions over 6 months · £750 a month');
  assert.equal(q.soFar(t, 'check', keys, { first: 'Sam', coachFirst: 'Tim' }), '');
});

test('Does this read right? says it in plain sentences, each with the question its Change opens', () => {
  const t = sam();
  const lines = q.checkLines(t, { first: 'Sam', coachFirst: 'Tim' });
  assert.deepEqual(lines.map((l) => [l.key, l.edit]), [['what', 'offer'], ['who', 'payer'], ['when', 'start'], ['fee', 'fee'], ['also', 'extras'], ['terms', 'notice']]);
  assert.equal(lines[0].text, 'Six months of one-to-one coaching');
  assert.equal(lines[1].text, 'Coached by Tim, funded by Sam');
  assert.equal(lines[2].text, '16 sessions (weekly for 6 weeks, then every 2 weeks), the first 90 minutes, then 60, on Zoom, from Mon 4 Jan to Fri 2 Jul 2027');
  assert.equal(lines[3].text, '£750 a month, by Direct Debit, £4,500 in all');
  assert.equal(lines[4].text, 'Also included: ad hoc support by email and WhatsApp between sessions and The Clarity Portal at the Executive level');
  assert.equal(lines[5].text, '24 hours’ notice to rearrange; you offer the next term a month before the end');
  const up = q.answer(t, 'settle', 'full');
  assert.equal(q.checkLines(up, { first: 'Sam' })[3].text, 'All up front, £4,275 with 5% off');
});

test('the fee in pounds first, then the figure the client sees: rounded up, down, today’s rate, with a warning under the £ price', () => {
  // £750 at 1.7544 Canadian dollars to the pound: about C$1,316.
  const f = localFigures(75000, 'CAD', 1.7544);
  assert.deepEqual(f.map((o) => [o.mode, o.minor, o.under]), [['up', 135000, false], ['down', 130000, true], ['exact', 131600, false]]);
  assert.equal(underWarning(130000, 'CAD', 1.7544, 75000), 'That’s about £741, under your £750.');
  assert.equal(underWarning(135000, 'CAD', 1.7544, 75000), '');
  let t = q.answer(sam(), 'cur', 'CAD', { rate: 1.7544 });
  assert.equal(t.currency, 'CAD');
  assert.equal(t.monthlyMinor, 135000); // rounded up, to start with
  assert.equal(t.gbpMinor, 75000); // the coach's £ figure kept alongside
  t = q.answer(t, 'local', { mode: 'down' }, { rate: 1.7544 });
  assert.equal(t.monthlyMinor, 130000);
  t = q.answer(t, 'local', { mode: 'own', minor: 133300 }, { rate: 1.7544 });
  assert.equal(t.monthlyMinor, 133300);
  assert.equal(t.localMode, 'own');
  // A new £ figure moves the client's figure the way it was chosen; their own figure stays.
  assert.equal(q.answer(t, 'fee', 80000, { rate: 1.7544 }).monthlyMinor, 133300);
  const choices = q.localChoices(q.answer(sam(), 'cur', 'CAD', { rate: 1.7544 }), 1.7544);
  assert.deepEqual(choices.map((c) => c.label), ['C$1,350 a month', 'C$1,300 a month', 'C$1,316 a month', 'Your own figure']);
  assert.equal(choices[1].hint, 'Rounded down, about £741, a little under your price');
  assert.equal(q.checkLines(t, { first: 'Sam' })[3].text, 'C$1,333 a month, by Direct Debit, C$7,998 in all (your £750 a month)');
});

test('monthly by Direct Debit is one instalment for each month of the term (run 3’s 6 stay for a total)', () => {
  const t = q.answer(q.answer(sam(), 'term', 3), 'settle', 'equal');
  assert.equal(equalCount(t), 3);
  const s = schedule(t, { signedDay: '2026-12-01', choice: 'plan' });
  assert.deepEqual(s.map((x) => x.amount), [75000, 75000, 75000]);
  assert.equal(equalCount(blankTerms('sessions')), 6);
  assert.equal(settleOptions({ ...blankTerms('sessions'), totalMinor: 600000 }).find((o) => o.value === 'equal').label, '6 monthly instalments of £1,000');
});

test('places and currencies typed as words', () => {
  assert.deepEqual(findPlaces('toron').map((p) => p.zone), ['America/Toronto']);
  assert.ok(findPlaces('canada').every((p) => p.label.endsWith('Canada')));
  assert.deepEqual(findPlaces(''), []);
  assert.equal(offsetWords(0), 'GMT');
  assert.equal(offsetWords(330), 'GMT+5:30');
  assert.equal(offsetWords(-300), 'GMT−5');
  assert.match(placeLine('Europe/London', new Date('2027-01-04T10:30:00Z')), /^GMT, 10:30 there now$/);
  assert.deepEqual(findCurrencies('canad').map((c) => c.code), ['CAD']);
  assert.deepEqual(findCurrencies('pounds').map((c) => c.code), ['GBP']);
  assert.deepEqual(findCurrencies('japan').map((c) => c.code), ['JPY']);
  assert.ok(findCurrencies('dollar').length >= 5);
  assert.deepEqual(findCurrencies('rupee'), []); // only the 15 an agreement can be in
});

test('the email’s words: "your six months of coaching, starting on Monday 4 January"', () => {
  assert.deepEqual(q.emailWords(sam()), { what: 'six months of coaching', startsWords: 'Monday 4 January' });
  assert.deepEqual(q.emailWords({ kind: 'oneoff', work: 'Team workshop', oneoff: { on: '2027-03-02' } }), { what: 'team workshop', startsWords: 'Tuesday 2 March' });
});

test('switching ad hoc support or the portal off, and "It renews", change the wording; earlier versions read as before', () => {
  const t = sam();
  const coaching = (x) => buildClauses(x).find((c) => c.key === 'coaching').paragraphs.map((p) => p.text).join(' ');
  assert.match(coaching(t), /The Clarity Portal is included/);
  assert.doesNotMatch(coaching({ ...t, portal: false }), /The Clarity Portal is included/);
  assert.doesNotMatch(coaching({ ...t, adhoc: false }), /Between coaching sessions/);
  const ending = (x) => buildClauses(x).find((c) => c.key === 'ending').paragraphs.map((p) => p.text).join(' ');
  assert.match(ending({ ...t, after: 'renew' }), /renews for another 6 months/);
  assert.doesNotMatch(ending(t), /renews/);
  assert.match(ending({ ...t, months: 12, fullTerm: true }), /full 12 months/);
  assert.match(ending({ ...blankTerms('sessions'), fullTerm: true }), /full 6 months/);
});

test('the standard terms: saving makes a new dated version for new agreements; a signed agreement keeps its wording', () => {
  const t = sam();
  const first = standardsFor([], 'sessions');
  // Sam's agreement is signed with the first wording, kept with the version (agreements rule 3).
  const signed = versionFields(t, { standards: first }).clauses;
  const before = resolveChoice(signed, 'plan').find((c) => c.key === 'rearranging').paragraphs[0].text;
  // The coach edits the clause: a new version, dated.
  const row = { ...newStandardRow({ id: 'r1', coachId: 'c1', kind: 'sessions', key: 'rearranging', title: 'Rearranging and cancelling', paragraphs: [{ text: 'Rearrange with {noticeHours} hours’ notice.' }], standards: first }), created_at: '2026-11-12 09:30:00' };
  assert.equal(row.version, 1);
  const rows = [row];
  const now = standardsFor(rows, 'sessions');
  assert.equal(standardsChangedAt(rows, 'sessions'), '2026-11-12 09:30:00');
  assert.deepEqual(clauseVersions(rows, 'sessions', 'rearranging').map((v) => [v.version, v.created_at]), [[1, '2026-11-12 09:30:00']]);
  // A new agreement uses it…
  assert.equal(buildClauses(t, { standards: now }).find((c) => c.key === 'rearranging').paragraphs[0].text, 'Rearrange with 24 hours’ notice.');
  assert.equal(forStorage(t, { standards: now }).find((c) => c.key === 'rearranging').paragraphs[0].text, 'Rearrange with 24 hours’ notice.');
  // …and the signed one still reads, from its own stored clauses, the wording it was signed with.
  assert.equal(resolveChoice(signed, 'plan').find((c) => c.key === 'rearranging').paragraphs[0].text, before);
  assert.notEqual(before, 'Rearrange with 24 hours’ notice.');
  // A second save is version 2; the first stays as it was.
  const row2 = newStandardRow({ id: 'r2', coachId: 'c1', kind: 'sessions', key: 'rearranging', title: 'Rearranging and cancelling', paragraphs: [{ text: 'Again.' }], standards: now });
  assert.equal(row2.version, 2);
});
