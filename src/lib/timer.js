// The timer's rules (mock-up M9, Get unstuck; Tim, 13 Nov, 09:27 to 09:29).
// One timer, the same everywhere in the portal: tapping the ring before it
// starts, or while it's paused, opens "How long?" with 4, 6, 8 or 10
// minutes, or Custom (1 to 60). No React here: the part is
// src/components/design/Timer.jsx, and the chosen length is remembered by
// src/lib/timerLength.js.

export const TIMER_LENGTHS = [4, 6, 8, 10];
export const DEFAULT_MINUTES = 6;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;

/** What the Custom box says when it isn't given a number from 1 to 60. */
export const MINUTES_ERROR = `Type a number from ${MIN_MINUTES} to ${MAX_MINUTES}.`;

// Full-width digits (０ to ９, as some keyboards type them) read as 0 to 9.
const plainDigits = (text) => text.replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xFF10)).replace(/．/g, '.');

/**
 * A whole number of minutes from 1 to 60 out of what was typed or saved,
 * or null. A figure with a decimal part is rounded as M9 rounds it
 * ("8.4" is 8), then checked. Only plain figures count: "", "abc", "1e1",
 * "-3", 0 and 61 are all null.
 */
export function cleanMinutes(value) {
  let n;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') {
    const text = plainDigits(value).trim();
    if (!/^\d+(\.\d+)?$/.test(text)) return null;
    n = Number(text);
  } else return null;
  if (!Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole >= MIN_MINUTES && whole <= MAX_MINUTES ? whole : null;
}

/** True when the length isn't one of the four offered, so Custom is the chosen row. */
export function isCustom(minutes) {
  return !TIMER_LENGTHS.includes(minutes);
}

/** "6:00", "0:05": whole seconds, rounded up, never below 0 (M9's fmt). */
export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${`0${s % 60}`.slice(-2)}`;
}

/** "8 minutes", "1 minute". */
export function minutesWords(minutes) {
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** The toast after a length is chosen: "The timer is set to 8 minutes." */
export function timerSetMessage(minutes) {
  return `The timer is set to ${minutesWords(minutes)}.`;
}

/** The button beside the ring. `left` and `length` are in seconds. */
export function buttonLabel({ running, left, length }) {
  if (running) return 'Pause';
  if (left <= 0) return 'Start again';
  if (left < length) return 'Carry on';
  return 'Start the timer';
}

/**
 * What a screen reader hears on the ring: the time left while it runs,
 * otherwise its length and that tapping it edits how long ("Edit", never
 * "Change": 5e rule 29am, where M9 wrote "Change how long").
 */
export function ringLabel({ running, left, length }) {
  if (running) return `${formatTime(left)} left`;
  return `Timer, ${minutesWords(Math.round(length / 60))}. Edit how long`;
}

/**
 * Seconds left until an end time (both in milliseconds, as Date.now()),
 * never below 0. The timer counts from its end time, not by counting
 * ticks, so it stays right after the tab has been hidden.
 */
export function leftAt(endsAt, now) {
  return Math.max(0, (endsAt - now) / 1000);
}

/**
 * How far the ring's line is drawn back (M9's stroke-dashoffset): the
 * share of the time still to go, in whole seconds, to three places. "1.000"
 * before it starts (no line yet), "0.000" when the time is up (a full ring).
 */
export function ringOffset({ left, length }) {
  if (!(length > 0)) return '1.000';
  const share = Math.min(1, Math.max(0, Math.ceil(left) / length));
  return share.toFixed(3);
}
