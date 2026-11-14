import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  AddButton,
  AddTodoPanel,
  AddWinPanel,
  Button,
  Choice,
  Collapsible,
  EmptyState,
  IMPACT_OPTIONS,
  Loading,
  MoveTodoPanel,
  PageHeader,
  PerformanceSystem,
  RecoveryLinks,
  RecoveryNotice,
  SaveStatus,
  Section,
  SegmentedControl,
  SlidePanel,
  SprintDial,
  TodoList,
  TodoRow,
  WhoSees,
  useToast,
  LoadError,
} from '../../components/design';
import { useSprintPage } from '../../lib/performance/hooks';
import {
  freezeWeek,
  moveTodo,
  saveHabitSettingFrom,
  saveWin,
  setWinDeleted,
} from '../../lib/performance/api';
import { BACKLOG_LINE, BACKLOG_VALUE, dayName, localToday, moveOptions, recoveryLead, settingForWeek, sprintPageView, withTodoMoved } from '../../lib/performance';
import { useRecoveryActions } from './recoveryActions';
import { useSprintActions } from './sprintActions';
import { DayRow, WeekRow } from './LogRows';
import { newId, useQueueState } from '../../lib/syncQueue';
import { isOnline } from '../../lib/connection';
import { useDraft } from '../../lib/drafts';
import pageText from '../../content/pageText';
import { prefersReducedMotion } from '../../components/design/timing';
import './performance.css';

// The Performance Sprint page (mock-up M1, R.sprint): the dial and this
// week's score so far, Log today (day and week views, one habit per
// row), the to-dos this week with move and roll-over, the add panels,
// later in the sprint, and Sprint details. Every figure comes from
// src/lib/scores through src/lib/performance (sprintPageView).
//
// Logging works offline: every change goes through the offline queue
// (saveOrQueue), shows "Will sync" while it waits, then "Saved". A log
// for a day is found by its habit and day, so changing it updates the
// same row and never swaps its id (risk R2). Logging and to-dos are
// shared with Home (sprintActions.js, LogRows.jsx): one way to save.
//
// Finished weeks are frozen for the coach (freeze_week) when online
// (risk R3); nothing else writes week_scores yet.
//
// Recovery (M15) pauses this page: the paused dial, when it picks up and
// its new end, Add a few more days and Ready to go again, with the
// scores hidden until "Show my results" (this visit only). Once the
// chosen end has come, the end check-in shows instead. On the first day
// back the top of the page says "Welcome back" (M15 "Welcome back. Let's
// start with this week."). "Take a recovery week" sits beside the dial.

const IMPACT_WORD = { 1: 'Low', 2: 'Medium', 3: 'High' };
const emptyTodo = (week) => ({ text: '', strategyId: null, impact: 2, week });
const emptyWin = (day) => ({ text: '', strategyIds: [], impact: 2, day });

export default function PerformanceSprint() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { data, loading, error, setData } = useSprintPage(userId);
  const recovery = useRecoveryActions({ setData });
  const today = localToday();
  const view = useMemo(() => (data ? sprintPageView(data, { today }) : null), [data, today]);
  const queue = useQueueState();

  const [mode, setMode] = useState('day');
  const [system, setSystem] = useState(false);
  const actions = useSprintActions({ userId, data, setData, view, today });
  const { save, sent, changeRows, typed, putLog, typeNumber, leaveNumber, tickWeekly, toggleTodo } = actions;
  const [habitId, setHabitId] = useState(null);
  const [moving, setMoving] = useState(null);
  const [panel, setPanel] = useState(null); // 'todo' | 'win'
  const [todoForm, setTodoForm] = useState(() => emptyTodo(null));
  const [winForm, setWinForm] = useState(() => emptyWin(null));
  const frozen = useRef(new Set());
  const logRef = useRef(null);
  const todoRef = useRef(null);

  // A toast handed over by the page before (Start a sprint).
  useEffect(() => {
    if (location.state?.toast) {
      toast.show(location.state.toast);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dashboard's fixes (M4 What's holding you back): "Plan it into this
  // week" opens Add a to-do for that Strategy, this week; "Make it easier
  // this week" opens that habit. Once, when the running sprint shows.
  const handed = useRef(false);
  useEffect(() => {
    const st = location.state;
    if (handed.current || view?.state !== 'running' || !(st?.addTodoFor || st?.openHabit)) return;
    handed.current = true;
    if (st.addTodoFor && (data?.strategies || []).some((s) => s.id === st.addTodoFor)) {
      setTodoForm({ ...emptyTodo(view.current), strategyId: st.addTodoFor });
      setPanel('todo');
    } else if (st.openHabit && view.habits.some((h) => h.id === st.openHabit)) {
      setHabitId(st.openHabit);
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    // Once, when the sprint has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.state]);

  // Finished weeks into week_scores for the coach (R3): online, once
  // everything waiting has been sent, so the frozen score has every log.
  useEffect(() => {
    if (!view?.toFreeze?.length || !isOnline() || queue.waiting > 0) return;
    const todo = view.toFreeze.filter((w) => !frozen.current.has(`${view.sprintId}:${w}`));
    if (!todo.length) return;
    todo.forEach((w) => frozen.current.add(`${view.sprintId}:${w}`));
    (async () => {
      for (const w of todo) {
        try {
          await freezeWeek(view.sprintId, w);
        } catch {
          // Best effort: tried again on the next visit.
          frozen.current.delete(`${view.sprintId}:${w}`);
        }
      }
    })();
  }, [view?.toFreeze, view?.sprintId, queue.waiting]);

  // Drafts of the add panels, so typing survives a refresh.
  const draftReady = Boolean(view?.state === 'running');
  const { clear: clearTodoDraft } = useDraft({
    userId,
    name: `sprint-todo:${view?.sprintId || 'none'}`,
    value: panel === 'todo' ? todoForm : null,
    ready: draftReady,
    onRestore: (d) => { if (d?.text) { setTodoForm(d); setPanel('todo'); } },
  });
  const { clear: clearWinDraft } = useDraft({
    userId,
    name: `sprint-win:${view?.sprintId || 'none'}`,
    value: panel === 'win' ? winForm : null,
    ready: draftReady,
    onRestore: (d) => { if (d?.text) { setWinForm(d); setPanel('win'); } },
  });

  // ------------------------------------------------------------ to-dos and wins

  const addTodo = async (form) => {
    setPanel(null);
    setTodoForm(emptyTodo(view.current));
    clearTodoDraft();
    if (!(await actions.addTodo(form))) {
      setTodoForm(form);
      setPanel('todo');
    }
  };

  const addWin = async (form) => {
    const id = newId();
    const strategyIds = [...form.strategyIds];
    const row = { id, what: form.text.trim(), local_date: form.day, impact: form.impact, deleted_at: null };
    changeRows((d) => ({
      wins: [...(d.wins || []), row],
      winLinks: [...(d.winLinks || []), ...strategyIds.map((s) => ({ win_id: id, strategy_id: s }))],
    }));
    setPanel(null);
    setWinForm(emptyWin(today));
    clearWinDraft();
    const ok = await sent(() => saveWin(userId, { id, what: row.what, date: row.local_date, impact: row.impact, strategyIds }));
    if (!ok) {
      changeRows((d) => ({ wins: d.wins.filter((w) => w.id !== id) }));
      setWinForm(form);
      setPanel('win');
      return;
    }
    const names = (data.strategies || []).filter((s) => strategyIds.includes(s.id));
    toast.saved({
      message: names.length === 1 ? `Win added to ${names[0].name}.` : `Win added to ${names.length} Strategies.`,
      onUndo: () => {
        changeRows((d) => ({ wins: d.wins.filter((w) => w.id !== id) }));
        sent(() => setWinDeleted(userId, id, new Date().toISOString()));
      },
    });
  };

  // To another week, to the Backlog (no week), or from the Backlog into a
  // week (Tim, 13 Nov, 10:42): one move, noted as the database notes it.
  const moveTo = async (todo, to) => {
    const week = to === BACKLOG_VALUE ? null : to;
    const fromWeek = todo.plannedWeek ?? null;
    const move = (w) => changeRows((d) => withTodoMoved(d, todo.id, { sprintId: view.sprintId, week: w, on: today }));
    setMoving(null);
    move(week);
    const ok = await sent(() => moveTodo(userId, todo.id, { sprintId: view.sprintId, week, on: today }));
    if (!ok) {
      move(fromWeek);
      return;
    }
    toast.saved({
      message: week == null ? 'Moved to your backlog.' : week === view.current ? 'Moved to this week.' : `Moved to week ${week}.`,
      onUndo: () => {
        move(fromWeek);
        sent(() => moveTodo(userId, todo.id, { sprintId: view.sprintId, week: fromWeek, on: today }));
      },
    });
  };

  const setImpact = async (habit, impact) => {
    const from = view.current + 1;
    const now = settingForWeek(data.sprintSettings || [], habit.id, from);
    if (!now) return;
    const next = { ...now, id: now.from_week === from ? now.id : `device-${habit.id}-${from}`, from_week: from, impact };
    changeRows((d) => ({ sprintSettings: [...(d.sprintSettings || []).filter((s) => !(s.sprint_habit_id === habit.id && s.from_week === from)), next] }));
    const ok = await sent(() => saveHabitSettingFrom(userId, now, from, { impact }));
    if (ok) toast.show(`Impact set to ${IMPACT_WORD[impact]} from next week.`);
  };

  // ------------------------------------------------------------ the page

  const jump = (ref) => {
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    ref.current?.querySelector('h2')?.focus({ preventScroll: true });
  };

  // The menu's Log today (#log-today) lands on Log today, once it shows.
  const logShown = view?.state === 'running';
  useEffect(() => {
    if (location.hash !== '#log-today' || !logShown || !logRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      jump(logRef);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: location.state });
    });
    return () => cancelAnimationFrame(frame);
    // jump only reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, logShown]);

  const welcome = Boolean(view?.welcomeBack) && (view.state === 'running' || view.state === 'none');
  const meta = welcome
    ? []
    : view?.state === 'running'
    ? [`Week ${view.current} of ${view.lengthWeeks}`, view.dates.text]
    : view?.dates ? [view.dates.text] : [];
  const back = { label: 'Performance Sprint', to: '/performance-sprint' };

  let body;
  if (!data && loading) body = <Loading label="Loading your sprint" className="ds-loading--page" />;
  else if (!data || error) {
    body = (
      <div className="ipp-gap">
        <LoadError>Your sprint didn’t load. Check your connection and try again.</LoadError>
      </div>
    );
  } else if (view.state === 'paused' && view.pause.due) {
    // The chosen end has come with no answer yet (audit 4.7): it stays
    // paused, and the end check-in shows on every visit.
    body = <Navigate to="/recovery/check-in" replace />;
  } else if (view.state === 'none') {
    body = (
      <div className="ipp-gap">
        {view.recovery && (
          // Recovery with no sprint running (after "Recovery first" at the end of a review).
          <div className="rec-nosprint">
            <RecoveryNotice lead={recoveryLead(view.recovery, today)} lines={['No sprint is running, so nothing is tracked.']} />
            <RecoveryLinks
              className="rec-links"
              links={[
                { label: 'Add a few more days', onClick: () => navigate('/recovery/check-in?add=1', { state: { back } }) },
                { label: 'Ready to go again', onClick: () => recovery.end(view.recovery, today), disabled: recovery.working },
                { label: 'Open my recovery day', onClick: () => navigate('/recovery/today') },
              ]}
            />
          </div>
        )}
        {view.hasPlan ? (
          <EmptyState
            question="Ready to start a Performance Sprint?"
            action={{ label: 'Start a sprint', onClick: () => navigate('/performance-sprint/start') }}
          />
        ) : (
          // A sprint carries out the plan, so with no plan the next step is
          // building it (Start a sprint would only say so).
          <EmptyState
            question="Ready to build your Individual Performance Plan?"
            action={{ label: 'Build my plan', onClick: () => navigate('/performance-plan/build') }}
          />
        )}
        <BacklogAlone rows={view.backlog} />
      </div>
    );
  } else if (view.state === 'future') {
    body = (
      <>
        <SprintDial length={view.lengthWeeks} label={`${view.name}, ${view.lengthWeeks} weeks, starting ${view.startsOn}`} />
        <div className="ipp-gap ipp-coming">
          <p>{`Your ${view.name} starts on ${view.startsOn}.`}</p>
          <p>You can log your habits and tick off to-dos from that day.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-plan')}>Open my plan</Button>
        </div>
        <BacklogAlone rows={view.backlog} />
      </>
    );
  } else if (view.state === 'over') {
    // Its last week has passed but it hasn't been reviewed (R5): it stays
    // running until the review (step 6) or the next sprint finishes it.
    body = (
      <>
        <div className="sprint-hero sprint-hero--over">
          <SprintDial
            weeks={view.weeks}
            centre={{ small: 'Sprint average', big: view.average.value }}
            crossTip={{ value: 'Start and end of the sprint', when: view.dates.text }}
            label={`${view.name}, finished${view.average.value ? `, average performance score ${view.average.value}` : ''}`}
          />
          <div className="sprint-side ipp-coming">
            <p>{`Your ${view.name} ended on ${view.endedOn}.`}</p>
            <p>Its review is waiting for you.</p>
          </div>
        </div>
          <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-sprint/review')}>Review this sprint</Button>
          {view.debrief && <Button onClick={() => navigate('/performance-sprint/debrief')}>Start my debrief</Button>}
          <Button onClick={() => navigate('/performance-sprint/start')}>Start a new sprint</Button>
        </div>
        <BacklogAlone rows={view.backlog} />
      </>
    );
  } else if (view.state === 'paused') {
    body = (
      <SprintPaused
        view={view}
        working={recovery.working}
        onMore={() => navigate('/recovery/check-in?add=1', { state: { back } })}
        onReady={() => recovery.end(view.recovery, today)}
        onToday={() => navigate('/recovery/today')}
      />
    );
  } else {
    body = (
      <SprintBody
        view={view}
        units={data.personSettings?.units}
        mode={mode}
        setMode={setMode}
        save={save}
        typed={typed}
        logRef={logRef}
        todoRef={todoRef}
        onJump={jump}
        onLog={putLog}
        onType={typeNumber}
        onLeave={leaveNumber}
        onTick={tickWeekly}
        onHabit={setHabitId}
        onToggleTodo={toggleTodo}
        onMove={setMoving}
        onAddTodo={() => { setTodoForm((f) => (f.text ? f : emptyTodo(view.current))); setPanel('todo'); }}
        onAddWin={() => { setWinForm((f) => (f.text ? f : emptyWin(today))); setPanel('win'); }}
        navigate={navigate}
        welcome={welcome}
      />
    );
  }

  const running = view?.state === 'running';
  const habit = running ? view.habits.find((h) => h.id === habitId) || null : null;
  const movingTodo = running && moving ? moving : null;
  const strategies = (data?.strategies || []).map((s) => ({ value: s.id, label: s.name }));

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page sprint-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/plan-section')} label="Plan" /></div>
        <PageHeader
          title={welcome ? `Welcome back${data.firstName ? `, ${data.firstName}` : ''}` : view?.name || 'Performance Sprint'}
          meta={meta}
          // A greeting has nothing to explain (Tim, 3 Nov), so no ⓘ.
          info={welcome ? undefined : pageText.performanceSprint}
          onSystemLink={() => setSystem(true)}
        />
        {welcome && <p className="rec-welcome">Let’s start with this week.</p>}
        {body}
      </div>

      {running && (
        <>
          <HabitPanel
            habit={habit}
            view={view}
            typed={typed}
            data={data}
            onClose={() => setHabitId(null)}
            onType={typeNumber}
            onLeave={leaveNumber}
            onLog={putLog}
            onTick={tickWeekly}
            onImpact={setImpact}
          />
          <AddTodoPanel
            open={panel === 'todo'}
            onClose={() => setPanel(null)}
            form={{ ...todoForm, week: todoForm.week ?? view.current }}
            onFormChange={setTodoForm}
            strategies={strategies}
            weeks={view.weekOptions}
            onAdd={addTodo}
          />
          <AddWinPanel
            open={panel === 'win'}
            onClose={() => setPanel(null)}
            form={{ ...winForm, day: winForm.day ?? today }}
            onFormChange={setWinForm}
            strategies={strategies}
            days={view.winDays}
            onAdd={addWin}
          />
          <MoveTodoPanel
            open={Boolean(movingTodo)}
            onClose={() => setMoving(null)}
            text={movingTodo?.text || ''}
            title={movingTodo?.backlog ? 'Plan this to-do' : undefined}
            label={movingTodo?.backlog ? 'Which week should it go into?' : undefined}
            started={movingTodo && movingTodo.plannedWeek != null && movingTodo.plannedWeek <= view.current
              ? `This week has started, so it won’t count as done in week ${view.current}.`
              : null}
            options={movingTodo ? moveOptions(view.calendar, view.current, view.lengthWeeks, movingTodo, today) : []}
            emptyLine="This is the last week of this sprint, so there’s no later week to move it to."
            onMove={(w) => moveTo(movingTodo, w)}
          />
        </>
      )}
      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
    </div>
  );
}

// ------------------------------------------------------------ the running sprint

function SprintBody({
  view, mode, setMode, save, typed, logRef, todoRef, onJump, onLog, onType, onLeave, onTick, onHabit,
  onToggleTodo, onMove, onAddTodo, onAddWin, navigate, welcome,
}) {
  const centre = view.soFar
    ? { small: 'Performance score this week so far', big: `${view.soFar.value}%`, good: view.soFar.good }
    : { small: 'Nothing is scored yet this week.', big: null };
  const day = mode === 'day';
  const t = view.todos;
  const hero = welcome ? (
    // The first day back (M15 "Welcome back"): only the top changes, for today.
    <>
      <div className="rec-sprint">
        <SprintDial
          weeks={view.weeks}
          dayInWeek={view.dayInWeek}
          centre={{ small: 'Week', big: `${view.current} of ${view.lengthWeeks}`, words: true }}
          todayTip={{ value: 'Today', when: view.todayText }}
          crossTip={{ value: 'Start and end of the sprint', when: view.dates.text }}
          label={`${view.name}, week ${view.current} of ${view.lengthWeeks}`}
        />
        <div className="rec-sprint-lines">
          <p className="rec-sprint-lead">{`Sprint ${view.number} picks up today, at week ${view.current} of ${view.lengthWeeks}.`}</p>
          <p className="rec-sprint-line">{`It ends on ${dayName(view.dates.end, view.today)}.`}</p>
        </div>
      </div>
      <div className="ds-actions ipp-actions sprint-welcome-actions">
        <Button variant="primary" onClick={() => onJump(logRef)}>Log today</Button>
        <Button onClick={() => navigate('/daily-plan')}>Start my daily plan</Button>
      </div>
    </>
  ) : null;
  return (
    <>
      {welcome ? hero : (
      <div className="sprint-hero">
        <SprintDial
          weeks={view.weeks}
          dayInWeek={view.dayInWeek}
          centre={centre}
          todayTip={{ value: 'Today', when: view.todayText }}
          crossTip={{ value: 'Start and end of the sprint', when: view.dates.text }}
          label={`${view.name}, week ${view.current} of ${view.lengthWeeks}${view.soFar ? `, performance score this week so far ${view.soFar.value}%` : ''}`}
        />
        <div className="sprint-side">
          <div className="sprint-usual">
            {view.usualLine.ready && <p>{view.usualLine.lead}<span className="sprint-figure">{view.usualLine.figure}</span>{view.usualLine.end}</p>}
          </div>
          {view.soFar?.good && (
            <p className="sprint-std">
              <span className="sprint-std-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
              You’re at your standard so far this week.
            </p>
          )}
          <div className="ds-actions sprint-hero-actions">
            <Button variant="primary" onClick={() => onJump(logRef)}>Log today</Button>
            <Button onClick={() => onJump(todoRef)}>See to-dos</Button>
          </div>
          <div className="sprint-details">
            <Collapsible summary="Sprint details">
              <dl className="sprint-dl">
                <div>
                  <dt>Average performance score</dt>
                  <dd>
                    {view.average.value ? <span className="sprint-figure">{view.average.value}</span> : null}
                    <span className="sprint-dd-note">{view.average.note}</span>
                  </dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd><span className="sprint-figure">{`${view.lengthWeeks} weeks`}</span></dd>
                </div>
                <div>
                  <dt>
                    Performance standard
                  </dt>
                  <dd><span className="sprint-figure">{`${view.standard}%`}</span></dd>
                </div>
              </dl>
            </Collapsible>
          </div>
          <div className="sprint-recovery">
            <Button variant="text" onClick={() => navigate('/recovery')}>Take a recovery week</Button>
          </div>
        </div>
      </div>
      )}

      <div ref={logRef} id="log-today" className="sprint-anchor">
        <Section
          title={day ? 'Log today' : 'Log this week'}
          className="ipp-section sprint-section sprint-log"
          eye={<WhoSees audience="me" />}
          aside={<SegmentedControl label="Log by" options={[{ value: 'day', label: 'Today' }, { value: 'week', label: 'This week' }]} value={mode} onChange={setMode} />}
        >
          <div className="sprint-subrow">
            <span className="sprint-subrow-left">
              <span>{day ? view.todayText : 'Fill in any day this week.'}</span>
              <SaveStatus state={save} />
            </span>
          </div>
          {day && !view.todayIsWorking && (
            <div className="sprint-dayoff">
              <p>Today is a day off, so nothing is expected.</p>
              <p>You can still log anything you did.</p>
            </div>
          )}
          {view.habits.length ? (
            <div className="sprint-habits">
              {view.habits.map((h) => (day
                ? <DayRow key={h.id} habit={h} view={view} typed={typed} onLog={onLog} onType={onType} onLeave={onLeave} onTick={onTick} onMore={() => onHabit(h.id)} />
                : <WeekRow key={h.id} habit={h} view={view} typed={typed} onLog={onLog} onType={onType} onLeave={onLeave} onTick={onTick} onMore={() => onHabit(h.id)} />))}
            </div>
          ) : (
            <p className="ipp-muted sprint-gap">This sprint has no habits to log.</p>
          )}
        </Section>
      </div>

      <div ref={todoRef} className="sprint-anchor">
        <Section
          title="To-dos this week"
          line="Anything not done by Sunday rolls into next week."
          // A first-visit tip: shown once, then never again (Tim, 5 Nov).
          helpKey="sprint-todos-roll"
          className="ipp-section sprint-section"
          eye={<WhoSees audience="me" />}
        >
          {t.thisWeek.length || t.wins.length ? (
            <TodoList label="To-dos this week" className="sprint-gap">
              {t.thisWeek.map((x) => (
                <TodoRow
                  key={x.id}
                  text={x.text}
                  strategyName={x.strategyName}
                  done={x.done}
                  disabled={x.movedOut}
                  tags={[
                    x.rolledFrom ? `Rolled over from week ${x.rolledFrom}` : null,
                    x.movedOut ? (x.movedTo ? `Moved to week ${x.movedTo}` : x.toBacklog ? 'Moved to your backlog' : 'Moved out of this sprint') : null,
                  ].filter(Boolean)}
                  onToggle={(done) => onToggleTodo(x, done)}
                  onMove={x.done || x.movedOut ? undefined : () => onMove(x)}
                />
              ))}
              {t.wins.map((w) => (
                <TodoRow key={w.id} win text={w.text} strategyName={w.strategyName} winTag={`Unplanned win, ${w.day}`} />
              ))}
            </TodoList>
          ) : (
            <p className="ipp-muted sprint-gap">Nothing is planned for this week yet.</p>
          )}
          <div className="ds-actions sprint-add">
            <AddButton onClick={onAddTodo}>Add a to-do</AddButton>
            <AddButton onClick={onAddWin}>Add an unplanned win</AddButton>
          </div>
          <div className="sprint-later">
            <Collapsible
              capitals
              summary={(
                <span className="sprint-later-head">
                  <span className="sprint-later-title">Later in this sprint</span>
                </span>
              )}
            >
              {t.later.length ? (
                <TodoList label="Later in this sprint">
                  {t.later.map((x) => (
                    <TodoRow
                      key={x.id}
                      text={x.text}
                      strategyName={x.strategyName}
                      tags={[x.when]}
                      onToggle={(done) => onToggleTodo(x, done)}
                      onMove={() => onMove(x)}
                    />
                  ))}
                </TodoList>
              ) : (
                <p className="ipp-muted">When you add a to-do for a later week, it shows here.</p>
              )}
            </Collapsible>
          </div>
          <div className="sprint-later sprint-backlog">
            <Collapsible
              capitals
              summary={(
                <span className="sprint-later-head">
                  <span className="sprint-later-title">Backlog</span>
                </span>
              )}
            >
              <BacklogList rows={t.backlog} onPlan={onMove} />
            </Collapsible>
          </div>
        </Section>
      </div>

      <div className="ds-actions ipp-actions">
        {view.debrief && <Button onClick={() => navigate('/performance-sprint/debrief')}>Start my debrief</Button>}
        <Button onClick={() => navigate('/performance-sprint/year')}>View your year</Button>
        <Button onClick={() => navigate('/performance-plan')}>Open my plan</Button>
      </div>
    </>
  );
}

// The Backlog on its own, when no week can take a to-do: no sprint, one
// that hasn't started yet, or one whose weeks have all passed (a tool's
// to-do then says "Added to your backlog", so it must show somewhere: the
// functionality tester, 14 Nov). Nothing to plan into yet, so rows only.
function BacklogAlone({ rows }) {
  if (!rows?.length) return null;
  return (
    <Section title="Backlog" className="ipp-section sprint-section" eye={<WhoSees audience="me" />}>
      <BacklogList rows={rows} />
    </Section>
  );
}

// The Backlog (Tim, 13 Nov, 10:42): to-dos with no week yet, rows like
// every other to-do's. Its one line shows while it is empty (and in the
// add panel when Backlog is chosen), never on every row; a row opens to
// "Plan into a week" while a sprint runs. Nothing is ticked here: a to-do
// is planned into a week first, so it counts in that week.
function BacklogList({ rows, onPlan }) {
  if (!rows.length) {
    return (
      <div className="sprint-backlog-empty">
        <p className="ipp-muted">A to-do with no week yet goes in your backlog.</p>
        <p className="ipp-muted">{BACKLOG_LINE}</p>
      </div>
    );
  }
  return (
    <TodoList label="Backlog">
      {rows.map((x) => (
        <TodoRow
          key={x.id}
          plain
          text={x.text}
          strategyName={x.strategyName}
          onMove={onPlan ? () => onPlan(x) : undefined}
          moveLabel="Plan into a week"
        />
      ))}
    </TodoList>
  );
}

/** A habit's week, target and impact (M1 sheetPanel 'hab'). */
function HabitPanel({ habit, view, typed, data, onClose, onType, onLeave, onLog, onTick, onImpact }) {
  const last = view.current >= view.lengthWeeks;
  const nextSetting = habit ? settingForWeek(data.sprintSettings || [], habit.id, view.current + 1) : null;
  return (
    <SlidePanel
      open={Boolean(habit)}
      onClose={onClose}
      title={<span className="ipp-panel-title">{habit?.name || ''}</span>}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {habit && (
        <div className="sprint-habit-panel">
          <p className="ipp-panel-serves">{habit.strategyName}</p>
          <dl className="sprint-habit-facts">
            <div><dt>Target</dt><dd>{habit.measureLine}</dd></div>
          </dl>
          <WeekRow bare habit={habit} view={view} typed={typed} onLog={onLog} onType={onType} onLeave={onLeave} onTick={onTick} />
          <Section title="Edit this habit" as="h3" className="sprint-habit-edit">
            <div className="sprint-habit-lines">
              <p>Changes apply from next week.</p>
              <p>Past weeks keep what they had.</p>
            </div>
            {last ? (
              <p className="ipp-muted">This is the last week of this sprint, so changes wait for your next sprint.</p>
            ) : (
              <Choice
                label="How much does it move its Strategy?"
                options={IMPACT_OPTIONS}
                value={nextSetting?.impact ?? habit.impact}
                onChange={(impact) => onImpact(habit, impact)}
              />
            )}
          </Section>
        </div>
      )}
    </SlidePanel>
  );
}

// Recovery pauses the sprint (M15 "Sprint, paused"): the paused dial,
// the week it paused at, when it picks up and its new end, then Add a few
// more days and Ready to go again. Scores and standards are hidden
// (no mint, no grey) until "Show my results", for this visit only: it is
// never stored, so the next visit hides them again (M15 "Your results").
function SprintPaused({ view, working, onMore, onReady, onToday }) {
  const [show, setShow] = useState(false);
  const p = view.pause;
  return (
    <>
      <div className="rec-sprint">
        <SprintDial
          paused
          weeks={show ? view.weeks : view.hiddenWeeks}
          centre={{ small: `Week ${p.week} of ${view.lengthWeeks}`, big: 'Paused' }}
          crossTip={{ value: 'Start and end of the sprint', when: view.dates.text }}
          label={`${view.name}, week ${p.week} of ${view.lengthWeeks}, paused`}
        />
        <div className="rec-sprint-lines">
          {p.complete ? (
            <>
              <p className="rec-sprint-lead">{`Your ${view.name} ended on ${p.endedOn}.`}</p>
              <p className="rec-sprint-line">Its review opens when you’re back.</p>
            </>
          ) : (
            <>
              <p className="rec-sprint-lead">{`Sprint ${view.number} is paused at week ${p.week} of ${view.lengthWeeks}.`}</p>
              <p className="rec-sprint-line">{`It picks up on ${p.picksUpOn}.`}</p>
              <p className="rec-sprint-line">{p.moved ? `It now ends on ${p.endOn} instead of ${p.endBefore}.` : `It ends on ${p.endOn}.`}</p>
            </>
          )}
          {show ? (
            <div className="rec-results" aria-live="polite">
              <p className="rec-sprint-line">
                {view.average ? <>Your average performance score so far is <span className="sprint-figure">{view.average}</span>.</> : 'No week of this sprint has a score yet.'}
              </p>
            </div>
          ) : (
            <div className="rec-results">
              <p className="rec-sprint-line">Your scores and standards are hidden until you’re back.</p>
              <Button variant="text" onClick={() => setShow(true)}>Show my results</Button>
            </div>
          )}
        </div>
      </div>
      <RecoveryLinks
        className="rec-links"
        links={[
          { label: 'Add a few more days', onClick: onMore },
          { label: 'Ready to go again', onClick: onReady, disabled: working },
          { label: 'Open my recovery day', onClick: onToday },
        ]}
      />
    </>
  );
}
