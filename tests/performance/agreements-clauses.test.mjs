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

// Stage D item 10 (Tim, 27 Nov 2026, 13:31; team-agreement-clauses.md): a team programme's sponsor signs for the
// organisation, so "you" is the sponsor and the people coached are "each person". Word for word.
const team = { ...blankTerms('team'), orgName: 'Harbour Rowing', noticeHours: 48, coachName: 'Dr. Tim Dutton',
  team: { ...blankTerms('team').team, people: [{ name: 'Rhys Evans' }, { name: 'Jo Lake' }], sponsor: { name: 'Ana Ruiz', role: 'Head of rowing', email: '' } } };
const texts = (c) => c.paragraphs.map((p) => p.text);
const whys = (c) => c.paragraphs.map((p) => p.why);

test('team: Rearranging and cancelling for each person, the reasons reworded the same way', () => {
  const re = cl.buildClauses(team).find((c) => c.key === 'rearranging');
  assert.equal(re.title, 'Rearranging and cancelling');
  assert.deepEqual(texts(re), [
    'Each person can rearrange or cancel a coaching session at no charge up to 48 hours before it starts, from the portal or by letting their coach know.',
    'A coaching session cancelled with less than 48 hours’ notice, or missed without notice, counts as used.',
    'If someone is late, the coaching session still ends at its usual time. If the coach is late, they get the full time.',
    'The coach can waive any of this when something serious happens, such as illness or a family emergency.',
    'If the coach needs to move a coaching session, they offer a new time, and it’s never counted as used.']);
  assert.deepEqual(whys(re), [
    'Each coaching session is time held only for that person, and 48 hours lets the coach offer it to someone else.',
    'The time can rarely be filled at short notice, so it’s treated the same as a coaching session that happened.',
    'It keeps the next person’s time safe, and the coach holds themselves to the same standard.',
    'Life happens. The rule is for planning, not for hard moments.',
    null]);
});

test('team: Confidentiality and records names the organisation; the sponsor hears only the facts', () => {
  const c = cl.buildClauses(team).find((x) => x.key === 'confidentiality');
  assert.deepEqual(texts(c), [
    'What each person shares in coaching stays between them and their coach.',
    'It isn’t shared with anyone else, including Harbour Rowing, without that person’s agreement.',
    'You hear when coaching starts and ends, and how many coaching sessions are used, never what is said.',
    'The only exceptions are where there’s a serious risk of harm to the person or someone else, or where the law requires it. The coach would talk to the person first wherever they can.',
    'The coach keeps private notes and session summaries for this coaching. Recordings are kept until this agreement ends, then deleted.',
    'The coach may discuss their practice in professional supervision, without naming anyone.']);
  assert.ok(whys(c).every((w) => w === null));
});

test('team: Their data, Responsibilities and the last line of Ending and changes', () => {
  const list = cl.buildClauses(team);
  const data = list.find((x) => x.key === 'data');
  assert.equal(data.title, 'Their data');
  assert.deepEqual(texts(data), [
    'The Clarity Portal keeps each person’s data securely, as the privacy notice explains.',
    'Each person chooses what their coach sees in the portal. Nothing in it is shared with Harbour Rowing.',
    'Each person can download or delete their data at any time. Coaching records such as this agreement and invoices are kept for 6 years after it ends, because UK law requires it.']);
  assert.deepEqual(texts(list.find((x) => x.key === 'responsibilities')), [
    'The coach turns up prepared, keeps to this agreement, and is honest with each person, including when coaching isn’t the right support for something.',
    'Each person owns their decisions and the actions they take between coaching sessions.',
    'Harbour Rowing gives each person the time for their coaching sessions, and tells the coach early if something changes, such as someone leaving the programme.',
    'Coaching isn’t therapy, counselling or medical advice. If something would be better helped by another professional, the coach will say so and can suggest someone.']);
  const ending = texts(list.find((x) => x.key === 'ending'));
  assert.equal(ending.at(-1), 'Each person’s portal account stays open after the agreement ends, so their plans and records stay theirs.');
  assert.equal(ending.at(-2), 'Any change to this agreement is made as a new version that you both sign. Every version is kept.', 'only the last line changes');
  assert.equal(list.length, 10, 'a team keeps its 10 clauses, numbered 1 to 10');
  // With no organisation named yet, the sponsor's own words.
  const noOrg = cl.buildClauses({ ...team, orgName: null });
  assert.equal(texts(noOrg.find((x) => x.key === 'responsibilities'))[2].slice(0, 35), 'Your organisation gives each person');
});

test('team: individual agreements keep their wording, and a stored version keeps the text it was sent with', () => {
  const ind = cl.buildClauses(sam);
  assert.equal(ind.find((x) => x.key === 'data').title, 'Your data');
  assert.equal(texts(ind.find((x) => x.key === 'rearranging'))[0], 'You can rearrange or cancel a coaching session at no charge up to 24 hours before it starts, from the portal or by letting your coach know.');
  assert.equal(texts(ind.find((x) => x.key === 'ending')).at(-1), 'Your portal account stays open after the agreement ends, so your plans and records stay yours.');
  // A team version stored before 27 Nov reads as it was stored: the reader shows version.clauses, never the code's.
  const stored = [{ key: 'data', number: 6, title: 'Your data', paragraphs: [{ text: 'The Clarity Portal keeps your data securely, as the privacy notice explains.', why: null }] }];
  assert.deepEqual(cl.resolveChoice(stored, 'upfront'), stored);
  // A coach's own team standard still wins over the code's, as for every kind.
  const own = { rearranging: { version: 2, title: 'Rearranging', paragraphs: [{ text: 'Up to {noticeHours} hours before.' }] } };
  assert.equal(texts(cl.buildClauses(team, { standards: own }).find((x) => x.key === 'rearranging'))[0], 'Up to 48 hours before.');
});
