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
//   w:<id>            "What’s working well with “Priya Shah” right now?" (Stage D,
//                     Draft 11: after each person's three ratings; it can be skipped)
//   commit            "What will you do first with “Priya Shah”, and when?" the
//                     commit question, once, last, naming the person the
//                     questions to start with name first (else the first on the
//                     list); it can't be skipped
//   results           "Your team": the headline, the chart, trust, the questions
//
// A check while it is being worked on:
//   { people: [{ id, name, role, t, a, u, w }], shared, last, commit }
// w is what's working well with them ('' until typed); commit is
// { id: the person's id, text } ('' until typed).
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
  commit: 'Type what you’ll do to carry on.',
};
export const WORKING_MAX = 600;
export const COMMIT_MAX = 300;

/**
 * Decide who decides (Stage D, item 4; Tim, 27 Nov): the traffic light the
 * autonomy question asks about ("at which colour?"), lowest autonomy last.
 * Drawn in the portal's own data colours, never coral (coral is for mistakes
 * only): Green a filled mint light at the top, Amber a mint ring in the
 * middle, Red a filled grey light at the bottom; the word says which.
 */
export const DECIDE_COLOURS = Object.freeze([
  { key: 'green', name: 'Green', meaning: 'They decide, act and report back.' },
  { key: 'amber', name: 'Amber', meaning: 'They decide, and I confirm before they act.' },
  { key: 'red', name: 'Red', meaning: 'I decide.' },
]);
export const DECIDE_TITLE = 'Decide who decides';

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
  const people = (before?.people || []).filter((p) => p && clean(p.name)).map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), t: null, a: null, u: null, w: '' }));
  const rated = (before?.people || []).filter(isRated);
  const last = before?.at && rated.length
    ? { at: before.at, people: Object.fromEntries(rated.map((p) => [text(p.id), { t: p.t, a: p.a, u: p.u }])) }
    : null;
  return { people, shared: Boolean(before?.shared), last, commit: { id: null, text: '' } };
}

/** The check with one more person, or unchanged when no name was typed. */
export function addPerson(check, { id, name, role }) {
  const n = clean(name).slice(0, NAME_MAX);
  if (!n) return check;
  return { ...check, people: [...check.people, { id, name: n, role: clean(role).slice(0, ROLE_MAX), t: null, a: null, u: null, w: '' }] };
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

/** What's working well with someone, as typed (Draft 11). */
export function setWorking(check, id, words) {
  return { ...check, people: check.people.map((p) => (p.id === id ? { ...p, w: text(words).slice(0, WORKING_MAX) } : p)) };
}

/** The person the commit question names: the first the questions to start with name, else the first rated, else the first on the list. */
export function commitPerson(check) {
  const people = check?.people || [];
  const named = startQuestions(check)[0]?.id;
  return people.find((p) => p.id === named) || ratedPeople(check)[0] || people[0] || null;
}

/** The commit answer, for the person it names now. */
export function setCommit(check, words) {
  const p = commitPerson(check);
  return { ...check, commit: { id: p ? p.id : null, text: text(words).slice(0, COMMIT_MAX) } };
}

/** The commit answer as it is now: the words only while they are about the person the question names. */
export function commitText(check) {
  const p = commitPerson(check);
  return p && check?.commit?.id === p.id ? text(check.commit.text) : '';
}

/** The calm message when Next is pressed on the commit question with nothing typed, or null. */
export function commitMessage(check) {
  return clean(commitText(check)) ? null : REQUIRED.commit;
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
  if (kind === 'w') return `What’s working well with ${name} right now?`;
  if (kind === 'c') return `What will you do first with ${name}, and when?`;
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
  // Said as the Health Check says it (the break-it tester, 17 Nov): never
  // "2 of your 2", and "none of them is".
  let start;
  if (n === 0) start = `None of your ${total} people is`;
  else if (n === total) start = total === 2 ? 'Both of your people are' : `All ${total} of your people are`;
  else start = `${n} of your ${total} people ${n === 1 ? 'is' : 'are'}`;
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
  // The three areas' names, where TeamChart draws them, as boxes (the same
  // estimate of a letter's width), so no person's name comes near one.
  const labelSize = phone ? 12 : 13;
  const labelBox = (text, x, baseline, end) => {
    const w = text.length * labelSize * 0.58;
    return { left: end ? x - w : x, right: end ? x : x + w, top: baseline - labelSize * 0.75, bottom: baseline + labelSize * 0.25 };
  };
  const labels = [
    labelBox(AREA_NAME.hp, PL + pw - 8, PT + 20, true),
    labelBox(AREA_NAME.ps, PL + 8, PT + 20, false),
    labelBox(AREA_NAME.ch, PL + pw - 8, PT + ph - 12, true),
  ];
  return { W, H, PL, PR, PT, PB, pw, ph, IN, IT, R, X, Y, midX: (X(3) + X(4)) / 2, midY: (Y(3) + Y(4)) / 2, phone, nameWidth, nameSize, labels };
}

// At least 4px between any name and an area's name on screen (Phase 8a
// follow-up, step 2); the boxes are estimates, so 6px is kept in the drawing.
const LABEL_CLEAR = 6;
const apart = (a, b) => {
  const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
  const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
  return dx && dy ? Math.hypot(dx, dy) : Math.max(dx, dy);
};

const NAME_GAP = 6; // from a dot's edge to its name (M10)
const SHARED_GAP = 52; // between two dots that share a spot (M10)

/**
 * Where each rated person's dot goes: people who share a spot sit side by
 * side. Each: { person, x, y, good, name: { x, y, anchor, side }, nameLeft, nameUp, ring: { x, y } | null, line | null }
 * (name: where the first name is drawn, right, left, above or below its dot,
 * clear of the areas' names, the dots and the other names).
 * `ring` is where they were at the last check (the dashed ring), left out
 * when they haven't moved or weren't on it.
 *
 * Nothing is cut off (M10's own example has nobody at the right-hand
 * edge): a name that would run past the drawing's right edge goes to the
 * left of its dot (`nameLeft`); people who share a spot stand far enough
 * apart for each name, the row of them is moved back inside the drawing
 * when it would run off either side, and more than one row can hold
 * stand in rows, one above another.
 */
export function chartDots(check, frame) {
  const people = ratedPeople(check);
  const { X, Y, R, W, PL, PT = 0, ph = Infinity } = frame;
  const wide = frame.nameWidth || (() => 0);
  const byId = new Map(people.map((p) => [p.id, p]));
  const tail = (id) => R + NAME_GAP + wide(byId.get(id).name); // from a dot's centre to the end of its name
  const step = (id) => 2 * R + Math.max(SHARED_GAP, NAME_GAP + wide(byId.get(id).name) + NAME_GAP); // to the next dot's centre
  // A name's width is an estimate (wide letters run a few px over it), so a row keeps 8px clear of the right edge.
  const edge = W - 8;
  const room = edge - (PL + R + 2); // from the first dot's centre to that edge
  const rowGap = 2 * R + 10;
  // Each shared spot's dots: side by side, centred on the spot and kept
  // inside the drawing. More people than one row can hold stand in rows,
  // one above another, centred on the spot too: nobody's name ever runs
  // off the drawing.
  const placed = new Map();
  const { midX = null, midY = null } = frame;
  const placeSpot = (ids, x0, y0, u, a) => {
    // Every dot stays on its own side of the two dividing lines, so nobody
    // is drawn in an area they aren't in (a name may cross a line; a dot
    // never does). Dot centres run from `from` to `to`; names end by `edge`.
    const right = midX != null && u >= 4;
    const from = right ? midX + R + 4 : PL + R + 2;
    const to = midX != null && !right ? midX - R - 4 : Infinity;
    const rows = [[]];
    let span = 0;
    for (const id of ids) {
      const row = rows[rows.length - 1];
      if (row.length && (from + span + tail(id) > edge || from + span > to)) {
        rows.push([id]);
        span = step(id);
      } else {
        row.push(id);
        span += step(id);
      }
    }
    // The rows are centred on the spot, inside its own band when they fit
    // there (clear of the area's name), otherwise inside the drawing.
    const height = (rows.length - 1) * rowGap;
    let low = PT + R + 2;
    let high = PT + ph - R - 2;
    if (midY != null && Number.isFinite(high)) {
      const bandLow = a >= 4 ? PT + 28 + R : midY + R + 3;
      const bandHigh = a >= 4 ? midY - R - 3 : PT + ph - 24 - R;
      if (bandHigh - bandLow >= height) { low = bandLow; high = bandHigh; }
    }
    let top = y0 - height / 2;
    if (Number.isFinite(high)) top = Math.max(low, Math.min(top, high - height));
    rows.forEach((row, r) => {
      const at = [0];
      for (let i = 1; i < row.length; i += 1) at.push(at[i - 1] + step(row[i - 1]));
      const half = at[at.length - 1] / 2;
      let xs = at.map((x) => x0 + x - half);
      const over = Math.max(xs[xs.length - 1] + tail(row[row.length - 1]) - edge, xs[xs.length - 1] - to);
      if (over > 0) xs = xs.map((x) => x - over);
      const under = from - xs[0];
      if (under > 0) xs = xs.map((x) => x + under);
      row.forEach((id, i) => placed.set(id, { x: xs[i], y: top + r * rowGap }));
    });
  };
  const spots = new Map();
  people.forEach((p) => {
    const key = `${p.u},${p.a}`;
    spots.set(key, [...(spots.get(key) || []), p.id]);
  });
  spots.forEach((ids, key) => {
    if (ids.length < 2) return;
    const [u, a] = key.split(',').map(Number);
    placeSpot(ids, X(u), Y(a), u, a);
  });
  // The dots first, then each name in turn (Phase 8a follow-up; the
  // break-it tester, 17 Nov: on a phone a long first name ran through the
  // next dot, and two long names on one spot ran off the drawing). A name
  // takes the first place, right of its dot, left, above or below, that is
  // inside the drawing and clear of the areas' names, every dot and every
  // name already placed; the right first, or the left at the right-hand edge.
  const size = frame.nameSize || 14;
  const H = frame.H || (PT + ph + 46);
  const dotsAt = people.map((p) => ({ p, at: placed.get(p.id) || { x: X(p.u), y: Y(p.a) } }));
  const dotBoxes = dotsAt.map(({ at }) => ({ left: at.x - R - 1, right: at.x + R + 1, top: at.y - R - 1, bottom: at.y + R + 1 }));
  const taken = [];
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const names = dotsAt.map(({ p, at }, i) => {
    const w = wide(p.name);
    const box = (side) => {
      if (side === 'right') { const x1 = at.x + R + NAME_GAP; const b = at.y + 4.5; return { side, x: x1, y: b, anchor: 'start', left: x1, right: x1 + w, top: b - size * 0.75, bottom: b + size * 0.25 }; }
      if (side === 'left') { const x2 = at.x - R - NAME_GAP; const b = at.y + 4.5; return { side, x: x2, y: b, anchor: 'end', left: x2 - w, right: x2, top: b - size * 0.75, bottom: b + size * 0.25 }; }
      const cx = Math.min(Math.max(at.x, w / 2 + 2), W - w / 2 - 2);
      // A second line further out lets neighbours' names stagger.
      const step = size * 1.15;
      const b = { up: at.y - R - 4, up2: at.y - R - 4 - step, down: at.y + R + 4 + size * 0.75, down2: at.y + R + 4 + size * 0.75 + step }[side];
      return { side, x: cx, y: b, anchor: 'middle', left: cx - w / 2, right: cx + w / 2, top: b - size * 0.75, bottom: b + size * 0.25 };
    };
    const order = at.x + R + NAME_GAP + w > W - 2 ? ['left', 'right', 'up', 'down', 'down2', 'up2'] : ['right', 'left', 'up', 'down', 'down2', 'up2'];
    const inside = (b) => b.left >= 2 && b.right <= W - 2 && b.top >= 0 && b.bottom <= H;
    const clash = (b) => (frame.labels || []).reduce((n, l) => n + (apart(b, l) < LABEL_CLEAR ? 1000 : 0), 0)
      + dotBoxes.reduce((n, d, j) => n + (j === i ? 0 : overlap(b, d)), 0)
      + taken.reduce((n, t) => n + overlap({ ...b, left: b.left - 2, right: b.right + 2 }, t), 0);
    const options = order.map(box).filter(inside);
    const chosen = options.find((b) => clash(b) === 0)
      || options.sort((a, b) => clash(a) - clash(b))[0]
      || box(order[0]);
    taken.push(chosen);
    return chosen;
  });
  return dotsAt.map(({ p, at }, i) => {
    const x0 = X(p.u);
    const y0 = Y(p.a);
    const n = names[i];
    const was = before(check, p);
    let ring = null;
    let line = null;
    if (was) {
      const rx = X(was.u);
      const ry = Y(was.a);
      const d = Math.hypot(x0 - rx, y0 - ry);
      if (d >= 1) {
        ring = { x: rx, y: ry };
        const dd = Math.hypot(at.x - rx, at.y - ry);
        if (dd > 2 * R + 4) {
          const ux = (at.x - rx) / dd;
          const uy = (at.y - ry) / dd;
          line = { x1: rx + ux * (R + 2), y1: ry + uy * (R + 2), x2: at.x - ux * (R + 2), y2: at.y - uy * (R + 2) };
        }
      }
    }
    return {
      person: p, x: at.x, y: at.y, good: areaOf(p) === 'hp',
      // Where the name is drawn: its x (start, end or middle), its baseline, and which side of the dot.
      name: { x: n.x, y: n.y, anchor: n.anchor, side: n.side },
      nameLeft: n.side === 'left', nameUp: n.side === 'up' || n.side === 'up2', nameX: n.anchor === 'middle' ? n.x : null,
      ring, line,
    };
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
  // Autonomy: a Permission seeker. With nobody in Chaotic and no trust to
  // ask about (a first check, so nothing has fallen yet), every Permission
  // seeker is asked about, up to three (Phase 8a follow-up, step 2); with
  // none, there is nothing to ask and the section is hidden (5e rule 6).
  const seekers = people.filter((p) => areaOf(p) === 'ps' && p !== fell);
  // Stage D, Draft 11 (Tim's answer 10): the traffic light of Decide who decides, DECIDE_COLOURS.
  const autonomy = (p) => ({ kind: 'autonomy', id: p.id, text: ask((n) => `Which decisions can ${n} own, and at which colour?`, p) });
  if (!out.length) seekers.slice(0, 3).forEach((p) => out.push(autonomy(p)));
  else if (seekers[0]) out.push(autonomy(seekers[0]));
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
    people: (check.people || []).map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), trust: level(p.t), alignment: level(p.a), autonomy: level(p.u), working: text(p.w).trim() })),
    last: check.last?.at ? { at: check.last.at, people: check.last.people || {} } : null,
    // Stage D, Draft 11: the commit answer, with the person it was about.
    commit: check.commit?.id && text(check.commit.text).trim() ? { id: text(check.commit.id), text: text(check.commit.text).trim() } : null,
  };
}

/** A check from a saved row's answers; anything damaged reads as not answered. */
export function checkFrom(answers, shared = false) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const people = (Array.isArray(a.people) ? a.people : [])
    .filter((p) => p && typeof p === 'object' && clean(p.name) && text(p.id))
    .map((p) => ({ id: text(p.id), name: clean(p.name), role: clean(p.role), t: level(p.trust), a: level(p.alignment), u: level(p.autonomy), w: typeof p.working === 'string' ? p.working : '' }));
  let last = null;
  if (a.last && typeof a.last === 'object' && a.last.at && a.last.people && typeof a.last.people === 'object') {
    const kept = Object.entries(a.last.people)
      .map(([id, v]) => [id, { t: level(v?.t), a: level(v?.a), u: level(v?.u) }])
      .filter(([, v]) => isRated(v));
    if (kept.length) last = { at: text(a.last.at), people: Object.fromEntries(kept) };
  }
  const commit = a.commit && typeof a.commit === 'object' && text(a.commit.id) && typeof a.commit.text === 'string'
    ? { id: text(a.commit.id), text: a.commit.text } : { id: null, text: '' };
  return { people, shared: Boolean(shared), last, commit };
}

/**
 * A check the screens can always draw, out of whatever a device kept as a
 * draft: each person once, with an id and a name, each answer 1 to 5 or
 * nothing, and the check before it only when it can be read. A draft that
 * was damaged, or kept by another version, opens as far as it can be read
 * and never stops the page (the break-it tester, 14 Nov).
 */
export function tidyCheck(value) {
  const c = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const words = (v) => (typeof v === 'string' ? v : '');
  const ids = new Set();
  const people = (Array.isArray(c.people) ? c.people : [])
    .filter((p) => p && typeof p === 'object' && !Array.isArray(p) && words(p.id) && clean(words(p.name)))
    .filter((p) => !ids.has(p.id) && ids.add(p.id))
    .map((p) => ({ id: p.id, name: clean(words(p.name)), role: clean(words(p.role)), t: level(p.t), a: level(p.a), u: level(p.u), w: words(p.w) }));
  const commit = c.commit && typeof c.commit === 'object' && words(c.commit.id) ? { id: c.commit.id, text: words(c.commit.text) } : { id: null, text: '' };
  return { people, shared: c.shared === true, last: checkFrom({ last: c.last }).last, commit };
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
