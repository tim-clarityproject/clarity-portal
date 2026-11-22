import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, CalendarPopover, Chevron, InlineChoice, PageHeader, SwitchRow, useIsPhone } from '../../components/design';
import {
  CAL_VIEWS, HIDE_TODOS, HOURS_HELP, HOURS_SAVED, hoursToSave, hoursWindow, OFFER_TIMES, SHOW_TODOS, startingView, stepView, viewRange, workingHours,
} from '../../lib/coach/calendar';
import { firstName } from '../../lib/coach/model';
import { addDays } from '../../lib/time/index.js';
import { ensureCalRange } from '../../lib/coach/store';
import { MenuItem, PopMenu, TextLink, useCoachPortal, useNarrowerThan } from './parts';
import { CAL_HOOKS, CalMonth, CalSchedule, useCalendar } from './calendarParts';
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
/** A day key the calendar can open: a day that exists, from 2000 to 2100 (the break-it tester, 20 Nov: "2026-02-30" in the address stopped the page). */
const realDay = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '') || key < '2000-01-01' || key > '2100-12-31') return false;
  try { return addDays(key, 0) === key; } catch { return false; }
};

export default function Calendar({ side = null }) {
  const cal = useCalendar();
  const isPhone = useIsPhone();
  const tablet = useNarrowerThan(1100); // a tablet's columns hold a tile's shorter words
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const picking = side === 'offer' || side === 'poll';
  const asked = CAL_VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : startingView(isPhone);
  // Times are picked on the grid: the week on a laptop, the day on a phone.
  const view = picking && !(asked === 'day' || (asked === 'week' && !isPhone)) ? (isPhone ? 'day' : 'week') : asked;
  const day = realDay(params.get('day')) ? params.get('day') : cal.todayKey; // an address with a day that doesn't exist (30 Feb) opens today, never a broken page
  const go = (next) => {
    const v = next.view || view;
    const d = next.day || day;
    setParams({ ...(v === startingView(isPhone) ? {} : { view: v }), ...(d === cal.todayKey ? {} : { day: d }) }, { replace: true });
  };
  const weekends = cal.settings.calendars?.weekends === true;
  const setWeekends = (on) => cal.saveSettings({ calendars: { ...(cal.settings.calendars || {}), weekends: on } }, null);

  const range = useMemo(() => viewRange(view, day, { weekends }), [view, day, weekends]);
  // The weeks shown are read from the database as the coach moves to them (with a few weeks either side): the
  // calendar is never read whole (scale check, 22 Nov: two years passed the old 5,000-row cap and lost the rest).
  const { userId: calUserId } = useCoachPortal();
  useEffect(() => { ensureCalRange(calUserId, range.fromDay, range.toDay); }, [calUserId, range.fromDay, range.toDay]);
  const entries = useMemo(() => cal.entriesFor(range.fromDay, range.toDay), [cal, range]);
  const grid = view === 'day' || (view === 'week' && !isPhone); // a phone's week is the week's own list

  const [hours, setHours] = useState(null); // the working hours while they are being edited
  const [whole, setWhole] = useState(false);
  const win = useMemo(() => hoursWindow(entries, { days: range.days, coachZone: cal.coachZone, hours, whole }), [entries, range, cal.coachZone, hours, whole]);
  const [zone, setZone] = useSecondZone(cal);
  const [todosOpen, setTodosOpen] = useState(false);
  const [calsOpen, setCalsOpen] = useState(false);
  const [jump, setJump] = useState(false);
  const [viewMenu, setViewMenu] = useState(false);
  const titleRef = useRef(null);
  const viewRef = useRef(null);
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
  const title = view === 'schedule' || view === 'week' ? viewRange('week', day, { weekends }).title : range.title;

  const nav = (
    <div className="cc-cal-nav">
      {/* The arrows and the date they step are one group: each chevron sits on the date's own baseline. */}
      <span className="cc-cal-stepper">
      <button type="button" className="cc-cal-step" aria-label="Previous" onClick={() => go({ day: stepView(view, day, -1, { weekends }) })}><Chevron direction="left" beside="words" /></button>
      <button type="button" ref={titleRef} className="cc-cal-range" aria-haspopup="dialog" aria-expanded={jump} aria-label={`${title}. Jump to a date`} onClick={() => setJump((v) => !v)}>{title}</button>
      <button type="button" className="cc-cal-step" aria-label="Next" onClick={() => go({ day: stepView(view, day, 1, { weekends }) })}><Chevron direction="right" beside="words" /></button>
      </span>
      <TextLink onClick={() => go({ day: cal.todayKey })}>Today</TextLink>
    </div>
  );
  const book = <Button variant="primary" onClick={() => to(CAL_HOOKS.book)}>Book a call</Button>;

  return (
    <div className="cc-page">
      <div className={`cc-col cc-cal-page${grid || view === 'month' ? ' cc-cal-page--wide' : ''}`}>
        <div className="cc-cal-top">
          <PageHeader title="Calendar" />
          {isPhone && <TextLink ref={viewRef} aria-haspopup="menu" aria-expanded={viewMenu} onClick={() => setViewMenu((v) => !v)}>View</TextLink>}
        </div>

        <div className="cc-cal-bar">
          {nav}
          {!isPhone && view !== 'day' && <div className="cc-cal-weekends"><SwitchRow label="Weekends" checked={weekends} onChange={setWeekends} /></div>}
          {!isPhone && <div className="cc-seg cc-cal-views"><InlineChoice ariaLabel="View" semantics="pressed" options={CAL_VIEWS} value={view} onChange={(v) => { setHours(null); go({ view: v }); }} form="pills" /></div>}
          {isPhone && !hours && !pick && book}
        </div>

        {pick ? pick.bar : hours ? (
          <div className="cc-cal-hoursbar">
            <p>{HOURS_HELP}</p>
            <Button variant="primary" onClick={doneHours}>Done</Button>
          </div>
        ) : !isPhone && (
          <div className="cc-cal-acts">
            <TextLink onClick={startHours}>Working hours</TextLink>
            <Button variant="outline" onClick={panels.add}>Add to calendar</Button>
            {book}
          </div>
        )}

        {cal.tell && (
          <p className="cc-quiet cc-cal-tell"><span>A note to {firstName(cal.tell.name)} is drafted.</span> <TextLink onClick={panels.openTell}>Open the note</TextLink></p>
        )}

        <div className="cc-fade" key={`${view}:${grid}`}>
          {grid && <CalBoard cal={cal} panels={board} days={range.days} entries={shown} win={win} otherZone={zone} onOtherZone={setZone} hours={hours} onHours={setHours} todosOpen={todosOpen && !hours && !isPhone && !pick} narrow={view !== 'day' && (tablet || range.days.length > 5)} />}
          {!grid && view !== 'month' && <CalSchedule days={range.days} entries={entries} cal={cal} onOpen={panels.open} />}
          {view === 'month' && <CalMonth day={day} entries={entries} cal={cal} weekends={weekends} phone={isPhone} onDay={(d) => go({ view: 'day', day: d })} />}
        </div>

        {!hours && (
          <div className="cc-acts cc-cal-foot">
            {isPhone && !pick && <TextLink onClick={panels.add}>Add to calendar</TextLink>}
            <TextLink onClick={() => navigate(CAL_HOOKS.open)}>Set my open times</TextLink>
            {grid && !isPhone && !pick && <TextLink aria-expanded={todosOpen} onClick={() => setTodosOpen((v) => !v)}>{todosOpen ? HIDE_TODOS : SHOW_TODOS}</TextLink>}
            {!pick && <TextLink onClick={() => to(CAL_HOOKS.offer)}>{OFFER_TIMES}</TextLink>}
            <TextLink onClick={() => setCalsOpen(true)}>My calendars</TextLink>
            {grid && <TextLink onClick={() => setWhole((v) => !v)}>{whole ? 'Show the working day' : 'Show the whole day'}</TextLink>}
            {isPhone && !pick && <TextLink onClick={startHours}>Working hours</TextLink>}
          </div>
        )}
      </div>

      <CalendarPopover open={jump} onClose={() => setJump(false)} anchorRef={titleRef} title="Jump to a date" value={day} min="2000-01-01" onChange={(d) => go({ day: d })} />
      <PopMenu open={viewMenu} onClose={() => setViewMenu(false)} anchorRef={viewRef} title="View">
        {CAL_VIEWS.map((v) => <MenuItem key={v.value} checked={v.value === view} onClick={() => { setViewMenu(false); setHours(null); go({ view: v.value }); }}>{v.label}</MenuItem>)}
        <MenuItem checked={weekends} onClick={() => { setViewMenu(false); setWeekends(!weekends); }}>Weekends</MenuItem>
      </PopMenu>
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
