// The offer row's counting (5e rule 8b; Tim, 14 Nov, 10:14 to 10:19;
// src/lib/offers.js, used by useOffer): the first visit shows it; Not now
// offers it again on the next 2 visits, then stops; "Don’t show this
// again" joins from the second offer and stops it; taking it stops it; it
// never shows with another first-visit message; the title's icon hides
// while it shows and comes back after.
// Run: npm run test:healthcheck
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFER_AGAIN, afterNever, afterNotNow, afterTaken, cleanOffer, firstMessage, offerShows, offerView, offersFrom, offersNever, storedOffer,
} from '../../src/lib/offers.js';

const fresh = cleanOffer(undefined);
// A visit: the row as the page opens, with nothing pressed yet this visit.
const visit = (state, opts = {}) => offerView(state, { hiddenNow: false, ...opts });
// The state as stored and read back, as the account or the device keeps it.
const keep = (state) => cleanOffer(JSON.parse(JSON.stringify(storedOffer(state))));

test('the first visit shows the offer, with Not now only', () => {
  assert.deepEqual(fresh, { notNow: 0, never: false, taken: false });
  assert.deepEqual(visit(fresh), { show: true, never: false, titleIcon: false });
});

test('Not now hides it for the rest of the visit, and the title’s icon comes back', () => {
  const s = keep(afterNotNow(fresh));
  assert.deepEqual(offerView(s, { hiddenNow: true }), { show: false, never: false, titleIcon: true });
});

test('Not now offers it again on the next 2 visits, then it stops', () => {
  assert.equal(OFFER_AGAIN, 2);
  let s = fresh;
  const shown = [];
  for (let v = 1; v <= 6; v += 1) {
    const view = visit(s);
    shown.push(view.show);
    if (view.show) s = keep(afterNotNow(s));
  }
  assert.deepEqual(shown, [true, true, true, false, false, false]);
  assert.equal(s.notNow, 3);
});

test('“Don’t show this again” joins Not now from the second offer', () => {
  assert.equal(visit(fresh).never, false);
  const second = keep(afterNotNow(fresh));
  assert.equal(visit(second).never, true);
  assert.equal(offersNever(second), true);
  const third = keep(afterNotNow(second));
  assert.equal(visit(third).never, true);
});

test('“Don’t show this again” stops it on every later visit', () => {
  const s = keep(afterNever(keep(afterNotNow(fresh))));
  for (let v = 0; v < 3; v += 1) assert.deepEqual(visit(s), { show: false, never: false, titleIcon: true });
});

test('taking the offer stops it, and the title’s icon is back', () => {
  const s = keep(afterTaken(fresh));
  assert.deepEqual(visit(s), { show: false, never: false, titleIcon: true });
});

test('it never shows with another first-visit message', () => {
  assert.equal(offerShows(fresh, { blocked: true }), false);
  assert.equal(visit(fresh, { blocked: true }).titleIcon, true);
  // The page's order: the offer first, the one-off tip once it has gone.
  assert.equal(firstMessage('offer', 'tip'), 'offer');
  assert.equal(firstMessage(null, 'tip'), 'tip');
  assert.equal(firstMessage(null, null), null);
  assert.equal(firstMessage(false, 'tip'), 'tip');
});

test('the title’s icon hides only while the row shows', () => {
  for (const s of [fresh, keep(afterNotNow(fresh)), keep(afterNotNow(afterNotNow(fresh)))]) {
    const v = visit(s);
    assert.equal(v.titleIcon, !v.show);
  }
});

test('whatever was stored is read safely', () => {
  assert.deepEqual(cleanOffer({ not_now: '2', never: 'yes', taken: 1 }), fresh);
  assert.deepEqual(cleanOffer({ not_now: -4 }), fresh);
  assert.deepEqual(cleanOffer([1, 2]), fresh);
  assert.deepEqual(cleanOffer({ not_now: 2, never: true }), { notNow: 2, never: true, taken: false });
  assert.deepEqual(storedOffer(fresh), {});
  assert.deepEqual(offersFrom(null), {});
  assert.deepEqual(offersFrom({ offers: [] }), {});
  assert.deepEqual(offersFrom({ offers: { a: { not_now: 1 } }, menu_pins: [] }), { a: { not_now: 1 } });
});

test('it never plays by itself: only a press takes it', () => {
  // Nothing in the state changes until a choice is made; showing is not taking.
  const s = keep(fresh);
  visit(s);
  visit(s);
  assert.deepEqual(s, fresh);
});
