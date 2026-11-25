// src/lib/agreements/orgInvoice.js: invoicing an organisation (brief items 25 to 28, 34; M28's s-inv-new).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as o from '../../src/lib/agreements/orgInvoice.js';

const efl = [{ key: 'a', minutes: 90 }, { key: 'b', minutes: 60 }, { key: 'c', minutes: 90 }, { key: 'd', minutes: 60 }];

test('EFL: 1.5 + 1 + 1.5 + 1 = 5 hours at £300/hr = £1,500, due Fri 25 Dec 2026', () => {
  const rows = o.rows(efl, {});
  assert.equal(o.minutesOf(rows), 300);
  assert.equal(o.total(rows, 30000), 150000);
  assert.equal(o.totalLine(rows, 30000, 30), '5 hours, so £1,500. Due within 30 days.');
  assert.equal(o.dueOn('2026-11-25', 30), '2026-12-25');
  assert.equal(o.introLine(30000), 'Logged since the last invoice, at £300/hr. Untick to leave off.');
  assert.equal(o.total(o.rows(efl, { b: false }), 30000), 120000, 'unticking leaves it off');
});

test('the rate: typed on the invoice, else the sponsor agreement’s, else the profile’s', () => {
  assert.equal(o.rate({ hourly_rate_minor: 25000 }, { rateMinor: 30000 }, null), 30000);
  assert.equal(o.rate({ hourly_rate_minor: 25000 }, null, null), 25000);
  assert.equal(o.rate({ hourly_rate_minor: 25000 }, { rateMinor: 30000 }, 27500), 27500);
});

test('it won’t send without the PO or evidence, in M28’s words', () => {
  const profile = { needs_po: true, evidence_required: true };
  assert.deepEqual(o.problems({ orgName: 'Elite Football League', profile, rows: [], poNumber: '', evidence: [] }), [
    'Tick at least one coaching session.',
    'Elite Football League needs a purchase order on the invoice. Add the PO number first.',
    'Add the screenshot of your hours first. Elite Football League won’t accept the invoice without it.',
  ]);
  assert.deepEqual(o.problems({ orgName: 'EFL', profile, rows: efl, poNumber: '4500918823', evidence: [{}] }), []);
});

test('one PDF: a timesheet and 2 attachments make 4 pages; named in words', () => {
  assert.equal(o.pageWords(o.pageCount({ timesheet: true, attachments: 2 })), '4 pages');
  assert.equal(o.pageWords(o.pageCount({})), '1 page');
  assert.equal(o.fileName({ number: 1251, orgName: 'Cymru Active', day: '2026-11-25' }), 'Invoice CLARITY-1251, Cymru Active, 25 Nov 2026.pdf');
  assert.equal(o.descriptionLine({ orgName: 'Elite Football League', count: 4, firstDay: '2026-11-03', lastDay: '2026-11-24', timesheet: true }),
    'Coaching for Elite Football League, 4 coaching sessions, 3 to 24 Nov 2026 (timesheet on page 2)');
});
