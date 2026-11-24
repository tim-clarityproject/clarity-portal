// Which invoices an agreement makes, and when (Phase 6b run 1, step 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueToDraft, expenseLines, invoicesFor, lateCancelInvoice } from '../../src/lib/billing/invoicePlan.js';

const T = { coaching: '6-month coaching', total_minor: 1800000, currency: 'GBP', instalments: 6 };

test('instalments: the first at signing, the rest monthly, adding up exactly; nothing drafted twice', () => {
  const p = invoicesFor(T, { signedDay: '2026-12-01' });
  assert.equal(p.length, 6);
  assert.deepEqual(p.map((x) => x.day), ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01']);
  assert.equal(p.reduce((n, x) => n + x.total, 0), 1800000);
  assert.equal(p[1].lines[0].description, '6-month coaching, instalment 2 of 6');
  assert.deepEqual([p[0].termsDays, p[0].settlesTo], [14, 'client']);
  assert.deepEqual(dueToDraft(p, [], '2026-12-01').map((x) => x.n), [1]);
  assert.deepEqual(dueToDraft(p, [1], '2027-01-05').map((x) => x.n), [2]);
  assert.deepEqual(dueToDraft(p, [1, 2], '2027-01-05'), []);
});

test('in full: the full price with each discount its own line under it', () => {
  const [one] = invoicesFor({ ...T, instalments: 1, discounts: [{ name: 'Returning client, 15% off', percent: 15 }] }, { signedDay: '2026-12-01' });
  assert.deepEqual(one.lines, [{ description: '6-month coaching', amount: 1800000 }, { description: 'Returning client, 15% off', amount: -270000 }]);
  assert.equal(one.total, 1530000);
  const inst = invoicesFor({ ...T, discounts: [{ name: 'Returning client, 15% off', percent: 15 }] }, { signedDay: '2026-12-01' });
  assert.equal(inst.reduce((n, x) => n + x.total, 0), 1530000);
  assert.deepEqual(inst[0].lines, [{ description: '6-month coaching, instalment 1 of 6', amount: 300000 }, { description: 'Returning client, 15% off', amount: -45000 }]);
});

test('funded: the organisation settles, on 30 days, with its purchase order; pro bono makes none', () => {
  const [one] = invoicesFor({ ...T, instalments: 1, fundedBy: 'Northfield Logistics', poNumber: 'PO-4471' }, { signedDay: '2026-12-01' });
  assert.deepEqual([one.settlesTo, one.termsDays, one.poNumber], ['organisation', 30, 'PO-4471']);
  assert.deepEqual(invoicesFor({ ...T, proBono: true }, { signedDay: '2026-12-01' }), []);
  assert.deepEqual(invoicesFor({ ...T, total_minor: 0 }, { signedDay: '2026-12-01' }), []);
});

test('a late cancellation for a pay-per-session client, and expenses at cost', () => {
  const l = lateCancelInvoice({ rateMinor: 75000, sessionDayWords: 'Thu 26 Nov' });
  assert.equal(l.lines[0].description, 'Coaching session, cancelled with less than 24 hours’ notice, Thu 26 Nov');
  assert.equal(lateCancelInvoice({ rateMinor: 0 }), null);
  assert.deepEqual(expenseLines([{ description: 'Train to Leeds', spent_on: '2026-11-20', amount_minor: 8450 }, { description: 'Hotel', spent_on: '2026-11-20', amount_minor: 12000, invoice_id: 'x' }]), [{ description: 'Train to Leeds, 2026-11-20', amount: 8450 }]);
});

test('functionality tester, 6b run 1: every instalment shows each discount as its own named line, and they add up exactly', async () => {
  const { invoicesFor } = await import('../../src/lib/billing/invoicePlan.js');
  const plan = invoicesFor({ total_minor: 1800000, currency: 'GBP', instalments: 6, coaching: '6-month coaching', discounts: [{ name: 'Returning client, 15% off', percent: 15 }] }, { signedDay: '2026-12-01' });
  assert.equal(plan.length, 6);
  for (const p of plan) {
    assert.deepEqual(p.lines.map((l) => l.description), [`6-month coaching, instalment ${p.n} of 6`, 'Returning client, 15% off']);
    assert.equal(p.total, p.lines.reduce((a, l) => a + l.amount, 0));
  }
  assert.equal(plan.reduce((a, p) => a + p.total, 0), 1530000);
  const odd = invoicesFor({ total_minor: 1000000, currency: 'GBP', instalments: 3, discounts: [{ name: 'Founding client', amount: 100 }] }, { signedDay: '2026-12-01' });
  assert.equal(odd.reduce((a, p) => a + p.total, 0), 999900);
});
