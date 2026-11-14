// Get unstuck (mock-up M9, version 12; Tim, 13 Nov): the tool's rules, with
// no screen in them, so the page, the guest page, the PDF, the email and
// the tests all read one answer.
//
// The screens, in order (one question each):
//   goal   Goal     "What do you want to achieve?"            required
//   cons   Reality  "What’s in the way of “goal”?"            rows
//   opps   Reality  "What’s already working for you on “goal”?" rows
//   opts   Options  "What could you do to reach “goal”?"      the timer, rows
//   will   Will     "Which options will you act on?"          at least one
//   steps  Will     "What exactly will you do?"               one box each
//   sum             "Here’s your plan, Sam."                  every answer
//
// A plan while it is being worked on:
//   { goal, cons: [text], opps: [text], opts: [text],
//     acts: [{ id, option, text, where, todoId, strategyId }],
//     shared }
// `option` is the place in opts of the option a next step came from (null
// once that option has gone); `where` is where its to-do went: 'week',
// 'backlog', 'none' (Don’t add it) or null (not asked yet).
//
// Saved in `decisions` with tool_type 'grow', as before. The saved shape
// keeps the fields the old pages wrote (goal, constraints, opportunities,
// options, will_do), so anything that reads an old row reads a new one,
// and adds the lists and the next steps beside them (savedForm, planFrom).

export const TOOL_TYPE = 'grow';
export const TOOL_NAME = 'Get unstuck';
export const TODO_SOURCE = 'get_unstuck';
export const GOAL_MAX = 300;
export const ROW_MAX = 300;
export const WHERE = { week: 'week', backlog: 'backlog', none: 'none' };

export const STEP_KEYS = ['goal', 'cons', 'opps', 'opts', 'will', 'steps', 'sum'];

/** The small grey stage name above each question (the GROW model, without an explaining line). */
export const STAGE = { goal: 'Goal', cons: 'Reality', opps: 'Reality', opts: 'Options', will: 'Will', steps: 'Will', sum: '' };

export const GOAL_EXAMPLE = 'Win the Northfield contract renewal by the end of January.';
export const PLACEHOLDER = {
  goal: 'e.g. Cut our time to hire to 30 days by March',
  cons: 'e.g. Hiring managers take a week to give feedback',
  opps: 'e.g. Priya’s team already runs one-day loops',
  opts: 'e.g. Agree a 48-hour feedback rule',
};
export const NOUN = { cons: 'constraint', opps: 'opportunity', opts: 'option' };
export const REQUIRED = {
  goal: 'Type your goal to carry on.',
  will: 'Choose at least one option to carry on.',
};

const text = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const clean = (v) => text(v).trim();
const list = (v) => (Array.isArray(v) ? v.map(text) : []);
const filled = (rows) => list(rows).map((t) => t.trim()).filter(Boolean);

/** The goal inside its quote marks, as the questions say it: “Cut our time to hire”. */
export function goalQuote(plan) {
  return `“${clean(plan?.goal) || 'your goal'}”`;
}

/** Each screen's question. `name` is the person's first name (none for a guest). */
export function question(key, plan, { name = '', guest = false } = {}) {
  switch (key) {
    case 'goal': return 'What do you want to achieve?';
    case 'cons': return `What’s in the way of ${goalQuote(plan)}?`;
    case 'opps': return `What’s already working for you on ${goalQuote(plan)}?`;
    case 'opts': return `What could you do to reach ${goalQuote(plan)}?`;
    case 'will': return 'Which options will you act on?';
    case 'steps': return 'What exactly will you do?';
    case 'sum': return !guest && clean(name) ? `Here’s your plan, ${clean(name)}.` : 'Here’s your plan.';
    default: return '';
  }
}

/** The one line under each question. A guest has no sprint, so "soon", not "this week". */
export function nudge(key, { guest = false } = {}) {
  switch (key) {
    case 'goal': return 'Make it specific enough to know when you’re there.';
    case 'cons': return 'Type one constraint in each box.';
    case 'opps': return 'Type one opportunity in each box.';
    case 'opts': return 'Type one option in each box, however unlikely.';
    case 'will': return 'Pick all that apply.';
    case 'steps': return guest ? 'Make each one something you can start soon.' : 'Make each one something you can start this week.';
    default: return null;
  }
}

/** A new, empty plan: one empty box on each list screen. */
export function emptyPlan() {
  return { goal: '', cons: [''], opps: [''], opts: [''], acts: [], shared: false };
}

/** The calm message when Next is pressed on a screen that isn't answered yet, or null. */
export function requiredMessage(key, plan) {
  if (key === 'goal' && !clean(plan?.goal)) return REQUIRED.goal;
  if (key === 'will' && !(plan?.acts || []).length) return REQUIRED.will;
  return null;
}

/** The options that can be chosen: the typed ones, each with its place in the list. */
export function optionChoices(plan) {
  return list(plan?.opts).map((t, i) => ({ value: i, label: t.trim() })).filter((o) => o.label);
}

/** The places (in opts) of the options chosen so far. */
export function pickedOptions(plan) {
  return (plan?.acts || []).map((a) => a.option).filter((o) => Number.isInteger(o));
}

/**
 * Choosing an option adds a next step that starts as its words; choosing it
 * again takes that step away. `newId` makes the step's id.
 */
export function togglePick(plan, option, newId) {
  const acts = plan.acts || [];
  if (acts.some((a) => a.option === option)) return { ...plan, acts: acts.filter((a) => a.option !== option) };
  const words = clean(list(plan.opts)[option]);
  if (!words) return plan;
  return { ...plan, acts: [...acts, { id: newId(), option, text: words, where: null, todoId: null, strategyId: null }] };
}

/**
 * The options after a row is taken out: the next steps keep pointing at
 * their own option, and a step whose option has gone stays as written.
 */
export function removeOption(plan, index) {
  const opts = list(plan.opts).filter((_, i) => i !== index);
  const acts = (plan.acts || []).map((a) => {
    if (!Number.isInteger(a.option)) return a;
    if (a.option === index) return { ...a, option: null };
    return a.option > index ? { ...a, option: a.option - 1 } : a;
  });
  return { ...plan, opts: opts.length ? opts : [''], acts };
}

/** One next step with something changed. */
export function setAct(plan, id, patch) {
  return { ...plan, acts: (plan.acts || []).map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

/** The next steps with words in them. */
export function nextSteps(plan) {
  return (plan?.acts || []).filter((a) => clean(a.text));
}

/**
 * Where a next step is, as its row says it (M9's words; the Backlog's from
 * M10): { line, good, link, linkLabel }.
 */
export function whereLine(act, n) {
  if (act?.where === WHERE.week) {
    return { line: 'It’s in this week’s sprint.', good: true, link: 'Edit', linkLabel: `Edit next step ${n} in this week` };
  }
  if (act?.where === WHERE.backlog) {
    return { line: 'It’s in your backlog.', good: false, link: 'Edit', linkLabel: `Edit next step ${n} in your backlog` };
  }
  return { line: 'It isn’t in this week’s sprint yet.', good: false, link: 'Add to this week', linkLabel: `Add next step ${n} to this week` };
}

/** How many next steps are in this week. */
export function inThisWeek(plan) {
  return nextSteps(plan).filter((a) => a.where === WHERE.week).length;
}

/**
 * The message on This week after finishing (M9, "In your sprint"): it
 * counts the next steps in this week. With none there it says "Saved".
 */
export function finishMessage(plan) {
  const n = inThisWeek(plan);
  if (n === 0) return 'Saved';
  return n === 1 ? '1 next step is in this week' : `${n} next steps are in this week`;
}

/**
 * Your plan: every answer on one page, in M9's order. Each row:
 * { key, step (the screen it opens), label, editName, lines: [{ text, sub, good }] }.
 * A list nobody filled in reads "You skipped this.".
 */
export function summaryRows(plan, { guest = false } = {}) {
  const lines = (rows) => {
    const out = filled(rows).map((t) => ({ text: t }));
    return out.length ? out : [{ text: 'You skipped this.' }];
  };
  const steps = nextSteps(plan).map((a) => {
    if (guest) return { text: a.text.trim() };
    const w = whereLine(a, 1);
    return { text: a.text.trim(), sub: w.line, good: w.good };
  });
  return [
    { key: 'goal', step: 'goal', label: 'Your goal', editName: 'your goal', lines: [{ text: clean(plan?.goal) }] },
    { key: 'cons', step: 'cons', label: 'What’s in the way', editName: 'what’s in the way', lines: lines(plan?.cons) },
    { key: 'opps', step: 'opps', label: 'What’s already working', editName: 'what’s already working', lines: lines(plan?.opps) },
    { key: 'opts', step: 'opts', label: 'Your options', editName: 'your options', lines: lines(plan?.opts) },
    { key: 'steps', step: 'steps', label: 'Your next steps', editName: 'your next steps', lines: steps.length ? steps : [{ text: 'You skipped this.' }] },
  ];
}

// ------------------------------------------------------------ saving

/** The saved item's name in My Plans: what was typed first, the goal (80 characters at most). */
export function planTitle(plan) {
  const goal = clean(plan?.goal).replace(/\s+/g, ' ');
  if (!goal) return TOOL_NAME;
  if (goal.length <= 80) return goal;
  const cut = goal.slice(0, 80);
  const space = cut.lastIndexOf(' ');
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

/**
 * What is saved in decisions.form_data. The first five fields are the old
 * pages' own (constraints and opportunities as text, one a line; will_do
 * as text), so old readers still work; `version` 2 marks the new lists.
 */
export function savedForm(plan) {
  const acts = (plan.acts || []).map((a) => ({
    id: a.id,
    option: Number.isInteger(a.option) ? a.option : null,
    text: text(a.text),
    where: Object.values(WHERE).includes(a.where) ? a.where : null,
    todo_id: a.todoId || null,
    strategy_id: a.strategyId || null,
  }));
  return {
    goal: text(plan.goal),
    constraints: filled(plan.cons).join('\n'),
    opportunities: filled(plan.opps).join('\n'),
    options: list(plan.opts),
    will_do: acts.map((a) => a.text.trim()).filter(Boolean).join('\n'),
    version: 2,
    constraint_list: list(plan.cons),
    opportunity_list: list(plan.opps),
    next_steps: acts,
    shared_with_coach: Boolean(plan.shared),
  };
}

const lineRows = (value) => {
  const rows = Array.isArray(value) ? value.map(text) : text(value).split(/\r?\n/);
  const kept = rows.map((t) => t.trim()).filter(Boolean);
  return kept.length ? kept : [''];
};

/**
 * A plan from a saved row's form_data: a new row as it was saved, and an
 * old one (text for constraints, opportunities and "What will I do?")
 * turned into the same screens, one row a line. `newId` makes ids for old
 * next steps.
 */
export function planFrom(form, newId = () => `step-${Math.random().toString(36).slice(2)}`) {
  const f = form && typeof form === 'object' ? form : {};
  const opts = Array.isArray(f.options) ? f.options.map(text) : lineRows(f.options);
  const plan = {
    goal: text(f.goal),
    cons: Array.isArray(f.constraint_list) ? (f.constraint_list.length ? f.constraint_list.map(text) : ['']) : lineRows(f.constraints),
    opps: Array.isArray(f.opportunity_list) ? (f.opportunity_list.length ? f.opportunity_list.map(text) : ['']) : lineRows(f.opportunities),
    opts: opts.length ? opts : [''],
    acts: [],
    shared: Boolean(f.shared_with_coach),
  };
  if (Array.isArray(f.next_steps)) {
    plan.acts = f.next_steps.filter((a) => a && typeof a === 'object').map((a) => ({
      id: text(a.id) || newId(),
      option: Number.isInteger(a.option) && a.option >= 0 && a.option < plan.opts.length ? a.option : null,
      text: text(a.text),
      where: Object.values(WHERE).includes(a.where) ? a.where : null,
      todoId: a.todo_id || null,
      strategyId: a.strategy_id || null,
    }));
  } else {
    // An old row: each line of "What will I do?" is a next step. One that
    // matches an option word for word is that option, chosen.
    plan.acts = lineRows(f.will_do).filter(Boolean).map((line) => {
      const at = plan.opts.findIndex((o) => o.trim() === line);
      return { id: newId(), option: at >= 0 ? at : null, text: line, where: null, todoId: null, strategyId: null };
    });
  }
  return plan;
}

/** True when anything has been typed or chosen (an untouched tool saves nothing). */
export function hasAnswers(plan) {
  return Boolean(clean(plan?.goal) || filled(plan?.cons).length || filled(plan?.opps).length || filled(plan?.opts).length || (plan?.acts || []).length);
}

/**
 * The plan as its PDF, its email and the guest's end page read it: only
 * what was filled in (blank answers are left out).
 */
export function planContent(plan) {
  return {
    goal: clean(plan?.goal),
    constraints: filled(plan?.cons),
    opportunities: filled(plan?.opps),
    options: filled(plan?.opts),
    nextSteps: nextSteps(plan).map((a) => a.text.trim()),
  };
}
