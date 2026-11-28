// src/lib/possessive.js: the one possessive (the Stage D UI tester's polish 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { possessive } from '../../src/lib/possessive.js';
import { possessive as coachPossessive } from '../../src/lib/coach/model.js';
import { portalItem } from '../../src/lib/agreements/needsYou.js';

test('a final s takes only the apostrophe', () => {
  assert.equal(possessive('Sam'), 'Sam’s');
  assert.equal(possessive('Tessaline Partners'), 'Tessaline Partners’');
  assert.equal(possessive('  James '), 'James’');
  assert.equal(coachPossessive('Harbour Rowing'), 'Harbour Rowing’s');
});

test('Needs you names an organisation ending in s with its apostrophe alone', () => {
  const i = portalItem({ invoiceId: 'i1', number: 1201, orgName: 'Tessaline Partners', day: '2026-11-27', today: '2026-11-27' });
  assert.equal(i.title, 'Upload CLARITY-1201 to Tessaline Partners’ supplier portal');
});
