// Pricing (Phase 6b run 2): "About £750/hr", Update all prices with M11's rounding rule (it must reproduce M11's
// preview: +3% takes £13,460 to £13,860, £7,460 to £7,680 and £940 to £970), and discounts that are never "charity".
import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../../src/lib/finance/index.js';

test('About £…/hr, as M11 shows each package', () => {
  assert.equal(f.perHourWords(746000, 9), 'About £830/hr');
  assert.equal(f.perHourWords(1346000, 18), 'About £750/hr');
  assert.equal(f.perHourWords(2246000, 31), 'About £725/hr');
  assert.equal(f.perHourWords(94000, 1.5), 'About £625/hr');
  assert.equal(f.perHourWords(128000, 4), 'About £320/hr');
  assert.equal(f.perHourWords(586000, 20), 'About £293/hr');
  assert.equal(f.perHourWords(1048000, 18, { includesVat: true }), 'About £485/hr');
  assert.equal(f.perHourWords(246000, null), '');
});

test('Update all prices: M11’s preview at +3%, and its footnote word for word', () => {
  const packages = [
    { name: 'Leadership Accelerator, 6 months', hours: 18, organisations_minor: 1346000, personally_minor: 1048000 },
    { name: 'Leadership Sprint, 3 months', hours: 9, organisations_minor: 746000, personally_minor: 584000 },
    { name: 'Team Workshop, 90 minutes', hours: 1.5, organisations_minor: 94000, personally_minor: null },
  ];
  const u = f.updateAllPrices({ packages, percent: 3 });
  assert.deepEqual(u.preview, [
    { name: 'Leadership Accelerator, 6 months', was: 'Was £13,460', now: '£13,860' },
    { name: 'Leadership Sprint, 3 months', was: 'Was £7,460', now: '£7,680' },
    { name: 'Team Workshop, 90 minutes', was: 'Was £940', now: '£970' },
  ]);
  assert.equal(u.count, 5);
  assert.equal(u.button, 'Update 5 prices');
  assert.equal(u.footnote, 'Prices round to an ending of 20, 30, 40, 60, 70 or 80, and never go below £200/hr. Clients keep their price until they renew.');
  for (const p of u.packages) for (const x of [p.organisations, p.personally].filter(Boolean)) assert.ok(f.ENDINGS.includes((x.now / 100) % 100));
});

test('the rounding rule: the nearest allowed ending (a tie goes up), and never below £200/hr', () => {
  assert.equal(f.roundPrice(13863.8), 13860);
  assert.equal(f.roundPrice(7650), 7660);
  assert.equal(f.roundPrice(1000), 1020); // 980 and 1,020 are as near: a tie goes up
  assert.equal(f.roundPrice(1049), 1040);
  assert.equal(f.roundPrice(1051), 1060);
  assert.equal(f.roundPrice(32.4), 32); // a portal seat
  assert.equal(f.newPrice(246000, 2), 252000); // a monthly price: £2,509.20 → £2,520
  // £1,000 for 6 hours at −20% is £800, about £133/hr: it goes up to the first allowed price over £1,200.
  assert.equal(f.newPrice(100000, -20, 6), 122000);
  assert.throws(() => f.newPrice(100000, 150));
});

test('discounts: a name, a percentage or a fixed amount, all packages or chosen ones, never “charity”', () => {
  assert.equal(f.checkDiscount({ name: 'Returning client', percent: 15 }).words, '15% off');
  const fixed = f.checkDiscount({ name: '  Early   commitment ', amount_minor: 50000, packages: ['Leadership Accelerator', 'Leadership Partnership'] });
  assert.deepEqual([fixed.name, fixed.words], ['Early commitment', '£500 off']);
  assert.equal(f.discountFor(fixed, 'Leadership Accelerator'), true);
  assert.equal(f.discountFor(fixed, 'Team Workshop'), false);
  assert.throws(() => f.checkDiscount({ name: 'Charity', percent: 20 }), /never called charity/);
  assert.throws(() => f.checkDiscount({ name: 'Charitable rate', percent: 20 }), /never called charity/);
  assert.throws(() => f.checkDiscount({ name: 'Both', percent: 10, amount_minor: 100 }));
  assert.throws(() => f.checkDiscount({ name: 'Too much', percent: 120 }));
  assert.throws(() => f.checkDiscount({ name: '', percent: 10 }));
  assert.throws(() => f.checkDiscount({ name: 'None chosen', percent: 10, packages: [] }));
});
