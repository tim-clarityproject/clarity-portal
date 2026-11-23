import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AddButton, Button, Chevron, Chip, ChipRow, DatePicker, Dropdown, PageHeader, SlidePanel, TextField, useIsPhone } from '../../components/design';
import { addDays, dayKeyWords, wallClock } from '../../lib/time/index.js';
import {
  COPY_LAST_WEEK, copyLastWeek, daysTitle, dragOpen, hoursWindow, OPEN_TITLE, openLine, openPageEntries, openTyped, openWeeks, placeOpen, removeOpenPlan, timesAt, viewRange,
} from '../../lib/coach/calendar';
import { Back, TextLink } from './parts';
import { CalGrid, useCalendar } from './calendarParts';
import { useSecondZone } from './calendarPanels';
import { useStartCallTypes } from './BookCall';
import './booking.css';

// Open for calls (Phase 6a run 3; M11's "open"): the times people outside
// can book, made by dragging blocks on the week. Blocks that touch join up,
// a block never sits over something busy, and they reach 4 weeks ahead.
// Everything busy shows as a quiet dashed outline; the open times are
// outlined in mint, never coral. Copy last week brings last week's blocks to
// the week showing. Each block can also be typed (the add row, or a press on
// a block), so nothing here needs a drag. Every rule is calendar.js's.

const EVERY = '__every__';
const wallMin = (instant, zone) => { const w = wallClock(instant, zone); return w.hour * 60 + w.minute; };

export default function OpenForCalls() {
  const cal = useCalendar();
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  useStartCallTypes(cal);
  const { coachZone, todayKey, now } = cal;
  const weeks = useMemo(() => openWeeks(todayKey), [todayKey]);
  // It opens on the first week that has an open time still to come, otherwise this week.
  const first = useMemo(() => {
    const next = cal.openBlocks.filter((b) => new Date(b.ends_at) > now).sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))[0];
    const monday = next ? weeks.filter((w) => w <= wallClock(next.starts_at, coachZone).date).pop() : null;
    return Math.max(0, weeks.indexOf(monday));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [at, setAt] = useState(first);
  const weekends = cal.settings.calendars?.weekends === true;
  const week = useMemo(() => viewRange('week', weeks[at], { weekends }), [weeks, at, weekends]);
  const [dayAt, setDayAt] = useState(0);
  const days = isPhone ? [week.days[Math.min(dayAt, week.days.length - 1)]] : week.days;
  const entries = useMemo(() => openPageEntries(cal.data, { fromDay: week.fromDay, toDay: week.toDay, coachZone }), [cal.data, week, coachZone]);
  const win = useMemo(() => hoursWindow(entries, { days: week.days, coachZone }), [entries, week, coachZone]);
  const [zone] = useSecondZone(cal);
  const [edit, setEdit] = useState(null); // { block?, day, from, to, type }
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  const type = cal.callTypes.find((t) => t.key === 'chemistry') || cal.callTypes[0] || null;

  const place = (block, times, callTypeId) => cal.run(placeOpen({ block, ...times, ...(callTypeId !== undefined ? { call_type_id: callTypeId } : {}) }, cal.ctx));
  const create = ({ day, fromMin, toMin }) => cal.run(dragOpen({ day, fromMin, toMin: toMin == null ? fromMin + 60 : toMin }, cal.ctx));
  const move = (e, to) => place(e.block, timesAt({ day: to.day, startMin: to.startMin, minutes: e.minutes, coachZone }));
  const resize = (e, to) => { const startMin = wallMin(e.startsAt, coachZone); return place(e.block, timesAt({ day: e.fromDay, startMin, minutes: Math.max(15, to.endMin - startMin), coachZone })); };
  const nudge = (e, step) => place(e.block, timesAt({ day: addDays(e.fromDay, step.days || 0), startMin: wallMin(e.startsAt, coachZone) + (step.minutes || 0), minutes: e.minutes, coachZone }));
  const open = (e) => {
    if (!e.isOpen) return;
    setProblem(null);
    setEdit({ block: e.block, day: e.fromDay, from: wallClock(e.startsAt, coachZone).time, to: wallClock(e.endsAt, coachZone).time, type: e.block.call_type_id || EVERY });
  };
  const add = () => { setProblem(null); setEdit({ block: null, day: days[0] < todayKey ? todayKey : days[0], from: '14:00', to: '16:00', type: EVERY }); };
  const save = async () => {
    if (busy.current) return;
    const times = openTyped({ day: edit.day, from: edit.from, to: edit.to, coachZone });
    if (times.problem) { setProblem(times.problem); return; }
    const plan = placeOpen({ block: edit.block, starts_at: times.starts_at, ends_at: times.ends_at, call_type_id: edit.type === EVERY ? null : edit.type }, cal.ctx);
    if (plan.problem) { setProblem(plan.problem); return; }
    busy.current = true;
    const ok = await cal.run(plan);
    busy.current = false;
    if (ok) setEdit(null);
  };
  const remove = async () => { if (busy.current) return; busy.current = true; const ok = await cal.run(removeOpenPlan(edit.block, { data: cal.data })); busy.current = false; if (ok) setEdit(null); };
  const types = [{ value: EVERY, label: 'Every kind of call' }, ...cal.callTypes.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div className="cc-page">
      <div className="cc-col cc-cal-page cc-cal-page--wide cc-open-page">
        <Back to="Calendar" onClick={() => navigate('/coach/calendar')} />
        <PageHeader title={OPEN_TITLE} />
        <div className="cc-cal-bar cc-open-bar">
          <div className="cc-cal-nav">
            <span className="cc-cal-stepper">
              <button type="button" className="cc-cal-step" aria-label="Previous week" onClick={() => { if (at > 0) setAt(at - 1); }}><Chevron direction="left" beside="words" /></button>
              <span className="cc-cal-range cc-open-range" role="status">{daysTitle(week.fromDay, week.toDay)}</span>
              <button type="button" className="cc-cal-step" aria-label="Next week" onClick={() => { if (at < weeks.length - 1) setAt(at + 1); }}><Chevron direction="right" beside="words" /></button>
            </span>
          </div>
          <Button variant="outline" onClick={() => cal.run(copyLastWeek({ monday: weeks[at], ...cal.ctx }))}>{COPY_LAST_WEEK}</Button>
        </div>
        {isPhone && (
          <ChipRow label="Day" className="cc-chips cc-open-days">
            {week.days.map((d, i) => <Chip key={d} pressed={i === Math.min(dayAt, week.days.length - 1)} onClick={() => setDayAt(i)}>{dayKeyWords(d).split(' ').slice(0, 2).join(' ')}</Chip>)}
          </ChipRow>
        )}
        <div className="cc-fade" key={`${at}:${days[0]}`}>
          <CalGrid
            days={days} entries={entries} cal={cal} win={win} otherZone={zone} label={OPEN_TITLE} narrow={!isPhone}
            onCreate={create} onOpen={open} onMove={move} onResize={resize} onNudge={nudge}
          />
        </div>
        <AddButton onClick={add}>Add open time</AddButton>
        <p className="cc-quiet">{openLine(type?.minutes || 30, type?.notice_hours ?? 24)}</p>
      </div>

      <SlidePanel draftKey={`open-time:${edit?.block?.id || 'new'}`}
        open={Boolean(edit)}
        onClose={() => setEdit(null)}
        title={edit?.block ? 'Open time' : 'Add open time'}
        footer={(
          <div className="cc-panel-foot">
            {edit?.block ? <TextLink onClick={remove}>Remove</TextLink> : <span />}
            <Button variant="primary" className="ds-panel-go" onClick={save}>Save</Button>
          </div>
        )}
      >
        {edit && (
          <>
            <div className="cc-field"><DatePicker label="Day" value={edit.day} min={todayKey} max={addDays(weeks[weeks.length - 1], 6)} format={(k) => dayKeyWords(k)} onChange={(k) => { setEdit({ ...edit, day: k }); setProblem(null); }} /></div>
            <div className="cc-field cc-two">
              <TextField label="From" type="time" step={900} value={edit.from} onChange={(ev) => { setEdit({ ...edit, from: ev.target.value }); setProblem(null); }} />
              <TextField label="To" type="time" step={900} value={edit.to} onChange={(ev) => { setEdit({ ...edit, to: ev.target.value }); setProblem(null); }} />
            </div>
            <div className="cc-field"><Dropdown label="Which calls can be booked here?" options={types} value={edit.type} onChange={(v) => setEdit({ ...edit, type: v })} /></div>
            <p className="cc-note">Open times that touch join into one.</p>
            {problem && <p className="cc-problem" role="alert">{problem}</p>}
          </>
        )}
      </SlidePanel>
    </div>
  );
}
