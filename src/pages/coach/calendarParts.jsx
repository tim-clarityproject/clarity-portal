import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { InfoPop, useToast } from '../../components/design';
import { deviceZone, addDays, dayKeyWords, wallClock } from '../../lib/time/index.js';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { estimateWords } from '../../lib/coach/day';
import {
  bannerRows, calendarEntries, coachZoneOf, DRAG_STEP, entryLabel, entryLines, FULL_TITLE_AFTER_MS, hourLabels, hoursHandleWords, layoutDay, monthCell, monthGrid,
  moveHours, nowLine, nudgeHours, outOfHours, hoursToSave, scheduleDays, secondZoneChoices, snapMinutes, TODOS_TO_PLACE, todosToPlace, weekKeyOf, zoneColumnLabel,
} from '../../lib/coach/calendar';
import { MenuItem, PopMenu, TICK, useCoachPortal } from './parts';
import './calendar.css';

// The calendar's parts (Phase 6a run 3; M11, seq 77), used by the Calendar
// page and by To-dos as a calendar, so neither draws its own:
//
//   const cal = useCalendar();                      the coach's clock, the rows, and run(plan) (saves, says, Undo, Cmd+Z)
//   const entries = cal.entriesFor(fromDay, toDay); what to draw (calendar.js's calendarEntries)
//   <CalGrid days={days} entries={entries} cal={cal} … />   the week or the day: two time columns, tiles, dragging
//   <CalSchedule … />  <CalMonth … />  <TodosToPlace … />
//
// Every rule and word is calendar.js's. Nothing here sends anything.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const MOVE_PX = 5; // a press that moves less than this is a click
const HOLD_MS = 450; // press and hold to drag on a phone
const DAY_MIN = 1440;
const TODOS_FIRST = 8; // the to-dos panel shows this many, then Show all
const wallMin = (instant, zone) => { const w = wallClock(instant, zone); return w.hour * 60 + w.minute; };

/** Where D's and E's pages hang: Book a call, Open for calls, Offer times by email and a poll. */
export const CAL_HOOKS = {
  book: '/coach/calendar/book',
  open: '/coach/calendar/open',
  offer: '/coach/calendar/offer',
  poll: (id) => `/coach/calendar/polls/${id}`,
};

/**
 * The calendar's data and the one way it is saved. `run(plan)` takes a plan
 * from calendar.js: it saves, says the plan's words with Undo for 10
 * seconds, keeps that Undo for Cmd+Z, and hands back any drafted note.
 */
export function useCalendar() {
  const p = useCoachPortal();
  const toast = useToast();
  const coachZone = coachZoneOf(p.settings, deviceZone());
  const data = useMemo(() => ({
    items: p.calItems, guests: p.calGuests, sessions: p.sessions, todos: p.todos, openBlocks: p.openBlocks, polls: p.polls, pollPeople: p.pollPeople, pollOptions: p.pollOptions,
    bookingLinks: p.bookingLinks, bookings: p.bookings, clients: p.clients, groups: p.groups, callTypes: p.callTypes,
  }), [p.calItems, p.calGuests, p.sessions, p.todos, p.openBlocks, p.polls, p.pollPeople, p.pollOptions, p.bookingLinks, p.bookings, p.clients, p.groups, p.callTypes]);
  const last = useRef(null);
  const busy = useRef(false);
  const [tell, setTell] = useState(null);
  const userId = p.userId;

  const run = useCallback(async (plan, { quiet = false } = {}) => {
    if (!plan || busy.current) return false;
    if (plan.problem) { toast.error(plan.problem); return false; }
    if (!plan.save.length && !plan.remove.length) return false;
    busy.current = true;
    let status = 'saved';
    try {
      if (plan.save.length) status = await saveRows(userId, plan.save);
      for (const [table, id] of plan.remove) await removeRow(userId, table, id);
    } catch {
      busy.current = false;
      toast.error(SAVE_PROBLEM);
      return false;
    }
    busy.current = false;
    const undo = async () => {
      last.current = null;
      setTell(null);
      for (const [table, id] of plan.undo.remove) await removeRow(userId, table, id).catch(() => {});
      if (plan.undo.save.length) await saveRows(userId, plan.undo.save).catch(() => {});
    };
    last.current = undo;
    setTell(plan.tell || null);
    if (!quiet) toast.saved({ message: status === 'queued' ? 'Will sync' : plan.words || 'Saved', long: true, onUndo: undo });
    return true;
  }, [userId, toast]);

  // Cmd+Z (or Ctrl+Z) undoes the last change, unless something is being typed. Never listed on screen.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z' || !last.current) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      last.current();
      toast.show('Undone');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toast]);

  const ctx = useMemo(() => ({ coachZone, data, newId, coachId: p.coach.id, coachFirstName: p.coach.display_first_name || '', invites: false, now: p.now }), [coachZone, data, p.coach, p.now]);
  const entriesFor = useCallback((fromDay, toDay, { showTodos = true } = {}) => calendarEntries(data, { fromDay, toDay, coachZone, settings: p.settings, showTodos }), [data, coachZone, p.settings]);
  /** One change to the coach's settings, with Undo. */
  const saveSettings = useCallback(async (patch, message = 'Saved') => {
    const before = p.settings;
    try { await saveRow(userId, 'coach_settings', { ...before, ...patch }); } catch { toast.error(SAVE_PROBLEM); return false; }
    if (message) toast.saved({ message, long: true, onUndo: () => saveRow(userId, 'coach_settings', before).catch(() => {}) });
    return true;
  }, [p.settings, userId, toast]);

  return { ...p, coachZone, data, ctx, run, entriesFor, saveSettings, tell, clearTell: () => setTell(null) };
}

// ---------------------------------------------------------------- a tile

function TileWords({ e, coachZone, narrow }) {
  const lines = entryLines(e, { coachZone, narrow });
  if (lines.oneLine) {
    return (
      <span className="cc-cal-one">
        <span className="cc-cal-title">{lines.title}</span>
        {lines.time && <span className="cc-cal-time">{lines.time}</span>}
      </span>
    );
  }
  return (
    <>
      <span className="cc-cal-title">{lines.title}</span>
      {lines.line && <span className="cc-cal-sub">{lines.line}</span>}
    </>
  );
}

/** The class a tile is drawn with: its colour, and what it is. */
export const tileClass = (e, extra = '') => `cc-cal-tile ${e.colourClass}${e.oneLine ? ' cc-cal-tile--one' : ''}${e.type === 'todo' ? ' cc-cal-tile--todo' : ''}${e.done ? ' cc-cal-tile--done' : ''}${e.todo?.important ? ' cc-cal-tile--important' : ''}${extra}`;

// ---------------------------------------------------------------- the week and the day

/**
 * The week or the day as a grid: the two time columns, each day's heading,
 * the all-day row, out-of-hours hatching under the tiles, the now line, and
 * the tiles. Drag on empty space makes an item (quarter hours), a click an
 * hour; a tile drags to move (to another day too) and from its bottom edge
 * to resize; press and hold on a phone. Arrow keys move a focused tile.
 * @param {{ days: string[], entries: object[], cal: object, win: object, otherZone: string, onOtherZone?: (zone) => void, onZoneList?: () => void,
 *   slot?: { day, fromMin, toMin }|null, hours?: object|null, onHours?: (hours) => void, onCreate, onOpen, onMove, onResize, onNudge, onTick, onUnplace,
 *   dropRef?: object, incoming?: { day, startMin, minutes, title }|null, narrow?: boolean }} props
 *   `hours`: workingHours()'s shape while the working hours are being edited (events dim, a handle at each day's start and finish).
 *   `incoming`: a to-do being dragged in from the to-dos panel. `dropRef`: the to-dos panel, where a placed to-do is dragged back to.
 */
export function CalGrid({
  days, entries, cal, win, otherZone, onOtherZone, onZoneList, slot = null, hours = null, onHours, onCreate, onOpen, onMove, onResize, onNudge, onTick, onUnplace,
  dropRef = null, onOverPanel, incoming = null, narrow = false, label = 'Calendar',
}) {
  const { coachZone, settings, now, todayKey } = cal;
  const cols = useRef({});
  const root = useRef(null);
  const gesture = useRef(null);
  const [drag, setDrag] = useState(null); // { mode, key?, day, startMin, endMin, over? }
  const [zoneMenu, setZoneMenu] = useState(false);
  const zoneBtn = useRef(null);
  const span = win.toMin - win.fromMin;
  const pct = (min) => `${((Math.min(win.toMin, Math.max(win.fromMin, min)) - win.fromMin) / span) * 100}%`;
  const high = (a, b) => `${((Math.min(win.toMin, b) - Math.max(win.fromMin, a)) / span) * 100}%`;
  const labels = useMemo(() => hourLabels(days[0], coachZone, otherZone, { fromHour: win.fromHour, toHour: win.toHour }), [days, coachZone, otherZone, win.fromHour, win.toHour]);
  const banners = useMemo(() => bannerRows(entries, days), [entries, days]);
  const lanes = banners.reduce((n, b) => Math.max(n, b.lane + 1), 0);
  const line = nowLine(now, coachZone, days);
  const editing = Boolean(hours);
  const shownSettings = editing ? { ...settings, ...hoursToSave(hours) } : settings;

  // ---- where the pointer is
  const dayAt = (x) => {
    let best = days[0];
    for (const d of days) { const r = cols.current[d]?.getBoundingClientRect(); if (r && x >= r.left) best = d; }
    return best;
  };
  const minAt = (day, y) => { const r = cols.current[day].getBoundingClientRect(); return win.fromMin + ((y - r.top) / r.height) * span; };
  const overPanel = (x, y) => { const r = dropRef?.current?.getBoundingClientRect(); return Boolean(r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom); };

  // ---- one gesture at a time, followed on the window so it never gets lost
  const latest = useRef({});
  latest.current = { onCreate, onOpen, onMove, onResize, onUnplace, onHours, onOverPanel, hours, days, win, coachZone };
  const end = useCallback(() => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
    clearTimeout(gesture.current?.timer);
    gesture.current = null;
    latest.current.onOverPanel?.(false);
    setDrag(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const preview = (g, e) => {
    const L = latest.current;
    if (g.mode === 'create') {
      const at = Math.min(L.win.toMin, Math.max(L.win.fromMin, minAt(g.day, e.clientY)));
      return { mode: 'create', day: g.day, startMin: snapMinutes(Math.min(g.fromMin, at)), endMin: Math.max(snapMinutes(Math.min(g.fromMin, at)) + DRAG_STEP, snapMinutes(Math.max(g.fromMin, at))), toMin: at };
    }
    if (g.mode === 'resize') {
      const endMin = Math.max(g.startMin + DRAG_STEP, snapMinutes(minAt(g.day, e.clientY)));
      return { mode: 'resize', key: g.entry.key, day: g.day, startMin: g.startMin, endMin };
    }
    if (g.mode === 'hours') {
      return { mode: 'hours', day: g.day, edge: g.edge, minutes: minAt(g.day, e.clientY) };
    }
    const day = dayAt(e.clientX);
    const shift = L.days.indexOf(day) - L.days.indexOf(g.day);
    const startMin = snapMinutes(g.start0 + (minAt(g.day, e.clientY) - g.grabMin));
    const piece = Math.max(0, Math.min(DAY_MIN - DRAG_STEP, startMin));
    return { mode: 'move', key: g.entry.key, day: addDays(g.entry.fromDay, shift), shown: day, startMin: piece, endMin: piece + g.entry.minutes, raw: startMin, over: g.entry.type === 'todo' && overPanel(e.clientX, e.clientY) };
  };
  const move = useCallback((e) => {
    const g = gesture.current;
    if (!g) return;
    const far = Math.abs(e.clientX - g.x) > MOVE_PX || Math.abs(e.clientY - g.y) > MOVE_PX;
    if (g.touch && !g.active) { if (far) end(); return; } // a finger that moves before the hold is scrolling the page
    if (!g.active && !far) return;
    g.active = true;
    const next = latest.current.preview(g, e);
    if (next.mode === 'hours') { latest.current.onHours?.(moveHours(latest.current.hours, weekKeyOf(next.day), next.edge, next.minutes)); return; }
    latest.current.onOverPanel?.(Boolean(next.over));
    setDrag(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const up = useCallback((e) => {
    const g = gesture.current;
    if (!g) return;
    const L = latest.current;
    const done = g.active ? L.preview(g, e) : null;
    end();
    if (g.mode === 'hours') return;
    if (g.mode === 'create') {
      if (g.touch && !done && Date.now() - g.at > HOLD_MS) return;
      L.onCreate?.(done ? { day: g.day, fromMin: done.startMin, toMin: done.endMin } : { day: g.day, fromMin: Math.floor(g.fromMin / 60) * 60, toMin: null });
      return;
    }
    if (!done) { if (g.mode === 'move') L.onOpen?.(g.entry, g.el); return; }
    if (done.mode === 'resize') { L.onResize?.(g.entry, { endDay: done.day, endMin: done.endMin }); return; }
    if (done.over) { L.onUnplace?.(g.entry); return; }
    if (done.day !== g.entry.fromDay || done.raw !== g.start0) L.onMove?.(g.entry, { day: done.day, startMin: done.startMin });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cancel = useCallback(() => end(), [end]);
  latest.current.preview = preview;
  const begin = (e, g) => {
    if (e.button > 0 || gesture.current) return;
    const touch = e.pointerType === 'touch';
    gesture.current = { ...g, x: e.clientX, y: e.clientY, touch, at: Date.now(), active: false, el: e.currentTarget };
    // Press and hold on a phone, then drag; a mouse drags at once.
    if (touch && g.mode !== 'create') gesture.current.timer = setTimeout(() => { if (gesture.current) { gesture.current.active = true; setDrag({ mode: 'held', key: g.entry?.key }); } }, HOLD_MS);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  useEffect(() => () => end(), [end]);
  // While a held tile is dragged on a phone the page stays still.
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const stop = (e) => { if (gesture.current?.active && gesture.current.touch) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  // ---- the full title of a cut-off tile, after 0.3 seconds (the shared pop-up)
  const tipId = useId();
  const tipAnchor = useRef(null);
  const tipPanel = useRef(null);
  const tipTimer = useRef(null);
  const [tip, setTip] = useState(null);
  const hover = (e, entry) => {
    const el = e.currentTarget;
    const title = el.querySelector('.cc-cal-title');
    clearTimeout(tipTimer.current);
    if (!title || (title.scrollWidth <= title.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)) return;
    tipTimer.current = setTimeout(() => { tipAnchor.current = el; setTip(entry.title); }, FULL_TITLE_AFTER_MS);
  };
  const unhover = () => { clearTimeout(tipTimer.current); setTip(null); };
  useEffect(() => () => clearTimeout(tipTimer.current), []);

  const tileKeys = (e, entry) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(entry, e.currentTarget); return; }
    const step = { ArrowUp: { minutes: -DRAG_STEP }, ArrowDown: { minutes: DRAG_STEP }, ArrowLeft: { days: -1 }, ArrowRight: { days: 1 } }[e.key];
    if (step && !editing) { e.preventDefault(); onNudge?.(entry, step); }
  };

  const fixed = (e) => editing || e.type === 'open' || (e.allDay);
  const tile = (t, day) => {
    const e = t.entry;
    const moving = drag && drag.key === e.key && (drag.mode === 'move' || drag.mode === 'resize');
    const startMin = moving && drag.mode === 'resize' ? drag.startMin : t.startMin;
    const endMin = moving && drag.mode === 'resize' ? drag.endMin : t.endMin;
    if (endMin <= win.fromMin || startMin >= win.toMin) return null;
    const width = 100 / t.columns;
    return (
      <div
        key={`${e.key}:${day}`}
        role="button"
        tabIndex={0}
        data-cal-key={e.key}
        className={tileClass(e, `${moving && drag.mode === 'move' ? ' cc-cal-tile--lifted' : ''}${drag?.mode === 'held' && drag.key === e.key ? ' cc-cal-tile--held' : ''}${fixed(e) ? ' cc-cal-tile--fixed' : ''}`)}
        style={{ top: pct(startMin), height: high(startMin, endMin), left: `calc(${t.column * width}% + var(--cal-tile-gap))`, width: `calc(${width}% - 2 * var(--cal-tile-gap))` }}
        aria-label={entryLabel(e, coachZone)}
        onPointerDown={(ev) => { if (ev.target.closest('.cc-cal-tick, .cc-cal-grip')) return; if (fixed(e)) return; ev.stopPropagation(); begin(ev, { mode: 'move', entry: e, day, start0: wallMin(e.startsAt, coachZone), grabMin: minAt(day, ev.clientY) }); }}
        onClick={(ev) => { if (!editing && (ev.detail === 0 || fixed(e)) && !ev.target.closest('.cc-cal-tick')) onOpen?.(e, ev.currentTarget); }}
        onKeyDown={(ev) => tileKeys(ev, e)}
        onMouseEnter={(ev) => hover(ev, e)}
        onMouseLeave={unhover}
      >
        {e.type === 'todo' && (
          <button type="button" role="checkbox" className="cc-cal-tick" aria-checked={e.done} aria-label={`${e.title}, done`} onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => { ev.stopPropagation(); onTick?.(e); }}><span>{TICK}</span></button>
        )}
        <TileWords e={e} coachZone={coachZone} narrow={narrow || t.columns > 1} />
        {!fixed(e) && !t.endsAfter && <span className="cc-cal-grip" aria-hidden="true" onPointerDown={(ev) => { ev.stopPropagation(); begin(ev, { mode: 'resize', entry: e, day, startMin: t.startMin }); }} />}
      </div>
    );
  };

  const ghost = (day) => {
    const g = drag && (drag.mode === 'create' || drag.mode === 'move') && (drag.shown || drag.day) === day ? drag : null;
    const s = !g && slot && slot.day === day ? { startMin: slot.fromMin, endMin: slot.toMin } : null;
    const inc = !g && !s && incoming && incoming.day === day ? { startMin: incoming.startMin, endMin: incoming.startMin + incoming.minutes, title: incoming.title } : null;
    const box = g || s || inc;
    if (!box || (g && g.over)) return null;
    const moved = g?.mode === 'move' ? entries.find((x) => x.key === g.key) : null;
    return (
      <div className={`cc-cal-tile cc-cal-tile--new${moved ? ` ${moved.colourClass}` : ''}`} data-cal-new={s ? '' : undefined} style={{ top: pct(box.startMin), height: high(box.startMin, box.endMin), left: 'var(--cal-tile-gap)', width: 'calc(100% - 2 * var(--cal-tile-gap))' }} aria-hidden="true">
        <span className="cc-cal-title">{moved?.title || inc?.title || ''}</span>
      </div>
    );
  };

  const handle = (day, edge) => {
    const key = weekKeyOf(day);
    const h = hours[key];
    if (!h) return null;
    const time = h[edge === 'from' ? 'from' : 'to'];
    const min = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const words = hoursHandleWords(edge, time);
    return (
      <div
        key={edge}
        role="slider"
        tabIndex={0}
        className={`cc-cal-handle cc-cal-handle--${edge}`}
        style={{ top: pct(min) }}
        aria-label={`${dayKeyWords(day, { long: true }).split(' ')[0]}, ${edge === 'from' ? 'start' : 'finish'}`}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={DAY_MIN - 15}
        aria-valuenow={min}
        aria-valuetext={words}
        onPointerDown={(ev) => { ev.preventDefault(); ev.stopPropagation(); ev.currentTarget.focus(); begin(ev, { mode: 'hours', day, edge }); gesture.current.active = true; }}
        onKeyDown={(ev) => { const s = { ArrowUp: -1, ArrowDown: 1 }[ev.key]; if (s) { ev.preventDefault(); onHours?.(nudgeHours(hours, key, edge, s)); } }}
      >
        <span>{words}</span>
      </div>
    );
  };

  const head = (day) => { const [name, number] = dayKeyWords(day).split(' '); return { name, number }; };
  return (
    <div ref={root} className={`cc-cal${editing ? ' cc-cal--hours' : ''}${drag ? ' cc-cal--dragging' : ''}`} style={{ '--cal-days': days.length, '--cal-hours': win.toHour - win.fromHour }} role="group" aria-label={label}>
      {/* The hatching's one pattern: flat lines in the hatch colour, never a gradient. */}
      <svg className="cc-cal-defs" width="0" height="0" aria-hidden="true"><defs><pattern id="cc-cal-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" /></pattern></defs></svg>
      <div className="cc-cal-head">
        <div className="cc-cal-zone">
          {onOtherZone ? (
            <button type="button" ref={zoneBtn} className="cc-cal-zone-btn" aria-haspopup="menu" aria-expanded={zoneMenu} aria-label={`Second time column, ${zoneColumnLabel(otherZone)}. Edit`} onClick={() => setZoneMenu((v) => !v)}>{zoneColumnLabel(otherZone)}</button>
          ) : <span>{zoneColumnLabel(otherZone)}</span>}
        </div>
        <div className="cc-cal-zone"><span>{zoneColumnLabel(coachZone)}</span></div>
        {days.map((d) => { const h = head(d); return <div key={d} className={`cc-cal-day${d === todayKey ? ' cc-cal-day--today' : ''}`} aria-label={`${dayKeyWords(d, { long: true })}${d === todayKey ? ', today' : ''}`}><span>{h.name}</span><b>{h.number}</b></div>; })}
      </div>
      {lanes > 0 && (
        <div className="cc-cal-allday" style={{ '--cal-lanes': lanes }}>
          <div className="cc-cal-allday-label">All day</div>
          <div className="cc-cal-allday-row">
            {banners.map((b) => (
              <button key={b.entry.key} type="button" className={tileClass(b.entry, ' cc-cal-banner')} style={{ gridColumn: `${b.from + 1} / span ${b.span}`, gridRow: b.lane + 1 }} aria-label={entryLabel(b.entry, coachZone)} onClick={(ev) => onOpen?.(b.entry, ev.currentTarget)}>
                <span className="cc-cal-title">{b.entry.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="cc-cal-body">
        <div className="cc-cal-times" aria-hidden="true">{labels.map((l) => <div key={l.hour} className="cc-cal-hour">{l.other}</div>)}</div>
        <div className="cc-cal-times" aria-hidden="true">{labels.map((l) => <div key={l.hour} className="cc-cal-hour">{l.coach}</div>)}</div>
        {days.map((day) => {
          const lay = layoutDay(entries, day, coachZone);
          const off = outOfHours(shownSettings, day).filter((s) => s.toMin > win.fromMin && s.fromMin < win.toMin);
          return (
            <div
              key={day}
              ref={(el) => { cols.current[day] = el; }}
              data-cal-day={day}
              className="cc-cal-col"
              onPointerDown={(ev) => { if (editing || ev.target !== ev.currentTarget) return; begin(ev, { mode: 'create', day, fromMin: minAt(day, ev.clientY) }); }}
            >
              {off.map((s) => <svg key={s.fromMin} className="cc-cal-off" style={{ top: pct(s.fromMin), height: high(s.fromMin, s.toMin) }} aria-hidden="true"><rect width="100%" height="100%" fill="url(#cc-cal-hatch)" /></svg>)}
              {labels.map((l) => <div key={l.hour} className="cc-cal-hl" />)}
              {line && line.day === day && line.minutes >= win.fromMin && line.minutes <= win.toMin && <div className="cc-cal-now" style={{ top: pct(line.minutes) }} role="img" aria-label={`Now, ${line.time}`} />}
              {lay.tiles.map((t) => tile(t, day))}
              {ghost(day)}
              {editing && hours[weekKeyOf(day)] && [handle(day, 'from'), handle(day, 'to')]}
              {editing && !hours[weekKeyOf(day)] && <button type="button" className="cc-cal-sethours ds-link" onClick={() => onHours?.(moveHours(hours, weekKeyOf(day), 'from', 540))}>Set hours</button>}
            </div>
          );
        })}
      </div>
      <InfoPop id={tipId} open={Boolean(tip)} anchorRef={tipAnchor} panelRef={tipPanel} lines={tip ? [tip] : []} />
      {onOtherZone && (
        <PopMenu open={zoneMenu} onClose={() => setZoneMenu(false)} anchorRef={zoneBtn} title="Second time column">
          {secondZoneChoices(settings, coachZone).map((z) => <MenuItem key={z.value} checked={z.value === otherZone} onClick={() => { setZoneMenu(false); onOtherZone(z.value); }}>{z.label}</MenuItem>)}
          {onZoneList && <MenuItem onClick={() => { setZoneMenu(false); onZoneList(); }}>Edit this list</MenuItem>}
        </PopMenu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the Schedule

/** A scrolling list of what's next, a day at a time (the phone's default): a square of each tile's colour, the time, the name and its quiet facts. */
export function CalSchedule({ days, entries, cal, onOpen }) {
  const list = scheduleDays(entries, { days, coachZone: cal.coachZone, todayKey: cal.todayKey });
  if (!list.length) return <p className="cc-quiet">Nothing is planned for these days.</p>;
  return (
    <div className="cc-sched">
      {list.map((d) => (
        <section key={d.day} aria-label={d.title}>
          <h2 className="cc-sched-day">{d.title}</h2>
          {d.rows.length === 0 && <p className="cc-quiet">{d.empty}</p>}
          {d.rows.map((r) => (
            <button key={r.entry.key} type="button" className={`cc-sched-row${r.entry.done ? ' cc-sched-row--done' : ''}`} onClick={(ev) => onOpen?.(r.entry, ev.currentTarget)} aria-label={entryLabel(r.entry, cal.coachZone)}>
              <span className={`cc-sched-square ${r.square.className}${r.square.dashed ? ' cc-sched-square--dashed' : ''}${r.square.edged ? ' cc-sched-square--edged' : ''}`} aria-hidden="true" />
              <span className="cc-sched-time">{r.time}</span>
              <span className="cc-sched-words">
                <b>{r.title}</b>
                <small>{[...r.lines, r.length].filter(Boolean).map((w) => <span key={w}>{w}</span>)}</small>
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- the month

/** The month: each day opens that day. A laptop shows the first few items by name; a phone their squares. */
export function CalMonth({ day, entries, cal, weekends, onDay, phone = false }) {
  const weeks = monthGrid(day, { weekends });
  const heads = weeks[0].map((c) => dayKeyWords(c.day).split(' ')[0]);
  return (
    <div className="cc-month" style={{ '--cal-days': heads.length }} role="grid" aria-label="Month">
      <div className="cc-month-head" role="row">{heads.map((h) => <span key={h} role="columnheader">{h}</span>)}</div>
      {weeks.map((w) => (
        <div key={w[0].day} className="cc-month-week" role="row">
          {w.map((c) => {
            const cell = monthCell(entries, c.day, phone ? 4 : 3);
            return (
              <button key={c.day} type="button" role="gridcell" className={`cc-month-cell${c.inMonth ? '' : ' cc-month-cell--out'}${c.day === cal.todayKey ? ' cc-month-cell--today' : ''}`} aria-label={cell.label} onClick={() => onDay(c.day)}>
                <b>{c.number}</b>
                {phone ? (
                  <span className="cc-month-dots" aria-hidden="true">{cell.shown.map((e) => <i key={e.key} className={`cc-sched-square ${e.colourClass}${e.dashed ? ' cc-sched-square--dashed' : ''}`} />)}</span>
                ) : cell.shown.map((e) => <span key={e.key} className={`cc-month-item ${e.colourClass}`} aria-hidden="true">{e.title}</span>)}
                {cell.more > 0 && <small aria-hidden="true">{cell.moreWords}</small>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- to-dos to place

/**
 * The to-dos panel: the to-dos with no time yet. One drags onto a day; a
 * placed to-do dragged back here comes off the calendar (a dashed coral
 * outline shows while it is over the panel). A click opens the to-do.
 * @param {{ cal: object, panelRef: object, over: boolean, onOpen: (todo) => void, onDrag: ({ todo, x, y, done, cancelled }) => void, first?: number }} props `first`: how many show before "Show all" (8; 4 on a phone)
 */
export function TodosToPlace({ cal, panelRef, over = false, onOpen, onDrag, first = TODOS_FIRST }) {
  const all = todosToPlace(cal.todos, cal.todayKey);
  const [every, setEvery] = useState(false);
  const list = every ? all : all.slice(0, first);
  const g = useRef(null);
  const start = (e, todo) => {
    if (e.button > 0) return;
    const touch = e.pointerType === 'touch';
    const state = { todo, x: e.clientX, y: e.clientY, active: false, touch };
    g.current = state;
    const move = (ev) => {
      const far = Math.abs(ev.clientX - state.x) > MOVE_PX || Math.abs(ev.clientY - state.y) > MOVE_PX;
      if (touch && !state.active) { if (far) stop(); return; }
      if (!state.active && !far) return;
      state.active = true;
      onDrag({ todo, x: ev.clientX, y: ev.clientY });
    };
    const up = (ev) => { const was = state.active; stop(); if (was) onDrag({ todo, x: ev.clientX, y: ev.clientY, done: true }); else onOpen(todo); };
    const cancel = () => { stop(); onDrag({ todo, cancelled: true }); };
    const block = (ev) => { if (state.active) ev.preventDefault(); };
    function stop() {
      clearTimeout(state.timer);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel); window.removeEventListener('touchmove', block);
      g.current = null;
    }
    if (touch) { state.timer = setTimeout(() => { state.active = true; }, HOLD_MS); window.addEventListener('touchmove', block, { passive: false }); }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  return (
    <aside ref={panelRef} className={`cc-cal-todos${over ? ' cc-cal-todos--over' : ''}`} aria-label={TODOS_TO_PLACE}>
      <h2 className="cc-cal-todos-title">{TODOS_TO_PLACE}</h2>
      {list.length === 0 && <p className="cc-quiet">Every to-do has a time.</p>}
      <div className="cc-cal-todos-list">
        {list.map((t) => (
          <button key={t.id} type="button" data-todo={t.id} className={`cc-cal-todo${t.important ? ' cc-cal-todo--important' : ''}`} onPointerDown={(e) => start(e, t)} onClick={(e) => { if (e.detail === 0) onOpen(t); }} aria-label={`${t.title}${t.important ? ', important' : ''}${t.minutes ? `, ${estimateWords(t.minutes)}` : ''}`}>
            <b>{t.important && <i className="ds-important-mark" aria-hidden="true" />}{t.title}</b>
            {t.minutes ? <small>{estimateWords(t.minutes)}</small> : null}
          </button>
        ))}
      </div>
      {all.length > first && <div className="cc-acts"><button type="button" className="ds-link" aria-expanded={every} onClick={() => setEvery((v) => !v)}>{every ? 'Show fewer' : `Show all ${all.length}`}</button></div>}
    </aside>
  );
}

/** The day under a point and the minute there, from the grid's own columns; null off the grid. */
export function gridPoint(x, y, win) {
  const col = [...document.querySelectorAll('[data-cal-day]')].find((el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; });
  if (!col) return null;
  const r = col.getBoundingClientRect();
  return { day: col.dataset.calDay, startMin: Math.max(0, Math.min(DAY_MIN - DRAG_STEP, snapMinutes(win.fromMin + ((y - r.top) / r.height) * (win.toMin - win.fromMin)))) };
}

/** Puts something beside a box on the screen (the quick add beside the new item): to its right when there is room, otherwise its left, always inside the window. */
export function useBeside(anchorSelector, open, deps = []) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!open || !box) return undefined;
    const place = () => {
      const anchor = document.querySelector(anchorSelector);
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const a = anchor ? anchor.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 3 };
      let left = a.right + 8;
      if (left + w > vw - 12) left = a.left - 8 - w;
      if (left < 12) left = Math.max(12, vw - w - 12);
      const top = Math.max(12, Math.min(vh - h - 12, a.top));
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorSelector, ...deps]);
  return ref;
}
