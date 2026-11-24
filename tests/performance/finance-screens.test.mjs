// Finances' screens (Phase 6b run 2; M11 C4 to C9): the rows financeData.js gathers and words for each tab, and the
// store's rule that an associate never loads the owner's Finances. Names and figures are invented.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/coach/financeData.js';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

// The store is read with the suites' stand-in database (tests/coach/supabase-stub.mjs), as coach-store-merge does.
const stub = pathToFileURL(resolvePath('tests/coach/supabase-stub.mjs')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { if (/(^|\\/)supabase(\\.js)?$/.test(s) && String(c.parentURL || '').includes('/src/lib/')) return { url: ${JSON.stringify(stub)}, shortCircuit: true }; return n(s, c); }`)}`);
if (!globalThis.window) globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, removeEventListener() {}, setInterval, clearInterval, setTimeout, clearTimeout };
if (!globalThis.__db) globalThis.__db = { async rpc() { return { data: null, error: null }; }, from() { throw new Error('no reads here'); } };

const TODAY = '2026-11-24';
const inv = (id, status, extra = {}) => ({ id, status, number: 1200 + Number(id.replace(/\D/g, '') || 10), total_minor: 94000, paid_minor: 0, currency: 'GBP', lines: [{ description: 'Team Workshop, November', amount: 94000 }], organisation_id: 'org-k', ...extra });
const names = { org: { 'org-k': 'Kestrel Group' }, person: { 'p-j': 'Jordan Reyes' } };

test('an amount typed in pounds, and a percentage', () => {
  assert.equal(d.poundsFromTyped('£1,200'), 120000);
  assert.equal(d.poundsFromTyped('1200.5'), 120050);
  assert.equal(d.poundsFromTyped('0'), null);
  assert.equal(d.poundsFromTyped('0', { allowZero: true }), 0);
  assert.equal(d.poundsFromTyped('-5'), null);
  assert.equal(d.poundsFromTyped('12abc'), null);
  assert.equal(d.poundsFromTyped('2000000'), null, 'over £1,000,000 is refused');
  assert.equal(d.percentFromTyped('25%'), 25);
  assert.equal(d.percentFromTyped('101'), null);
  assert.equal(d.typedPounds(120050), '1200.50');
  assert.equal(d.typedPounds(500000), '5000');
});

test('Invoices: Waiting to send, Overdue, Sent and due, Paid this month, with CLARITY- numbers', () => {
  const g = d.invoiceGroups({ today: TODAY, names, invoices: [
    inv('i14', 'draft', { due_on: '2026-12-01', total_minor: 195000, lines: [{ description: 'Leadership Sprint, payment 2 of 3' }] }),
    inv('i12', 'sent', { due_on: '2026-11-17' }),
    inv('i11', 'sent', { due_on: '2026-11-30', total_minor: 120000, organisation_id: null, profile_id: 'p-j', lines: [{ description: 'Time credit top-up' }] }),
    inv('i10', 'paid', { paid_at: '2026-11-05T10:00:00', total_minor: 118000, paid_minor: 118000 }),
    inv('i9', 'paid', { paid_at: '2026-10-02T10:00:00' }),
    inv('i8', 'void'),
  ] });
  assert.deepEqual([g.waiting[0].title, g.waiting[0].number, g.waiting[0].who, g.waiting[0].when, g.waiting[0].amount],
    ['Leadership Sprint, payment 2 of 3', 'CLARITY-1214', 'Kestrel Group', 'Due Tue 1 Dec', '£1,950']);
  assert.deepEqual([g.overdue[0].when, g.overdue[0].amount], ['7 days overdue', '£940']);
  assert.deepEqual([g.sent[0].who, g.sent[0].when], ['Jordan Reyes', 'Due Mon 30 Nov']);
  assert.deepEqual(g.paid.map((r) => r.when), ['Paid Thu 5 Nov'], 'paid before this month shows only when searched for');
  const found = d.invoiceGroups({ today: TODAY, names, q: 'workshop', invoices: [inv('i12', 'sent', { due_on: '2026-11-17' }), inv('i9', 'paid', { paid_at: '2026-10-02T10:00:00' })] });
  assert.equal(found.overdue.length + found.paid.length, 2);
  const filtered = d.invoiceGroups({ today: TODAY, names, status: 'overdue', invoices: [inv('i12', 'sent', { due_on: '2026-11-17' }), inv('i14', 'draft')] });
  assert.equal(filtered.waiting.length, 0);
});

test('an overdue invoice’s reminders read as M11 words them', () => {
  const invoice = inv('i12', 'sent', { due_on: '2026-11-10' });
  const r = d.reminderLines({ invoice, today: '2026-11-17', reminders: [
    { id: 'r3', invoice_id: 'i12', stage: 3, sent_at: '2026-11-13T09:00:00' },
    { id: 'r7', invoice_id: 'i12', stage: 7, sent_at: '2026-11-16T09:00:00' },
    { id: 'r14', invoice_id: 'i12', stage: 14, sent_at: null },
  ] });
  assert.deepEqual(r.lines, ['Sent Fri 13 Nov and Mon 16 Nov', 'The last one goes on Tue 24 Nov']);
  assert.equal(r.count, '2 of 3');
  assert.equal(r.waiting.id, 'r14');
});

test('Needs you: low cash first, overdue invoices one by one (or one line past 3), drafts, deadlines in 2 weeks', () => {
  const rows = d.needsYouRows({ today: TODAY, names, cash: { needsYou: 'Cash dips to £3,010 in May.' },
    invoices: [inv('i12', 'sent', { due_on: '2026-11-17' }), inv('i14', 'draft'), inv('i13', 'draft')],
    deadlines: [{ id: 'd1', name: 'Confirmation statement', due_on: '2025-12-04', every: 'year' }, { id: 'd2', name: 'Corporation tax', due_on: '2027-02-01', every: 'year' }] });
  assert.deepEqual(rows.map((r) => r.title), ['Cash dips to £3,010 in May.', 'An invoice for £940 is 7 days overdue.', '2 invoices are waiting to send.', 'Confirmation statement is due on Fri 4 Dec.']);
  assert.equal(rows[1].small, 'Kestrel Group');
  const many = d.needsYouRows({ today: TODAY, names, invoices: ['a1', 'a2', 'a3', 'a4'].map((id) => inv(id, 'sent', { due_on: '2026-11-17' })) });
  assert.deepEqual(many.map((r) => r.title), ['4 invoices are overdue.']);
});

test('a repeating deadline moves on to its next day', () => {
  const [next] = d.nextDeadlines([{ id: 'd', name: 'VAT return', due_on: '2026-02-28', every: 'quarter' }], TODAY);
  assert.equal(next.day, '2026-11-28');
  assert.equal(d.nextDeadlines([{ id: 'x', name: 'Once', due_on: '2026-01-01', every: 'once' }], TODAY).length, 0);
});

test('Coming in: the pipeline at each stage’s chance, repeating income from monthly agreements', () => {
  const stages = [{ id: 's1', likelihood: 50 }, { id: 'won', likelihood: 100, is_won: true }];
  const leads = [{ id: 'a', stage_id: 's1', value: 13500 }, { id: 'b', stage_id: 's1', value: 8500 }, { id: 'c', stage_id: 'won', value: 9000 }, { id: 'd', stage_id: 's1', value: 1000, cold_at: '2026-01-01' }];
  const p = d.pipelineLine(leads, stages);
  assert.deepEqual([p.count, p.figure, p.facts], [2, '£22,000', ['2 open deals', 'Likely £11,000']]);
  assert.deepEqual(d.leadsForForecast(leads, stages).map((l) => [l.likelihood, l.value_minor]), [[50, 1350000], [50, 850000]]);
  const rep = d.repeatingFrom([{ name: 'Portal seats', per: 'month', status: 'active', value: 640 }, { name: 'Old', per: 'month', status: 'ended', value: 100 }, { name: 'Once', per: 'once', status: 'active', value: 5 }]);
  assert.deepEqual(rep, [{ name: 'Portal seats', amount_minor: 64000, per: 'month', sector: null }]);
});

test('Pricing: sections in the sectors’ order, prices and per hour in words, discounts never charity', () => {
  const pk = [{ id: 'x', sector: 'Sport', name: 'Season Ready Sprint', hours: 4, org_price_minor: 128000, personal_price_minor: 124000 },
    { id: 'y', sector: 'Business', name: 'Leadership Sounding Board', per: 'month', org_price_minor: 246000 },
    { id: 'z', sector: 'Business', name: 'Leadership Accelerator, 6 months', hours: 18, org_price_minor: 1346000 }];
  const s = d.pricingSections(pk, [{ name: 'Business' }, { name: 'Sport' }]);
  assert.deepEqual(s.map((x) => x.name), ['Business', 'Sport']);
  assert.equal(d.priceWords(246000, 'month'), '£2,460/month');
  assert.equal(d.packageDetail(pk[1]), 'Monthly');
  assert.equal(d.packageDetail(pk[2]), 'About £750/hr');
  assert.equal(d.discountFor({ all_packages: false, package_ids: ['z', 'y'] }, pk), 'Leadership Accelerator, 6 months and Leadership Sounding Board');
  assert.equal(d.discountWords({ percent: 15 }), '15% off');
  assert.equal(d.discountWords({ amount_minor: 50000 }), '£500 off');
});

test('Today’s line from the store’s rows: this month against its target, then the urgent note', () => {
  const m = d.financeModel({
    financeSettings: { bank_balance_minor: 1000000, bank_checked_at: '2026-11-23T08:00:00', tax_share_percent: 0 },
    payments: [{ id: 'p', amount_minor: 230000, currency: 'GBP', paid_at: '2026-11-04T10:00:00', sector: 'Business' }],
    invoices: [inv('i12', 'sent', { due_on: '2026-11-17' })],
    financeTargets: [{ month: '2026-11-01', target_minor: 500000 }],
  }, { today: TODAY });
  assert.equal(m.line.text, 'November £2,300 of £5,000 · 1 overdue');
  assert.equal(m.cash.rows.length, 7);
});

test('the store keeps 062’s fourteen tables, and the settings and targets by coach and month', async () => {
  const { TABLES, FINANCE_TABLES } = await import('../../src/lib/coach/store.js');
  assert.equal(FINANCE_TABLES.size, 14);
  for (const t of FINANCE_TABLES) assert.ok(TABLES[t], t);
  assert.deepEqual(TABLES.finance_settings, ['coach_id']);
  assert.deepEqual(TABLES.finance_targets, ['coach_id', 'month']);
});
