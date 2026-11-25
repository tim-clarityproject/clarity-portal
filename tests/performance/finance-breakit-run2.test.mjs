// The break-it tester's code-side findings on Finances (Phase 6b run 2), each put right and checked here: a client or
// organisation that isn't the caller's, strict numbers and names in the billing server's asks, a balance transaction
// that can't be read, Mark as paid only from the statement's ready day (and the month's own figures until then), the
// charity check mirrored from 062, and the money boxes' over-the-limit words. (Two tabs on the settings and targets
// are in finance-stale-tab.test.mjs.) Invented names and figures only; Stripe is the stand-in, the database the fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { askedFor, billing, strictMinor } from '../../api/_routes/coach-billing.js';
import { landedFrom } from '../../src/lib/billing/stripeWebhook.js';
import { stripeStandIn } from '../../src/lib/billing/stripe.js';
import { associatePay, canMarkPaid, paidStatementRow } from '../../src/lib/coach/associatePay.js';
import { checkDiscount, nameSaysCharity } from '../../src/lib/finance/pricing.js';
import { amountProblem, cashSettingsChange, TOO_MUCH } from '../../src/lib/coach/financeData.js';
import { fakeDb } from './_fakeDb.mjs';

const OWNER = { id: 'c-tim', role: 'owner', active: true };
const MAYA = { id: 'c-maya', role: 'coach', active: true };
const MINE = '11111111-1111-4111-8111-111111111111';
const THEIRS = '22222222-2222-4222-8222-222222222222';
const NOBODY = '33333333-3333-4333-8333-333333333333';
const ORG_MINE = '44444444-4444-4444-8444-444444444444';
const ORG_LEAD = '55555555-5555-4555-8555-555555555555';
const ORG_OTHER = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-25T12:00:00Z');

function world(coach = OWNER) {
  const db = fakeDb({
    client_profiles: [
      { id: MINE, coach_id: OWNER.id, name: 'Ann Client', email: 'ann@example.invalid', time_zone: 'Europe/London', organisation_id: ORG_MINE },
      { id: THEIRS, coach_id: MAYA.id, name: 'Ben Other', email: 'ben@example.invalid', time_zone: 'Europe/London', organisation_id: ORG_OTHER },
    ],
    organisations: [{ id: ORG_MINE, name: 'Northfield' }, { id: ORG_LEAD, name: 'Eastgate' }, { id: ORG_OTHER, name: 'Westbrook' }],
    coach_leads: [{ id: 'l-1', coach_id: OWNER.id, organisation_id: ORG_LEAD }],
    organisation_contacts: [],
  });
  const stripe = stripeStandIn({ now: () => NOW.getTime() });
  return { db, stripe, b: billing({ server: db, stripe, coach, now: () => NOW }) };
}
const pay = (over) => askedFor({ kind: 'bank_payment', amount: 50000, arrivedOn: '2026-11-24', ...over }, NOW);
const oneOff = (over) => askedFor({ kind: 'one_off', amount: 50000, whatFor: 'Workshop', currency: 'GBP', due: 'in_30', ...over }, NOW);

// ---------------------------------------------------------------- 1. never another coach's client or organisation

test('1. a client who isn’t the caller’s is refused before anything is read back or stored, one answer for missing and not theirs', async () => {
  const { db, b, stripe } = world();
  for (const id of [THEIRS, NOBODY]) {
    await assert.rejects(b.bankPayment(pay({ profileId: id })), (e) => e.status === 403 && e.message === 'That client isn’t yours.');
    await assert.rejects(b.oneOff(oneOff({ profileId: id })), (e) => e.status === 403 && e.message === 'That client isn’t yours.');
  }
  assert.equal((db.tables.payments || []).length, 0, 'nothing stored');
  assert.equal((db.tables.invoices || []).length, 0);
  assert.equal(stripe.state.customers?.length ?? 0, 0, 'nothing asked of Stripe');
  await b.bankPayment(pay({ profileId: MINE }));
  assert.equal(db.tables.payments[0].payer_name, 'Ann Client');
});

test('1. an organisation is allowed only when one of the caller’s own clients, leads, agreements or deals ties it to them', async () => {
  const { db, b } = world();
  await b.bankPayment(pay({ organisationId: ORG_MINE }));
  await b.bankPayment(pay({ organisationId: ORG_LEAD }));
  for (const id of [ORG_OTHER, NOBODY]) await assert.rejects(b.bankPayment(pay({ organisationId: id })), (e) => e.status === 403 && e.message === 'That organisation isn’t yours.');
  assert.deepEqual(db.tables.payments.map((p) => p.payer_name), ['Northfield', 'Eastgate']);
  db.tables.organisation_deals = [{ id: 'd-1', organisation_id: ORG_OTHER, name: 'Programme' }];
  await b.oneOff(oneOff({ organisationId: ORG_OTHER })); // the owner's own deal
  assert.equal(db.tables.invoices.at(-1).payer_name, 'Westbrook');
  const me = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  db.tables.organisations.push({ id: NOBODY, name: 'Southmoor', created_by: me });
  await assert.rejects(b.bankPayment(pay({ organisationId: NOBODY })), /isn’t yours/, 'set up by someone else');
  await billing({ server: db, stripe: null, coach: { ...OWNER, user_id: me }, now: () => NOW }).bankPayment(pay({ organisationId: NOBODY }));
  assert.equal(db.tables.payments.at(-1).payer_name, 'Southmoor', 'one the owner set up himself');
});

// ---------------------------------------------------------------- 2. strict numbers and names

test('2. amounts and what landed are whole JSON numbers only; days from 2000; a name of invisible characters is no name', () => {
  for (const bad of [true, [5000], '5000', '0x10', '1e3', 12.5, 0, -1, 100000001, NaN, null]) {
    assert.equal(strictMinor(bad), null, `refused: ${JSON.stringify(bad)}`);
    assert.equal(pay({ amount: bad, payerName: 'Ann Example' }), null);
    assert.deepEqual(askedFor({ kind: 'paid_by_hand', invoiceId: MINE, landedMinor: bad }), bad == null ? { kind: 'paid_by_hand', id: MINE } : null, 'none given is no landed amount');
    assert.equal(askedFor({ kind: 'refund', invoiceId: MINE, amount: bad }), null);
  }
  assert.equal(pay({ amount: 5000, payerName: 'Ann Example' }).amount, 5000);
  assert.equal(askedFor({ kind: 'paid_by_hand', invoiceId: MINE, landedMinor: 4321 }).landedMinor, 4321);
  assert.equal(pay({ payerName: 'Ann Example', arrivedOn: '1999-12-31' }), null, 'before 2000');
  assert.equal(pay({ payerName: 'Ann Example', arrivedOn: '2000-01-01' }).arrivedOn, '2000-01-01');
  assert.equal(pay({ payerName: '\u200B\u200E\u2066\uFEFF' }), null, 'only invisible characters');
  assert.equal(pay({ payerName: '\u200BAnn Example\u200F' }).payerName, 'Ann Example');
});

test('2. a receipt is kept only in 062’s shape and only from the caller’s own folder', async () => {
  const me = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const file = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-receipt.pdf';
  assert.equal(pay({ payerName: 'Ann Example', receiptPath: `${me}/finances/receipts/${file}` }).receiptPath, `${me}/finances/receipts/${file}`);
  for (const bad of [`${me}/../x/finances/receipts/${file}`, `${me}/other/receipts/${file}`, `${me}/finances/receipts/x.pdf`, 'receipt.pdf']) {
    assert.equal(pay({ payerName: 'Ann Example', receiptPath: bad }).receiptPath, null, bad);
  }
  const { db } = world();
  const owner = billing({ server: db, stripe: null, coach: { ...OWNER, user_id: me }, now: () => NOW });
  await owner.bankPayment(pay({ profileId: MINE, receiptPath: `${me}/finances/receipts/${file}` }));
  await owner.bankPayment(pay({ profileId: MINE, receiptPath: `cccccccc-cccc-4ccc-8ccc-cccccccccccc/finances/receipts/${file}` }));
  assert.deepEqual(db.tables.payments.map((p) => p.receipt_path), [`${me}/finances/receipts/${file}`, null]);
});

test('2. a balance transaction that can’t be read is unknown (landed and fee null), so the nightly round asks again', () => {
  const usd = { currency: 'USD', amount_minor: 216000 };
  const gbp = { currency: 'GBP', amount_minor: 5000 };
  const unknown = { landed_gbp_minor: null, fee_minor: null };
  for (const balance of [{ currency: 'gbp', fee: 10 }, { currency: 'gbp', amount: '5000', fee: 10 }, { currency: 'gbp', amount: 49.5, fee: 1 },
    { currency: 'gbp', amount: 100, fee: 101 }, { currency: 'gbp', amount: true, fee: 0 }]) {
    assert.deepEqual(landedFrom(balance, usd), unknown, JSON.stringify(balance));
    assert.deepEqual(landedFrom(balance, gbp), unknown);
  }
  assert.deepEqual(landedFrom({ currency: 'gbp', amount: 172800, fee: 2612 }, usd), { landed_gbp_minor: 172800, fee_minor: 2612 });
  assert.deepEqual(landedFrom(null, gbp), { landed_gbp_minor: 5000, fee_minor: null }, 'Stripe not asked: pounds as their own amount');
});

// ---------------------------------------------------------------- 4. Mark as paid from the ready day

test('4. Mark as paid is offered only from the statement’s ready day (the month’s last day), never once paid', () => {
  const p = associatePay({ associateId: 'c-maya', rateMinor: 10000, month: '2026-11', monthMinutes: { coach_id: 'c-maya', held_minutes: 600 }, nowMs: NOW.getTime() });
  assert.equal(p.readyOn, '2026-11-30');
  assert.equal(canMarkPaid(p, '2026-11-25'), false, 'before the ready day: nothing to press');
  assert.equal(canMarkPaid(p, '2026-11-30'), true);
  assert.equal(canMarkPaid(p, '2026-12-02'), true);
  assert.equal(canMarkPaid({ ...p, paidOn: '2026-11-30' }, '2026-12-02'), false);
  assert.equal(canMarkPaid({ ...p, delivered: null }, '2026-12-02'), false);
  const src = readFileSync('src/pages/coach/AssociatePay.jsx', 'utf8');
  assert.match(src, /onMarkPaid=\{canMarkPaid\(pay, todayKey\) \? markPaid : null\}/);
});

test('4. a statement saved while the month runs doesn’t freeze it: the month’s minutes count until it ends or is paid', () => {
  const statement = { id: 'st-1', associate_id: 'c-maya', coach_id: 'c-tim', month: '2026-11-01', hours: 2, rate_minor: 10000, total_minor: 20000, lines: [{ label: 'Coaching hours', detail: 'old', value: '£200' }] };
  const minutes = { coach_id: 'c-maya', held_minutes: 600 };
  const during = associatePay({ associateId: 'c-maya', rateMinor: 10000, month: '2026-11', statements: [statement], monthMinutes: minutes, nowMs: NOW.getTime() });
  assert.deepEqual([during.from, during.delivered.minutes, during.delivered.payMinor, during.statement.id], ['minutes', 600, 100000, 'st-1']);
  assert.notEqual(during.lines[0].detail, 'old');
  const after = associatePay({ associateId: 'c-maya', rateMinor: 10000, month: '2026-11', statements: [statement], monthMinutes: minutes, nowMs: Date.parse('2026-12-01T12:00:00Z') });
  assert.deepEqual([after.from, after.delivered.payMinor], ['statement', 20000]);
  const paid = associatePay({ associateId: 'c-maya', rateMinor: 10000, month: '2026-11', statements: [{ ...statement, paid_on: '2026-11-30' }], monthMinutes: minutes, nowMs: NOW.getTime() });
  assert.equal(paid.from, 'statement');
  // Marked paid on the last day with the saved row still from mid-month: the month's figures now, the same row's id.
  const row = paidStatementRow({ id: 'new-id', statement, ownerId: 'c-tim', associateId: 'c-maya', month: '2026-11', pay: during, rateMinor: 10000, today: '2026-11-30' });
  assert.deepEqual([row.id, row.total_minor, row.paid_minor, row.hours, row.paid_on], ['st-1', 100000, 100000, 10, '2026-11-30']);
});

// ---------------------------------------------------------------- 6. charity, however it is spelt

test('6. the charity check mirrors 062’s finance_name_says_charity', () => {
  for (const n of ['Charity', 'CHARITY rate', 'Chаrity' /* Cyrillic а */, 'Ch@r1ty', 'ch4rity', 'C h a r i t y', 'Carity', 'Char!ty', 'Сharіty', 'Charlty', 'c.h.a.r.i.t.y']) {
    assert.equal(nameSaysCharity(n), true, n);
    assert.throws(() => checkDiscount({ name: n, percent: 10 }), /never called charity/);
  }
  for (const n of ['Not-for-profit', 'Returning client', 'Chart rate', 'Archer']) assert.equal(nameSaysCharity(n), false, n);
  assert.equal(checkDiscount({ name: 'Not-for-profit', percent: 20 }).name, 'Not-for-profit');
});

// ---------------------------------------------------------------- 7. the money boxes' limit

test('7. an amount over £1,000,000 says so; anything else unreadable asks for an amount', () => {
  assert.equal(TOO_MUCH, 'That’s more than £1,000,000. Type a smaller amount.');
  assert.equal(amountProblem('1,000,001', '95'), TOO_MUCH);
  assert.equal(amountProblem('£2000000.50', '1,200'), TOO_MUCH);
  assert.equal(amountProblem('1,000,000', '95'), null);
  assert.equal(amountProblem('lots', '95'), 'Type an amount, such as 95.');
  assert.equal(amountProblem('0', '95'), 'Type an amount, such as 95.');
  assert.equal(cashSettingsChange({ start: { tax: '25', keep: '' }, tax: '25', keep: '5000000' }).problem, TOO_MUCH);
  const pages = ['src/pages/coach/Finances.jsx', 'src/pages/coach/financeParts.jsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(pages, /setProblem\('Type an amount, such as 95\.'\)|words: 'Type an amount, such as 1,200\.'/, 'every money box uses amountProblem');
});

// ---------------------------------------------------------------- 8. the webhook's comment names the real file

test('8. the webhook names the nightly round that exists', () => {
  for (const f of ['api/stripe-webhook.js', 'src/lib/billing/stripeWebhook.js']) assert.doesNotMatch(readFileSync(f, 'utf8'), /stripe-catch-up\.js/);
  assert.match(readFileSync('api/stripe-webhook.js', 'utf8'), /api\/_routes\/billing-nightly\.js/);
  assert.ok(existsSync('api/_routes/billing-nightly.js'));
});
