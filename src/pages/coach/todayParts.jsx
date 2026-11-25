import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Figure, MoreLink, Row, Rows } from '../../components/design';
import { Button, ChartTips, Chevron, Dropdown, InlineChoice, Sheet, SlidePanel, Stat, TextBox, tipProps, useIsPhone, useToast } from '../../components/design';
import keepWords from '../../components/design/keepWords';
import { deviceZone, isZone } from '../../lib/time';
import { callPlaceWords } from '../../lib/coach/calendar';
import { keyOf, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { addDays, cut, dayWords, hoursWords, minutesWords } from '../../lib/coach/model';
import {
  callLength, capacity, carriedWords, dayDone, dayLine, dayLoad, doneWords, dueWords, ENERGY, estimateWords, freeStarts,
  movedWords, moveState, moveToDay, overWords, planChanges, plannedWords, suggestMoves, timeWords, todayTodos, upcomingGroups, weekDone, weekStart,
} from '../../lib/coach/day';
import { useFinance } from './financeParts';
import { Eye, InlineLink, Line, TextLink, useCoachPortal } from './parts';
import './today.css';
import { countFigure } from '../../lib/coach/numbers';
import { COACH_TODAY, monthNote } from '../../content/pageLines/coach';

// Today's panels (Phase 6a run 2, step 3; M11): Plan my day, the over-full
// day, Choose what to move, Close the day, the Weekly review and Rate my
// energy, with the small parts Today and they share (a call's row, figures
// on an equal grid, the Finances line). Every rule and word about the day
// is day.js's; nothing here decides one. These are the coach's own to-dos
// and days: never a client's.
//
// Placing to-dos on the calendar by dragging comes with the calendar (run
// 3): until then Plan my day's last step gives each to-do a time from the
// free quarter hours between calls.

const LIVE = typeof __CLARITY_LIVE__ !== 'undefined' && __CLARITY_LIVE__;
const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const ONLY_YOU = 'Only you can see this.';
const ONE_TAP_MS = 150;
const SHOW_FIRST = 12;
const NO_TIME = '__none__';
const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

// ---------------------------------------------------------------- the Finances line (owner only; Phase 6b run 2)

/** Finances are built (Phase 6b run 2): the owner's Today shows its line. */
export const FINANCES_READY = true;
/** Kept for the suites that switched the line on before Finances existed; it is always on for the owner now. */
export function financesShown() { return FINANCES_READY; }

/** "£2,300": whole pounds with the thousands marked. */
export const moneyWords = (amount, symbol = '£') => `${symbol}${Math.round(Number(amount) || 0).toLocaleString('en-GB')}`;

/**
 * Today's Finances line, under the date (M11 C1): "November £2,300 of £5,000", then one quiet note ("Cash dips in May",
 * or "1 overdue"). Its words are src/lib/finance's todayFinanceLine; it opens Finances → Cash flow.
 * @param {{ line: { figure: string, urgent: string|null, aria: string }, onOpen?: () => void }} props
 */
export function FinancesLine({ line, onOpen }) {
  // It ends with the small chevron when it opens Finances (M11 C1), kept on the line with the last words.
  const arrow = onOpen ? <Chevron direction="right" size="sm" beside="words" className="cc-today-fin-chev" /> : null;
  const inner = (
    <>
      <span className={line.urgent ? undefined : 'cc-today-fin-last'}>{keepWords(line.figure)}{!line.urgent && arrow}</span>
      {line.urgent && <span className="cc-today-fin-last">{line.urgent}{arrow}</span>}
    </>
  );
  if (!onOpen) return <p className="cc-today-fin">{inner}</p>;
  return <button type="button" className="cc-today-fin cc-today-fin--open" aria-label={line.aria} onClick={onOpen}>{inner}</button>;
}

/**
 * The owner's line, worked out exactly as Finances works out its own figures (financeParts.jsx's useFinance: the same
 * rows, the same associates' sessions read the same way, the cash flow's chosen months), so Today's line never differs
 * before and after Finances has been opened (UI tester, run 2).
 */
export function TodayFinances() {
  const navigate = useNavigate();
  const { model } = useFinance();
  return <FinancesLine line={model.line} onOpen={() => navigate('/coach/finances/cash-flow')} />;
}

/**
 * Today's This month card (polish 1; the example's Coach Today): the month's settled figure against its target, as a
 * 24px light figure, one sentence under it and a link to Finances. Its words are the same todayFinanceLine as before,
 * so it never differs from Finances itself.
 */
export function ThisMonthCard() {
  const navigate = useNavigate();
  const { model } = useFinance();
  const line = model.line;
  return (
    <Card label={COACH_TODAY.monthLabel} className="cc-part cc-today-month">
      <span className="ds-sr">{line.aria}</span>
      <div aria-hidden="true"><Figure value={line.paid} unit={line.target ? `of ${line.target}` : undefined} /></div>
      <p className="cc-today-month-note">{monthNote(line.urgent)}</p>
      <MoreLink onClick={() => navigate('/coach/finances/cash-flow')}>{COACH_TODAY.monthLink}</MoreLink>
    </Card>
  );
}

/** This week's rows: coaching hours against the coach's own target ("17 of 15, 2 over") and the calls. */
export function ThisWeekRows({ sessions, target, todayKey }) {
  const cap = capacity(sessions, target, todayKey);
  return (
    <Rows>
      <Row name={COACH_TODAY.weekHours} value={<><span className="ds-sr">{cap.spoken}.</span><span aria-hidden="true">{cap.overWords ? `${cap.words}, ${cap.overWords}` : cap.words}</span></>} />
      <Row name={COACH_TODAY.weekCalls} value={countFigure(cap.calls)} />
    </Rows>
  );
}

// ---------------------------------------------------------------- small shared parts

/** What a call's row says: who, their organisation (or "Self-funded", "Group of 6"), and the place or their own time. */
export function useCallWords() {
  const { clients, groups, organisations, state, settings } = useCoachPortal();
  const members = rowsOf(state, 'coach_group_members');
  const mine = isZone(settings.time_zone) ? settings.time_zone : deviceZone();
  return (session) => {
    if (session.group_id) {
      const group = groups.find((g) => g.id === session.group_id);
      const n = members.filter((m) => m.group_id === session.group_id).length;
      return { name: group?.name || 'Group', facts: [n ? `Group of ${n}` : 'Group', session.place || 'Zoom'], to: group ? `/coach/groups/${group.id}` : null, group: true };
    }
    const client = clients.find((c) => c.id === session.profile_id);
    const org = organisations.find((o) => o.id === client?.organisation_id)?.name;
    // A client in another time zone: their own time and city (the calendar's rule: 12-hour for the US and Canada, never letters).
    const place = callPlaceWords(session, client?.time_zone, mine);
    return { name: client?.name || 'Client', facts: [org || 'Self-funded', place], to: null, group: false };
  };
}

/** One call: its time, who, the quiet facts and its length (or "Done"). `onOpen` makes the whole row a button. */
export function CallRow({ time, name, facts = [], length, onOpen, label }) {
  const inner = (
    <>
      <span className="cc-today-time">{time}</span>
      <span className="cc-today-call-words">
        <b>{keepWords(name)}</b>
        <small>{[...facts, length].filter(Boolean).map((f, i) => <span key={`${i}:${f}`} className={i === facts.length ? 'cc-today-len' : undefined}>{f}</span>)}</small>
      </span>
      <span className="cc-today-call-len" aria-hidden="true">{length}</span>
    </>
  );
  if (!onOpen) return <div className="cc-today-call" role="listitem">{inner}</div>;
  return <div role="listitem"><button type="button" className="cc-today-call cc-today-call--open" aria-label={label} onClick={onOpen}>{inner}</button></div>;
}

/** Figures in a row on an equal grid (two by two on a phone). */
export function Figures({ children, label }) {
  return <div className="cc-today-figures" role="group" aria-label={label}>{children}</div>;
}

/** Capacity's two figures: a week over is "17 of 15" with a small "2 over" and a full soft coral bar, never mint. */
export function CapacityFigures({ sessions, target, todayKey, hoursLabel = 'Coaching hours this week', callsLabel = 'Calls this week' }) {
  const cap = capacity(sessions, target, todayKey);
  return (
    <Figures label="Capacity">
      <div className={`cc-today-cap${cap.over ? ' cc-today-cap--over' : ''}`}>
        <span className="ds-sr">{cap.spoken}.</span>
        <div aria-hidden="true"><Stat label={hoursLabel} value={cap.words} unit={cap.overWords || undefined} bar={cap.percent / 100} /></div>
      </div>
      <Stat label={callsLabel} value={countFigure(cap.calls)} />
    </Figures>
  );
}

/** "Today is 45 minutes over.": the words that say how far are a link inside the sentence when it opens the detail. */
export function OverLine({ over, onOpen }) {
  if (!(over > 0)) return null;
  return (
    <p className="cc-quiet cc-today-over" role="status">
      Today is {onOpen ? <InlineLink onClick={onOpen} aria-haspopup="dialog">{overWords(over)}</InlineLink> : overWords(over)}.
    </p>
  );
}

/** A to-do with a tick box that isn't "done": keep it, pick it or move it. */
function PickRow({ todo, facts = [], checked, onChange, label }) {
  return (
    <div className={`ds-todo cc-today-pick${todo.important ? ' ds-todo--important' : ''}`} role="listitem">
      <button type="button" role="checkbox" className="ds-check-box" aria-checked={checked} aria-label={todo.important ? `${label}, important` : label} onClick={() => onChange(!checked)}><span>{TICK}</span></button>
      <span className="cc-today-pick-words">
        <span className="ds-todo-text">{keepWords(todo.title)}{todo.important && <span className="ds-sr">, important</span>}</span>
        {facts.filter(Boolean).length > 0 && <span className="ds-todo-line">{facts.filter(Boolean).map((f) => <span key={f} className="ds-todo-tag">{f}</span>)}</span>}
      </span>
    </div>
  );
}

/** A to-do shown, with nothing to tick. */
function StillRow({ title, facts = [], children }) {
  return (
    <div className="cc-today-still" role="listitem">
      <span className="cc-today-pick-words">
        <span className="ds-todo-text">{keepWords(title)}</span>
        {facts.filter(Boolean).length > 0 && <span className="ds-todo-line">{facts.filter(Boolean).map((f) => <span key={f} className="ds-todo-tag">{f}</span>)}</span>}
      </span>
      {children}
    </div>
  );
}

/** Saves, then says so with Undo for 10 seconds; resolves whether it saved. */
function useSaver() {
  const toast = useToast();
  return async (work, message, onUndo) => {
    try {
      const status = await work();
      if (message) toast.saved({ message: status === 'queued' ? 'Will sync' : message, long: true, onUndo });
      return true;
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : SAVE_PROBLEM);
      return false;
    }
  };
}

/** Today's row in coach_days and this week's in coach_weeks, with how to save each and put it back. */
export function useDayRows() {
  const { userId, coach, days, weeks, todayKey } = useCoachPortal();
  const monday = weekStart(todayKey);
  const day = days.find((d) => d.day === todayKey) || null;
  const week = weeks.find((w) => w.week_start === monday) || null;
  const blankDay = { coach_id: coach.id, day: todayKey, plan_todos: [], planned_at: null, plan_skipped: false, shutdown: {}, closed_at: null };
  const blankWeek = { coach_id: coach.id, week_start: monday, energy: null, energy_at: null, review: {}, reviewed_at: null };
  const restore = (table, before, made) => () => (before ? saveRow(userId, table, before) : removeRow(userId, table, keyOf(table, made))).catch(() => {});
  return {
    day, week,
    dayRow: (patch) => ({ ...(day || blankDay), ...patch }),
    weekRow: (patch) => ({ ...(week || blankWeek), ...patch }),
    undoDay: (made) => restore('coach_days', day, made),
    undoWeek: (made) => restore('coach_weeks', week, made),
  };
}

// ---------------------------------------------------------------- the stepped panel

/**
 * A side panel with steps (full screen on a phone): "Step 1 of 3" and the
 * time under the title, one question a step, Back and Next at the foot and
 * the last step's own button. Nothing is ever greyed out.
 * @param {{ steps: { title: string, nudge?: string, body: any, aside?: any }[], last: string, onFinish: () => void }} props
 */
function StepPanel({ open, onClose, title, time, steps, step, setStep, last, onFinish, titleAside, wide = false }) {
  const headRef = useRef(null);
  const moved = useRef(false);
  const at = Math.min(step, steps.length - 1);
  const current = steps[at];
  // A new step takes the keyboard to its question, so a screen reader says it.
  useLayoutEffect(() => {
    if (!open) { moved.current = false; return; }
    if (moved.current) headRef.current?.focus({ preventScroll: true });
    moved.current = true;
  }, [at, open]);
  const isLast = at === steps.length - 1;
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={title}
      titleAside={titleAside}
      wide={wide}
      className="cc-today-flow"
      footer={(
        <div className="cc-panel-foot cc-today-foot">
          {at > 0 ? <TextLink onClick={() => setStep(at - 1)}>Back</TextLink> : <span />}
          <Button variant="primary" className="ds-panel-go" onClick={() => (isLast ? onFinish() : setStep(at + 1))}>{isLast ? last : 'Next'}</Button>
        </div>
      )}
    >
      <p className="cc-today-step"><span>Step {at + 1} of {steps.length}</span><span>{time}</span></p>
      <h3 className="cc-today-q" tabIndex={-1} ref={headRef}>{current.title}{current.aside}</h3>
      {current.nudge && <p className="cc-today-nudge">{current.nudge}</p>}
      <div className="cc-today-stepbody" key={at}>{current.body}</div>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Plan my day

/**
 * Plan my day: what carried over, pick today's to-dos, then a time between
 * calls for each. "Start my day" saves the day's plan and moves the to-dos,
 * with one toast and Undo that puts every to-do and the day back.
 */
export function PlanPanel({ open, onClose }) {
  const { userId, todos, sessions, settings, todayKey } = useCoachPortal();
  const rows = useDayRows();
  const save = useSaver();
  const callWords = useCallWords();
  const [step, setStep] = useState(0);
  const [keep, setKeep] = useState({});
  const [picked, setPicked] = useState({});
  const [times, setTimes] = useState({});
  const [timing, setTiming] = useState(null);
  const [all, setAll] = useState(false);
  const busy = useRef(false);
  useEffect(() => { if (open) { setStep(0); setKeep({}); setPicked({}); setTimes({}); setTiming(null); setAll(false); } }, [open]);

  const today = useMemo(() => todayTodos(todos, todayKey), [todos, todayKey]);
  const carried = useMemo(() => [...today.work, ...today.afterWork].filter((t) => carriedWords(t, todayKey)), [today, todayKey]);
  const upcoming = useMemo(() => upcomingGroups(todos, todayKey).flatMap((g) => g.items), [todos, todayKey]);
  const plan = useMemo(() => planChanges({ todos, keep, picked, times, todayKey }), [todos, keep, picked, times, todayKey]);
  const load = dayLoad({ sessions, todos: plan.todos, settings, dayKey: todayKey });
  const line = dayLine({ sessions, todos: plan.todos.filter((t) => !t.after_work), dayKey: todayKey });
  const shown = all ? upcoming : upcoming.slice(0, SHOW_FIRST);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    const before = todos.filter((t) => plan.changed.some((c) => c.id === t.id));
    const made = rows.dayRow({ plan_todos: plan.work.map((t) => t.id), planned_at: new Date().toISOString(), plan_skipped: false });
    const undoDay = rows.undoDay(made);
    const ok = await save(
      () => saveRows(userId, [...plan.changed.map((t) => ['coach_todos', t]), ['coach_days', made]]),
      'Your day is planned',
      async () => { await saveRows(userId, before.map((t) => ['coach_todos', t])).catch(() => {}); await undoDay(); },
    );
    busy.current = false;
    if (ok) onClose();
  };

  const timeOf = (t) => timeWords(t.planned_time);
  const options = (t) => {
    const placed = plan.work.filter((x) => x.id !== t.id && timeOf(x)).map((x) => ({ time: timeOf(x), minutes: x.minutes }));
    const free = freeStarts({ sessions, settings, dayKey: todayKey, minutes: t.minutes || 15, placed });
    const own = timeOf(t);
    return [{ value: NO_TIME, label: 'No time' }, ...[...new Set([...(own ? [own] : []), ...free])].sort().map((v) => ({ value: v, label: v }))];
  };

  const steps = [
    {
      title: 'What carried over',
      nudge: carried.length ? 'Keep them for today, or untick to move them to tomorrow.' : 'Nothing carried over from an earlier day.',
      body: carried.length > 0 && (
        <div className="cc-today-list" role="list" aria-label="What carried over">
          {carried.map((t) => (
            <PickRow key={t.id} todo={t} facts={[carriedWords(t, todayKey), estimateWords(t.minutes)]} checked={keep[t.id] !== false} label={`Keep “${t.title}” for today`} onChange={(on) => setKeep((k) => ({ ...k, [t.id]: on }))} />
          ))}
        </div>
      ),
    },
    {
      title: 'Pick today’s to-dos',
      nudge: upcoming.length ? null : 'Nothing is planned for the days ahead.',
      body: (
        <>
          {upcoming.length > 0 && (
            <div className="cc-today-list" role="list" aria-label="Upcoming to-dos">
              {shown.map((t) => (
                <PickRow key={t.id} todo={t} facts={[plannedWords(t, todayKey), dueWords(t, todayKey), estimateWords(t.minutes)]} checked={Boolean(picked[t.id])} label={`Do “${t.title}” today`} onChange={(on) => setPicked((p) => ({ ...p, [t.id]: on }))} />
              ))}
            </div>
          )}
          {!all && upcoming.length > SHOW_FIRST && <div className="cc-acts"><TextLink onClick={() => setAll(true)}>Show all {countFigure(upcoming.length)}</TextLink></div>}
          <OverLine over={load.over} />
        </>
      ),
    },
    {
      title: 'Put them between calls',
      nudge: plan.work.length ? 'Give each one a time, or leave it without one.' : 'Nothing is planned for today yet.',
      body: (
        <>
          {plan.work.length > 0 && (
            <>
              <h4 className="cc-today-h">To-dos to place</h4>
              <div className="cc-today-list" role="list" aria-label="To-dos to place">
                {plan.work.map((t) => (
                  <div key={t.id} role="listitem" className="cc-today-place">
                    <StillRow title={t.title} facts={[estimateWords(t.minutes)]}>
                      <TextLink aria-expanded={timing === t.id} aria-label={timeOf(t) ? `${timeOf(t)}. Edit the time for “${t.title}”` : `Add a time for “${t.title}”`} onClick={() => setTiming(timing === t.id ? null : t.id)}>{timeOf(t) || 'Add a time'}</TextLink>
                    </StillRow>
                    {timing === t.id && (
                      <div className="cc-today-when">
                        <Dropdown label="When will you do it?" options={options(t)} value={timeOf(t) || NO_TIME} onChange={(v) => { setTimes((x) => ({ ...x, [t.id]: v === NO_TIME ? null : v })); setTiming(null); }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          <h4 className="cc-today-h">Your day</h4>
          {line.length === 0 && <p className="cc-quiet">No calls today.</p>}
          {line.length > 0 && (
            <div className="cc-today-calls" role="list" aria-label="Your day, in time order">
              {line.map((r) => {
                if (r.kind === 'todo') return <CallRow key={r.id} time={r.time} name={r.todo.title} facts={['To-do']} length={estimateWords(r.minutes)} />;
                const w = callWords(r.session);
                return <CallRow key={r.id} time={r.time} name={w.name} facts={w.facts} length={callLength(r.session)} />;
              })}
            </div>
          )}
          <OverLine over={load.over} />
        </>
      ),
    },
  ];

  return <StepPanel open={open} onClose={onClose} title="Plan my day" time="~3 minutes" steps={steps} step={step} setStep={setStep} last="Start my day" onFinish={start} />;
}

// ---------------------------------------------------------------- the over-full day

/** "Today is 45 minutes over": the calls, the to-dos and the working day, with two quiet ways on. No button. */
export function OverPanel({ open, onClose, onMove }) {
  const { todos, sessions, settings, todayKey } = useCoachPortal();
  const navigate = useNavigate();
  const load = dayLoad({ sessions, todos, settings, dayKey: todayKey });
  // What it said stays while the panel slides away, even once the day fits.
  const [kept, setKept] = useState(load);
  useEffect(() => { if (open && load.over > 0) setKept(load); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, load.over, load.callMinutes, load.todoMinutes, load.dayMinutes]);
  const l = load.over > 0 ? load : kept;
  return (
    <SlidePanel open={open} onClose={onClose} title={l.over > 0 ? `Today is ${overWords(l.over)}` : 'Today fits your day'}>
      <div className="cc-today-sum">
        <Line title="Calls" small="Booked today"><span className="cc-line-state">{minutesWords(l.callMinutes)}</span></Line>
        <Line title="To-dos" small="From their time estimates"><span className="cc-line-state">{minutesWords(l.todoMinutes)}</span></Line>
        <Line title="Your working day" small={l.day ? hoursWords(l.day) : 'Not working'}><span className="cc-line-state">{minutesWords(l.dayMinutes)}</span></Line>
      </div>
      <div className="cc-links cc-today-links">
        <TextLink onClick={() => { onClose(); navigate('/coach/settings/hours'); }}>Edit my hours</TextLink>
        <TextLink onClick={onMove}>Choose what to move</TextLink>
      </div>
    </SlidePanel>
  );
}

/** "Move to tomorrow": enough is ticked to fit the day, never an Important one; the button is never greyed out. */
export function MovePanel({ open, onClose }) {
  const { userId, todos, sessions, settings, todayKey } = useCoachPortal();
  const save = useSaver();
  const work = useMemo(() => todayTodos(todos, todayKey).work, [todos, todayKey]);
  const over = dayLoad({ sessions, todos, settings, dayKey: todayKey }).over;
  const [ticked, setTicked] = useState([]);
  const [problem, setProblem] = useState(null);
  const busy = useRef(false);
  useEffect(() => { if (open) { setTicked(suggestMoves(work, over)); setProblem(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const live = ticked.filter((id) => work.some((t) => t.id === id));
  const state = moveState(work, live, over);

  const move = async () => {
    if (busy.current) return;
    if (!state.count) { setProblem('Tick what to move to carry on.'); return; }
    busy.current = true;
    const before = work.filter((t) => live.includes(t.id));
    const tomorrow = addDays(todayKey, 1);
    const ok = await save(() => saveRows(userId, before.map((t) => ['coach_todos', moveToDay(t, tomorrow)])), movedWords(before.length), () => saveRows(userId, before.map((t) => ['coach_todos', t])).catch(() => {}));
    busy.current = false;
    if (ok) onClose();
  };

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Move to tomorrow"
      footer={<div className="cc-panel-foot cc-today-foot"><span /><Button variant="primary" className="ds-panel-go" onClick={move}>{state.button}</Button></div>}
    >
      <p className="cc-today-nudge cc-today-nudge--first" role="status">{over > 0 ? state.line : 'Today fits your day.'}</p>
      {work.length === 0 && <p className="cc-quiet">Nothing is left for today.</p>}
      <div className="cc-today-list" role="list" aria-label="Today’s to-dos">
        {work.map((t) => (
          <PickRow key={t.id} todo={t} facts={[estimateWords(t.minutes)]} checked={live.includes(t.id)} label={`Move “${t.title}” to tomorrow`} onChange={(on) => { setProblem(null); setTicked((list) => (on ? [...list, t.id] : list.filter((id) => id !== t.id))); }} />
        ))}
      </div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Close the day

/** Close the day: what got done, move the rest, tomorrow at a glance; then "Close the day" (with Undo). */
export function ClosePanel({ open, onClose }) {
  const { userId, todos, sessions, todayKey } = useCoachPortal();
  const rows = useDayRows();
  const save = useSaver();
  const callWords = useCallWords();
  const [step, setStep] = useState(0);
  const [moved, setMoved] = useState(0);
  const busy = useRef(false);
  useEffect(() => { if (open) { setStep(0); setMoved(0); } }, [open]);
  const done = dayDone({ sessions, todos, todayKey });
  const rest = useMemo(() => todayTodos(todos, todayKey).work, [todos, todayKey]);
  const tomorrow = addDays(todayKey, 1);
  const glance = dayLine({ sessions, todos, dayKey: tomorrow });

  const moveRest = async () => {
    if (busy.current || !rest.length) return;
    busy.current = true;
    const before = rest;
    const ok = await save(
      () => saveRows(userId, before.map((t) => ['coach_todos', moveToDay(t, tomorrow)])),
      movedWords(before.length),
      async () => { await saveRows(userId, before.map((t) => ['coach_todos', t])).catch(() => {}); setMoved((n) => Math.max(0, n - before.length)); },
    );
    if (ok) setMoved((n) => n + before.length);
    busy.current = false;
  };
  const close = async () => {
    if (busy.current) return;
    busy.current = true;
    const made = rows.dayRow({ closed_at: new Date().toISOString(), shutdown: { ...(rows.day?.shutdown || {}), moved } });
    const ok = await save(() => saveRow(userId, 'coach_days', made), 'Day closed', rows.undoDay(made));
    busy.current = false;
    if (ok) onClose();
  };

  const steps = [
    {
      title: 'What got done',
      nudge: done.line,
      body: (
        <Figures label="What got done">
          <Stat label="Calls today" value={countFigure(done.calls)} />
          <Stat label="To-dos done" value={countFigure(done.done)} />
        </Figures>
      ),
    },
    {
      title: 'Move the rest',
      nudge: rest.length ? null : 'Nothing is left for today.',
      body: rest.length > 0 && (
        <>
          <div className="cc-today-list" role="list" aria-label="What is left for today">
            {rest.map((t) => <StillRow key={t.id} title={t.title} facts={[estimateWords(t.minutes)]} />)}
          </div>
          <div className="cc-acts"><TextLink onClick={moveRest}>Move them to tomorrow</TextLink></div>
        </>
      ),
    },
    {
      title: 'Tomorrow at a glance',
      nudge: glance.length ? dayWords(tomorrow, todayKey) : 'Nothing is booked for tomorrow yet.',
      body: glance.length > 0 && (
        <div className="cc-today-calls" role="list" aria-label="Tomorrow, in time order">
          {glance.map((r) => {
            if (r.kind === 'todo') return <CallRow key={r.id} time={r.time} name={r.todo.title} facts={['To-do']} length={estimateWords(r.minutes)} />;
            const w = callWords(r.session);
            return <CallRow key={r.id} time={r.time} name={w.name} facts={w.facts} length={`${r.session.minutes} minutes`} />;
          })}
        </div>
      ),
    },
  ];
  return <StepPanel open={open} onClose={onClose} title="Close the day" time="~2 minutes" steps={steps} step={step} setStep={setStep} last="Close the day" onFinish={close} />;
}

// ---------------------------------------------------------------- the week: energy and the review

/** The five words; one tap saves. */
function EnergyChoice({ value, onChoose }) {
  const [shown, setShown] = useState(value || '');
  useEffect(() => { setShown(value || ''); }, [value]);
  return <InlineChoice ariaLabel="How was your energy this week?" options={ENERGY} value={shown} onChange={setShown} onChoose={(v) => onChoose(v ?? shown)} form="rows" tick />;
}

function useEnergy() {
  const { userId } = useCoachPortal();
  const rows = useDayRows();
  const save = useSaver();
  // One request a tap: the same word tapped again while its save is on its way is ignored.
  const sending = useRef(null);
  return (value, say) => {
    if (rows.week?.energy === value || sending.current === value) return Promise.resolve(true);
    sending.current = value;
    const made = rows.weekRow({ energy: value, energy_at: new Date().toISOString() });
    return save(() => saveRow(userId, 'coach_weeks', made), say ? 'Saved' : null, rows.undoWeek(made)).finally(() => { if (sending.current === value) sending.current = null; });
  };
}

/** Rate my energy (the Friday afternoon offer): one question, five words; one tap saves and closes. */
export function EnergyPanel({ open, onClose }) {
  const rows = useDayRows();
  const rate = useEnergy();
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Sheet open={open} onClose={onClose} title="How was your energy this week?" titleAside={<Eye sentence={ONLY_YOU} />} className="cc-today-energy">
      {open && <EnergyChoice value={rows.week?.energy} onChoose={(v) => { if (!v) return; rate(v, true); clearTimeout(timer.current); timer.current = setTimeout(onClose, ONE_TAP_MS); }} />}
    </Sheet>
  );
}

/** Next week's calls a day as five small bars, each with the shared pop-up; no key. */
function WeekShape({ shape, todayKey }) {
  const isPhone = useIsPhone();
  const max = Math.max(1, ...shape.map((d) => d.calls));
  const top = Math.max(...shape.map((d) => d.calls));
  // On a phone a chart pop-up is one line (Tim, 19 Nov): the calls and the day together.
  const tip = (d) => { const calls = `${d.calls} ${d.calls === 1 ? 'call' : 'calls'}`; const day = dayWords(d.day, todayKey); return isPhone ? { value: `${calls}, ${day}` } : { value: calls, when: day }; };
  return (
    <ChartTips>
      <div className="cc-today-shape" role="group" aria-label="Calls each day next week">
        {shape.map((d) => (
          <div key={d.day} className="cc-today-shape-day" {...tipProps(tip(d))}>
            <span className="cc-today-shape-bar"><i className={d.calls > 0 && d.calls === top ? 'cc-today-shape-top' : undefined} style={{ height: `${Math.round((d.calls / max) * 100)}%` }} /></span>
            <span className="cc-today-shape-label" aria-hidden="true">{d.label}</span>
          </div>
        ))}
      </div>
    </ChartTips>
  );
}

const DONE_FIRST = 5;

/**
 * The weekly review: energy, the week's hours, what got done, next week's
 * shape and "What would you change?". What is typed is kept for the visit.
 */
export function ReviewPanel({ open, onClose }) {
  const { userId, coach, todos, sessions, todayKey } = useCoachPortal();
  const rows = useDayRows();
  const save = useSaver();
  const rate = useEnergy();
  const [step, setStep] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const draftKey = `clarity-coach-review-draft:${userId}:${weekStart(todayKey)}`;
  const readDraft = () => { try { return window.sessionStorage.getItem(draftKey); } catch { return null; } };
  const [change, setChange] = useState('');
  const busy = useRef(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    setStep(0); setAllDone(false);
    setChange(readDraft() ?? (typeof rows.week?.review?.change === 'string' ? rows.week.review.change : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const type = (v) => { setChange(v); try { window.sessionStorage.setItem(draftKey, v); } catch { /* kept on the page only */ } };
  const week = useMemo(() => weekDone({ sessions, todos, target: coach.capacity_hours_week, todayKey }), [sessions, todos, coach.capacity_hours_week, todayKey]);

  const finish = async () => {
    if (busy.current) return;
    busy.current = true;
    const made = rows.weekRow({ review: { ...(rows.week?.review || {}), change: cut(change.trim(), 2000) }, reviewed_at: new Date().toISOString() });
    const ok = await save(() => saveRow(userId, 'coach_weeks', made), 'Review saved', rows.undoWeek(made));
    busy.current = false;
    if (!ok) return;
    try { window.sessionStorage.removeItem(draftKey); } catch { /* nothing kept */ }
    onClose();
  };

  const doneShown = allDone ? week.todosDone : week.todosDone.slice(0, DONE_FIRST);
  const steps = [
    {
      title: 'How was your energy this week?',
      body: <EnergyChoice value={rows.week?.energy} onChoose={(v) => { if (!v) return; rate(v, false); clearTimeout(timer.current); timer.current = setTimeout(() => setStep(1), ONE_TAP_MS); }} />,
    },
    {
      title: 'Your hours',
      body: <CapacityFigures sessions={sessions} target={coach.capacity_hours_week} todayKey={todayKey} hoursLabel="Coaching hours" callsLabel="Calls" />,
    },
    {
      title: 'What got done',
      body: (
        <>
          <Figures label="What got done">
            <Stat label="To-dos done" value={countFigure(week.todosDone.length)} />
            <Stat label="Recaps sent" value={countFigure(week.recapsSent)} />
          </Figures>
          {week.todosDone.length > 0 && (
            <div className="cc-today-list cc-today-list--after" role="list" aria-label="To-dos done this week">
              {doneShown.map((t) => <StillRow key={t.id} title={t.title} facts={[doneWords(t, todayKey)]} />)}
            </div>
          )}
          {!allDone && week.todosDone.length > DONE_FIRST && <div className="cc-acts"><TextLink onClick={() => setAllDone(true)}>Show all {countFigure(week.todosDone.length)}</TextLink></div>}
        </>
      ),
    },
    {
      title: 'Next week’s shape',
      body: (
        <>
          <WeekShape shape={week.shape} todayKey={todayKey} />
          <p className="cc-today-nudge">{week.shapeLine}</p>
        </>
      ),
    },
    {
      title: 'What would you change?',
      body: <div className="cc-field"><TextBox ariaLabel="What would you change?" placeholder="e.g. Keep Wednesday mornings for writing" value={change} maxLength={2000} onChange={type} /></div>,
    },
  ];
  return <StepPanel open={open} onClose={onClose} title="Weekly review" time="~3 minutes" titleAside={<Eye sentence={ONLY_YOU} />} steps={steps} step={step} setStep={setStep} last="Finish the review" onFinish={finish} />;
}
