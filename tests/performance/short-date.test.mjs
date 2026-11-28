// src/lib/performance/words.js shortDate: a date this year has no year (the Stage D UI tester's fault 4, Build your plan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { shortDate } from '../../src/lib/performance/words.js';

test('this year without its year, any other year with it', () => {
  assert.equal(shortDate('2026-12-15', '2026-11-28'), '15 Dec');
  assert.equal(shortDate('2027-03-31', '2026-11-28'), '31 Mar 2027');
  assert.equal(shortDate('2025-01-02', '2026-11-28'), '2 Jan 2025');
  assert.equal(shortDate('', '2026-11-28'), '');
});
