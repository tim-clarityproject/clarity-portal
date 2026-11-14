// Emotional wash (M10, version 5.6): the tool's rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/emotional-wash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKS, CHECK_ANSWERS, FOLLOW, KINDS, RELATED, REQUIRED, SKIPPED, STARTERS, STORY_EXAMPLE, TOOL, TOOL_NAME, TOOL_PATH, WASHES, WHERE, WORDS,
  countLine, emptyWash, firstUnanswered, hasAnswers, isComplete, isWashed, nudge, percentAt, question, quote, quoteWords,
  requiredMessage, resumeStep, sameTodo, savedAnswers, setCheck, setThought, setWash, storyThoughts, strayTodos, summaryRows,
  typedThoughts, wantedTodo, washContent, washFrom, washSteps, washTitle, whereLine, withStoryRows, withTodo,
} from '../../src/lib/emotionalWash/model.js';
import { HUBS, PIN_GROUPS, TOOLS, areaOf as menuAreaOf } from '../../src/lib/navigation.js';
import { planRows, recentRows } from '../../src/lib/savedItems.js';
import { carryOnItems } from '../../src/lib/carryOn.js';
import { emotionalWashPdf } from '../../src/lib/pdf/docs/emotionalWash.js';
import { repeatsItsAnswer } from './second-lines.test.mjs';

let n = 0;
const id = () => `id-${(n += 1)}`;
const th = (text, more = {}) => ({ id: id(), text, t: null, l: null, h: null, wash: null, step: '', question: '', where: null, strategyId: null, ...more });
// M10's own invented wash.
const m10 = () => ({
  what: 'The chair backed the board member who undermined my plan in front of everyone.',
  kind: 'pa',
  words: ['Disappointment', 'Anger', 'Contempt'],
  rel: ['Respect', 'Loyalty'],
  thoughts: [
    { ...th('The chair has never rated me.'), id: 'a', t: 'no', l: 'unsure', h: 'no', wash: 'park', question: 'What would show me where I stand with the chair?' },
    { ...th('If I push back, I’ll look weak.'), id: 'b', t: 'unsure', l: 'no', h: 'no', wash: 'trash' },
    { ...th('I need to win the board back before the next meeting.'), id: 'c', t: 'yes', l: 'yes', h: 'yes', wash: 'act', step: 'Ask the chair for 20 minutes before the next board meeting.', where: 'week', strategyId: 's1' },
  ],
  todos: { c: { id: 'todo-1', text: 'Ask the chair for 20 minutes before the next board meeting.', where: 'week', strategyId: 's1' } },
});

test('the ten Geneva Emotion Wheel words, exactly as M10 has them', () => {
  assert.deepEqual(WORDS, ['Anger', 'Contempt', 'Disappointment', 'Disgust', 'Fear', 'Guilt', 'Hate', 'Regret', 'Sadness', 'Shame']);
});

test('the kinds of feeling, what it could be related to, and the three ways to wash', () => {
  assert.deepEqual(KINDS.map((k) => [k.label, k.hint]), [
    ['Future concern', 'It’s fear, anxiety or worry about what might happen.'],
    ['Present angst', 'It’s anger, disgust or shock about what’s happening now.'],
    ['Past regret', 'It’s sadness, shame or guilt about what happened.'],
  ]);
  assert.deepEqual(RELATED, ['Trust', 'Respect', 'Fairness', 'Loyalty', 'Recognition', 'Status', 'Control', 'Belonging', 'Security', 'Identity', 'Competence']);
  assert.deepEqual(WASHES.map((w) => [w.value, w.label, w.hint]), [
    ['act', 'Accept and act', 'Simplify it and move to action.'],
    ['park', 'Park and reflect', 'Turn it into a question to come back to.'],
    ['trash', 'Trash', 'It’s an unhelpful story, so let it go.'],
  ]);
  assert.deepEqual(CHECK_ANSWERS.map((a) => a.label), ['Yes', 'Not sure', 'No']);
});

test('no answer has a second line that only repeats it (rule 29ap)', () => {
  for (const o of [...KINDS, ...WASHES]) assert.equal(repeatsItsAnswer(o.label, o.hint), false, `${o.label} / ${o.hint}`);
});

test('Park and reflect asks its question, with three starters; Accept and act asks for one small step', () => {
  assert.equal(FOLLOW.park.label, 'What’s the question that will be helpful to reflect on?');
  assert.equal(FOLLOW.park.hint, 'Keep it open, starting with “What” or “How”. Tap one to start, then make it yours.');
  assert.deepEqual(STARTERS, ['What do I know for certain here?', 'What would I say to a friend in my place?', 'What matters most to me in this?']);
  assert.equal(FOLLOW.act.label, 'What’s one small step you’ll take?');
  assert.equal(FOLLOW.act.hint, 'Keep it small and clear.');
  assert.equal(STORY_EXAMPLE, 'The chair has never rated me.');
});

test('each screen’s question and the line under it, word for word', () => {
  assert.equal(question('what'), 'What happened?');
  assert.equal(nudge('what'), 'Write it as it happened, in a sentence or two.');
  assert.equal(question('kind'), 'What kind of feeling are you left with?');
  assert.equal(nudge('kind'), 'Choose the one that fits best.');
  assert.equal(question('words'), 'Which words fit the feeling?');
  assert.equal(nudge('words'), 'Choose as many as fit.');
  assert.equal(question('rel'), 'What could the feeling be related to?');
  assert.equal(nudge('rel'), 'Choose what feels threatened.');
  assert.equal(question('story'), 'What story are you telling yourself about what’s happened?');
  assert.equal(nudge('story'), 'Type one thought in each box.');
  const first = m10().thoughts[0];
  assert.equal(question('t', first), 'Is “The chair has never rated me” true?');
  assert.equal(question('l', first), 'Is “The chair has never rated me” logical?');
  assert.equal(question('h', first), 'Is “The chair has never rated me” helpful?');
  assert.equal(nudge('t'), 'Think about what you know for certain.');
  assert.equal(nudge('l'), 'Ask whether it follows from what happened, or jumps to a conclusion.');
  assert.equal(nudge('h'), 'Ask whether thinking it helps you act well.');
  assert.deepEqual(Object.keys(CHECKS), ['t', 'l', 'h']);
  assert.equal(question('w', first), 'How will you wash “The chair has never rated me”?');
  assert.equal(nudge('w'), 'Choose one.');
  assert.equal(question('w', first, { gone: true }), 'That thought has gone.');
  assert.equal(nudge('w', { gone: true }), 'It won’t appear in your summary.');
  assert.equal(countLine(1, 3), 'Thought 1 of 3');
});

test('a thought is quoted without its last full stop, question mark or exclamation mark', () => {
  assert.equal(quote({ text: '  They never   listen! ' }), '“They never listen”');
  assert.equal(quote({ text: 'Why me?' }), '“Why me”');
  assert.equal(quoteWords({ text: 'It’s over.' }), 'It’s over');
});

test('nothing in the tool rates how strong the feeling is', () => {
  const all = JSON.stringify([KINDS, WORDS, RELATED, WASHES, CHECK_ANSWERS, CHECKS, FOLLOW, REQUIRED, summaryRows(m10()), savedAnswers(m10())]);
  assert.doesNotMatch(all, /how strong|strength|intens|\/10|out of 10|\b1 to (5|10)\b/i);
});

test('true, logical and helpful are three screens for each typed thought, then how to wash it', () => {
  const w = m10();
  const steps = washSteps(w);
  assert.deepEqual(steps.map((s) => s.key), ['t:a', 'l:a', 'h:a', 'w:a', 't:b', 'l:b', 'h:b', 'w:b', 't:c', 'l:c', 'h:c', 'w:c']);
  assert.deepEqual(steps.map((s) => [s.n, s.of]).at(-1), [3, 3]);
  // An empty box has no screens.
  const withEmpty = { ...w, thoughts: [...w.thoughts, th('   ')] };
  assert.equal(washSteps(withEmpty).length, 12);
  assert.equal(typedThoughts(withEmpty).length, 3);
});

test('the % bar: M10’s 0, 9, 18, 27, 36 for the first five screens, then only ever forward', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((at) => percentAt(at, 3)), [0, 9, 18, 27, 36]);
  for (const count of [0, 1, 3, 10]) {
    let last = 36;
    for (let at = 5; at < 5 + 4 * Math.max(1, count); at += 1) {
      const p = percentAt(at, count);
      assert.ok(p > last && p < 100, `${count} thoughts, screen ${at}: ${p} after ${last}`);
      last = p;
    }
  }
  // Typing more thoughts on the story screen never moves the bar back from where it stands.
  assert.equal(percentAt(4, 1), percentAt(4, 9));
});

test('answers: a check takes yes, unsure or no; a wash takes act, park or trash; anything else is ignored', () => {
  let w = emptyWash(id);
  const first = w.thoughts[0].id;
  w = setThought(w, first, { text: 'They don’t rate me.' });
  assert.equal(setCheck(w, first, 't', 'maybe'), w);
  assert.equal(setCheck(w, first, 'x', 'yes'), w);
  w = setCheck(setCheck(setCheck(w, first, 't', 'no'), first, 'l', 'unsure'), first, 'h', 'yes');
  assert.deepEqual([w.thoughts[0].t, w.thoughts[0].l, w.thoughts[0].h], ['no', 'unsure', 'yes']);
  assert.equal(setWash(w, first, 'bin'), w);
  assert.equal(setWash(w, first, 'park').thoughts[0].wash, 'park');
});

test('a washing screen is answered once its follow-up is: a step to act on, a question to reflect on, nothing for Trash', () => {
  assert.equal(isWashed({ wash: null }), false);
  assert.equal(isWashed({ wash: 'act', step: '  ' }), false);
  assert.equal(isWashed({ wash: 'act', step: 'Call Jo' }), true);
  assert.equal(isWashed({ wash: 'park', question: '' }), false);
  assert.equal(isWashed({ wash: 'park', question: 'What now?' }), true);
  assert.equal(isWashed({ wash: 'trash' }), true);
});

test('the first screen still to answer, and where an unfinished wash carries on', () => {
  const w = m10();
  assert.equal(firstUnanswered(w), null);
  assert.equal(resumeStep(w), 'sum');
  assert.equal(firstUnanswered(setThought(w, 'b', { l: null })), 'l:b');
  assert.equal(firstUnanswered(setThought(w, 'c', { step: '' })), 'w:c');
  assert.equal(resumeStep({ ...w, what: ' ' }), 'what');
  assert.equal(resumeStep({ ...w, kind: null }), 'kind');
  assert.equal(resumeStep({ ...w, words: [] }), 'words');
  assert.equal(resumeStep({ ...w, thoughts: [th('')] }), 'story');
  assert.equal(resumeStep(setThought(w, 'a', { wash: null })), 'w:a');
  // "Related to" is optional: none chosen holds nothing up.
  assert.equal(resumeStep({ ...w, rel: [] }), 'sum');
});

test('a button is never greyed out: each screen says calmly what it needs', () => {
  const empty = emptyWash(id);
  assert.equal(requiredMessage('what', empty), 'Type what happened to carry on.');
  assert.equal(requiredMessage('words', empty), 'Choose at least one word to carry on.');
  assert.equal(requiredMessage('rel', empty), null);
  assert.equal(requiredMessage('story', empty), 'Type at least one thought to carry on.');
  const w = m10();
  assert.equal(requiredMessage('what', w), null);
  assert.equal(requiredMessage('words', w), null);
  assert.equal(requiredMessage('story', w), null);
  assert.equal(requiredMessage('w', w, { wash: null }), 'Choose one to carry on.');
  assert.equal(requiredMessage('w', w, { wash: 'act', step: ' ' }), 'Type one small step to carry on.');
  assert.equal(requiredMessage('w', w, { wash: 'act', step: 'Call Jo' }, { needsStrategy: true }), 'Choose a Strategy to carry on.');
  assert.equal(requiredMessage('w', w, { wash: 'act', step: 'Call Jo' }), null);
  assert.equal(requiredMessage('w', w, { wash: 'park', question: '' }), 'Type your question to carry on.');
  assert.equal(requiredMessage('w', w, { wash: 'park', question: 'What now?' }), null);
  assert.equal(requiredMessage('w', w, { wash: 'trash' }), null);
  for (const line of Object.values(REQUIRED)) assert.doesNotMatch(line, /fail/i);
});

test('the story’s boxes: typing, a new box, a box taken out and put back; a trashed thought has no box', () => {
  let w = emptyWash(id);
  w = withStoryRows(w, ['First'], null, id);
  w = withStoryRows(w, ['First', ''], null, id);
  w = withStoryRows(w, ['First', 'Second'], null, id);
  w = withStoryRows(w, ['First', 'Second', 'Third'], null, id);
  assert.deepEqual(w.thoughts.map((t) => t.text), ['First', 'Second', 'Third']);
  const [one, two, three] = w.thoughts.map((t) => t.id);
  assert.equal(new Set([one, two, three]).size, 3);
  // Typing keeps each thought's own answers.
  w = setCheck(w, two, 't', 'no');
  w = withStoryRows(w, ['First', 'Second, reworded', 'Third'], null, id);
  assert.equal(w.thoughts[1].id, two);
  assert.equal(w.thoughts[1].t, 'no');
  // Taken out, then Undo: the same thought, in the same place, with its answers.
  const gone = w.thoughts[1];
  w = withStoryRows(w, ['First', 'Third'], { removed: 1 }, id);
  assert.deepEqual(w.thoughts.map((t) => t.id), [one, three]);
  w = withStoryRows(w, ['First', 'Second, reworded', 'Third'], { restored: 1 }, id, gone);
  assert.deepEqual(w.thoughts.map((t) => [t.id, t.t]), [[one, null], [two, 'no'], [three, null]]);
  // Trashed: it has no box, and typing in the others never loses it.
  w = setWash(w, two, 'trash');
  assert.deepEqual(storyThoughts(w).map((t) => t.id), [one, three]);
  w = withStoryRows(w, ['First', 'Third, reworded'], null, id);
  assert.deepEqual(w.thoughts.map((t) => t.id).sort(), [one, two, three].sort());
  assert.equal(w.thoughts.find((t) => t.id === three).text, 'Third, reworded');
  // The only box taken out leaves one empty box.
  let solo = withStoryRows(emptyWash(id), ['Only'], null, id);
  solo = withStoryRows(solo, [''], { removed: 0 }, id);
  assert.deepEqual(solo.thoughts.map((t) => t.text), ['']);
});

test('the to-do for a step: wanted only for a step to act on that goes to this week or the backlog', () => {
  assert.equal(wantedTodo({ wash: 'park', step: 'x', where: 'week' }), null);
  assert.equal(wantedTodo({ wash: 'act', step: ' ', where: 'week' }), null);
  assert.equal(wantedTodo({ wash: 'act', step: 'Call Jo', where: 'none' }), null);
  assert.equal(wantedTodo({ wash: 'act', step: 'Call Jo', where: null }), null);
  assert.deepEqual(wantedTodo({ wash: 'act', step: ' Call  Jo ', where: 'backlog', strategyId: 's2' }), { text: 'Call Jo', where: 'backlog', strategyId: 's2' });
  const made = { id: 't1', text: 'Call Jo', where: 'backlog', strategyId: 's2' };
  assert.equal(sameTodo(made, { text: 'Call Jo', where: 'backlog', strategyId: 's2' }), true);
  assert.equal(sameTodo(made, { text: 'Call Jo today', where: 'backlog', strategyId: 's2' }), false);
  assert.equal(sameTodo(made, { text: 'Call Jo', where: 'week', strategyId: 's2' }), false);
  assert.equal(sameTodo(made, { text: 'Call Jo', where: 'backlog', strategyId: 's3' }), false);
  assert.equal(sameTodo(null, null), false);
  assert.deepEqual(Object.values(WHERE), ['week', 'backlog', 'none']);
});

test('a to-do whose thought no longer wants one is a stray: parked, trashed, taken out or "Don’t add it"', () => {
  const w = m10();
  assert.deepEqual(strayTodos(w), []);
  assert.deepEqual(strayTodos(setWash(w, 'c', 'park')), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(strayTodos(setWash(w, 'c', 'trash')), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(strayTodos(setThought(w, 'c', { where: 'none' })), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(strayTodos({ ...w, thoughts: w.thoughts.slice(0, 2) }), [{ thoughtId: 'c', id: 'todo-1' }]);
  assert.deepEqual(withTodo(w, 'c', null).todos, {});
  assert.equal(withTodo(w, 'a', { id: 'x' }).todos.a.id, 'x');
});

test('the summary only says where a step is when its to-do is really there', () => {
  const w = m10();
  assert.equal(whereLine(w, w.thoughts[2]), 'It’s in this week’s to-dos.');
  assert.equal(whereLine({ ...w, todos: { c: { ...w.todos.c, where: 'backlog' } } }, w.thoughts[2]), 'It’s in your backlog.');
  assert.equal(whereLine({ ...w, todos: {} }, w.thoughts[2]), null);
  assert.equal(whereLine(w, w.thoughts[0]), null);
});

test('Your wash: a mirror of what was named and chosen, in M10’s order; a trashed thought never appears', () => {
  const rows = summaryRows(m10());
  assert.deepEqual(rows.map((r) => [r.label, r.step, r.editName]), [
    ['What happened', 'what', 'what happened'],
    ['The feeling', 'kind', 'the feeling'],
    ['Related to', 'rel', 'what it’s related to'],
    ['To act on', 'w:c', 'what to act on'],
    ['To reflect on', 'w:a', 'what to reflect on'],
  ]);
  assert.deepEqual(rows[0].lines, [{ text: 'The chair backed the board member who undermined my plan in front of everyone.' }]);
  assert.deepEqual(rows[1].lines, [{ text: 'Present angst', sub: 'Disappointment, anger and contempt.' }]);
  assert.deepEqual(rows[2].lines, [{ text: 'Respect and loyalty' }]);
  assert.deepEqual(rows[3].lines, [{ text: 'Ask the chair for 20 minutes before the next board meeting.', sub: 'It’s in this week’s to-dos.', good: true }]);
  assert.deepEqual(rows[4].lines, [{ text: 'What would show me where I stand with the chair?' }]);
  assert.doesNotMatch(JSON.stringify(rows), /look weak/);
});

test('Your wash: words in the order they were chosen, several steps a row each, and nothing chosen says so', () => {
  const w = m10();
  assert.equal(summaryRows({ ...w, words: ['Shame', 'Anger'] })[1].lines[0].sub, 'Shame and anger.');
  assert.equal(summaryRows({ ...w, words: ['Fear'] })[1].lines[0].sub, 'Fear.');
  assert.equal(summaryRows({ ...w, rel: [] })[2].lines[0].text, SKIPPED);
  const two = { ...w, thoughts: [...w.thoughts, { ...th('Nobody backs me.'), id: 'd', wash: 'act', step: 'Ask Priya what she saw.', where: 'none' }] };
  const act = summaryRows(two).filter((r) => r.label === 'To act on');
  assert.deepEqual(act.map((r) => [r.step, r.editName, r.lines[0].sub]), [['w:c', 'what to act on, 1 of 2', 'It’s in this week’s to-dos.'], ['w:d', 'what to act on, 2 of 2', undefined]]);
  assert.equal(new Set(summaryRows(two).map((r) => r.key)).size, summaryRows(two).length);
  // Everything trashed: no rows to act on or reflect on.
  const none = { ...w, thoughts: w.thoughts.map((t) => ({ ...t, wash: 'trash' })) };
  assert.deepEqual(summaryRows(none).map((r) => r.label), ['What happened', 'The feeling', 'Related to']);
});

test('saving: a draft keeps everything; a finished wash lets its trashed thoughts and empty boxes go for good', () => {
  const w = { ...m10(), thoughts: [...m10().thoughts, th('')] };
  const draft = savedAnswers(w);
  assert.equal(draft.version, 1);
  assert.equal(draft.thoughts.length, 4);
  const done = savedAnswers(w, { finished: true });
  assert.deepEqual(done.thoughts.map((t) => t.id), ['a', 'c']);
  assert.doesNotMatch(JSON.stringify(done), /look weak/);
  assert.deepEqual(done.thoughts[0], { id: 'a', text: 'The chair has never rated me.', true: 'no', logical: 'unsure', helpful: 'no', wash: 'park', step: '', question: 'What would show me where I stand with the chair?', where: null, strategy_id: null });
  assert.deepEqual(done.todos, { c: { id: 'todo-1', text: 'Ask the chair for 20 minutes before the next board meeting.', where: 'week', strategy_id: 's1' } });
  assert.deepEqual([done.kind, done.words, done.related], ['pa', ['Disappointment', 'Anger', 'Contempt'], ['Respect', 'Loyalty']]);
  // Nothing in what is saved says who can see it: a wash is never shared.
  assert.equal('shared' in done || 'shared_with_coach' in done, false);
});

test('a saved wash opens as it was; anything damaged reads as not answered', () => {
  const back = washFrom(savedAnswers(m10(), { finished: true }), id);
  assert.deepEqual(summaryRows(back).map((r) => r.lines[0].text), summaryRows(m10()).map((r) => r.lines[0].text));
  assert.equal(isComplete(back), true);
  const bad = washFrom({ what: 7, kind: 'zz', words: ['Anger', 'Joy', 3], related: 'Trust', thoughts: [null, 'x', { text: 'Kept', true: 'perhaps', wash: 'burn', where: 'moon' }], todos: { nobody: { id: 't9' } } }, id);
  assert.equal(bad.what, '7');
  assert.equal(bad.kind, null);
  assert.deepEqual(bad.words, ['Anger']);
  assert.deepEqual(bad.rel, []);
  assert.equal(bad.thoughts.length, 1);
  assert.deepEqual([bad.thoughts[0].text, bad.thoughts[0].t, bad.thoughts[0].wash, bad.thoughts[0].where], ['Kept', null, null, null]);
  assert.deepEqual(bad.todos, {});
  assert.equal(washFrom(null, id).thoughts.length, 1);
  assert.equal(washFrom(undefined, id).what, '');
});

test('an untouched tool saves nothing; a wash is whole once every screen is answered', () => {
  assert.equal(hasAnswers(emptyWash(id)), false);
  assert.equal(hasAnswers({ ...emptyWash(id), kind: 'fc' }), true);
  assert.equal(hasAnswers({ ...emptyWash(id), thoughts: [th('x')] }), true);
  assert.equal(isComplete(m10()), true);
  assert.equal(isComplete({ ...m10(), words: [] }), false);
  assert.equal(isComplete(setThought(m10(), 'a', { h: null })), false);
  assert.equal(isComplete({ ...m10(), thoughts: [th('')] }), false);
});

test('what the PDF and the summary read: blanks left out', () => {
  const c = washContent({ ...m10(), rel: [], thoughts: [...m10().thoughts, { ...th('Unfinished'), wash: 'act', step: ' ' }, { ...th('Unasked'), wash: 'park', question: '' }] });
  assert.deepEqual(c.related, []);
  assert.deepEqual(c.act.map((a) => a.step), ['Ask the chair for 20 minutes before the next board meeting.']);
  assert.deepEqual(c.reflect.map((r) => r.question), ['What would show me where I stand with the chair?']);
});

test('the PDF mirrors the summary, leaves blanks and trashed thoughts out, and is confidential', () => {
  const doc = emotionalWashPdf({ wash: m10(), person: 'Sam Carter', createdAt: '2026-11-14T09:30:00' });
  assert.equal(doc.title, 'Emotional wash');
  assert.equal(doc.confidential, true);
  assert.deepEqual(doc.sections.filter((s) => s.blocks.length).map((s) => s.title), ['What happened', 'The feeling', 'Related to', 'To act on', 'To reflect on']);
  assert.ok(doc.glance.length >= 2 && doc.glance.length <= 4);
  assert.doesNotMatch(JSON.stringify(doc), /look weak/);
  const bare = emotionalWashPdf({ wash: { ...emptyWash(id), what: 'It went badly.' }, createdAt: '2026-11-14T09:30:00' });
  assert.deepEqual(bare.sections.filter((s) => s.blocks.length).map((s) => s.title), ['What happened']);
  assert.ok(bare.glance.length >= 2 && bare.glance.every((g) => String(g.value).trim()));
});

test('the tool has its tile in Reset, where M3 has it, with M3’s line and one time', () => {
  assert.equal(TOOL, 'emotional_wash');
  assert.equal(TOOLS.wash.name, TOOL_NAME);
  assert.equal(TOOLS.wash.to, TOOL_PATH);
  assert.equal(TOOLS.wash.line, 'Work through a strong emotion so it doesn’t run you.');
  assert.equal(TOOLS.wash.time, '~10 minutes');
  assert.deepEqual(HUBS.reset.groups[0].tools, ['breathe', 'wind', 'pp', 'wash', 'journal']);
  assert.equal(menuAreaOf(TOOL_PATH), 'personal');
  assert.ok(PIN_GROUPS.find((g) => g.title === 'Reset').tools.includes('wash'));
});

test('My Plans lists a wash by a name that is never what was typed, and no hub’s recent list shows it', () => {
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
