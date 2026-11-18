// The Travel plan's rules, in one place (Phase 8b, M21 version 7.2; Tim,
// 16 and 17 Nov). docs/travel-plan-method.md says what each one is and why,
// with the sources. Every number the engine uses is here.

export const RULES = Object.freeze({
  /** The body clock starts moving this many days before the flight out. */
  preDays: 3,
  /** Before the flight out, the sleep plan moves this much a day (the first night half of it). */
  preRate: 1,
  /** Most the body clock moves in a day going later (flying west). */
  westRate: 1.5,
  /** Most the body clock moves in a day going earlier (flying east). */
  eastRate: 1,
  /** Each day the body clock closes this share of the gap to where the plan's sleep and light put it. */
  follow: 0.5,
  /** The plan's bedtime is never more than this many hours from where the body clock is. */
  sleepWindow: 1.5,
  /** Back home, within this many hours of home time counts as back. */
  there: 0.5,
  /** The day before the flight home, sleep moves this many hours towards home. */
  turnHours: 1,
  /** The last caffeine is this many hours before that night's bedtime. */
  caffeineHours: 9,
  /** Never bright light in this many hours before the body's usual wake time. */
  noLightBeforeWake: 3,
  /** Morning bright light starts this long after the body's own wake time. */
  lightAfterBodyWake: 1,
  /** A morning bright light window lasts this many hours. */
  lightHours: 4,
  /** Going later away: low light until this long after the body's wake time... */
  lowAfterBodyWake: 3.5,
  /** ...and daylight from this long after it, into the evening. */
  daylightAfterBodyWake: 9,
  /** At home, going later: bright lights from this long before the usual bedtime. */
  eveningBeforeUsualBed: 3.5,
  /** On the first day the clock moves back, dim the lights this long before bed. */
  dimBeforeBed: 2.5,
  /** A night is spent on board when a bedtime falls from this many hours before take-off until this many before landing. */
  boardWindow: 3,
  /** Asleep on board this long after take-off. */
  sleepAfterTakeOff: 1,
  /** Out of the airport this long after landing. */
  afterLanding: 0.5,
  /** Bed is never sooner than this long after landing... */
  bedAfterLanding: 1,
  /** ...and landing up to this long after the planned bedtime moves bed later; landing later than that, the day has no night (one long day). */
  lateBedHours: 4,
  /** Staying on home time: daylight from this long after the body's wake time. */
  shortDaylightAfterWake: 2,
  /** Staying on home time going west: daylight never before this on the local clock (earlier is still night there). */
  shortFirstLight: '07:00',
  /** A short trip west: getting up never before this local time, and lights out never after the next (sleep moves later just enough; Tim, 18 Nov). */
  shortWakeFrom: '05:00',
  shortBedBy: '01:00',
  /** Staying on home time: low light from this long before bedtime. */
  shortLowBeforeBed: 4,
  /** A trip this many nights away or fewer is a short trip. */
  shortNights: 2,
  /** A trip this many hours' difference or less is a short trip. */
  shortHours: 2,
  /** Times are given to the nearest this many minutes. */
  roundMinutes: 30,
  /** Usual sleep when there's no check-in (the brief; M21's example person's check-in says 22:30 to 06:30). */
  usualSleep: Object.freeze({ start: '23:00', end: '07:00' }),
  /** The plan never runs longer than this many days. */
  maxDays: 60,
});

export const HOUR = 3600000;

/** 'HH:MM' as hours (22.5). */
export function hoursOf(time) {
  const m = typeof time === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) : null;
  if (!m) throw new Error(`"${String(time).slice(0, 40)}" is not a time of day (for example 07:30).`);
  return Number(m[1]) + Number(m[2]) / 60;
}

/** Hours as 'HH:MM' on a 24-hour clock, wrapped into the day. */
export function timeOf(hours) {
  const minutes = ((Math.round(hours * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A difference in hours wrapped to more than -12 and at most 12. */
export function wrapHours(h) {
  let x = h % 24;
  if (x > 12) x -= 24;
  if (x <= -12) x += 24;
  return x;
}

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Nearest 5%, as M21's read-out rounds it. */
export const nearestFive = (share) => Math.round(clamp(share, 0, 1) * 20) * 5;
