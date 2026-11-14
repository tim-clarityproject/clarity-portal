import { useCallback, useContext, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useToast } from './toastContext';
import { useSprintPage } from '../../lib/performance/hooks';
import { saveTodo, setTodoDeleted } from '../../lib/performance/api';
import { localToday } from '../../lib/performance/rows';
import { TODO_WHERE, newTodoRow, sprintPageView, todoWhereOptions, todoWhereToast } from '../../lib/performance/sprintPage';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';

// A to-do added from a tool (Get unstuck, the Team performance check, the
// Emotional wash; Tim, 13 Nov, 10:42): This week, Backlog or Don’t add it.
// One way to save for every tool: the sprint page's own copy on the
// device (so the sprint page and Home show it at once, offline too) and
// the offline queue, like every other to-do. ToolTodoPanel uses it; a
// tool that asks "Where should it go?" inside its own step (TodoWhere)
// can call `add` itself.
//
//   running       a sprint is running, so "This week" can be offered
//   strategies    [{ value, label }]: the running sprint's, else the plan's
//   canAdd        there is a Strategy for a to-do to serve
//   ready         the person's rows are here (the device's copy, or loaded)
//   whereOptions  the choices for "Where should it go?" (no This week with
//                 no sprint running)
//   startWhere    'week' while a sprint runs, otherwise 'backlog'
//   add({ text, strategyId, impact, where, source, sourceId })
//                 resolves { where, id } once saved or queued ('none' saves
//                 nothing and has no id), or null when it didn't save (a
//                 calm error has been shown). It shows the toast itself
//                 ("Added to this week" or "Added to your backlog", with
//                 Undo) unless `quiet` is set. `onUndone({ where, id })`
//                 runs when that Undo is pressed.
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

export default function useToolTodo() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const toast = useToast();
  const { data, loading, setData } = useSprintPage(userId);
  const today = localToday();
  const view = useMemo(() => (data ? sprintPageView(data, { today }) : null), [data, today]);
  const running = view?.state === 'running';
  const sprintId = running ? view.sprintId : null;
  const week = running ? view.current : null;
  const rows = data?.strategies?.length ? data.strategies : data?.planStrategies;
  const strategies = useMemo(() => (rows || []).map((s) => ({ value: s.id, label: s.name })), [rows]);
  const whereOptions = useMemo(() => todoWhereOptions({ running }), [running]);

  const add = useCallback(async ({ text, strategyId, impact = 2, where, source = 'other_tool', sourceId = null, quiet = false, onUndone }) => {
    if (where === TODO_WHERE.none) return { where: TODO_WHERE.none, id: null };
    if (!userId || !strategyId || !String(text || '').trim()) return null;
    // "This week" needs a running sprint; without one it waits in the Backlog.
    const to = where === TODO_WHERE.week && sprintId ? TODO_WHERE.week : TODO_WHERE.backlog;
    const id = newId();
    const row = newTodoRow({ id, text, strategyId, impact, week: to === TODO_WHERE.week ? week : null, sprintId, today, source, sourceId });
    const list = to === TODO_WHERE.week ? 'todos' : 'backlogTodos';
    const put = () => setData((d) => (d ? { ...d, [list]: [...(d[list] || []), row] } : d));
    const take = () => setData((d) => (d ? { ...d, [list]: (d[list] || []).filter((t) => t.id !== id) } : d));
    put();
    try {
      await saveTodo(userId, { id, strategyId, text: row.text, impact: row.impact, sprintId: row.sprint_id, week: row.planned_week, createdOn: today, source, sourceId });
    } catch (e) {
      take();
      toast.error(friendlyError(e, SAVE_ERROR));
      return null;
    }
    if (!quiet) {
      toast.saved({
        message: todoWhereToast(to),
        onUndo: () => {
          take();
          setTodoDeleted(userId, id, new Date().toISOString()).catch(() => null);
          // The tool that asked takes it off its own screen too.
          onUndone?.({ where: to, id });
        },
      });
    }
    return { where: to, id };
  }, [userId, sprintId, week, today, setData, toast]);

  return {
    running,
    strategies,
    canAdd: strategies.length > 0,
    ready: Boolean(data),
    loading,
    whereOptions,
    startWhere: running ? TODO_WHERE.week : TODO_WHERE.backlog,
    add,
  };
}
