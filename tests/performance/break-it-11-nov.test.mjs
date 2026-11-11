// Break-it tester, 11 Nov: one test for each fault found in the changes of
// 10 and 11 Nov. Run with npm run test:performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  zonePlace, zoneLabel, mainCityZone, zoneCountry, countryWords, countryAdjective, holidayName, sociable, bookingProblem, offeredStarts, instantAt, wallClock,
} from '../../src/lib/time/index.js';
import { wayRatingSaved } from '../../src/lib/performance/words.js';
import { reviewAnswersToRow, wayQuestion } from '../../src/lib/performance/dayReview.js';
import { readTip, tipNow } from '../../src/components/design/tipWords.js';
import { qualityWords, usualQuality } from '../../src/lib/performance/sleepChart.js';

test('a zone or country named like something every object carries never reads as a function', () => {
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
    assert.equal(typeof zonePlace(name), 'string', name);
    assert.ok(!/function|\[object/.test(zoneLabel(name)), zoneLabel(name));
    assert.equal(mainCityZone(name), name);
    assert.equal(zoneCountry(name), null);
    assert.equal(countryWords(name), name);
    assert.equal(countryAdjective(name), null);
  }
  // The lists still answer for their own entries.
  assert.equal(zoneLabel('America/Indiana/Knox'), 'Chicago time');
  assert.equal(zoneLabel('Europe/London'), 'UK time');
  assert.equal(zoneCountry('Europe/Dublin'), 'IE');
  assert.equal(countryWords('GB'), 'the UK');
  assert.equal(countryAdjective('CA'), 'Canadian');
  // Not text at all: no entry, never an error.
  for (const odd of [null, undefined, 5, {}, []]) {
    assert.equal(zoneCountry(odd), null);
    assert.equal(typeof zoneLabel(odd), 'string');
  }
});

test('a holiday’s name: "(observed)" once, and a very long name is read quickly', () => {
  assert.equal(holidayName('Christmas Day (substitute day)'), 'Christmas Day (observed)');
  assert.equal(holidayName('Boxing Day  (Substitute Day) (observed)'), 'Boxing Day (observed)');
  assert.equal(holidayName('Day\n(observed)'), 'Day (observed)');
  assert.equal(holidayName(null), '');
  const started = Date.now();
  assert.equal(holidayName(`${' '.repeat(200000)}x`), 'x');
  assert.equal(holidayName(`a${' '.repeat(200000)}(`), 'a (');
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started}ms`);
});

test('a call has ended by 20:00 to the second: half a minute over is too late', () => {
  const L = 'Europe/London';
  const at = (time) => instantAt('2026-11-16', time, L);
  assert.equal(sociable(at('19:00'), L, { minutes: 60 }), true);
  assert.equal(sociable(at('19:00'), L, { minutes: 60.5 }), false);
  assert.equal(sociable(new Date(at('19:00').getTime() + 30000), L, { minutes: 60 }), false);
  assert.equal(sociable(at('07:00'), L, { minutes: 780 }), true);
  assert.equal(sociable(at('07:00'), L, { minutes: 780.01 }), false);
  // The moment itself: 20:00 exactly is inside, a millisecond later is not.
  assert.equal(sociable(at('20:00'), L), true);
  assert.equal(sociable(new Date(at('20:00').getTime() + 1), L), false);
  assert.equal(sociable(new Date(at('07:00').getTime() - 1), L), false);
  assert.equal(bookingProblem({ start: at('19:00'), minutes: 60.5, clientZone: L }), 'early-late');
  // A half-minute call is never offered at 20:00.
  const last = offeredStarts({ day: '2026-11-16', minutes: 0.5, clientZone: L }).at(-1);
  assert.deepEqual([wallClock(last, L).hour, wallClock(last, L).minute], [19, 45]);
});

test('the review’s question keeps the capital of "I"', () => {
  assert.equal(wayQuestion('I am calm'), 'How I am calm were you today?');
  assert.equal(wayQuestion('I’m present'), 'How I’m present were you today?');
  assert.equal(wayQuestion('Intentional'), 'How intentional were you today?');
  assert.equal(wayQuestion('Calm under pressure.'), 'How calm under pressure were you today?');
  assert.equal(wayQuestion('CEO-like'), 'How CEO-like were you today?');
  assert.equal(wayQuestion('?!'), 'How was today?');
});

test('the way of being saves only a whole number from 1 to 10, whatever a draft on the device held', () => {
  for (const [held, saved] of [[7, 7], [1, 1], [10, 10], ['7', 7], [0, null], [12, null], [2.5, null], [-1, null], [NaN, null], [Infinity, null], ['', null], [' ', null], ['VERY_GOOD', null], [true, null], [[], null], [{}, null], [null, null], [undefined, null]]) {
    assert.equal(wayRatingSaved(held), saved, JSON.stringify(held));
    assert.equal(reviewAnswersToRow({ rating: held, where: '', wentWell: '', differently: '', tomorrow: [''], onMind: '' }).way_of_being_rating, saved, JSON.stringify(held));
  }
});

test('an open pop-up follows its mark’s words, and closes when the mark has gone', () => {
  const mark = (tip, isConnected = true) => ({ isConnected, getAttribute: () => (tip === undefined ? null : JSON.stringify(tip)) });
  const notRated = { value: 'Not rated', when: 'Wednesday 11 Nov', extra: [] };
  const fair = { value: 'Fair', when: 'Wednesday 11 Nov', extra: [] };
  assert.deepEqual(readTip(mark(fair)), fair);
  // Nothing changed: the same object back, so nothing is drawn again.
  assert.equal(tipNow(mark(notRated), notRated), notRated);
  // Rated by keyboard with the pop-up open: the new word.
  assert.deepEqual(tipNow(mark(fair), notRated), fair);
  // The mark has no words any more (the day is still to come), or has left the page.
  assert.equal(tipNow(mark(undefined), notRated), null);
  assert.equal(tipNow(mark(fair, false), fair), null);
  assert.equal(tipNow(null, fair), null);
  assert.equal(tipNow({ isConnected: true, getAttribute: () => '{not json' }, fair), null);
});

// The colour mode's first script, run as the page runs it, with a stand-in for the browser.
function boot({ path, saved, deviceLight }) {
  const store = new Map(saved ? [['clarity-colour-mode', saved]] : []);
  const listeners = {};
  const html = { attrs: {}, style: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; } };
  const window = {
    location: { pathname: path },
    matchMedia: () => ({ matches: deviceLight, addEventListener() {} }),
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    dispatchEvent() {},
  };
  const document = { documentElement: html, body: { style: {} }, querySelectorAll: () => [{ setAttribute() {} }], addEventListener() {} };
  vm.runInNewContext(readFileSync(new URL('../../src/lib/colourMode/boot.js', import.meta.url), 'utf8'), { window, document, CustomEvent: class {} });
  return { mode: () => html.attrs['data-theme'], store, window, storage: (key) => listeners.storage({ key }) };
}

test('colour mode: the outside Health Check follows the device whatever capitals its address has; no other page does', () => {
  for (const path of ['/health-check/abcdefgh12', '/Health-Check/abcdefgh12', '/HEALTH-CHECK/abcdefgh12', '/health-check', '/health-check.html']) {
    assert.equal(boot({ path, saved: 'light', deviceLight: false }).mode(), 'dark', path);
    assert.equal(boot({ path, saved: 'dark', deviceLight: true }).mode(), 'light', path);
  }
  for (const path of ['/welcome', '/health-checkup', '/health-check-results', '/my-account/health-check/x', '/', '/auth/login']) {
    assert.equal(boot({ path, saved: 'light', deviceLight: false }).mode(), 'light', path);
    assert.equal(boot({ path, saved: 'dark', deviceLight: true }).mode(), 'dark', path);
  }
});

test('colour mode: another tab clearing the device’s storage puts this tab back to Match my device', () => {
  const page = boot({ path: '/welcome', saved: 'dark', deviceLight: true });
  assert.equal(page.mode(), 'dark');
  page.store.clear();
  page.storage(null); // a cleared storage is announced with no key
  assert.equal(page.mode(), 'light');
  assert.equal(page.window.ClarityColourMode.get(), 'device');
  // Some other key changing is nothing to do with the colour mode.
  page.store.set('clarity-colour-mode', 'dark');
  page.storage('something-else');
  assert.equal(page.mode(), 'light');
  page.storage('clarity-colour-mode');
  assert.equal(page.mode(), 'dark');
});

test('sleep quality: only the five saved keys have a word', () => {
  assert.deepEqual(['very_poor', 'poor', 'fair', 'good', 'very_good'].map(qualityWords), ['Poor', 'Fair', 'Good', 'Very good', 'Excellent']);
  for (const odd of ['constructor', '__proto__', 'toString', 'VERY_GOOD', 'excellent', 'good ', '', null, undefined, 4, {}, []]) assert.equal(qualityWords(odd), null, JSON.stringify(odd));
  assert.equal(usualQuality(['constructor', 'toString', null, 'GOOD']), null);
  assert.equal(usualQuality(['constructor', 'good']), 'good');
});
