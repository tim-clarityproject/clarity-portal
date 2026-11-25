// src/lib/agreements/fx.js: another currency beside the £ price (brief items 42 and 43; M28's fxLine, Match my £ price).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fx from '../../src/lib/agreements/fx.js';

test('€20,000 at £0.84 is about £16,800, about £16,464 after Stripe converts it', () => {
  assert.equal(fx.gbpOf(2000000, 'EUR', 0.84), 1680000);
  assert.equal(fx.landed(1680000), 1646400);
  assert.equal(fx.fxLine(2000000, 'EUR', 0.84), 'About £16,800 at today’s rate (1 EUR = £0.84), about £16,464 after Stripe converts it.');
});

test('the warning is on what lands (risk 9): £1,536 under £18,000; Match my £ price is €21,900 and clears it', () => {
  assert.equal(fx.underBy(2000000, 'EUR', 0.84, 1800000), 153600);
  assert.equal(fx.underLine(153600, 1800000), 'That’s £1,536 under your £18,000 price for this package.');
  const m = fx.matchMyPrice(1800000, 'EUR', 0.84);
  assert.equal(m, 2190000);
  assert.equal(fx.underBy(m, 'EUR', 0.84, 1800000), 0);
  assert.equal(fx.matchLine(m, 'EUR', 1800000), 'Set to €21,900, matching £18,000 after conversion.');
  assert.equal(fx.underBy(1800000, 'GBP', 1, 1800000), 0, 'pounds never warn');
});

test('yen in whole yen; the database’s units per pound turn into £ per unit', () => {
  assert.equal(fx.gbpOf(3000000, 'JPY', 0.0052), 1560000);
  assert.equal(fx.matchMyPrice(1800000, 'JPY', 0.0052), 3532200, 'up to the next 50 yen');
  assert.ok(Math.abs(fx.perUnit(1.19047619) - 0.84) < 1e-6);
  assert.ok(Math.abs(fx.unitsPerGbp(0.84) - 1.19047619) < 1e-6);
});

test('the £ value down from 0.84 to 0.79 is 5.95%: Needs you', () => {
  assert.ok(Math.abs(fx.fallSince(0.84, 0.79) - 0.0595) < 0.0001);
  assert.equal(fx.movedDown(0.84, 0.79), true);
  assert.equal(fx.movedDown(0.84, 0.81), false);
  assert.equal(fx.movedDown(0.84, 0.9), false);
  assert.equal(fx.rateDayLine('2026-11-25'), 'Reference rate from Wed 25 Nov 2026');
});
