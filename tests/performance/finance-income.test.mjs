// Finances' income (Phase 6b run 2, step 9): income counts on its paid day on Tim's clock, in pounds at the landed
// amount, with refunds against the month they were refunded. Invented figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const p = (id, at, minor, extra = {}) => ({ id, amount_minor: minor, currency: 'GBP', paid_at: at, invoice_id: `inv-${id}`, ...extra });

test('a payment at 23:30 UTC on a month’s last day counts on Tim’s own day, either side of the clock change', () => {
  const lines = f.incomeLines({ payments: [
    p('a', '2026-09-30T23:30:00', 10000), // summer time: 00:30 on 1 Oct in London
    p('b', '2026-10-31T23:30:00', 20000), // winter time (clocks went back on 25 Oct): still 31 Oct
    p('c', '2026-10-24T23:30:00', 40000), // the night of the change: 00:30 on 25 Oct, British Summer Time
    p('d', '2027-03-31T23:30:00', 80000), // after the clocks go forward (28 Mar 2027): 00:30 on 1 Apr
  ] });
  const day = Object.fromEntries(lines.map((l) => [l.id, l.day]));
  assert.deepEqual(day, { a: '2026-10-01', b: '2026-10-31', c: '2026-10-25', d: '2027-04-01' });
  assert.deepEqual(f.incomeByMonth(lines, ['2026-09', '2026-10', '2026-11', '2027-03', '2027-04']),
    { '2026-09': 0, '2026-10': 70000, '2026-11': 0, '2027-03': 0, '2027-04': 80000 });
  // A timestamp that already has its zone is read as it says, and another zone can be given.
  assert.equal(f.incomeLines({ payments: [p('e', '2026-10-31T23:30:00Z', 1)] })[0].day, '2026-10-31');
  assert.equal(f.incomeLines({ payments: [p('e', '2026-10-31T23:30:00', 1)], zone: 'America/New_York' })[0].day, '2026-10-31');
  assert.equal(f.incomeLines({ payments: [p('e', '2026-11-01T03:30:00', 1)], zone: 'America/New_York' })[0].day, '2026-10-31');
});

test('pounds at the landed rate; a dollar payment not landed yet is left out of pounds and flagged', () => {
  const lines = f.incomeLines({ payments: [
    p('usd', '2026-11-05T12:00:00', 150000, { currency: 'USD', landed_gbp_minor: 118000, fee_minor: 2100 }),
    p('usd-waiting', '2026-11-06T12:00:00', 50000, { currency: 'USD', landed_gbp_minor: null }),
    p('gbp', '2026-11-07T12:00:00', 30000, { fee_minor: 450 }),
    p('gbp-landed', '2026-11-08T12:00:00', 20000, { landed_gbp_minor: 20000 }),
  ] });
  const usd = lines.find((l) => l.id === 'usd');
  assert.equal(usd.pounds, 118000);
  assert.ok(Math.abs(usd.rate - 1.2712) < 0.0001);
  assert.equal(f.incomeIn(lines, ['2026-11']), 118000 + 30000 + 20000);
  assert.deepEqual(f.notYetInPounds(lines, ['2026-11']).map((l) => l.id), ['usd-waiting']);
  assert.equal(f.stripeFees(lines, ['2026-11']), 2550);
});

test('refunds come off the month they’re refunded, as a minus line linked to the payment; credits change nothing', () => {
  const invoices = [{ id: 'inv-x', sector: 'Sport', profile_id: 'client-1' }, { id: 'inv-usd', sector: 'Business', organisation_id: 'org-1' }];
  const payments = [
    { id: 'pay-x', amount_minor: 120000, currency: 'GBP', paid_at: '2026-09-10T09:00:00', invoice_id: 'inv-x' },
    { id: 'pay-usd', amount_minor: 100000, currency: 'USD', landed_gbp_minor: 80000, paid_at: '2026-09-12T09:00:00', invoice_id: 'inv-usd' },
  ];
  const creditNotes = [
    { id: 'cn-1', kind: 'refund', amount_minor: 30000, currency: 'GBP', created_at: '2026-11-02T10:00:00', invoice_id: 'inv-x', number: 'CLARITY-CN-0001' },
    { id: 'cn-2', kind: 'credit', amount_minor: 50000, currency: 'GBP', created_at: '2026-11-03T10:00:00', invoice_id: 'inv-x' },
    { id: 'cn-3', kind: 'refund', amount_minor: 25000, currency: 'USD', created_at: '2026-11-04T10:00:00', invoice_id: 'inv-usd' },
  ];
  const lines = f.incomeLines({ payments, creditNotes, invoices });
  assert.deepEqual(f.incomeByMonth(lines, ['2026-09', '2026-11']), { '2026-09': 200000, '2026-11': -30000 - 20000 });
  const refund = lines.find((l) => l.id === 'cn-1');
  assert.deepEqual([refund.kind, refund.pounds, refund.payment_id, refund.sector, refund.profile_id], ['refund', -30000, 'pay-x', 'Sport', 'client-1']);
  assert.equal(lines.find((l) => l.id === 'cn-3').pounds, -20000); // at the payment's own landed rate
  assert.equal(lines.filter((l) => l.kind === 'refund').length, 2);
});

test('by sector adds up to 100%, and by client is the most first', () => {
  const lines = f.incomeLines({ payments: [
    p('1', '2026-11-02T10:00:00', 100000, { sector: 'Business', organisation_id: 'org-a' }),
    p('2', '2026-11-03T10:00:00', 100000, { sector: 'Sport', profile_id: 'person-b' }),
    p('3', '2026-11-04T10:00:00', 100000, { sector: 'Medicine', profile_id: 'person-c' }),
    p('4', '2026-11-05T10:00:00', 50000, { sector: 'Business', organisation_id: 'org-a' }),
  ] });
  const rows = f.sectorRows({ lines, months: ['2026-11'] });
  assert.deepEqual(rows.map((r) => [r.sector, r.share]), [['Business', 43], ['Sport', 29], ['Medicine', 28], ['Personal', 0]]);
  assert.equal(rows.reduce((a, r) => a + r.share, 0), 100);
  assert.deepEqual(f.sharesOf([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(f.sharesOf([0, 0]), [0, 0]);
  const clients = f.clientRows(lines, ['2026-11']);
  assert.deepEqual(clients.map((c) => [c.key, c.pounds]), [['org:org-a', 150000], ['person:person-b', 100000], ['person:person-c', 100000]]);
});

test('pro bono: hours held and their worth at Tim’s rates, never income', () => {
  const sessions = [
    { starts_at: '2026-06-01T09:00:00', minutes: 60, outcome: 'held' },
    { starts_at: '2026-07-01T09:00:00', minutes: 90, outcome: 'held', rate_minor: 20000 },
    { starts_at: '2026-07-08T09:00:00', minutes: 60, outcome: 'cancelled' },
    { starts_at: '2026-04-30T09:00:00', minutes: 60, outcome: 'held' }, // last financial year
  ];
  const pb = f.proBono({ sessions, hourlyRateMinor: 15000, from: '2026-05-01', to: '2027-04-30' });
  assert.deepEqual(pb, { minutes: 150, worth: 15000 + 30000 });
  assert.equal(f.hoursWords(pb.minutes), '2.5 hours');
  assert.equal(f.hoursWords(18 * 60), '18 hours');
});
