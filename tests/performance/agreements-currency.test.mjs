// src/lib/agreements/currency.js: the 15 currencies, money in words, deposits rounded (Phase 6b run 3; brief items 4, 5, 42).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as c from '../../src/lib/agreements/currency.js';

test('M28’s 15 currencies, the same list as 065’s currency_ok()', () => {
  assert.equal(c.CURRENCY_LIST.length, 15);
  const sql = readFileSync(new URL('../../supabase/migrations/065_agreements_engine.sql', import.meta.url), 'utf8');
  const listed = /select p_currency in \(([^)]+)\)/.exec(sql)[1].match(/'([A-Z]{3})'/g).map((x) => x.slice(1, 4));
  assert.deepEqual([...listed].sort(), [...c.CURRENCY_LIST].sort());
  assert.equal(c.exponent('JPY'), 0);
  assert.equal(c.exponent('EUR'), 2);
  assert.throws(() => c.exponent('XYZ'));
});

test('money in words: whole amounts without pence, M28’s symbols, a minus for a discount', () => {
  assert.equal(c.moneyText(1800000, 'GBP'), '£18,000');
  assert.equal(c.moneyText(95625, 'GBP'), '£956.25');
  assert.equal(c.moneyText(2190000, 'EUR'), '€21,900');
  assert.equal(c.moneyText(125000, 'USD'), 'US$1,250');
  assert.equal(c.moneyText(3000000, 'JPY'), '¥3,000,000');
  assert.equal(c.moneyText(150000, 'CHF'), 'CHF 1,500');
  assert.equal(c.moneyText(-270000, 'GBP'), '−£2,700');
  assert.equal(c.rateText(75000, 'hour'), '£750/hr');
  assert.equal(c.rateText(300000, 'month'), '£3,000/month');
});

test('deposits round to the nearest £100, ¥10,000 for yen (risk 26)', () => {
  assert.equal(c.roundDeposit(459000, 'GBP'), 460000, '30% of £15,300 = £4,590 → £4,600');
  assert.equal(c.roundDeposit(45000, 'GBP'), 50000, '30% of £1,500 = £450 → £500');
  assert.equal(c.roundDeposit(437000, 'JPY'), 440000);
  assert.equal(c.depositStep('EUR'), 10000);
});

test('hours in words', () => {
  assert.equal(c.hoursWords(990), '16 hours 30 minutes');
  assert.equal(c.hoursWords(60), '1 hour');
  assert.equal(c.hoursWords(0), '0 minutes');
  assert.equal(c.hoursFigure(300), '5 hours');
  assert.equal(c.hoursFigure(90), '1.5 hours');
  assert.equal(c.andList(['a', 'b', 'c']), 'a, b and c');
});
