// Finances' figures agree wherever they show (Phase 6b run 2, the UI tester's second pass). One rule for an associate's
// delivered hours everywhere (a past session with no outcome yet counts as held, as 062's associate_month_minutes and the
// forecast do); Today's Finances line and Overview's Needs you read the same cash flow; the Overview's renewals and the
// Renewals tab are one count; a draft's due day reads the same on its row and in its panel. Invented names and figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import * as f from '../../src/lib/finance/index.js';

const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);
if (!globalThis.window) globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };
if (!globalThis.__db) globalThis.__db = { async rpc() { return { data: null, error: null }; }, from() { throw new Error('no reads here'); } };
const d = await import('../../src/lib/coach/financeData.js');
const p = await import('../../src/lib/coach/associatePay.js');

const TODAY = '2026-11-24';
const NOW = Date.parse('2026-11-24T12:00:00Z');
const s = (at, minutes, outcome, extra = {}) => ({ coach_id: 'assoc-1', starts_at: at, minutes, outcome, ...extra });

test('one rule for delivered hours: held, or no outcome and already ended; late cancels unless waived; moved never', () => {
  const rows = [
    s('2026-11-02T10:00:00Z', 60, 'held'),
    s('2026-11-03T10:00:00Z', 60, null), // past, no outcome yet: counts as held
    s('2026-11-24T11:30:00Z', 60, null), // started, not ended by noon: not yet
    s('2026-11-26T10:00:00Z', 60, null), // still to come
    s('2026-11-04T10:00:00Z', 60, 'late_cancel'),
    s('2026-11-05T10:00:00Z', 60, 'late_cancel', { waived: true }),
    s('2026-11-06T10:00:00Z', 60, 'no_show'),
    s('2026-11-09T10:00:00Z', 60, 'moved'),
    s('2026-11-10T10:00:00Z', 60, 'cancelled'),
  ];
  const m = f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: rows, month: '2026-11', nowMs: NOW });
  assert.deepEqual([m.minutes, m.payMinor, m.lateCancels, m.noShows], [180, 30000, 1, 0]);
  assert.equal(f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: rows, month: '2026-11', nowMs: NOW, noShowsPaid: true }).minutes, 240);
  // Without a clock a session with no outcome never counts (the old rule, kept for callers that pass none).
  assert.equal(f.associateMonth({ coachId: 'assoc-1', rateMinor: 10000, sessions: rows, month: '2026-11' }).minutes, 120);
  assert.equal(f.sessionCounts(s('2026-11-24T11:00:00Z', 60, null), { nowMs: NOW }), true, 'ended exactly now counts');
  assert.equal(f.sessionCounts(s('2026-11-09T10:00:00Z', 60, 'moved'), { nowMs: NOW, noShowsPaid: true }), false);
});

test('the associate’s own Today, their statement and Settings, Coaches give the same month from the same sessions', () => {
  const rows = [s('2026-11-02T10:00:00Z', 60, 'held'), s('2026-11-03T10:00:00Z', 90, null), s('2026-11-30T10:00:00Z', 60, null)];
  const own = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', sessions: rows, nowMs: NOW });
  // The owner's view (058): no outcome on any row, so each one that has ended counts as held.
  const owner = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', sessions: rows.map((r) => ({ ...r, outcome: null })), nowMs: NOW });
  // 062's associate_month_minutes counts the same minutes in the database.
  const minutes = p.associatePay({ associateId: 'assoc-1', rateMinor: 10000, month: '2026-11', monthMinutes: { coach_id: 'assoc-1', held_minutes: 150, late_cancel_minutes: 0, no_show_minutes: 0 } });
  assert.deepEqual([own.delivered.minutes, owner.delivered.minutes, minutes.delivered.minutes], [150, 150, 150]);
  assert.equal(p.statementFacts({ name: 'Maya Collins', month: '2026-11', pay: own, rateMinor: 10000 }).hours, '2.5 hours');
});

test('Today’s Finances line and Overview’s Needs you read one cash flow, associates’ pay included', () => {
  const rows = {
    financeSettings: { bank_balance_minor: 400000, bank_checked_at: '2026-11-20T10:00:00Z', keep_above_minor: 300000, cash_months: 6 },
    coaches: [{ id: 'assoc-1', role: 'coach', hourly_rate: 100, display_name: 'Maya Collins' }],
    // Maya's booked sessions ahead: her pay goes out the month after each.
    associateSessions: Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, coach_id: 'assoc-1', starts_at: `2026-12-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`, minutes: 60 })),
  };
  const model = d.financeModel(rows, { today: TODAY, months: 6, nowMs: NOW });
  const needs = d.needsYouRows({ cash: model.cash6, invoices: [], deadlines: [], today: TODAY });
  assert.ok(model.line.urgent, 'cash dips once Maya’s pay is counted');
  const month = model.line.urgent.replace('Cash dips in ', '');
  assert.equal(needs[0].key, 'cash');
  assert.match(needs[0].title, new RegExp(`in ${month}\\.$`));
  // Without her sessions the forecast doesn't see her pay: the reason Today must read them the way Finances does.
  const without = d.financeModel({ ...rows, associateSessions: [] }, { today: TODAY, months: 6, nowMs: NOW });
  assert.notEqual(without.cash6.end, model.cash6.end);
});

test('the Overview’s renewals and the Renewals tab are one count, with its amount and a thousands comma', () => {
  const admin = Array.from({ length: 1200 }, (_, i) => ({ profile_id: `c${i}`, name: `Client ${i}`, coach_id: 'maya', coach_first_name: 'Maya', status: 'active', ends_on: '2027-01-10' }));
  const data = p.renewals({ today: TODAY, admin, coachId: 'tim' });
  assert.deepEqual(p.renewalsLine(data), { count: 1200, facts: ['1,200 engagements'], figure: '£0' });
  assert.deepEqual(p.renewalsLine(p.renewals({ today: TODAY, admin: admin.slice(0, 1), coachId: 'tim' })).facts, ['1 engagement']);
});

test('a draft’s due day: the agreement’s day, or its terms until it’s sent, the same on its row and in its panel', () => {
  const fromAgreement = { id: 'i1', status: 'draft', due_on: '2026-12-01', agreement_id: 'a1', total_minor: 195000, lines: [{ description: 'Leadership Sprint, payment 2 of 3' }] };
  const oneOff = { id: 'i2', status: 'draft', terms_days: 30, total_minor: 49000, lines: [{ description: 'A keynote' }] };
  assert.deepEqual(d.draftDue(fromAgreement, TODAY), { row: 'Due Tue 1 Dec', value: 'Tue 1 Dec', fact: 'From the signed agreement' });
  assert.deepEqual(d.draftDue(oneOff, TODAY), { row: 'Due 30 days after it’s sent', value: '30 days after it’s sent', fact: null });
  const g = d.invoiceGroups({ today: TODAY, invoices: [fromAgreement, oneOff] });
  assert.deepEqual(g.waiting.map((r) => r.when), ['Due Tue 1 Dec', 'Due 30 days after it’s sent']);
});

test('Recurring outgoings in M11’s order: Your pay, Associates, Insurance, Training, Marketing, Software, then the rest', () => {
  const o = (name, group) => ({ name, group_name: group, amount_minor: 1000, every: 'month', starts_on: '2026-01-01' });
  const list = f.outgoingRows({ today: TODAY, associates: [{ name: 'Maya Collins', monthlyMinor: 40000 }],
    outgoings: [o('Zoom', 'Software'), o('Ads', 'Marketing'), o('Trains', 'Travel'), o('Salary', 'Your pay'), o('Supervision', 'Training and supervision'), o('Accountant', 'Insurance and professional fees'), o('Gifts', 'Other')] });
  assert.deepEqual(list.rows.map((r) => r.group), ['Your pay', 'Associates', 'Insurance and professional fees', 'Training and supervision', 'Marketing', 'Software', 'Travel', 'Other']);
});
