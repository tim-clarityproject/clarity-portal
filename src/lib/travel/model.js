// The Travel plan's screens (M21 version 7.2; Phase 8b part B, steps 2 and
// 3): what a saved plan holds, how it becomes the engine's input (with its
// key moments, which are peak moments), the words every screen shows, and
// where the plan shows outside its own pages (Home's offer and card, the
// Daily plan). Pure: no React, no database. The engine is ./plan.js.

import { addDays, daysBetween, dayKeyWords, instantAt, offsetMinutes } from '../time/index.js';
import { makeTravelPlan, replanFrom } from './plan.js';
import { RULES } from './rules.js';
import { occurrences } from '../peakMoments/model.js';

export const TOOL_NAME = 'Travel plan';
export const PATH = '/travel-plan';
/** One time for the tile, Start's note and Home's offer (M21: "~3 minutes"). */
export const TIME = '~3 minutes';
export const SAVED_WORDS = 'Your plan is saved.';
export const HEADLINE = 'Do the steps that fit your days. Each one helps.';
export const NO_CAFFEINE = 'I don’t have caffeine';
export const CAFFEINE_AGAIN = 'Show caffeine steps again';
export const CAFFEINE_GONE = 'Caffeine steps removed from your plan.';
export const CAFFEINE_BACK = 'Caffeine steps are back.';
export const MEDICINES = 'This plan doesn’t cover medicines or supplements. Ask your GP or pharmacist about those.';
export const OFFER_GONE = 'We won’t ask again for this trip.';
/** A plan's name is the place, as My Plans lists it ("New York trip"). */
export const NAME_MAX = 120;

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isWhen = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------- what a plan keeps

/** A place as a flight keeps it: { key, code, name, city, zone }, or null. */
export function tidyPlace(p) {
  if (!p || typeof p !== 'object' || typeof p.zone !== 'string' || !/^[A-Za-z]+(\/[A-Za-z0-9_+-]+){1,2}$/.test(p.zone)) return null;
  const city = String(p.city || '').trim().slice(0, NAME_MAX);
  if (!city) return null;
  return { key: String(p.key || p.zone), code: typeof p.code === 'string' ? p.code : null, name: String(p.name || city).slice(0, NAME_MAX), city, zone: p.zone };
}

/** A flight as a plan keeps it: { id, from, to, leaves, lands } ('YYYY-MM-DDTHH:MM' on each end's own clock). */
export function tidyFlight(f, id = null) {
  const o = f && typeof f === 'object' ? f : {};
  return {
    id: typeof o.id === 'string' && o.id ? o.id : id,
    from: tidyPlace(o.from),
    to: tidyPlace(o.to),
    leaves: isWhen(o.leaves) ? o.leaves : '',
    lands: isWhen(o.lands) ? o.lands : '',
  };
}

export const emptyFlight = (id = null) => tidyFlight({}, id);

/** Usual sleep: the person's own, else the engine's 23:00 to 07:00. */
export function tidySleep(s) {
  return s && isTime(s.start) && isTime(s.end) && s.start !== s.end ? { start: s.start, end: s.end } : { ...RULES.usualSleep };
}

/**
 * A saved plan as the screens read it, whatever the device kept (an older
 * copy, a damaged one): never a blank screen. Null when it isn't a plan.
 */
export function tidyPlan(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.id !== 'string' || !p.id) return null;
  const times = p.momentTimes && typeof p.momentTimes === 'object' && !Array.isArray(p.momentTimes) ? p.momentTimes : {};
  const past = p.past && isDay(p.past.from) && Array.isArray(p.past.days) ? { from: p.past.from, days: p.past.days.filter((d) => d && isDay(d.date) && d.engine) } : null;
  return {
    ...p,
    title: String(p.title || '').trim().slice(0, NAME_MAX),
    flightOut: tidyFlight(p.flightOut),
    flightHome: tidyFlight(p.flightHome),
    momentIds: Array.isArray(p.momentIds) ? [...new Set(p.momentIds.filter((x) => typeof x === 'string' && x))] : [],
    momentTimes: Object.fromEntries(Object.entries(times).filter(([k, v]) => typeof k === 'string' && isTime(v))),
    usualSleep: tidySleep(p.usualSleep),
    noCaffeine: p.noCaffeine === true,
    past: past && past.days.length ? past : null,
    seen: typeof p.seen === 'string' ? p.seen : null,
  };
}

// ---------------------------------------------------------------- the flights

const dayOf = (when) => when.slice(0, 10);
const timeOf = (when) => when.slice(11, 16);

/** A flight for the engine. */
export function engineFlight(f) {
  return {
    departsOn: dayOf(f.leaves),
    departsAt: timeOf(f.leaves),
    fromCity: f.from.city,
    fromZone: f.from.zone,
    arrivesOn: dayOf(f.lands),
    arrivesAt: timeOf(f.lands),
    toCity: f.to.city,
    toZone: f.to.zone,
  };
}

const instantOf = (when, zone) => instantAt(dayOf(when), timeOf(when), zone);

/** What a flight still needs, as the calm line under it ("Choose when it leaves to carry on."), or null. */
export function flightProblem(f) {
  if (!f.from) return 'Choose where you’re flying from to carry on.';
  if (!f.to) return 'Choose where you’re flying to to carry on.';
  if (!f.leaves) return 'Choose when it leaves to carry on.';
  if (!f.lands) return 'Choose when it lands to carry on.';
  try {
    const leaves = instantOf(f.leaves, f.from.zone);
    const lands = instantOf(f.lands, f.to.zone);
    if (lands <= leaves) return 'It lands before it leaves. Check the times to carry on.';
    if (lands - leaves > 30 * 3600000) return 'That flight is over 30 hours. Check the days to carry on.';
  } catch {
    return 'That time doesn’t exist on that day. Check the times to carry on.';
  }
  return null;
}

/** The flight home needs the flight out first, and leaves after it lands. */
export function homeProblem(out, home) {
  const own = flightProblem(home);
  if (own) return own;
  if (flightProblem(out)) return null;
  if (instantOf(home.leaves, home.from.zone) <= instantOf(out.lands, out.to.zone)) return 'It leaves before your flight out lands. Check the days to carry on.';
  if (daysBetween(dayOf(out.leaves), dayOf(home.leaves)) > RULES.maxDays - 2 * RULES.preDays) return 'That trip is longer than a plan can cover. Check the days to carry on.';
  return null;
}

/** "Sun 8 Nov" with non-breaking spaces, so a date never splits across lines. */
export const dateWords = (day) => dayKeyWords(day).replace(/ /g, ' ');

/** "London to New York, Sun 8 Nov, 12:00" (M21's Check and Your trip). */
export function flightLine(f) {
  if (!f?.from || !f?.to || !f.leaves) return '';
  return `${f.from.city} to ${f.to.city}, ${dateWords(dayOf(f.leaves))}, ${timeOf(f.leaves)}`;
}

/** The flight home the flight out suggests: back the other way, its times still to choose. */
export function homeFrom(out, home) {
  return { ...home, from: home.from || out.to, to: home.to || out.from };
}

// ---------------------------------------------------------------- key moments (peak moments inside the trip)

/** The days a key moment can be on: from the day the flight out lands to the day the flight home leaves. */
export function tripDays(out, home) {
  if (!out?.lands || !home?.leaves) return [];
  const first = dayOf(out.lands);
  const last = dayOf(home.leaves);
  const n = daysBetween(first, last);
  if (n < 0 || n > RULES.maxDays) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(first, i));
}

/**
 * The peak moments that come round during the trip in the place it goes to
 * (or kept with no place), each once: [{ moment, on, endsOn }]. A moment in
 * another city on those days isn't this trip's.
 */
export function momentsInTrip(moments, out, home) {
  const days = tripDays(out, home);
  if (!days.length) return [];
  const seen = new Set();
  const here = (m) => !m.placeZone || !out.to || m.placeZone === out.to.zone || m.placeCity === out.to.city;
  return moments
    .filter(here)
    .flatMap((m) => occurrences(m, days[0], days[days.length - 1]))
    .filter((o) => (seen.has(o.moment.id) ? false : seen.add(o.moment.id)))
    .sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.moment.name.localeCompare(b.moment.name)));
}

/** "Tue 10 Nov at 09:00", or the day alone with no time. */
export const momentWhen = (on, at) => (at ? `${dateWords(on)} at ${at}` : dateWords(on));

/** Start times for a key moment (M21: 07:00 to 21:00, every 30 minutes). */
export const START_TIMES = Array.from({ length: 29 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Usual sleep's choices (M21: bedtime 20:00 to 02:00, wake time 04:30 to 10:00, every 15 minutes). */
function quarterHours(from, to) {
  const out = [];
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let m = fh * 60 + fm;
  let end = th * 60 + tm;
  if (end < m) end += 1440;
  for (; m <= end; m += 15) out.push(`${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return out;
}
export const BEDTIMES = quarterHours('20:00', '02:00');
export const WAKE_TIMES = quarterHours('04:30', '10:00');
export const sleepWords = (s) => `${s.start} to ${s.end}`;

/**
 * The plan's key moments for the engine: each linked peak moment's time in
 * the trip, in its own city's time (a moment kept "at home" is where the
 * trip goes), with the time of day the plan keeps for it.
 */
export function keyMomentsFor(plan, moments) {
  const out = plan.flightOut;
  const home = plan.flightHome;
  if (!out?.to || !home?.leaves) return [];
  const byId = new Map(moments.map((m) => [m.id, m]));
  const inTrip = new Map(momentsInTrip(moments.filter((m) => plan.momentIds.includes(m.id)), out, home).map((o) => [o.moment.id, o]));
  return plan.momentIds
    .map((id) => {
      const m = byId.get(id);
      const o = inTrip.get(id);
      if (!m || !o) return null;
      return {
        id,
        name: m.name,
        startsOn: o.on,
        endsOn: o.endsOn,
        at: plan.momentTimes[id] || null,
        city: m.placeCity || out.to.city,
        zone: m.placeZone || out.to.zone,
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------- the plan itself

/** The engine's input for a saved plan, or null while a flight is missing something. */
export function inputFor(plan, moments) {
  if (flightProblem(plan.flightOut) || homeProblem(plan.flightOut, plan.flightHome)) return null;
  return {
    flightOut: engineFlight(plan.flightOut),
    flightHome: engineFlight(plan.flightHome),
    keyMoments: keyMomentsFor(plan, moments),
    usualSleep: plan.usualSleep,
    noCaffeine: false, // "I don’t have caffeine" hides caffeine on screen (stepsShown): nothing else moves, and Undo is instant.
  };
}

/**
 * The whole plan as the screens show it. A plan edited once it was under
 * way keeps its days before that edit exactly as they were (`past`, M21:
 * "A change reworks the plan from today onwards").
 */
export function planFor(plan, moments) {
  const input = inputFor(plan, moments);
  if (!input) return null;
  try {
    if (plan.past?.days?.length) return replanFrom({ short: false, input, days: plan.past.days }, plan.past.from, {});
    return makeTravelPlan(input);
  } catch {
    return null;
  }
}

/**
 * The plan after an edit on `today` (a flight, a key moment, usual sleep):
 * a plan under way keeps every day before today; one not started yet is
 * simply made again. Returns the plan's new `past`.
 */
export function pastAfterEdit(before, today) {
  if (!before || before.short || !before.days?.length) return null;
  const kept = before.days.filter((d) => d.date < today);
  if (!kept.length) return null;
  return { from: today, days: kept };
}

/** What the plan was last made with, to tell when a peak moment moved elsewhere. */
export const seenOf = (input) => (input ? JSON.stringify(input.keyMoments) : null);

/** Every caffeine step goes while the person has none (M21: "removes every Caffeine row everywhere"). */
export const stepsShown = (steps, noCaffeine) => (noCaffeine ? steps.filter((s) => s.kind !== 'caffeine') : steps);

/** "Thu 5 to Mon 16 Nov", "Mon 30 Nov to Thu 3 Dec", "Tue 29 Dec 2026 to Fri 1 Jan 2027". */
export function spanWords(from, to) {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = dayKeyWords(from).split(' ');
  if (fy !== ty) return `${dayKeyWords(from, { year: true })} to ${dayKeyWords(to, { year: true })}`;
  if (fm !== tm) return `${a.join(' ')} to ${dayKeyWords(to)}`;
  return `${a[0]} ${a[1]} to ${dayKeyWords(to).split(' ')[0]} ${td} ${MONTHS[tm - 1]}`;
}

/** "17 to 19 Nov" (M21's Saved plans row). */
export function shortSpan(from, to) {
  const [, fm, fd] = from.split('-').map(Number);
  const [, tm, td] = to.split('-').map(Number);
  return fm === tm ? `${fd} to ${td} ${MONTHS[tm - 1]}` : `${fd} ${MONTHS[fm - 1]} to ${td} ${MONTHS[tm - 1]}`;
}

/** The plan's name, as My Plans and Saved plans list it: "New York trip". */
export const planTitle = (plan) => (plan.flightOut?.to?.city ? `${plan.flightOut.to.city} trip` : 'Your trip');

/** The plan's days in the order M21 lists them, each with its line (the key moment's on its day). */
export function dayLine(day, plan, moments = []) {
  const away = plan.away.city;
  const home = plan.home.city;
  const named = day.moments.map((id) => moments.find((m) => m.id === id)).filter(Boolean);
  if (named.length) return `${named[0].name} is today.`;
  const out = plan.input.flightOut.departsOn;
  if (day.phase === 'before' || day.phase === 'wait') {
    const n = daysBetween(day.date, out);
    return n === 1 ? 'You fly tomorrow.' : `You fly in ${n} days.`;
  }
  if (day.phase === 'out') return `You fly to ${away} today.`;
  if (day.phase === 'away') {
    // The first day there (M21: "You’re in New York."), then how near the body clock is.
    const i = plan.days.findIndex((d) => d.date === day.date);
    if (i > 0 && plan.days[i - 1].phase === 'out') return `You’re in ${away}.`;
    if (day.percent >= 100) return `Your body clock is on ${away} time.`;
    if (day.percent >= 80) return `Your body clock is nearly on ${away} time.`;
    return `You’re in ${away}.`;
  }
  if (day.phase === 'turn') return `You start moving back to ${home} time.`;
  if (day.phase === 'flyHome') return 'You fly home today.';
  if (day.back >= 100 || day.date === plan.to) return 'You’re back to your usual times.';
  const first = plan.days.find((d) => d.phase === 'back');
  if (first && first.date === day.date) return `You’re back in ${home}.`;
  if (day.back >= 80) return `You’re nearly back on ${home} time.`;
  return 'You’re settling back in.';
}

/** "Times are New York time." under a day's title, on a day away in one place (M21; never at home). */
export function zoneNote(day, plan) {
  if (day.twoZones || !day.zone || day.zone === plan.home.zone) return null;
  return `Times are ${day.city} time.`;
}

/** The chart's label for the read-out, and the markers of a day (numbered key moments). */
export function readoutLines(plan, index) {
  const day = plan.days[index];
  if (!day) return null;
  const markers = plan.chart.markers.filter((m) => m.dayIndex === index);
  return {
    moments: markers.map((m) => ({ number: m.number, words: m.time ? `${m.name}, ${m.time}` : m.name })),
    clock: day.readout,
  };
}

/** The chart's whole sentence for a screen reader (M21's aria-label). */
export function chartSentence(plan) {
  const away = plan.away.city;
  const home = plan.home.city;
  const deepest = plan.days.reduce((best, d) => (Math.abs(d.clock) > Math.abs(best.clock) ? d : best), plan.days[0]);
  const gap = Math.abs(Math.abs(plan.difference) - Math.abs(deepest.clock));
  const near = gap < 0.75 ? `reaching ${away} time` : `reaching about ${Math.max(1, Math.round(gap))} hour${Math.round(gap) > 1 ? 's' : ''} from it`;
  return `Your body clock moves from ${home} time towards ${away} time, ${near} by ${dayKeyWords(deepest.date, { long: true })}, then moves back to ${home} time by ${dayKeyWords(plan.to, { long: true })}. Use the arrow keys to read each day.`;
}

// ---------------------------------------------------------------- why these steps help (the side panel)

const WHY = {
  light: { term: 'Light', meaning: ['Light is the strongest signal to your body clock.', 'At the right time, it moves your clock towards the new time zone.', 'At the wrong time, it pulls it back, so the plan times it for you.'] },
  caffeine: { term: 'Caffeine', meaning: ['Caffeine can still cut your sleep 9 hours later.', 'The plan times your last caffeine 9 hours before bed.'] },
  sleep: { term: 'Sleep', meaning: ['The plan moves your sleep gradually, about an hour a day.', 'Getting up at the planned time each day helps your body clock settle.'] },
  moment: { term: 'Key moment', meaning: ['The plan times your light and caffeine so you’re alert for it.'] },
};

/** "Why these steps help" for a day: Light, Caffeine and Sleep (and a key moment), in the order they first appear. */
export function whyFor(steps, noCaffeine) {
  const kinds = [];
  for (const s of stepsShown(steps, noCaffeine)) if (!kinds.includes(s.kind)) kinds.push(s.kind);
  for (const k of ['light', 'caffeine', 'sleep']) if (!kinds.includes(k) && !(k === 'caffeine' && noCaffeine)) kinds.push(k);
  return { title: 'Why these steps help', terms: kinds.map((k) => WHY[k]).filter(Boolean), after: [MEDICINES] };
}

/** The short trip's panel (M21 WHYS): "Staying on London time" first, then Light, Sleep and Caffeine. */
export function whyShort(plan, noCaffeine) {
  const home = plan.home.city;
  const away = plan.away.city;
  const h = Math.abs(plan.difference);
  const hours = `${h === 1 ? 'an hour' : `${Number.isInteger(h) ? h : h.toFixed(1)} hours`}`;
  const staying = {
    term: `Staying on ${home} time`,
    meaning: plan.reason === 'difference'
      ? ['Your body clock moves about an hour a day.', `${away} is only ${hours} ${plan.difference > 0 ? 'ahead' : 'behind'}, so there’s little to gain by moving.`, `Staying on ${home} time means your body clock doesn’t have to move twice, out and back.`]
      : ['Your body clock moves about an hour a day.', `${away} is ${hours} ${plan.difference > 0 ? 'ahead' : 'behind'}, so catching up would take most of your trip.`, `Staying on ${home} time means your body clock doesn’t have to move twice, out and back.`],
  };
  const terms = [staying,
    { term: 'Sleep', meaning: [`Sleeping at your usual ${home} times keeps your body clock where it is.`, 'So there’s nothing to recover from when you’re home.'] },
    { term: 'Light', meaning: ['Light is the strongest signal to your body clock.', plan.difference > 0 ? `Daylight from midday, not first thing, keeps your clock on ${home} time.` : `Daylight early in your day, and low light in the evening, keeps your clock on ${home} time.`] },
  ];
  if (!noCaffeine) terms.push({ term: 'Caffeine', meaning: ['Caffeine can still cut your sleep 9 hours later.', 'So your last one is 9 hours before you go to bed.'] });
  return { title: 'Why these steps help', terms, after: [MEDICINES] };
}

// ---------------------------------------------------------------- outside the plan's pages

/** The plan a day belongs to, and that day: { plan (saved), view (planFor), day, steps } for Home and the Daily plan. */
export function travelToday(plans, moments, today) {
  for (const saved of plans) {
    const view = planFor(saved, moments);
    if (!view) continue;
    if (view.short) {
      if (view.keyDay?.date === today) return { plan: saved, view, day: { date: today, title: view.keyDay.title, line: `You’re in ${view.away.city}.` }, steps: tickable(stepsShown(view.keyDay.steps, saved.noCaffeine)) };
      continue;
    }
    const day = view.days.find((d) => d.date === today);
    if (day) return { plan: saved, view, day: { ...day, line: dayLine(day, view, moments) }, steps: tickable(stepsShown(day.steps, saved.noCaffeine)) };
  }
  return null;
}

/** Home and the Daily plan show the day's travel steps only (Light, Caffeine, Sleep), never the key moments: those are already on the day. */
const tickable = (steps) => steps.filter((s) => s.kind !== 'moment');

/** A step's own key for its private tick ("light", "caffeine", "sleep"). */
export const tickKey = (step) => (step.kind === 'moment' ? `moment:${step.momentId}` : step.kind);

/**
 * Home's offer (M21 "Home, the week before"): a peak moment 1 to 7 days
 * away whose place keeps another time than home's, and no plan for it yet.
 * Each occurrence is offered once ({ key }). The nearest comes first.
 */
export function travelOffer(moments, plans, today, homeZone) {
  return travelOffers(moments, plans, today, homeZone)[0] || null;
}

/** Every trip Home could offer now, nearest first (Home shows the first not yet taken or stopped). */
export function travelOffers(moments, plans, today, homeZone) {
  const planned = new Set(plans.flatMap((p) => p.momentIds));
  const found = [];
  const ahead = moments
    .filter((m) => m.placeZone && !planned.has(m.id))
    .flatMap((m) => occurrences(m, addDays(today, 1), addDays(today, 7)))
    .filter((o) => o.on > today);
  for (const o of ahead.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))) {
    try {
      const at = instantAt(o.on, '12:00', o.moment.placeZone);
      if (offsetMinutes(at, o.moment.placeZone) === offsetMinutes(at, homeZone)) continue;
    } catch {
      continue;
    }
    found.push({ key: `travel-offer:${o.key}`, moment: o.moment, on: o.on, city: o.moment.placeCity, action: `Plan my ${o.moment.placeCity} trip` });
  }
  return found;
}

/** The away flag a coach may read (048's travel_away): where, when and the hours apart. Never the plan or its ticks. */
export function awayOf(plan, view) {
  if (!view) return null;
  return {
    city: view.away.city,
    zone: view.away.zone,
    startsOn: plan.flightOut.lands.slice(0, 10),
    endsOn: plan.flightHome.leaves.slice(0, 10),
    hoursApart: Math.round(view.difference * 100) / 100,
  };
}

// ---------------------------------------------------------------- what the device keeps (store.js)

/** What the device keeps, read so that nothing kept by another version stops a page. */
export function tidyState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { plans: {}, ticks: {} };
  const plans = {};
  for (const [id, p] of Object.entries(raw.plans || {})) {
    const t = tidyPlan(p);
    if (t && t.id === id) plans[id] = { ...t, sent: p.sent === true, gone: p.gone === true };
  }
  const ticks = {};
  for (const [planId, days] of Object.entries(raw.ticks && typeof raw.ticks === 'object' ? raw.ticks : {})) {
    if (!days || typeof days !== 'object') continue;
    ticks[planId] = {};
    for (const [day, steps] of Object.entries(days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !steps || typeof steps !== 'object') continue;
      ticks[planId][day] = Object.fromEntries(Object.entries(steps).filter(([k, v]) => /^[a-z_]{1,24}(:[0-9a-f-]{1,40})?$/.test(k) && v === true));
    }
  }
  return { plans, ticks };
}

