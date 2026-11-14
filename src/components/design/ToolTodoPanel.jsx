import { useRef, useState } from 'react';
import { AddTodoPanel } from './TodoPanels';
import useToolTodo from './useToolTodo';
import { TODO_WHERE } from '../../lib/performance/sprintPage';
import { needsConnection } from '../../lib/friendlyError';

// The add panel every tool opens for a next step (M10 "Add a to-do" with
// its "Where should it go?"; Tim, 13 Nov, 10:42): what needs doing, which
// Strategy it serves, how much it will move it, then This week, Backlog
// or Don’t add it. It saves the to-do itself (useToolTodo) and shows
// "Added to this week" or "Added to your backlog" with Undo.
//
//   <ToolTodoPanel
//     open={open}
//     onClose={() => setOpen(false)}       closed with nothing chosen
//     startText="Ask the chair for 20 minutes"
//     startStrategyId={id}                  optional
//     startWhere="backlog"                  optional: 'week', 'backlog' or 'none'
//     source="get_unstuck"                  todos.source ('other_tool' when left out)
//     sourceId={decisionId}                 the saved item it came from, if any
//     onDone={({ where, id, text, strategyId, impact }) => …}
//     onUndone={({ where, id }) => …}      the toast's Undo was pressed
//   />
//
// onDone runs once the to-do is saved (or waiting to sync), or when "Don’t
// add it" was chosen (where 'none', id null); the panel has closed by then.
// With no sprint running there is no This week, so Backlog and Don’t add
// it are offered. With no Strategy in the plan nothing can be added (a
// to-do serves a Strategy): the panel says so and "Done" answers 'none'.
const NO_STRATEGY = [
  'Every to-do serves one of your Strategies.',
  'Your plan has no Strategies yet, so there’s nothing to add this to.',
];

export default function ToolTodoPanel({ open, onClose, startText = '', startStrategyId = null, startWhere, source = 'other_tool', sourceId = null, onDone, onUndone }) {
  const todo = useToolTodo();
  const start = () => ({
    text: startText || '',
    strategyId: startStrategyId,
    impact: 2,
    where: todo.whereOptions.some((o) => o.value === startWhere) ? startWhere : todo.startWhere,
  });
  const [form, setForm] = useState(start);
  // Each opening starts from what the tool hands over.
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setForm(start());
  }
  const busy = useRef(false); // one save per press
  // "This week" chosen before the sprint's rows arrived stays allowed only while it is offered.
  const where = todo.whereOptions.some((o) => o.value === form.where) ? form.where : todo.startWhere;
  const notice = !todo.ready
    ? (todo.loading ? null : [needsConnection('Adding a to-do')])
    : todo.canAdd ? null : NO_STRATEGY;

  const done = async (f) => {
    if (busy.current) return;
    const text = f.text.trim();
    if (f.where === TODO_WHERE.none) {
      onClose?.();
      onDone?.({ where: TODO_WHERE.none, id: null, text, strategyId: f.strategyId, impact: f.impact });
      return;
    }
    busy.current = true;
    const saved = await todo.add({ text, strategyId: f.strategyId, impact: f.impact, where: f.where, source, sourceId, onUndone });
    busy.current = false;
    if (!saved) return;
    onClose?.();
    onDone?.({ ...saved, text, strategyId: f.strategyId, impact: f.impact });
  };

  return (
    <AddTodoPanel
      open={open}
      onClose={onClose}
      form={{ ...form, where }}
      onFormChange={setForm}
      strategies={todo.strategies}
      where={todo.whereOptions}
      notice={notice}
      onAdd={done}
    />
  );
}
