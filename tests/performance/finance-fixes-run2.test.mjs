// The functionality tester's findings on Finances (Phase 6b run 2), each put right and checked here: each associate's
// own pay, the pounds that landed and Stripe's fee, currencies kept, a payment by hand in pounds, the minimum after
// associate pay, past months' pay from 062's minutes, Mark as paid, the tax pot worked out, two tabs editing targets,
// and the smaller ones. Invented names and figures only; Stripe is the stand-in, the database the fake one.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';
import {
  associatePayByMonth, associatesForForecast, cashSettingsChange, financeModel, invoiceGroups, needsYouRows, paidDay, payoutsFrom,
} from '../../src/lib/coach/financeData.js';
import { paidStatementRow } from '../../src/lib/coach/associatePay.js';
import { billing, askedFor } from '../../api/_routes/coach-billing.js';
import { fillLanded, handleEvent } from '../../api/stripe-webhook.js';
import { nightlyRound } from '../../api/_routes/billing-nightly.js';
import { STAND_IN_RATES, stripeApi, stripeStandIn } from '../../src/lib/billing/stripe.js';
import { landedFrom, refundRow } from '../../src/lib/billing/stripeWebhook.js';
import { fakeDb } from './_fakeDb.mjs';

const TODAY = '2026-11-24';
const NOW_MS = Date.parse('2026-11-24T12:00:00Z');
const OWNER = { id: 'c-tim', role: 'owner', active: true };
const UUID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------- 1. each associate's pay is their own

test('1. coach_list rows (coach_id): two associates, each with their own rate, name and pay in the forecast', () => {
  const coaches = [
    { coach_id: 'c-tim', first_name: 'Tim', full_name: 'Tim Example', role: 'owner', active: true, hourly_rate: null },
    { coach_id: 'c-maya', first_name: 'Maya', full_name: 'Maya Example', role: 'coach', active: true, hourly_rate: 100 },
    { coach_id: 'c-sam', first_name: 'Sam', full_name: 'Sam Other', role: 'coach', active: true, hourly_rate: null },
  ];
  const statements = [{ associate_id: 'c-sam', month: '2026-10-01', rate_minor: 8000 }, { associate_id: 'c-maya', month: '2026-10-01', rate_minor: 1 }];
  assert.deepEqual(associatesForForecast({ coaches, statements }), [
    { coach_id: 'c-maya', name: 'Maya Example', hourly_rate_minor: 10000 },
    { coach_id: 'c-sam', name: 'Sam Other', hourly_rate_minor: 8000 },
  ]);
  const at = (day) => `${day}T10:00:00Z`;
  const model = financeModel({
    financeSettings: { cash_months: 3, bank_balance_minor: 0, keep_above_minor: 0, tax_share_percent: 0 }, coaches, statements,
    associateSessions: [
      { coach_id: 'c-maya', starts_at: at('2026-12-02'), minutes: 60 }, { coach_id: 'c-maya', starts_at: at('2026-12-09'), minutes: 60 },
      { coach_id: 'c-sam', starts_at: at('2026-12-03'), minutes: 60 }, { coach_id: 'c-sam', starts_at: at('2026-12-04'), minutes: 60 }, { coach_id: 'c-sam', starts_at: at('2026-12-05'), minutes: 60 },
    ],
  }, { today: TODAY, months: 3, nowMs: NOW_MS });
  const jan = model.cash.rows.find((r) => r.label === 'January').items.filter((i) => i.kind === 'associate').map((i) => [i.coach_id, i.name, i.amount]);
  assert.deepEqual(jan, [['c-maya', 'Maya Example', 20000], ['c-sam', 'Sam Other', 24000]]);
});

// ---------------------------------------------------------------- 2 and 3. pounds that landed, Stripe's fee, currencies

function world(now) {
  const db = fakeDb({ client_profiles: [{ id: UUID, name: 'Ann Client', email: 'ann@example.invalid', time_zone: 'America/New_York' }], coaches: [] });
  const stripe = stripeStandIn({ now: () => now.value.getTime() });
  return { db, stripe, owner: billing({ server: db, stripe, coach: OWNER, now: () => now.value }) };
}
async function paidInvoice(currency, amount) {
  const now = { value: new Date('2026-11-20T12:00:00Z') };
  const w = world(now);
  const made = await w.owner.oneOff({ kind: 'one_off', amount, profileId: UUID, whatFor: 'Team Workshop', currency, due: 'in_14', send: true });
  const row = w.db.tables.invoices.find((i) => i.id === made.id);
  return { ...w, now, row, paid: () => w.stripe.settle(row.stripe_invoice_id) };
}

test('2. a dollar payment keeps the pounds that landed and Stripe’s fee, from Stripe’s balance transaction', async () => {
  const { db, stripe, paid } = await paidInvoice('USD', 216000);
  assert.equal(await handleEvent(db, paid(), stripe), 'handled');
  const [p] = db.tables.payments;
  const landed = Math.round(216000 / STAND_IN_RATES.USD);
  assert.deepEqual([p.currency, p.amount_minor, p.landed_gbp_minor, p.fee_minor], ['USD', 216000, landed, Math.round(landed * 0.015) + 20]);
  const [line] = f.incomeLines({ payments: db.tables.payments });
  assert.deepEqual([line.pounds, line.pending], [landed, false]);
});

test('3. a euro invoice’s payment and refund stay in euros, never kept as pounds', async () => {
  const { db, stripe, paid, row } = await paidInvoice('EUR', 116000);
  await handleEvent(db, paid(), stripe);
  const [p] = db.tables.payments;
  assert.deepEqual([p.currency, p.landed_gbp_minor], ['EUR', 100000]);
  const inv = { ...db.tables.invoices.find((i) => i.id === row.id) };
  const credit = refundRow({ type: 'charge.refunded', data: { object: { id: 'ch_1', currency: 'eur', amount_refunded: 50000, invoice: inv.stripe_invoice_id } } }, inv, []);
  assert.equal(credit.currency, 'EUR');
  // A message in another currency than the invoice's is still never kept.
  assert.equal(refundRow({ type: 'charge.refunded', data: { object: { id: 'ch_2', currency: 'gbp', amount_refunded: 500 } } }, inv, []), null);
});

test('2. Stripe can’t be asked: the payment is still kept, without them (pounds as their own amount), and the nightly round fills them in', async () => {
  for (const [currency, amount] of [['USD', 125000], ['GBP', 90000]]) {
    const { db, stripe, paid, now } = await paidInvoice(currency, amount);
    stripe.state.balanceDown = true;
    await handleEvent(db, paid(), stripe);
    const [p] = db.tables.payments;
    assert.deepEqual([p.landed_gbp_minor, p.fee_minor], currency === 'GBP' ? [90000, null] : [null, null]);
    assert.equal(f.waitingForPounds(f.incomeLines({ payments: db.tables.payments })).count, currency === 'GBP' ? 0 : 1);
    assert.equal(await fillLanded({ server: db, stripe, now: () => now.value }), 0, 'still unreachable: nothing changes');
    stripe.state.balanceDown = false;
    now.value = new Date('2026-11-21T03:15:00Z');
    const r = await nightlyRound({ server: db, stripe, now: () => now.value });
    assert.equal(r.landed, 1);
    const landed = currency === 'GBP' ? 90000 : 100000;
    assert.deepEqual([db.tables.payments[0].landed_gbp_minor, db.tables.payments[0].fee_minor], [landed, Math.round(landed * 0.015) + 20]);
    assert.equal(await fillLanded({ server: db, stripe, now: () => now.value }), 0, 'filled once');
  }
});

test('2. the real API asks for the payment intent’s latest charge’s balance transaction; landedFrom reads only pounds', async () => {
  const asked = [];
  const fetcher = async (url, init) => { asked.push([init.method, url]); return { ok: true, json: async () => ({ latest_charge: { balance_transaction: { amount: 172800, fee: 2612, currency: 'gbp' } } }) }; };
  const api = stripeApi('sk_test_0123456789abcdef', fetcher);
  assert.deepEqual(await api.balanceFor('pi_123'), { amount: 172800, fee: 2612, currency: 'gbp' });
  assert.deepEqual(asked, [['GET', 'https://api.stripe.com/v1/payment_intents/pi_123?expand%5B%5D=latest_charge.balance_transaction']]);
  assert.equal(await api.balanceFor('in_1:paid'), null, 'no payment intent or charge: nothing to ask');
  assert.deepEqual(landedFrom({ amount: 172800, fee: 2612, currency: 'gbp' }, { currency: 'USD', amount_minor: 216000 }), { landed_gbp_minor: 172800, fee_minor: 2612 });
  assert.deepEqual(landedFrom({ amount: 216000, fee: 100, currency: 'usd' }, { currency: 'USD', amount_minor: 216000 }), { landed_gbp_minor: null, fee_minor: null });
  assert.deepEqual(landedFrom(null, { currency: 'GBP', amount_minor: 5000 }), { landed_gbp_minor: 5000, fee_minor: null });
});

test('2. Money: the dollar amount under its pounds, and the line for a payment still waiting', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'a', amount_minor: 216000, currency: 'USD', landed_gbp_minor: 172800, paid_at: '2026-11-04T10:00:00', profile_id: 'p-ann' },
    { id: 'b', amount_minor: 50000, currency: 'USD', landed_gbp_minor: null, paid_at: '2026-11-05T10:00:00', profile_id: 'p-ann' },
  ] });
  const [row] = f.clientRows(lines, ['2026-11']);
  assert.deepEqual([row.pounds, row.originals], [172800, { USD: 216000 }]);
  assert.deepEqual(f.waitingForPounds(lines), { count: 1, words: '1 payment in dollars is waiting for the amount that landed.' });
  const two = f.incomeLines({ payments: [{ id: 'c', amount_minor: 1, currency: 'EUR', paid_at: '2026-11-05T10:00:00' }, { id: 'd', amount_minor: 1, currency: 'USD', paid_at: '2026-11-05T10:00:00' }] });
  assert.equal(f.waitingForPounds(two).words, '2 payments in other currencies are waiting for the amounts that landed.');
});

// ---------------------------------------------------------------- 4. settled by hand: what landed in pounds

test('4. a dollar invoice settled by hand needs what landed in pounds; a pound one lands as itself', async () => {
  assert.equal(askedFor({ kind: 'paid_by_hand', invoiceId: UUID, landedMinor: 170000 }).landedMinor, 170000);
  assert.equal(askedFor({ kind: 'paid_by_hand', invoiceId: UUID, landedMinor: -1 }), null);
  assert.equal(askedFor({ kind: 'paid_by_hand', invoiceId: UUID, landedMinor: 12.5 }), null);
  assert.equal(askedFor({ kind: 'paid_by_hand', invoiceId: UUID }).landedMinor, undefined);
  const usd = await paidInvoice('USD', 216000);
  await assert.rejects(usd.owner.paidByHand(usd.row.id), /what landed in pounds/);
  assert.equal((usd.db.tables.payments || []).length, 0);
  await usd.owner.paidByHand(usd.row.id, 170000);
  assert.deepEqual([usd.db.tables.payments[0].currency, usd.db.tables.payments[0].landed_gbp_minor], ['USD', 170000]);
  const gbp = await paidInvoice('GBP', 90000);
  await gbp.owner.paidByHand(gbp.row.id);
  assert.equal(gbp.db.tables.payments[0].landed_gbp_minor, 90000);
});

// ---------------------------------------------------------------- 5. the minimum after associate pay

test('5. the minimum is measured after associate pay, on Your targets and the chart', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'oct', amount_minor: 250000, currency: 'GBP', paid_at: '2026-10-10T10:00:00' },
    { id: 'nov', amount_minor: 300000, currency: 'GBP', paid_at: '2026-11-10T10:00:00' },
  ] });
  const without = f.targetRows({ today: TODAY, lines, targets: [], minimumMinor: 200000 });
  const after = f.targetRows({ today: TODAY, lines, targets: [], minimumMinor: 200000, associatePayMinor: 150000 });
  assert.deepEqual([without.month.minimum, after.month.minimum], ['Minimum £2,000, reached', 'Minimum £2,000, not reached yet']);
  const bar = (pay) => f.incomeChart({ today: TODAY, lines, minimumMinor: 200000, associatePay: pay }).bars.find((b) => b.month === '2026-10');
  assert.deepEqual([bar({}).belowMinimum, bar({ '2026-10': 100000 }).belowMinimum], [false, true]);
  // Each month's associate pay: a saved statement, else 062's minutes, else the sessions.
  const byMonth = associatePayByMonth({
    associates: [{ coach_id: 'maya', hourly_rate_minor: 10000 }], months: ['2026-09', '2026-10', '2026-11'],
    statements: [{ associate_id: 'maya', month: '2026-09-01', total_minor: 123400 }],
    monthMinutes: { '2026-10': [{ coach_id: 'maya', held_minutes: 600, late_cancel_minutes: 60, no_show_minutes: 60 }] },
    sessions: [{ coach_id: 'maya', starts_at: '2026-11-03T10:00:00Z', minutes: 90, outcome: 'held' }],
  });
  assert.deepEqual(byMonth, { '2026-09': 123400, '2026-10': 110000, '2026-11': 15000 });
});

// ---------------------------------------------------------------- 6. past months from 062's minutes

test('6. a month gone by is what 062 says was delivered; this month so far too, plus what is still booked; 058 when it is not there', () => {
  const s = (day, minutes, outcome) => ({ coach_id: 'maya', starts_at: `${day}T10:00:00Z`, minutes, outcome });
  // 058's owner view marks every past session held: October looks like 15 hours, November so far 5.
  const sessions = [...Array.from({ length: 15 }, (_, i) => s(`2026-10-${String(i + 1).padStart(2, '0')}`, 60, 'held')),
    ...Array.from({ length: 5 }, (_, i) => s(`2026-11-0${i + 2}`, 60, 'held')), s('2026-11-26', 60, null), s('2026-11-27', 60, null)];
  // 062: October 10 hours held, 1 late cancellation and 1 no-show (not paid); November so far 2 hours.
  const monthMinutes = { '2026-10': [{ coach_id: 'maya', held_minutes: 600, late_cancel_minutes: 60, no_show_minutes: 60 }], '2026-11': [{ coach_id: 'maya', held_minutes: 120 }] };
  const pay = (month, mm) => f.expectedPay({ coachId: 'maya', rateMinor: 10000, sessions, month, fromMonth: '2026-11', monthMinutes: mm });
  assert.deepEqual(pay('2026-10', monthMinutes), { month: '2026-10', payMinor: 110000, from: 'delivered' });
  assert.deepEqual(pay('2026-10', null), { month: '2026-10', payMinor: 150000, from: 'booked' });
  assert.deepEqual(pay('2026-11', monthMinutes), { month: '2026-11', payMinor: 40000, from: 'booked' }, '2 hours delivered + 2 still booked');
  assert.deepEqual(pay('2026-11', null), { month: '2026-11', payMinor: 70000, from: 'booked' });
  assert.equal(f.expectedPay({ coachId: 'maya', rateMinor: 10000, sessions, month: '2026-10', fromMonth: '2026-11', monthMinutes, noShowsPaid: true }).payMinor, 120000);
  const cf = f.cashFlow({ today: TODAY, months: 3, settings: { bank_balance_minor: 0, keep_above_minor: 0, tax_share_percent: 0 },
    associates: [{ coach_id: 'maya', name: 'Maya', hourly_rate_minor: 10000 }], sessions, monthMinutes });
  const items = cf.rows.flatMap((r) => r.items.filter((i) => i.kind === 'associate').map((i) => [r.label, i.forMonth, i.amount]));
  assert.deepEqual(items.slice(0, 2), [['Rest of November', '2026-10', 110000], ['December', '2026-11', 40000]]);
});

// ---------------------------------------------------------------- 7. Mark as paid

test('7. Mark as paid saves the month’s statement, paid today, and the forecast stops taking that month’s pay out', () => {
  const pay = { delivered: { minutes: 22 * 60, payMinor: 220000 }, readyOn: '2026-11-30', lines: [{ label: 'Coaching hours', detail: '22 hours at £100', value: '£2,200', amount: 220000 }] };
  const row = paidStatementRow({ id: 'st-1', ownerId: 'c-tim', associateId: 'c-maya', month: '2026-11', pay, rateMinor: 10000,
    minutesRow: { late_cancel_minutes: 60, no_show_minutes: 60 }, noShowsPaid: false, today: '2026-11-30' });
  assert.deepEqual(row, { id: 'st-1', coach_id: 'c-tim', associate_id: 'c-maya', month: '2026-11-01', hours: 22, rate_minor: 10000, late_cancel_minutes: 60,
    no_show_minutes: 0, total_minor: 220000, lines: [{ label: 'Coaching hours', detail: '22 hours at £100', value: '£2,200' }], ready_on: '2026-11-30', paid_on: '2026-11-30', paid_minor: 220000 });
  const saved = paidStatementRow({ id: 'x', statement: { id: 'st-0', total_minor: 210000, hours: 21 }, today: '2026-12-01' });
  assert.deepEqual([saved.id, saved.hours, saved.paid_on, saved.paid_minor], ['st-0', 21, '2026-12-01', 210000]);
  const sessions = Array.from({ length: 22 }, (_, i) => ({ coach_id: 'c-maya', starts_at: `2026-11-${String(i + 1).padStart(2, '0')}T09:00:00Z`, minutes: 60, outcome: 'held' }));
  const cash = (statements) => f.cashFlow({ today: '2026-11-30', months: 3, settings: { bank_balance_minor: 0, keep_above_minor: 0, tax_share_percent: 0 },
    associates: [{ coach_id: 'c-maya', name: 'Maya', hourly_rate_minor: 10000 }], sessions, associatePayouts: payoutsFrom(statements) });
  const novPay = (cf) => cf.rows.flatMap((r) => r.items).filter((i) => i.kind === 'associate' && i.forMonth === '2026-11').map((i) => i.amount);
  assert.deepEqual(novPay(cash([])), [220000]);
  assert.deepEqual(novPay(cash([row])), []);
});

// ---------------------------------------------------------------- 8. the tax pot, worked out

test('8. the tax pot so far: the share of each month’s profit from 1 May, less tax paid; only tax deadlines pay out of it', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'may', amount_minor: 400000, currency: 'GBP', paid_at: '2026-05-10T09:00:00' },
    { id: 'jul', amount_minor: 200000, currency: 'GBP', paid_at: '2026-07-03T09:00:00' },
    { id: 'nov', amount_minor: 100000, currency: 'GBP', paid_at: '2026-11-03T09:00:00' },
    { id: 'apr', amount_minor: 900000, currency: 'GBP', paid_at: '2026-04-20T09:00:00' }, // last financial year
  ] });
  const outgoings = [{ name: 'Software', group_name: 'Software', amount_minor: 10000, every: 'month', starts_on: '2026-05-15' }];
  const deadlines = [
    { name: 'Confirmation statement', kind: 'confirmation_statement', due_on: '2026-07-14', every: 'once', amount_minor: 5000 }, // a cost
    { name: 'VAT return', kind: 'vat_return', due_on: '2026-08-07', every: 'once', amount_minor: 30000 }, // tax paid
  ];
  const settings = { tax_share_percent: 25 };
  // May £3,900 profit → £975; July £1,850 → £462.50; VAT £300 paid in August; November £900 so far → £225.
  assert.deepEqual(f.taxPotSoFar({ today: TODAY, settings, lines, outgoings, deadlines }), { pot: 97500 + 46250 - 30000 + 22500, monthProfit: 90000 });
  const withCorp = [...deadlines, { name: 'Corporation tax', kind: 'corporation_tax', due_on: '2026-10-01', every: 'once', amount_minor: null }];
  assert.equal(f.taxPotSoFar({ today: TODAY, settings, lines, outgoings, deadlines: withCorp }).pot, 22500, 'no amount: the whole pot went');
  assert.equal(f.isTaxDeadline({ kind: 'other', name: 'Self assessment tax' }), true);
  assert.equal(f.isTaxDeadline({ kind: 'accounts', name: 'Annual accounts' }), false);
  const cf = f.cashFlow({ today: TODAY, months: 3, settings: { ...settings, bank_balance_minor: 0, keep_above_minor: 0 }, lines, outgoings, deadlines: withCorp });
  assert.deepEqual([cf.taxPotNow, cf.rows[0].taxPot], [22500, 22500]);
});

// ---------------------------------------------------------------- 9. two tabs editing targets

test('9. Edit targets writes only the months changed; Same every month never changes a month gone by; a rise is this month on', () => {
  const months = f.yearStarting(2026).months;
  const start = Object.fromEntries(months.map((m) => [m, 500000]));
  const each = { ...start, '2026-12': 600000 };
  assert.deepEqual(f.targetsToSave({ mode: 'each', each, start, yearLabel: 2026, today: TODAY }), [{ month: '2026-12-01', target_minor: 600000 }]);
  // Another tab changed January meanwhile: this tab's start still had £5,000 there, and it isn't written over.
  const same = f.targetsToSave({ mode: 'same', same: 450000, start: { ...start, '2026-11': 450000 }, yearLabel: 2026, today: TODAY });
  assert.deepEqual(same.map((r) => r.month), ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01']);
  const raised = f.targetsToSave({ mode: 'each', each: start, raise: 10, start, yearLabel: 2026, today: TODAY });
  assert.deepEqual([raised.length, raised[0], raised.every((r) => r.target_minor === 550000)], [6, { month: '2026-11-01', target_minor: 550000 }, true]);
});

// ---------------------------------------------------------------- 10. the smaller ones

test('10. a new financial year copies last year’s targets once, and Needs you asks to check them', () => {
  const last = f.yearStarting(2025).months.map((m) => ({ month: `${m}-01`, target_minor: 400000 }));
  const rows = f.newYearCopyRows({ targets: last, today: '2026-05-03' });
  assert.deepEqual([rows.length, rows[0], rows.at(-1)], [12, { month: '2026-05-01', target_minor: 400000 }, { month: '2027-04-01', target_minor: 400000 }]);
  assert.deepEqual(f.newYearCopyRows({ targets: [...last, ...rows.slice(0, 1)], today: '2026-05-03' }), [], 'copied once');
  assert.deepEqual(f.newYearCopyRows({ targets: [], today: '2026-05-03' }), [], 'nothing last year: nothing to copy');
  assert.equal(f.newYearCheckDue({ copiedAt: '2026-05-03T08:00:00Z', checkedAt: null }), true);
  assert.equal(f.newYearCheckDue({ copiedAt: '2026-05-03T08:00:00Z', checkedAt: '2026-05-04T08:00:00Z' }), false);
  const row = needsYouRows({ today: '2026-05-03', targetsToCheck: true }).find((r) => r.key === 'targets');
  assert.deepEqual([row.title, row.link, row.open], ['This year’s targets were copied from last year.', 'Check the targets', 'targets']);
});

test('10. bank payments keep the payer’s name and what for: By client and the year export (a formula is text)', () => {
  const lines = f.incomeLines({ payments: [
    { id: 'b1', amount_minor: 50000, currency: 'GBP', landed_gbp_minor: 50000, added_by_coach: true, paid_at: '2026-11-04T12:00:00Z', payer_name: '=SUM(A1)', what_for: 'Keynote deposit' },
    { id: 'b2', amount_minor: 20000, currency: 'GBP', landed_gbp_minor: 20000, added_by_coach: true, paid_at: '2026-11-05T12:00:00Z', payer_name: 'Jo Bloggs', what_for: 'Workshop' },
  ] });
  const rows = f.clientRows(lines, ['2026-11']);
  assert.deepEqual(rows.map((r) => [r.payer_name, r.whatFor, r.pounds]), [['=SUM(A1)', 'Keynote deposit', 50000], ['Jo Bloggs', 'Workshop', 20000]]);
  const exp = f.yearExport({ yearLabel: 2026, today: TODAY, lines });
  assert.deepEqual(exp.rows.map((r) => [r[2], r[4]]), [['=SUM(A1)', 'Keynote deposit'], ['Jo Bloggs', 'Workshop']]);
  const csv = f.yearExportCsv(exp);
  assert.match(csv, /,'=SUM\(A1\),/);
  assert.doesNotMatch(csv, /,=SUM/);
});

test('10. a bank payment arrives on a real day, never after tomorrow on Tim’s clock', () => {
  const now = new Date('2026-11-25T23:30:00Z'); // 23:30 on 25 Nov in London
  const ask = (arrivedOn) => askedFor({ kind: 'bank_payment', amount: 5000, payerName: 'Jo Bloggs', arrivedOn }, now);
  assert.equal(ask('2026-02-30'), null);
  assert.equal(ask('2026-13-01'), null);
  assert.equal(ask('2026-11-26').arrivedOn, '2026-11-26');
  assert.equal(ask('2026-11-27'), null);
  assert.equal(ask('2024-02-29').arrivedOn, '2024-02-29');
});

test('10. Paid this month and paid days are on Tim’s clock, never paid_at’s UTC date', () => {
  const inv = { id: 'i1', status: 'paid', total_minor: 1000, paid_minor: 1000, currency: 'GBP', paid_at: '2026-09-30T23:30:00Z', lines: [{ description: 'Coaching' }] };
  assert.equal(paidDay(inv), '2026-10-01');
  const g = invoiceGroups({ invoices: [inv], today: '2026-10-05' });
  assert.deepEqual(g.paid.map((r) => r.when), ['Paid Thu 1 Oct']);
  assert.equal(invoiceGroups({ invoices: [inv], today: '2026-09-30' }).paid.length, 0);
});

test('10. Today’s line and Needs you name the same low-cash month: the chosen months’ forecast', () => {
  const rows = {
    financeSettings: { cash_months: 3, bank_balance_minor: 1000000, bank_checked_at: '2026-11-24T07:00:00Z', keep_above_minor: 200000, tax_share_percent: 0 },
    outgoings: [{ name: 'Salary', group_name: 'Your pay', amount_minor: 300000, every: 'month', starts_on: '2026-01-28' }],
  };
  const model = financeModel(rows, { today: TODAY, months: 3, nowMs: NOW_MS });
  assert.equal(model.line.urgent, 'Cash dips in February');
  assert.equal(needsYouRows({ cash: model.cashChosen, today: TODAY })[0].title, 'Cash dips to −£2,000 in February.');
  assert.match(model.cash6.needsYou, /May/, 'the 6-month figure alone would have named another month');
  const likely = financeModel(rows, { today: TODAY, months: 3, nowMs: NOW_MS, includeLikely: true });
  assert.equal(likely.cashChosen.needsYou, model.cashChosen.needsYou);
});

test('10. Cash flow settings: saving one field never fixes the other; an empty Keep cash above is the default', () => {
  assert.deepEqual(cashSettingsChange({ start: { tax: '25', keep: '' }, tax: '30', keep: '' }), { change: { tax_share_percent: 30 }, problem: null });
  assert.deepEqual(cashSettingsChange({ start: { tax: '25', keep: '3600' }, tax: '25', keep: ' ' }), { change: { keep_above_minor: null }, problem: null });
  assert.deepEqual(cashSettingsChange({ start: { tax: '25', keep: '' }, tax: '25', keep: '£4,000' }), { change: { keep_above_minor: 400000 }, problem: null });
  assert.deepEqual(cashSettingsChange({ start: { tax: '25', keep: '' }, tax: '25', keep: '' }), { change: null, problem: null });
  assert.equal(cashSettingsChange({ start: { tax: '25', keep: '' }, tax: '25', keep: 'lots' }).problem, 'Type an amount, such as 3,600, or leave it empty.');
});

test('10. a statement lists late cancellations only for a month that had some', () => {
  const m = (lateCancels) => ({ minutes: 600, payMinor: 100000, lateCancels, noShows: 0, words: '10 hours at £100' });
  assert.deepEqual(f.statementLines({ month: m(0) }).map((l) => l.label), ['Coaching hours']);
  assert.deepEqual(f.statementLines({ month: m(1) }).map((l) => l.label), ['Coaching hours', 'Late cancellations that count']);
});
