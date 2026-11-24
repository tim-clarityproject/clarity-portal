// Finances' year and targets (Phase 6b run 2, step 9): the 1 May year, its quarters, working days, targets per month
// and per year, Same every month, the new year's copy and raising them all. Invented figures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

test('the financial year runs from 1 May: which year a day is in, its 12 months and its words', () => {
  const y = f.financialYear('2026-11-24');
  assert.equal(y.label, 2026);
  assert.deepEqual([y.start, y.end, y.months[0], y.months[11]], ['2026-05-01', '2027-04-30', '2026-05', '2027-04']);
  assert.equal(y.words, '1 May 2026 to 30 Apr 2027');
  assert.equal(f.financialYear('2026-04-30').label, 2025);
  assert.equal(f.financialYear('2026-05-01').label, 2026);
  assert.equal(f.financialYear('2027-01-15').words, '1 May 2026 to 30 Apr 2027');
  assert.equal(f.yearStarting(2025).words, '1 May 2025 to 30 Apr 2026');
  assert.equal(f.yearStartWords(), 'Your financial year runs from 1 May');
  assert.equal(f.financialYear('2026-03-01', 4).words, '1 Apr 2025 to 31 Mar 2026');
  assert.throws(() => f.financialYear('2026-11-24', 13));
});

test('quarters of the 1 May year, and working days left (Monday to Friday, counting today)', () => {
  assert.equal(f.quarterOf('2026-11').words, 'This quarter, November to January');
  assert.equal(f.quarterOf('2027-01').words, 'This quarter, November to January');
  assert.equal(f.quarterOf('2026-05').words, 'This quarter, May to July');
  assert.deepEqual(f.quarterOf('2027-04').months, ['2027-02', '2027-03', '2027-04']);
  assert.equal(f.workingDaysLeft('2026-11-23'), 6);
  assert.equal(f.workingDaysLeft('2026-11-24'), 5);
  assert.equal(f.workingDaysLeft('2026-11-28'), 1); // Saturday: only Mon 30 Nov is left
  assert.equal(f.workingDaysWords(1), '1 working day left');
  assert.equal(f.workingDaysWords(0), 'No working days left');
});

test('targets per month, per quarter and per year add up the months', () => {
  const targets = [{ month: '2026-11-01', target_minor: 500000 }, { month: '2026-12-01', target_minor: 400000 }, { month: '2027-01-01', target_minor: 600000 }];
  assert.equal(f.targetFor(targets, ['2026-11']), 500000);
  assert.equal(f.targetFor(targets, f.quarterOf('2026-11').months), 1500000);
  assert.equal(f.targetFor(targets, f.financialYear('2026-11-24').months), 1500000);
  assert.deepEqual(f.targetsByMonth(targets, ['2026-10', '2026-11']), { '2026-10': 0, '2026-11': 500000 });
  assert.throws(() => f.checkTarget(-1));
  assert.throws(() => f.checkTarget(100000001));
  assert.throws(() => f.checkTarget(12.5));
});

test('Same every month: a monthly figure twelve times, or a year split exactly in whole pounds', () => {
  const same = f.sameEveryMonth({ yearLabel: 2026, monthly: 500000 });
  assert.equal(same.length, 12);
  assert.deepEqual([same[0].month, same[11].month], ['2026-05-01', '2027-04-01']);
  assert.equal(f.targetFor(same, f.yearStarting(2026).months), 6000000);
  assert.deepEqual(f.sameEveryMonthSums(500000), { month: 500000, quarter: 1500000, year: 6000000 });
  const split = f.sameEveryMonth({ yearLabel: 2026, yearly: 5000000 });
  assert.equal(split.reduce((a, r) => a + r.target_minor, 0), 5000000);
  assert.deepEqual(split.map((r) => r.target_minor / 100), [4167, 4167, 4167, 4167, 4167, 4167, 4167, 4167, 4166, 4166, 4166, 4166]);
  const odd = f.sameEveryMonth({ yearLabel: 2026, yearly: 1000001 });
  assert.equal(odd.reduce((a, r) => a + r.target_minor, 0), 1000001);
});

test('a new financial year copies last year’s targets month for month, then they can all be raised', () => {
  const last = [5000, 5000, 3000, 3000, 6000, 6000, 5000, 4000, 6000, 6000, 6000, 5000]
    .map((t, i) => ({ month: `${f.addMonths('2025-05', i)}-01`, target_minor: t * 100 }));
  const copied = f.copyToNewYear({ targets: last, fromYear: 2025, toYear: 2026 });
  assert.equal(copied.length, 12);
  assert.deepEqual([copied[0], copied[11]], [{ month: '2026-05-01', target_minor: 500000 }, { month: '2027-04-01', target_minor: 500000 }]);
  assert.equal(f.targetFor(copied, f.yearStarting(2026).months), 6000000);
  // A month the new year already has keeps its own.
  const again = f.copyToNewYear({ targets: [...last, { month: '2026-05-01', target_minor: 700000 }], fromYear: 2025, toYear: 2026 });
  assert.equal(again.length, 11);
  assert.equal(again.some((r) => r.month === '2026-05-01'), false);
  assert.equal(f.newYearCheckDue({ copiedAt: '2026-05-01T00:05:00Z', checkedAt: null }), true);
  assert.equal(f.newYearCheckDue({ copiedAt: '2026-05-01T00:05:00Z', checkedAt: '2026-05-03T09:00:00Z' }), false);
  const raised = f.raiseTargets(copied, 3);
  assert.deepEqual(raised.slice(0, 3).map((r) => r.target_minor / 100), [5150, 5150, 3090]);
  assert.ok(raised.every((r) => r.target_minor % 100 === 0));
  assert.deepEqual(f.raiseTargets([{ month: '2026-05-01', target_minor: 333300 }], 2.5).map((r) => r.target_minor), [341600]);
  assert.throws(() => f.raiseTargets(copied, 250));
});

test('the minimum is measured after associate pay', () => {
  const lines = f.incomeLines({ payments: [{ id: 'x', amount_minor: 300000, currency: 'GBP', paid_at: '2026-11-03T10:00:00' }] });
  const targets = [{ month: '2026-11-01', target_minor: 500000 }];
  assert.equal(f.targetRows({ today: '2026-11-24', lines, targets, minimumMinor: 200000, associatePayMinor: 50000 }).month.minimum, 'Minimum £2,000, reached');
  assert.equal(f.targetRows({ today: '2026-11-24', lines, targets, minimumMinor: 200000, associatePayMinor: 150000 }).month.minimum, 'Minimum £2,000, not reached yet');
  assert.equal(f.percentOf(4999, 5000), 99);
  assert.equal(f.percentOf(1, 5000), 1);
  assert.equal(f.percentOf(10, 0), null);
});
