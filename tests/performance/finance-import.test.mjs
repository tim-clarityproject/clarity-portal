// The Master Revenue Sheet importer (Phase 6b run 2, step 8), tested with an invented sheet in a revenue sheet's
// usual shape: headings matched to fields (each changeable), then a preview of what would be added. Nothing is saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const SHEET = [
  'Date Paid,Client Name,Programme,Sector,Amount (£),Currency,Invoice No.,Country,Status,Notes',
  '03/05/2025,Example Holdings,Team day,Business,"£4,800.00",GBP,1001,UK,Paid,first one',
  '2025-06-14,Sam Invented,Leadership Sprint,Individual,"1,200",,1002,UK,Paid,',
  '14 Jul 2025,Rowan Example,Season coaching,sport,$2500,USD,1003,USA,Paid,',
  '01/08/2025,Example Clinic,Workshop,Medicine,940,,1004,UK,Unpaid,',
  '31/02/2025,Nobody,Bad date,Business,100,,1005,UK,Paid,',
  '05/09/2025,Euro Example,Talk,Business,700,EUR,1006,France,Paid,',
  '06/09/2025,,No name,Business,300,,1007,UK,Paid,',
  '07/09/2025,Kim Example,Refund,Business,(450),,1008,UK,Paid,',
  '08/09/2025,New Sector Org,Board day,Charity sector,"=1+1",,1009,UK,Paid,',
  ',,,,,,,,,',
  '09/10/2025,Example Holdings,Team day 2,Business,2000,,1010,UK,Paid,',
].join('\r\n');

test('headings are matched to fields, and each match can be changed', () => {
  const { headings, mapping, rows } = f.readSheet(SHEET);
  assert.equal(headings.length, 10);
  assert.equal(rows.length, 11); // the blank row keeps its place
  const field = Object.fromEntries(mapping.map((m) => [m.heading, m.field]));
  assert.deepEqual(field, {
    'Date Paid': 'day', 'Client Name': 'client', Programme: 'description', Sector: 'sector', 'Amount (£)': 'amount', Currency: 'currency',
    'Invoice No.': 'invoice', Country: 'country', Status: 'status', Notes: null,
  });
  assert.deepEqual(f.missingFields(mapping), []);
  const changed = f.setField(mapping, 9, 'description'); // Notes takes What for; Programme gives it up
  assert.equal(changed[9].field, 'description');
  assert.equal(changed[2].field, null);
  assert.deepEqual(f.missingFields(f.setField(mapping, 4, null)), ['Amount']);
  assert.throws(() => f.setField(mapping, 1, 'password'));
  // Other common spellings.
  const other = f.matchHeadings(['Invoice date', 'Customer', 'Value', 'Category', 'Description']);
  assert.deepEqual(other.map((m) => m.field), ['day', 'client', 'amount', 'sector', 'description']);
});

test('the preview: what would be added, what’s skipped and why, and "Individual" becomes Personal', () => {
  const { mapping, rows } = f.readSheet(SHEET);
  const existing = [{ day: '2025-10-09', client: 'example holdings', amount_minor: 200000 }];
  const p = f.importPreview({ rows, mapping, existing });
  assert.deepEqual(p.add.map((a) => [a.row, a.day, a.client, a.sector, a.amount_minor, a.currency]), [
    [2, '2025-05-03', 'Example Holdings', 'Business', 480000, 'GBP'],
    [3, '2025-06-14', 'Sam Invented', 'Personal', 120000, 'GBP'],
    [4, '2025-07-14', 'Rowan Example', 'Sport', 250000, 'USD'],
  ]);
  assert.deepEqual(p.skipped, [
    { row: 5, reason: 'It isn’t marked as paid.' },
    { row: 6, reason: 'Its date can’t be read.' },
    { row: 7, reason: 'Only pounds and dollars can be added.' },
    { row: 8, reason: 'It doesn’t say who it was from.' },
    { row: 9, reason: 'It’s a minus amount, so add it as a refund instead.' },
    { row: 10, reason: 'Its amount can’t be read.' },
    { row: 12, reason: 'It’s already in Finances.' },
  ]);
  assert.deepEqual(p.totals, { GBP: 600000, USD: 250000 });
  assert.deepEqual(f.sectorFromSheet('Charity sector'), { sector: 'Charity sector', isNew: true });
  assert.deepEqual(f.sectorFromSheet('individuals'), { sector: 'Personal', isNew: false });
  const missing = f.importPreview({ rows, mapping: f.setField(mapping, 0, null) });
  assert.deepEqual([missing.add.length, missing.missing], [0, ['When it was paid']]);
});

test('amounts and dates the way sheets write them', () => {
  assert.equal(f.parseAmount('£1,200.50'), 120050);
  assert.equal(f.parseAmount('1200.5'), 120050);
  assert.equal(f.parseAmount('-£450'), -45000);
  assert.equal(f.parseAmount('(450.00)'), -45000);
  assert.equal(f.parseAmount('USD 2,000'), 200000);
  assert.equal(f.parseAmount('12.345'), null);
  assert.equal(f.parseAmount('abc'), null);
  assert.equal(f.parseSheetDay('3/5/25'), '2025-05-03');
  assert.equal(f.parseSheetDay('03-May-25'), '2025-05-03');
  assert.equal(f.parseSheetDay('3 September 2025'), '2025-09-03');
  assert.equal(f.parseSheetDay('2025-05-03 10:00'), '2025-05-03');
  assert.equal(f.parseSheetDay('29/02/2025'), null);
  assert.equal(f.parseSheetDay('soon'), null);
});
