// src/lib/agreements/standardWording.js and clauses.js: the wording per kind, reasons, numbering, edits and Main points
// (brief items 11, 15, 16, 17, 38, 39; M28's STD, clauses() and points()).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as cl from '../../src/lib/agreements/clauses.js';
import { STANDARD } from '../../src/lib/agreements/standardWording.js';
import { blankTerms, KINDS } from '../../src/lib/agreements/terms.js';

const sam = { ...blankTerms('sessions'), coaching: '6-month coaching, with a momentum phase', totalMinor: 1800000, discounts: [{ type: 'returning', percent: 15 }],
  settle: 'equal', place: 'either', startsOn: '2027-01-04', endsOn: '2027-07-02', coachName: 'Dr. Tim Dutton', clientFirst: 'Sam', fullTerm: true,
  goals: 'lead the operations team through the merger, and protect two evenings a week' };

test('self-funded set sessions: 11 clauses, 9 is Changing your mind in the first 14 days', () => {
  const list = cl.buildClauses(sam);
  assert.equal(list.length, 11);
  assert.deepEqual(list.map((c) => c.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(cl.clauseTitle(list[8]), '9. Changing your mind in the first 14 days');
  assert.deepEqual(list[8].paragraphs.map((p) => p.text), [
    'You can cancel this agreement within 14 days of signing, for any reason, and get a full refund.',
    'If you ask for your coaching to start within those 14 days and then cancel, you’re only charged for the coaching sessions you’ve had.',
    'To cancel, tell your coach in writing, by email or in the portal.']);
});

test('funded: no 14 days, Your investment holds the funded sentence, 10 clauses numbered 1 to 10', () => {
  const list = cl.buildClauses({ ...sam, funder: 'org', fundedBy: 'Northfield Logistics' });
  assert.equal(list.length, 10);
  assert.ok(!list.some((c) => c.key === 'cooling'));
  const inv = list.find((c) => c.key === 'investment');
  assert.equal(inv.paragraphs[0].text, 'Your coaching is funded by Northfield Logistics under a separate agreement, so there is nothing for you to settle.');
  assert.equal(inv.money, false, 'a funded client keeps it (M28 keeps it with the funded sentence)');
  assert.equal(list.at(-1).number, 10);
});

test('a one-off: 8 clauses, The work first, no Purpose, Responsibilities or Ending', () => {
  const o = { ...blankTerms('oneoff'), work: 'A Health Check and a 90-minute debrief', oneoff: { on: '2027-01-11', place: 'zoom', totalMinor: 150000, settle: 'before' }, coachName: 'Dr. Tim Dutton' };
  const list = cl.buildClauses(o);
  assert.deepEqual(list.map((c) => c.title), ['The work', 'Your investment', 'Rearranging and cancelling', 'Confidentiality and records', 'Your data',
    'Changing your mind in the first 14 days', 'Concerns and law', 'Signatures']);
  assert.equal(list[0].paragraphs[0].text, 'A Health Check and a 90-minute debrief, on Mon 11 Jan 2027, on Zoom.');
});

test('the approved paragraphs, with their reasons and the agreement’s own notice hours', () => {
  const re = cl.buildClauses({ ...sam, noticeHours: 12 }).find((c) => c.key === 'rearranging');
  assert.equal(re.paragraphs[0].text, 'You can rearrange or cancel a coaching session at no charge up to 12 hours before it starts, from the portal or by letting your coach know.');
  assert.equal(re.paragraphs[0].why, 'Your coaching session is time held only for you, and 12 hours lets your coach offer it to someone else.');
  assert.equal(re.paragraphs[1].text, 'A coaching session cancelled with less than 12 hours’ notice, or missed without notice, counts as used.');
  assert.equal(re.paragraphs[4].why, null, 'your coach rearranging has no reason line');
  const ending = cl.buildClauses(sam).find((c) => c.key === 'ending');
  assert.equal(ending.paragraphs[0].text, 'This agreement runs for its full 6 months. If something exceptional happens, talk to your coach and you’ll agree together what’s fair.');
  assert.equal(ending.paragraphs[0].why, 'Real change takes steady work over months, so you both commit to the full six.');
  assert.ok(!ending.paragraphs.some((p) => /refund/i.test(p.text)), 'the refund-on-ending-early paragraph goes (item 38)');
  const notFull = cl.buildClauses({ ...sam, fullTerm: false }).find((c) => c.key === 'ending');
  assert.equal(notFull.paragraphs[0].why, 'You’re never locked in, and you never invest in coaching you don’t get.');
  const ret = cl.buildClauses({ ...blankTerms('retainer'), retainer: { sessions: 'Up to 2 a month, 60 minutes each', feeMinor: 300000, invoice: 'monthly' } }).find((c) => c.key === 'ending');
  assert.equal(ret.paragraphs[0].text, 'This agreement runs in 6-month terms, and renews for another 6 months unless either of you says otherwise at least 30 days before a term ends.');
  assert.ok(!ret.paragraphs.some((p) => /not used by the end date/.test(p.text)), 'a retainer has no unused-sessions paragraph');
});

test('an edit for one agreement is linked to its standard; the coach’s own standard replaces the code’s', () => {
  const over = { rearranging: cl.overrideFor('rearranging', sam, [{ text: 'You can rearrange up to {noticeHours} hours before, or 12 hours before 8am.', why: 'Time held for you.' }]) };
  const list = cl.buildClauses(sam, { overrides: over });
  const re = list.find((c) => c.key === 'rearranging');
  assert.equal(re.edited, true);
  assert.equal(re.base, 'code');
  assert.equal(re.paragraphs[0].text, 'You can rearrange up to 24 hours before, or 12 hours before 8am.');
  assert.deepEqual(cl.editedKeys(sam, { overrides: over }), ['rearranging']);
  const std = { data: { version: 3, title: 'Your data', paragraphs: [{ text: 'Your data is yours.' }] } };
  const d = cl.buildClauses(sam, { standards: std }).find((c) => c.key === 'data');
  assert.equal(d.base, 'v3');
  assert.equal(d.edited, false);
});

test('where the client chooses, the investment clause stores both texts; the signed one is the choice made', () => {
  const stored = cl.forStorage(sam);
  const inv = stored.find((c) => c.key === 'investment');
  assert.ok(inv.choices.upfront && inv.choices.plan);
  assert.equal(inv.paragraphs[0].text, 'Your investment is £14,535, in full, up front, with 5% off.');
  const plan = cl.resolveChoice(stored, 'plan').find((c) => c.key === 'investment');
  assert.equal(plan.paragraphs[0].text, 'Your investment is £15,300, in 6 monthly instalments of £2,550.');
  assert.equal(plan.paragraphs[2].text, 'The first £2,550 is settled when you sign, to confirm your place.');
});

test('Main points: Commitment, the funded row, and the rearranging row when clause 4 was edited', () => {
  const pts = cl.mainPoints(sam, { choice: 'plan' });
  assert.deepEqual(pts.find((r) => r.label === 'Commitment'), { label: 'Commitment', value: 'The full 6 months, unless something exceptional happens' });
  assert.equal(pts.find((r) => r.label === 'Coaching sessions').value, '1 of 90 minutes, then 15 of 60 minutes, on Zoom or in person, weekly for 6 weeks, then every 2 weeks');
  assert.equal(pts.find((r) => r.label === 'Dates').value, 'Mon 4 Jan 2027 to Fri 2 Jul 2027');
  assert.equal(pts.find((r) => r.label === 'Your investment').value, '£15,300, in 6 monthly instalments of £2,550');
  assert.equal(pts.find((r) => r.label === 'Also included').value, 'The Executive level of the portal');
  const funded = cl.mainPoints({ ...sam, funder: 'org', fundedBy: 'Northfield Logistics' });
  assert.ok(!funded.some((r) => r.label === 'Your investment'));
  assert.equal(funded.find((r) => r.label === 'Funded by').value, 'Northfield Logistics');
  const over = { rearranging: cl.overrideFor('rearranging', sam, [{ text: 'Up to 12 hours before 8am.' }]) };
  const edited = cl.mainPoints(sam, { clauses: cl.buildClauses(sam, { overrides: over }) });
  assert.equal(edited.find((r) => r.label === 'Rearranging').value, 'Up to 24 hours before, at no charge, as clause 4 sets out');
});

test('no client-facing word says pay or unpaid, in any kind (Apple Pay is a product name; item 15, risk 21)', () => {
  const words = [];
  for (const k of KINDS) {
    for (const funded of [false, true]) {
      const t = { ...blankTerms(k), funder: funded ? 'org' : 'self', fundedBy: funded ? 'Northfield' : null, work: 'The work', hours: { work: 'Work', rateMinor: 15000, blockMinor: 200000, owner: 'client' } };
      for (const c of cl.forStorage(t)) for (const p of [...c.paragraphs, ...(c.choices ? [...c.choices.upfront, ...c.choices.plan] : [])]) words.push(p.text, p.why || '');
      for (const r of cl.mainPoints(t)) words.push(r.value);
    }
  }
  for (const w of words) assert.ok(!/\b(pay|pays|paid|paying|unpaid|payment)\b/i.test(w.replace(/Apple Pay/g, '')), w);
  assert.ok(Object.keys(STANDARD).length >= 11);
});
