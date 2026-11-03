import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import DesignHeader from '../components/DesignHeader';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { useStartChat } from '../components/coach/startChat';
import {
  AddButton,
  AddTodoPanel,
  Button,
  CarryOnList,
  Collapsible,
  DayFocus,
  HelpList,
  Loading,
  MiniDial,
  PageHeader,
  PlanSteps,
  QuietLines,
  SaveStatus,
  Section,
  SuggestionCard,
  TodoList,
  TodoRow,
  WeekLine,
  WhoSees,
  useToast,
} from '../components/design';
import { useCachedLoad } from '../lib/pageCache';
import { useDraft } from '../lib/drafts';
import { deviceKey, readJson, writeJson } from '../lib/deviceStore';
import { carryOnItems, carryOnWhen } from '../lib/carryOn';
import { parseDbTimestamp } from '../lib/dateFormatter';
import { loadHomeDay } from '../lib/performance/api';
import { useRecoveryPage, useSprintPage } from '../lib/performance/hooks';
import {
  addDayKey,
  dayName,
  dayPicks,
  dayStrategyNames,
  homeGreeting,
  homePerson,
  homeSuggestion,
  isComingBack,
  lastActiveBefore,
  localToday,
  openRecovery,
  planSteps,
  quietLines,
  recoveryView,
  splitHabits,
  sprintPageView,
  todayItems,
  weeklyFoldLine,
  backToday,
} from '../lib/performance';
import { DayRow, WeekRow } from './performance/LogRows';
import { RecoveryDay } from './performance/Recovery';
import { useSprintActions } from './performance/sprintActions';
import './performance/performance.css';

// Home as Today (mock-up M2, approved by Tim on 23 Oct; Phase 4 step 2;
// read in full with its notes and switches). Top to bottom: the greeting,
// the mini dial with the date and "Week 4 of 8" (the date alone with no
// sprint running), one Suggested for now card that changes through the
// day (src/lib/performance/home.js), at most two quiet lines, "Carry on
// where you left off", Today (how you want to be today, today's Strategy,
// the day's to-dos with the highest priority first, Log today with the
// daily habits and the weekly ones folded into one This week line), the
// week's performance score with the usual range, then "I need help with
// something".
//
// Logging and to-dos are the sprint page's own (sprintActions.js and the
// sprint's copy on the device), so a change on one shows on the other at
// once, offline too, through the same offline queue and version check.
// Log today, Plan my day, Review my day and Add a to-do are never more
// than two taps from Home (experience rule 21). In Recovery, Home shrinks
// to the basics (M15). A first visit after a gap of 7 days says "Good to
// see you." (experience rule 18); the first day back from a Recovery says
// "Welcome back." (M15). Data that doesn't exist yet (coach notes,
// coaching sessions, the first check-in, agreements) shows nothing.

const emptyTodo = (week) => ({ text: '', strategyId: null, impact: 2, week });
const MINUTE_MS = 60000;

// The help list (M2 HELP): situations in plain words, each naming its tool.
const HELP = [
  { situation: 'I’m under pressure', tool: 'Pressure plan', to: '/pressure-plan' },
  { situation: 'I’ve got a hard conversation coming up', tool: 'Give difficult feedback', to: '/give-difficult-feedback' },
  { situation: 'I’m stuck on a decision', tool: 'Get unstuck', to: '/get-unstuck' },
  { situation: 'I want a meeting to go well', tool: 'Meeting planner', to: '/plan-meeting' },
  { situation: 'I need a moment to reset', tool: 'Breathe', to: '/breathe' },
];

/** The clock, once a minute, so the suggestion changes through the day while Home is open. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** A list of keys kept on this device (Not tonight, Not now). */
function useDeviceList(userId, name) {
  const key = userId ? deviceKey('home', userId, name) : null;
  const [list, setList] = useState(() => (key ? readJson(key) || [] : []));
  const add = (value) => {
    const next = [...list.filter((v) => v !== value), value].slice(-14);
    setList(next);
    if (key) writeJson(key, next);
  };
  return [list, add];
}

export default function Home() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const now = useNow();
  const today = localToday(undefined, now);
  const sprint = useSprintPage(userId);
  const day = useCachedLoad({ userId, name: `home-day:${today}`, load: () => loadHomeDay(userId, today), deps: [today] });
  const view = useMemo(() => (sprint.data ? sprintPageView(sprint.data, { today }) : null), [sprint.data, today]);

  let body;
  if ((!sprint.data && sprint.loading) || (!day.data && day.loading)) {
    body = <Loading label="Loading your day" className="ds-loading--page" />;
  } else if (!sprint.data || !day.data) {
    // Nothing on the device yet and no connection: the plain Home still helps.
    body = <TodayBody userId={userId} user={user} now={now} today={today} sprint={{ data: { recoveries: [] }, setData: () => {} }} view={null} day={{}} />;
  } else {
    body = <TodayBody userId={userId} user={user} now={now} today={today} sprint={sprint} view={view} day={day.data} />;
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page home-page">
        <EmailVerificationBanner />
        {body}
      </div>
    </div>
  );
}

function TodayBody({ userId, user, now, today, sprint, view, day }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const startChat = useStartChat();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const d = sprint.data || {};
  const actions = useSprintActions({ userId, data: d, setData: sprint.setData, view, today });
  const [helpOpen, setHelpOpen] = useState(false);
  const [panel, setPanel] = useState(null); // 'todo'
  const [todoForm, setTodoForm] = useState(() => emptyTodo(null));
  const [notTonight, addNotTonight] = useDeviceList(userId, 'wind-down-not-tonight');
  const [notNow, addNotNow] = useDeviceList(userId, 'quiet-not-now');
  const logRef = useRef(null);

  const recovery = openRecovery(d.recoveries || []);
  const coach = day.coach?.firstName || null;
  const steps = planSteps({
    mission: day.plan?.mission,
    objectives: day.objectives || 0,
    strategies: (day.strategies || []).length,
    sprint: (day.lastSprintNumber || 0) > 0,
  });
  const person = homePerson({ sprintView: view, recovery, steps });
  const running = view?.state === 'running';
  const dayPlanned = day.dayPlan?.status === 'finished';
  const reviewed = day.dayReview?.status === 'finished';

  const card = homeSuggestion({
    today,
    hour,
    minute,
    person,
    sprintView: view,
    hasCoach: Boolean(coach),
    dayPlanned,
    reviewed,
    yesterday: day.yesterday,
    windDown: { dismissed: notTonight },
    recovery,
    nextSprint: (day.lastSprintNumber || 0) + 1,
  });
  const joined = user?.created_at ? Math.floor((now - parseDbTimestamp(user.created_at)) / 86400000) : 0;
  const quiet = quietLines({ person, hasCoach: Boolean(coach), mission: day.plan?.mission, joinedDaysAgo: joined, dismissed: notNow });

  // Coming back: the first day back from a Recovery (M15), or the first
  // visit after a gap of 7 days with nothing logged, planned or reviewed.
  const welcomeBack = person !== 'recovery' && Boolean(backToday(d.recoveries || [], today));
  const comingBack = !welcomeBack && person !== 'new' && isComingBack(lastActiveBefore(day.lastActive || [], today), today);
  const firstName = d.firstName || '';
  const named = (words) => (firstName ? `${words}, ${firstName}` : words);
  const title = welcomeBack ? named('Welcome back') : comingBack ? named('Good to see you') : named(homeGreeting(hour));

  // Today's to-dos: the day's picks from Plan my day, highest priority first.
  const local = useMemo(() => (userId ? readJson(deviceKey('day-plan-local', userId, today)) || {} : {}), [userId, today]);
  const { picks, top } = dayPicks(day.dayTodos || [], local);
  const items = running && dayPlanned ? todayItems({ picks, top, sprintView: view, todos: d.todos || [], strategies: d.strategies || [] }) : [];
  const { daily, weekly } = splitHabits(d, view);

  // Carry on: half-finished tools on this device, except the one suggested now.
  const carry = useMemo(
    () => carryOnItems(userId, { today, yesterday: addDayKey(today, -1), exclude: card?.action?.to ? [card.action.to] : [] }),
    // Read again when the moment changes or Home is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, today, card?.key, location.key],
  );

  // Add a to-do: the sprint page's own panel and save (one way to save), with its draft.
  const { clear: clearTodoDraft } = useDraft({
    userId,
    name: `home-todo:${view?.sprintId || 'none'}`,
    value: panel === 'todo' ? todoForm : null,
    ready: running,
    onRestore: (x) => { if (x?.text) { setTodoForm(x); setPanel('todo'); } },
  });
  const addTodo = async (form) => {
    setPanel(null);
    setTodoForm(emptyTodo(view.current));
    clearTodoDraft();
    if (!(await actions.addTodo(form))) {
      setTodoForm(form);
      setPanel('todo');
    }
  };

  const jumpToLog = () => {
    logRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    logRef.current?.querySelector('h3')?.focus({ preventScroll: true });
  };
  // The menu's Log today (/welcome#log-today) lands on Log today, once it shows.
  const logShown = running;
  useEffect(() => {
    if (location.hash !== '#log-today' || !logShown || !logRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      jumpToLog();
      navigate(`${location.pathname}${location.search}`, { replace: true, state: location.state });
    });
    return () => cancelAnimationFrame(frame);
    // jumpToLog only reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, location.key, logShown]);
  // Log today with no sprint running: say so, rather than land nowhere.
  useEffect(() => {
    if (location.hash !== '#log-today' || logShown || !view) return;
    toast.show('Log today opens once a Performance Sprint is running.');
    navigate(`${location.pathname}${location.search}`, { replace: true, state: location.state });
    // Once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash, location.key, logShown, view]);

  const go = (to) => navigate(to);
  const cardAction = card?.action ? { label: card.action.label, onClick: () => (card.action.jump ? jumpToLog() : go(card.action.to)) } : null;
  const cardLink = card?.notTonight
    ? { label: 'Not tonight', onClick: () => { addNotTonight(card.notTonight); toast.show('You can wind down tomorrow evening.'); } }
    : null;

  const dateText = dayName(today, today);
  const sprintOn = person === 'sprint' && view && (view.state === 'running' || view.state === 'over');
  const strategies = (d.strategies || []).map((s) => ({ value: s.id, label: s.name }));
  const hasPlan = person !== 'new';

  return (
    <>
      <PageHeader title={title} meta={sprintOn ? [] : [dateText]} />
      {(welcomeBack || comingBack) && <p className="home-welcome">Let’s start with this week.</p>}
      {sprintOn && (
        <MiniDial
          weeks={view.weeks}
          dayInWeek={running ? view.dayInWeek : 6}
          date={dateText}
          line={running ? `Week ${view.current} of ${view.lengthWeeks}` : `${view.name} has ended`}
          label={`${dateText}. ${view.name}${running ? `, week ${view.current} of ${view.lengthWeeks}` : ''}. Open the Performance Sprint.`}
          onClick={() => go('/performance-sprint')}
        />
      )}

      {card && (
        <SuggestionCard
          className="home-suggest"
          label={card.label}
          question={card.question}
          lines={card.lines}
          time={card.time}
          action={cardAction}
          link={cardLink}
        />
      )}
      <QuietLines
        items={quiet.map((q) => ({
          key: q.key,
          lines: q.lines,
          action: { label: q.action.label, onClick: () => go(q.action.to) },
          onDismiss: q.dismissable ? () => { addNotNow(q.key); toast.show('We won’t ask again.'); } : undefined,
        }))}
      />

      {person === 'recovery' && recovery && <RecoveryBasics userId={userId} today={today} />}

      {person === 'new' && (
        <Section title="Your plan" className="ipp-section home-section" aside={<WhoSees audience="me" />}>
          {coach && <p className="home-line">You’ll build your plan with your coach in your first session.</p>}
          <PlanSteps steps={steps} />
          {coach && (
            <div className="home-links">
              <Button variant="text" onClick={() => go('/performance-plan/build')}>Start on my own</Button>
            </div>
          )}
        </Section>
      )}

      <CarryOnList
        items={carry.map((x) => ({ key: x.key, title: x.title, date: carryOnWhen(x.at), onClick: () => go(x.to) }))}
      />

      {hasPlan && person !== 'recovery' && (
        <Section title="Today" className="ipp-section home-section home-today" aside={<WhoSees audience="me" />}>
          {running && !dayPlanned && <p className="home-line">Your to-dos for today show here once you’ve planned your day.</p>}
          {running && dayPlanned && (
            <>
              <DayFocus way={day.dayPlan?.way_of_being || ''} strategies={dayStrategyNames(day.dayStrategies || [], d.strategies || [])} />
              {items.length > 0 && (
                <TodoList label="Today’s to-dos" className="home-todos">
                  {items.map((x) => (x.kind === 'todo' ? (
                    <TodoRow
                      key={x.key}
                      text={x.text}
                      strategyName={x.strategyName}
                      lead={x.top ? 'Highest priority' : undefined}
                      done={x.done}
                      onToggle={(done) => actions.toggleTodo(x.row, done)}
                    />
                  ) : (
                    <TodoRow
                      key={x.key}
                      text={x.text}
                      strategyName={x.strategyName}
                      lead={x.top ? 'Highest priority' : undefined}
                      tags={[x.line]}
                      done={x.done}
                      plain={x.habit.measure !== 'yes_no_weekly'}
                      onToggle={(done) => actions.tickWeekly(x.habit, done)}
                    />
                  )))}
                </TodoList>
              )}
            </>
          )}
          {/* Two taps from Home, always (experience rule 21). */}
          <div className="home-links">
            {card?.key !== 'plan' && <Button variant="text" onClick={() => go('/my-day/plan')}>Plan my day</Button>}
            {card?.key !== 'review' && <Button variant="text" onClick={() => go('/my-day/review')}>Review my day</Button>}
          </div>
          {running && (
            <AddButton className="home-add" onClick={() => { setTodoForm((f) => (f.text ? f : emptyTodo(view.current))); setPanel('todo'); }}>
              Add a to-do
            </AddButton>
          )}

          {running && (
            <div ref={logRef} id="log-today" className="sprint-anchor home-log">
              <div className="home-log-head">
                <h3 className="home-log-title" tabIndex={-1}>Log today</h3>
                <SaveStatus state={actions.save} />
              </div>
              {!view.todayIsWorking && (
                <div className="sprint-dayoff">
                  <p>Today is a day off, so nothing is expected.</p>
                  <p>You can still log anything you did.</p>
                </div>
              )}
              {daily.length > 0 && (
                <div className="sprint-habits">
                  {daily.map((h) => (
                    <DayRow key={h.id} habit={h} view={view} typed={actions.typed} onLog={actions.putLog} onType={actions.typeNumber} onLeave={actions.leaveNumber} onTick={actions.tickWeekly} onMore={() => go('/performance-sprint')} />
                  ))}
                </div>
              )}
              {weekly.length > 0 && (
                <div className="home-fold">
                  <Collapsible
                    summary={(
                      <span className="home-fold-head">
                        <span className="home-fold-title">This week</span>
                        <span className="home-fold-line">{weeklyFoldLine(weekly)}</span>
                      </span>
                    )}
                  >
                    <div className="sprint-habits">
                      {weekly.map((h) => (
                        <WeekRow key={h.id} habit={h} view={view} typed={actions.typed} onLog={actions.putLog} onType={actions.typeNumber} onLeave={actions.leaveNumber} onTick={actions.tickWeekly} onMore={() => go('/performance-sprint')} />
                      ))}
                    </div>
                  </Collapsible>
                </div>
              )}
              {!view.habits.length && <p className="ipp-muted sprint-gap">This sprint has no habits to log.</p>}
            </div>
          )}
        </Section>
      )}

      {running && (
        <div className="home-week">
          <WeekLine
            label="Performance score this week"
            figure={view.soFar ? `${view.soFar.value}%` : null}
            good={Boolean(view.soFar?.good)}
            line={view.soFar
              ? `${view.usualLine.lead}${view.usualLine.figure}${view.usualLine.end}`
              : 'Nothing is scored yet this week.'}
            onClick={() => go('/performance-sprint')}
          />
        </div>
      )}

      <div className="home-help">
        <Button onClick={() => setHelpOpen(true)}>I need help with something</Button>
      </div>
      <HelpList
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        items={HELP.map((h) => ({ ...h, onClick: () => { setHelpOpen(false); go(h.to); } }))}
        coach={startChat ? coach : null}
        onChat={() => { setHelpOpen(false); startChat?.(); }}
      />

      {running && (
        <AddTodoPanel
          open={panel === 'todo'}
          onClose={() => setPanel(null)}
          form={{ ...todoForm, week: todoForm.week ?? view.current }}
          onFormChange={setTodoForm}
          strategies={strategies}
          weeks={view.weekOptions}
          onAdd={addTodo}
        />
      )}
    </>
  );
}

/** Recovery on Home (M15): the recovery day's basics, all optional. */
function RecoveryBasics({ userId, today }) {
  const loaded = useRecoveryPage(userId);
  const view = useMemo(() => (loaded.data ? recoveryView(loaded.data, { today }) : null), [loaded.data, today]);
  if (!view || view.state !== 'open' || view.due) return null;
  return (
    <div className="home-recovery">
      <RecoveryDay recovery={{ ...loaded, view, today, userId }} />
    </div>
  );
}
