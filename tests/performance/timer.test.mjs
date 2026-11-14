// The timer (Tim, 13 Nov, 09:27 to 09:29; mock-up M9): its lengths, what
// counts as a number of minutes, how the time and the labels read, the
// count from an end time, and how the chosen length is remembered on the
// device (a signed-in person's copy is cleared by Sign out; a guest's is
// the device's own setting).
// Run with npm run test:performance.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
const events = {};
const sent = [];
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type) { this.type = type; } };
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: (name, fn) => { (events[name] = events[name] || []).push(fn); },
  removeEventListener: (name, fn) => { events[name] = (events[name] || []).filter((f) => f !== fn); },
  dispatchEvent: (e) => { sent.push(e.type); (events[e.type] || []).forEach((fn) => fn(e)); return true; },
};

const {
  DEFAULT_MINUTES, MAX_MINUTES, MINUTES_ERROR, MIN_MINUTES, TIMER_LENGTHS,
  buttonLabel, cleanMinutes, formatTime, isCustom, leftAt, minutesWords, ringLabel, ringOffset, timerSetMessage,
} = await import('../../src/lib/timer.js');
const {
  GUEST_KEY, TIMER_PREFERENCE, accountMinutes, readTimerMinutes, saveTimerMinutes, timerDeviceKey, watchTimerMinutes,
} = await import('../../src/lib/timerLength.js');
const { isAppOwnedKey } = await import('../../src/lib/clearAppStorage.js');

const SAM = '022e5568-00f2-4850-b954-000000000000';
const JO = '9a1d0c11-00f2-4850-b954-000000000000';

beforeEach(() => {
  store.clear();
  sent.length = 0;
  Object.keys(events).forEach((k) => delete events[k]);
});

test('The lengths offered are 4, 6, 8 and 10 minutes, starting at 6, and Custom is 1 to 60', () => {
  assert.deepEqual(TIMER_LENGTHS, [4, 6, 8, 10]);
  assert.equal(DEFAULT_MINUTES, 6);
  assert.equal(MIN_MINUTES, 1);
  assert.equal(MAX_MINUTES, 60);
  assert.equal(MINUTES_ERROR, 'Type a number from 1 to 60.');
  for (const m of TIMER_LENGTHS) assert.equal(isCustom(m), false, String(m));
  for (const m of [1, 5, 12, 60]) assert.equal(isCustom(m), true, String(m));
});

test('Minutes are a whole number from 1 to 60, from what was typed or saved', () => {
  assert.equal(cleanMinutes(1), 1);
  assert.equal(cleanMinutes(60), 60);
  assert.equal(cleanMinutes('1'), 1);
  assert.equal(cleanMinutes('60'), 60);
  assert.equal(cleanMinutes(' 12 '), 12);
  assert.equal(cleanMinutes('08'), 8);
  for (const no of [0, 61, -3, '0', '61', '-3', '', '   ', 'abc', '12 minutes', '1e1', '0x10', '1,5', null, undefined, NaN, Infinity, true, [8], {}]) {
    assert.equal(cleanMinutes(no), null, JSON.stringify(no) ?? String(no));
  }
});

test('A figure with a decimal part is rounded as M9 rounds it, then checked', () => {
  assert.equal(cleanMinutes('8.4'), 8);
  assert.equal(cleanMinutes(8.4), 8);
  assert.equal(cleanMinutes('8.5'), 9);
  assert.equal(cleanMinutes('0.5'), 1);
  assert.equal(cleanMinutes('0.4'), null);
  assert.equal(cleanMinutes('60.4'), 60);
  assert.equal(cleanMinutes('60.5'), null);
});

test('Full-width digits read as the same number', () => {
  assert.equal(cleanMinutes('１２'), 12);
  assert.equal(cleanMinutes('８．４'), 8);
  assert.equal(cleanMinutes('６１'), null);
});

test('The time reads as minutes and seconds, rounded up, never below 0', () => {
  assert.equal(formatTime(360), '6:00');
  assert.equal(formatTime(359.2), '6:00');
  assert.equal(formatTime(359), '5:59');
  assert.equal(formatTime(228), '3:48');
  assert.equal(formatTime(5), '0:05');
  assert.equal(formatTime(0.01), '0:01');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-4), '0:00');
  assert.equal(formatTime(3600), '60:00');
  assert.equal(formatTime(undefined), '0:00');
});

test('The button reads Start the timer, Pause, Carry on, then Start again', () => {
  assert.equal(buttonLabel({ running: false, left: 360, length: 360 }), 'Start the timer');
  assert.equal(buttonLabel({ running: true, left: 360, length: 360 }), 'Pause');
  assert.equal(buttonLabel({ running: true, left: 12, length: 360 }), 'Pause');
  assert.equal(buttonLabel({ running: false, left: 228, length: 360 }), 'Carry on');
  assert.equal(buttonLabel({ running: false, left: 0, length: 360 }), 'Start again');
});

test('The ring says its length and "Edit how long", or the time left while it runs', () => {
  assert.equal(ringLabel({ running: false, left: 360, length: 360 }), 'Timer, 6 minutes. Edit how long');
  assert.equal(ringLabel({ running: false, left: 20, length: 60 }), 'Timer, 1 minute. Edit how long');
  assert.equal(ringLabel({ running: true, left: 228, length: 360 }), '3:48 left');
  assert.doesNotMatch(ringLabel({ running: false, left: 360, length: 360 }), /Change/);
});

test('The message after a length is chosen, with one minute in the singular', () => {
  assert.equal(timerSetMessage(8), 'The timer is set to 8 minutes.');
  assert.equal(timerSetMessage(1), 'The timer is set to 1 minute.');
  assert.equal(timerSetMessage(60), 'The timer is set to 60 minutes.');
  assert.equal(minutesWords(4), '4 minutes');
});

test('The time left comes from the end time, so a hidden tab never loses count', () => {
  const start = Date.UTC(2026, 10, 13, 9, 27, 0);
  const endsAt = start + 6 * 60 * 1000;
  assert.equal(leftAt(endsAt, start), 360);
  assert.equal(leftAt(endsAt, start + 1000), 359);
  // Hidden for 2 minutes 12 seconds with no tick in between.
  assert.equal(leftAt(endsAt, start + 132000), 228);
  assert.equal(formatTime(leftAt(endsAt, start + 132000)), '3:48');
  assert.equal(formatTime(leftAt(endsAt, start + 132400)), '3:48');
  // Shown again long after it ended.
  assert.equal(leftAt(endsAt, start + 3600000), 0);
});

test('The ring’s line is drawn back by the share of the time still to go, as M9', () => {
  assert.equal(ringOffset({ left: 360, length: 360 }), '1.000');
  assert.equal(ringOffset({ left: 180, length: 360 }), '0.500');
  assert.equal(ringOffset({ left: 227.3, length: 360 }), (228 / 360).toFixed(3));
  assert.equal(ringOffset({ left: 0, length: 360 }), '0.000');
  assert.equal(ringOffset({ left: 400, length: 360 }), '1.000');
  assert.equal(ringOffset({ left: 0, length: 0 }), '1.000');
});

test('A guest’s length is remembered on the device only, starting at 6 minutes', () => {
  assert.equal(readTimerMinutes(null), 6);
  assert.equal(saveTimerMinutes(null, 8), 8);
  assert.equal(store.get(GUEST_KEY), '8');
  assert.equal(GUEST_KEY, 'clarity-timer-minutes');
  assert.equal(readTimerMinutes(null), 8);
  // Something else left under the key reads as the starting length.
  store.set(GUEST_KEY, 'abc');
  assert.equal(readTimerMinutes(null), 6);
  store.set(GUEST_KEY, '61');
  assert.equal(readTimerMinutes(null), 6);
});

test('A length that isn’t 1 to 60 is never kept', () => {
  saveTimerMinutes(null, 12);
  assert.equal(saveTimerMinutes(null, 0), null);
  assert.equal(saveTimerMinutes(null, 'abc'), null);
  assert.equal(saveTimerMinutes(SAM, 61), null);
  assert.equal(readTimerMinutes(null), 12);
  assert.equal(readTimerMinutes(SAM), 6);
});

test('A signed-in person’s copy carries their id, apart from a guest’s and from anyone else’s', () => {
  saveTimerMinutes(SAM, 10);
  assert.equal(readTimerMinutes(SAM), 10);
  assert.equal(readTimerMinutes(JO), 6);
  assert.equal(readTimerMinutes(null), 6);
  assert.equal(store.has(GUEST_KEY), false);
  assert.equal(timerDeviceKey(SAM), `clarity-cache:${SAM}:timer-minutes`);
  assert.equal(timerDeviceKey(null), GUEST_KEY);
  assert.equal(store.has(timerDeviceKey(SAM)), true);
});

test('Sign out clears the person’s copy, as it clears their menu pins, and leaves the device’s own setting', () => {
  assert.equal(isAppOwnedKey(timerDeviceKey(SAM)), true);
  assert.equal(isAppOwnedKey(`clarity-cache:${SAM}:menu-pins`), true);
  assert.equal(isAppOwnedKey(GUEST_KEY), false);
});

test('Storage that is blocked never breaks the timer: the length is kept for the visit', () => {
  const real = globalThis.window.localStorage;
  globalThis.window.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  try {
    assert.equal(readTimerMinutes(null), 6);
    assert.equal(readTimerMinutes(SAM), 6);
    assert.equal(saveTimerMinutes(null, 8), 8);
    assert.equal(saveTimerMinutes(SAM, 10), 10);
    // Kept for this visit, each under its own key.
    assert.equal(readTimerMinutes(null), 8);
    assert.equal(readTimerMinutes(SAM), 10);
    assert.equal(readTimerMinutes(JO), 6);
  } finally {
    globalThis.window.localStorage = real;
  }
  // Once storage works again, what it holds is what counts.
  assert.equal(saveTimerMinutes(null, 4), 4);
  assert.equal(saveTimerMinutes(SAM, 4), 4);
  store.clear();
  assert.equal(readTimerMinutes(null), 6);
  assert.equal(readTimerMinutes(SAM), 6);
});

test('Every timer on screen hears a new length, here and from another tab', () => {
  let heard = 0;
  const stop = watchTimerMinutes(() => { heard += 1; });
  saveTimerMinutes(null, 4);
  assert.equal(heard, 1);
  saveTimerMinutes(SAM, 4);
  assert.equal(heard, 2);
  const storage = (key) => (events.storage || []).forEach((fn) => fn({ key }));
  storage(GUEST_KEY);
  storage(timerDeviceKey(SAM));
  storage(null); // everything cleared
  assert.equal(heard, 5);
  storage('clarity-colour-mode');
  assert.equal(heard, 5);
  stop();
  saveTimerMinutes(null, 10);
  assert.equal(heard, 5);
});

test('The account’s choice is read from page_preferences.timer_minutes, and only a real one counts', () => {
  assert.equal(TIMER_PREFERENCE, 'timer_minutes');
  assert.equal(accountMinutes({ timer_minutes: 8, menu_pins: [] }), 8);
  assert.equal(accountMinutes({ timer_minutes: 12 }), 12);
  for (const prefs of [null, undefined, {}, { timer_minutes: 0 }, { timer_minutes: 61 }, { timer_minutes: '8' }, { timer_minutes: null }, { orb_style: 'level' }]) {
    assert.equal(accountMinutes(prefs), null, JSON.stringify(prefs));
  }
});
