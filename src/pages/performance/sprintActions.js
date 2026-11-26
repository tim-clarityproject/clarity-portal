import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/design';
import { createDayPlan, habitLogOp, loadDayPlanRow, saveHabitLog, saveTodo, saveTodoDone, setTodoDeleted } from '../../lib/performance/api';
import { dayTodoOps } from '../../lib/performance/dayPlan';
import { dayTodoCap, fitDayTodos, readDayChoices, saveDayChoices } from '../../lib/performance/dayPlanHabits';
import { BACKLOG_VALUE, doneToast, newTodoRow, sprintPageView } from '../../lib/performance';
import { toStored } from '../../lib/units';
import { keepForLater, newId, saveOrQueue, useQueueState } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';

// Logging and to-dos, one way for every page that has them (the
// Performance Sprint and Home, Phase 4 step 2): never a second way to save.
// Every change shows on the page at once, in the sprint's own copy on the
// device (so the other page shows it too, offline as well), and goes
// through the offline queue with the version it was based on: "Saving",
// "Will sync" while it waits, then "Saved". A log for a day is found by its
// habit and day, so changing it updates the same row and never swaps its
// id (risk R2). A number typed just before a refresh is kept on the device
// and sent on the next start.

const SAVE_DELAY_MS = 700; // typing in a number box saves this long after the last key, or on leaving the box
export const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

const parseTyped = (text) => {
  const t = (text || '').replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {object} opts.data the sprint page's rows (useSprintPage)
 * @param {(fn) => void} opts.setData its setter (writes the device's copy too)
 * @param {object} opts.view sprintPageView(data)
 * @param {string} opts.today the person's local today
 */
export function useSprintActions({ userId, data, setData, view, today }) {
  const toast = useToast();
  const queue = useQueueState();
  const [save, setSave] = useState('idle');
  const [typed, setTyped] = useState({});
  const timers = useRef({});
  const pending = useRef({}); // the logs still waiting for their delay: key -> { habitId, day, value }

  // "Will sync" turns to "Saved" once the queue has sent everything.
  useEffect(() => {
    if (save === 'offline' && queue.waiting === 0 && queue.failed === 0) setSave('saved');
    if (save === 'offline' && queue.failed > 0) setSave('failed');
  }, [save, queue.waiting, queue.failed]);

  const sent = async (fn) => {
    setSave('saving');
    try {
      const r = await fn();
      // Superseded: another window changed it first; the page says so and
      // shows the latest (useLatestWhenSuperseded), so nothing reads "Saved".
      if (r?.status === 'superseded') {
        setSave('idle');
        return false;
      }
      setSave(r?.status === 'queued' ? 'offline' : 'saved');
      return true;
    } catch (e) {
      setSave('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  const changeRows = (fn) => setData((d) => ({ ...d, ...fn(d) }));

  /** One day's log, on the page at once and saved (or queued). */
  const putLog = (habit, day, value, { delay = 0 } = {}) => {
    changeRows((d) => {
      const others = (d.logs || []).filter((l) => !(l.sprint_habit_id === habit.id && l.local_date === day));
      const before = (d.logs || []).find((l) => l.sprint_habit_id === habit.id && l.local_date === day);
      return {
        logs: value == null
          ? others
          : [...others, { id: before?.id || `device-${habit.id}-${day}`, sprint_habit_id: habit.id, local_date: day, value, to_confirm: false }],
      };
    });
    const key = `${habit.id}:${day}`;
    clearTimeout(timers.current[key]);
    const go = () => {
      delete timers.current[key];
      delete pending.current[key];
      sent(() => saveHabitLog(userId, habit.id, day, value));
    };
    if (delay) {
      setSave('saving');
      pending.current[key] = { habitId: habit.id, day, value };
      timers.current[key] = setTimeout(go, delay);
    } else {
      delete pending.current[key];
      go();
    }
  };

  // Leaving the page sends anything still waiting for its delay; closing
  // or refreshing it keeps those on the device, sent on the next start
  // (break-it tester: a number typed just before a refresh was lost).
  useEffect(() => {
    const takeWaiting = () => {
      Object.values(timers.current).forEach((t) => clearTimeout(t));
      timers.current = {};
      const waiting = Object.values(pending.current);
      pending.current = {};
      return waiting;
    };
    const onHide = () => {
      takeWaiting().forEach((w) => keepForLater(userId, habitLogOp(userId, w.habitId, w.day, w.value)));
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      takeWaiting().forEach((w) => { saveHabitLog(userId, w.habitId, w.day, w.value).catch(() => null); });
    };
  }, [userId]);

  const typeNumber = (habit, day, text) => {
    const key = `${habit.id}:${day}`;
    if (habit.measure === 'rating' && text !== '' && !/^[1-5]$/.test(text)) return;
    const shown = parseTyped(text);
    if ((habit.measure === 'count' || habit.measure === 'count_limit') && shown != null && (!Number.isInteger(shown) || shown > habit.top)) return;
    setTyped((t) => ({ ...t, [key]: text }));
    const stored = habit.measure === 'amount' ? toStored(shown, habit.storedUnit, data?.personSettings?.units) : shown;
    putLog(habit, day, stored, { delay: SAVE_DELAY_MS });
  };

  const leaveNumber = (habit, day) => {
    const key = `${habit.id}:${day}`;
    if (timers.current[key]) {
      // Send now rather than wait.
      const value = (data.logs || []).find((l) => l.sprint_habit_id === habit.id && l.local_date === day)?.value ?? null;
      clearTimeout(timers.current[key]);
      delete timers.current[key];
      delete pending.current[key];
      sent(() => saveHabitLog(userId, habit.id, day, value == null ? null : Number(value)));
    }
    setTyped((t) => {
      const next = { ...t };
      delete next[key];
      return next;
    });
  };

  const tickWeekly = (habit, done) => {
    if (done) {
      putLog(habit, today, 1);
      return;
    }
    Object.entries(habit.values).filter(([, v]) => v > 0).forEach(([day]) => putLog(habit, day, null));
  };

  /** A to-do ticked done today, or not done, with "Done. 3 of 4 this week." and Undo (M1). */
  const toggleTodo = async (todo, done) => {
    const doneOn = done ? today : null;
    changeRows((d) => ({ todos: d.todos.map((t) => (t.id === todo.id ? { ...t, done_on: doneOn } : t)) }));
    const ok = await sent(() => saveTodoDone(userId, todo.id, doneOn));
    if (!ok) {
      changeRows((d) => ({ todos: d.todos.map((t) => (t.id === todo.id ? { ...t, done_on: done ? null : today } : t)) }));
      return;
    }
    if (done) {
      // The count after this tick, from the same rows (M1 "Done. 3 of 4 this week.").
      const after = sprintPageView({ ...data, todos: data.todos.map((t) => (t.id === todo.id ? { ...t, done_on: doneOn } : t)) }, { today });
      toast.saved({
        message: after?.todos ? doneToast(after.todos) : 'Done.',
        onUndo: () => {
          changeRows((d) => ({ todos: d.todos.map((t) => (t.id === todo.id ? { ...t, done_on: null } : t)) }));
          sent(() => saveTodoDone(userId, todo.id, null));
        },
      });
    }
  };

  /**
   * A new to-do for a week of the sprint (M1 "Add to-do"), with "Added
   * to this week." and Undo, or for the Backlog (no week yet; Tim, 13 Nov,
   * 10:42). Resolves false when it didn't save (the page puts the form back).
   */
  const addTodo = async (form, { onToday = null } = {}) => {
    const id = newId();
    const backlog = form.week === BACKLOG_VALUE || form.week == null;
    const row = newTodoRow({ id, text: form.text, strategyId: form.strategyId, impact: form.impact, week: backlog ? null : form.week, sprintId: view.sprintId, today, source: form.source, sourceId: form.sourceId });
    const list = backlog ? 'backlogTodos' : 'todos';
    changeRows((d) => ({ [list]: [...(d[list] || []), row] }));
    const ok = await sent(() => saveTodo(userId, { id, strategyId: row.strategy_id, text: row.text, impact: row.impact, sprintId: row.sprint_id, week: row.planned_week, createdOn: today, source: row.source, sourceId: row.source_id }));
    if (!ok) {
      changeRows((d) => ({ [list]: (d[list] || []).filter((t) => t.id !== id) }));
      return false;
    }
    // Added under Home's Today for this week: it joins today's plan too, through the Daily plan's own saves (Q5).
    const toToday = Boolean(onToday) && !backlog && form.week === view.current;
    const inDay = toToday ? await addToDay(id, onToday) : false;
    toast.saved({
      message: backlog ? 'Added to your backlog.' : inDay ? 'Added to today and this week.' : form.week === view.current ? 'Added to this week.' : `Added to week ${form.week}.`,
      onUndo: () => {
        changeRows((d) => ({ [list]: (d[list] || []).filter((t) => t.id !== id) }));
        if (inDay) onToday.undo?.(id);
        sent(() => setTodoDeleted(userId, id, new Date().toISOString()));
      },
    });
    return true;
  };

  /**
   * A to-do just saved joins today's plan, as the Daily plan adds one (Home's Quick Add under Today; the functionality
   * tester, Q5): today's day_plans row made once if there isn't one (createDayPlan, as the Daily plan's ensurePlan),
   * then its day_plan_todos row through the same queue (dayTodoOps); before 047, past three it waits on the device in
   * the day's choices (fitDayTodos' `extra`), as the Daily plan keeps it. The day's order puts it last.
   * day: { date, planId, dayTodos, onDay(planId, dayTodos) } from the page that holds the day.
   */
  const addToDay = async (id, day) => {
    try {
      let planId = day.planId || null;
      if (!planId) {
        const made = newId();
        const r = await createDayPlan(userId, made, day.date);
        planId = r?.status === 'saved' && !r.data?.length ? (await loadDayPlanRow(userId, day.date))?.id || made : made;
      }
      const choices = readDayChoices(userId, day.date);
      const had = (day.dayTodos || []).map((t) => t.todo_id);
      const top = (day.dayTodos || []).find((t) => t.is_top)?.todo_id || null;
      const first = !had.length && !(choices.habits || []).length && !(choices.extra || []).length;
      const after = { todos: [...had, id], top: top || (first ? id : null) };
      const { sent: toSend, extra } = fitDayTodos(after.todos, after.top, dayTodoCap(userId));
      const ok = await sent(() => Promise.all(dayTodoOps(userId, planId, { todos: had, top }, { todos: toSend, top: after.top }).map((op) => saveOrQueue(userId, op))).then((a) => a[a.length - 1] ?? null));
      if (!ok) return false;
      if ((choices.order || []).length || extra.length) {
        saveDayChoices(userId, day.date, { ...choices, order: [...(choices.order || []), `todo:${id}`], ...(extra.length ? { extra: [...new Set([...(choices.extra || []), ...extra])] } : {}) });
      }
      day.onDay?.(planId, toSend.map((t) => ({ todo_id: t, is_top: t === after.top })));
      return true;
    } catch {
      return false;
    }
  };

  return { save, setSave, sent, changeRows, typed, putLog, typeNumber, leaveNumber, tickWeekly, toggleTodo, addTodo };
}
