// Invoicing an organisation's screens (Phase 6b run 3, Group D; M28 s-org-billing, s-inv-new, s-inv-sent; brief items
// 25 to 28, 30 and 34): the billing profile's row and its calm checks, what can go on the invoice (held and late
// sessions with its people, and time logged, none already invoiced), the rate, the bill-to block, why it won't send,
// and Invoice sent's rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../../src/lib/agreements/duringAgreement.js';
import { problems, rate, totalLine, introLine, pageCount, evidenceHint } from '../../src/lib/agreements/orgInvoice.js';

const coachId = 'c1';
const now = Date.parse('2026-11-25T15:00:00Z');

test('the billing profile: typed pounds to pence, terms, and calm words for a wrong email, rate or portal', () => {
  const form = { ...d.profileForm(null, { name: 'Elite Football League' }), legal: 'Elite Football League Ltd', address: '30 Gloucester Place\nLondon\nW1U 8PL', email: 'invoices@efl.example', rate: '300', needsPo: true, evidence: true, portal: true, portalUrl: 'https://suppliers.efl.example' };
  const { row } = d.profileRow(form, { coachId, organisationId: 'o1' });
  assert.equal(row.hourly_rate_minor, 30000);
  assert.equal(row.terms_days, 30);
  assert.equal(row.needs_po, true);
  assert.equal(row.evidence_required, true);
  assert.equal(row.supplier_portal, true);
  assert.deepEqual(d.profileForm(row, { name: 'EFL' }).rate, '300');
  assert.equal(d.profileRow({ ...form, email: 'not an email' }, { coachId, organisationId: 'o1' }).problem.at, 'email');
  assert.equal(d.profileRow({ ...form, rate: 'three hundred' }, { coachId, organisationId: 'o1' }).problem.at, 'rate');
  assert.equal(d.profileRow({ ...form, portalUrl: 'http://insecure.example' }, { coachId, organisationId: 'o1' }).problem.at, 'portal');
  assert.equal(d.penceFrom('£1,250.50'), 125050);
  assert.equal(d.penceFrom(''), null);
  assert.deepEqual(d.billTo(row, 'EFL'), ['Elite Football League Ltd', '30 Gloucester Place', 'London', 'W1U 8PL']);
});

test('what can go on the invoice: its people’s held and late sessions, its time logged, nothing already invoiced', () => {
  const clients = [{ id: 'p1', name: 'Dan Hughes', organisation_id: 'o1' }, { id: 'p2', name: 'Someone Else', organisation_id: 'o2' }];
  const sessions = [
    { id: 's1', profile_id: 'p1', starts_at: '2026-11-03T10:00:00Z', minutes: 90, outcome: 'held' },
    { id: 's2', profile_id: 'p1', starts_at: '2026-11-10T10:00:00Z', minutes: 60, outcome: 'late_cancel' },
    { id: 's3', profile_id: 'p1', starts_at: '2026-11-17T10:00:00Z', minutes: 60, outcome: 'late_cancel', waived: true },
    { id: 's4', profile_id: 'p1', starts_at: '2026-11-24T10:00:00Z', minutes: 60, outcome: 'moved' },
    { id: 's5', profile_id: 'p1', starts_at: '2026-11-26T10:00:00Z', minutes: 60, outcome: null },
    { id: 's6', profile_id: 'p2', starts_at: '2026-11-03T10:00:00Z', minutes: 60, outcome: 'held' },
    { id: 's7', profile_id: 'p1', starts_at: '2026-10-27T10:00:00Z', minutes: 60, outcome: 'held' },
    { id: 's8', profile_id: 'p1', starts_at: '2025-10-20T10:00:00Z', minutes: 60, outcome: 'held' }, // before the last invoice: left out
  ];
  const engagements = [{ id: 'e1', organisation_id: 'o1' }];
  const entries = [{ id: 't1', engagement_id: 'e1', started_at: '2026-11-20T09:00:00Z', ended_at: '2026-11-20T11:00:00Z', note: 'Report writing' }];
  const sources = [{ session_id: 's7', released_at: null }];
  const rows = d.orgInvoiceRows({ organisationId: 'o1', clients, sessions, entries, engagements, sources, now });
  assert.deepEqual(rows.map((r) => r.key), ['s:s1', 's:s2', 'e:t1']);
  assert.equal(rows[0].what, 'Coaching session with Dan Hughes');
  assert.equal(d.rowHours(90), '1.5 hours');
  assert.equal(d.rowHours(60), '1 hour');
  // A voided invoice lets its sessions go again.
  assert.equal(d.orgInvoiceRows({ organisationId: 'o1', clients, sessions, sources: [{ session_id: 's7', released_at: '2026-11-01T00:00:00Z' }], now }).length, 4);
  assert.equal(d.rowDay('2025-10-20', '2026-11-25'), 'Mon 20 Oct 2025');
  assert.equal(d.rowDay('2026-11-03', '2026-11-25'), 'Tue 3 Nov');
  assert.equal(introLine(30000), 'Logged since the last invoice, at £300/hr. Untick to leave off.');
  assert.equal(totalLine(rows, 30000, 30), '4.5 hours, so £1,350. Due within 30 days.');
});

test('the rate: typed on this invoice, else the sponsor agreement’s, else the profile’s (item 34)', () => {
  const profile = { hourly_rate_minor: 30000 };
  assert.equal(rate(profile, null, null), 30000);
  assert.equal(rate(profile, { rateMinor: 25000 }, null), 25000);
  assert.equal(rate(profile, { rateMinor: 25000 }, 32000), 32000);
});

test('it won’t send while a PO or evidence is missing, each in calm words (item 28)', () => {
  const profile = { needs_po: true, evidence_required: true };
  const rows = [{ key: 's:s1', minutes: 60 }];
  assert.deepEqual(problems({ orgName: 'Cymru Active', profile, rows, poNumber: '', evidence: [] }), [
    'Cymru Active needs a purchase order on the invoice. Add the PO number first.',
    'Add the screenshot of your hours first. Cymru Active won’t accept the invoice without it.',
  ]);
  assert.deepEqual(problems({ orgName: 'Cymru Active', profile, rows, poNumber: 'PO 2026-3381', evidence: [{ id: 'f1' }] }), []);
  assert.equal(problems({ orgName: 'Cymru Active', profile: {}, rows: [], poNumber: '' })[0], 'Tick at least one coaching session.');
  assert.equal(pageCount({ timesheet: true, attachments: 1 }), 3);
  assert.equal(evidenceHint('Cymru Active'), 'Cymru Active needs evidence, such as a screenshot of your hours.');
});

test('Invoice sent’s rows, with their supplier portal and settled', () => {
  const invoice = { number: 1251, payer_email: 'invoices@efl.example', due_on: '2026-12-25', status: 'sent', portal_uploaded_at: null };
  const rows = d.sentRows({ invoice, profile: { supplier_portal: true }, today: '2026-11-25' });
  assert.deepEqual(rows.map((r) => [r.label, r.value]), [
    ['Sent to', 'invoices@efl.example'],
    ['Attached', 'CLARITY-1251.pdf, one file'],
    ['Their supplier portal', 'Upload it there too, reminder in Needs you'],
    ['Due', 'Fri 25 Dec, by bank transfer'],
    ['Settled', 'Not yet'],
  ]);
  assert.equal(rows.find((r) => r.label === 'Settled').done, false);
  const paid = d.sentRows({ invoice: { ...invoice, status: 'paid', paid_at: '2026-11-25T12:00:00Z', portal_uploaded_at: '2026-11-25T11:00:00Z' }, profile: { supplier_portal: true }, today: '2026-11-25' });
  assert.equal(paid.find((r) => r.label === 'Settled').value, 'Today, by bank transfer');
  assert.equal(paid.find((r) => r.label === 'Their supplier portal').value, 'Uploaded');
});

test('Give money back: settled invoices less what went back already', () => {
  const invoices = [{ id: 'i1', agreement_id: 'a1', status: 'paid', number: 1238, total_minor: 300000, paid_minor: 300000, paid_at: '2026-10-19T10:00:00Z' }, { id: 'i2', agreement_id: 'a1', status: 'sent', number: 1243 }];
  const list = d.settledInvoices(invoices, 'a1', [{ invoice_id: 'i1', amount_minor: 45000 }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].left_minor, 255000);
  assert.equal(d.paidOn(invoices, 'a1'), 300000);
});

test('a new invoice shows the month of the newest row first, ticked, with older rows behind Show older (UI finding 7)', async () => {
  const { invoicePeriod, olderWords } = await import('../../src/lib/agreements/duringAgreement.js');
  const rows = [{ key: 'a', day: '2026-09-28' }, { key: 'b', day: '2026-10-30' }, { key: 'c', day: '2026-11-03' }, { key: 'd', day: '2026-11-17' }];
  const p = invoicePeriod(rows);
  assert.equal(p.month, '2026-11');
  assert.deepEqual(p.recent.map((r) => r.key), ['c', 'd']);
  assert.deepEqual(p.older.map((r) => r.key), ['a', 'b']);
  assert.deepEqual(invoicePeriod([]), { month: null, recent: [], older: [] });
  assert.equal(olderWords(2), 'Show 2 older');
});
