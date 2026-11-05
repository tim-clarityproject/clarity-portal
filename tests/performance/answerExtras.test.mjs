// The answers kept with their rows once migration 040 is there (Phase 5
// follow-up, step 1): what the page sends for checkins.drinks and
// checkins.trip, and what it reads back. The database's own checks are in
// supabase/040_checkin_extras_and_review_way_test.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRINK_MAX, cleanAnswers, drinkUnits, drinksToRow, extrasFromRow, extrasToRow } from '../../src/lib/performance/checkin.js';

test('drinks as the row holds them: known drinks, whole counts, "other" in units', () => {
  assert.deepEqual(drinksToRow({ pint: 4, wine: '2', other: '1,5' }), { pint: 4, wine: 2, other: 1.5 });
  assert.deepEqual(drinksToRow({ pint: 0, wine: '', other: '' }), {}, 'nothing counted is an empty count (None)');
  assert.deepEqual(drinksToRow({}), {});
  assert.equal(drinksToRow(null), null);
  assert.equal(drinksToRow(undefined), null);
  assert.deepEqual(drinksToRow({ cider: 3, pint: 2 }), { pint: 2 }, 'a drink not on the list is left out');
  assert.deepEqual(drinksToRow({ pint: 150 }), { pint: DRINK_MAX }, 'never more than the steppers allow');
  assert.deepEqual(drinksToRow({ other: 5000 }), { other: 999 });
  assert.deepEqual(drinksToRow({ pint: -1, spirit: 'lots', other: 'abc' }), {}, 'negatives and words are left out');
  assert.deepEqual(drinksToRow({ bottle: 2.6 }), { bottle: 3 }, 'a count is a whole number');
  // The units the page shows are the same from the row as from the device.
  const counted = { pint: 4, other: '1,5' };
  assert.equal(drinkUnits(drinksToRow(counted)), drinkUnits(counted));
});

test('what the page sends: only what it knows, never an empty value over another device', () => {
  assert.deepEqual(extrasToRow({ H8: 'u8_14', _drinks: { pint: 4 }, _trip: 'long' }), { drinks: { pint: 4 }, trip: 'long' });
  assert.deepEqual(extrasToRow({ H8: 'u8_14' }), {}, 'an older answer with no drinks counted sends nothing');
  assert.deepEqual(extrasToRow({ _drinks: {} }), { drinks: {} }, 'None after counting');
  assert.deepEqual(extrasToRow({ _trip: 'cruise' }), {}, 'a trip not on the list is never sent');
  assert.deepEqual(extrasToRow({ _trip: null }), { trip: null });
  // The answers themselves never carry them (029 refuses unknown keys).
  assert.deepEqual(Object.keys(cleanAnswers({ H8: 'u8_14', _drinks: { pint: 4 }, _trip: 'long' })), ['H8']);
});

test('what the page reads back from the row', () => {
  assert.deepEqual(extrasFromRow({ answers: {}, drinks: { pint: 4 }, trip: 'short' }), { _drinks: { pint: 4 }, _trip: 'short' });
  assert.deepEqual(extrasFromRow({ answers: {} }), {}, 'before 040, or nothing saved: nothing, so the device copy stays');
  assert.deepEqual(extrasFromRow({ drinks: null, trip: null }), {});
  assert.deepEqual(extrasFromRow({ trip: 'cruise' }), {});
  assert.deepEqual(extrasFromRow(null), {});
  // A new device: the row alone gives the same answers as the first device had.
  const first = { H8: 'u8_14', _drinks: { pint: 4 }, _trip: 'long' };
  const row = { answers: cleanAnswers(first), ...extrasToRow(first) };
  assert.deepEqual({ ...row.answers, ...extrasFromRow(row) }, first);
});
