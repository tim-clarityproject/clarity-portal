import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AddButton, Button, Chip, ChipRow, DatePicker, Dropdown, IconButton, InlineChoice, SlidePanel, SwitchRow, TextBox, TextField, useIsPhone, useToast,
} from '../../components/design';
import keepWords from '../../components/design/keepWords';
import { keyOf, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { addDays, clean, dayWords, minutesWords } from '../../lib/coach/model';
import {
  addedWords, checklistWords, doneWords, ESTIMATES, estimateWords, moveToDay, moveToSomeday, OTHER_ESTIMATES, OTHER_SUGGESTED, parseQuickAdd,
  plannedWords, positionAt, quickAddChips, quickDays, repeatValue, REPEATS, timeWords, todoFacts, whenWords,
} from '../../lib/coach/day';
import { deleteTodos, linksToAdd, removePairs, rowsForNew, saveTodos, tickRows, todoLinks } from '../../lib/coach/todoActions';
import { MenuItem, MenuLabel, PopMenu, TextLink, useCoachPortal } from './parts';
import { HelpLink } from './help';
import './todos.css';

// The coach's own to-dos, in parts (Phase 6a run 2; M11): the row and its
// list (tick, open, choose several, a small menu, drag and arrow keys to
// reorder), the bar for several chosen, one to-do in its side panel, the
// quick add, and the underlined tabs. To-dos and Today both use them, so
// nothing here keeps a page's own state: a page holds which to-do is open
// and what is chosen, and hands them in.
//
//   const picks = useTodoPicks();
//   const [openId, setOpenId] = useState(null);
//   <TodoList todos={work} view="today" label="To-dos" picks={picks} onOpen={setOpenId} reorder dropPatch={{ after_work: false }} />
//   <TodoBulkBar picks={picks} />
//   <TodoPanel id={openId} onClose={() => setOpenId(null)} />
//   <QuickAddPanel open={adding} onClose={() => setAdding(false)} defaultDay={todayKey} />
//
// These are coach_todos only: never a client's todos, day plans or Backlog.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const NEEDS_WORDS = 'Type what needs doing to carry on.';
const HOLD_MS = 450;
const NONE = '__none__';
const PICK = '__pick__';
const OTHER = 'other';
const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const DOTS = <svg className="cc-todo-dots" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" /></svg>;
const count = (n) => `${n} ${n === 1 ? 'to-do' : 'to-dos'}`;

// ---------------------------------------------------------------- saving, with Undo

/**
 * Every way a to-do is saved, each with its message and Undo for 10
 * seconds. All of them take whole rows (the to-dos as the page has them).
 */
export function useTodoActions() {
  const { userId, coach, state, todos, todoLists, tags, todayKey } = useCoachPortal();
  const toast = useToast();
  const links = rowsOf(state, 'coach_tag_links');

  const run = async (work, message, onUndo) => {
    try {
      const status = await work();
      if (message) toast.saved({ message: status === 'queued' ? 'Will sync' : message, long: true, onUndo });
      return true;
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      return false;
    }
  };
  const back = (before) => () => saveTodos(userId, before).catch(() => {});
  const changeAll = (list, change, message) => {
    const before = list;
    return run(() => saveTodos(userId, before.map(change)), message, back(before));
  };

  return {
    /** Adds what the quick add read (day.js's parseQuickAdd). Resolves the new to-do, or null. */
    add: async (parsed, defaults = {}) => {
      const { todo, pairs } = rowsForNew(parsed, { coachId: coach.id, todos, lists: todoLists, tags, defaults });
      const ok = await run(() => saveRows(userId, pairs), addedWords(parsed, todayKey), () => removePairs(userId, pairs));
      return ok ? todo : null;
    },
    /** Done at once; a repeating one makes its next. */
    tick: (list) => {
      const before = [].concat(list);
      const { pairs, made } = tickRows(before, { nowIso: new Date().toISOString(), todayKey });
      return run(() => saveRows(userId, pairs), before.length === 1 ? 'Done' : `Completed ${count(before.length)}.`,
        async () => { await removePairs(userId, made.map((t) => ['coach_todos', t])); await back(before)(); });
    },
    untick: (todo) => changeAll([todo], (t) => ({ ...t, done_at: null }), 'Marked as not done'),
    /** One change to one to-do: "Saved", with Undo. */
    change: (todo, patch, message = 'Saved') => changeAll([todo], (t) => ({ ...t, ...patch }), message),
    /** To a day, or to Someday (null): it keeps the day it was first planned for and loses its old time. */
    setDay: (list, day) => {
      const all = [].concat(list);
      return changeAll(all, (t) => (day ? moveToDay(t, day) : { ...moveToSomeday(t), after_work: false }), all.length === 1 ? 'Moved' : `Moved ${count(all.length)}.`);
    },
    /** Into a list (or out of every list: null). */
    setList: (list, to) => {
      const all = [].concat(list);
      return changeAll(all, (t) => ({ ...t, list_id: to ? to.id : null, heading_id: null }), to ? `Moved to ${to.name}` : 'Moved out of its list');
    },
    /** A tag onto each of them. */
    tag: (list, tag) => {
      const all = [].concat(list);
      const add = linksToAdd(all, tag, links, coach.id);
      return run(() => saveRows(userId, add.map((l) => ['coach_tag_links', l])), `${tag.name} added to ${count(all.length)}`, () => removePairs(userId, add.map((l) => ['coach_tag_links', l])));
    },
    /** A tag on or off one to-do. */
    toggleTag: (todo, tag) => {
      const link = todoLinks(links, todo.id).find((l) => l.tag_id === tag.id);
      const row = link || { tag_id: tag.id, item_kind: 'todo', item_id: todo.id, coach_id: coach.id };
      const put = () => saveRow(userId, 'coach_tag_links', row);
      const take = () => removeRow(userId, 'coach_tag_links', keyOf('coach_tag_links', row)).then(() => 'saved');
      return run(link ? take : put, 'Saved', () => (link ? put() : take()).catch(() => {}));
    },
    /** "Deleted", with Undo (its tags come back too). */
    remove: (list) => {
      const all = [].concat(list);
      let gone = [];
      return run(async () => { gone = await deleteTodos(userId, all, links); return 'saved'; }, all.length === 1 ? 'Deleted' : `Deleted ${count(all.length)}.`, () => saveRows(userId, gone).catch(() => {}));
    },
    /**
     * Puts a to-do at `index` among a list's others (day.js's positionAt),
     * with `patch` for a list it wasn't in (another heading, After work).
     * Quiet unless `say` is true ("Moved", with Undo).
     */
    place: (todo, listTodos, index, patch = null, say = false) => {
      const next = { ...todo, ...(patch || {}), position: positionAt(todo, listTodos, index) };
      if (next.position === todo.position && Object.keys(patch || {}).every((k) => todo[k] === next[k])) return Promise.resolve(true);
      return run(() => saveTodos(userId, [next]), say ? 'Moved' : null, back([todo]));
    },
  };
}

// ---------------------------------------------------------------- choosing several

/**
 * What is chosen, for a page to hold: a round tick on hover on a laptop,
 * inside the row on a tablet, press and hold on a phone. Escape clears it.
 */
export function useTodoPicks() {
  const isPhone = useIsPhone();
  const [picked, setPicked] = useState({});
  const hold = useRef(null);
  const ids = Object.keys(picked);
  const picking = ids.length > 0;
  const pick = (id, on) => setPicked((p) => { const n = { ...p }; if (on) n[id] = true; else delete n[id]; return n; });
  const clear = () => setPicked({});
  useEffect(() => {
    if (!picking) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('.ds-dialog, [role="menu"]')) setPicked({}); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [picking]);
  const holdEnd = () => { if (hold.current !== 'held') clearTimeout(hold.current); };
  return {
    picked, ids, picking, pick, clear, isPhone,
    /** The row's own handlers: a press held on a phone chooses it. */
    holdProps: (id) => ({
      onPointerDown: () => { if (!isPhone) return; clearTimeout(hold.current); hold.current = setTimeout(() => { hold.current = 'held'; pick(id, true); }, HOLD_MS); },
      onPointerUp: holdEnd, onPointerLeave: holdEnd, onPointerCancel: holdEnd,
      onContextMenu: (e) => { if (isPhone) e.preventDefault(); },
    }),
    /** True when a tap on the row was the hold ending, or chose the row (a phone, once choosing has begun), so it shouldn't open. */
    tapTaken: (id) => {
      if (hold.current === 'held') { hold.current = null; return true; }
      if (picking && isPhone) { pick(id, !picked[id]); return true; }
      return false;
    },
  };
}

function PickTick({ on, name, onChange }) {
  return (
    <button type="button" className="cc-pick" role="checkbox" aria-checked={on} aria-label={`Select ${name}`} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <i>{TICK}</i>
    </button>
  );
}

/** "2 chosen", then Date, Tag, Complete, Move and Delete, each with Undo, and Clear the choice. */
export function TodoBulkBar({ picks }) {
  const { todos, tags, todoLists, todayKey } = useCoachPortal();
  const actions = useTodoActions();
  const [menu, setMenu] = useState(null);
  const anchors = useRef({});
  const anchor = (key) => ({ current: anchors.current[key] || null });
  const ref = (key) => (el) => { anchors.current[key] = el; };
  const chosen = todos.filter((t) => picks.picked[t.id] && !t.done_at);
  // Something chosen that has since gone (ticked or deleted elsewhere) is let go.
  const stale = picks.ids.length !== chosen.length;
  useEffect(() => { if (stale) picks.ids.filter((id) => !chosen.some((t) => t.id === id)).forEach((id) => picks.pick(id, false)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stale]);
  if (!chosen.length) return null;
  const then = (work) => { setMenu(null); work(); picks.clear(); };
  const lists = todoLists.filter((l) => !l.finished_at);
  const button = (key, label, onClick) => (
    <button type="button" className="cc-bulk-btn" ref={ref(key)} aria-haspopup={onClick ? undefined : 'menu'} aria-expanded={onClick ? undefined : menu === key} onClick={onClick || (() => setMenu(key))}>{label}</button>
  );
  return (
    <div className="cc-bulk cc-todo-bulk" role="toolbar" aria-label={`${chosen.length} chosen`}>
      <span className="cc-bulk-n" aria-live="polite">{chosen.length} chosen</span>
      <span className="cc-todo-bulk-acts">
        {button('date', 'Date')}
        {tags.length > 0 && button('tag', 'Tag')}
        {button('complete', 'Complete', () => then(() => actions.tick(chosen)))}
        {button('move', 'Move')}
        {button('delete', 'Delete', () => then(() => actions.remove(chosen)))}
      </span>
      <IconButton label="Clear the choice" className="cc-todo-bulk-clear" onClick={picks.clear} />
      <PopMenu open={menu === 'date'} onClose={() => setMenu(null)} anchorRef={anchor('date')} title="Date">
        {quickDays(todayKey).map((d) => <MenuItem key={d.label} onClick={() => then(() => actions.setDay(chosen, d.day))}>{d.label}</MenuItem>)}
      </PopMenu>
      <PopMenu open={menu === 'tag'} onClose={() => setMenu(null)} anchorRef={anchor('tag')} title="Tag">
        {tags.map((t) => <MenuItem key={t.id} onClick={() => then(() => actions.tag(chosen, t))}>{t.name}</MenuItem>)}
      </PopMenu>
      <PopMenu open={menu === 'move'} onClose={() => setMenu(null)} anchorRef={anchor('move')} title="Move to a list">
        {lists.map((l) => <MenuItem key={l.id} onClick={() => then(() => actions.setList(chosen, l))}>{l.name}</MenuItem>)}
        <MenuItem onClick={() => then(() => actions.setList(chosen, null))}>No list</MenuItem>
      </PopMenu>
    </div>
  );
}

// ---------------------------------------------------------------- the row and its list

/**
 * One to-do's row: the shared tick box (Important is the soft coral box,
 * and a screen reader hears ", important"), the title, the quiet facts and
 * its tags as plain quiet words. The words open it.
 */
export function CoachTodoRow({ todo, facts = [], tagNames = [], done = false, picked = false, onPick, onTick, onOpen, more = null, rowProps = {}, openProps = {}, className = '' }) {
  const important = Boolean(todo.important) && !done;
  return (
    <div className={`${onPick ? 'cc-pick-row ' : ''}cc-todo-row${picked ? ' cc-pick-row--on' : ''} ${className}`.trim()} role="listitem" {...rowProps}>
      {onPick && <PickTick on={picked} name={todo.title} onChange={onPick} />}
      <div className={`ds-todo cc-todo${done ? ' ds-todo--done' : ''}${important ? ' ds-todo--important' : ''}`}>
        <button type="button" role="checkbox" className="ds-check-box" aria-checked={done} aria-label={`Mark “${todo.title}”${important ? ', important,' : ''} as ${done ? 'not done' : 'done'}`} onClick={() => onTick?.(!done)}>
          <span>{TICK}</span>
        </button>
        <button type="button" className="ds-todo-open cc-todo-open" data-todo={todo.id} onClick={onOpen} {...openProps}>
          <span className="ds-todo-text">{keepWords(todo.title)}{important && <span className="ds-sr">, important</span>}</span>
          {(facts.length > 0 || tagNames.length > 0) && (
            <span className="ds-todo-line">
              {facts.map((f) => <span key={f} className="ds-todo-tag">{f}</span>)}
              {tagNames.map((t) => <span key={`t:${t}`} className="ds-todo-tag">{t}</span>)}
            </span>
          )}
        </button>
        {more}
      </div>
    </div>
  );
}

// The to-do being dragged, shared by every list on the page so one can be dropped under another heading.
let dragged = null;

/**
 * A list of to-dos, in the order given.
 * @param {{
 *   todos: object[], view?: 'today'|'upcoming'|'someday'|'list', label: string, picks?: object, onOpen: (id: string) => void,
 *   reorder?: boolean, dropPatch?: object, done?: boolean,
 * }} props
 * `reorder`: drag a row, or press the up and down arrows on a focused one.
 * `dropPatch`: what a to-do dropped in from another list takes on (`{ heading_id }`, `{ after_work: true }`).
 * `done`: ticked rows, with the day each was done (the Done fold).
 */
export function TodoList({ todos, view = 'today', label, picks = null, onOpen, reorder = false, dropPatch = null, done = false }) {
  const { todoLists, clients, tags, state, todayKey } = useCoachPortal();
  const actions = useTodoActions();
  const isPhone = useIsPhone();
  const links = rowsOf(state, 'coach_tag_links');
  const namesOf = useMemo(() => {
    const names = new Map(tags.map((t) => [t.id, t.name]));
    const out = new Map();
    for (const l of links) {
      if (l.item_kind !== 'todo' || !names.has(l.tag_id)) continue;
      if (!out.has(l.item_id)) out.set(l.item_id, []);
      out.get(l.item_id).push(names.get(l.tag_id));
    }
    return out;
  }, [links, tags]);
  const ctx = useMemo(() => ({ lists: todoLists, clients, view }), [todoLists, clients, view]);

  const [menu, setMenu] = useState(null); // { id, step: 'root' | 'date' | 'tag' }
  const moreRefs = useRef({});
  const [drop, setDrop] = useState(null); // { id, after } while a dragged row is over this list
  const [said, setSaid] = useState('');
  const box = useRef(null);
  const refocus = useRef(null);
  const moves = reorder && !done;
  const order = todos.map((t) => t.id).join('|');
  // A row moved with the keyboard keeps the keyboard.
  useLayoutEffect(() => {
    if (!refocus.current) return;
    box.current?.querySelector(`[data-todo="${refocus.current}"]`)?.focus({ preventScroll: true });
    refocus.current = null;
  }, [order]);

  const open = (todo) => { if (picks?.tapTaken(todo.id)) return; onOpen?.(todo.id); };
  const landAt = (moving, target, after) => {
    const others = todos.filter((t) => t.id !== moving.id);
    const at = target ? others.findIndex((t) => t.id === target.id) : -1;
    return at < 0 ? others.length : at + (after ? 1 : 0);
  };
  const dropOn = (e, target) => {
    if (!moves || !dragged) return;
    e.preventDefault();
    e.stopPropagation();
    const moving = dragged;
    const after = drop?.after;
    dragged = null;
    setDrop(null);
    if (target && target.id === moving.id) return;
    actions.place(moving, todos, landAt(moving, target, after), dropPatch, true);
  };
  const keyMove = (e, todo, i) => {
    if (!moves || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const up = e.key === 'ArrowUp';
    const same = todos.filter((t) => Boolean(t.important) === Boolean(todo.important));
    const target = same[same.findIndex((t) => t.id === todo.id) + (up ? -1 : 1)];
    if (!target) { setSaid(`${todo.title} is already at the ${up ? 'top' : 'bottom'}${same.length < todos.length ? (todo.important ? ' of the important to-dos' : ' of the others') : ''}.`); return; }
    refocus.current = todo.id;
    actions.place(todo, todos, landAt(todo, target, !up));
    setSaid(`${todo.title} moved ${up ? 'up' : 'down'}, ${up ? i : i + 2} of ${todos.length}.`);
  };

  const menuTodo = menu ? todos.find((t) => t.id === menu.id) : null;
  const closeMenu = () => setMenu(null);
  const act = (work) => { closeMenu(); work(); };

  return (
    <div
      ref={box}
      className={`cc-rows cc-todos${picks?.picking ? ' cc-picking' : ''}${drop && !drop.id ? ' cc-todos--drop' : ''}`}
      role="list"
      aria-label={label}
      onDragOver={moves ? (e) => { if (!dragged) return; e.preventDefault(); if (e.target === e.currentTarget || !todos.length) setDrop({ id: null, after: true }); } : undefined}
      onDragLeave={moves ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(null); } : undefined}
      onDrop={moves ? (e) => dropOn(e, null) : undefined}
    >
      {todos.map((todo, i) => {
        const facts = done ? [doneWords(todo, todayKey)].filter(Boolean) : todoFacts(todo, ctx, todayKey);
        const canMenu = !done && !isPhone;
        return (
          <CoachTodoRow
            key={todo.id}
            todo={todo}
            facts={facts}
            tagNames={done ? [] : namesOf.get(todo.id) || []}
            done={done}
            picked={Boolean(picks?.picked[todo.id])}
            onPick={picks && !done ? (on) => picks.pick(todo.id, on) : null}
            onTick={(on) => (on ? actions.tick(todo) : actions.untick(todo))}
            onOpen={() => open(todo)}
            className={drop?.id === todo.id ? (drop.after ? 'cc-todo-row--after' : 'cc-todo-row--before') : ''}
            openProps={moves ? { onKeyDown: (e) => keyMove(e, todo, i) } : {}}
            rowProps={{
              ...(picks && !done ? picks.holdProps(todo.id) : {}),
              ...(moves && !isPhone ? {
                draggable: true,
                onDragStart: (e) => { dragged = todo; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', todo.title); } catch { /* not allowed here */ } },
                onDragEnd: () => { dragged = null; setDrop(null); },
                onDragOver: (e) => {
                  if (!dragged) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > r.top + r.height / 2;
                  setDrop((d) => (d && d.id === todo.id && d.after === after ? d : { id: todo.id, after }));
                },
                onDrop: (e) => dropOn(e, todo),
              } : {}),
            }}
            more={canMenu ? (
              <button type="button" className="cc-round cc-todo-more" ref={(el) => { moreRefs.current[todo.id] = el; }} aria-label={`More for ${todo.title}`} aria-haspopup="menu" aria-expanded={menu?.id === todo.id} onClick={() => setMenu({ id: todo.id, step: 'root' })}>{DOTS}</button>
            ) : null}
          />
        );
      })}
      {moves && todos.length === 0 && <div className="cc-todo-none" aria-hidden="true" />}
      <span className="ds-sr" aria-live="polite">{said}</span>
      <PopMenu open={Boolean(menuTodo)} onClose={closeMenu} anchorRef={{ current: menu ? moreRefs.current[menu.id] || null : null }} title={menu?.step === 'date' ? 'Date' : menu?.step === 'tag' ? 'Tag' : 'More'}>
        {menuTodo && menu.step === 'root' && (
          <>
            <MenuItem onClick={() => act(() => onOpen?.(menuTodo.id))}>Edit</MenuItem>
            <MenuItem onClick={() => setMenu({ id: menuTodo.id, step: 'date' })}>Date</MenuItem>
            {tags.length > 0 && <MenuItem onClick={() => setMenu({ id: menuTodo.id, step: 'tag' })}>Tag</MenuItem>}
            {picks && <MenuItem onClick={() => act(() => picks.pick(menuTodo.id, true))}>Select</MenuItem>}
            <MenuItem onClick={() => act(() => actions.remove(menuTodo))}>Delete</MenuItem>
          </>
        )}
        {menuTodo && menu.step === 'date' && (
          <>
            <MenuLabel>Date</MenuLabel>
            {quickDays(todayKey).map((d) => <MenuItem key={d.label} onClick={() => act(() => actions.setDay(menuTodo, d.day))}>{d.label}</MenuItem>)}
          </>
        )}
        {menuTodo && menu.step === 'tag' && (
          <>
            <MenuLabel>Tag</MenuLabel>
            {tags.map((t) => <MenuItem key={t.id} checked={todoLinks(links, menuTodo.id).some((l) => l.tag_id === t.id)} onClick={() => act(() => actions.toggleTag(menuTodo, t))}>{t.name}</MenuItem>)}
          </>
        )}
      </PopMenu>
    </div>
  );
}

// ---------------------------------------------------------------- underlined tabs

/**
 * Underlined tabs move between parts of a page (Tim, 18 Nov): the same on
 * a laptop and a phone, where they scroll in their own strip. The gliding
 * switch only changes how the same thing is shown.
 * @param {{ label: string, tabs: { value: string, label: string }[], value: string, onChange: (value: string) => void, panelId?: string }} props
 */
export function UnderTabs({ label, tabs, value, onChange, panelId }) {
  const refs = useRef([]);
  const go = (i) => { const n = (i + tabs.length) % tabs.length; onChange(tabs[n].value); refs.current[n]?.focus({ preventScroll: true }); refs.current[n]?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
  return (
    <div className="cc-utabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          className="cc-utab"
          id={panelId ? `${panelId}-${t.value}` : undefined}
          aria-selected={t.value === value}
          aria-controls={panelId}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
            if (e.key === 'Home') { e.preventDefault(); go(0); }
            if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1); }
          }}
        >
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the quick add

const QUICK_HELP = {
  title: 'How the quick add reads what you type',
  terms: [
    { term: 'A day and a time', meaning: 'Type today, tomorrow or a weekday, and a time such as 10:00.' },
    { term: 'How long it takes', meaning: 'Type 30m, 1h or 1h30.' },
    { term: 'Repeats', meaning: 'Type every day, every weekday, every Monday, every 2 weeks, every month or every year.' },
    { term: '# a list or client', meaning: ['Type # and then its name.', 'A name that isn’t a list or a client yet makes a new list.'] },
    { term: '@ a tag', meaning: ['Type @ and then the tag.', 'A tag that isn’t there yet is made for you.'] },
    { term: '! important', meaning: 'It goes to the top of its list.' },
    { term: 'Someday and after work', meaning: ['Type someday to give it no day yet.', 'Type after work to keep it out of your working day.'] },
  ],
};

/**
 * The quick add: one box, read in plain words as it is typed, with what
 * was understood shown under it. The button is never greyed out.
 * @param {{ defaults?: { list_id?: string, heading_id?: string, profile_id?: string }, defaultDay?: string|null, onAdded?: (todo: object) => void, boxRef?: object }} props
 * `defaultDay`: the day a to-do goes to when none is typed (Today's own list: today).
 */
export function QuickAdd({ defaults, defaultDay = null, onAdded, boxRef }) {
  const { todoLists, tags, clients, todayKey } = useCoachPortal();
  const actions = useTodoActions();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const own = useRef(null);
  const field = boxRef || own;
  const ctx = useMemo(() => ({ todayKey, lists: todoLists.filter((l) => !l.finished_at), tags, clients, defaultDay }), [todayKey, todoLists, tags, clients, defaultDay]);
  const parsed = useMemo(() => parseQuickAdd(text, ctx), [text, ctx]);
  const chips = quickAddChips(parsed, ctx);

  const submit = async () => {
    if (busy.current) return;
    if (!parsed.title) { setProblem(NEEDS_WORDS); field.current?.focus(); return; }
    busy.current = true;
    const todo = await actions.add(parsed, defaults);
    busy.current = false;
    if (!todo) return;
    setText('');
    onAdded?.(todo);
  };

  return (
    <form className="cc-qadd" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <TextBox ref={field} lines="one" label="What needs doing?" value={text} maxLength={400} onChange={(v) => { setText(v); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} autoComplete="off" />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      {parsed.title && (
        <div className="cc-qadd-read" aria-live="polite">
          <p className="cc-qadd-title">{parsed.title}</p>
          <ul className="cc-qadd-chips" aria-label="How it was read">{chips.map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      )}
      <div className="cc-qadd-help">
        <span># a list or client, @ a tag, ! important</span>
        <HelpLink helpKey="todo-quick-add" explain={QUICK_HELP}>More it understands</HelpLink>
      </div>
      <div className="cc-qadd-go"><Button variant="primary" type="submit">Add to-do</Button></div>
    </form>
  );
}

/** The quick add in the side panel (full screen on a phone); it closes once the to-do is added. */
export function QuickAddPanel({ open, onClose, defaults, defaultDay = null }) {
  const boxRef = useRef(null);
  return (
    <SlidePanel open={open} onClose={onClose} title="Add to-do" initialFocusRef={boxRef}>
      {open && <QuickAdd boxRef={boxRef} defaults={defaults} defaultDay={defaultDay} onAdded={onClose} />}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- one to-do in its panel

/**
 * A day chosen from Today, Tomorrow, another day or none. "Another day"
 * asks the panel for the calendar (`onPick`), which sits under the two
 * boxes so they stay level.
 */
function DayChoice({ label, value, noneLabel, picking, onPick, onChange }) {
  const { todayKey } = useCoachPortal();
  const tomorrow = addDays(todayKey, 1);
  const options = [
    { value: todayKey, label: 'Today' },
    { value: tomorrow, label: 'Tomorrow' },
    ...(value && value !== todayKey && value !== tomorrow ? [{ value, label: dayWords(value, todayKey) }] : []),
    { value: PICK, label: 'Another day' },
    { value: NONE, label: noneLabel },
  ];
  return (
    <div className="cc-daychoice">
      <Dropdown label={label} options={options} value={picking ? PICK : value || NONE} onChange={(v) => { if (v === PICK) { onPick(true); return; } onPick(false); onChange(v === NONE ? null : v); }} />
    </div>
  );
}

function Checklist({ todo, onSave }) {
  const items = Array.isArray(todo.checklist) ? todo.checklist : [];
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => { if (adding) boxRef.current?.focus(); }, [adding]);
  useEffect(() => { setAdding(false); setText(''); setProblem(null); }, [todo.id]);
  const add = () => {
    const words = clean(text).slice(0, 200);
    if (!words) { setProblem('Type the item to carry on.'); boxRef.current?.focus(); return; }
    if (items.length >= 50) { setProblem('A checklist holds up to 50 items. Take one out first.'); return; }
    onSave([...items, { text: words, done: false }]);
    setText('');
    boxRef.current?.focus();
  };
  return (
    <section className="cc-todo-sec" aria-label="Checklist">
      <div className="cc-todo-sechead"><h3 className="cc-todo-h">Checklist</h3><span>{checklistWords(todo)}</span></div>
      {items.length > 0 && (
        <div className="cc-checklist" role="list">
          {items.map((item, i) => (
            <div key={`${i}:${item.text}`} className={`cc-check-item${item.done ? ' cc-check-item--done' : ''}`} role="listitem">
              <button type="button" role="checkbox" className="ds-check-box" aria-checked={Boolean(item.done)} aria-label={item.text} onClick={() => onSave(items.map((x, n) => (n === i ? { ...x, done: !x.done } : x)))}><span>{TICK}</span></button>
              <span>{item.text}</span>
              <IconButton label={`Remove ${item.text}`} onClick={() => onSave(items.filter((_, n) => n !== i), 'Deleted')} />
            </div>
          ))}
        </div>
      )}
      {adding ? (
        <form className="cc-check-add" noValidate onSubmit={(e) => { e.preventDefault(); add(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setText(''); setProblem(null); } }}>
          <TextBox ref={boxRef} lines="one" ariaLabel="New item" placeholder="New item" value={text} maxLength={200} onChange={(v) => { setText(v); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          {problem && <p className="cc-problem" role="alert">{problem}</p>}
          <div className="cc-check-add-go">
            <Button variant="outline" type="submit">Add item</Button>
            <TextLink onClick={() => { setAdding(false); setText(''); setProblem(null); }}>Done</TextLink>
          </div>
        </form>
      ) : <AddButton onClick={() => setAdding(true)}>Add item</AddButton>}
    </section>
  );
}

/**
 * One to-do in the side panel. Every change saves as it is made ("Saved",
 * with Undo). `id` is the to-do to show, or null for closed.
 */
export function TodoPanel({ id, onClose }) {
  const { todos, todoLists, todoHeadings, clients, tags, state, todayKey } = useCoachPortal();
  const actions = useTodoActions();
  const live = id ? todos.find((t) => t.id === id) || null : null;
  // What it showed stays while the panel slides away.
  const [todo, setTodo] = useState(live);
  useEffect(() => { if (live) setTodo(live); }, [live]);
  // Deleted (here or in another tab) while open: the panel closes.
  useEffect(() => { if (id && !live) onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, live]);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState('');
  const [problem, setProblem] = useState(null);
  const todoId = todo?.id || null;
  const [picking, setPicking] = useState(null); // 'when' | 'due' while the calendar is asked for
  useEffect(() => { setProblem(null); setPicking(null); }, [todoId]);
  useEffect(() => { setTitle(todo?.title || ''); }, [todoId, todo?.title]);
  useEffect(() => { setNotes(todo?.notes || ''); }, [todoId, todo?.notes]);
  useEffect(() => { setTime(timeWords(todo?.planned_time)); }, [todoId, todo?.planned_time]);

  if (!todo) return <SlidePanel open={false} onClose={onClose} title="To-do" />;
  const links = todoLinks(rowsOf(state, 'coach_tag_links'), todo.id);
  const change = (patch, message) => actions.change(todo, patch, message);
  const saveTitle = () => {
    const words = clean(title).slice(0, 300);
    if (!words) { setProblem(NEEDS_WORDS); return; }
    if (words !== todo.title) change({ title: words });
    setTitle(words);
  };
  const saveNotes = () => { const words = notes.slice(0, 4000); if (words !== (todo.notes || '')) change({ notes: words.trim() ? words : null }); };
  const saveTime = () => {
    const next = /^\d{2}:\d{2}$/.test(time) ? time : null;
    if (next !== (timeWords(todo.planned_time) || null)) change({ planned_time: next });
  };

  const setWhen = (k) => change(k ? moveToDay(todo, k) : { ...moveToSomeday(todo), after_work: false });
  const setDue = (k) => change({ due_on: k });
  const lists = todoLists.filter((l) => !l.finished_at || l.id === todo.list_id);
  const headings = todoHeadings.filter((h) => h.list_id === todo.list_id);
  const day = todo.planned_on && todo.planned_on < todayKey ? todayKey : todo.planned_on;
  const estimate = todo.minutes == null ? '' : ESTIMATES.includes(todo.minutes) ? String(todo.minutes) : OTHER;
  const others = [OTHER_SUGGESTED, ...OTHER_ESTIMATES.filter((m) => m !== OTHER_SUGGESTED)].map((m) => ({ value: String(m), label: minutesWords(m) }));
  const done = Boolean(todo.done_at);

  return (
    <SlidePanel
      open={Boolean(live)}
      onClose={onClose}
      title="To-do"
      footer={(
        <div className="cc-panel-foot">
          <TextLink onClick={() => { onClose(); actions.remove(todo); }}>Delete</TextLink>
          <Button variant="primary" className="ds-panel-go" onClick={() => { onClose(); if (done) actions.untick(todo); else actions.tick(todo); }}>{done ? 'Mark as not done' : 'Mark as done'}</Button>
        </div>
      )}
    >
      <p className="cc-todo-when">{done ? `Done ${doneWords(todo, todayKey)}` : plannedWords({ ...todo, planned_on: day }, todayKey) || 'Someday'}</p>
      <div className="cc-field">
        <TextBox lines="one" label="To-do" value={title} maxLength={300} onChange={(v) => { setTitle(v); setProblem(null); }} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
      </div>
      <div className="cc-field cc-todo-switch"><SwitchRow label="Important" checked={Boolean(todo.important)} onChange={(on) => change({ important: on })} /></div>

      <div className="cc-field cc-two cc-todo-two">
        <DayChoice label="When I’ll do it" value={day} noneLabel="Someday" picking={picking === 'when'} onPick={(on) => setPicking(on ? 'when' : null)} onChange={setWhen} />
        <DayChoice label="Deadline" value={todo.due_on} noneLabel="No deadline" picking={picking === 'due'} onPick={(on) => setPicking(on ? 'due' : null)} onChange={setDue} />
      </div>
      {picking && (
        <div className="cc-field">
          <DatePicker
            label={picking === 'when' ? 'Which day will you do it?' : 'Which day is the deadline?'}
            value={(picking === 'when' ? day : todo.due_on) || ''}
            format={(k) => dayWords(k, todayKey)}
            onChange={(k) => { const set = picking === 'when' ? setWhen : setDue; setPicking(null); set(k); }}
          />
        </div>
      )}
      {todo.planned_on && (
        <>
          <div className="cc-field"><TextField label="Time, if it has one" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} onBlur={saveTime} /></div>
          <div className="cc-field cc-todo-switch"><SwitchRow label="After work" note="It sits apart from your working day." checked={Boolean(todo.after_work)} onChange={(on) => change({ after_work: on })} /></div>
        </>
      )}

      <div className="cc-field">
        <Dropdown label="List" options={[{ value: NONE, label: 'No list' }, ...lists.map((l) => ({ value: l.id, label: l.name }))]} value={todo.list_id || NONE} onChange={(v) => change({ list_id: v === NONE ? null : v, heading_id: null })} />
      </div>
      {headings.length > 0 && (
        <div className="cc-field">
          <Dropdown label="Heading" options={[{ value: NONE, label: 'No heading' }, ...headings.map((h) => ({ value: h.id, label: h.name }))]} value={headings.some((h) => h.id === todo.heading_id) ? todo.heading_id : NONE} onChange={(v) => change({ heading_id: v === NONE ? null : v })} />
        </div>
      )}
      <div className="cc-field">
        <Dropdown label="Client" options={[{ value: NONE, label: 'No client' }, ...[...clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }))]} value={clients.some((c) => c.id === todo.profile_id) ? todo.profile_id : NONE} onChange={(v) => change({ profile_id: v === NONE ? null : v })} />
      </div>

      <div className="cc-field cc-todo-est">
        <InlineChoice
          label="How long it takes"
          form="pills"
          options={[...ESTIMATES.map((m) => ({ value: String(m), label: estimateWords(m) })), { value: OTHER, label: 'Other' }]}
          value={estimate}
          onChange={(v) => {
            // Other starts at 3 hours; the chosen one pressed again takes the estimate off.
            if (v === OTHER) change({ minutes: estimate === OTHER ? null : OTHER_SUGGESTED });
            else change({ minutes: String(todo.minutes) === v ? null : Number(v) });
          }}
        />
        {estimate === OTHER && (
          <div className="cc-field"><Dropdown label="How long?" options={others} value={String(todo.minutes || OTHER_SUGGESTED)} onChange={(v) => change({ minutes: Number(v) })} /></div>
        )}
      </div>

      <div className="cc-field">
        <Dropdown
          label="Repeats"
          options={REPEATS.map((r) => ({ value: r.value, label: r.label }))}
          value={repeatValue(todo.repeat_rule)}
          onChange={(v) => {
            const rule = REPEATS.find((r) => r.value === v)?.rule || null;
            // A repeat needs a day to count from: one with none starts today.
            change(rule && !todo.planned_on ? { ...moveToDay(todo, todayKey), repeat_rule: rule } : { repeat_rule: rule });
          }}
        />
      </div>

      {tags.length > 0 && (
        <div className="cc-field">
          <span className="cc-field-label" id="cc-todo-tags">Tags</span>
          <ChipRow label="Tags" className="cc-chips">
            {tags.map((t) => <Chip key={t.id} pressed={links.some((l) => l.tag_id === t.id)} onClick={() => actions.toggleTag(todo, t)}>{t.name}</Chip>)}
          </ChipRow>
        </div>
      )}

      <Checklist todo={todo} onSave={(checklist, message) => change({ checklist }, message)} />

      <div className="cc-field cc-todo-notes">
        <TextBox label="Notes" value={notes} maxLength={4000} onChange={setNotes} onBlur={saveNotes} />
      </div>

      {todo.from_email_sender && (
        <section className="cc-todo-sec" aria-label="Linked to">
          <div className="cc-todo-sechead"><h3 className="cc-todo-h">Linked to</h3></div>
          <div className="cc-todo-linked">
            <b>{todo.from_email_sender}</b>
            <small>Sent you this by email</small>
            {todo.from_email_subject && <span>{todo.from_email_subject}</span>}
            {todo.from_email_at && <small>{whenWords(todo.from_email_at, todayKey)}</small>}
          </div>
        </section>
      )}

      <div className="cc-field cc-todo-switch">
        <SwitchRow label="Remind me" note="On your phone, at the to-do’s time" checked={Boolean(todo.remind)} onChange={(on) => change({ remind: on })} />
      </div>
      {/* "Remove from calendar" goes here once run 3 places to-dos on the calendar. */}
      {/* Attachments ("Add file", the forwarded email itself) come with email logging in run 4. */}
    </SlidePanel>
  );
}
