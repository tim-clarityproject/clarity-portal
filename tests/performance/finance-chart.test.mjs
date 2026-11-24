// The Overview chart (Phase 6b run 2): the running total, projected income kept apart from what's paid (and hidden on
// request), the minimum measured after associate pay, and the scale growing with the biggest month. Invented figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

const TODAY = '2026-07-15';
const lines = f.incomeLines({ payments: [
  { id: 'may', amount_minor: 300000, currency: 'GBP', paid_at: '2026-05-10T10:00:00', sector: 'Business' },
  { id: 'jun', amount_minor: 250000, currency: 'GBP', paid_at: '2026-06-10T10:00:00', sector: 'Sport' },
  { id: 'jul', amount_minor: 900000, currency: 'GBP', paid_at: '2026-07-10T10:00:00', sector: 'Business' },
] });
const targets = [{ month: '2026-05-01', target_minor: 500000 }, { month: '2026-06-01', target_minor: 500000 }, { month: '2026-07-01', target_minor: 500000 }, { month: '2026-08-01', target_minor: 500000 }];
const expected = [
  { month: '2026-07', pounds: 100000, sector: 'Business' },
  { month: '2026-08', pounds: 200000, sector: 'Sport' },
  { month: '2026-06', pounds: 999999, sector: 'Sport' }, // a month gone by is never projected
];

test('running total: paid so far, then what’s projected, against the targets adding up', () => {
  const c = f.incomeChart({ today: TODAY, lines, expected, targets, mode: 'running' });
  const say = Object.fromEntries(c.bars.map((b) => [b.month, b.readout]));
  assert.equal(say['2026-06'], 'June, running total £5,500, target £10,000');
  assert.equal(say['2026-07'], 'July so far, running total £14,500, £1,000 more projected, target £15,000');
  assert.equal(say['2026-08'], 'August, running total £17,500 projected, target £20,000');
  assert.equal(c.line.words, 'Year target £20,000');
  assert.equal(c.note, 'At this rate, the year ends around £17,500.');
});

test('a month over its target is mint, the scale grows with it, and projected income can be hidden', () => {
  const c = f.incomeChart({ today: TODAY, lines, expected, targets });
  const jul = c.bars.find((b) => b.month === '2026-07');
  assert.deepEqual([jul.reached, jul.readout], [true, 'July so far, £9,000, £1,000 more projected, £4,000 over the target']);
  assert.equal(c.scaleMax, 1000000);
  const hidden = f.incomeChart({ today: TODAY, lines, expected, targets, showProjected: false });
  assert.equal(hidden.bars.find((b) => b.month === '2026-07').readout, 'July so far, £9,000, £4,000 over the target');
  assert.equal(hidden.bars.find((b) => b.month === '2026-08').readout, 'August, target £5,000');
  assert.equal(hidden.toggle, 'Show projected income');
  assert.equal(c.toggle, 'Hide projected income');
});

test('the minimum is measured after associate pay, on finished months only', () => {
  const c = f.incomeChart({ today: TODAY, lines, expected, targets, minimumMinor: 200000, associatePay: { '2026-05': 150000, '2026-07': 800000 } });
  const below = Object.fromEntries(c.bars.map((b) => [b.month, b.belowMinimum]));
  assert.deepEqual([below['2026-05'], below['2026-06'], below['2026-07']], [true, false, false]);
});

test('one sector: its own bars and projected parts, no targets', () => {
  const c = f.incomeChart({ today: TODAY, lines, expected, targets, sector: 'Sport' });
  assert.deepEqual(c.bars.slice(0, 4).map((b) => b.readout), ['May, £0', 'June, £2,500', 'July so far, £0', 'August, £2,000 projected']);
  assert.equal(c.note, 'Targets show with All income.');
  assert.equal(c.bars[0].label, 'May');
  assert.equal(c.bars[0].letter, 'M');
});
