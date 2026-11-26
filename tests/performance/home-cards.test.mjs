// Polish 1, client Home, My Account and a brand-new client: Home's What needs you and Upcoming
// (src/lib/performance/homeCards.js), the page lines (src/content/pageLines/client.js), the
// "being prepared" rule (src/lib/preparingRule.js) and My Account's Your coaching card
// (src/lib/coaching/coachingCard.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { comingSessions, homeNeeds, homeUpcoming, sessionWhen } from '../../src/lib/performance/homeCards.js';
import { homeLine, preparingLine, preparingTitle } from '../../src/content/pageLines/client.js';
import { isPreparing } from '../../src/lib/preparingRule.js';
import { coachingCard, sessionsWords } from '../../src/lib/coaching/coachingCard.js';

const ZONE = 'Europe/London';
const NOW = new Date('2026-11-25T08:00:00Z'); // Wed 25 Nov, 08:00 in London
const TODAY = '2026-11-25';
const session = (iso, n = 1) => ({ session_id: `s${n}`, starts_at: iso, minutes: 60, coach_first_name: 'Alex' });

test('a session reads today, tomorrow or its day, on the reader’s clock', () => {
  assert.deepEqual(sessionWhen('2026-11-25T15:00:00Z', ZONE, NOW), { when: 'today', day: 'Wed 25 Nov', time: '15:00' });
  assert.equal(sessionWhen('2026-11-26T09:00:00Z', ZONE, NOW).when, 'tomorrow');
  assert.deepEqual(sessionWhen('2026-11-30T09:00:00Z', ZONE, NOW), { when: 'later', day: 'Mon 30 Nov', time: '09:00' });
});

test('sessions still to come, soonest first; long gone ones drop out', () => {
  const list = comingSessions([session('2026-12-14T09:00:00Z', 2), session('2026-11-30T09:00:00Z', 1), session('2026-11-20T09:00:00Z', 3)], NOW);
  assert.deepEqual(list.map((s) => s.session_id), ['s1', 's2']);
  assert.deepEqual(comingSessions(null, NOW), []);
});

test('What needs you: an agreement, an invoice, a review, a session’s prep and news, in that order', () => {
  const rows = homeNeeds({
    agreement: { id: 'v1', sentDay: '2026-11-23' },
    invoice: { number: 'CLARITY-1202', dueOn: '2026-12-03' },
    checkin: { first: false, time: '~10 minutes', action: { to: '/monthly-review' } },
    sessions: [session('2026-11-26T09:00:00Z')],
    prepWritten: false,
    news: { lines: ['Alex sent a recap of your session.'], action: { to: '/coaching' } },
    today: TODAY,
    zone: ZONE,
    now: NOW,
  });
  assert.deepEqual(rows.map((r) => r.key), ['agreement', 'invoice', 'checkin', 'prep', 'news']);
  assert.equal(rows[0].name, 'Sign your coaching agreement');
  assert.equal(rows[0].value, 'Sent Mon 23 Nov');
  assert.equal(rows[0].to, '/coaching/agreement/v1');
  assert.equal(rows[1].name, 'Settle invoice CLARITY-1202');
  assert.equal(rows[1].value, 'Due Thu 3 Dec');
  assert.equal(rows[2].name, 'Your monthly review');
  assert.equal(rows[3].name, 'Prepare for tomorrow’s session');
  // Clients settle, never pay (agreements rule 2).
  assert.ok(rows.every((r) => !/\bpay/i.test(`${r.name} ${r.value || ''}`)));
});

test('What needs you: nothing waiting is an empty list; prep only for today or tomorrow, and not once written', () => {
  assert.deepEqual(homeNeeds({ today: TODAY, zone: ZONE, now: NOW }), []);
  assert.deepEqual(homeNeeds({ sessions: [session('2026-11-30T09:00:00Z')], today: TODAY, zone: ZONE, now: NOW }), []);
  assert.deepEqual(homeNeeds({ sessions: [session('2026-11-25T15:00:00Z')], prepWritten: true, today: TODAY, zone: ZONE, now: NOW }), []);
  assert.equal(homeNeeds({ invoice: { number: 'CLARITY-1201', dueOn: '2026-11-20' }, today: TODAY, zone: ZONE, now: NOW })[0].value, 'Was due Fri 20 Nov');
});

test('Upcoming: the next three sessions and the sprint’s end within four weeks, by date', () => {
  const rows = homeUpcoming({
    sessions: [session('2026-11-30T09:00:00Z', 1), session('2026-12-14T09:00:00Z', 2), session('2026-12-28T09:00:00Z', 3), session('2027-01-11T09:00:00Z', 4)],
    sprint: { name: 'Performance Sprint 1', endsOn: '2026-12-20' },
    today: TODAY,
    zone: ZONE,
    now: NOW,
  });
  assert.deepEqual(rows.map((r) => r.name), ['Coaching session with Alex', 'Coaching session with Alex', 'Performance Sprint 1 ends', 'Coaching session with Alex']);
  assert.equal(rows[0].value, 'Mon 30 Nov, 09:00');
  assert.equal(homeUpcoming({ sprint: { name: 'S', endsOn: '2027-02-01' }, today: TODAY, zone: ZONE, now: NOW }).length, 0);
});

test('Home’s line: what needs the person and the next session, a full sentence', () => {
  assert.equal(homeLine({ needs: 2, session: { when: 'tomorrow', day: 'Thu 26 Nov', time: '09:00' }, coached: true }), 'Two things need you today, and your coaching session is tomorrow at 09:00.');
  assert.equal(homeLine({ needs: 1, session: { when: 'later', day: 'Mon 30 Nov', time: '09:00' }, coached: true }), 'One thing needs you today, and your coaching session is on Mon 30 Nov at 09:00.');
  assert.equal(homeLine({ needs: 0, coached: true }), 'Nothing needs you today, and no coaching session is booked yet.');
  assert.equal(homeLine({ needs: 0 }), 'Here is your day: what to log, and what’s on today.');
  for (const l of [homeLine({ needs: 3 }), homeLine({ needs: 0 })]) assert.match(l, /\.$/);
});

test('a brand-new client: a coach and nothing set up yet; anything unknown is never “being prepared”', () => {
  assert.equal(isPreparing({ hasCoach: true, hasPlan: false, hasAgreement: false, hasSessions: false }), true);
  // Sam: an agreement and sessions.
  assert.equal(isPreparing({ hasCoach: true, hasPlan: false, hasAgreement: true, hasSessions: true }), false);
  assert.equal(isPreparing({ hasCoach: true, hasPlan: true, hasAgreement: false, hasSessions: false }), false);
  assert.equal(isPreparing({ hasCoach: false, hasPlan: false, hasAgreement: false, hasSessions: false }), false);
  assert.equal(isPreparing({ hasCoach: true, hasPlan: false, hasAgreement: null, hasSessions: false }), false);
  assert.equal(isPreparing({}), false);
  assert.equal(preparingTitle('Robin'), 'Welcome, Robin');
  assert.equal(preparingLine('Alex'), 'Your portal is still being prepared. Alex will let you know as soon as it’s ready.');
  assert.equal(preparingLine(null), 'Your portal is still being prepared. Your coach will let you know as soon as it’s ready.');
});

test('Your coaching: the agreement’s name, its price, then rows only', () => {
  const v = {
    id: 'v1',
    currency: 'GBP',
    totalMinor: 1748000,
    fundedBy: null,
    terms: { coaching: 'Leadership Partnership, 12 months', startsOn: '2026-10-19', endsOn: '2027-10-19', months: 12, blocks: [{ n: 1, minutes: 90 }, { n: 17, minutes: 60 }], rhythm: 'Every 2 weeks', level: 'Executive', healthCheck: true, visitDays: 2 },
  };
  const c = coachingCard(v, 2025);
  // A date this year has no year (writing rule 28): in 2026 the start reads without one, the end in 2027 with it.
  assert.equal(coachingCard(v, 2026).rows[0].name, 'Mon 19 Oct to Tue 19 Oct 2027');
  assert.equal(coachingCard({ ...v, terms: { ...v.terms, endsOn: '2026-12-18' } }, 2026).rows[0].name, 'Mon 19 Oct to Fri 18 Dec');
  assert.equal(c.title, 'Leadership Partnership, 12 months');
  assert.deepEqual(c.figure, { value: '£17,480', unit: 'in total' });
  assert.deepEqual(c.rows.map((r) => r.name), ['Mon 19 Oct 2026 to Tue 19 Oct 2027', '18 coaching sessions, the first 90 minutes, then 60', 'The Clarity Portal, Executive level', 'Strategic Alignment Health Check', '2 visit days']);
  assert.equal(c.rows[0].value, '12 months');
  assert.equal(c.to, '/coaching/agreement/v1');
  assert.deepEqual(coachingCard({ ...v, totalMinor: null, terms: { ...v.terms, monthlyMinor: 75000 } }).figure, { value: '£750', unit: '/month' });
  // Funded by an organisation: no amount, ever.
  assert.equal(coachingCard({ ...v, fundedBy: 'Halden Freight' }).figure, null);
  assert.equal(coachingCard(null), null);
  assert.equal(sessionsWords([{ n: 12, minutes: 60 }]), '12 coaching sessions, 60 minutes');
});
