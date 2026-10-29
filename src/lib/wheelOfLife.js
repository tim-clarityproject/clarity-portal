import { getLocalDateKey } from './dateFormatter.js';

// Wheel of Life (wheel-of-life-spec.md sections 1, 3, 3b, 4 and 6).
// Pure logic only: no Supabase, no UI. The maths is ported from the
// approved mock-up's script (wheel-of-life.html: avg, setPreset,
// inRange, the stats, the table, targets, delta, wrapLab and QN), keyed
// by area key instead of the mock-up's array positions.
//
// Shapes used throughout:
//   Area     { key, kind: 'standard'|'own', label, active, sortOrder,
//              target, targetUpdatedAt } - see areaFromRow
//   Check-in { id, checkinAt, date: 'YYYY-MM-DD', scores: { key: 0-10 },
//              areas: [{ key, label }], focusAreaKey, focusNote }
//
// Worked example used in the checks below (the mock-up's example data):
// ten standard areas, check-ins on 12 Jan, 20 Mar, 8 May, 2 Jul, 10 Sep
// and 15 Oct 2026, scored in wheel order:
//   2026-05-08  [7,5,6,6,4,6,5,7,5,6]
//   2026-07-02  [7,6,6,7,4,7,5,7,5,6]
//   2026-09-10  [8,6,7,7,4,7,4,7,6,7]
//   2026-10-15  [8,6,7,8,5,7,4,8,6,7]
// with targets [8,7,8,8,7,7,5,7,6,7].

/**
 * The ten standard areas, in wheel order. One full name per area, used
 * everywhere (never shortened); the question word for word.
 * @type {ReadonlyArray<{ key: string, name: string, question: string }>}
 */
export const STANDARD_AREAS = Object.freeze([
  { key: 'career', name: 'Career / Work', question: 'On a scale of 0–10, how satisfied are you with your career right now?' },
  { key: 'financial', name: 'Financial / Money', question: 'On a scale of 0–10, how satisfied are you with your financial situation right now?' },
  { key: 'health', name: 'Health / Fitness', question: 'On a scale of 0–10, how satisfied are you with your physical health and energy levels right now?' },
  { key: 'relationships', name: 'Relationships / Family', question: 'On a scale of 0–10, how satisfied are you with the quality of your close relationships and family life right now?' },
  { key: 'romance', name: 'Romance / Partner', question: 'On a scale of 0–10, how satisfied are you with your romantic relationship (or your dating life, if single) right now?' },
  { key: 'growth', name: 'Personal Growth / Learning', question: 'On a scale of 0–10, how satisfied are you with how much you’re learning and developing as a person right now?' },
  { key: 'fun', name: 'Fun / Recreation', question: 'On a scale of 0–10, how satisfied are you with the amount of fun and leisure in your life right now?' },
  { key: 'home', name: 'Physical Environment / Home', question: 'On a scale of 0–10, how satisfied are you with your home and physical surroundings right now?' },
  { key: 'contribution', name: 'Contribution / Community', question: 'On a scale of 0–10, how satisfied are you with your sense of contribution to others or your community right now?' },
  { key: 'meaning', name: 'Purpose / Meaning', question: 'On a scale of 0–10, how satisfied are you with your sense of meaning or purpose right now?' },
].map((a) => Object.freeze(a)));

const STANDARD_BY_KEY = Object.fromEntries(STANDARD_AREAS.map((a, i) => [a.key, { ...a, index: i }]));

/** Own-area names are 1 to 24 characters once trimmed (spec 1.2). */
export const OWN_NAME_MAX = 24;
/** Check-in note limits (spec 2.2). */
export const NOTE_MAX = 1000;
export const FOCUS_NOTE_MAX = 500;
/** Own areas are numbered from here upwards, in the order added (spec 2.1). */
export const OWN_SORT_START = 100;
/** Chart styles saved in wheel_of_life_settings; no row means 'sectional'. */
export const CHART_STYLES = Object.freeze(['sectional', 'radar', 'delta']);
export const DEFAULT_CHART_STYLE = 'sectional';
/** Date-range presets, in the order the pills show (spec 6). */
export const RANGE_PRESETS = Object.freeze([
  { key: '3m', label: '3 months', months: 3 },
  { key: '6m', label: '6 months', months: 6 },
  { key: '12m', label: '12 months', months: 12 },
  { key: 'all', label: 'All', months: null },
]);
export const DEFAULT_PRESET = '6m';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The true minus sign, as the mock-up shows drops ("−1").
const MINUS = '−';

/**
 * Is this a standard area key?
 * @param {string} key
 * @returns {boolean}
 */
export function isStandardKey(key) {
  return Object.prototype.hasOwnProperty.call(STANDARD_BY_KEY, key);
}

/**
 * Turns a wheel_of_life_areas row into the Area shape used here.
 * @param {object} row - a database row
 * @returns {{ key: string, kind: string, label: string|null, active: boolean, sortOrder: number, target: number|null, targetUpdatedAt: string|null }}
 */
export function areaFromRow(row) {
  return {
    key: row.area_key,
    kind: row.kind,
    label: row.label ?? null,
    active: row.active !== false,
    sortOrder: row.sort_order ?? 0,
    target: row.target ?? null,
    targetUpdatedAt: row.target_updated_at ?? null,
  };
}

/**
 * The one full name of an area. Standard areas take it from STANDARD_AREAS
 * (so a wording change in code applies everywhere, old check-ins included);
 * own areas, and areas from a check-in's snapshot, use their label.
 * @param {{ key: string, label?: string|null }} area
 * @returns {string}
 * @example areaName({ key: 'home' }) // 'Physical Environment / Home'
 * @example areaName({ key: 'own_ab12', label: 'Travel' }) // 'Travel'
 */
export function areaName(area) {
  if (!area) return '';
  const std = STANDARD_BY_KEY[area.key];
  if (std) return std.name;
  return area.label || '';
}

/**
 * The question for an area. Standard: word for word. Own: generated from
 * the name exactly as the mock-up's QN does - the first letter is
 * lower-cased unless the second letter is a capital.
 * @param {{ key: string, label?: string|null }} area
 * @returns {string}
 * @example questionFor({ key: 'own_x', label: 'Travel' })
 *   // 'On a scale of 0–10, how satisfied are you with travel in your life right now?'
 * @example questionFor({ key: 'own_y', label: 'NHS work' })
 *   // 'On a scale of 0–10, how satisfied are you with NHS work in your life right now?'
 */
export function questionFor(area) {
  const std = area && STANDARD_BY_KEY[area.key];
  if (std) return std.question;
  const n = areaName(area);
  const l = n.length > 1 && n[1] === n[1].toLowerCase() ? n[0].toLowerCase() + n.slice(1) : n;
  return `On a scale of 0–10, how satisfied are you with ${l} in your life right now?`;
}

/**
 * Splits a name into lines for the labels around the wheel, breaking after
 * " /" first, then between words: the mock-up's wrapLab, line for line.
 * Desktop uses max 18, phone 12.
 * @param {string} t - the area's full name
 * @param {number} max - longest line, in characters
 * @returns {string[]}
 * @example wrapLabel('Physical Environment / Home', 18) // ['Physical', 'Environment /', 'Home']
 * @example wrapLabel('Career / Work', 18) // ['Career / Work']
 * @example wrapLabel('Career / Work', 12) // ['Career /', 'Work']
 */
export function wrapLabel(t, max) {
  if (t.length <= max) return [t];
  const parts = t.split(' / ');
  const out = [];
  parts.forEach((p, k) => {
    const w = p.split(' ');
    if (k < parts.length - 1) w[w.length - 1] += ' /';
    let line = '';
    w.forEach((x) => {
      if (!line) line = x;
      else if ((line + ' ' + x).length <= max) line += ' ' + x;
      else { out.push(line); line = x; }
    });
    if (line) out.push(line);
  });
  return out;
}

/**
 * A new, never-changing key for an own area: "own_" and a random id with
 * no hyphens (crypto.randomUUID, with a getRandomValues / Math.random
 * fallback for older browsers).
 * @returns {string} e.g. 'own_3f2b9c0e1d4a4b6c8e7f0a1b2c3d4e5f'
 */
export function makeOwnKey() {
  let id = '';
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      id = globalThis.crypto.randomUUID().replace(/-/g, '');
    } else if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    id = '';
  }
  if (!id) {
    for (let i = 0; i < 32; i += 1) id += Math.floor(Math.random() * 16).toString(16);
  }
  return `own_${id}`;
}

/**
 * Checks a typed own-area name (spec 1.2): 1 to 24 characters once trimmed.
 * @param {string} name
 * @returns {string|null} a message to show, or null when the name is fine
 */
export function validateOwnName(name) {
  const t = (name || '').trim();
  if (!t) return 'Type a name for your area first.';
  if (t.length > OWN_NAME_MAX) return `Keep the name to ${OWN_NAME_MAX} characters or fewer.`;
  return null;
}

/**
 * The duplicate rule for a new own area (spec 1.2). Compares the trimmed
 * name case-insensitively with the name of every ACTIVE area; if none
 * matches, looks for a REMOVED area with that name, standard or own, which
 * is restored instead of adding a new one (so its history is kept).
 * @param {string} name
 * @param {Array<{ key: string, kind: string, label: string|null, active: boolean }>} areas - every area, active and removed
 * @returns {{ duplicate: object|null, restore: object|null, message: string|null }}
 *   duplicate: the active area it matches ("You already have an area called <name>.")
 *   restore: the removed area to switch back on ("<name> is back on your wheel.")
 * @example isDuplicateName('career / work', areasWithCareerRemoved).restore.key // 'career'
 */
export function isDuplicateName(name, areas) {
  const t = (name || '').trim().toLowerCase();
  const list = areas || [];
  const duplicate = list.find((a) => a.active && areaName(a).toLowerCase() === t) || null;
  if (duplicate) {
    return { duplicate, restore: null, message: `You already have an area called ${(name || '').trim()}.` };
  }
  const restore = list.find((a) => !a.active && areaName(a).toLowerCase() === t) || null;
  return { duplicate: null, restore, message: restore ? `${areaName(restore)} is back on your wheel.` : null };
}

/**
 * Areas in wheel order: standard in table order, then own areas in the
 * order added (spec 1.3).
 * @param {object[]} areas
 * @returns {object[]} a new, sorted array
 */
export function sortAreas(areas) {
  return [...(areas || [])].sort((x, y) => (x.sortOrder - y.sortOrder) || (wheelIndex(x) - wheelIndex(y)));
}

function wheelIndex(area) {
  const std = STANDARD_BY_KEY[area.key];
  return std ? std.index : OWN_SORT_START;
}

/**
 * The areas on the wheel now, in wheel order.
 * @param {object[]} areas
 * @returns {object[]}
 */
export function activeAreas(areas) {
  return sortAreas(areas).filter((a) => a.active);
}

/**
 * Names for the "Not on your wheel: <labels>. Past scores are kept." line.
 * @param {object[]} areas
 * @returns {string[]} empty when nothing has been removed
 */
export function removedAreaNames(areas) {
  return sortAreas(areas).filter((a) => !a.active).map(areaName);
}

/**
 * The next sort_order for a new own area: 100 upwards in the order added.
 * @param {object[]} areas - every area, active and removed
 * @returns {number}
 */
export function nextOwnSortOrder(areas) {
  const own = (areas || []).filter((a) => a.kind === 'own').map((a) => a.sortOrder);
  return Math.max(OWN_SORT_START - 1, ...own) + 1;
}

/**
 * Has anything been removed or added? ("Go back to the ten standard areas"
 * shows only then.)
 * @param {object[]} areas
 * @returns {boolean}
 */
export function differsFromStandard(areas) {
  return (areas || []).some((a) => a.kind === 'own' || !a.active);
}

// ---------------------------------------------------------------- dates

/**
 * "15 Oct 2026" from a 'YYYY-MM-DD' date key, or "15 Oct" with withYear
 * false (the mock-up's fd). For check-in dates only: saved timestamps go
 * through dateFormatter.js.
 * @param {string} dateKey
 * @param {boolean} [withYear=true]
 * @returns {string}
 * @example formatCheckinDate('2026-10-15') // '15 Oct 2026'
 * @example formatCheckinDate('2026-05-08', false) // '8 May'
 */
export function formatCheckinDate(dateKey, withYear = true) {
  if (!dateKey) return '';
  const p = String(dateKey).split('-');
  return `${+p[2]} ${MON[+p[1] - 1]}${withYear === false ? '' : ` ${p[0]}`}`;
}

/**
 * A date key a number of months before another, as the mock-up's setPreset
 * does it (midday, then setMonth, so 31 Aug less 6 months rolls on to
 * 3 Mar, exactly as the mock-up). Built with getLocalDateKey, never
 * toISOString.
 * @param {string} dateKey
 * @param {number} months
 * @returns {string}
 * @example monthsBefore('2026-10-15', 6) // '2026-04-15'
 */
export function monthsBefore(dateKey, months) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setMonth(d.getMonth() - months);
  return getLocalDateKey(d);
}

// ---------------------------------------------------------------- check-ins

/**
 * Check-ins oldest first (by date, then by the moment they were saved).
 * @param {object[]} checkins
 * @returns {object[]} a new array
 */
export function sortOldestFirst(checkins) {
  return [...(checkins || [])].sort((x, y) => {
    if (x.date !== y.date) return x.date < y.date ? -1 : 1;
    return timeOf(x) - timeOf(y);
  });
}

function timeOf(c) {
  const t = c.checkinAt instanceof Date ? c.checkinAt.getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/**
 * A check-in's score for one area, or null when it has none (the area was
 * added later, or removed before it).
 * @param {object} checkin
 * @param {string} key
 * @returns {number|null}
 */
export function scoreOf(checkin, key) {
  const v = checkin && checkin.scores ? checkin.scores[key] : undefined;
  return typeof v === 'number' ? v : null;
}

/**
 * The mean of the numbers given, ignoring missing ones (the mock-up's avg).
 * Returns 0 when there are none, as the mock-up does.
 * @param {Array<number|null|undefined>} a
 * @returns {number}
 * @example average([7, 5, 6, 6, 4, 6, 5, 7, 5, 6]) // 5.7
 * @example average([8, null, 6]) // 7
 */
export function average(a) {
  const v = (a || []).filter((x) => x != null);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0;
}

/**
 * One decimal place, as every average is shown ("6.6").
 * @param {number} n
 * @returns {string}
 */
export function oneDecimal(n) {
  return n.toFixed(1);
}

/**
 * The average of a check-in over the areas on the wheel NOW, ignoring
 * areas it has no score for ("6.6 avg" in the All check-ins list).
 * @param {object} checkin
 * @param {object[]} areas - the active areas
 * @returns {number}
 */
export function checkinAverage(checkin, areas) {
  return average(areas.map((a) => scoreOf(checkin, a.key)));
}

/**
 * The From and To dates for a preset, counted back from the NEWEST
 * check-in's date; All starts at the first check-in (the mock-up's
 * setPreset).
 * @param {'3m'|'6m'|'12m'|'all'} presetKey
 * @param {object[]} checkins - any order
 * @returns {{ preset: string, from: string, to: string }|null} null when there are no check-ins
 * @example presetRange('6m', example) // { preset: '6m', from: '2026-04-15', to: '2026-10-15' }
 * @example presetRange('all', example) // { preset: 'all', from: '2026-01-12', to: '2026-10-15' }
 */
export function presetRange(presetKey, checkins) {
  const list = sortOldestFirst(checkins);
  if (!list.length) return null;
  const to = list[list.length - 1].date;
  const p = RANGE_PRESETS.find((x) => x.key === presetKey) || RANGE_PRESETS.find((x) => x.key === DEFAULT_PRESET);
  const from = p.months == null ? list[0].date : monthsBefore(to, p.months);
  return { preset: p.key, from, to };
}

/**
 * The range for /wheel-of-life/results?to=YYYY-MM-DD (from My Reviews):
 * To is that date, From is 6 months before it, no preset pill.
 * @param {string} toKey
 * @returns {{ preset: string, from: string, to: string }}
 */
export function rangeEndingOn(toKey) {
  return { preset: '', from: monthsBefore(toKey, 6), to: toKey };
}

/**
 * The check-ins between From and To, both included, oldest first (the
 * mock-up's inRange).
 * @param {object[]} checkins
 * @param {string} from - 'YYYY-MM-DD'
 * @param {string} to - 'YYYY-MM-DD'
 * @returns {object[]}
 * @example inRange(example, '2026-04-15', '2026-10-15').map((c) => c.date)
 *   // ['2026-05-08', '2026-07-02', '2026-09-10', '2026-10-15']
 */
export function inRange(checkins, from, to) {
  return sortOldestFirst(checkins).filter((c) => c.date >= from && c.date <= to);
}

/**
 * Is this check-in inside the range? (Faded in the All check-ins list when not.)
 * @param {object} checkin
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isInRange(checkin, from, to) {
  return checkin.date >= from && checkin.date <= to;
}

/**
 * The newest saved check-in that has a score for this area, for the rating
 * screen's grey dot and "Last check-in, <date>: <score>" line. Null for an
 * area with no history (no dot).
 * @param {object[]} checkins
 * @param {string} key
 * @returns {{ date: string, score: number }|null}
 */
export function lastScoreFor(checkins, key) {
  const list = sortOldestFirst(checkins);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const s = scoreOf(list[i], key);
    if (s != null) return { date: list[i].date, score: s };
  }
  return null;
}

/**
 * The newest check-in overall (Start screen's "Last check-in"; the Targets
 * screen's "Latest" scores).
 * @param {object[]} checkins
 * @returns {object|null}
 */
export function newestCheckin(checkins) {
  const list = sortOldestFirst(checkins);
  return list.length ? list[list.length - 1] : null;
}

// ---------------------------------------------------------------- views

/**
 * Which drawing to show (spec 6, the mock-up's line "few ... one ..."):
 * Radar needs three or more areas, Delta needs two or more check-ins in
 * the range; otherwise Sectional is drawn.
 * @param {string} style - the saved style
 * @param {number} areaCount - areas on the wheel now
 * @param {number} rangeCount - check-ins in the range
 * @returns {{ style: string, radarAllowed: boolean, deltaAllowed: boolean }}
 */
export function effectiveChartStyle(style, areaCount, rangeCount) {
  const radarAllowed = areaCount >= 3;
  const deltaAllowed = rangeCount >= 2;
  let s = CHART_STYLES.includes(style) ? style : DEFAULT_CHART_STYLE;
  if (s === 'radar' && !radarAllowed) s = 'sectional';
  if (s === 'delta' && !deltaAllowed) s = 'sectional';
  return { style: s, radarAllowed, deltaAllowed };
}

/**
 * The rating screen's mini wheel uses Sectional unless Radar is chosen
 * (and possible) - the mock-up's chart().
 * @param {string} style
 * @param {number} areaCount
 * @returns {'sectional'|'radar'}
 */
export function miniWheelStyle(style, areaCount) {
  return style === 'radar' && areaCount >= 3 ? 'radar' : 'sectional';
}

/**
 * Change text as the mock-up shows it: "+2", "−1", "0", or "New".
 * @param {number|null} d - null for an area with no start score
 * @returns {string}
 */
export function changeText(d) {
  if (d == null) return 'New';
  if (d > 0) return `+${d}`;
  if (d < 0) return `${MINUS}${Math.abs(d)}`;
  return '0';
}

/**
 * CSS-style class for a change, as the mock-up names them.
 * @param {number|null} d
 * @returns {'nw'|'up'|'dn'|'eq'}
 */
export function changeClass(d) {
  if (d == null) return 'nw';
  if (d > 0) return 'up';
  if (d < 0) return 'dn';
  return 'eq';
}

/**
 * Target status for one area (spec 3b): on target when the latest score is
 * at or above the target, otherwise "N below". Null when there is no target
 * or no latest score. (The mock-up would print "NaN below" / "null" for an
 * area with a target but no latest score; that case is left blank here.)
 * @param {number|null} latest
 * @param {number|null} target
 * @returns {{ met: boolean, below: number, text: string }|null}
 * @example targetStatus(5, 7) // { met: false, below: 2, text: '2 below' }
 * @example targetStatus(8, 7) // { met: true, below: 0, text: 'On target' }
 */
export function targetStatus(latest, target) {
  if (target == null || latest == null) return null;
  if (latest >= target) return { met: true, below: 0, text: 'On target' };
  return { met: false, below: target - latest, text: `${target - latest} below` };
}

/**
 * The Targets screen's − / + stepper (the mock-up's tp/tm): the first tap
 * starts from the latest score (or 5 with no latest score) plus or minus
 * one; after that it moves the target by one. Always 0 to 10.
 * @param {number|null} current - the target being edited, or null
 * @param {number|null} latest - the latest score for the area
 * @param {1|-1} dir
 * @returns {number}
 * @example stepTarget(null, 4, 1) // 5
 * @example stepTarget(10, 9, 1) // 10
 */
export function stepTarget(current, latest, dir) {
  const base = current == null ? (latest == null ? 5 : latest) : current;
  return Math.max(0, Math.min(10, base + dir));
}

/**
 * The summary numbers for the one-pager, over the areas on the wheel NOW
 * (the mock-up's stats block, ported). Averages ignore missing scores;
 * rises and drops ignore areas with no start score.
 *
 * One check-in in range: Average, Highest, Lowest, and Areas at 7+.
 * Two or more: Average (and its move from the first), Biggest rise,
 * Biggest drop, Lowest now. When any area with a latest score has a
 * target, the fourth number becomes Furthest from target (or All met).
 * Ties go to the first area in wheel order, as the mock-up's indexOf.
 *
 * Worked check (example data, 6 months to 15 Oct 2026 = 8 May to 15 Oct):
 *   average 6.6, up 0.9 from 5.7; biggest rise +2 Relationships / Family;
 *   biggest drop −1 Fun / Recreation; furthest from target 2 below,
 *   Romance / Partner, 6 of 10 on target; showTargetsCard false.
 * With only 15 Oct in range: average 6.6, highest 8 Career / Work,
 *   lowest 4 Fun / Recreation, areas at 7+ 6 of 10 (without targets).
 *
 * @param {object[]} range - the check-ins in the range, oldest first (see inRange)
 * @param {object[]} areas - the active areas, in wheel order (each with .target)
 * @returns {null|{
 *   one: boolean,
 *   average: number, averageFrom: number|null, averageMove: number|null, averageUp: boolean|null,
 *   highest: { score: number, area: object }|null,
 *   lowest: { score: number, area: object }|null,
 *   atSevenPlus: { count: number, of: number },
 *   biggestRise: { change: number, area: object }|null,
 *   biggestDrop: { change: number, area: object }|null,
 *   targets: null|{ allMet: boolean, gap: number, area: object|null, onTarget: number, withTarget: number },
 *   showTargetsCard: boolean
 * }} null when the range is empty
 */
export function computeStats(range, areas) {
  if (!range || !range.length) return null;
  const first = range[0];
  const last = range[range.length - 1];
  const one = range.length === 1;
  const F = areas.map((a) => scoreOf(first, a.key));
  const L = areas.map((a) => scoreOf(last, a.key));
  const T = areas.map((a) => (a.target == null ? null : a.target));
  const a0 = average(F);
  const a1 = average(L);
  const dif = L.map((v, j) => (v == null || F[j] == null ? null : v - F[j]));
  const LL = L.filter((v) => v != null);
  const DD = dif.filter((v) => v != null);
  const lo = LL.length ? Math.min(...LL) : null;
  const hi = LL.length ? Math.max(...LL) : null;

  const gap = L.map((v, j) => (v == null || T[j] == null ? null : T[j] - v));
  const gaps = gap.filter((g) => g != null);
  const nT = gaps.length;
  const nMet = gaps.filter((g) => g <= 0).length;
  const mg = nT ? Math.max(...gaps) : null;
  const targets = nT
    ? { allMet: !(mg > 0), gap: mg > 0 ? mg : 0, area: mg > 0 ? areas[gap.indexOf(mg)] : null, onTarget: nMet, withTarget: nT }
    : null;

  const up = DD.length ? Math.max(...DD) : null;
  const dn = DD.length ? Math.min(...DD) : null;

  return {
    one,
    average: a1,
    averageFrom: one ? null : a0,
    averageMove: one ? null : Math.abs(a1 - a0),
    averageUp: one ? null : a1 >= a0,
    highest: hi == null ? null : { score: hi, area: areas[L.indexOf(hi)] },
    lowest: lo == null ? null : { score: lo, area: areas[L.indexOf(lo)] },
    atSevenPlus: { count: L.filter((v) => v != null && v >= 7).length, of: areas.length },
    biggestRise: !one && up != null && up > 0 ? { change: up, area: areas[dif.indexOf(up)] } : null,
    biggestDrop: !one && dn != null && dn < 0 ? { change: dn, area: areas[dif.indexOf(dn)] } : null,
    targets,
    showTargetsCard: !nT,
  };
}

/**
 * The Area by area table (one row per area on the wheel now, the mock-up's
 * table loop). An area added later has no start score: start null ("–")
 * and change "New". Own areas show "Your own area", plus ", added since
 * <first date>" when new in a range of two or more check-ins.
 *
 * Worked check (example data, 8 May to 15 Oct, targets as above):
 *   Romance / Partner: start 4, latest 5, change '+1', target 7, '2 below',
 *   history [4, 4, 4, 5].
 *
 * @param {object[]} range - the check-ins in the range, oldest first
 * @param {object[]} areas - the active areas, in wheel order
 * @returns {Array<{
 *   area: object, name: string, own: boolean,
 *   start: number|null, latest: number|null, isNew: boolean,
 *   change: number|null, changeText: string, changeClass: string,
 *   target: number|null, targetStatus: object|null,
 *   addedSince: string|null, history: Array<number|null>
 * }>} empty when the range is empty
 */
export function tableRows(range, areas) {
  if (!range || !range.length) return [];
  const first = range[0];
  const last = range[range.length - 1];
  const one = range.length === 1;
  return areas.map((a) => {
    const s0 = scoreOf(first, a.key);
    const s1 = scoreOf(last, a.key);
    const isNew = s0 == null;
    const d = isNew || s1 == null ? null : s1 - s0;
    const own = a.kind === 'own';
    return {
      area: a,
      name: areaName(a),
      own,
      start: s0,
      latest: s1,
      isNew,
      change: one ? null : d,
      changeText: one ? '' : changeText(isNew ? null : d),
      changeClass: changeClass(isNew ? null : d),
      target: a.target == null ? null : a.target,
      targetStatus: targetStatus(s1, a.target),
      addedSince: own && isNew && !one ? formatCheckinDate(first.date, false) : null,
      history: range.map((c) => scoreOf(c, a.key)),
    };
  });
}

/**
 * The Delta ("what moved") view, ported from the mock-up's delta().
 * One row per area: start → latest and the change. The scale is the
 * biggest change in the range, at least 3.
 *
 * Desktop order: biggest rise first, drops last, areas new in the range
 * (no start score) at the bottom; ties keep wheel order. Bar width is
 * halfPct (% of the full track, each side being 50%).
 *
 * Phone: grouped Rose, Dropped, No change, New in this range (empty groups
 * left out), each with its count; within Dropped the biggest drop comes
 * first. Bar width is fullPct (% of the full-width track).
 *
 * Worked check (example data, 8 May to 15 Oct): scale 3; desktop order
 * Relationships / Family +2 first, then the +1 areas in wheel order,
 * Fun / Recreation −1 last; phone groups Rose · 9, Dropped · 1.
 *
 * @param {object[]} range - the check-ins in the range, oldest first (two or more)
 * @param {object[]} areas - the active areas, in wheel order
 * @returns {{
 *   scale: number, firstDate: string, latestDate: string,
 *   rows: object[],
 *   groups: Array<{ label: string, rows: object[] }>
 * }|null} null when the range is empty
 */
export function deltaView(range, areas) {
  if (!range || !range.length) return null;
  const first = range[0];
  const last = range[range.length - 1];
  const base = areas.map((area, i) => {
    const a = scoreOf(first, area.key);
    const b = scoreOf(last, area.key);
    return { i, area, name: areaName(area), start: a, latest: b, change: a == null || b == null ? null : b - a };
  });
  const ds = base.filter((r) => r.change != null).map((r) => Math.abs(r.change));
  const mx = Math.max(3, ...ds);
  const decorate = (r) => ({
    ...r,
    changeText: changeText(r.change),
    changeClass: changeClass(r.change),
    halfPct: r.change ? (Math.abs(r.change) / mx) * 50 : 0,
    fullPct: r.change ? (Math.abs(r.change) / mx) * 100 : 0,
  });

  const rows = [...base].sort((x, y) => {
    if (x.change == null && y.change == null) return 0;
    if (x.change == null) return 1;
    if (y.change == null) return -1;
    return (y.change - x.change) || (x.i - y.i);
  }).map(decorate);

  let phone = [...rows];
  if (phone.some((r) => r.change != null && r.change < 0)) {
    phone.sort((x, y) => {
      if (x.change == null || y.change == null) return (x.change == null) - (y.change == null);
      return (x.change < 0 && y.change < 0) ? (x.change - y.change) : ((y.change - x.change) || (x.i - y.i));
    });
  }
  const G = [
    ['Rose', (r) => r.change != null && r.change > 0],
    ['Dropped', (r) => r.change != null && r.change < 0],
    ['No change', (r) => r.change === 0],
    ['New in this range', (r) => r.change == null],
  ];
  const groups = G.map(([label, test]) => ({ label, rows: phone.filter(test) })).filter((g) => g.rows.length);

  return { scale: mx, firstDate: first.date, latestDate: last.date, rows, groups };
}

/**
 * The focus box shows only when the newest check-in in the range has a
 * focus area that is still on the wheel (spec 6).
 * @param {object[]} range - oldest first
 * @param {object[]} areas - the active areas
 * @returns {{ area: object, name: string, note: string }|null}
 */
export function focusToShow(range, areas) {
  if (!range || !range.length) return null;
  const last = range[range.length - 1];
  if (!last.focusAreaKey) return null;
  const area = areas.find((a) => a.key === last.focusAreaKey);
  if (!area) return null;
  return { area, name: areaName(area), note: last.focusNote || '' };
}

// ---------------------------------------------------------------- in progress

/**
 * Brings an in-progress check-in up to date with the areas on the wheel now
 * (spec 4): keeps scores, notes and focus for areas still on the wheel,
 * drops the rest, and continues from the first unscored area (or the last
 * step, Choose one area, when every area is scored).
 * @param {{ scores?: object, notes?: object, focusAreaKey?: string|null, focusNote?: string, screenIndex?: number }} state
 * @param {object[]} areas - the active areas, in wheel order
 * @returns {{ scores: object, notes: object, focusAreaKey: string|null, focusNote: string, screenIndex: number, changed: boolean }}
 *   screenIndex 0..N-1 is a rating screen; N is Choose one area
 */
export function reconcileInProgress(state, areas) {
  const keys = areas.map((a) => a.key);
  const scores = {};
  const notes = {};
  let changed = false;
  Object.entries((state && state.scores) || {}).forEach(([k, v]) => {
    if (keys.includes(k) && Number.isInteger(v) && v >= 0 && v <= 10) scores[k] = v;
    else changed = true;
  });
  Object.entries((state && state.notes) || {}).forEach(([k, v]) => {
    if (keys.includes(k) && typeof v === 'string') notes[k] = v;
    else changed = true;
  });
  let focusAreaKey = (state && state.focusAreaKey) || null;
  if (focusAreaKey && !keys.includes(focusAreaKey)) { focusAreaKey = null; changed = true; }
  const firstUnscored = keys.findIndex((k) => scores[k] == null);
  let screenIndex = Number.isInteger(state && state.screenIndex) ? state.screenIndex : 0;
  if (firstUnscored !== -1 && (changed || screenIndex > firstUnscored)) screenIndex = firstUnscored;
  if (screenIndex < 0 || screenIndex > keys.length) screenIndex = firstUnscored === -1 ? keys.length : firstUnscored;
  return { scores, notes, focusAreaKey, focusNote: (state && state.focusNote) || '', screenIndex, changed };
}
