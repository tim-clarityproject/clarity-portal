// Get unstuck (M9, version 12): the tool's rules, with no screen.
//   node --import ./tests/scores/register.mjs --test tests/performance/get-unstuck.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED, STAGE, STEP_KEYS, WHERE, emptyPlan, finishMessage, goalQuote, hasAnswers, inThisWeek, nudge, optionChoices,
  pickedOptions, planContent, planFrom, planTitle, question, removeOption, requiredMessage, savedForm, setAct,
  summaryRows, togglePick, whereLine,
} from '../../src/lib/getUnstuck/model.js';
import { GET_UNSTUCK_STEPS, RENAMED, TOOLS, renamedPath } from '../../src/lib/navigation.js';
import { cleanCode, cleanEmail, emailFromSearch, guestError, tokenFrom, visitEnded, visitFrom, GUEST_WORDS } from '../../src/lib/guest/rules.js';

let n = 0;
const id = () => `id-${(n += 1)}`;
const full = () => {
  let p = { ...emptyPlan(), goal: 'Cut our time to hire to 30 days by March', cons: ['One recruiter', ''], opps: ['Referrals'], opts: ['Agree a 48-hour rule', 'Pilot one-day loops', ''] };
  p = togglePick(p, 0, id);
  p = togglePick(p, 1, id);
  return p;
};

test('the screens, in M9’s order, with the stage names above the questions', () => {
  assert.deepEqual(STEP_KEYS, ['goal', 'cons', 'opps', 'opts', 'will', 'steps', 'sum']);
  assert.deepEqual(STEP_KEYS.map((k) => STAGE[k]), ['Goal', 'Reality', 'Reality', 'Options', 'Will', 'Will', '']);
});

test('the questions carry the goal in quote marks, word for word', () => {
  const p = full();
  assert.equal(question('goal', p), 'What do you want to achieve?');
  assert.equal(question('cons', p), 'What’s in the way of “Cut our time to hire to 30 days by March”?');
  assert.equal(question('opps', p), 'What’s already working for you on “Cut our time to hire to 30 days by March”?');
  assert.equal(question('opts', p), 'What could you do to reach “Cut our time to hire to 30 days by March”?');
  assert.equal(question('will', p), 'Which options will you act on?');
  assert.equal(question('steps', p), 'What exactly will you do?');
  assert.equal(question('sum', p, { name: 'Jordan' }), 'Here’s your plan, Jordan.');
  assert.equal(question('sum', p, { name: 'Jordan', guest: true }), 'Here’s your plan.');
  assert.equal(question('sum', p, {}), 'Here’s your plan.');
  assert.equal(goalQuote(emptyPlan()), '“your goal”');
});

test('the line under each question; a guest starts soon, not this week', () => {
  assert.equal(nudge('goal'), 'Make it specific enough to know when you’re there.');
  assert.equal(nudge('cons'), 'Type one constraint in each box.');
  assert.equal(nudge('opps'), 'Type one opportunity in each box.');
  assert.equal(nudge('opts'), 'Type one option in each box, however unlikely.');
  assert.equal(nudge('will'), 'Pick all that apply.');
  assert.equal(nudge('steps'), 'Make each one something you can start this week.');
  assert.equal(nudge('steps', { guest: true }), 'Make each one something you can start soon.');
  assert.equal(nudge('sum'), null);
});

test('only the goal and the choice are needed, each with its calm message', () => {
  const p = emptyPlan();
  assert.equal(requiredMessage('goal', p), 'Type your goal to carry on.');
  assert.equal(requiredMessage('goal', { ...p, goal: '   ' }), REQUIRED.goal);
  assert.equal(requiredMessage('goal', { ...p, goal: 'x' }), null);
  assert.equal(requiredMessage('will', p), 'Choose at least one option to carry on.');
  assert.equal(requiredMessage('will', full()), null);
  for (const k of ['cons', 'opps', 'opts', 'steps', 'sum']) assert.equal(requiredMessage(k, p), null);
});

test('choosing an option adds a next step with its words; choosing it again takes it away', () => {
  let p = full();
  assert.deepEqual(optionChoices(p), [{ value: 0, label: 'Agree a 48-hour rule' }, { value: 1, label: 'Pilot one-day loops' }]);
  assert.deepEqual(pickedOptions(p), [0, 1]);
  assert.equal(p.acts[0].text, 'Agree a 48-hour rule');
  assert.equal(p.acts[0].where, null);
  p = togglePick(p, 0, id);
  assert.deepEqual(pickedOptions(p), [1]);
  assert.equal(togglePick(p, 2, id), p, 'an empty box can’t be chosen');
});

test('taking an option out keeps each next step on its own option', () => {
  let p = full();
  p = setAct(p, p.acts[1].id, { text: 'Pilot loops with Priya’s team' });
  p = removeOption(p, 0);
  assert.deepEqual(p.opts, ['Pilot one-day loops', '']);
  assert.equal(p.acts[0].option, null, 'its option has gone, the step stays as written');
  assert.equal(p.acts[1].option, 0);
  assert.equal(p.acts[1].text, 'Pilot loops with Priya’s team');
  assert.deepEqual(removeOption({ ...emptyPlan(), opts: ['only'] }, 0).opts, ['']);
});

test('where each next step is, in M9’s words (the Backlog’s from M10)', () => {
  assert.deepEqual(whereLine({ where: WHERE.week }, 2), { line: 'It’s in this week’s sprint.', good: true, link: 'Edit', linkLabel: 'Edit next step 2 in this week' });
  assert.deepEqual(whereLine({ where: WHERE.backlog }, 1), { line: 'It’s in your backlog.', good: false, link: 'Edit', linkLabel: 'Edit next step 1 in your backlog' });
  for (const where of [null, WHERE.none, undefined]) {
    assert.deepEqual(whereLine({ where }, 1), { line: 'It isn’t in this week’s sprint yet.', good: false, link: 'Add to this week', linkLabel: 'Add next step 1 to this week' });
  }
});

test('the message on This week counts the next steps in this week', () => {
  let p = full();
  assert.equal(finishMessage(p), 'Saved');
  p = setAct(p, p.acts[0].id, { where: WHERE.week });
  assert.equal(inThisWeek(p), 1);
  assert.equal(finishMessage(p), '1 next step is in this week');
  p = setAct(p, p.acts[1].id, { where: WHERE.week });
  assert.equal(finishMessage(p), '2 next steps are in this week');
  p = setAct(p, p.acts[1].id, { where: WHERE.backlog });
  assert.equal(finishMessage(p), '1 next step is in this week');
  p = setAct(p, p.acts[0].id, { text: '  ' });
  assert.equal(finishMessage(p), 'Saved', 'a step with no words counts for nothing');
});

test('Your plan: five rows in M9’s order, blanks say so, a guest sees no sprint lines', () => {
  let p = full();
  p = setAct(p, p.acts[0].id, { where: WHERE.week });
  const rows = summaryRows(p);
  assert.deepEqual(rows.map((r) => r.label), ['Your goal', 'What’s in the way', 'What’s already working', 'Your options', 'Your next steps']);
  assert.deepEqual(rows.map((r) => r.step), ['goal', 'cons', 'opps', 'opts', 'steps']);
  assert.deepEqual(rows.map((r) => `Edit ${r.editName}`), ['Edit your goal', 'Edit what’s in the way', 'Edit what’s already working', 'Edit your options', 'Edit your next steps']);
  assert.deepEqual(rows[1].lines, [{ text: 'One recruiter' }]);
  assert.deepEqual(rows[4].lines[0], { text: 'Agree a 48-hour rule', sub: 'It’s in this week’s sprint.', good: true });
  assert.deepEqual(rows[4].lines[1], { text: 'Pilot one-day loops', sub: 'It isn’t in this week’s sprint yet.', good: false });
  assert.deepEqual(summaryRows(p, { guest: true })[4].lines, [{ text: 'Agree a 48-hour rule' }, { text: 'Pilot one-day loops' }]);
  assert.deepEqual(summaryRows({ ...emptyPlan(), goal: 'g' })[1].lines, [{ text: 'You skipped this.' }]);
});

test('saved in the old pages’ shape too, so old readers still work', () => {
  let p = full();
  p = setAct(p, p.acts[0].id, { where: WHERE.week, todoId: 't1', strategyId: 's1' });
  const f = savedForm({ ...p, shared: true });
  assert.equal(f.goal, p.goal);
  assert.equal(f.constraints, 'One recruiter');
  assert.equal(f.opportunities, 'Referrals');
  assert.deepEqual(f.options, p.opts);
  assert.equal(f.will_do, 'Agree a 48-hour rule\nPilot one-day loops');
  assert.equal(f.version, 2);
  assert.equal(f.shared_with_coach, true);
  assert.deepEqual(f.next_steps[0], { id: p.acts[0].id, option: 0, text: 'Agree a 48-hour rule', where: 'week', todo_id: 't1', strategy_id: 's1' });
  const back = planFrom(JSON.parse(JSON.stringify(f)), id);
  assert.deepEqual(back, { ...p, shared: true });
});

test('an old saved row opens on the new screens', () => {
  const old = { goal: 'Hire faster', constraints: 'One recruiter\n\nTwo sign-offs', opportunities: 'Referrals', options: ['Agree a rule', 'Pilot loops'], will_do: 'Agree a rule\nTalk to Priya on Monday' };
  const p = planFrom(old, id);
  assert.equal(p.goal, 'Hire faster');
  assert.deepEqual(p.cons, ['One recruiter', 'Two sign-offs']);
  assert.deepEqual(p.opps, ['Referrals']);
  assert.deepEqual(p.opts, ['Agree a rule', 'Pilot loops']);
  assert.deepEqual(p.acts.map((a) => [a.option, a.text, a.where]), [[0, 'Agree a rule', null], [null, 'Talk to Priya on Monday', null]]);
  assert.equal(p.shared, false);
  // Nothing at all, or something odd: an empty tool, never a crash.
  for (const odd of [null, undefined, 'text', 7, [], { options: 'a\nb', next_steps: 'x' }]) {
    const q = planFrom(odd, id);
    assert.ok(Array.isArray(q.cons) && q.cons.length >= 1 && Array.isArray(q.acts));
  }
  assert.deepEqual(planFrom({ options: 'a\nb' }, id).opts, ['a', 'b']);
});

test('the saved name, what counts as an answer, and what the PDF and email read', () => {
  assert.equal(planTitle(emptyPlan()), 'Get unstuck');
  assert.equal(planTitle({ goal: '  Hire   faster ' }), 'Hire faster');
  const long = planTitle({ goal: 'word '.repeat(40) });
  assert.ok(long.length <= 80 && !long.endsWith(' '));
  assert.equal(hasAnswers(emptyPlan()), false);
  assert.equal(hasAnswers({ ...emptyPlan(), opps: ['', 'x'] }), true);
  assert.deepEqual(planContent(full()), {
    goal: 'Cut our time to hire to 30 days by March',
    constraints: ['One recruiter'],
    opportunities: ['Referrals'],
    options: ['Agree a 48-hour rule', 'Pilot one-day loops'],
    nextSteps: ['Agree a 48-hour rule', 'Pilot one-day loops'],
  });
});

test('one address, one time: the old step addresses all come to /get-unstuck', () => {
  assert.equal(TOOLS.grow.to, '/get-unstuck');
  assert.equal(TOOLS.grow.time, '~15 minutes');
  for (const old of ['/grow-step-1', '/grow-step-2', '/grow-step-3', '/grow-step-3b-prioritize', '/grow-step-4']) {
    assert.equal(RENAMED[old], '/get-unstuck');
    assert.equal(renamedPath(old), '/get-unstuck');
  }
  assert.deepEqual(GET_UNSTUCK_STEPS, ['/get-unstuck/reality', '/get-unstuck/options', '/get-unstuck/prioritise', '/get-unstuck/will-do']);
});

test('guest links: the token, the code and the email as 035 reads them', () => {
  const token = 'ab'.repeat(32);
  assert.equal(tokenFrom(token), token);
  assert.equal(tokenFrom(token.toUpperCase()), token);
  for (const bad of ['', 'abc', `${token}0`, 'z'.repeat(64), null]) assert.equal(tokenFrom(bad), null);
  assert.equal(cleanCode(' k7q-2rm '), 'K7Q2RM');
  assert.equal(cleanCode('K7Q2RMXX'), 'K7Q2RM');
  assert.equal(cleanCode('Ｋ７Ｑ２ＲＭ'), 'K7Q2RM');
  assert.equal(cleanEmail(' alex@example.com '), 'alex@example.com');
  for (const bad of ['', 'alex', 'a@b', 'a b@example.com']) assert.equal(cleanEmail(bad), '');
  assert.equal(emailFromSearch('?email=alex%40example.com'), 'alex@example.com');
  assert.equal(emailFromSearch('?email=javascript:alert(1)'), '');
  assert.equal(emailFromSearch(''), '');
});

test('guest links: 035’s answers in the page’s names, and one calm line for a refusal', () => {
  // guest_open's answer, exactly as 035 builds it.
  const answer = { ok: true, visit: 'cd'.repeat(32), tool: 'grow', tool_label: 'Get unstuck', coach_name: 'Tim', link_expires_at: '2026-12-14T10:00:00+00:00', confirmed: false };
  assert.deepEqual(visitFrom(answer, 'alex@example.com'), { visit: answer.visit, email: 'alex@example.com', tool: 'grow', toolLabel: 'Get unstuck', coachName: 'Tim' });
  // The functions aren't there yet (035 not run): one calm line.
  assert.equal(guestError({ code: 'PGRST202', message: 'Could not find the function public.guest_open' }, GUEST_WORDS.open), GUEST_WORDS.notReady);
  // 035's own plain refusals are shown as written.
  const ended = { code: '42501', message: 'That visit has ended. Open your link again.' };
  assert.equal(guestError(ended, GUEST_WORDS.save), 'That visit has ended. Open your link again.');
  assert.equal(visitEnded(ended), true);
  assert.equal(visitEnded({ code: '42501', message: 'That isn’t yours, so it wasn’t changed. Open your own link to carry on.' }), false);
  // Raw database text never shows.
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(guestError({ code: '42501', message: 'permission denied for function guest_save' }, GUEST_WORDS.save), GUEST_WORDS.save);
    assert.equal(guestError({ code: 'XX000', message: 'boom' }, GUEST_WORDS.save), GUEST_WORDS.save);
  } finally {
    console.error = quiet;
  }
  for (const line of Object.values(GUEST_WORDS)) assert.ok(!/fail/i.test(line) && line.endsWith('.'));
});
