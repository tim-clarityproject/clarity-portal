// Emotional wash (Polish 1, Stage D, 27 Nov: Draft 6's screens with Draft 7's word list): the tool's rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/emotional-wash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, FAMILIES, OLD_WORDS, REQUIRED, SKIPPED, STORY_ID, STRENGTHS, THOUGHT_EXAMPLES, TOOL, TOOL_NAME, TOOL_PATH, WHERE, WORDS,
  countLine, emptyWash, firstUncommitted, hasAnswers, isCommitted, isComplete, namedWords, otherThoughts, question, quote,
  requiredMessage, resumeStep, sameTodo, savedAnswers, setChoice, setThought, storyOf, strayTodos, strengthLine, summaryRows,
  talkLine, thoughtSteps, tidyWash, typedThoughts, wantedTodo, washContent, washFrom, washTitle, whenWords, whereLine, withFamily,
  withOtherRows, withStory, withTodo, wordsOf,
} from '../../src/lib/emotionalWash/model.js';
import { HUBS, PIN_GROUPS, TOOLS, areaOf as menuAreaOf } from '../../src/lib/navigation.js';
import { planRows, recentRows } from '../../src/lib/savedItems.js';
import { carryOnItems } from '../../src/lib/carryOn.js';
import { emotionalWashPdf } from '../../src/lib/pdf/docs/emotionalWash.js';
import { repeatsItsAnswer } from './second-lines.test.mjs';

let n = 0;
const id = () => `id-${(n += 1)}`;
const TODAY = new Date(2026, 10, 27);
const th = (tid, text, more = {}) => ({ id: tid, text, choice: null, step: '', when: null, where: null, strategyId: null, ...more });
// An invented wash, as the tool keeps it.
const sample = () => ({
  what: 'The chair backed the board member who undermined my plan in front of everyone.',
  family: 'angry',
  words: ['Resentful', 'Betrayed'],
  own: '',
  strength: 4,
  thoughts: [
    th(STORY_ID, 'The chair has never rated me.', { choice: 'park' }),
    th('b', 'If I push back, I’ll look weak.', { choice: 'go' }),
    th('c', 'I need to win the board back before the next meeting.', { choice: 'act', step: 'Ask the chair for 20 minutes before the next board meeting.', when: '2026-12-03', where: 'week', strategyId: 's1' }),
  ],
  todos: { c: { id: 'todo-1', text: 'Ask the chair for 20 minutes before the next board meeting.', where: 'week', strategyId: 's1' } },
  legacy: null,
});

// ------------------------------------------------------------ Draft 7's word list

test('Draft 7: eight families of difficult feelings, 56 words, each with its meaning, word for word', () => {
  assert.deepEqual(FAMILIES.map((f) => f.label), ['Angry', 'Overloaded', 'Afraid', 'Uncertain', 'Sad', 'Ashamed', 'Disconnected', 'On guard']);
  assert.equal(WORDS.length, 56);
  for (const f of FAMILIES) assert.equal(f.words.length, 7, f.label);
  assert.deepEqual(wordsOf('angry').map((w) => [w.label, w.hint]), [
    ['Irritated', 'Small things are getting to you.'],
    ['Frustrated', 'Something is blocking what you want.'],
    ['Indignant', 'You’ve been treated unfairly.'],
    ['Resentful', 'Still hurt by something unfair.'],
    ['Betrayed', 'Someone broke your trust.'],
    ['Bitter', 'Hurt that has hardened over time.'],
    ['Furious', 'Anger at full strength.'],
  ]);
  assert.deepEqual(wordsOf('guard').map((w) => w.label), ['Guarded', 'Defensive', 'Suspicious', 'Competitive', 'Envious', 'Jealous', 'Cornered']);
  assert.deepEqual(wordsOf('ashamed').map((w) => w.label)[2], 'Like an imposter');
  assert.equal(wordsOf('ashamed')[1].hint, 'Others saw what you’d rather they hadn’t.');
  assert.equal(new Set(WORDS).size, 56, 'every word once');
  // Every meaning is under 10 words, ends with a full stop and never tells the person what to do.
  for (const f of FAMILIES) for (const w of f.words) {
    assert.ok(w.hint.split(/\s+/).length < 10, w.hint);
    assert.match(w.hint, /\.$/);
    assert.equal(repeatsItsAnswer(w.label, w.hint), false, `${w.label} / ${w.hint}`);
  }
  // No clinical words.
  assert.doesNotMatch(WORDS.join(' '), /depressed|traumatised|traumatized/i);
});

test('How strong is it right now? Slight, Mild, Moderate, Strong, Intense, with the chosen word in the line under it', () => {
  assert.deepEqual(STRENGTHS.map((s) => [s.value, s.label]), [[1, 'Slight'], [2, 'Mild'], [3, 'Moderate'], [4, 'Strong'], [5, 'Intense']]);
  assert.equal(strengthLine(sample()), 'Resentful and betrayed');
  assert.equal(strengthLine({ ...sample(), words: ['Resentful'] }), 'Resentful');
  assert.equal(strengthLine({ ...sample(), words: [], own: '  Gutted ' }), 'Gutted');
  assert.equal(strengthLine({ ...sample(), words: [] }), null);
});

test('choosing a family keeps only its own words; their own word stays', () => {
  const w = { ...sample(), own: 'Gutted' };
  const sad = withFamily(w, 'sad');
  assert.equal(sad.family, 'sad');
  assert.deepEqual(sad.words, []);
  assert.equal(sad.own, 'Gutted');
  assert.deepEqual(namedWords(sad), ['Gutted']);
  assert.deepEqual(withFamily(w, 'angry').words, ['Resentful', 'Betrayed']);
  assert.equal(withFamily(w, 'nope'), w);
  assert.deepEqual(wordsOf(null), []);
});

// ------------------------------------------------------------ Draft 6's questions

test('each screen’s question, word for word (Draft 6)', () => {
  const t = sample().thoughts[0];
  assert.equal(question('what'), 'What happened?');
  assert.equal(question('family'), 'Which of these is it closest to?');
  assert.equal(question('words'), 'Which word fits best?');
  assert.equal(question('strength'), 'How strong is it right now?');
  assert.equal(question('story'), 'What are you telling yourself about it?');
  assert.equal(question('others'), 'What other thoughts come with it?');
  assert.equal(question('d', t), 'For “The chair has never rated me”, what will you do with it?');
  assert.equal(question('c', t), 'What will you do about “The chair has never rated me”, and when?');
  assert.deepEqual(CHOICES.map((c) => [c.value, c.label]), [['act', 'I’ll act on it.'], ['park', 'I’ll park it for now.'], ['go', 'I’ll let it go.']]);
  assert.equal(countLine(1, 3), 'Thought 1 of 3');
  assert.equal(countLine(1, 1), null, 'one thought needs no count');
});

test('every question follows Tim’s rules: short, What or How, no banned words', () => {
  const t = { text: 'They don’t rate me.' };
  const all = ['what', 'family', 'words', 'strength', 'story', 'others', 'd', 'c'].map((k) => question(k, t));
  for (const q of all) {
    assert.match(q, /^(What|Which|How|For )/, q);
    assert.doesNotMatch(q, /^Why\b|\b(reflect|journey|unpack|lean into|mindset|leverage|synergy|bandwidth|just|maybe|perhaps|kind of|should|failed|wrong|weak|could)\b/i, q);
  }
  for (const q of ['what', 'family', 'words', 'strength', 'story', 'others'].map((k) => question(k))) assert.ok(q.split(/\s+/).length <= 12, q);
});

test('"See an example" on the other thoughts shows three different examples, not one that assumes who they are', () => {
  assert.equal(THOUGHT_EXAMPLES.length, 3);
  assert.equal(new Set(THOUGHT_EXAMPLES).size, 3);
});

test('a thought is quoted without its last full stop, question mark or exclamation mark', () => {
  assert.equal(quote({ text: '  They never   listen! ' }), '“They never listen”');
  assert.equal(quote({ text: 'Why me?' }), '“Why me”');
});

test('the story is the first thought; the others are boxes of their own', () => {
  let w = emptyWash(id);
  assert.equal(storyOf(w).id, STORY_ID);
  assert.equal(otherThoughts(w).length, 1);
  w = withStory(w, 'They don’t rate me.');
  w = withOtherRows(w, ['I’ll look weak.', ''], null, id);
  w = withOtherRows(w, ['I’ll look weak.', '', 'Nobody tells me anything.'], null, id);
  assert.deepEqual(typedThoughts(w).map((t) => t.text), ['They don’t rate me.', 'I’ll look weak.', 'Nobody tells me anything.']);
  const gone = otherThoughts(w)[0];
  w = withOtherRows(w, ['', 'Nobody tells me anything.'], { removed: 0 }, id);
  assert.deepEqual(otherThoughts(w).map((t) => t.text), ['', 'Nobody tells me anything.']);
  w = withOtherRows(w, ['I’ll look weak.', '', 'Nobody tells me anything.'], { restored: 0 }, id, gone);
  assert.equal(otherThoughts(w)[0].id, gone.id, 'Undo puts the same thought back');
  // Taking out every box leaves one empty box; the story stays.
  w = withOtherRows(w, [], { removed: 0 }, id);
  w = withOtherRows({ ...w, thoughts: [storyOf(w)] }, [], { removed: 0 }, id);
  assert.equal(otherThoughts(w).length, 1);
  assert.equal(storyOf(w).text, 'They don’t rate me.');
});

test('one choice for each typed thought, then the commit screen for each thought to act on', () => {
  const w = sample();
  assert.deepEqual(thoughtSteps(w).map((s) => s.key), [`d:${STORY_ID}`, 'd:b', 'd:c', 'c:c']);
  const two = setChoice(w, 'b', 'act');
  assert.deepEqual(thoughtSteps(two).map((s) => s.key), [`d:${STORY_ID}`, 'd:b', 'd:c', 'c:b', 'c:c']);
  assert.deepEqual(thoughtSteps(two).filter((s) => s.kind === 'c').map((s) => [s.n, s.of]), [[1, 2], [2, 2]]);
  // An empty box is never asked about.
  assert.equal(thoughtSteps({ ...w, thoughts: [...w.thoughts, th('e', '   ')] }).length, 4);
  assert.equal(setChoice(w, 'b', 'burn'), w);
});

test('only the commit question can’t be skipped: it needs what and when; nothing else has a check', () => {
  for (const key of ['what', 'family', 'words', 'strength', 'story', 'others', 'd']) assert.equal(requiredMessage(key, {}), null, key);
  assert.equal(requiredMessage('c', { step: '' }), REQUIRED.step);
  assert.equal(REQUIRED.step, 'Type what you’ll do to carry on.');
  assert.equal(requiredMessage('c', { step: 'Ask the chair' }), REQUIRED.when);
  assert.equal(requiredMessage('c', { step: 'Ask the chair', when: '2026-12-03' }), null);
  assert.equal(requiredMessage('c', { step: 'Ask the chair', when: '2026-12-03' }, { needsStrategy: true }), REQUIRED.strategy);
  assert.equal(isCommitted({ step: 'x', when: '2026-12-03' }), true);
  assert.equal(isCommitted({ step: 'x', when: null }), false);
  assert.equal(firstUncommitted(sample()), null);
  assert.equal(firstUncommitted(setThought(sample(), 'c', { when: null })), 'c:c');
});

test('where an unfinished wash carries on: the first screen with nothing in it yet', () => {
  let w = emptyWash(id);
  assert.equal(resumeStep(w), 'what');
  w = { ...w, what: 'It happened.' };
  assert.equal(resumeStep(w), 'family');
  w = withFamily(w, 'sad');
  assert.equal(resumeStep(w), 'words');
  w = { ...w, words: ['Flat'] };
  assert.equal(resumeStep(w), 'strength');
  w = { ...w, strength: 2 };
  assert.equal(resumeStep(w), 'story');
  w = withStory(w, 'I always do this.');
  assert.equal(resumeStep(w), `d:${STORY_ID}`);
  w = setChoice(w, STORY_ID, 'act');
  assert.equal(resumeStep(w), `c:${STORY_ID}`);
  w = setThought(w, STORY_ID, { step: 'Ask Priya', when: '2026-12-01' });
  assert.equal(resumeStep(w), 'sum');
});

// ------------------------------------------------------------ to-dos

test('the to-do for a step: wanted only for a thought to act on that goes to this week or the backlog', () => {
  const t = sample().thoughts[2];
  assert.deepEqual(wantedTodo(t), { text: t.step, where: 'week', strategyId: 's1' });
  assert.equal(wantedTodo({ ...t, where: WHERE.none }), null);
  assert.equal(wantedTodo({ ...t, choice: 'park' }), null);
  assert.equal(wantedTodo({ ...t, step: '  ' }), null);
  assert.equal(sameTodo(sample().todos.c, wantedTodo(t)), true);
  assert.equal(sameTodo(sample().todos.c, { ...wantedTodo(t), where: 'backlog' }), false);
});

test('a to-do whose thought no longer wants one is a stray: parked, let go, taken out or "Don’t add it"', () => {
  assert.deepEqual(strayTodos(sample()), []);
  assert.deepEqual(strayTodos(setChoice(sample(), 'c', 'go')), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(strayTodos({ ...sample(), thoughts: sample().thoughts.slice(0, 2) }), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(withTodo(sample(), 'c', null).todos, {});
  assert.equal(whereLine(sample(), { id: 'c' }), 'It’s in this week’s to-dos.');
  assert.equal(whereLine(withTodo(sample(), 'c', { id: 'x', where: 'backlog' }), { id: 'c' }), 'It’s in your backlog.');
  assert.equal(whereLine(sample(), { id: 'b' }), null);
});

// ------------------------------------------------------------ the summary

test('Your wash: what happened, the word, what you’re telling yourself, and what you’ll act on, park or let go', () => {
  const rows = summaryRows(sample(), TODAY);
  assert.deepEqual(rows.map((r) => [r.label, r.step, r.lines[0].text, r.lines[0].sub ?? null]), [
    ['What happened', 'what', 'The chair backed the board member who undermined my plan in front of everyone.', null],
    ['The feeling', 'family', 'Resentful and betrayed', 'Angry'],
    ['How strong it is', 'strength', 'Strong', null],
    ['What you’re telling yourself', 'story', 'The chair has never rated me.', null],
    ['To act on', 'c:c', 'Ask the chair for 20 minutes before the next board meeting.', 'By Thu 3 Dec. It’s in this week’s to-dos.'],
    ['Parked for now', `d:${STORY_ID}`, 'The chair has never rated me.', null],
    ['Letting go', 'd:b', 'If I push back, I’ll look weak.', null],
  ]);
  const empty = summaryRows(emptyWash(id), TODAY);
  assert.deepEqual(empty.map((r) => r.lines[0].text), [SKIPPED, SKIPPED, SKIPPED, SKIPPED]);
  assert.equal(whenWords('2027-01-04', TODAY), 'Mon 4 Jan 2027', 'a day outside this year keeps its year');
});

test('the offer to talk it through names the person’s own coach, and nothing without one', () => {
  assert.equal(talkLine('Maya'), 'Want to talk this through with Maya?');
  assert.equal(talkLine(''), null);
  assert.equal(talkLine(null), null);
});

// ------------------------------------------------------------ saving

test('saving: version 2 keeps every answer; a finished wash lets its empty boxes go', () => {
  const s = savedAnswers({ ...sample(), thoughts: [...sample().thoughts, th('e', '')] });
  assert.equal(s.version, 2);
  assert.deepEqual([s.family, s.words, s.strength, s.own], ['angry', ['Resentful', 'Betrayed'], 4, '']);
  assert.equal(s.thoughts.length, 4);
  const done = savedAnswers({ ...sample(), thoughts: [...sample().thoughts, th('e', '')] }, { finished: true });
  assert.equal(done.thoughts.length, 3);
  assert.deepEqual(done.thoughts[2], { id: 'c', text: sample().thoughts[2].text, choice: 'act', step: sample().thoughts[2].step, when: '2026-12-03', where: 'week', strategy_id: 's1' });
  assert.deepEqual(done.todos, { c: { id: 'todo-1', text: sample().todos.c.text, where: 'week', strategy_id: 's1' } });
  // It opens as it was.
  const back = washFrom(done, id);
  assert.deepEqual(summaryRows(back, TODAY), summaryRows(sample(), TODAY));
  assert.equal(isComplete(back), true);
});

test('a wash saved before 27 Nov still opens and reads as it was', () => {
  const v1 = {
    version: 1,
    what: 'The chair backed the other plan.',
    kind: 'pa',
    words: ['Disappointment', 'Anger'],
    related: ['Respect'],
    thoughts: [
      { id: 'a', text: 'The chair has never rated me.', true: 'no', logical: 'unsure', helpful: 'no', wash: 'park', step: '', question: 'What would show me where I stand?', where: null, strategy_id: null },
      { id: 'c', text: 'I need to win the board back.', true: 'yes', logical: 'yes', helpful: 'yes', wash: 'act', step: 'Ask the chair for 20 minutes.', question: '', where: 'week', strategy_id: 's1' },
      { id: 'd', text: 'It’s hopeless.', wash: 'trash' },
    ],
    todos: { c: { id: 'todo-9', text: 'Ask the chair for 20 minutes.', where: 'week', strategy_id: 's1' } },
  };
  const w = washFrom(v1, id);
  assert.deepEqual(namedWords(w), ['Disappointment', 'Anger']);
  assert.deepEqual(OLD_WORDS.includes('Anger'), true);
  const rows = summaryRows(w, TODAY);
  assert.deepEqual(rows.map((r) => [r.label, r.lines[0].text, r.lines[0].sub ?? null]), [
    ['What happened', 'The chair backed the other plan.', null],
    ['The feeling', 'Disappointment and anger', null],
    ['How strong it is', SKIPPED, null],
    ['Related to', 'Respect', null],
    ['What you’re telling yourself', 'The chair has never rated me.', null],
    ['To act on', 'Ask the chair for 20 minutes.', 'It’s in this week’s to-dos.'],
    ['Parked for now', 'The chair has never rated me.', 'What would show me where I stand?'],
    ['Letting go', 'It’s hopeless.', null],
  ]);
  assert.equal(isComplete(w), true, 'a finished wash from before stays finished');
  assert.equal(resumeStep(w), 'strength', 'opened as a draft, it starts at the first screen with nothing in it');
  // Saved again, it keeps what only the old version had.
  const again = washFrom(savedAnswers(w), id);
  assert.deepEqual(summaryRows(again, TODAY), rows);
  // A draft kept on a device by the old version reads the same way.
  const draft = tidyWash({ what: 'x', kind: 'pr', words: ['Regret'], rel: ['Trust'], thoughts: [{ id: 't1', text: 'I always do this.', t: 'no', wash: 'act', step: 'Ask why', where: 'backlog', strategyId: 's1' }], todos: { t1: { id: 'todo2', text: 'Ask why', where: 'backlog', strategyId: 's1' } } }, id);
  assert.deepEqual([draft.words, storyOf(draft).text, storyOf(draft).choice, draft.legacy.related, draft.todos[STORY_ID].id], [['Regret'], 'I always do this.', 'act', ['Trust'], 'todo2']);
});

test('an untouched tool saves nothing; a wash is whole once every thought to act on has its step and day', () => {
  assert.equal(hasAnswers(emptyWash(id)), false);
  assert.equal(hasAnswers({ ...emptyWash(id), strength: 2 }), true);
  assert.equal(isComplete(emptyWash(id)), false);
  assert.equal(isComplete(sample()), true);
  assert.equal(isComplete(setThought(sample(), 'c', { when: null })), false);
  // Every other screen can be skipped: what happened alone is whole.
  assert.equal(isComplete({ ...emptyWash(id), what: 'It happened.' }), true);
});

test('the PDF mirrors the summary, leaves blanks out, and is confidential', () => {
  const doc = emotionalWashPdf({ wash: sample(), person: 'Sam Carter', createdAt: '2026-11-27T09:00:00' });
  assert.equal(doc.confidential, true);
  assert.deepEqual(doc.sections.filter((s) => s.blocks.length).map((s) => s.title), ['What happened', 'The feeling', 'How strong it is', 'What you’re telling yourself', 'To act on', 'Parked for now', 'Letting go']);
  assert.deepEqual(doc.glance.map((g) => [g.label, g.value]), [['The feeling', 'Resentful and betrayed'], ['How strong', 'Strong'], ['To act on', '1 step']]);
  const blank = emotionalWashPdf({ wash: emptyWash(id) });
  assert.equal(blank.sections.filter((s) => s.blocks.length).length, 0);
  assert.ok(blank.glance.length >= 2);
  assert.equal(washContent(sample(), TODAY).act[0].when, 'Thu 3 Dec');
});

// ------------------------------------------------------------ where it lives

test('the tool has its tile in Reset, with its one time', () => {
  assert.equal(TOOL, 'emotional_wash');
  assert.equal(TOOLS.wash.name, TOOL_NAME);
  assert.equal(TOOLS.wash.to, TOOL_PATH);
  assert.equal(TOOLS.wash.line, 'Identify emotions, the stories they’re rooted in, and how to move forward.'); // Draft 5 (Stage D item 5)
  assert.equal(TOOLS.wash.time, '~10 minutes');
  assert.deepEqual(HUBS.reset.groups[0].tools, ['breathe', 'wind', 'pp', 'wash', 'journal']);
  assert.equal(menuAreaOf(TOOL_PATH), 'personal');
  assert.ok(PIN_GROUPS.find((g) => g.title === 'Reset').tools.includes('wash'));
});

test('My plans lists a wash by a name that is never what was typed, and no hub’s recent list shows it', () => {
  assert.equal(washTitle(), 'Your wash');
  const data = { decisions: [], toolAnswers: [
    { id: 'w1', tool: 'emotional_wash', title: washTitle(), status: 'completed', createdAt: '2026-11-14T09:00:00.000Z', updatedAt: '2026-11-14T09:10:00.000Z', finishedAt: '2026-11-14T09:10:00.000Z' },
    { id: 'w2', tool: 'emotional_wash', title: washTitle(), status: 'draft', createdAt: '2026-11-14T10:00:00.000Z', updatedAt: '2026-11-14T10:10:00.000Z', finishedAt: null },
  ] };
  const rows = planRows(data, '2026-11-14');
  assert.deepEqual(rows.map((r) => [r.title, r.typeLabel, r.area, r.isDraft, r.to.path, r.to.state.checkId]).sort(), [
    ['Your wash', 'Emotional wash', 'personal', false, '/emotional-wash', 'w1'],
    ['Your wash', 'Emotional wash', 'personal', true, '/emotional-wash', 'w2'],
  ].sort());
  assert.deepEqual(recentRows(rows, 'personal'), []);
});

test('Home’s "Carry on where you left off" offers an unfinished wash by the tool’s name only', () => {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; } }, sessionStorage: { getItem: () => null, setItem: () => {} } };
  try {
    assert.deepEqual(carryOnItems('u1', { today: '2026-11-14', yesterday: '2026-11-13' }).filter((x) => x.key === 'emotional-wash'), []);
    store.set('ds-guide:emotional-wash-u1-new', JSON.stringify({ index: 4, skipped: [] }));
    const found = carryOnItems('u1', { today: '2026-11-14', yesterday: '2026-11-13' }).filter((x) => x.key === 'emotional-wash');
    assert.deepEqual(found.map((x) => [x.title, x.to]), [['Emotional wash', '/emotional-wash']]);
  } finally {
    delete globalThis.window;
  }
});

// The break-it tester, 14 Nov: a damaged draft stopped the page. Whatever a
// device kept, the screens get a wash they can draw.
test('a wash out of whatever a device kept: always the right shape', () => {
  let k = 0;
  const nid = () => `n${(k += 1)}`;
  const good = sample();
  assert.deepEqual(tidyWash(good, nid), good, 'a good wash is left as it is');
  for (const bad of [null, undefined, 5, 'x', [], [good]]) {
    const w = tidyWash(bad, nid);
    assert.deepEqual([w.what, w.family, w.words, w.own, w.strength, w.thoughts.length, storyOf(w).id, w.todos], ['', null, [], '', null, 2, STORY_ID, {}]);
  }
  const t = tidyWash({
    what: 5, family: 'nope', words: 'x', own: 7, strength: 9,
    thoughts: [null, 5, 'x', { id: 1, text: 5 }, { text: 'No id', choice: 'burn' }, { id: 't', text: 'T', choice: 'act', step: {}, when: 'soon', where: 'mars', strategyId: 9 }, { id: 't', text: 'Same id' }],
    todos: { t: 'x', zz: { id: 'gone' }, [undefined]: null },
  }, nid);
  assert.deepEqual([t.what, t.family, t.words, t.own, t.strength], ['', null, [], '', null]);
  assert.equal(storyOf(t).text, '');
  assert.equal(otherThoughts(t).length, 4);
  assert.equal(new Set(t.thoughts.map((x) => x.id)).size, 5, 'every thought has its own id');
  assert.deepEqual(otherThoughts(t).map((x) => [x.text, x.choice, x.step, x.when, x.where, x.strategyId]), [['', null, '', null, null, null], ['No id', null, '', null, null, null], ['T', 'act', '', null, null, null], ['Same id', null, '', null, null, null]]);
  assert.deepEqual(t.todos, {});
  for (const w of [t, tidyWash({ thoughts: 'x', todos: 'x' }, nid)]) {
    assert.doesNotThrow(() => { savedAnswers(w); summaryRows(w); washContent(w); hasAnswers(w); isComplete(w); resumeStep(w); thoughtSteps(w); });
  }
});
