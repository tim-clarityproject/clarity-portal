// Emotional wash (mock-up M10, version 5.6; Tim, 13 Nov): the tool's rules,
// with no screen in them, so the page, the PDF and the tests all read one
// answer.
//
// The screens, in order (one question each):
//   what       "What happened?"                                   typed
//   kind       "What kind of feeling are you left with?"          one answer
//   words      "Which words fit the feeling?"                     as many as fit
//   rel        "What could the feeling be related to?"            optional
//   story      "What story are you telling yourself about what’s happened?"
//                                                                 one thought a box
//   t:<id>     "Is “thought” true?"       Yes, Not sure, No       (these four repeat
//   l:<id>     "Is “thought” logical?"                             for each thought,
//   h:<id>     "Is “thought” helpful?"                             in the list's order)
//   w:<id>     "How will you wash “thought”?"  Accept and act, Park and reflect, Trash
//   sum        "Your wash"
//
// A wash while it is being worked on:
//   { what, kind, words: [word], rel: [word],
//     thoughts: [{ id, text, t, l, h, wash, step, question, where, strategyId }],
//     todos: { [thought id]: { id, text, where, strategyId } } }
// t, l and h are 'yes', 'unsure' or 'no' (null until answered). `wash` is
// 'act', 'park' or 'trash'. An acted-on thought has its one small `step`
// and where its to-do should go (`where`: 'week', 'backlog' or 'none'); a
// parked one has its `question`. `todos` holds the to-do really made for a
// thought's step, so the summary only says "It’s in this week’s to-dos."
// when it is, and an edit puts a new to-do in the old one's place.
//
// There is no "how strong" rating anywhere, before or after (Tim, 2 Nov).
// A wash is private, like the Journal: it is never shared with a coach.
//
// Saved in `tool_answers` (migration 043) with tool 'emotional_wash';
// until 043 has run it is kept on the device (src/lib/toolAnswers.js).

export const TOOL = 'emotional_wash';
export const TOOL_NAME = 'Emotional wash';
export const TOOL_PATH = '/emotional-wash';
export const TODO_SOURCE = 'other_tool';
export const WHAT_MAX = 600;
export const THOUGHT_MAX = 300;
export const STEP_MAX = 300; // a to-do's own limit
export const QUESTION_MAX = 300;
export const WHERE = { week: 'week', backlog: 'backlog', none: 'none' };

/** The three kinds of feeling, each with its line of meaning. */
export const KINDS = [
  { value: 'fc', label: 'Future concern', hint: 'It’s fear, anxiety or worry about what might happen.' },
  { value: 'pa', label: 'Present angst', hint: 'It’s anger, disgust or shock about what’s happening now.' },
  { value: 'pr', label: 'Past regret', hint: 'It’s sadness, shame or guilt about what happened.' },
];
/** The ten difficult feelings of the Geneva Emotion Wheel (Scherer, 2005 and 2013), as M10 has them. */
export const WORDS = ['Anger', 'Contempt', 'Disappointment', 'Disgust', 'Fear', 'Guilt', 'Hate', 'Regret', 'Sadness', 'Shame'];
/** What the feeling could be related to: what feels threatened. */
export const RELATED = ['Trust', 'Respect', 'Fairness', 'Loyalty', 'Recognition', 'Status', 'Control', 'Belonging', 'Security', 'Identity', 'Competence'];
/** Question starters for Park and reflect: open, kind, easy to pick when overwhelmed (Tim, 13 Nov, 10:41). */
export const STARTERS = ['What do I know for certain here?', 'What would I say to a friend in my place?', 'What matters most to me in this?'];
/** The three ways to wash a thought. */
export const WASHES = [
  { value: 'act', label: 'Accept and act', hint: 'Simplify it and move to action.' },
  { value: 'park', label: 'Park and reflect', hint: 'Turn it into a question to come back to.' },
  { value: 'trash', label: 'Trash', hint: 'It’s an unhelpful story, so let it go.' },
];
/** True, logical, helpful: one check a screen, the same three answers. */
export const CHECK_ANSWERS = [
  { value: 'yes', label: 'Yes' },
  { value: 'unsure', label: 'Not sure' },
  { value: 'no', label: 'No' },
];
export const CHECKS = {
  t: { word: 'true', nudge: 'Think about what you know for certain.' },
  l: { word: 'logical', nudge: 'Ask whether it follows from what happened, or jumps to a conclusion.' },
  h: { word: 'helpful', nudge: 'Ask whether thinking it helps you act well.' },
};
export const CHECK_KINDS = ['t', 'l', 'h'];
export const STORY_EXAMPLE = 'The chair has never rated me.';
export const PLACEHOLDER = {
  step: 'e.g. Ask the chair for 20 minutes before the next board meeting',
  question: 'e.g. What would show me where I stand with the chair?',
};
export const FOLLOW = {
  act: { label: 'What’s one small step you’ll take?', hint: 'Keep it small and clear.' },
  park: { label: 'What’s the question that will be helpful to reflect on?', hint: 'Keep it open, starting with “What” or “How”. Tap one to start, then make it yours.' },
};
/** The calm line when Next is pressed on a screen that isn't answered yet (never a greyed-out button). */
export const REQUIRED = {
  what: 'Type what happened to carry on.',
  words: 'Choose at least one word to carry on.',
  story: 'Type at least one thought to carry on.',
  wash: 'Choose one to carry on.',
  step: 'Type one small step to carry on.',
  question: 'Type your question to carry on.',
  strategy: 'Choose a Strategy to carry on.',
};
export const SKIPPED = 'You skipped this.';

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v) => text(v).replace(/\s+/g, ' ').trim();
const said = (v) => (CHECK_ANSWERS.some((a) => a.value === v) ? v : null);
const washed = (v) => (WASHES.some((w) => w.value === v) ? v : null);
const place = (v) => (Object.values(WHERE).includes(v) ? v : null);
// The words chosen, in the order they were chosen (as M10 says them back), each once and only real ones.
const among = (list, values) => [...new Set(Array.isArray(values) ? values : [])].filter((w) => list.includes(w));
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
/** Words as a sentence says them: the first as written, the rest in lower case. */
const inWords = (words) => list(words.map((w, i) => (i ? w.toLowerCase() : w)));

const newThought = (id, words = '') => ({ id, text: words, t: null, l: null, h: null, wash: null, step: '', question: '', where: null, strategyId: null });

/** A new, empty wash: one empty box for the first thought. */
export function emptyWash(newId) {
  return { what: '', kind: null, words: [], rel: [], thoughts: [newThought(newId())], todos: {} };
}

// ------------------------------------------------------------ the thoughts

/** A thought as its questions say it: in curly quotes, without its last full stop. */
export function quote(thought) {
  return `“${clean(thought?.text).replace(/[.!?]$/, '')}”`;
}
/** The words that lift away when a thought is trashed (the same, without the quotes). */
export function quoteWords(thought) {
  return clean(thought?.text).replace(/[.!?]$/, '');
}

/** The thoughts with words in them: only they are washed. A trashed one keeps its screens until the wash is finished. */
export function typedThoughts(wash) {
  return (wash?.thoughts || []).filter((th) => clean(th.text));
}

/** The boxes on the story screen: every thought that hasn't been trashed. */
export function storyThoughts(wash) {
  return (wash?.thoughts || []).filter((th) => th.wash !== 'trash');
}

/**
 * The story screen's rows changed (RowList's onChange): typing in a box,
 * a new box, a box taken out ({ removed: i }) or put back ({ restored: i }).
 * `removed` is the thought taken out, kept by the screen for its Undo.
 */
export function withStoryRows(wash, rows, change, newId, removed = null) {
  const shown = storyThoughts(wash);
  const hidden = (wash.thoughts || []).filter((th) => th.wash === 'trash');
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
  // Trashed thoughts keep their place at the end: they have no box, only their own screen.
  return { ...wash, thoughts: [...next, ...hidden] };
}

/** One thought with something changed. */
export function setThought(wash, id, patch) {
  return { ...wash, thoughts: (wash.thoughts || []).map((th) => (th.id === id ? { ...th, ...patch } : th)) };
}

/** One check answered: kind 't', 'l' or 'h'. */
export function setCheck(wash, id, kind, value) {
  if (!CHECK_KINDS.includes(kind) || !said(value)) return wash;
  return setThought(wash, id, { [kind]: value });
}

/** How a thought will be washed. */
export function setWash(wash, id, value) {
  return washed(value) ? setThought(wash, id, { wash: value }) : wash;
}

/** A question on its own washing screen is answered once its follow-up is too. */
export function isWashed(th) {
  if (th?.wash === 'trash') return true;
  if (th?.wash === 'act') return Boolean(clean(th.step));
  if (th?.wash === 'park') return Boolean(clean(th.question));
  return false;
}

/** The screens after the story: four for each typed thought, in order. */
export function washSteps(wash) {
  const thoughts = typedThoughts(wash);
  return thoughts.flatMap((th, i) => [
    ...CHECK_KINDS.map((kind) => ({ key: `${kind}:${th.id}`, kind, thought: th, n: i + 1, of: thoughts.length })),
    { key: `w:${th.id}`, kind: 'w', thought: th, n: i + 1, of: thoughts.length },
  ]);
}

/** The first screen still to answer (its key), or null when every thought is washed. */
export function firstUnanswered(wash) {
  const step = washSteps(wash).find((s) => (s.kind === 'w' ? !isWashed(s.thought) : !said(s.thought[s.kind])));
  return step ? step.key : null;
}

/** Where an unfinished wash carries on when it is opened from a list: the first screen still to answer (its key). */
export function resumeStep(wash) {
  if (!clean(wash?.what)) return 'what';
  if (!KINDS.some((k) => k.value === wash?.kind)) return 'kind';
  if (!among(WORDS, wash?.words).length) return 'words';
  if (!typedThoughts(wash).length) return 'story';
  return firstUnanswered(wash) || 'sum';
}

/** "Thought 1 of 3": the small grey line above each of a thought's questions. */
export function countLine(n, of) {
  return `Thought ${n} of ${of}`;
}

/** Each screen's question. `gone`: the thought has been trashed and has lifted away. */
export function question(key, thought, { gone = false } = {}) {
  switch (key) {
    case 'what': return 'What happened?';
    case 'kind': return 'What kind of feeling are you left with?';
    case 'words': return 'Which words fit the feeling?';
    case 'rel': return 'What could the feeling be related to?';
    case 'story': return 'What story are you telling yourself about what’s happened?';
    case 't': case 'l': case 'h': return `Is ${quote(thought)} ${CHECKS[key].word}?`;
    case 'w': return gone ? 'That thought has gone.' : `How will you wash ${quote(thought)}?`;
    default: return '';
  }
}

/** The one line under each question. */
export function nudge(key, { gone = false } = {}) {
  switch (key) {
    case 'what': return 'Write it as it happened, in a sentence or two.';
    case 'kind': return 'Choose the one that fits best.';
    case 'words': return 'Choose as many as fit.';
    case 'rel': return 'Choose what feels threatened.';
    case 'story': return 'Type one thought in each box.';
    case 't': case 'l': case 'h': return CHECKS[key].nudge;
    case 'w': return gone ? 'It won’t appear in your summary.' : 'Choose one.';
    default: return null;
  }
}

/**
 * The % bar on each screen. The first five are M10's own (0, 9, 18, 27,
 * 36); a thought's four screens then share the rest evenly, so the bar
 * only ever moves forward, however many thoughts there are.
 * @param {number} at 0 to 4 for the first five screens, then 5 for the first thought's first question, and on
 */
export function percentAt(at, thoughtCount) {
  if (at <= 0) return 0;
  if (at <= 4) return at * 9;
  const steps = 4 * Math.max(1, thoughtCount);
  return Math.min(99, Math.round(36 + ((at - 4) * 64) / (steps + 1)));
}

/**
 * The calm message when Next is pressed on a screen that isn't answered
 * yet, or null. For a washing screen pass the thought; `needsStrategy`
 * when its to-do will be added and no Strategy is chosen yet.
 */
export function requiredMessage(key, wash, thought = null, { needsStrategy = false } = {}) {
  if (key === 'what') return clean(wash?.what) ? null : REQUIRED.what;
  if (key === 'words') return among(WORDS, wash?.words).length ? null : REQUIRED.words;
  if (key === 'story') return storyThoughts(wash).some((th) => clean(th.text)) ? null : REQUIRED.story;
  if (key === 'w') {
    if (!washed(thought?.wash)) return REQUIRED.wash;
    if (thought.wash === 'act' && !clean(thought.step)) return REQUIRED.step;
    if (thought.wash === 'act' && needsStrategy) return REQUIRED.strategy;
    if (thought.wash === 'park' && !clean(thought.question)) return REQUIRED.question;
  }
  return null;
}

// ------------------------------------------------------------ to-dos

/**
 * What the to-do for a thought's step should be: { text, where,
 * strategyId }, or null when there should be none (not acted on, nothing
 * typed, or "Don’t add it").
 */
export function wantedTodo(thought) {
  if (!thought || thought.wash !== 'act' || !clean(thought.step)) return null;
  if (thought.where !== WHERE.week && thought.where !== WHERE.backlog) return null;
  return { text: clean(thought.step), where: thought.where, strategyId: thought.strategyId || null };
}

/** True when the to-do already made for a thought is the one wanted. */
export function sameTodo(made, wanted) {
  return Boolean(made && wanted && made.text === wanted.text && made.where === wanted.where && (made.strategyId || null) === (wanted.strategyId || null));
}

/** The to-dos made for thoughts that no longer want one (taken out, parked, trashed): [{ thoughtId, id }]. */
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

/** Where a step's to-do is, as the summary says it (M10's words), or null when it isn't anywhere. */
export function whereLine(wash, thought) {
  const made = wash?.todos?.[thought?.id];
  if (!made?.id) return null;
  if (made.where === WHERE.week) return 'It’s in this week’s to-dos.';
  if (made.where === WHERE.backlog) return 'It’s in your backlog.';
  return null;
}

// ------------------------------------------------------------ the summary

/** What was named and chosen, with blanks left out: the summary, the PDF and the tests read this. */
export function washContent(wash) {
  const kind = KINDS.find((k) => k.value === wash?.kind) || null;
  const thoughts = typedThoughts(wash);
  return {
    what: clean(wash?.what),
    kind: kind ? kind.label : '',
    words: among(WORDS, wash?.words),
    related: among(RELATED, wash?.rel),
    act: thoughts.filter((th) => th.wash === 'act' && clean(th.step)).map((th) => ({ id: th.id, thought: clean(th.text), step: clean(th.step), where: whereLine(wash, th) })),
    reflect: thoughts.filter((th) => th.wash === 'park' && clean(th.question)).map((th) => ({ id: th.id, thought: clean(th.text), question: clean(th.question) })),
  };
}

/**
 * Your wash: a mirror of what was named and chosen, in M10's order. Each
 * row: { key, step (the screen it opens), label, editName, lines: [{ text,
 * sub, good }] }. A trashed thought never appears. Several steps or
 * questions get a row each, so each opens its own thought.
 */
export function summaryRows(wash) {
  const c = washContent(wash);
  const rows = [
    { key: 'what', step: 'what', label: 'What happened', editName: 'what happened', lines: [{ text: c.what || SKIPPED }] },
    { key: 'kind', step: 'kind', label: 'The feeling', editName: 'the feeling', lines: [{ text: c.kind || SKIPPED, sub: c.words.length ? `${inWords(c.words)}.` : undefined }] },
    { key: 'rel', step: 'rel', label: 'Related to', editName: 'what it’s related to', lines: [{ text: c.related.length ? inWords(c.related) : SKIPPED }] },
  ];
  c.act.forEach((a, i) => rows.push({
    key: `act:${a.id}`,
    step: `w:${a.id}`,
    label: 'To act on',
    editName: c.act.length > 1 ? `what to act on, ${i + 1} of ${c.act.length}` : 'what to act on',
    lines: [{ text: a.step, sub: a.where || undefined, good: Boolean(a.where) }],
  }));
  c.reflect.forEach((r, i) => rows.push({
    key: `park:${r.id}`,
    step: `w:${r.id}`,
    label: 'To reflect on',
    editName: c.reflect.length > 1 ? `what to reflect on, ${i + 1} of ${c.reflect.length}` : 'what to reflect on',
    lines: [{ text: r.question }],
  }));
  return rows;
}

// ------------------------------------------------------------ saving

/** The saved item's name in the lists: never what was typed (a wash is private), never a date. */
export function washTitle() {
  return 'Your wash';
}

/**
 * What is saved as the row's answers. A finished wash lets its trashed
 * thoughts go for good: they are not saved.
 */
export function savedAnswers(wash, { finished = false } = {}) {
  const thoughts = (wash.thoughts || [])
    .filter((th) => !(finished && (th.wash === 'trash' || !clean(th.text))))
    .map((th) => ({
      id: text(th.id),
      text: text(th.text).slice(0, THOUGHT_MAX),
      true: said(th.t),
      logical: said(th.l),
      helpful: said(th.h),
      wash: washed(th.wash),
      step: th.wash === 'act' ? text(th.step).slice(0, STEP_MAX) : '',
      question: th.wash === 'park' ? text(th.question).slice(0, QUESTION_MAX) : '',
      where: th.wash === 'act' ? place(th.where) : null,
      strategy_id: th.wash === 'act' ? (th.strategyId || null) : null,
    }));
  const ids = new Set(thoughts.map((th) => th.id));
  return {
    version: 1,
    what: text(wash.what).slice(0, WHAT_MAX),
    kind: KINDS.some((k) => k.value === wash.kind) ? wash.kind : null,
    words: among(WORDS, wash.words),
    related: among(RELATED, wash.rel),
    thoughts,
    todos: Object.fromEntries(Object.entries(wash.todos || {})
      .filter(([thoughtId, made]) => ids.has(thoughtId) && made?.id)
      .map(([thoughtId, made]) => [thoughtId, { id: text(made.id), text: text(made.text), where: place(made.where), strategy_id: made.strategyId || null }])),
  };
}

/** A wash from a saved row's answers; anything damaged reads as not answered. */
export function washFrom(answers, newId = () => `thought-${Math.random().toString(36).slice(2)}`) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const thoughts = (Array.isArray(a.thoughts) ? a.thoughts : [])
    .filter((th) => th && typeof th === 'object')
    .map((th) => ({
      id: text(th.id) || newId(),
      text: text(th.text),
      t: said(th.true),
      l: said(th.logical),
      h: said(th.helpful),
      wash: washed(th.wash),
      step: text(th.step),
      question: text(th.question),
      where: place(th.where),
      strategyId: th.strategy_id || null,
    }));
  const todos = {};
  if (a.todos && typeof a.todos === 'object') {
    for (const [thoughtId, made] of Object.entries(a.todos)) {
      if (made && typeof made === 'object' && made.id && thoughts.some((th) => th.id === thoughtId)) {
        todos[thoughtId] = { id: text(made.id), text: text(made.text), where: place(made.where), strategyId: made.strategy_id || null };
      }
    }
  }
  return {
    what: text(a.what),
    kind: KINDS.some((k) => k.value === a.kind) ? a.kind : null,
    words: among(WORDS, a.words),
    rel: among(RELATED, a.related),
    thoughts: thoughts.length ? thoughts : [newThought(newId())],
    todos,
  };
}

/** True when anything has been typed or chosen (an untouched tool saves nothing). */
export function hasAnswers(wash) {
  return Boolean(clean(wash?.what) || wash?.kind || (wash?.words || []).length || (wash?.rel || []).length || (wash?.thoughts || []).some((th) => clean(th.text)));
}

/** Every screen is answered: the summary is whole. */
export function isComplete(wash) {
  return Boolean(clean(wash?.what) && wash?.kind && among(WORDS, wash?.words).length && typedThoughts(wash).length && !firstUnanswered(wash));
}
