import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, CalendarBar, Dropdown, Loading, MonthGrid, PageOpening, Row, Rows, useIsPhone } from '../../components/design';
import { dayTitle, monthTitle } from '../../components/design/Blocks';
import { CALENDAR_LINE, CALENDAR_TYPES } from '../../content/pageLines/coach';
import {
  associateEntries, CAL_VIEWS, gridColumnsMax, HIDE_TODOS, HOURS_HELP, HOURS_SAVED, hoursToSave, hoursWindow, OFFER_TIMES, scheduleDays, scheduleTitle, SHOW_TODOS, stepView, viewRange, workingHours,
} from '../../lib/coach/calendar';
import { firstName } from '../../lib/coach/model';
import { addDays, instantAt } from '../../lib/time/index.js';
import { ensureCalRange, takeScreenAssociates } from '../../lib/coach/store';
import { associateSessionsKept, keepAssociateSessions, keptAssociateSessions, loadAssociateSessions } from '../../lib/coach/associateSessions';
import { TextLink, useCoachPortal, useNarrowerThan } from './parts';
import { CAL_HOOKS, CalSchedule, useCalendar } from './calendarParts';
import { CalBoard, CalendarsPanel, useCalPanels, useSecondZone } from './calendarPanels';
import { BookCallPanel, LinkPanel } from './BookCall';
import { usePick } from './calendarPick';

// The Calendar (Phase 6a run 3; M11's calendar, calwk, calday, calsched,
// caltd, cedit and whedit): Day, Week, Month and Schedule (the phone's
// default) behind the gliding switch; Today, previous and next; the date
// opens a small month to jump to a day; Weekends is a switch (Monday to
// Friday by default); two time columns; working hours edited on the week
// itself. The view and the day are kept in the address, so a link opens the
// same thing. Book a call and the single-use link are side panels over it
// (`side` 'book'); Offer times by email and a poll's times are picked on the
// calendar itself (`side` 'offer' and 'poll'); Open for calls and a poll are
// their own pages (CAL_HOOKS).

const NOTHING = () => {};
// Polish 1 (25 Nov; the example's Coach Calendar, rule 17): the page opens on the month, a plain grid with the chosen
// day's list under it, and Month and Week are one switch. The day and the Schedule still open from their addresses
// (?view=day, ?view=schedule): picking times and editing working hours on a phone use the day.
const START_VIEW = 'month';
/** The one filter: which kind of thing shows (CALENDAR_TYPES). */
const CALLS = new Set(['chemistry', 'connection', 'open']);
const ofType = (e, type) => {
  if (type === 'all') return true;
  if (type === 'todos') return e.type === 'todo';
  if (type === 'sessions') return e.type !== 'todo' && e.colour === 'client';
  if (type === 'calls') return e.type !== 'todo' && CALLS.has(e.colour);
  return e.type !== 'todo' && e.colour !== 'client' && !CALLS.has(e.colour);
};
/** A day key the calendar can open: a day that exists, from 2000 to 2100 (the break-it tester, 20 Nov: "2026-02-30" in the address stopped the page). */
const realDay = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '') || key < '2000-01-01' || key > '2100-12-31') return false;
  try { return addDays(key, 0) === key; } catch { return false; }
};

export default function Calendar({ side = null }) {
  const cal = useCalendar();
  const isPhone = useIsPhone();
  // A tablet's columns hold a tile's shorter words, three side by side. Inside the frame (Polish 1) the menu column and
  // the panel's padding take ~410px of a laptop's width, so a 1280px laptop's week columns are a tablet's (~150px).
  const tablet = useNarrowerThan(1300);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const picking = side === 'offer' || side === 'poll';
  const asked = CAL_VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : START_VIEW;
  // Times are picked on the grid: the week on a laptop, the day on a phone.
  const view = picking && !(asked === 'day' || (asked === 'week' && !isPhone)) ? (isPhone ? 'day' : 'week') : asked;
  const day = realDay(params.get('day')) ? params.get('day') : cal.todayKey; // an address with a day that doesn't exist (30 Feb) opens today, never a broken page
  const go = (next) => {
    const v = next.view || view;
    const d = next.day || day;
    setParams({ ...(v === START_VIEW ? {} : { view: v }), ...(d === cal.todayKey ? {} : { day: d }) }, { replace: true });
  };
  const weekends = cal.settings.calendars?.weekends === true;
  const setWeekends = (on) => cal.saveSettings({ calendars: { ...(cal.settings.calendars || {}), weekends: on } }, null);

  // The month's grid always has its seven days (rule 17); the week follows the Weekends choice.
  const range = useMemo(() => viewRange(view, day, { weekends: view === 'month' ? true : weekends }), [view, day, weekends]);
  const [type, setType] = useState('all');
  // The weeks shown are read from the database as the coach moves to them (with a few weeks either side): the
  // calendar is never read whole (scale check, 22 Nov: two years passed the old 5,000-row cap and lost the rest).
  const { userId: calUserId, isOwner } = useCoachPortal();
  useEffect(() => { ensureCalRange(calUserId, range.fromDay, range.toDay); }, [calUserId, range.fromDay, range.toDay]);
  // The owner also sees each associate's coaching sessions, and nothing else of their calendars (058; run 6's 25).
  const [assoc, setAssoc] = useState(() => (isOwner ? keptAssociateSessions(calUserId) : []));
  // On a device that has never had them (a first visit), the owner's calendar waits for the associates' sessions before
  // it draws its days, so no day shows one call fewer for a moment (coach first screen run: "44 more" then "45 more").
  const [assocIn, setAssocIn] = useState(() => !isOwner || associateSessionsKept(calUserId));
  useEffect(() => {
    if (!isOwner) return undefined;
    let live = true;
    const from = instantAt(range.fromDay, '00:00', cal.coachZone);
    const to = instantAt(addDays(range.toDay, 1), '00:00', cal.coachZone);
    loadAssociateSessions(calUserId, from, to).then((rows) => { if (live && rows) setAssoc(rows); }).catch(() => {}).finally(() => { if (live) setAssocIn(true); });
    return () => { live = false; };
  }, [isOwner, calUserId, range.fromDay, range.toDay, cal.coachZone]);
  // A first visit's calendar first screen brings them itself (060): shown with it, without waiting for the read above.
  useEffect(() => {
    if (assocIn || !cal.partial) return;
    const got = takeScreenAssociates(calUserId);
    if (got) { setAssoc(keepAssociateSessions(calUserId, got.from, got.to, got.rows)); setAssocIn(true); }
  }, [assocIn, cal.partial, calUserId]);
  const theirs = useMemo(() => (isOwner ? associateEntries(assoc, { fromDay: range.fromDay, toDay: range.toDay, coachZone: cal.coachZone, settings: cal.settings }) : []), [isOwner, assoc, range, cal.coachZone, cal.settings]);
  const entries = useMemo(() => [...cal.entriesFor(range.fromDay, range.toDay), ...theirs].filter((e) => ofType(e, type)), [cal, range, theirs, type]);
  // The month: a dot under each day with something on, and the chosen day's list under the grid.
  const monthList = useMemo(() => (view === 'month' ? scheduleDays(entries, { days: range.days, coachZone: cal.coachZone, todayKey: cal.todayKey }) : []), [view, entries, range, cal.coachZone, cal.todayKey]);
  const busyDays = useMemo(() => new Set(monthList.filter((d) => d.rows.length).map((d) => d.day)), [monthList]);
  const dayRows = monthList.find((d) => d.day === day)?.rows || [];
  const grid = view === 'day' || (view === 'week' && !isPhone); // a phone's week is the week's own list

  const [hours, setHours] = useState(null); // the working hours while they are being edited
  const [whole, setWhole] = useState(false);
  const win = useMemo(() => hoursWindow(entries, { days: range.days, coachZone: cal.coachZone, hours, whole }), [entries, range, cal.coachZone, hours, whole]);
  const [zone, setZone] = useSecondZone(cal);
  const [todosOpen, setTodosOpen] = useState(false);
  const [calsOpen, setCalsOpen] = useState(false);
  const panels = useCalPanels(cal, { days: range.days });
  const [link, setLink] = useState(null); // the single-use link's panel, with what it starts from
  /** Back to the calendar itself, on a day when one is given. */
  const home = (toDay = null) => {
    const next = new URLSearchParams(location.search);
    if (toDay) { if (toDay === cal.todayKey) next.delete('day'); else next.set('day', toDay); }
    navigate({ pathname: '/coach/calendar', search: next.toString() ? `?${next}` : '' }, { replace: true });
  };
  const to = (pathname, state) => navigate({ pathname, search: location.search }, state ? { state } : undefined);
  const pick = usePick(cal, picking ? side : null, { start: location.state, onDone: () => home() });
  const board = pick ? { ...panels, slot: null, create: pick.create, open: pick.open, move: NOTHING, resize: NOTHING, nudge: NOTHING, unplace: NOTHING, tick: NOTHING } : panels;
  const shown = useMemo(() => (pick ? [...entries, ...pick.entries] : entries), [entries, pick]);

  const startHours = () => { setHours(workingHours(cal.settings)); if (!grid) go({ view: isPhone ? 'day' : 'week' }); };
  const doneHours = async () => {
    const next = hoursToSave(hours);
    setHours(null);
    if (JSON.stringify(next.working_hours) !== JSON.stringify(hoursToSave(workingHours(cal.settings)).working_hours)) await cal.saveSettings(next, HOURS_SAVED);
  };
  // The Schedule lists from its first day, so it is headed "From today" (tidy follow-up 3, run 6's 20).
  const title = view === 'schedule' ? scheduleTitle(day, cal.todayKey) : view === 'month' ? monthTitle(day) : range.title;

  const book = <Button variant="primary" onClick={() => to(CAL_HOOKS.book)}>Book a call</Button>;
  const stepLabel = view === 'month' ? 'month' : view === 'day' ? 'day' : view === 'schedule' ? 'days' : 'week';

  return (
    <div className="cc-page cc-cal-pagewrap">
      <div className={`cc-col cc-cal-page${grid ? ' cc-cal-page--wide' : ''}`}>
        <PageOpening title="Calendar" line={CALENDAR_LINE} action={!hours && !pick ? book : null} />

        <div className="cc-cal-main">
          <CalendarBar
            title={title}
            prevLabel={`Previous ${stepLabel}`}
            nextLabel={`Next ${stepLabel}`}
            onPrev={() => go({ day: stepView(view, day, -1, { weekends }) })}
            onNext={() => go({ day: stepView(view, day, 1, { weekends }) })}
            onToday={() => go({ day: cal.todayKey })}
            view={view === 'month' ? 'month' : 'week'}
            onView={(v) => { setHours(null); go({ view: v }); }}
            filter={<div className="cc-cal-filter"><Dropdown label="Show" options={CALENDAR_TYPES} value={type} onChange={setType} /></div>}
          />

          {pick ? pick.bar : hours && (
            <div className="cc-cal-hoursbar">
              <p>{HOURS_HELP}</p>
              <Button variant="primary" onClick={doneHours}>Done</Button>
            </div>
          )}

          {cal.tell && (
            <p className="cc-quiet cc-cal-tell"><span>A note to {firstName(cal.tell.name)} is drafted.</span> <TextLink onClick={panels.openTell}>Open the note</TextLink></p>
          )}

          {!assocIn && <div data-first-wait=""><Loading label="Loading your calendar" /></div>}
          {assocIn && <div className="cc-fade" key={`${view}:${grid}`}>
            {grid && <CalBoard cal={cal} panels={board} days={range.days} entries={shown} win={win} otherZone={zone} onOtherZone={setZone} hours={hours} onHours={setHours} todosOpen={todosOpen && !hours && !isPhone && !pick} narrow={view !== 'day' && (tablet || range.days.length > 5)} maxColumns={gridColumnsMax({ view, phone: isPhone, narrow: tablet || range.days.length > 5 || (todosOpen && !isPhone) })} />}
            {!grid && view !== 'month' && <CalSchedule days={range.days} entries={entries} cal={cal} onOpen={panels.open} />}
            {view === 'month' && (
              <>
                <MonthGrid month={day} today={cal.todayKey} selected={day} onSelect={(d) => go({ day: d })} hasItems={(k) => busyDays.has(k)} label={monthTitle(day)} />
                <div className="ds-open-label cc-cal-dayname" aria-live="polite">{dayTitle(day)}</div>
                {dayRows.length === 0 ? <p className="cc-quiet cc-cal-dayempty">Nothing is planned for this day.</p> : (
                  <Rows label={dayTitle(day)} className="cc-cal-daylist">
                    {dayRows.map((r) => <Row key={r.entry.key} name={r.title} sub={r.lines[0]} value={r.time} onClick={(ev) => panels.open(r.entry, ev.currentTarget)} />)}
                  </Rows>
                )}
              </>
            )}
          </div>}
        </div>

        {!hours && (
          <div className="cc-acts cc-cal-foot">
            {!pick && <TextLink onClick={panels.add}>Add to calendar</TextLink>}
            <TextLink onClick={startHours}>Working hours</TextLink>
            {view !== 'month' && view !== 'day' && <TextLink aria-pressed={weekends} onClick={() => setWeekends(!weekends)}>{weekends ? 'Hide weekends' : 'Show weekends'}</TextLink>}
            <TextLink onClick={() => navigate(CAL_HOOKS.open)}>Set my open times</TextLink>
            {grid && !isPhone && !pick && <TextLink aria-expanded={todosOpen} onClick={() => setTodosOpen((v) => !v)}>{todosOpen ? HIDE_TODOS : SHOW_TODOS}</TextLink>}
            {!pick && <TextLink onClick={() => to(CAL_HOOKS.offer)}>{OFFER_TIMES}</TextLink>}
            <TextLink onClick={() => setCalsOpen(true)}>My calendars</TextLink>
            {grid && <TextLink onClick={() => setWhole((v) => !v)}>{whole ? 'Show the working day' : 'Show the whole day'}</TextLink>}
          </div>
        )}
      </div>

      <CalendarsPanel cal={cal} open={calsOpen} onClose={() => setCalsOpen(false)} />
      {panels.node}
      {pick?.node}
      <BookCallPanel
        cal={cal} open={side === 'book'} start={side === 'book' ? location.state : null} onClose={(d) => home(d || null)}
        onLink={(start) => { setLink(start); home(); }} onPoll={(start) => navigate(CAL_HOOKS.poll('new'), { state: start })}
      />
      <LinkPanel cal={cal} open={Boolean(link)} start={link} onClose={() => setLink(null)} />
    </div>
  );
}
