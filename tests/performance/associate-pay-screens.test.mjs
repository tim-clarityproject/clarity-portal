// The people side of the money's screens (Phase 6b run 2, steps 3 and 5; M11 C10 to C13): an associate's month from
// a saved statement or from sessions, M11's words for the section and the statement panel, the statement PDF's facts,
// Clients' Renewals and Leads' reports. Invented names and figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../../src/lib/coach/associatePay.js';
import { associateStatementPdf } from '../../src/lib/pdf/docs/associateStatement.js';

const s = (day, minutes, outcome, coach = 'assoc-1') => ({ coach_id: coach, starts_at: `${day}T10:00:00Z`, minutes, outcome });
const november = [
  ...Array.from({ length: 21 }, (_, i) => s(`2026-11-${String(i + 2).padStart(2, '0')}`, 60, 'held')),
  s('2026-11-25', 60, 'late_cancel'),
  s('2026-11-26', 60, 'no_show'),
  s('2026-11-12', 120, 'held', 'someone-else'),
];

test('the rate and the hours figure', () => {
  assert.equal(p.rateMinorOf({ hourly_rate: '100.00' }), 10000);
  assert.equal(p.rateMinorOf({ hourly_rate: 92.5 }), 9250);
  assert.equal(p.rateMinorOf({ hourly_rate: null }), null);
  assert.equal(p.rateMinorOf(null), null);
  assert.deepEqual([p.hoursFigure(22 * 60), p.hoursFigure(22 * 60 + 30), p.hoursFigure(0), p.hoursFigure(-5)], ['22', '22.5', '0', '0']);
});

test('Maya’s November from her sessions: 22 hours, £2,200, and M11’s statement lines', () => {
  const pay = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', sessions: november });
  assert.equal(pay.from, 'sessions');
  assert.deepEqual([pay.delivered.minutes, pay.delivered.payMinor, pay.readyOn, pay.paidOn], [22 * 60, 220000, '2026-11-30', null]);
  assert.deepEqual(pay.lines, [
    { label: 'Coaching hours', detail: '22 hours at £100', value: '£2,200' },
    { label: 'Late cancellations that count', detail: 'Paid as delivered', value: 'Included' },
  ]);
  const w = p.payWords({ name: 'Maya Collins', month: '2026-11', readyOn: pay.readyOn });
  assert.deepEqual(w, {
    statementRow: 'November, ready on Mon 30 Nov',
    panelTitle: 'Maya’s November statement',
    panelNote: 'Maya sees it in their portal on Mon 30 Nov. You pay them outside the portal.',
  });
});

test('a saved statement wins over the sessions; unknown when there is neither', () => {
  const statement = { associate_id: 'assoc-1', month: '2026-10-01', hours: '20.00', rate_minor: 10000, total_minor: 200000, lines: [], ready_on: '2026-10-31', paid_on: '2026-11-03', late_cancel_minutes: 0, no_show_minutes: 0 };
  const pay = p.associatePay({ associateId: 'assoc-1', rateMinor: 12000, month: '2026-10', statements: [statement], sessions: november });
  assert.equal(pay.from, 'statement');
  assert.deepEqual([pay.delivered.minutes, pay.delivered.payMinor, pay.readyOn, pay.paidOn], [1200, 200000, '2026-10-31', '2026-11-03']);
  assert.equal(pay.lines[0].detail, '20 hours at £100');
  // Another associate's statement is never read as theirs.
  assert.equal(p.associatePay({ associateId: 'assoc-2', rateMinor: 10000, month: '2026-10', statements: [statement] }).from, null);
  // The owner's device doesn't hold an associate's sessions: no figure is made up.
  const none = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', sessions: [s('2026-11-03', 60, 'held', 'owner')] });
  assert.deepEqual([none.from, none.delivered, none.lines], [null, null, []]);
  // Saved lines are shown as saved.
  const saved = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-10', statements: [{ ...statement, lines: [{ label: 'Coaching hours', detail: '20 hours at £100', value: '£2,000' }] }] });
  assert.deepEqual(saved.lines, [{ label: 'Coaching hours', detail: '20 hours at £100', value: '£2,000' }]);
});

test('what their clients paid: only their clients, in the month, at the landed pounds', () => {
  const payments = [
    { id: 'a', profile_id: 'c1', paid_at: '2026-11-05T10:00:00Z', amount_minor: 300000, currency: 'GBP' },
    { id: 'b', profile_id: 'c2', paid_at: '2026-11-20T10:00:00Z', amount_minor: 150000, currency: 'USD', landed_gbp_minor: 116000 },
    { id: 'c', profile_id: 'c9', paid_at: '2026-11-20T10:00:00Z', amount_minor: 999900, currency: 'GBP' },
    { id: 'd', profile_id: 'c1', paid_at: '2026-10-20T10:00:00Z', amount_minor: 50000, currency: 'GBP' },
    { id: 'e', profile_id: 'c1', paid_at: null, amount_minor: 50000, currency: 'GBP' },
  ];
  assert.equal(p.theirClientsPaid({ payments, profileIds: ['c1', 'c2'], month: '2026-11' }), 416000);
});

test('the statement PDF holds only the associate’s own figures', () => {
  const pay = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', sessions: november });
  const facts = p.statementFacts({ name: 'Maya Collins', month: '2026-11', pay, rateMinor: 10000 });
  assert.deepEqual([facts.monthWords, facts.hours, facts.pay, facts.rate], ['November 2026', '22 hours', '£2,200', '£100/hr']);
  const doc = associateStatementPdf(facts);
  assert.equal(doc.title, 'Statement for November 2026');
  assert.deepEqual(doc.details, ['Maya Collins', 'November 2026', 'Monthly statement']);
  assert.deepEqual(doc.glance.map((g) => g.value), ['22 hours', '£2,200', '£100/hr']);
  assert.deepEqual(doc.sections[0].blocks[0].rows, [['Coaching hours', '22 hours at £100', '£2,200'], ['Late cancellations that count', 'Paid as delivered', 'Included']]);
  const text = JSON.stringify(doc);
  for (const word of ['target', 'Pipeline', 'clients paid', 'Finances']) assert.equal(text.includes(word), false, word);
});

test('Renewals: the next 90 days with their price, another coach’s client named so, organisations and repeating income', () => {
  const today = '2026-11-17';
  const admin = [
    { profile_id: 'jordan', name: 'Jordan Reyes', coach_id: 'tim', coach_first_name: 'Tim', status: 'active', ends_on: '2027-01-03', organisation_id: null },
    { profile_id: 'owen', name: 'Owen Price', coach_id: 'maya', coach_first_name: 'Maya', status: 'active', ends_on: '2027-01-29', organisation_id: null },
    { profile_id: 'sam', name: 'Sam Okafor', coach_id: 'tim', coach_first_name: 'Tim', status: 'active', ends_on: '2027-02-08', organisation_id: 'kestrel' },
    { profile_id: 'late', name: 'Later Person', coach_id: 'tim', status: 'active', ends_on: '2027-03-01' },
    { profile_id: 'gone', name: 'Past Person', coach_id: 'tim', status: 'past', ends_on: '2026-12-01' },
    { profile_id: 'before', name: 'Ended Person', coach_id: 'tim', status: 'active', ends_on: '2026-11-16' },
  ];
  const engagements = [{ profile_id: 'jordan', ends_on: '2027-01-03', name: 'Full-Season Coaching' }];
  const agreements = [{ id: 'ag1', profile_id: 'jordan', kind: 'coaching' }];
  const versions = [
    { agreement_id: 'ag1', status: 'superseded', total_minor: 500000, currency: 'GBP', client_signed_at: '2026-01-01T10:00:00Z' },
    { agreement_id: 'ag1', status: 'signed', total_minor: 586000, currency: 'GBP', client_signed_at: '2026-06-01T10:00:00Z' },
  ];
  const orgDeals = [
    { id: 'd1', organisation_id: 'kestrel', name: 'Leadership Accelerator for Sam', kind: 'agreement', status: 'active', value: 13460, per: 'once', renews_on: '2027-02-08' },
    { id: 'd2', organisation_id: 'kestrel', name: 'Portal seats, up to 25 people', kind: 'agreement', status: 'active', value: 860, per: 'month' },
    { id: 'd3', organisation_id: 'kestrel', name: 'A draft', kind: 'agreement', status: 'draft', value: 1000, per: 'once', renews_on: '2026-12-01' },
    { id: 'd4', organisation_id: 'kestrel', name: 'A proposal', kind: 'proposal', status: 'active', value: 1000, per: 'once', renews_on: '2026-12-01' },
  ];
  const organisations = [{ id: 'kestrel', name: 'Kestrel Group' }];
  const r = p.renewals({ today, admin, coachId: 'tim', engagements, agreements, versions, orgDeals, organisations });
  assert.deepEqual(r.rows.map((x) => [x.title, x.facts.join(' / '), x.ends, x.value]), [
    ['Jordan Reyes', 'Full-Season Coaching', 'Ends Sun 3 Jan', '£5,860'],
    ['Owen Price', 'Maya’s client', 'Ends Fri 29 Jan', ''],
    ['Kestrel Group', 'Leadership Accelerator for Sam', 'Ends Mon 8 Feb', '£13,460'],
  ]);
  assert.equal(r.totalWords, '£19,320');
  assert.deepEqual(r.repeating.map((x) => [x.title, x.facts.join(' / '), x.value]), [['Portal seats, up to 25 people', 'Kestrel Group', '£860/month']]);
  assert.equal(p.RENEWALS_NOTE, 'Each one offers a renewal proposal for you to edit. Clients aren’t told until you send it.');
  // A dollar agreement counts in the total at its own fixed rate.
  const usd = p.renewals({ today, admin: admin.slice(0, 1), coachId: 'tim', agreements, versions: [{ ...versions[1], currency: 'USD', total_minor: 125000, fx_rate: 1.25 }] });
  assert.deepEqual([usd.rows[0].value, usd.totalMinor], ['$1,250', 100000]);
});

test('Lead reports: pipeline, likely by stage, win rate, time to win, sources and referrers', () => {
  const stages = [
    { id: 'new', name: 'New', likelihood: 10, position: 1 },
    { id: 'call', name: 'Call booked', likelihood: 25, position: 2 },
    { id: 'prop', name: 'Proposal sent', likelihood: 50, position: 3 },
    { id: 'won', name: 'Won', likelihood: 100, position: 1000000, is_won: true },
  ];
  const leads = [
    { id: 1, stage_id: 'new', value: 8400, created_at: '2026-11-01T10:00:00Z' },
    { id: 2, stage_id: 'call', value: 6200, created_at: '2026-11-02T10:00:00Z', referred_by: 'David Stark' },
    { id: 3, stage_id: 'prop', value: 18960, created_at: '2026-10-02T10:00:00Z' },
    { id: 4, stage_id: 'won', value: 12000, source: 'chemistry_page', created_at: '2026-09-01T10:00:00Z', won_at: '2026-09-21T10:00:00Z' },
    { id: 5, stage_id: 'won', value: 10480, source: 'manual', referred_by: 'Ruth Adeyemi', created_at: '2026-06-01T10:00:00Z', won_at: '2026-07-01T10:00:00Z' },
    { id: 6, stage_id: 'new', value: 5000, cold_at: '2026-08-01T10:00:00Z', created_at: '2026-07-01T10:00:00Z' },
    { id: 7, stage_id: 'won', value: 99999, source: 'referral', created_at: '2024-01-01T10:00:00Z', won_at: '2024-02-01T10:00:00Z' },
    { id: 8, stage_id: 'new', value: 77777, merged_into: 1, created_at: '2026-11-01T10:00:00Z' },
  ];
  const r = p.leadReport({ leads, stages, today: '2026-11-17' });
  assert.equal(r.pipeline, '£33,560');
  assert.equal(r.likely, '£11,870'); // 840 + 1,550 + 9,480
  assert.equal(r.winRate, '67%'); // 2 won, 1 gone cold, in the last 12 months
  assert.equal(r.timeToWin, '25 days'); // 20 and 30 days
  assert.deepEqual(r.byStage.map((x) => [x.name, x.valueWords, x.count]), [['New', '£8,400', 1], ['Call booked', '£6,200', 1], ['Proposal sent', '£18,960', 1]]);
  assert.deepEqual(r.sources.map((x) => [x.name, x.words]), [['Chemistry Calls', '1 won'], ['Referrals', '1 won']]);
  assert.deepEqual(r.referrers.map((x) => [x.name, x.line, x.right]), [['Ruth Adeyemi', '1 introduction, won', '£10,480'], ['David Stark', '1 introduction', 'Thank them']]);
  const empty = p.leadReport({ leads: [], stages, today: '2026-11-17' });
  assert.deepEqual([empty.pipeline, empty.winRate, empty.timeToWin, empty.sources, empty.referrers], ['£0', null, null, [], []]);
});
