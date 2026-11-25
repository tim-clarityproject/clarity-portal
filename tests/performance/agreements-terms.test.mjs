// src/lib/agreements/terms.js: the terms' shape, from a package, and a funded client's cut (Phase 6b run 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as t from '../../src/lib/agreements/terms.js';

const pkg = { agreement_kind: 'sessions', name: '6-month coaching', personal_price_minor: 1800000, org_price_minor: 2400000, currency: 'GBP',
  personal_note: 'It was good to talk, [name].', defaults: { blocks: [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }], rhythm: 'Weekly for 6 weeks, then every 2 weeks', priceMode: 'total', settle: 'equal', fullTerm: true } };

test('a package makes the terms: 1 × 90 then 15 × 60, up front offered, the Health Check off', () => {
  const x = t.fromPackage(pkg, { clientFirst: 'Sam', startsOn: '2027-01-04' });
  assert.deepEqual(x.blocks, [{ n: 1, minutes: 90 }, { n: 15, minutes: 60 }]);
  assert.equal(x.offerUpfront, true);
  assert.equal(x.healthCheck, false);
  assert.equal(x.totalMinor, 1800000);
  assert.equal(x.endsOn, '2027-07-02');
  assert.equal(x.personalNote, 'It was good to talk, Sam.');
  assert.deepEqual(t.checkTerms(x), []);
  const funded = t.fromPackage(pkg, { funded: true, orgName: 'Northfield Logistics' });
  assert.equal(funded.totalMinor, 2400000);
  assert.equal(funded.fundedBy, 'Northfield Logistics');
  assert.equal(t.selfFunded(funded), false);
});

test('the Health Check is on only where the package adds it (item 7)', () => {
  assert.equal(t.fromPackage({ ...pkg, defaults: { ...pkg.defaults, healthCheck: true } }).healthCheck, true);
  for (const k of t.KINDS) assert.equal(t.blankTerms(k).healthCheck, false);
});

test('what’s missing reads as calm lines, never blocking a currency', () => {
  assert.deepEqual(t.checkTerms({ ...t.blankTerms('oneoff') }), ['Say what the work is.', 'Add the price.']);
  assert.ok(t.checkTerms({ ...t.blankTerms('sessions'), startsOn: null }).includes('Choose a start date.'));
  assert.ok(t.checkTerms({ ...t.blankTerms('sessions'), startsOn: '2027-01-04', totalMinor: 100, expiryDays: 45 }).includes('An offer runs out after 14, 30 or 60 days.'));
});

test('a funded client’s terms keep only the database’s allow-list (065’s my_agreements)', () => {
  const x = { ...t.fromPackage(pkg, { funded: true, orgName: 'Northfield' }), clientName: 'Una' };
  const cut = t.forClient(x);
  assert.ok(!('totalMinor' in cut) && !('discounts' in cut) && !('currency' in cut));
  assert.deepEqual(cut.blocks, x.blocks);
  const sql = readFileSync(new URL('../../supabase/migrations/065_agreements_engine.sql', import.meta.url), 'utf8');
  const view = sql.slice(sql.indexOf('create or replace function public._agreement_client_view'));
  const keys = [...view.slice(view.indexOf('array['), view.indexOf('])) end')).matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), [...t.FUNDED_KEYS].sort());
});
