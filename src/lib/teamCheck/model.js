// Team performance check (mock-up M10, version 5.6; Tim, 13 Nov): the
// tool's rules, with no screen in them, so the page, the chart, the table,
// the PDF and the tests all read one answer.
//
// The screens, in order (one question each):
//   people            "Who reports to you?"                         at least one
//   t:<id>            "How much does “Priya Shah” trust you as their leader?"
//   a:<id>            "How well does “Priya Shah” understand what you’re trying to achieve?"
//   u:<id>            "How much autonomy does “Priya Shah” have to decide how to deliver?"
//                     (the three repeat for each person, in the list's order)
//   results           "Your team": the headline, the chart, trust, the questions
//
// A check while it is being worked on:
//   { people: [{ id, name, role, t, a, u }], shared, last }
// t, a and u are 1 to 5 (lowest first), or null until answered. `last` is
// the check before this one, copied in when this one starts, so the
// results, the PDF and an old saved check never depend on another row:
//   { at: '2026-10-14T09:00:00.000Z', people: { [id]: { t, a, u } } } or null.
//
// Saved in `tool_answers` (migration 043) with tool 'team_check'; until
// 043 has run it is kept on the device (src/lib/toolAnswers.js).

export const TOOL = 'team_check';
export const TOOL_NAME = 'Team performance check';
export const TOOL_PATH = '/team-performance-check';
export const TODO_SOURCE = 'other_tool';
export const NAME_MAX = 80;
export const ROLE_MAX = 80;
export const PEOPLE_MAX = 30;

/** Trust: Tim's five levels from his trust battery, lowest first (13 Nov, 09:43), each with its line. */
export const TRUST = [
  { label: 'Silent resistance', hint: 'They seem to go along with you, but quietly work against your decisions.' },
  { label: 'Open resistance', hint: 'They push back openly on your decisions.' },
  { label: 'Uncommitted', hint: 'They go along with things without really backing them.' },
  { label: 'Token cheerleader', hint: 'They say yes to your face, but do little to back it.' },
  { label: 'Committed', hint: 'They back your decisions and act on them as their own.' },
];
/** The five-word scales (5e 29i; Vagias, 2006): how well, and how much. */
export const ALIGNMENT = ['Not well at all', 'Slightly well', 'Moderately well', 'Very well', 'Extremely well'];
export const AUTONOMY = ['None at all', 'A little', 'A moderate amount', 'A lot', 'A great deal'];
/** The scale words said back as a sentence, after the person's first name (Tim, 13 Nov, 10:14). */
export const ALIGNMENT_SAID = [
  'doesn’t yet understand what you’re trying to achieve',
  'understands a little of what you’re trying to achieve',
  'understands what you’re trying to achieve moderately well',
  'understands what you’re trying to achieve very well',
  'understands what you’re trying to achieve extremely well',
];
export const AUTONOMY_SAID = [
  'has no autonomy to decide how to deliver',
  'has a little autonomy to decide how to deliver',
  'has a moderate amount of autonomy to decide how to deliver',
  'has a lot of autonomy to decide how to deliver',
  'has a great deal of autonomy to decide how to deliver',
];

export const KINDS = ['t', 'a', 'u'];
export const QUESTIONS_TITLE = 'Questions to start with:';
export const REQUIRED = {
  people: 'Add at least one person to carry on.',
  name: 'Type their name to carry on.',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v) => text(v).replace(/\s+/g, ' ').trim();
const level = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/** What was true at the last check, said in the past. */
export function past(sentence) {
  return sentence.replace('doesn’t', 'didn’t').replace('understands', 'understood').replace(/^has /, 'had ');
}

/** The first name, as the chart and the sentences use it. */
export function firstName(name) {
  return clean(name).split(' ')[0] || '';
}

/** A person is rated once all three answers are in. */
export function isRated(p) {
  return Boolean(p && level(p.t) && level(p.a) && level(p.u));
}

/** The people with all three answers: only they are on the results. */
export function ratedPeople(check) {
  return (check?.people || []).filter(isRated);
}

/**
 * Which named area someone is in: 'hp' High-performance (alignment and
 * autonomy both at 4 or 5), 'ps' Permission seekers (alignment only), 'ch'
 * Chaotic (autonomy only), or '' for the unnamed area (neither).
 */
export function areaOf(p) {
  const a = p.a >= 4;
  const u = p.u >= 4;
  if (a && u) return 'hp';
  if (a) return 'ps';
  return u ? 'ch' : '';
}
export const AREA_NAME = { hp: 'High-performance', ps: 'Permission seekers', ch: 'Chaotic' };

// ------------------------------------------------------------ the check

/**
 * A new check. With a check before it, the same people are on the list
 * with nothing answered, and that check is kept as `last`.
 * @param {{ at: string, people: Array }|null} before the newest finished check ({ at, people })
 */
export function emptyCheck(before = null) {
  const people = (before?.people || []).filter((p) => p && clean(p.name)).map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), t: null, a: null, u: null }));
  const rated = (before?.people || []).filter(isRated);
  const last = before?.at && rated.length
    ? { at: before.at, people: Object.fromEntries(rated.map((p) => [text(p.id), { t: p.t, a: p.a, u: p.u }])) }
    : null;
  return { people, shared: Boolean(before?.shared), last };
}

/** The check with one more person, or unchanged when no name was typed. */
export function addPerson(check, { id, name, role }) {
  const n = clean(name).slice(0, NAME_MAX);
  if (!n) return check;
  return { ...check, people: [...check.people, { id, name: n, role: clean(role).slice(0, ROLE_MAX), t: null, a: null, u: null }] };
}

/** The check without one person. */
export function removePerson(check, id) {
  return { ...check, people: check.people.filter((p) => p.id !== id) };
}

/** The check with a person put back where they were (Undo). */
export function restorePerson(check, person, index) {
  if (check.people.some((p) => p.id === person.id)) return check;
  const people = [...check.people];
  people.splice(Math.max(0, Math.min(index, people.length)), 0, person);
  return { ...check, people };
}

/** One answer given: kind 't', 'a' or 'u', value 1 to 5. */
export function setRating(check, id, kind, value) {
  if (!KINDS.includes(kind) || !level(value)) return check;
  return { ...check, people: check.people.map((p) => (p.id === id ? { ...p, [kind]: value } : p)) };
}

/** The calm message when Next is pressed on the list with nobody on it, or null. */
export function requiredMessage(check) {
  return (check?.people || []).length ? null : REQUIRED.people;
}

/** The question screens after the list: three for each person, in order. */
export function ratingSteps(check) {
  const people = check?.people || [];
  return people.flatMap((p, i) => KINDS.map((kind) => ({ key: `${kind}:${p.id}`, kind, person: p, n: i + 1, of: people.length })));
}

/** The first question with no answer yet (its key), or null when everyone is rated. */
export function firstUnanswered(check) {
  const step = ratingSteps(check).find((s) => !level(s.person[s.kind]));
  return step ? step.key : null;
}

/** "Person 1 of 5": the small grey line above each question. */
export function countLine(n, of) {
  return `Person ${n} of ${of}`;
}

/** Each screen's question, naming the person in curly quotes. */
export function question(kind, person) {
  const name = `“${clean(person?.name)}”`;
  if (kind === 'people') return 'Who reports to you?';
  if (kind === 't') return `How much does ${name} trust you as their leader?`;
  if (kind === 'a') return `How well does ${name} understand what you’re trying to achieve?`;
  if (kind === 'u') return `How much autonomy does ${name} have to decide how to deliver?`;
  return '';
}

/** The one line under each question. */
export function nudge(kind) {
  if (kind === 'people') return 'Add each person you lead directly.';
  if (kind === 't') return 'Choose the one that fits best.';
  if (kind === 'a') return 'Think about why it matters and what they’re accountable for.';
  if (kind === 'u') return 'Think about the boundaries you’ve agreed.';
  return null;
}

/** The five answers of a question: { value, label, hint }. */
export function options(kind) {
  if (kind === 't') return TRUST.map((x, i) => ({ value: i + 1, label: x.label, hint: x.hint }));
  return (kind === 'a' ? ALIGNMENT : AUTONOMY).map((label, i) => ({ value: i + 1, label }));
}

/** The answer in words: "Token cheerleader", "Very well", "A lot". */
export function word(kind, value) {
  const v = level(value);
  if (!v) return '';
  if (kind === 't') return TRUST[v - 1].label;
  return (kind === 'a' ? ALIGNMENT : AUTONOMY)[v - 1];
}

/**
 * The % bar on each screen (M10: 0 on the list, then 7, 13, 20 for the
 * first of five people): how many questions are behind you, of three each.
 * @param {number} at 0 for the list, then 1 for the first question, and on
 */
export function percentAt(at, peopleCount) {
  const total = 3 * peopleCount;
  if (!total || at <= 0) return 0;
  return Math.min(100, Math.round((at / total) * 100));
}

// ------------------------------------------------------------ the results

/** The opening sentence: never a big figure. */
export function headline(check) {
  const people = ratedPeople(check);
  const total = people.length;
  const n = people.filter((p) => areaOf(p) === 'hp').length;
  if (!total) return '';
  if (total === 1) {
    const f = firstName(people[0].name);
    return n ? `${f} is in the high-performance area right now.` : `${f} isn’t in the high-performance area right now.`;
  }
  const start = n === 0 ? `None of your ${total} people are` : `${n} of your ${total} people ${n === 1 ? 'is' : 'are'}`;
  return `${start} in the high-performance area right now.`;
}

/**
 * The last check's month, as it is said: "October", or "October 2025" when
 * that was another year. `now` is the day the words are read.
 */
export function lastMonth(last, now = new Date()) {
  if (!last?.at) return '';
  const at = new Date(last.at);
  if (Number.isNaN(at.getTime())) return '';
  const month = MONTHS[at.getMonth()];
  return at.getFullYear() === new Date(now).getFullYear() ? month : `${month} ${at.getFullYear()}`;
}

/** "At your last check, in October": never "this month", never "last month". */
export function lastWords(last, now = new Date()) {
  const month = lastMonth(last, now);
  return month ? `At your last check, in ${month}` : '';
}

/** Someone's answers at the last check, or null (a new person, or a first check). */
export function before(check, person) {
  const was = check?.last?.people?.[person.id];
  return was && isRated(was) ? was : null;
}

/**
 * One dot's pop-up (the shared chart pop-up: the name first, "Now", then a
 * line each) and what a screen reader hears.
 */
export function dotTip(check, person, now = new Date()) {
  const f = firstName(person.name);
  const was = before(check, person);
  const extra = [`${f} ${ALIGNMENT_SAID[person.a - 1]}.`, `${f} ${AUTONOMY_SAID[person.u - 1]}.`];
  if (was) {
    const changed = [];
    if (was.a !== person.a) changed.push(past(ALIGNMENT_SAID[was.a - 1]));
    if (was.u !== person.u) changed.push(past(AUTONOMY_SAID[was.u - 1]));
    const when = lastWords(check.last, now);
    extra.push(changed.length ? `${when}, ${f} ${list(changed)}.` : `It’s the same as ${when.charAt(0).toLowerCase()}${when.slice(1)}.`);
  }
  return {
    value: clean(person.name),
    when: 'Now',
    extra,
    label: `${clean(person.name)}. ${f} ${ALIGNMENT_SAID[person.a - 1]} and ${AUTONOMY_SAID[person.u - 1]}.`,
  };
}

/**
 * The chart's own measures (M10's script, to the pixel): alignment up,
 * autonomy across, both 1 to 5. `phone` is M10's phone drawing.
 */
export function chartFrame(phone = false) {
  const W = phone ? 340 : 680;
  const H = phone ? 340 : 440;
  const PL = phone ? 42 : 46;
  const PR = phone ? 6 : 14;
  const PT = 10;
  const PB = phone ? 46 : 52;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
  const IN = phone ? 26 : 36;
  const IT = phone ? 44 : 52;
  const R = phone ? 7 : 8;
  const X = (v) => PL + IN + ((v - 1) / 4) * (pw - 2 * IN);
  const Y = (v) => PT + IT + ((5 - v) / 4) * (ph - IT - IN);
  // A first name's width beside its dot, near enough: DM Sans averages a little under 0.6 of its size a letter.
  const nameSize = phone ? 13 : 14;
  const nameWidth = (name) => firstName(name).length * nameSize * 0.58;
  return { W, H, PL, PR, PT, PB, pw, ph, IN, IT, R, X, Y, midX: (X(3) + X(4)) / 2, midY: (Y(3) + Y(4)) / 2, phone, nameWidth };
}

const NAME_GAP = 6; // from a dot's edge to its name (M10)
const SHARED_GAP = 52; // between two dots that share a spot (M10)

/**
 * Where each rated person's dot goes: people who share a spot sit side by
 * side. Each: { person, x, y, good, nameLeft, ring: { x, y } | null, line | null }.
 * `ring` is where they were at the last check (the dashed ring), left out
 * when they haven't moved or weren't on it.
 *
 * Nothing is cut off (M10's own example has nobody at the right-hand
 * edge): a name that would run past the drawing's right edge goes to the
 * left of its dot (`nameLeft`); people who share a spot stand far enough
 * apart for each name, and the row of them is moved back inside the
 * drawing when it would run off either side.
 */
export function chartDots(check, frame) {
  const people = ratedPeople(check);
  const { X, Y, R, W, PL } = frame;
  const wide = frame.nameWidth || (() => 0);
  const byId = new Map(people.map((p) => [p.id, p]));
  // Each shared spot's dots, left to right, centred on the spot and kept inside the drawing.
  const rows = new Map();
  const rowFor = (key, ids, x0) => {
    if (rows.has(key)) return rows.get(key);
    const at = [0];
    for (let i = 1; i < ids.length; i += 1) at.push(at[i - 1] + 2 * R + Math.max(SHARED_GAP, NAME_GAP + wide(byId.get(ids[i - 1]).name) + NAME_GAP));
    const half = at[at.length - 1] / 2;
    let xs = at.map((a) => x0 + a - half);
    const over = xs[xs.length - 1] + R + NAME_GAP + wide(byId.get(ids[ids.length - 1]).name) - (W - 2);
    if (over > 0) xs = xs.map((x) => x - over);
    const under = PL + R + 2 - xs[0];
    if (under > 0) xs = xs.map((x) => x + under);
    rows.set(key, xs);
    return xs;
  };
  const spots = new Map();
  people.forEach((p) => {
    const key = `${p.u},${p.a}`;
    spots.set(key, [...(spots.get(key) || []), p.id]);
  });
  return people.map((p) => {
    const group = spots.get(`${p.u},${p.a}`);
    const x0 = X(p.u);
    const off = group.length > 1 ? rowFor(`${p.u},${p.a}`, group, x0)[group.indexOf(p.id)] - x0 : 0;
    // Alone at the right-hand edge: the name goes to the left of the dot.
    const nameLeft = group.length === 1 && x0 + R + NAME_GAP + wide(p.name) > W - 2;
    const y0 = Y(p.a);
    const was = before(check, p);
    let ring = null;
    let line = null;
    if (was) {
      const rx = X(was.u);
      const ry = Y(was.a);
      const d = Math.hypot(x0 - rx, y0 - ry);
      if (d >= 1) {
        ring = { x: rx, y: ry };
        if (d > 2 * R + 4) {
          const ux = (x0 - rx) / d;
          const uy = (y0 - ry) / d;
          line = { x1: rx + ux * (R + 2), y1: ry + uy * (R + 2), x2: x0 - ux * (R + 2), y2: y0 - uy * (R + 2) };
        }
      }
    }
    return { person: p, x: x0 + off, y: y0, good: areaOf(p) === 'hp', nameLeft, ring, line };
  });
}

/**
 * The colour rules, in one place (Tim, 13 Nov, 10:33 to 10:34). For each
 * rated person: { id, trust, alignment, autonomy }, each 'good' (mint),
 * 'low' (coral) or '' (grey).
 *   Trust:     Committed is mint; the single lowest is coral (the first on
 *              the list when two share it), unless it is Committed.
 *   Alignment: coral for anyone in Chaotic; with no one there, coral for
 *              the lowest alignment, ties included, unless it is already 4
 *              or 5. Otherwise mint at 4 or 5.
 *   Autonomy:  never coral. Mint at 4 or 5, except someone in Chaotic,
 *              whose autonomy is grey.
 * Chart dots are never coral: mint in High-performance, an outline elsewhere.
 */
export function barColours(check) {
  const people = ratedPeople(check);
  const lowestTrust = people.reduce((k, p, i) => (k < 0 || p.t < people[k].t ? i : k), -1);
  const chaotic = people.filter((p) => areaOf(p) === 'ch');
  const lowestAlignment = people.length ? Math.min(...people.map((p) => p.a)) : 0;
  return people.map((p, i) => {
    const inChaos = areaOf(p) === 'ch';
    const risk = chaotic.length ? inChaos : (p.a === lowestAlignment && lowestAlignment < 4);
    return {
      id: p.id,
      trust: p.t === 5 ? 'good' : (i === lowestTrust ? 'low' : ''),
      alignment: risk ? 'low' : (p.a >= 4 ? 'good' : ''),
      autonomy: p.u >= 4 && !inChaos ? 'good' : '',
    };
  });
}

/** The trust list: one row per rated person. */
export function trustRows(check) {
  const colours = barColours(check);
  return ratedPeople(check).map((p, i) => ({
    id: p.id,
    name: clean(p.name),
    role: clean(p.role),
    value: p.t,
    word: TRUST[p.t - 1].label,
    tone: colours[i].trust,
    label: `${clean(p.name)}. Trust: ${TRUST[p.t - 1].label}.`,
  }));
}

/** The chart as a table: one row per rated person, each answer as five steps. */
export function tableRows(check) {
  const colours = barColours(check);
  return ratedPeople(check).map((p, i) => ({
    id: p.id,
    name: clean(p.name),
    role: clean(p.role),
    alignment: { value: p.a, word: ALIGNMENT[p.a - 1], tone: colours[i].alignment },
    autonomy: { value: p.u, word: AUTONOMY[p.u - 1], tone: colours[i].autonomy },
  }));
}

const WORD_LIMIT = 15;
const wordCount = (s) => s.trim().split(/\s+/).length;
// A question names its person in full, in curly quotes; a name so long
// that the question would pass 15 words is said as the first name.
function ask(make, person) {
  const full = make(`“${clean(person.name)}”`);
  return wordCount(full) <= WORD_LIMIT ? full : make(`“${firstName(person.name)}”`);
}

/**
 * Questions to start with, at most three, in this order: Chaotic first
 * (the biggest risk), then trust (the biggest fall since the last check),
 * then autonomy (a Permission seeker). Each names its person, in about 15
 * words or fewer: [{ kind: 'chaotic' | 'trust' | 'autonomy', id, text }].
 */
export function startQuestions(check) {
  const people = ratedPeople(check);
  const out = [];
  const chaotic = people.find((p) => areaOf(p) === 'ch');
  if (chaotic) {
    out.push({ kind: 'chaotic', id: chaotic.id, text: ask((n) => `What would help ${n} explain the organisation’s intent in their own words?`, chaotic) });
  }
  const fell = people
    .map((p) => ({ p, was: before(check, p) }))
    .filter(({ p, was }) => was && p.t < was.t && p !== chaotic)
    .sort((x, y) => (x.p.t - x.was.t) - (y.p.t - y.was.t))[0]?.p;
  if (fell) {
    out.push({ kind: 'trust', id: fell.id, text: ask((n) => `What has changed for ${n}, and what would rebuild their trust?`, fell) });
  }
  const seeker = people.find((p) => areaOf(p) === 'ps' && p !== fell);
  if (seeker) {
    out.push({ kind: 'autonomy', id: seeker.id, text: ask((n) => `Which decisions could ${n} own, within clear boundaries, to ease your load?`, seeker) });
  }
  return out.slice(0, 3);
}

// ------------------------------------------------------------ saving

/** The saved item's name in the lists: "November team check" (never a date as the name). */
export function checkTitle(at = new Date()) {
  const d = new Date(at);
  return `${MONTHS[(Number.isNaN(d.getTime()) ? new Date() : d).getMonth()]} team check`;
}

/** What is saved as the row's answers. */
export function savedAnswers(check) {
  return {
    version: 1,
    people: (check.people || []).map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), trust: level(p.t), alignment: level(p.a), autonomy: level(p.u) })),
    last: check.last?.at ? { at: check.last.at, people: check.last.people || {} } : null,
  };
}

/** A check from a saved row's answers; anything damaged reads as not answered. */
export function checkFrom(answers, shared = false) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const people = (Array.isArray(a.people) ? a.people : [])
    .filter((p) => p && typeof p === 'object' && clean(p.name) && text(p.id))
    .map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), t: level(p.trust), a: level(p.alignment), u: level(p.autonomy) }));
  let last = null;
  if (a.last && typeof a.last === 'object' && a.last.at && a.last.people && typeof a.last.people === 'object') {
    const kept = Object.entries(a.last.people)
      .map(([id, v]) => [id, { t: level(v?.t), a: level(v?.a), u: level(v?.u) }])
      .filter(([, v]) => isRated(v));
    if (kept.length) last = { at: text(a.last.at), people: Object.fromEntries(kept) };
  }
  return { people, shared: Boolean(shared), last };
}

/** True when anyone is on the list (an untouched tool saves nothing). */
export function hasAnswers(check) {
  return (check?.people || []).length > 0;
}

/** Finished: at least one person, and every question answered. */
export function isComplete(check) {
  return hasAnswers(check) && check.people.every(isRated);
}

/**
 * The newest finished check among saved ones, as emptyCheck and `last`
 * need it: { at, people, shared }, or null. `records` are the saved rows
 * ({ id, status, answers, shared, finishedAt, updatedAt }); `notId` leaves
 * one out (the check being opened).
 */
export function newestFinished(records, notId = null) {
  const done = (records || [])
    .filter((r) => r && r.id !== notId && r.status === 'completed' && !r.gone)
    .map((r) => ({ r, at: r.finishedAt || r.updatedAt || r.createdAt }))
    .filter((x) => x.at && !Number.isNaN(new Date(x.at).getTime()))
    .sort((x, y) => new Date(y.at) - new Date(x.at))[0];
  if (!done) return null;
  const check = checkFrom(done.r.answers, done.r.shared);
  return { at: done.at, people: check.people, shared: check.shared };
}
