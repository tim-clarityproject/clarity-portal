import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, CalendarPopover, Chevron, InlineChoice, PageHeader, SwitchRow, useIsPhone } from '../../components/design';
import {
  CAL_VIEWS, HIDE_TODOS, HOURS_HELP, HOURS_SAVED, hoursToSave, hoursWindow, OFFER_TIMES, SHOW_TODOS, startingView, stepView, viewRange, workingHours,
} from '../../lib/coach/calendar';
import { firstName } from '../../lib/coach/model';
import { MenuItem, PopMenu, TextLink, useNarrowerThan } from './parts';
import { CAL_HOOKS, CalMonth, CalSchedule, useCalendar } from './calendarParts';
import { CalBoard, CalendarsPanel, useCalPanels, useSecondZone } from './calendarPanels';

// The Calendar (Phase 6a run 3; M11's calendar, calwk, calday, calsched,
// caltd, cedit and whedit): Day, Week, Month and Schedule (the phone's
// default) behind the gliding switch; Today, previous and next; the date
// opens a small month to jump to a day; Weekends is a switch (Monday to
// Friday by default); two time columns; working hours edited on the week
// itself. The view and the day are kept in the address, so a link opens the
// same thing. Book a call, Open for calls, Offer times by email and polls
// are their own pages (CAL_HOOKS).

export default function Calendar() {
  const cal = useCalendar();
  const isPhone = useIsPhone();
  const tablet = useNarrowerThan(1100); // a tablet's columns hold a tile's shorter words
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = CAL_VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : startingView(isPhone);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') || '') && !Number.isNaN(Date.parse(params.get('day'))) ? params.get('day') : cal.todayKey;
  const go = (next) => {
    const v = next.view || view;
    const d = next.day || day;
    setParams({ ...(v === startingView(isPhone) ? {} : { view: v }), ...(d === cal.todayKey ? {} : { day: d }) }, { replace: true });
  };
  const weekends = cal.settings.calendars?.weekends === true;
  const setWeekends = (on) => cal.saveSettings({ calendars: { ...(cal.settings.calendars || {}), weekends: on } }, null);

  const range = useMemo(() => viewRange(view, day, { weekends }), [view, day, weekends]);
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
  const book = <Button variant="primary" onClick={() => navigate(CAL_HOOKS.book)}>Book a call</Button>;

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
          {isPhone && !hours && book}
        </div>

        {hours ? (
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
          {grid && <CalBoard cal={cal} panels={panels} days={range.days} entries={entries} win={win} otherZone={zone} onOtherZone={setZone} hours={hours} onHours={setHours} todosOpen={todosOpen && !hours && !isPhone} narrow={view !== 'day' && (tablet || range.days.length > 5)} />}
          {!grid && view !== 'month' && <CalSchedule days={range.days} entries={entries} cal={cal} onOpen={panels.open} />}
          {view === 'month' && <CalMonth day={day} entries={entries} cal={cal} weekends={weekends} phone={isPhone} onDay={(d) => go({ view: 'day', day: d })} />}
        </div>

        {!hours && (
          <div className="cc-acts cc-cal-foot">
            {isPhone && <TextLink onClick={panels.add}>Add to calendar</TextLink>}
            <TextLink onClick={() => navigate(CAL_HOOKS.open)}>Set my open times</TextLink>
            {grid && !isPhone && <TextLink aria-expanded={todosOpen} onClick={() => setTodosOpen((v) => !v)}>{todosOpen ? HIDE_TODOS : SHOW_TODOS}</TextLink>}
            <TextLink onClick={() => navigate(CAL_HOOKS.offer)}>{OFFER_TIMES}</TextLink>
            <TextLink onClick={() => setCalsOpen(true)}>My calendars</TextLink>
            {grid && <TextLink onClick={() => setWhole((v) => !v)}>{whole ? 'Show the working day' : 'Show the whole day'}</TextLink>}
            {isPhone && <TextLink onClick={startHours}>Working hours</TextLink>}
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
    </div>
  );
}
