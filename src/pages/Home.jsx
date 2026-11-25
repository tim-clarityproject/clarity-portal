import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { alreadyOn } from '../components/SiteMenu';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import DesignHeader from '../components/DesignHeader';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import useCoachingNews from './coaching/useCoachingNews';
import { useAgreementWaiting } from './coaching/agreementData';
import HomeOwnSuggestion from '../components/ownQuestions/HomeOwnSuggestion';
import { useStartChat } from '../components/coach/startChat';
import {
  AddLink,
  Button,
  Card,
  CarryOnList,
  Collapsible,
  DayFocus,
  Dropdown,
  Empty,
  ErrorMessage,
  HelpList,
  Loading,
  MoreLink,
  OfferRow,
  PageOpening,
  PerformanceSystem,
  PlanSteps,
  QuickAdd,
  QuietLines,
  Row,
  SaveStatus,
  SystemLink,
  TodoList,
  TodoRow,
  TravelTodayCard,
  dayTitle,
  useOffer,
  useToast,
} from '../components/design';
import { TODO_NEEDS } from '../components/design/TodoPanels';
import { HOME, homeLine } from '../content/pageLines/client';
import Preparing from './Preparing';
import { comingSessions, homeNeeds, homeUpcoming, sessionWhen } from '../lib/performance/homeCards';
import { loadMySessions } from '../lib/coach/bookingActions';
import { useAgreements } from './coaching/agreementData';
import { nextInvoice, showsBilling } from '../lib/coaching/agreementRules';
import { useClientPreparing } from '../lib/clientPreparing';
import { getLocalDateKey } from '../lib/dateFormatter';
import { readCache, useCachedLoad } from '../lib/pageCache';
import { useDraft } from '../lib/drafts';
import { deviceKey, readJson, writeJson } from '../lib/deviceStore';
import { refreshPins, updatePreference, usePreferences } from '../lib/menuPins';
import { carryOnItems, carryOnWhen } from '../lib/carryOn';
import { parseDbTimestamp } from '../lib/dateFormatter';
import { loadCheckins, loadHomeDay } from '../lib/performance/api';
import { useRecoveryPage, useSprintPage } from '../lib/performance/hooks';
import {
  addDayKey,
  checkinPrompt,
  dayPicks,
  EVENING_FROM,
  TIMES,
  dayStrategyNames,
  homeGreeting,
  homePerson,
  RECOVERY_NUMBERS_LINE,
  dayState,
  homeSuggestion,
  NOT_TONIGHT_PREF,
  notTonightNights,
  withNotTonight,
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
import { readDayChoices, refreshDayChoices } from '../lib/performance/dayPlanHabits';
import { finishedNights, refreshWindDown } from '../lib/performance/windDownStore';
import { DayRow, WeekRow } from './performance/LogRows';
import { RecoveryDay } from './performance/Recovery';
import { useSprintActions } from './performance/sprintActions';
import { usePeakMoments } from '../lib/peakMoments/store';
import { homeCard as peakHomeCard, onBreak as peakOnBreak } from '../lib/peakMoments/model';
import { OFFER_GONE, PATH as TRAVEL_PATH, TIME as TRAVEL_TIME, tickKey, travelOffers, travelToday } from '../lib/travel/model';
import { cleanOffer, offersFrom } from '../lib/offers';
import { setTick, ticksOn, useTravelPlans } from '../lib/travel/store';
import { deviceZone } from '../lib/time/index.js';
import './performance/performance.css';
import './home.css';

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
// Log today, Daily plan, Daily review and Add a to-do are never more
// than two taps from Home (experience rule 21). In Recovery, Home shrinks
// to the basics (M15). A first visit after a gap of 7 days says "Good to
// see you." (experience rule 18); the first day back from a Recovery says
// "Welcome back." (M15). Data that doesn't exist yet (coach notes,
// coaching sessions, agreements) shows nothing; the check-in (Phase 5)
// shows its line while due.

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

  // A brand-new client whose coach hasn't set anything up yet (polish 1): the welcome alone, and
  // the menu shows Home and My Account only (src/lib/clientPreparing.js).
  const prep = useClientPreparing(userId);

  let body;
  if (prep.preparing) {
    body = <Preparing firstName={sprint.data?.firstName || ''} coachName={prep.coachName} />;
  } else if ((!sprint.data && sprint.loading) || (!day.data && day.loading)) {
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
      <div className="home-page">
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
  const [systemOpen, setSystemOpen] = useState(false);
  const [panel, setPanel] = useState(null); // 'todo'
  const [todoForm, setTodoForm] = useState(() => emptyTodo(null));
  const [notTonight, addNotTonight] = useDeviceList(userId, 'wind-down-not-tonight');
  const [notNow, addNotNow] = useDeviceList(userId, 'quiet-not-now');
  // Something new from their coach (an invite, a request, cover, a recap): one quiet line to the Coaching page.
  const coachingNew = useCoachingNews(userId, { today, now });
  // A coaching agreement waiting to be signed (Phase 6b run 1, M13 A1): one row until it's signed.
  const agreementWaiting = useAgreementWaiting(userId);
  // A peak moment's Not now (M18): "We’ll ask again tomorrow.", so it is kept with today's date.
  const [peakNotNow, addPeakNotNow] = useDeviceList(userId, 'peak-not-now');
  const peak = usePeakMoments(userId);
  // The Travel plan (M21): its offer a week before a peak moment in another
  // time zone, and today's steps during the trip, ticked privately.
  const travel = useTravelPlans(userId, peak.moments);
  const travelDay = useMemo(() => travelToday(travel.plans, peak.moments, today), [travel.plans, peak.moments, today]);
  // One trip at a time, the nearest not yet taken or stopped (each is offered once).
  const offerPrefs = offersFrom(usePreferences(userId));
  const tripOffer = useMemo(() => travelOffers(peak.moments, travel.plans, today, deviceZone())
    .find((o) => { const st = cleanOffer(offerPrefs[o.key]); return !st.never && !st.taken; }) || null, [peak.moments, travel.plans, today, offerPrefs]);
  const tripOfferState = useOffer(tripOffer?.key || 'travel-offer:none', { blocked: !tripOffer });
  const logRef = useRef(null);
  // The Hardware and Software check-in's line while it's due (Phase 5),
  // from the check-in's own copy on the device, which it updates when
  // finished, so the line goes at once, offline too.
  const checkins = useCachedLoad({ userId, name: 'checkins', load: () => loadCheckins(userId) });

  // Choices made and wind-downs finished on another device, once migration
  // 039 has run (nothing until then): read quietly, shown when they differ.
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    let live = true;
    const bump = (changed) => { if (live && changed) setFresh((n) => n + 1); };
    refreshDayChoices(userId, today).then(bump);
    refreshWindDown(userId, { since: addDayKey(today, -1) }).then(bump);
    return () => { live = false; };
  }, [userId, today]);

  // "Not tonight" tapped on another device (Tim, 10 Nov): the evenings are
  // in the account's page settings, read when Home opens and each time it
  // comes back to the screen (at most every half a minute after the first).
  const awayNights = notTonightNights(usePreferences(userId)?.[NOT_TONIGHT_PREF]);
  useEffect(() => {
    if (!userId) return undefined;
    refreshPins(userId, { force: true });
    const onShow = () => { if (document.visibilityState === 'visible') refreshPins(userId); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [userId]);
  const notTonightHere = (night) => {
    addNotTonight(night); // gone at once on this device, offline too
    // Kept on this device either way; sent when the connection is back.
    updatePreference(userId, NOT_TONIGHT_PREF, (saved) => withNotTonight(saved, night)).catch(() => null);
  };

  const recovery = openRecovery(d.recoveries || []);
  const coach = day.coach?.firstName || null;
  const checkin = checkins.data ? checkinPrompt({ hasCoach: Boolean(coach), coachName: coach, checkins: checkins.data, today }) : null;
  const steps = planSteps({
    mission: day.plan?.mission,
    objectives: day.objectives || 0,
    strategies: (day.strategies || []).length,
    sprint: (day.lastSprintNumber || 0) > 0,
  });
  const person = homePerson({ sprintView: view, recovery, steps });
  const running = view?.state === 'running';
  // What's been done today, from the database or, sooner, from Daily plan's
  // and Daily review's own copies on this device (finished a moment ago,
  // offline too).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo(() => ({
    plan: readCache(userId, `day-plan:${today}`)?.v?.dayPlan || null,
    review: readCache(userId, `day-review:${today}`)?.v?.dayReview || null,
  }), [userId, today, location.key]);
  const dayPlanned = day.dayPlan?.status === 'finished' || local.plan?.status === 'finished';
  const localReviewed = local.review?.status === 'finished';
  const reviewed = day.dayReview?.status === 'finished' || localReviewed;
  const state = dayState({ hour, dayPlanned, reviewed, yesterday: day.yesterday || {} });
  const tomorrowList = reviewed
    ? (localReviewed ? local.review.tomorrow : day.dayReview?.tomorrow)
    : day.yesterday?.tomorrow;

  const peakCard = peakHomeCard(peak.moments, peak.reviews, today, peakNotNow.filter((k) => k.startsWith(`${today}|`)).map((k) => k.slice(today.length + 1)));
  const card = homeSuggestion({
    peak: peakCard,
    onBreak: Boolean(peakOnBreak(peak.moments, today)),
    today,
    hour,
    minute,
    person,
    sprintView: view,
    hasCoach: Boolean(coach),
    dayPlanned,
    reviewed,
    yesterday: day.yesterday,
    // Not tonight, or used tonight (Sleep wind down's own record of the night).
    windDown: { dismissed: [...notTonight, ...awayNights, ...finishedNights(userId)] },
    recovery,
    nextSprint: (day.lastSprintNumber || 0) + 1,
    firstCheckin: checkin?.first ? checkin : null,
    // Anything timed takes its turn on the one card (Tim, 5 Nov).
    checkin: person !== 'new' ? checkin : null,
    tomorrow: tomorrowList,
    reviewTo: reviewed ? '/daily-review' : `/daily-review/${addDayKey(today, -1)}`,
  });
  const joined = user?.created_at ? Math.floor((now - parseDbTimestamp(user.created_at)) / 86400000) : 0;
  const quiet = quietLines({ person, hasCoach: Boolean(coach), mission: day.plan?.mission, joinedDaysAgo: joined, dismissed: notNow, coaching: coachingNew });

  // Coming back: the first day back from a Recovery (M15), or the first
  // visit after a gap of 7 days with nothing logged, planned or reviewed.
  const welcomeBack = person !== 'recovery' && Boolean(backToday(d.recoveries || [], today));
  const comingBack = !welcomeBack && person !== 'new' && isComingBack(lastActiveBefore(day.lastActive || [], today), today);
  const firstName = d.firstName || '';
  const named = (words) => (firstName ? `${words}, ${firstName}` : words);
  // The day's done (Tim, 5 Nov): "Your day's done, Sam." at any time of day.
  const dayDone = state === 'reviewed' && person !== 'recovery' && person !== 'new';
  const title = welcomeBack ? named('Welcome back') : comingBack ? named('Good to see you') : dayDone ? named('Your day’s done') : named(homeGreeting(hour));

  // Today's to-dos: the day's picks from Daily plan, highest priority first
  // (the habits and order as kept on the device; dayPlanHabits.js).
  // Read again when another device's choices arrive (fresh).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const choices = useMemo(() => readDayChoices(userId, today), [userId, today, fresh]);
  const { picks, top } = dayPicks(day.dayTodos || [], choices);
  const items = running && dayPlanned ? todayItems({ picks, top, sprintView: view, todos: d.todos || [], strategies: d.strategies || [] }) : [];
  const { daily, weekly } = splitHabits(d, view);

  // Carry on: half-finished tools on this device, except the one suggested now.
  const carry = useMemo(
    () => carryOnItems(userId, {
      today,
      yesterday: addDayKey(today, -1),
      exclude: card?.action?.to ? [card.action.to] : [],
      finished: [
        dayPlanned ? 'plan-my-day' : null,
        reviewed ? `review-my-day:${today}` : null,
        day.yesterday?.reviewed ? `review-my-day:${addDayKey(today, -1)}` : null,
      ].filter(Boolean),
    }),
    // Read again when the moment changes or Home is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, today, card?.key, location.key, dayPlanned, reviewed, day.yesterday?.reviewed],
  );

  // Add to-do: the sprint page's own panel and save (one way to save), with its draft.
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

  // Home's links come back to Home when the tool ends (Set my day, Close my day).
  // A second quick tap goes to the page the first already opened (break-it tester, 3 Nov).
  const go = (to) => navigate(to, { replace: alreadyOn(to), state: { from: '/welcome' } });
  const cardAction = card?.action ? { label: card.action.label, onClick: () => (card.action.jump ? jumpToLog() : go(card.action.to)) } : null;
  const cardLink = card?.notTonight
    ? { label: 'Not tonight', onClick: () => { notTonightHere(card.notTonight); toast.show('You can wind down tomorrow evening.'); } }
    : card?.notNow ? { label: 'Not now', onClick: () => { addPeakNotNow(`${today}|${card.notNow}`); toast.show('We’ll ask again tomorrow.'); } }
    : card?.link ? { label: card.link.label, onClick: () => go(card.link.to) } : null;

  const zone = deviceZone();
  const strategies = (d.strategies || []).map((s) => ({ value: s.id, label: s.name }));
  const hasPlan = person !== 'new';

  // What needs you and Upcoming (Polish 1, example-pages-25nov.html): what's waiting on the
  // person, and what's coming, from the reads the portal already makes (each from the device's
  // copy first).
  const coached = Boolean(coach);
  const sessions = useCachedLoad({ userId: coached ? userId : null, name: 'home-sessions', load: () => loadMySessions() });
  const coming = useMemo(() => comingSessions(sessions.data?.data, now), [sessions.data, now]);
  const money = useAgreements(userId);
  const invoice = showsBilling(money.data) ? nextInvoice(money.data.invoices) : null;
  // A session's prep, from the Coaching page's own copy on the device (read again when its news changes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prepWritten = useMemo(() => Boolean(readCache(userId, 'coaching')?.v?.prep?.body), [userId, coachingNew, location.key]);
  const needs = homeNeeds({
    agreement: agreementWaiting ? { id: agreementWaiting.id, sentDay: agreementWaiting.sentAt ? getLocalDateKey(parseDbTimestamp(agreementWaiting.sentAt)) : null } : null,
    invoice,
    checkin: person !== 'new' || checkin?.first ? checkin : null,
    sessions: coming,
    prepWritten,
    news: coachingNew,
    today,
    zone,
    now,
  });
  const upcoming = homeUpcoming({ sessions: coming, sprint: running ? { name: view.name, endsOn: view.dates?.end } : null, today, zone, now });
  const line = homeLine({ needs: needs.length, session: coming[0] ? sessionWhen(coming[0].starts_at, zone, now) : null, coached });

  // Quick Add for Today (rule 10): the name first; the Strategy and the week once something is typed.
  const [quickNeeds, setQuickNeeds] = useState(false);
  const quickAdd = async () => {
    const form = { ...todoForm, week: todoForm.week ?? view.current };
    if (!form.text.trim() || !form.strategyId) { setQuickNeeds(true); return; }
    setQuickNeeds(false);
    await addTodo(form);
  };
  const quickOpen = panel === 'todo';
  const openQuick = () => {
    if (quickOpen) { setPanel(null); return; }
    setTodoForm((f) => (f.text ? f : emptyTodo(view.current)));
    setQuickNeeds(false);
    setPanel('todo');
  };

  // The one main button is the suggestion for now (homeSuggestion); its second way out, if any, sits beside it.
  const opening = (
    <PageOpening
      label={dayTitle(today)}
      title={title}
      line={(welcomeBack || comingBack) ? `${line} Let’s start with this week.` : line}
      action={(cardAction || (cardLink && card?.action)) ? (
        <div className="home-act">
          {cardAction && <Button variant="primary" onClick={cardAction.onClick}>{cardAction.label}</Button>}
          {cardAction && cardLink && <MoreLink bare onClick={cardLink.onClick}>{cardLink.label}</MoreLink>}
        </div>
      ) : null}
    />
  );

  const needsCard = (
    <Card label={HOME.needsLabel} link={{ children: HOME.needsAll, onClick: () => go('/coaching') }} className="home-needs">
      {needs.length
        ? needs.map((n) => <Row key={n.key} name={n.name} value={n.value} onClick={() => go(n.to)} />)
        : <Empty>{HOME.needsNone}</Empty>}
    </Card>
  );
  const upcomingCard = (
    <Card label={HOME.upcomingLabel} link={coached ? { children: HOME.upcomingAll, onClick: () => go('/coaching') } : undefined} className="home-upcoming">
      {upcoming.length
        ? upcoming.map((u) => <Row key={u.key} name={u.name} value={u.value} />)
        : <Empty>{HOME.upcomingNone}</Empty>}
    </Card>
  );

  const todayCard = hasPlan && person !== 'recovery' ? (
    <Card
      label={HOME.todayLabel}
      className="home-today"
      add={running ? <AddLink label={HOME.addLabel} onClick={openQuick} expanded={quickOpen} controls="home-quick-add" /> : undefined}
      quickAdd={running ? (
        <QuickAdd id="home-quick-add" open={quickOpen} onClose={() => setPanel(null)} onAdd={quickAdd} label={HOME.addLabel}>
          <input
            className="ds-qa-box"
            value={todoForm.text}
            placeholder="What do you need to do?"
            aria-label="What needs doing?"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
            onChange={(e) => setTodoForm((f) => ({ ...f, text: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); quickAdd(); }
              if (e.key === 'Escape') { e.preventDefault(); setPanel(null); }
            }}
          />
          {quickNeeds && !todoForm.text.trim() && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.text}</ErrorMessage></div>}
          {(todoForm.text.trim() || quickNeeds) && (
            <div className="home-qa-more">
              <Dropdown label="Which Strategy does it serve?" options={strategies} value={todoForm.strategyId} onChange={(strategyId) => setTodoForm((f) => ({ ...f, strategyId }))} placeholder="Choose a Strategy" />
              {quickNeeds && !todoForm.strategyId && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.strategy}</ErrorMessage></div>}
              <Dropdown label="Which week?" options={view.weekOptions} value={todoForm.week ?? view.current} onChange={(week) => setTodoForm((f) => ({ ...f, week }))} />
            </div>
          )}
        </QuickAdd>
      ) : null}
    >
      {running && dayPlanned && <DayFocus way={day.dayPlan?.way_of_being || ''} strategies={dayStrategyNames(day.dayStrategies || [], d.strategies || [])} />}
      {/* Two taps from Home, always (experience rule 21). Planning after reviewing isn't offered for the
          same day, and the done card has "Edit my review" (Tim, 5 Nov). */}
      {!dayDone && <Row name="Daily plan" value={dayPlanned ? 'Done' : TIMES.planMyDay} onClick={() => go('/daily-plan')} />}
      {card?.key !== 'done' && <Row name="Daily review" value={reviewed ? 'Done' : hour < EVENING_FROM ? 'This evening' : TIMES.reviewMyDay} onClick={() => go('/daily-review')} />}
      {items.length > 0 && (
        <TodoList label="Today’s to-dos" className="home-todos">
          {items.map((x) => (x.kind === 'todo' ? (
            <TodoRow
              key={x.key}
              text={x.text}
              strategyName={x.strategyName}
              important={x.top}
              done={x.done}
              onToggle={(done) => actions.toggleTodo(x.row, done)}
            />
          ) : (
            <TodoRow
              key={x.key}
              text={x.text}
              strategyName={x.strategyName}
              important={x.top}
              tags={[x.line]}
              done={x.done}
              plain={x.habit.measure !== 'yes_no_weekly'}
              onToggle={(done) => actions.tickWeekly(x.habit, done)}
            />
          )))}
        </TodoList>
      )}
    </Card>
  ) : null;

  const logCard = running && person !== 'recovery' ? (
    <section ref={logRef} id="log-today" className="ds-card sprint-anchor home-log" aria-labelledby="home-log-title">
      <div className="ds-card-head">
        <h2 className="ds-label" id="home-log-title" tabIndex={-1}>{HOME.logLabel}</h2>
        <span className="home-log-right">
          <SaveStatus state={actions.save} />
          <MoreLink small onClick={() => go('/performance-sprint')}>{HOME.logLink}</MoreLink>
        </span>
      </div>
      {!view.todayIsWorking && (
        <div className="sprint-dayoff">
          <p>Today is a day off, so nothing is expected.</p>
          <p>You can still log anything you did.</p>
        </div>
      )}
      {daily.map((h) => (
        <DayRow key={h.id} quiet habit={h} view={view} typed={actions.typed} onLog={actions.putLog} onType={actions.typeNumber} onLeave={actions.leaveNumber} onTick={actions.tickWeekly} />
      ))}
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
      {!view.habits.length && <Empty>This sprint has no habits to log.</Empty>}
      {view.soFar && (
        <Row name="Performance score this week" value={`${view.soFar.value}%${view.usualLine.ready ? `, usually ${view.usualLine.figure}` : ''}`} onClick={() => go('/performance-sprint')} className="home-score" />
      )}
    </section>
  ) : null;

  return (
    <>
      {opening}
      {/* One quiet link, shown once, under the opening: the question the coach suggested (run 7). */}
      {person !== 'recovery' && <HomeOwnSuggestion userId={userId} />}
      <QuietLines
        items={quiet.filter((q) => q.key !== 'coaching').map((q) => ({
          key: q.key,
          lines: q.lines,
          action: { label: q.action.label, onClick: () => go(q.action.to) },
          time: q.time,
          onDismiss: q.dismissable ? () => { addNotNow(q.key); toast.show('We won’t ask again.'); } : undefined,
        }))}
      />

      {tripOffer && tripOfferState.show && person !== 'recovery' && (
        <OfferRow
          className="home-offer"
          action={tripOffer.action}
          detail={TRAVEL_TIME}
          onTake={() => { tripOfferState.take(); go(`${TRAVEL_PATH}/new?moment=${encodeURIComponent(tripOffer.moment.id)}`); }}
          // Offered once (M21): Not now ends it for this trip.
          onNotNow={() => { tripOfferState.stop(); toast.show(OFFER_GONE); }}
        />
      )}
      {travelDay && travelDay.steps.length > 0 && (
        <TravelTodayCard
          line={travelDay.day.line}
          steps={travelDay.steps}
          ticks={ticksOn(travel.state, travelDay.plan.id, today)}
          keyOf={tickKey}
          onTick={(step, on) => { setTick(userId, travelDay.plan.id, today, tickKey(step), on).catch(() => null); }}
          onOpen={() => go(travelDay.view.short ? `${TRAVEL_PATH}/${travelDay.plan.id}` : `${TRAVEL_PATH}/${travelDay.plan.id}/day/${today}`)}
        />
      )}

      {/* The day's done: tomorrow's priorities, with Edit my review (Tim, 5 Nov). */}
      {card && !card.action && (card.list?.length || card.lines?.length) ? (
        <Card label={card.label || 'For now'} className="home-done">
          {(card.list || []).map((item, i) => <Row key={`${i}:${item}`} name={item} />)}
          {(card.lines || []).map((l) => <p key={l} className="home-card-line">{l}</p>)}
          {cardLink && <MoreLink onClick={cardLink.onClick}>{cardLink.label}</MoreLink>}
        </Card>
      ) : null}

      {/* Recovery leads with what's true today (Tim, 5 Nov, 11:09). */}
      {person === 'recovery' && recovery && <p className="home-line home-recovery-line">{RECOVERY_NUMBERS_LINE}</p>}
      {person === 'recovery' && recovery && <RecoveryBasics userId={userId} today={today} />}

      <div className="ds-cols ds-cols--needs-first home-cols">
        <div>
          {logCard}
          {todayCard}
          {person === 'new' && (
            <Card label="Your plan" className="home-plan">
              {coach && <p className="home-card-line">You’ll build your plan with your coach in your first session.</p>}
              <PlanSteps steps={steps} />
              {/* M2: Start on my own (coaching clients), then How the system fits together. */}
              <div className="home-links">
                {coach && <Button variant="text" onClick={() => go('/performance-plan/build')}>Start on my own</Button>}
                <SystemLink onClick={() => setSystemOpen(true)} />
              </div>
            </Card>
          )}
          <CarryOnList
            items={carry.map((x) => ({ key: x.key, title: x.title, date: carryOnWhen(x.at, today), onClick: () => go(x.to) }))}
          />
          <div className="home-help">
            <MoreLink onClick={() => setHelpOpen(true)}>Get help with something</MoreLink>
          </div>
        </div>
        <div>
          {needsCard}
          {upcomingCard}
        </div>
      </div>

      <HelpList
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        items={HELP.map((h) => ({ ...h, onClick: () => { setHelpOpen(false); go(h.to); } }))}
        coach={startChat ? coach : null}
        onChat={() => { setHelpOpen(false); startChat?.(); }}
      />
      {person === 'new' && <PerformanceSystem open={systemOpen} onClose={() => setSystemOpen(false)} />}
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
