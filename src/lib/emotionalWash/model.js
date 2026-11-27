// Emotional wash: the tool's rules, with no screen in them, so the page, the
// PDF and the tests all read one answer.
//
// Polish 1, Stage D (27 Nov 2026): Draft 6's nine screens with Draft 7's word
// list, both approved by Tim word for word (docs/rules/emotional-wash.md;
// ~/Downloads/clarity-phase-6a/stage-d/). The screens, in order:
//   what       "What happened?"                                 a box
//   family     "Which of these is it closest to?"               one tap, the 8 families
//   words      "Which word fits best?"                          pick any, with meanings; Something else
//   strength   "How strong is it right now?"                    one tap, Slight to Intense
//   story      "What are you telling yourself about it?"        a box
//   others     "What other thoughts come with it?"              a list, one thought a box
//   d:<id>     "For “thought”, what will you do with it?"       one tap for each thought:
//              "I’ll act on it." / "I’ll park it for now." / "I’ll let it go."
//   c:<id>     "What will you do about “thought”, and when?"    a box and a date, for each thought
//              to act on; it can't be skipped (question rule 34)
//   sum        "Your wash"
// Every other screen can be skipped. The family's words show only once a
// family is chosen. A wash is private, like the Journal: no eye, never shared.
//
// A wash while it is being worked on:
//   { what, family, words: [word], own, strength,
//     thoughts: [{ id, text, choice, step, when, where, strategyId }],
//     todos: { [thought id]: { id, text, where, strategyId } } }
// thoughts[0] is always the story (id STORY_ID); the rest are the other
// thoughts. `choice` is 'act', 'park' or 'go'. A thought to act on has its
// `step`, `when` (a date key) and where its to-do goes (`where`: 'week',
// 'backlog' or 'none'). `todos` holds the to-do really made for a thought.
//
// Saved in `tool_answers` (migration 043) with tool 'emotional_wash'
// (answers version 2). A wash saved before 27 Nov (version 1: the kind of
// feeling, the ten Geneva words, Related to, true, logical, helpful, Accept
// and act, Park and reflect, Trash) still opens and reads as it was: its
// words, related words and parked questions are kept (`legacy`).

export const TOOL = 'emotional_wash';
export const TOOL_NAME = 'Emotional wash';
export const TOOL_PATH = '/emotional-wash';
export const TODO_SOURCE = 'other_tool';
export const WHAT_MAX = 600;
export const THOUGHT_MAX = 300;
export const OWN_MAX = 60;
export const STEP_MAX = 300; // a to-do's own limit
export const WHERE = { week: 'week', backlog: 'backlog', none: 'none' };
export const STORY_ID = 'story';

/**
 * Draft 7: 8 families of difficult feelings and 56 words, each with its one
 * line of meaning. Families from the most common in leaders' sessions to the
 * least; words within a family from mildest to strongest.
 */
export const FAMILIES = Object.freeze([
  { value: 'angry', label: 'Angry', words: [
    ['Irritated', 'Small things are getting to you.'],
    ['Frustrated', 'Something is blocking what you want.'],
    ['Indignant', 'You’ve been treated unfairly.'],
    ['Resentful', 'Still hurt by something unfair.'],
    ['Betrayed', 'Someone broke your trust.'],
    ['Bitter', 'Hurt that has hardened over time.'],
    ['Furious', 'Anger at full strength.'],
  ] },
  { value: 'overloaded', label: 'Overloaded', words: [
    ['Pressured', 'Pushed hard by demands or deadlines.'],
    ['Stretched', 'Spread too thin across too much.'],
    ['Scattered', 'Your attention is pulled everywhere.'],
    ['Overwhelmed', 'More than you can handle right now.'],
    ['Trapped', 'You can’t see a way out.'],
    ['Exhausted', 'Nothing left in the tank.'],
    ['Burnt out', 'Worn down over a long time.'],
  ] },
  { value: 'afraid', label: 'Afraid', words: [
    ['Nervous', 'On edge before something.'],
    ['Anxious', 'Uneasy about what might happen.'],
    ['Insecure', 'Unsure you’re good enough.'],
    ['Threatened', 'Something you value is at risk.'],
    ['Vulnerable', 'Exposed, with no protection.'],
    ['Dread', 'Sure something bad is coming.'],
    ['Panicked', 'Fear has taken over.'],
  ] },
  { value: 'uncertain', label: 'Uncertain', words: [
    ['Hesitant', 'Holding back from a step.'],
    ['Unsettled', 'Something feels off.'],
    ['Confused', 'You can’t make sense of it.'],
    ['Doubtful', 'You question whether it’s right.'],
    ['Torn', 'Pulled between two things.'],
    ['Stuck', 'You can’t see the next move.'],
    ['Lost', 'You’ve lost your sense of direction.'],
  ] },
  { value: 'sad', label: 'Sad', words: [
    ['Flat', 'Low, with little energy or interest.'],
    ['Disappointed', 'It didn’t go the way you hoped.'],
    ['Discouraged', 'Losing heart.'],
    ['Regretful', 'Wishing you’d done it differently.'],
    ['Hurt', 'Someone’s words or actions stung.'],
    ['Lonely', 'Missing real connection.'],
    ['Grieving', 'Feeling a loss deeply.'],
  ] },
  { value: 'ashamed', label: 'Ashamed', words: [
    ['Self-conscious', 'Too aware of how you come across.'],
    ['Embarrassed', 'Others saw what you’d rather they hadn’t.'],
    ['Like an imposter', 'Afraid you’ll be found out.'],
    ['Inadequate', 'Not enough for what’s asked of you.'],
    ['Guilty', 'You acted against your own values.'],
    ['Exposed', 'Your weak spots are on show.'],
    ['Humiliated', 'Made to feel small in front of others.'],
  ] },
  { value: 'disconnected', label: 'Disconnected', words: [
    ['Distant', 'Going through the motions with people.'],
    ['Let down', 'Someone didn’t do what they said.'],
    ['Unappreciated', 'Your effort goes unnoticed.'],
    ['Misunderstood', 'People have the wrong idea about you.'],
    ['Invisible', 'Overlooked, as if you’re not there.'],
    ['Excluded', 'Left out on purpose or by habit.'],
    ['Isolated', 'On your own with it.'],
  ] },
  { value: 'guard', label: 'On guard', words: [
    ['Guarded', 'Keeping people at arm’s length.'],
    ['Defensive', 'Ready to protect yourself.'],
    ['Suspicious', 'You don’t trust their motives.'],
    ['Competitive', 'Needing to win against someone.'],
    ['Envious', 'Wanting what someone else has.'],
    ['Jealous', 'Afraid of losing what’s yours to someone.'],
    ['Cornered', 'Under attack with nowhere to go.'],
  ] },
].map((f) => Object.freeze({ ...f, words: Object.freeze(f.words.map(([label, hint]) => Object.freeze({ value: label, label, hint }))) })));

/** Every word of the list, in order. */
export const WORDS = Object.freeze(FAMILIES.flatMap((f) => f.words.map((w) => w.value)));
/** The ten words of the version saved before 27 Nov (the Geneva Emotion Wheel's difficult feelings): read, never offered. */
export const OLD_WORDS = Object.freeze(['Anger', 'Contempt', 'Disappointment', 'Disgust', 'Fear', 'Guilt', 'Hate', 'Regret', 'Sadness', 'Shame']);
/** How strong it is right now (Draft 7): asked once, with no before-and-after rating. */
export const STRENGTHS = Object.freeze(['Slight', 'Mild', 'Moderate', 'Strong', 'Intense'].map((label, i) => Object.freeze({ value: i + 1, label })));
/** What to do with each thought (Draft 6), in their own voice. */
export const CHOICES = Object.freeze([
  { value: 'act', label: 'I’ll act on it.' },
  { value: 'park', label: 'I’ll park it for now.' },
  { value: 'go', label: 'I’ll let it go.' },
].map((c) => Object.freeze(c)));
/** "See an example" on the other thoughts: three different ones, so no one feels it was written for someone else (question rule 10). */
export const THOUGHT_EXAMPLES = Object.freeze(['They don’t rate me.', 'I’ll let the squad down on Saturday.', 'I should have said no.']);
/** The calm line when Next is pressed on the one screen that can't be skipped (never a greyed-out button). */
export const REQUIRED = {
  step: 'Type what you’ll do to carry on.',
  when: 'Choose when to carry on.',
  strategy: 'Choose a Strategy to carry on.',
};
export const SKIPPED = 'You skipped this.';
export const OWN_LABEL = 'Something else';

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v) => text(v).replace(/\s+/g, ' ').trim();
const chosen = (v) => (CHOICES.some((c) => c.value === v) ? v : null);
const place = (v) => (Object.values(WHERE).includes(v) ? v : null);
const familyOf = (v) => FAMILIES.find((f) => f.value === v) || null;
const strong = (v) => (STRENGTHS.some((s) => s.value === v) ? v : null);
const dateKey = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
// The words chosen, in the order they were chosen, each once and only real ones (an older wash's own ten included).
const among = (list, values) => [...new Set(Array.isArray(values) ? values : [])].filter((w) => list.includes(w));
const known = [...WORDS, ...OLD_WORDS];
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
/** Words as a sentence says them: the first as written, the rest in lower case. */
const inWords = (words) => list(words.map((w, i) => (i ? w.toLowerCase() : w)));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const newThought = (id, words = '') => ({ id, text: words, choice: null, step: '', when: null, where: null, strategyId: null });

/** A new, empty wash: the story's box and one empty box for another thought. */
export function emptyWash(newId) {
  return { what: '', family: null, words: [], own: '', strength: null, thoughts: [newThought(STORY_ID), newThought(newId())], todos: {}, legacy: null };
}

// ------------------------------------------------------------ the feeling

/** The family's words with their meanings, or none while no family is chosen. */
export function wordsOf(family) {
  return familyOf(family)?.words || [];
}

/** The words named, in the order chosen, then their own word. */
export function namedWords(wash) {
  const words = among(known, wash?.words);
  const own = clean(wash?.own);
  return own ? [...words, own] : words;
}

/** The line under "How strong is it right now?": the word chosen ("Resentful"), or nothing. */
export function strengthLine(wash) {
  const words = namedWords(wash);
  return words.length ? inWords(words) : null;
}

/** Choosing a family keeps only the words that belong to it (and their own word). */
export function withFamily(wash, family) {
  const f = familyOf(family);
  if (!f) return wash;
  const mine = f.words.map((w) => w.value);
  return { ...wash, family: f.value, words: (wash.words || []).filter((w) => mine.includes(w)) };
}

// ------------------------------------------------------------ the thoughts

/** A thought as its questions say it: in curly quotes, without its last full stop. */
export function quote(thought) {
  return `“${clean(thought?.text).replace(/[.!?]$/, '')}”`;
}

/** The story (what they're telling themselves): always the first thought. */
export function storyOf(wash) {
  return (wash?.thoughts || []).find((th) => th.id === STORY_ID) || newThought(STORY_ID);
}

/** The other thoughts' boxes (the story is its own screen). */
export function otherThoughts(wash) {
  return (wash?.thoughts || []).filter((th) => th.id !== STORY_ID);
}

/** The thoughts with words in them, the story first: only they are asked about. */
export function typedThoughts(wash) {
  return [storyOf(wash), ...otherThoughts(wash)].filter((th) => clean(th.text));
}

/** The story typed. */
export function withStory(wash, words) {
  const story = { ...storyOf(wash), text: text(words).slice(0, THOUGHT_MAX) };
  return { ...wash, thoughts: [story, ...otherThoughts(wash)] };
}

/**
 * The other thoughts' rows changed (RowList's onChange): typing in a box, a
 * new box, a box taken out ({ removed: i }) or put back ({ restored: i }).
 * `removed` is the thought taken out, kept by the screen for its Undo.
 */
export function withOtherRows(wash, rows, change, newId, removed = null) {
  const shown = otherThoughts(wash);
  let next;
  if (change?.removed != null) {
    next = shown.filter((_, i) => i !== change.removed);
  } else if (change?.restored != null && removed) {
    next = [...shown];
    next.splice(Math.min(change.restored, next.length), 0, { ...removed, text: text(rows[change.restored] ?? removed.text) });
  } else {
    next = rows.map((words, i) => (shown[i] ? { ...shown[i], text: text(words).slice(0, THOUGHT_MAX) } : newThought(newId(), text(words).slice(0, THOUGHT_MAX))));
  }
  if (!next.length) next = [newThought(newId())];
  return { ...wash, thoughts: [storyOf(wash), ...next] };
}

/** One thought with something changed. */
export function setThought(wash, id, patch) {
  return { ...wash, thoughts: (wash.thoughts || []).map((th) => (th.id === id ? { ...th, ...patch } : th)) };
}

/** What they'll do with a thought: act, park or let go. */
export function setChoice(wash, id, value) {
  return chosen(value) ? setThought(wash, id, { choice: value }) : wash;
}

/** A thought to act on is answered once its step and its day are there (a thought saved before 27 Nov had no day). */
export function isCommitted(th) {
  return Boolean(clean(th?.step) && (dateKey(th?.when) || th?.old));
}

/** The screens after the other thoughts: one choice for each typed thought, then one commit screen for each to act on. */
export function thoughtSteps(wash) {
  const thoughts = typedThoughts(wash);
  const acted = thoughts.filter((th) => th.choice === 'act');
  return [
    ...thoughts.map((th, i) => ({ key: `d:${th.id}`, kind: 'd', thought: th, n: i + 1, of: thoughts.length })),
    ...acted.map((th, i) => ({ key: `c:${th.id}`, kind: 'c', thought: th, n: i + 1, of: acted.length })),
  ];
}

/** "Thought 1 of 3": the small grey line above a thought's question when there are several. */
export function countLine(n, of) {
  return of > 1 ? `Thought ${n} of ${of}` : null;
}

/** The first thought to act on that still has no step or day (the screen that can't be skipped), or null. */
export function firstUncommitted(wash) {
  const th = typedThoughts(wash).find((t) => t.choice === 'act' && !isCommitted(t));
  return th ? `c:${th.id}` : null;
}

/**
 * Where an unfinished wash carries on when it is opened from a list: the
 * first screen with nothing in it yet (its key). Screens can be skipped, so
 * this is only where to start; the summary shows once nothing is missing.
 */
export function resumeStep(wash) {
  if (!clean(wash?.what)) return 'what';
  if (!familyOf(wash?.family) && !namedWords(wash).length) return 'family';
  if (familyOf(wash?.family) && !namedWords(wash).length) return 'words';
  if (!strong(wash?.strength)) return 'strength';
  if (!clean(storyOf(wash).text)) return 'story';
  const undecided = typedThoughts(wash).find((th) => !chosen(th.choice));
  if (undecided) return `d:${undecided.id}`;
  return firstUncommitted(wash) || 'sum';
}

/** Each screen's question (Draft 6, word for word). */
export function question(key, thought) {
  switch (key) {
    case 'what': return 'What happened?';
    case 'family': return 'Which of these is it closest to?';
    case 'words': return 'Which word fits best?';
    case 'strength': return 'How strong is it right now?';
    case 'story': return 'What are you telling yourself about it?';
    case 'others': return 'What other thoughts come with it?';
    case 'd': return `For ${quote(thought)}, what will you do with it?`;
    case 'c': return `What will you do about ${quote(thought)}, and when?`;
    default: return '';
  }
}

/**
 * The calm message when Next is pressed on the screen that can't be skipped
 * and isn't answered yet, or null. `needsStrategy` when its to-do will be
 * added and no Strategy is chosen yet.
 */
export function requiredMessage(key, thought = null, { needsStrategy = false } = {}) {
  if (key !== 'c') return null;
  if (!clean(thought?.step)) return REQUIRED.step;
  if (!dateKey(thought?.when)) return REQUIRED.when;
  if (needsStrategy) return REQUIRED.strategy;
  return null;
}

// ------------------------------------------------------------ to-dos

/**
 * What the to-do for a thought's step should be: { text, where, strategyId },
 * or null when there should be none (not acted on, nothing typed, or "Don’t
 * add it").
 */
export function wantedTodo(thought) {
  if (!thought || thought.choice !== 'act' || !clean(thought.step)) return null;
  if (thought.where !== WHERE.week && thought.where !== WHERE.backlog) return null;
  return { text: clean(thought.step), where: thought.where, strategyId: thought.strategyId || null };
}

/** True when the to-do already made for a thought is the one wanted. */
export function sameTodo(made, wanted) {
  return Boolean(made && wanted && made.text === wanted.text && made.where === wanted.where && (made.strategyId || null) === (wanted.strategyId || null));
}

/** The to-dos made for thoughts that no longer want one (taken out, parked, let go): [{ thoughtId, id }]. */
export function strayTodos(wash) {
  const byId = new Map((wash?.thoughts || []).map((th) => [th.id, th]));
  return Object.entries(wash?.todos || {})
    .filter(([thoughtId, made]) => made?.id && !wantedTodo(byId.get(thoughtId)))
    .map(([thoughtId, made]) => ({ thoughtId, id: made.id }));
}

/** The wash with a thought's to-do recorded (or, with null, forgotten). */
export function withTodo(wash, thoughtId, made) {
  const todos = { ...(wash.todos || {}) };
  if (made) todos[thoughtId] = made;
  else delete todos[thoughtId];
  return { ...wash, todos };
}

/** Where a step's to-do is, as the summary says it, or null when it isn't anywhere. */
export function whereLine(wash, thought) {
  const made = wash?.todos?.[thought?.id];
  if (!made?.id) return null;
  if (made.where === WHERE.week) return 'It’s in this week’s to-dos.';
  if (made.where === WHERE.backlog) return 'It’s in your backlog.';
  return null;
}

/** A step's day as the summary says it: "Thu 3 Dec", with the year only outside this one (writing rule 28). */
export function whenWords(key, today = new Date()) {
  const k = dateKey(key);
  if (!k) return '';
  const [y, m, d] = k.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY[date.getDay()]} ${d} ${MON[m - 1]}${y === today.getFullYear() ? '' : ` ${y}`}`;
}

// ------------------------------------------------------------ the summary

/** What was named and chosen, with blanks left out: the summary, the PDF and the tests read this. */
export function washContent(wash, today = new Date()) {
  const thoughts = typedThoughts(wash);
  const legacy = wash?.legacy || {};
  const strength = STRENGTHS.find((s) => s.value === wash?.strength) || null;
  return {
    what: clean(wash?.what),
    family: familyOf(wash?.family)?.label || '',
    words: namedWords(wash),
    strength: strength ? strength.label : '',
    story: clean(storyOf(wash).text),
    related: Array.isArray(legacy.related) ? legacy.related : [],
    act: thoughts.filter((th) => th.choice === 'act' && clean(th.step)).map((th) => ({
      id: th.id,
      thought: clean(th.text),
      step: clean(th.step),
      when: whenWords(th.when, today),
      where: whereLine(wash, th),
    })),
    park: thoughts.filter((th) => th.choice === 'park').map((th) => ({ id: th.id, thought: clean(th.text), question: clean(legacy.questions?.[th.id]) })),
    go: thoughts.filter((th) => th.choice === 'go').map((th) => ({ id: th.id, thought: clean(th.text) })),
  };
}

/** A step's one line under it: its day, then where its to-do is. */
const stepSub = (a) => [a.when ? `By ${a.when}.` : '', a.where || ''].filter(Boolean).join(' ');

/**
 * Your wash: a mirror of what was named and chosen. Each row: { key, step
 * (the screen it opens), label, editName, lines: [{ text, sub, good }] }.
 * Several thoughts get a row each, so each opens its own screen.
 */
export function summaryRows(wash, today = new Date()) {
  const c = washContent(wash, today);
  const rows = [
    { key: 'what', step: 'what', label: 'What happened', editName: 'what happened', lines: [{ text: c.what || SKIPPED }] },
    { key: 'feeling', step: 'family', label: 'The feeling', editName: 'the feeling', lines: [{ text: c.words.length ? inWords(c.words) : (c.family || SKIPPED), sub: c.words.length && c.family ? c.family : undefined }] },
    { key: 'strength', step: 'strength', label: 'How strong it is', editName: 'how strong it is', lines: [{ text: c.strength || SKIPPED }] },
  ];
  if (c.related.length) rows.push({ key: 'rel', step: 'family', label: 'Related to', editName: 'what it’s related to', lines: [{ text: inWords(c.related) }] });
  rows.push({ key: 'story', step: 'story', label: 'What you’re telling yourself', editName: 'what you’re telling yourself', lines: [{ text: c.story || SKIPPED }] });
  const each = (items, label, name, line) => items.forEach((x, i) => rows.push({
    key: `${label}:${x.id}`,
    step: label === 'act' ? `c:${x.id}` : `d:${x.id}`,
    label: name,
    editName: items.length > 1 ? `${name.toLowerCase()}, ${i + 1} of ${items.length}` : name.toLowerCase(),
    lines: [line(x)],
  }));
  each(c.act, 'act', 'To act on', (a) => ({ text: a.step, sub: stepSub(a) || undefined, good: Boolean(a.where) }));
  each(c.park, 'park', 'Parked for now', (p) => ({ text: p.thought, sub: p.question || undefined }));
  each(c.go, 'go', 'Letting go', (g) => ({ text: g.thought }));
  return rows;
}

/** The offer under Your wash (Draft 6; question rule 36), or null without a coach to offer. */
export function talkLine(coachFirstName) {
  const name = clean(coachFirstName);
  return name ? `Want to talk this through with ${name}?` : null;
}

// ------------------------------------------------------------ saving

/** The saved item's name in the lists: never what was typed (a wash is private), never a date. */
export function washTitle() {
  return 'Your wash';
}

/** What is saved as the row's answers (version 2). A finished wash lets its empty boxes go. */
export function savedAnswers(wash, { finished = false } = {}) {
  const thoughts = (wash.thoughts || [])
    .filter((th) => th.id === STORY_ID || !(finished && !clean(th.text)))
    .map((th) => ({
      id: text(th.id),
      text: text(th.text).slice(0, THOUGHT_MAX),
      choice: chosen(th.choice),
      step: th.choice === 'act' ? text(th.step).slice(0, STEP_MAX) : '',
      when: th.choice === 'act' ? dateKey(th.when) : null,
      where: th.choice === 'act' ? place(th.where) : null,
      strategy_id: th.choice === 'act' ? (th.strategyId || null) : null,
      ...(th.old ? { old: true } : {}),
    }));
  const ids = new Set(thoughts.map((th) => th.id));
  const out = {
    version: 2,
    what: text(wash.what).slice(0, WHAT_MAX),
    family: familyOf(wash.family)?.value || null,
    words: among(known, wash.words),
    own: clean(wash.own).slice(0, OWN_MAX),
    strength: strong(wash.strength),
    thoughts,
    todos: Object.fromEntries(Object.entries(wash.todos || {})
      .filter(([thoughtId, made]) => ids.has(thoughtId) && made?.id)
      .map(([thoughtId, made]) => [thoughtId, { id: text(made.id), text: text(made.text), where: place(made.where), strategy_id: made.strategyId || null }])),
  };
  if (wash.legacy && (wash.legacy.related?.length || Object.keys(wash.legacy.questions || {}).length)) out.legacy = wash.legacy;
  return out;
}

// A version 1 wash (before 27 Nov): its thoughts become the story and the
// others, Accept and act reads "I’ll act on it.", Park and reflect "I’ll park
// it for now." (its question kept) and Trash "I’ll let it go.".
const OLD_CHOICE = { act: 'act', park: 'park', trash: 'go' };
function fromVersion1(a, newId) {
  const old = (Array.isArray(a.thoughts) ? a.thoughts : []).filter((th) => th && typeof th === 'object');
  const questions = {};
  const thoughts = old.map((th, i) => {
    const id = i === 0 ? STORY_ID : (text(th.id) || newId());
    if (th.wash === 'park' && clean(th.question)) questions[id] = clean(th.question);
    return { id, text: text(th.text), choice: OLD_CHOICE[th.wash] || null, step: text(th.step), when: null, where: place(th.where), strategyId: th.strategy_id || null, old: true, oldId: text(th.id) };
  });
  if (!thoughts.length) thoughts.push(newThought(STORY_ID));
  if (thoughts.length < 2) thoughts.push(newThought(newId()));
  const todos = {};
  if (a.todos && typeof a.todos === 'object') {
    for (const th of thoughts) {
      const made = th.oldId && a.todos[th.oldId];
      if (made && typeof made === 'object' && made.id) todos[th.id] = { id: text(made.id), text: text(made.text), where: place(made.where), strategyId: made.strategy_id || null };
    }
  }
  const related = Array.isArray(a.related) ? a.related.filter((w) => typeof w === 'string' && w) : [];
  return {
    what: text(a.what),
    family: null,
    words: among(known, a.words),
    own: '',
    strength: null,
    thoughts: thoughts.map(({ oldId, ...th }) => th),
    todos,
    legacy: related.length || Object.keys(questions).length ? { related, questions } : null,
  };
}

/** A wash from a saved row's answers; anything damaged reads as not answered. */
export function washFrom(answers, newId = () => `thought-${Math.random().toString(36).slice(2)}`) {
  const a = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  if (a.version !== 2) return fromVersion1(a, newId);
  return tidyWash({
    ...a,
    thoughts: (Array.isArray(a.thoughts) ? a.thoughts : []).map((th) => (th && typeof th === 'object' ? { ...th, strategyId: th.strategy_id } : th)),
    todos: Object.fromEntries(Object.entries(a.todos && typeof a.todos === 'object' ? a.todos : {}).map(([k, m]) => [k, m && typeof m === 'object' ? { ...m, strategyId: m.strategy_id } : m])),
  }, newId);
}

/**
 * A wash the screens can always draw, out of whatever a device kept as a
 * draft: the right shape whatever was there. Each thought has its own id,
 * the story comes first, its words are text, and every answer is one the
 * screens know or nothing. A draft kept by the version before 27 Nov reads
 * as that version's saved answers would.
 */
export function tidyWash(value, newId = () => `thought-${Math.random().toString(36).slice(2)}`) {
  const w = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  // A draft from the version before 27 Nov (it had `kind` and true, logical, helpful).
  if ('kind' in w || 'rel' in w) {
    return fromVersion1({ ...w, related: w.rel, thoughts: (Array.isArray(w.thoughts) ? w.thoughts : []).map((th) => (th && typeof th === 'object' ? { ...th, strategy_id: th.strategyId } : th)), todos: Object.fromEntries(Object.entries(w.todos && typeof w.todos === 'object' ? w.todos : {}).map(([k, m]) => [k, m && typeof m === 'object' ? { ...m, strategy_id: m.strategyId } : m])) }, newId);
  }
  const words = (v) => (typeof v === 'string' ? v : '');
  const ids = new Set();
  const read = (Array.isArray(w.thoughts) ? w.thoughts : [])
    .filter((th) => th && typeof th === 'object' && !Array.isArray(th))
    .map((th) => {
      let id = words(th.id);
      if (!id || ids.has(id)) id = newId();
      ids.add(id);
      return {
        id,
        text: words(th.text),
        choice: chosen(th.choice),
        step: words(th.step),
        when: dateKey(th.when),
        where: place(th.where),
        strategyId: words(th.strategyId) || null,
        ...(th.old === true ? { old: true } : {}),
      };
    });
  const story = read.find((th) => th.id === STORY_ID) || newThought(STORY_ID);
  let others = read.filter((th) => th.id !== STORY_ID);
  if (!others.length) others = [newThought(newId())];
  const all = new Set([STORY_ID, ...others.map((th) => th.id)]);
  const todos = {};
  if (w.todos && typeof w.todos === 'object' && !Array.isArray(w.todos)) {
    for (const [thoughtId, made] of Object.entries(w.todos)) {
      if (made && typeof made === 'object' && words(made.id) && all.has(thoughtId)) {
        todos[thoughtId] = { id: made.id, text: words(made.text), where: place(made.where), strategyId: words(made.strategyId) || null };
      }
    }
  }
  const legacy = w.legacy && typeof w.legacy === 'object' && !Array.isArray(w.legacy)
    ? {
      related: Array.isArray(w.legacy.related) ? w.legacy.related.filter((x) => typeof x === 'string' && x) : [],
      questions: w.legacy.questions && typeof w.legacy.questions === 'object' && !Array.isArray(w.legacy.questions)
        ? Object.fromEntries(Object.entries(w.legacy.questions).filter(([, q]) => typeof q === 'string'))
        : {},
    }
    : null;
  return {
    what: words(w.what),
    family: familyOf(w.family)?.value || null,
    words: among(known, w.words),
    own: words(w.own).slice(0, OWN_MAX),
    strength: strong(w.strength),
    thoughts: [story, ...others],
    todos,
    legacy: legacy && (legacy.related.length || Object.keys(legacy.questions).length) ? legacy : null,
  };
}

/** True when anything has been typed or chosen (an untouched tool saves nothing). */
export function hasAnswers(wash) {
  return Boolean(clean(wash?.what) || wash?.family || (wash?.words || []).length || clean(wash?.own) || wash?.strength
    || (wash?.thoughts || []).some((th) => clean(th.text)));
}

/**
 * The wash is whole: something was named, and every thought to act on has
 * its step and its day (the one screen that can't be skipped). A thought
 * saved before 27 Nov (`old`) had no day; its step counts as it was.
 */
export function isComplete(wash) {
  if (!hasAnswers(wash)) return false;
  return typedThoughts(wash).every((th) => th.choice !== 'act' || Boolean(clean(th.step) && (dateKey(th.when) || th.old)));
}
