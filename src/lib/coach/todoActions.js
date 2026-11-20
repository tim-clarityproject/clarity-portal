// Saving the coach's own to-dos (Phase 6a run 2; M11): add, tick, change,
// move, tag and delete, each returning what Undo needs. Device first, as
// every coach table (store.js): a save resolves 'device' until Tim has run
// migration 050, then 'saved' or 'queued'. The rules themselves (dates,
// repeats, where a to-do lands) are day.js's; nothing here decides one.
//
// A coach's own to-dos are never mixed with a client's: these are
// coach_todos rows, never todos, day_plans or the Backlog.
import { keyOf, newId, removeRow, saveRows } from './store';
import { completeTodo, sortTodos } from './day';
import { clean, cut } from './model';

const TODOS = 'coach_todos';
const LINKS = 'coach_tag_links';

/** A to-do's tag links among every link the coach has. */
export const todoLinks = (links, todoId) => (links || []).filter((l) => l.item_kind === 'todo' && l.item_id === todoId);

/** A to-do with nothing set yet. */
export const blankTodo = (coachId) => ({
  id: newId(), coach_id: coachId, title: '', notes: null, important: false, planned_on: null, planned_time: null, first_planned_on: null,
  due_on: null, minutes: null, list_id: null, heading_id: null, profile_id: null, lead_id: null, repeat_rule: null, repeat_of: null,
  remind: false, someday: true, after_work: false, checklist: [], position: 0, done_at: null,
  from_email_sender: null, from_email_subject: null, from_email_at: null,
});

/** The position that puts a to-do after every other one (the end of any list it shows in). */
export const lastPosition = (todos) => Math.max(0, ...(todos || []).map((t) => Number(t.position) || 0)) + 1000;

/**
 * The rows a quick add makes: the to-do, a new list or new tags when one
 * was typed that isn't there yet, and its tag links.
 * @param {object} parsed what day.js's parseQuickAdd read
 * @param {{ coachId: string, todos: object[], lists: object[], tags: object[], defaults?: { list_id?: string, heading_id?: string, profile_id?: string } }} ctx
 * @returns {{ todo: object, pairs: [string, object][] }} the pairs in the order to save them (parents first)
 */
export function rowsForNew(parsed, { coachId, todos = [], lists = [], tags = [], defaults = {} }) {
  const pairs = [];
  let listId = parsed.list_id || null;
  if (!listId && parsed.new_list) {
    const list = { id: newId(), coach_id: coachId, name: cut(clean(parsed.new_list), 80), profile_id: null, organisation_id: null, position: Math.max(0, ...lists.map((l) => Number(l.position) || 0)) + 1, finished_at: null };
    pairs.push(['coach_todo_lists', list]);
    listId = list.id;
  }
  const typedPlace = Boolean(listId || parsed.profile_id);
  const tagIds = [...parsed.tag_ids];
  parsed.new_tags.forEach((name, i) => {
    const tag = { id: newId(), coach_id: coachId, name, position: Math.max(0, ...tags.map((t) => Number(t.position) || 0)) + 1 + i };
    pairs.push(['coach_tags', tag]);
    tagIds.push(tag.id);
  });
  const todo = {
    ...blankTodo(coachId),
    title: parsed.title, important: parsed.important, planned_on: parsed.planned_on, planned_time: parsed.planned_on ? parsed.planned_time : null,
    minutes: parsed.minutes, repeat_rule: parsed.repeat_rule, someday: !parsed.planned_on, after_work: Boolean(parsed.planned_on && parsed.after_work),
    list_id: listId || (typedPlace ? null : defaults.list_id || null),
    heading_id: !typedPlace && defaults.list_id ? defaults.heading_id || null : null,
    profile_id: parsed.profile_id || (typedPlace ? null : defaults.profile_id || null),
    position: lastPosition(todos),
  };
  pairs.push([TODOS, todo]);
  for (const id of [...new Set(tagIds)]) pairs.push([LINKS, { tag_id: id, item_kind: 'todo', item_id: todo.id, coach_id: coachId }]);
  return { todo, pairs };
}

/** Takes rows off again, last made first (Undo for something added). */
export async function removePairs(userId, pairs) {
  for (const [table, row] of [...pairs].reverse()) await removeRow(userId, table, keyOf(table, row)).catch(() => null);
}

/** Saves to-dos as they now stand. */
export const saveTodos = (userId, todos) => saveRows(userId, todos.map((t) => [TODOS, t]));

/**
 * Ticks to-dos: each is done now, and a repeating one makes its next.
 * @returns {{ pairs: [string, object][], made: object[] }} what to save, and the next ones made (taken off again by Undo)
 */
export function tickRows(todos, { nowIso, todayKey }) {
  const pairs = [];
  const made = [];
  for (const todo of todos) {
    const { done, next } = completeTodo(todo, nowIso, todayKey, newId());
    pairs.push([TODOS, done]);
    if (next) { pairs.push([TODOS, next]); made.push(next); }
  }
  return { pairs, made };
}

/** Deletes to-dos with their tag links; resolves the rows Undo saves again. */
export async function deleteTodos(userId, todos, links) {
  const gone = [];
  for (const todo of todos) {
    for (const link of todoLinks(links, todo.id)) { gone.push([LINKS, link]); await removeRow(userId, LINKS, keyOf(LINKS, link)).catch(() => null); }
    await removeRow(userId, TODOS, todo.id);
    gone.unshift([TODOS, todo]);
  }
  return gone;
}

/** The links to add so every one of these to-dos has the tag. */
export const linksToAdd = (todos, tag, links, coachId) => todos
  .filter((t) => !todoLinks(links, t.id).some((l) => l.tag_id === tag.id))
  .map((t) => ({ tag_id: tag.id, item_kind: 'todo', item_id: t.id, coach_id: coachId }));

/** A list's to-dos still to do, in order, by heading (no heading first). */
export function listGroups(todos, headings, listId) {
  const mine = sortTodos((todos || []).filter((t) => t.list_id === listId && !t.done_at));
  const known = new Set((headings || []).filter((h) => h.list_id === listId).map((h) => h.id));
  return [
    { heading: null, items: mine.filter((t) => !t.heading_id || !known.has(t.heading_id)) },
    ...(headings || []).filter((h) => h.list_id === listId).map((h) => ({ heading: h, items: mine.filter((t) => t.heading_id === h.id) })),
  ];
}
