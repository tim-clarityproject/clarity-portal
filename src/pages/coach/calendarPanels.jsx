import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Chip, ChipRow, DatePicker, Dropdown, IconButton, InlineChoice, SearchField, SlidePanel, SwitchRow, TextBox, TextField, useIsPhone, useToast,
} from '../../components/design';
import { addDays, dayKeyWords, wallClock, weekdayOf } from '../../lib/time/index.js';
import { newId, rowsOf } from '../../lib/coach/store';
import { blankTodo, lastPosition } from '../../lib/coach/todoActions';
import { clean, cut, firstName } from '../../lib/coach/model';
import {
  allDayItem, ASSOCIATES_CALENDAR, associateLines, busyLines, CAL_REPEATS, CALENDARS, calendarShown, calQuickAddChips, calRepeatValue, calRepeatWords, deleteEntry, duplicateEntry, editRepeat, guestRows, invited, INVITED_EXAMPLE,
  gridColumnsMax, hoursWindow, INVITED_LABEL, ITEM_KINDS, joinLink, lengthLine, moveEntry, NEEDS_TITLE, newItem, nudgeEntry, parseCalQuickAdd, pickPeople, placeTodo, PLACES, QUICK_KINDS, QUICK_TITLE,
  quickAddPlan, quickSaveLabel, removeLabel, REPEAT_SCOPES, startingSecondZone, viewRange, repeatOk, REPLIES, replyWords, resizeEntry, spanWords, T, timesAt, typedTimes, undoOf,
} from '../../lib/coach/calendar';
import { TextLink } from './parts';
import { MovedInGoogle, useCalSync, useConflictLine } from './calSync';
import { GoogleCalendarSwitches } from './googleCalendars';
import { CAL_HOOKS, CalGrid, gridPoint, TodosToPlace, useBeside, useCalendar } from './calendarParts';
import { TodoPanel, useTodoActions } from './todoParts';

// The calendar's panels (Phase 6a run 3; M11): the quick add beside a new
// item, one item in its side panel with More options, My calendars, the
// drafted note for a client whose call moved, and the one place that says
// what a tile opens. Every rule and word is calendar.js's.
//
//   const panels = useCalPanels(cal, { days });
//   <CalGrid … slot={panels.slot} onCreate={panels.create} onOpen={panels.open} onMove={panels.move} onResize={panels.resize} onNudge={panels.nudge} onTick={panels.tick} onUnplace={panels.unplace} />
//   {panels.node}

const BriefPanel = lazy(() => import('./Brief').then((m) => ({ default: m.BriefPanel || m.default })));
const NONE = '__none__';
const FAR_BACK = '2000-01-01';
const REMINDERS = [{ value: NONE, label: 'No reminder' }, { value: '10', label: '10 minutes before' }, { value: '30', label: '30 minutes before' }, { value: '60', label: '1 hour before' }, { value: '1440', label: '1 day before' }];
const ENDS = [{ value: 'never', label: 'It carries on' }, { value: 'until', label: 'On a day' }, { value: 'count', label: 'After a number of times' }];
const EVERY = [{ value: 'day', label: 'Days' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }, { value: 'year', label: 'Years' }];
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const asPlan = (data, { save = [], remove = [], words = 'Saved', tell = null }) => ({ save, remove, undo: undoOf({ save, remove }, data), problem: null, words, tell });

// ---------------------------------------------------------------- the quick add

/**
 * The quick add: a title (read in plain words: "Coffee with Dan Thu
 * 10:00"), what it is, More options and Save. Beside the new item on a
 * laptop; in the side panel from "Add to calendar" and on a phone.
 */
function QuickAddBody({ cal, slot, onDone, onMore, boxRef }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(null);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const parsed = useMemo(() => parseCalQuickAdd(title, { todayKey: cal.todayKey, defaultDay: slot.day }), [title, cal.todayKey, slot.day]);
  // Typed times win; otherwise the slot that was dragged or clicked.
  const fromSlot = () => timesAt({ day: parsed.title ? parsed.day : slot.day, startMin: slot.fromMin, minutes: slot.toMin - slot.fromMin, coachZone: cal.coachZone });
  const typed = parsed.title && !parsed.allDay ? typedTimes({ day: parsed.day, from: parsed.from, to: parsed.to, coachZone: cal.coachZone }) : null;
  const times = typed && !typed.problem ? typed : fromSlot(); // a typed time that can't be kept never stops the page: the slot stands
  const guess = parsed.kind === 'connection' ? 'net' : 'own';
  const chosen = kind || guess;
  const when = `${dayKeyWords(wallClock(times.starts_at, cal.coachZone).date)}, ${spanWords(new Date(times.starts_at), new Date(times.ends_at), cal.coachZone)}`;
  const draft = () => ({ title: parsed.title, kind: chosen, itemKind: chosen === 'own' && ['writing', 'admin'].includes(parsed.kind) ? parsed.kind : null, starts_at: times.starts_at, ends_at: times.ends_at, repeat_rule: parsed.repeat_rule });
  const save = async () => {
    if (busy.current) return;
    const d = draft();
    if (!d.title) { setProblem(NEEDS_TITLE); boxRef.current?.focus(); return; }
    // A client call goes on to Book a call, with what was typed.
    if (chosen === 'call') { onDone(); navigate(CAL_HOOKS.book, { state: { title: d.title, starts_at: d.starts_at, ends_at: d.ends_at } }); return; }
    busy.current = true;
    const plan = quickAddPlan(d, { ...cal.ctx, itemKind: d.itemKind, todo: chosen === 'todo' ? { ...blankTodo(cal.coach.id), position: lastPosition(cal.todos) } : null });
    const ok = await cal.run(plan);
    busy.current = false;
    if (ok) onDone();
  };
  return (
    <form className="cc-cal-quick-form" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
      <TextBox ref={boxRef} lines="one" ariaLabel="Title" placeholder={QUICK_TITLE} value={title} maxLength={200} onChange={(v) => { setTitle(v); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} autoComplete="off" />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <p className="cc-cal-quick-when" aria-live="polite">{when}{parsed.repeat_rule ? `, ${calQuickAddChips(parsed).slice(-1)[0].toLowerCase()}` : ''}</p>
      <div className="cc-field"><Dropdown label="What is it?" options={QUICK_KINDS.map((k) => ({ value: k.value, label: k.label }))} value={chosen} onChange={setKind} /></div>
      <div className="cc-cal-quick-go">
        <TextLink onClick={() => onMore(draft())}>More options</TextLink>
        <Button variant="primary" type="submit">{quickSaveLabel(chosen)}</Button>
      </div>
    </form>
  );
}

function QuickAdd({ cal, slot, floating, onClose, onMore }) {
  const boxRef = useRef(null);
  const open = Boolean(slot);
  const ref = useBeside('[data-cal-new]', open && floating, [slot?.day, slot?.fromMin, slot?.toMin]);
  useEffect(() => {
    if (!open || !floating) return undefined;
    boxRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('.ds-portal, .ds-pop, [role=listbox]')) onClose(); };
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, floating, slot?.day, slot?.fromMin]);
  if (floating) {
    if (!open) return null;
    return (
      <div ref={ref} className="cc-cal-quick" role="dialog" aria-label="Add to calendar">
        <QuickAddBody key={`${slot.day}:${slot.fromMin}:${slot.toMin}`} cal={cal} slot={slot} onDone={onClose} onMore={onMore} boxRef={boxRef} />
      </div>
    );
  }
  return (
    <SlidePanel draftKey="cal-add:new" open={open} onClose={onClose} title="Add to calendar" initialFocusRef={boxRef}>
      {open && <QuickAddBody cal={cal} slot={slot} onDone={onClose} onMore={onMore} boxRef={boxRef} />}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- one item, with More options

const ruleToDraft = (rule) => ({
  repeat: calRepeatValue(rule), every: rule?.every === 'weekday' ? 'day' : rule?.every || 'week', interval: String(rule?.interval || 1), weekdays: rule?.weekdays || [],
  ends: rule?.until ? 'until' : rule?.count ? 'count' : 'never', until: rule?.until || '', count: String(rule?.count || 10),
});
/** The draft's repeat as a rule, or a calm line. */
function draftRule(d) {
  if (d.repeat === 'never') return { rule: null };
  const base = d.repeat === 'custom'
    ? { every: d.every, interval: Number(d.interval), ...(d.every === 'week' && d.weekdays.length ? { weekdays: [...d.weekdays].sort((a, b) => a - b) } : {}), ...(d.every === 'month' ? { by: 'date' } : {}) }
    : { ...CAL_REPEATS.find((r) => r.value === d.repeat).rule };
  if (d.ends === 'until') { if (!d.until) return { problem: 'Choose the last day to carry on.' }; base.until = d.until; }
  if (d.ends === 'count') base.count = Number(d.count);
  if (!repeatOk(base)) return { problem: d.ends === 'count' ? 'Type a number of times from 1 to 730.' : 'Type a number from 1 to 52.' };
  return { rule: base };
}

function draftOf(entry, fresh, coachZone) {
  if (!entry) {
    const s = wallClock(fresh.starts_at, coachZone);
    const e = wallClock(fresh.ends_at, coachZone);
    const quick = QUICK_KINDS.find((k) => k.value === fresh.kind);
    return {
      title: fresh.title || '', allDay: false, day: s.date, lastDay: s.date, from: s.time, to: e.time, kind: fresh.itemKind || quick?.kind || 'own_time', calendar: 'work', ...ruleToDraft(fresh.repeat_rule || null),
      place: NONE, location: '', notes: '', remind: NONE, by: 'email', busy: 'busy', private: false, paste: '', picked: [], gone: [], scope: 'one',
    };
  }
  const i = entry.item;
  const s = wallClock(entry.startsAt, coachZone);
  const e = wallClock(entry.endsAt, coachZone);
  if (entry.type === 'todo') return { title: entry.title, allDay: false, day: s.date, lastDay: s.date, from: s.time, to: e.time };
  const reminder = Array.isArray(i.reminders) && i.reminders[0] ? i.reminders[0] : null;
  return {
    title: i.title || '', allDay: Boolean(entry.allDay), day: entry.allDay ? entry.fromDay : s.date, lastDay: entry.allDay ? entry.toDay : s.date, from: entry.allDay ? '09:00' : s.time, to: entry.allDay ? '10:00' : e.time,
    kind: i.kind, calendar: i.calendar || 'work', ...ruleToDraft(i.repeat_rule), place: i.place_kind || NONE, location: i.location || '', notes: i.notes || '',
    remind: reminder ? String(reminder.minutes) : NONE, by: reminder?.by || 'email', busy: i.busy === false ? 'free' : 'busy', private: Boolean(i.private), paste: '', picked: [], gone: [], scope: 'one',
  };
}

/** What the panel saves: the plan, or a calm line. */
function planFromDraft(d, { entry, cal }) {
  const { ctx, coachZone, data, coach } = cal;
  const title = cut(clean(d.title), 200); // as the quick add: unseen characters are no title, and 200 is what the database keeps
  if (!title) return { problem: NEEDS_TITLE };
  let times = null;
  if (!d.allDay) {
    times = typedTimes({ day: d.day, from: d.from, to: d.to, coachZone });
    if (times.problem) return { problem: times.problem };
  } else if (d.lastDay < d.day) return { problem: 'Choose a last day on or after the first to carry on.' };
  if (entry?.type === 'todo') {
    const w = wallClock(times.starts_at, coachZone);
    return { plan: moveEntry(entry, { day: w.date, startMin: w.hour * 60 + w.minute, minutes: times.minutes }, ctx) };
  }
  const repeat = draftRule(d);
  if (repeat.problem) return { problem: repeat.problem };
  // A repeat that stops before it starts would be saved and show nowhere.
  if (repeat.rule?.until && repeat.rule.until < d.day && !(entry?.item?.repeat_rule && d.scope === 'one')) return { problem: 'Choose a last day on or after the first to carry on.' };
  const patch = {
    title, kind: d.kind, calendar: d.calendar, place_kind: d.place === NONE ? null : d.place, location: d.location.trim() || null, notes: d.notes.trim() ? d.notes : null,
    reminders: d.remind === NONE ? [] : [{ minutes: Number(d.remind), by: d.by }], busy: d.busy !== 'free', private: d.private,
  };
  // Nobody is invited twice: someone already on the item, or pasted and picked as well, is left out (the database keeps one
  // row an email on an item, and refusing the second stopped the whole save: the break-it tester, 20 Nov).
  const mail = (p) => String(p.email || '').toLowerCase();
  const have = new Set((entry?.item ? data.guests.filter((g) => g.item_id === entry.item.id && !d.gone.includes(g.id)) : []).map(mail).filter(Boolean));
  const people = [...invited(d.paste).people, ...d.picked].filter((p, n, all) => !mail(p) || (!have.has(mail(p)) && all.findIndex((x) => mail(x) === mail(p)) === n));
  const guestsFor = (itemId) => guestRows(people, { itemId, coachId: coach.id, newId, clients: data.clients }).map((g) => [T.guests, g]);
  const allDay = d.allDay ? allDayItem({ id: 'x', coachId: coach.id, title, firstDay: d.day, lastDay: d.lastDay, zone: coachZone }) : null;
  const when = allDay ? { all_day: true, starts_on: allDay.starts_on, ends_on: allDay.ends_on, starts_at: allDay.starts_at, ends_at: allDay.ends_at } : { all_day: false, starts_on: null, ends_on: null, starts_at: times.starts_at, ends_at: times.ends_at };
  if (!entry) {
    const item = { ...newItem({ id: newId(), coachId: coach.id, title, time_zone: coachZone, ...when }), ...patch, ...when, repeat_rule: repeat.rule };
    return { plan: asPlan(data, { save: [[T.items, item], ...guestsFor(item.id)], words: 'Added' }) };
  }
  const i = entry.item;
  const gone = d.gone.map((id) => [T.guests, id]);
  const timesChanged = d.allDay !== Boolean(entry.allDay) || (d.allDay ? d.day !== entry.fromDay || d.lastDay !== entry.toDay : times.starts_at !== entry.startsAt.toISOString() || times.ends_at !== entry.endsAt.toISOString());
  if (i.repeat_rule) {
    // A repeat: this one, this and following, or all of them. The rule itself only changes for the ones it still covers.
    const part = editRepeat({ series: i, on: entry.on, scope: d.scope, patch: d.scope === 'one' ? patch : { ...patch, repeat_rule: repeat.rule }, times: timesChanged && !d.allDay ? when : null, items: data.items, newId });
    const row = part.save[part.save.length - 1][1];
    return { plan: asPlan(data, { save: [...part.save, ...guestsFor(row.id)], remove: [...part.remove, ...gone] }) };
  }
  // Moving a call takes its session and its travel time with it, and drafts the note (calendar.js's moveEntry).
  const moved = timesChanged && !d.allDay && !entry.allDay ? moveEntry(entry, { times: when }, ctx) : null;
  if (moved?.problem) return { problem: moved.problem };
  const rest = moved ? moved.save.filter(([t, r]) => !(t === T.items && r.id === i.id)) : [];
  const item = { ...i, ...patch, ...when, repeat_rule: i.series_id ? null : repeat.rule };
  return { plan: asPlan(data, { save: [[T.items, item], ...rest, ...guestsFor(i.id)], remove: gone, words: moved?.words || 'Saved', tell: moved?.tell || null }) };
}

/**
 * One calendar item in the side panel: Title, Day, Starts and Ends (typed,
 * in 5-minute steps), then More options: repeats, the place, who's
 * invited, notes, a reminder, busy or free, private and what it is. A
 * placed to-do has its times and Remove from calendar. `fresh` is a new
 * item's start (from the quick add's More options).
 */
function ItemPanel({ cal, entry, fresh, days, onClose }) {
  const open = Boolean(entry || fresh);
  const shown = useRef({ entry, fresh });
  if (open) shown.current = { entry, fresh };
  const e = shown.current.entry;
  const f = shown.current.fresh;
  const key = e ? e.key : f ? `new:${f.starts_at}` : 'none';
  const [d, setD] = useState(null);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState(null);
  const [q, setQ] = useState('');
  const busy = useRef(false);
  // While an item is open here nothing changes under it: a change from Google Calendar waits, and says so (calSync.jsx).
  const sync = useCalSync();
  const editingId = open && e?.type === 'item' ? e.item.id : null;
  const setEditing = sync.setEditing;
  useEffect(() => { setEditing(editingId); return () => setEditing(null); }, [editingId, setEditing]);
  const conflict = useConflictLine(editingId);
  useEffect(() => { if (open) { setD(draftOf(e, f, cal.coachZone)); setMore(Boolean(f)); setProblem(null); setQ(''); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key, open]);
  if (!d || (!e && !f)) return <SlidePanel open={false} onClose={onClose} title="Calendar item" />;
  const set = (patch) => { setD((was) => ({ ...was, ...patch })); setProblem(null); };
  const todo = e?.type === 'todo';
  const i = e?.item || null;
  const repeats = Boolean(i?.repeat_rule);
  const guests = i ? cal.calGuests.filter((g) => g.item_id === i.id && !d.gone.includes(g.id)) : [];
  const read = invited(d.paste);
  const found = pickPeople(q, { clients: cal.clients, contacts: rowsOf(cal.state, 'organisation_contacts'), coaches: cal.coaches.filter((c) => c.id !== cal.coach.id) })
    .filter((p) => !d.picked.some((x) => x.name === p.name && x.email === p.email) && !guests.some((g) => g.name === p.name));
  const length = d.allDay ? null : typedTimes({ day: d.day, from: d.from, to: d.to, coachZone: cal.coachZone });
  const link = i ? joinLink(i, e.session) : null;
  const save = async () => {
    if (busy.current) return;
    const made = planFromDraft(d, { entry: e, cal });
    if (made.problem) { setProblem(made.problem); return; }
    busy.current = true;
    const ok = await cal.run(made.plan);
    busy.current = false;
    if (ok) onClose();
  };
  const act = async (plan) => { if (busy.current) return; busy.current = true; const ok = await cal.run(plan); busy.current = false; if (ok) onClose(); };
  const kinds = Object.entries(ITEM_KINDS).filter(([k]) => (k !== 'hold' && k !== 'client_call') || k === d.kind).map(([value, k]) => ({ value, label: k.label }));
  return (
    <SlidePanel draftKey={`cal-item:${e?.id || 'new'}`}
      open={open}
      onClose={onClose}
      title={e ? e.title : 'Add to calendar'}
      footer={(
        <div className="cc-panel-foot">
          {e ? <TextLink onClick={() => act(deleteEntry(e, { ...cal.ctx, scope: d.scope || 'one' }))}>{removeLabel(e)}</TextLink> : <span />}
          {e && !todo && <TextLink onClick={() => act(duplicateEntry(e, { ...cal.ctx, days }))}>Duplicate</TextLink>}
          <Button variant="primary" className="ds-panel-go" onClick={save}>Save</Button>
        </div>
      )}
    >
      {conflict && <p className="cc-note" role="status">{conflict}</p>}
      {i && <MovedInGoogle item={cal.calItems.find((x) => x.id === i.id) || null} />}
      {e?.clientWords && <p className="cc-quiet">{firstName(e.title)}’s time: {e.clientWords}.</p>}
      {link && <div className="cc-acts"><a className="ds-link" href={link} target="_blank" rel="noreferrer">Join on Zoom</a></div>}
      {!todo && <div className="cc-field"><TextBox lines="one" label="Title" value={d.title} maxLength={200} onChange={(v) => set({ title: v })} /></div>}
      {todo && <p className="cc-quiet">It’s one of your to-dos, so it shows on To-dos too.</p>}
      {more && !todo && <div className="cc-field cc-todo-switch"><SwitchRow label="All day" checked={d.allDay} onChange={(on) => set({ allDay: on })} /></div>}
      <div className="cc-field"><DatePicker label={d.allDay ? 'First day' : 'Day'} value={d.day} min={FAR_BACK} format={(k) => dayKeyWords(k)} onChange={(k) => set({ day: k, lastDay: d.lastDay < k || !d.allDay ? k : d.lastDay })} /></div>
      {d.allDay && <div className="cc-field"><DatePicker label="Last day" value={d.lastDay} min={d.day} format={(k) => dayKeyWords(k)} onChange={(k) => set({ lastDay: k })} /></div>}
      {!d.allDay && (
        <>
          <div className="cc-field cc-two">
            <TextField label="Starts" type="time" step={300} value={d.from} onChange={(ev) => set({ from: ev.target.value })} />
            <TextField label="Ends" type="time" step={300} value={d.to} onChange={(ev) => set({ to: ev.target.value })} />
          </div>
          {length && !length.problem && <p className="cc-note">{lengthLine(length.minutes)}</p>}
        </>
      )}
      {repeats && (
        <div className="cc-field"><InlineChoice label="Which ones?" form="rows" options={REPEAT_SCOPES} value={d.scope} onChange={(v) => set({ scope: v })} /></div>
      )}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}

      {!todo && !more && <div className="cc-acts"><TextLink aria-expanded="false" onClick={() => setMore(true)}>More options</TextLink></div>}
      {!todo && more && (
        <>
          {!i?.series_id && (
            <div className="cc-field"><Dropdown label="Repeats" options={CAL_REPEATS.map((r) => ({ value: r.value, label: r.label }))} value={d.repeat} onChange={(v) => set({ repeat: v })} /></div>
          )}
          {!i?.series_id && d.repeat === 'custom' && (
            <>
              <div className="cc-field cc-two">
                <TextField label="Every" inputMode="numeric" value={d.interval} onChange={(ev) => set({ interval: ev.target.value.replace(/\D/g, '').slice(0, 2) })} />
                <Dropdown label="Days, weeks, months or years" options={EVERY} value={d.every} onChange={(v) => set({ every: v })} />
              </div>
              {d.every === 'week' && (
                <div className="cc-field">
                  <span className="cc-field-label">On these days</span>
                  <ChipRow label="On these days" className="cc-chips">
                    {WEEKDAYS.map(([n, w]) => <Chip key={n} pressed={(d.weekdays.length ? d.weekdays : [weekdayOf(d.day) % 7]).includes(n)} onClick={() => { const now = d.weekdays.length ? d.weekdays : [weekdayOf(d.day) % 7]; set({ weekdays: now.includes(n) ? now.filter((x) => x !== n) : [...now, n] }); }}>{w}</Chip>)}
                  </ChipRow>
                </div>
              )}
            </>
          )}
          {!i?.series_id && d.repeat !== 'never' && (
            <>
              <div className="cc-field"><Dropdown label="When does it stop?" options={ENDS} value={d.ends} onChange={(v) => set({ ends: v })} /></div>
              {d.ends === 'until' && <div className="cc-field"><DatePicker label="Last day it repeats" value={d.until} min={d.day} format={(k) => dayKeyWords(k)} onChange={(k) => set({ until: k })} /></div>}
              {d.ends === 'count' && <div className="cc-field"><TextField label="How many times" inputMode="numeric" value={d.count} onChange={(ev) => set({ count: ev.target.value.replace(/\D/g, '').slice(0, 3) })} /></div>}
              {(() => { const r = draftRule(d); return r.rule ? <p className="cc-note">{calRepeatWords(r.rule, d.day)}.</p> : null; })()}
            </>
          )}

          <div className="cc-field"><Dropdown label="Where is it?" options={[{ value: NONE, label: 'Nowhere set' }, ...PLACES]} value={d.place} onChange={(v) => set({ place: v })} /></div>
          {d.place === 'in_person' && <div className="cc-field"><TextBox lines="one" label="Location" value={d.location} maxLength={200} onChange={(v) => set({ location: v })} /></div>}

          <div className="cc-field">
            <TextBox label={INVITED_LABEL} placeholder={INVITED_EXAMPLE} value={d.paste} maxLength={4000} onChange={(v) => set({ paste: v })} />
            {d.paste.trim() && <p className="cc-note" aria-live="polite">{read.countWords} to invite.</p>}
            {read.lines.map((l) => <p key={l} className="cc-note">{l}</p>)}
          </div>
          <div className="cc-field">
            <span className="cc-field-label" aria-hidden="true">Add someone already in the portal</span>
            <SearchField label="Add someone already in the portal" placeholder="Type a name" value={q} onChange={setQ} />
            {found.length > 0 && (
              <div className="cc-cal-found" role="list">
                {found.map((p) => <button key={`${p.name}:${p.email}`} type="button" role="listitem" className="cc-cal-found-row" onClick={() => { set({ picked: [...d.picked, p] }); setQ(''); }}><b>{p.name}</b>{p.email && <small>{p.email}</small>}</button>)}
              </div>
            )}
            {q.trim() && found.length === 0 && <p className="cc-note">Nobody matches “{q.trim()}”.</p>}
          </div>
          {(guests.length > 0 || d.picked.length > 0) && (
            <div className="cc-field" role="list" aria-label="Invited">
              {guests.length > 0 && <p className="cc-note">{replyWords(guests)}</p>}
              {guests.map((g) => (
                <div key={g.id} className="cc-cal-guest" role="listitem">
                  <span><b>{g.name || g.email}</b><small>{REPLIES[g.reply] || REPLIES.none}</small></span>
                  <IconButton label={`Remove ${g.name || g.email}`} onClick={() => set({ gone: [...d.gone, g.id] })} />
                </div>
              ))}
              {d.picked.map((p) => (
                <div key={`${p.name}:${p.email}`} className="cc-cal-guest" role="listitem">
                  <span><b>{p.name}</b><small>{p.email || 'No email yet'}</small></span>
                  <IconButton label={`Remove ${p.name}`} onClick={() => set({ picked: d.picked.filter((x) => x !== p) })} />
                </div>
              ))}
            </div>
          )}

          <div className="cc-field"><TextBox label="Notes" value={d.notes} maxLength={4000} onChange={(v) => set({ notes: v })} /></div>
          <div className="cc-field"><Dropdown label="Remind me" options={REMINDERS} value={d.remind} onChange={(v) => set({ remind: v })} /></div>
          {d.remind !== NONE && <div className="cc-field"><InlineChoice label="How" form="pills" options={[{ value: 'email', label: 'By email' }, { value: 'phone', label: 'On my phone' }]} value={d.by} onChange={(v) => set({ by: v })} /></div>}
          <div className="cc-field"><InlineChoice label="Show me as" form="pills" options={[{ value: 'busy', label: 'Busy' }, { value: 'free', label: 'Free' }]} value={d.busy} onChange={(v) => set({ busy: v })} /></div>
          <div className="cc-field cc-todo-switch"><SwitchRow label="Private" note="Other people only ever see it as busy." checked={d.private} onChange={(on) => set({ private: on })} /></div>
          <div className="cc-field"><Dropdown label="What is it?" options={kinds} value={d.kind} onChange={(v) => set({ kind: v })} /></div>
          <div className="cc-field"><Dropdown label="Calendar" options={CALENDARS} value={d.calendar} onChange={(v) => set({ calendar: v })} /></div>
        </>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- My calendars

/** My calendars: Work, Personal and Family, each with a show switch (kept in Settings' `calendars`). */
export function CalendarsPanel({ cal, open, onClose }) {
  const cals = cal.settings.calendars || {};
  const lines = { work: 'Your coaching and your own time', personal: 'Shown with titles to you', family: 'Shown with titles to you' };
  return (
    <SlidePanel open={open} onClose={onClose} title="My calendars">
      {CALENDARS.map((c) => (
        <div key={c.value} className="cc-field cc-todo-switch">
          <SwitchRow label={c.label} note={lines[c.value]} checked={calendarShown(cal.settings, c.value)} onChange={(on) => cal.saveSettings({ calendars: { ...cals, [c.value]: on } })} />
        </div>
      ))}
      <p className="cc-note">Other people only ever see these as busy.</p>
      {/* Run 8: the account's other Google calendars, each with its switch (nothing here until Google Calendar is connected). */}
      <GoogleCalendarSwitches inPanel />
      {cal.isOwner && (
        <div className="cc-field cc-todo-switch">
          <SwitchRow label={ASSOCIATES_CALENDAR.label} note={ASSOCIATES_CALENDAR.note} checked={calendarShown(cal.settings, ASSOCIATES_CALENDAR.value)} onChange={(on) => cal.saveSettings({ calendars: { ...cals, [ASSOCIATES_CALENDAR.value]: on } })} />
        </div>
      )}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- the drafted note

/** The note for a client whose call moved or was cancelled: drafted, and sent only from the coach's own email. */
function TellPanel({ cal, open, onClose }) {
  const tell = cal.tell;
  const [body, setBody] = useState('');
  useEffect(() => { if (tell) setBody(tell.body); }, [tell]);
  if (!tell) return <SlidePanel open={false} onClose={onClose} title="A note" />;
  const client = cal.clients.find((c) => c.name === tell.name);
  const href = client?.email ? `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(tell.subject)}&body=${encodeURIComponent(body)}` : null;
  return (
    <SlidePanel draftKey={`cal-tell:${tell.name}:${tell.subject || ''}`}
      open={open}
      onClose={onClose}
      title={tell.name}
      footer={<div className="cc-panel-foot cc-panel-foot--end">{href && <a className="ds-btn ds-btn--primary" href={href} onClick={() => { onClose(); cal.clearTell(); }}>Open in my email</a>}</div>}
    >
      <p className="cc-quiet">{tell.subject}</p>
      <div className="cc-field"><TextBox label={`A note to ${firstName(tell.name)}`} value={body} onChange={setBody} /></div>
      <p className="cc-note">{href ? 'Nothing is sent until you send it from your own email.' : `Add an email to ${firstName(tell.name)}’s page to send this.`}</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- what everything opens

/**
 * The calendar's panels and what each gesture does, for any page that
 * shows the calendar's parts (the Calendar, To-dos as a calendar).
 * @param {object} cal useCalendar()
 * @param {{ days: string[] }} view the days showing (Duplicate copies onto the next one)
 */
export function useCalPanels(cal, { days }) {
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const toast = useToast();
  const todoActions = useTodoActions();
  const [slot, setSlot] = useState(null); // { day, fromMin, toMin, floating }
  const [item, setItem] = useState(null); // the entry's key, or a new item's start
  const [fresh, setFresh] = useState(null);
  const [todoId, setTodoId] = useState(null);
  const [briefId, setBriefId] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);
  const [briefJoin, setBriefJoin] = useState(null);
  const [briefItem, setBriefItem] = useState(null); // the call's own calendar item, for "Edit the call"
  const [telling, setTelling] = useState(false);
  const [theirs, setTheirs] = useState(null); // an associate's session, opened by the owner: what it is, never more

  const entry = useMemo(() => {
    if (!item) return null;
    const [from, to] = [addDays(item.day, -1), addDays(item.day, 1)];
    return cal.entriesFor(from, to).find((e) => e.key === item.key) || null;
  }, [item, cal]);
  // Gone while its panel is open (deleted, or moved off that day): the panel closes.
  useEffect(() => { if (item && !entry) setItem(null); }, [item, entry]);

  const create = (s) => {
    const fromMin = s.fromMin;
    const toMin = s.toMin == null ? fromMin + 60 : s.toMin;
    setSlot({ day: s.day, fromMin, toMin, floating: !isPhone && s.floating !== false });
  };
  /** "Add to calendar": the next whole hour today when today is showing, otherwise 09:00 on the first day showing. */
  const add = () => {
    const today = days.includes(cal.todayKey);
    const w = wallClock(cal.now, cal.coachZone);
    const fromMin = today ? Math.min(23, w.hour + 1) * 60 : 9 * 60;
    create({ day: today ? cal.todayKey : days[0], fromMin, toMin: null, floating: false });
  };
  const open = (e) => {
    if (e.type === 'assoc' || e.type === 'busy') { setTheirs(e); return; }
    if (e.kind === 'hold') {
      const option = cal.pollOptions.find((o) => o.id === e.item?.poll_option_id);
      if (option) { navigate(CAL_HOOKS.poll(option.poll_id)); return; }
    }
    // A client call opens as run 2's rows do: the brief before it, its own page once it has happened.
    const s = e.session;
    if (s) {
      const over = s.outcome || e.endsAt <= cal.now;
      const client = cal.clients.find((c) => c.id === s.profile_id);
      if (over || !client) { navigate(`/coach/sessions/${s.id}`); return; }
      setBriefAsked(true); setBriefJoin(joinLink(e.item, s)); setBriefItem(e.type === 'item' ? { key: e.key, day: e.fromDay } : null); setBriefId(s.id);
      return;
    }
    if (e.type === 'open') { navigate(CAL_HOOKS.open); return; }
    setItem({ key: e.key, day: e.fromDay });
  };
  // An associate's session is theirs, and a busy time from Google is changed in Google (run 8): neither moves from here.
  const fixedHere = (e) => e.type === 'assoc' || e.type === 'busy';
  const move = (e, to) => (fixedHere(e) ? false : cal.run(moveEntry(e, to, cal.ctx)));
  const resize = (e, to) => (fixedHere(e) ? false : cal.run(resizeEntry(e, to, cal.ctx)));
  const nudge = (e, step) => (fixedHere(e) ? false : cal.run(nudgeEntry(e, step, cal.ctx)));
  const unplace = (e) => cal.run(deleteEntry(e, cal.ctx));
  const tick = (e) => (e.done ? todoActions.untick(e.todo) : todoActions.tick(e.todo));
  const place = (todo, at) => cal.run(placeTodo(todo, at, { data: cal.data }));

  const node = (
    <>
      <QuickAdd
        cal={cal}
        slot={slot}
        floating={Boolean(slot?.floating)}
        onClose={() => setSlot(null)}
        onMore={(draft) => { setSlot(null); if (draft.kind === 'todo' || draft.kind === 'call') { toast.show(draft.kind === 'todo' ? 'A to-do’s other details are on To-dos once it’s saved.' : 'Choose Book the call to carry on.'); return; } setFresh(draft); }}
      />
      <ItemPanel cal={cal} entry={entry} fresh={fresh} days={days} onClose={() => { setItem(null); setFresh(null); }} />
      <TodoPanel id={todoId} onClose={() => setTodoId(null)} />
      {briefAsked && <Suspense fallback={null}><BriefPanel sessionId={briefId} joinHref={briefJoin} onClose={() => setBriefId(null)} aside={briefItem ? <TextLink onClick={() => { setBriefId(null); setItem(briefItem); }}>Edit the call</TextLink> : null} /></Suspense>}
      <TellPanel cal={cal} open={telling && Boolean(cal.tell)} onClose={() => setTelling(false)} />
      <SlidePanel open={Boolean(theirs)} onClose={() => setTheirs(null)} title={theirs?.title || 'A session'}>
        {theirs && (theirs.type === 'busy' ? busyLines(theirs, cal.coachZone) : associateLines(theirs, cal.coachZone)).map((line) => <p key={line} className="cc-quiet">{line}</p>)}
      </SlidePanel>
    </>
  );
  return { slot, create, add, open, move, resize, nudge, unplace, tick, place, openTodo: (t) => setTodoId(t.id), openTell: () => setTelling(true), node };
}

// ---------------------------------------------------------------- the grid with its to-dos panel

/**
 * The week or the day with everything it does, and the to-dos panel beside
 * it when `todosOpen`: a to-do drags onto a day, and a placed one drags
 * back onto the panel. The Calendar and To-dos as a calendar both use it.
 * @param {{ cal, panels, days, entries, win, otherZone, onOtherZone?, hours?, onHours?, todosOpen?: boolean, narrow?: boolean }} props
 */
export function CalBoard({ cal, panels, days, entries, win, otherZone, onOtherZone, hours = null, onHours, todosOpen = false, narrow = false, maxColumns = Infinity }) {
  const navigate = useNavigate();
  const phone = useIsPhone();
  const panelRef = useRef(null);
  const [incoming, setIncoming] = useState(null);
  const [over, setOver] = useState(false);
  const onTodoDrag = ({ todo, x, y, done, cancelled }) => {
    if (cancelled) { setIncoming(null); return; }
    const at = gridPoint(x, y, win);
    if (done) { setIncoming(null); if (at) panels.place(todo, at); return; }
    setIncoming(at ? { ...at, minutes: Number(todo.minutes) || 30, title: todo.title } : null);
  };
  return (
    <div className={`cc-cal-board${todosOpen ? ' cc-cal-board--todos' : ''}`}>
      {todosOpen && <TodosToPlace cal={cal} panelRef={panelRef} over={over} onOpen={panels.openTodo} onDrag={onTodoDrag} first={phone ? 4 : 8} />}
      <CalGrid
        days={days} entries={entries} cal={cal} win={win} otherZone={otherZone} onOtherZone={onOtherZone} onZoneList={() => navigate('/coach/settings/zones')}
        slot={panels.slot?.floating ? panels.slot : null} hours={hours} onHours={onHours} onCreate={panels.create} onOpen={panels.open} onMove={panels.move} onResize={panels.resize} onNudge={panels.nudge}
        onTick={panels.tick} onUnplace={panels.unplace} dropRef={todosOpen ? panelRef : null} onOverPanel={setOver} incoming={incoming} narrow={narrow || todosOpen} maxColumns={maxColumns}
      />
    </div>
  );
}

/**
 * The second time column: where the next client call outside the coach's own zone is, until the coach chooses one here;
 * from then on the one they chose, remembered in their own settings (on the device at once, then through the offline
 * queue, so every device opens on it: calendar.js's startingSecondZone).
 */
export function useSecondZone(cal) {
  const [picked, setPicked] = useState(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const starting = useMemo(() => startingSecondZone({ items: cal.calItems, sessions: cal.sessions, clients: cal.clients, settings: cal.settings, now: cal.now, coachZone: cal.coachZone }), [cal.calItems, cal.sessions, cal.clients, cal.settings, cal.todayKey, cal.coachZone]);
  return [picked || starting, (zone) => {
    setPicked(zone);
    cal.saveSettings({ second_time_zone: zone, calendars: { ...(cal.settings.calendars || {}), second_zone_chosen: true } }, null);
  }];
}

/** To-dos as a calendar (M11's "todocal"): this week with the to-dos to place beside it. */
export function TodosCalendar() {
  const cal = useCalendar();
  const narrow = useIsPhone();
  const weekends = cal.settings.calendars?.weekends === true;
  const range = useMemo(() => viewRange(narrow ? 'day' : 'week', cal.todayKey, { weekends }), [narrow, cal.todayKey, weekends]);
  const entries = useMemo(() => cal.entriesFor(range.fromDay, range.toDay), [cal, range]);
  const win = useMemo(() => hoursWindow(entries, { days: range.days, coachZone: cal.coachZone }), [entries, range, cal.coachZone]);
  const panels = useCalPanels(cal, { days: range.days });
  const [zone, setZone] = useSecondZone(cal);
  return (
    <>
      <CalBoard cal={cal} panels={panels} days={range.days} entries={entries} win={win} otherZone={zone} onOtherZone={setZone} todosOpen narrow={narrow} maxColumns={gridColumnsMax({ view: narrow ? 'day' : 'week', phone: narrow, narrow: true })} />
      {panels.node}
    </>
  );
}
