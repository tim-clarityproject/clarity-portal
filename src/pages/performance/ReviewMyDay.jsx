import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  AddButton,
  AddWinPanel,
  Button,
  EndScreen,
  GuidedSummary,
  GuidedTool,
  LevelChoice,
  List,
  ListRow,
  Loading,
  LoggingRow,
  PageHeader,
  PriorityRows,
  Choice,
  Stat,
  TextBox,
  TodoList,
  TodoRow,
  WhoSees,
  clearGuideDraft,
  useToast,
  LoadError,
  PausedGate,
} from '../../components/design';
import { ONE_TAP_MS } from '../../components/design/GuidedTool';
import { useCachedLoad } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { extrasKnown } from '../../lib/performance/answerExtras';
import { readDayChoices, refreshDayChoices } from '../../lib/performance/dayPlanHabits';
import { friendlyError } from '../../lib/friendlyError';
import { keepForLater, newId, saveOrQueue, useQueueState, useSuperseded } from '../../lib/syncQueue';
import { toStored } from '../../lib/units';
import {
  createDayReview,
  dayReviewAnswersOp,
  habitLogOp,
  loadDayReview,
  loadDayReviewRow,
  loadReviewWhich,
  saveHabitLog,
  saveTodoDone,
  saveWin,
  setWinDeleted,
} from '../../lib/performance/api';
import { useLatestWhenSuperseded } from '../../lib/performance/hooks';
import {
  DIFFERENTLY_EXAMPLE,
  MAX_TOMORROW,
  RECOVERY_DAY_LINE,
  RECOVERY_NUMBERS_LINE,
  REVIEW_EARLY_HOURS,
  REVIEW_TEXT_MAX,
  TOMORROW_EXAMPLE,
  TOMORROW_ITEM_MAX,
  WHERE_MAX,
  addDayKey,
  dayName,
  isDayKey,
  dayReviewStrategyOps,
  dayReviewView,
  habitTickValue,
  howYouWere,
  localToday,
  movedLines,
  movedQuestion,
  reviewAnswersFromRow,
  reviewAnswersToRow,
  reviewDayFor,
  tomorrowToRow,
  recentWays,
  wayQuestion,
  WAY_RATING_OPTIONS,
  wayRatingOption,
  whereQuestion,
} from '../../lib/performance';
import './performance.css';

// Daily review (mock-up M5, version 19, approved by Tim on 23 Oct; read
// in full with its notes). One guided tool, one question per screen on
// phone and desktop, with the % complete bar (the approved rule over M5's
// step list), "~5 minutes" on the first screen and the eye on every answer:
//   Do          "Which of today’s to‑dos did you do?" the morning's picks,
//               highest priority first; "Did you do anything else on this
//               week’s list?" with Show this week's list
//   Be          "On a scale of 1 to 10, how calm under pressure were you
//               today?" then "Where did it show today?"
//   Numbers     "What are today’s numbers?" the habits logged a day at a
//               time, into the sprint's habit logs; one sentence for the
//               weekly habits
//   Went well   "What went well today?" with Add an unplanned win (saved to
//               wins, and by the database to Confidence Bank)
//   Differently "What would you do differently next time?"
//   Strategies  "Which Strategies moved today?" Low, Medium or High inside
//               each, with the morning's reminder
//   Tomorrow    up to three things, as rows (lists are rows), then anything
//               else on your mind; tomorrow's Daily plan lists them
//   Your day    the summary, with the score this week so far
//   Close       "Ready to close the day?" (M19, approved 29 Oct): what
//               moves to tomorrow (today's open to-dos, still on this
//               week's list) and what tomorrow starts with; Close my day
//   Work's done the closing moment (M19): "Work’s done for today", the
//               two lines that are true, and Back to Home
//
// Everything saves as it goes, as Daily plan does: the answers into the
// day's day_reviews row a moment after typing pauses, each tick, log and
// level at once, all through the offline queue (Saving, Will sync, Saved)
// with the version it was based on. Typing is kept as a draft on the
// device and the step is remembered, so a refresh carries on where it was.
// Ticks are the sprint's own rows (todos.done_on, habit_logs), so the
// sprint page and its score see them.
//
// Which day: /my-day/review/:date is that day's review (a past one opens
// on its summary, still changeable). /my-day/review is today's, except
// just after midnight: before 04:00, a day before that was planned and not
// yet reviewed is reviewed instead, with its date in the top bar
// (CHOICE, audit R0; dayReview.js reviewDayFor).

const SAVE_AFTER_MS = 800;
const LOG_AFTER_MS = 700; // a number typed is logged this long after the last key, or on leaving the box
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const cacheName = (date) => `day-review:${date}`;
const draftName = (date) => `day-review:${date}`;
const stepKey = (userId, date) => `day-review-${userId}-${date}`;
// A one-answer choice shows as chosen for a moment before moving on (Tim, 5 Nov).
// One tap moves on: chosen at once, the next screen after 150ms (rule 21, the guided tools' ONE_TAP_MS).
const ADVANCE_MS = ONE_TAP_MS;
const localKey = (userId, date) => deviceKey('day-review-local', userId, date);
const emptyWin = (day) => ({ text: '', strategyIds: [], impact: 2, day });
const toText = (v) => (v == null ? '' : String(v));
const parseTyped = (text) => {
  const t = (text || '').replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function ReviewMyDay() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const params = useParams();
  // The day the page opened on, kept while it stays open: a tool carried
  // past midnight stays on its day (and step) when the page redraws.
  const [today] = useState(() => localToday());
  // Read once: the hour the review was opened decides which day it is for.
  const [early] = useState(() => new Date().getHours() < REVIEW_EARLY_HOURS);
  if (isDayKey(params.date)) return <ReviewLoad userId={userId} date={params.date} today={today} pinned />;
  if (early) return <EarlyReview userId={userId} today={today} />;
  return <ReviewLoad userId={userId} date={today} today={today} />;
}

// Just after midnight: the day before, when it was planned and not yet
// reviewed. Chosen once, so a fresher answer never moves the page.
function EarlyReview({ userId, today }) {
  const yesterday = addDayKey(today, -1);
  const which = useCachedLoad({ userId, name: `day-review-which:${yesterday}`, load: () => loadReviewWhich(userId, yesterday), deps: [yesterday] });
  const [date, setDate] = useState(null);
  if (!date && (which.data || which.error)) {
    setDate(which.data
      ? reviewDayFor({ today, hour: 0, yesterdayPlanned: which.data.planned, yesterdayReviewed: which.data.reviewed })
      : today);
  }
  if (!date) return <div className="ui-root plan-builder-wait"><Loading label="Loading your day" className="ds-loading--page" /></div>;
  return <ReviewLoad userId={userId} date={date} today={today} />;
}

function ReviewLoad({ userId, date, today, pinned = false }) {
  const loaded = useCachedLoad({ userId, name: cacheName(date), load: () => loadDayReview(userId, date), deps: [date] });
  useLatestWhenSuperseded(loaded.reload);
  if (!loaded.data && loaded.error) {
    return (
      <Shell>
        <LoadError>Your day didn’t load. Check your connection and try again.</LoadError>
      </Shell>
    );
  }
  if (!loaded.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your day" className="ds-loading--page" /></div>;
  }
  return <ReviewFlow key={`${userId}:${date}`} userId={userId} date={date} today={today} pinned={pinned} loaded={loaded} />;
}

function Shell({ children }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <PageHeader title="Daily review" />
        {children}
        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-sprint')}>Open my sprint</Button>
        </div>
      </div>
    </div>
  );
}

function ReviewFlow({ userId, date, today, pinned, loaded }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queue = useQueueState();
  const { data, setData } = loaded;

  // The habits chosen for the day in the morning (Daily plan keeps them
  // on the device: no table holds them yet).
  // The habits chosen in the morning (dayPlanHabits.js), another device's
  // too once migration 039 has run.
  const [planLocal, setPlanLocal] = useState(() => readDayChoices(userId, date));
  useEffect(() => {
    let live = true;
    refreshDayChoices(userId, date).then((changed) => { if (live && changed) setPlanLocal(readDayChoices(userId, date)); });
    return () => { live = false; };
  }, [userId, date]);
  // What the device keeps for this review: the habits ticked, the things
  // ticked on this week's list, and the wins added here.
  const [local, setLocalState] = useState(() => readJson(localKey(userId, date)) || {});
  const setLocal = useCallback((fn) => setLocalState((l) => {
    const next = typeof fn === 'function' ? fn(l) : fn;
    writeJson(localKey(userId, date), next);
    return next;
  }), [userId, date]);

  const view = useMemo(() => dayReviewView(data, { date, planLocal, local }), [data, date, planLocal, local]);
  // The way of being: this morning's, or the one chosen here when the day
  // wasn't planned. Saved with the day's review once migration 040 is
  // there (day_reviews.way_of_being), so another device sees it; until
  // then kept on this device (answerExtras.js).
  const way = view.way || data.dayReview?.way_of_being || local.way || '';
  const wayChoices = recentWays(data.earlierWays || [], date);
  const chooseWay = (w) => {
    const next = (w || '').trim().slice(0, 120);
    if (!extrasKnown()) {
      setLocal(({ wayTyped: _typed, ...l }) => ({ ...l, way: next }));
      return;
    }
    setData((d) => ({ ...d, dayReview: { ...(d.dayReview || {}), way_of_being: next || null } }));
    if (local.way !== undefined || local.wayTyped !== undefined) setLocal(({ way: _old, wayTyped: _typed, ...rest }) => rest);
    sent(async () => {
      await ensureReview();
      return saveOrQueue(userId, dayReviewAnswersOp(userId, date, { way_of_being: next || null }));
    });
  };
  const [picking, setPicking] = useState(null);
  const [answers, setAnswers] = useState(() => reviewAnswersFromRow(data.dayReview));
  const [save, setSave] = useState('idle');
  const [showWeek, setShowWeek] = useState(false);
  const [panel, setPanel] = useState(false);
  const [winForm, setWinForm] = useState(() => emptyWin(date));
  const [typed, setTyped] = useState({});

  const reviewId = useRef(data.dayReview?.id || null);
  const creating = useRef(null);
  const typedYet = useRef(false);
  const timer = useRef(null);
  const waiting = useRef(null); // the answers waiting for their delay
  const answersRef = useRef(answers);
  const logTimers = useRef({});
  const logsWaiting = useRef({}); // the logs still waiting for their delay: habit id -> value
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { if (data.dayReview?.id) reviewId.current = data.dayReview.id; }, [data.dayReview?.id]);
  // A fresher copy from the server (the device's showed first): its
  // answers come in, unless something has been typed here already.
  useEffect(() => {
    if (!typedYet.current && data.dayReview?.updated_at) setAnswers(reviewAnswersFromRow(data.dayReview));
  }, [data.dayReview?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Will sync" turns to "Saved" once the queue has sent everything.
  useEffect(() => {
    if (save === 'offline' && queue.waiting === 0 && queue.failed === 0) setSave('saved');
    if (save === 'offline' && queue.failed > 0) setSave('failed');
  }, [save, queue.waiting, queue.failed]);

  // Typing survives a refresh ("Draft restored"); the answers are saved too.
  const { clear: clearAnswersDraft } = useDraft({
    userId,
    name: draftName(date),
    value: answers,
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object') return;
      typedYet.current = true;
      setAnswers((a) => ({ ...a, ...d }));
    },
  });
  const { clear: clearWinDraft } = useDraft({
    userId,
    name: `${draftName(date)}:win`,
    value: panel ? winForm : null,
    ready: true,
    onRestore: (d) => { if (d?.text) { setWinForm(d); setPanel(true); } },
  });

  // ------------------------------------------------------------ saving

  const sent = async (fn) => {
    setSave('saving');
    try {
      const r = await fn();
      if (r?.status === 'superseded') {
        setSave('idle');
        return false;
      }
      setSave((s) => (r?.status === 'queued' || s === 'offline' ? 'offline' : 'saved'));
      return true;
    } catch (e) {
      setSave('idle');
      toast.error(friendlyError(e, SAVE_ERROR));
      return false;
    }
  };

  // The day's review row, made once with its id from the device, so the
  // Strategies that moved can follow it at once, offline too.
  const ensureReview = () => {
    if (reviewId.current) return Promise.resolve(reviewId.current);
    if (!creating.current) {
      creating.current = (async () => {
        const id = newId();
        const r = await createDayReview(userId, id, date);
        let real = id;
        // Already there (another window): use that row.
        if (r?.status === 'saved' && !r.data?.length) real = (await loadDayReviewRow(userId, date))?.id || id;
        reviewId.current = real;
        setData((d) => ({ ...d, dayReview: { ...(d.dayReview || {}), id: real, local_date: date, status: d.dayReview?.status || 'draft' } }));
        return real;
      })().catch((e) => {
        creating.current = null;
        throw e;
      });
    }
    return creating.current;
  };

  const answersOp = (a, extra = {}) => dayReviewAnswersOp(userId, date, { ...reviewAnswersToRow(a), ...extra });

  const sendAnswers = (extra = {}) => {
    clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
    const a = answersRef.current;
    return sent(async () => {
      await ensureReview();
      setData((d) => ({ ...d, dayReview: { ...(d.dayReview || {}), ...reviewAnswersToRow(a), ...extra } }));
      const r = await saveOrQueue(userId, answersOp(a, extra));
      // Saved on the server, with nothing newer typed: the device's draft
      // goes, so a reload shows the saved row, never older typing over a
      // newer save from another window (break-it tester, 5 Nov).
      if (r?.status === 'saved' && answersRef.current === a) clearAnswersDraft();
      return r;
    });
  };

  // Another window saved first ("Showing the latest."): its answers come in
  // here and this window's older typing is set aside, so the next change
  // builds on the latest and never overwrites it unseen.
  useSuperseded(['day_reviews'], () => {
    typedYet.current = false;
    clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
    clearAnswersDraft();
  });

  const change = (patch) => {
    typedYet.current = true;
    setAnswers((a) => ({ ...a, ...patch }));
  };

  // A moment after each change, the answers go to the day's row.
  useEffect(() => {
    if (!typedYet.current) return;
    setSave('saving');
    waiting.current = answers;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendAnswers(), SAVE_AFTER_MS);
    // Only when the answers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Closing or refreshing with answers or numbers still waiting keeps them
  // on the device, sent on the next start; leaving the page sends them now.
  useEffect(() => {
    const takeLogs = () => {
      Object.values(logTimers.current).forEach((t) => clearTimeout(t));
      logTimers.current = {};
      const w = Object.entries(logsWaiting.current);
      logsWaiting.current = {};
      return w;
    };
    const onHide = () => {
      takeLogs().forEach(([id, value]) => keepForLater(userId, habitLogOp(userId, id, date, value)));
      if (!waiting.current || !reviewId.current) return;
      keepForLater(userId, answersOp(waiting.current));
      waiting.current = null;
      clearTimeout(timer.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      takeLogs().forEach(([id, value]) => { saveHabitLog(userId, id, date, value).catch(() => null); });
      if (waiting.current) {
        clearTimeout(timer.current);
        const a = waiting.current;
        waiting.current = null;
        ensureReview().then(() => saveOrQueue(userId, answersOp(a))).catch(() => null);
      }
    };
    // Once, for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ ticks and numbers

  const logNow = (habitId) => (data.logs || []).find((l) => l.sprint_habit_id === habitId && l.local_date === date)?.value ?? null;

  /** One day's log, on the page at once and saved (or queued after a pause). */
  const putLog = (habitId, value, { delay = 0 } = {}) => {
    setData((d) => {
      const others = (d.logs || []).filter((l) => !(l.sprint_habit_id === habitId && l.local_date === date));
      const before = (d.logs || []).find((l) => l.sprint_habit_id === habitId && l.local_date === date);
      return {
        ...d,
        logs: value == null ? others : [...others, { id: before?.id || `device-${habitId}-${date}`, sprint_habit_id: habitId, local_date: date, value, to_confirm: false }],
      };
    });
    clearTimeout(logTimers.current[habitId]);
    const go = () => {
      delete logTimers.current[habitId];
      delete logsWaiting.current[habitId];
      return sent(() => saveHabitLog(userId, habitId, date, value));
    };
    if (!delay) {
      delete logsWaiting.current[habitId];
      return go();
    }
    setSave('saving');
    logsWaiting.current[habitId] = value;
    logTimers.current[habitId] = setTimeout(go, delay);
    return Promise.resolve(true);
  };

  const typeNumber = (h, text) => {
    if (h.measure === 'rating' && text !== '' && !/^[1-5]$/.test(text)) return;
    const shown = parseTyped(text);
    if ((h.measure === 'count' || h.measure === 'count_limit') && shown != null && (!Number.isInteger(shown) || shown > h.top)) return;
    setTyped((t) => ({ ...t, [h.id]: text }));
    const stored = h.measure === 'amount' ? toStored(shown, h.storedUnit, data.personSettings?.units) : shown;
    putLog(h.id, stored, { delay: LOG_AFTER_MS });
  };

  const leaveNumber = (h) => {
    if (logTimers.current[h.id]) {
      const value = logsWaiting.current[h.id];
      clearTimeout(logTimers.current[h.id]);
      delete logTimers.current[h.id];
      delete logsWaiting.current[h.id];
      sent(() => saveHabitLog(userId, h.id, date, value == null ? null : Number(value)));
    }
    setTyped((t) => {
      const next = { ...t };
      delete next[h.id];
      return next;
    });
  };

  const tickTodo = async (item, done) => {
    const doneOn = done ? date : null;
    const listKey = view.running ? 'todos' : 'looseTodos';
    const setDone = (on) => setData((d) => ({ ...d, [listKey]: (d[listKey] || []).map((t) => (t.id === item.id ? { ...t, done_on: on } : t)) }));
    setDone(doneOn);
    const ok = await sent(() => saveTodoDone(userId, item.id, doneOn));
    if (!ok) setDone(done ? null : date);
  };

  // A habit ticked (CHOICE, audit R1; dayReview.js habitTickValue): a count
  // logs one more that day, a once-a-week yes or no logs yes.
  const tickHabit = (item, done, list) => {
    setLocal((l) => (list === 'week'
      ? { ...l, extra: { ...(l.extra || {}), [item.key]: done } }
      : { ...l, habitTicks: { ...(l.habitTicks || {}), [item.id]: done } }));
    const value = habitTickValue(item.measure, logNow(item.id), done);
    if (value !== undefined) putLog(item.id, value);
  };

  const tick = (item, done, list) => (item.kind === 'habit' ? tickHabit(item, done, list) : tickTodo(item, done));

  // ------------------------------------------------------------ Strategies and wins

  const chooseMoved = (next) => {
    const before = view.moved;
    setData((d) => ({ ...d, reviewStrategies: Object.entries(next).map(([strategy_id, level]) => ({ strategy_id, level })) }));
    sent(async () => {
      const id = await ensureReview();
      let last = null;
      for (const op of dayReviewStrategyOps(userId, id, before, next)) last = await saveOrQueue(userId, op);
      return last;
    });
  };

  const addWin = async (form) => {
    const id = newId();
    const strategyIds = [...form.strategyIds];
    const row = { id, what: form.text.trim(), local_date: form.day, impact: form.impact, deleted_at: null };
    setData((d) => ({
      ...d,
      wins: [...(d.wins || []), row],
      winLinks: [...(d.winLinks || []), ...strategyIds.map((s) => ({ win_id: id, strategy_id: s }))],
    }));
    setLocal((l) => ({ ...l, wins: [...(l.wins || []), id] }));
    setPanel(false);
    setWinForm(emptyWin(date));
    clearWinDraft();
    // The database saves every win to Confidence Bank too (wins_to_evidence).
    const ok = await sent(() => saveWin(userId, { id, what: row.what, date: row.local_date, impact: row.impact, strategyIds }));
    if (!ok) {
      setData((d) => ({ ...d, wins: (d.wins || []).filter((w) => w.id !== id) }));
      setWinForm(form);
      setPanel(true);
      return;
    }
    const names = view.strategies.filter((s) => strategyIds.includes(s.value));
    toast.saved({
      message: `Win added to ${names.length === 1 ? names[0].label : `${names.length} Strategies`} and your Confidence Bank.`,
      onUndo: () => {
        setData((d) => ({ ...d, wins: (d.wins || []).filter((w) => w.id !== id) }));
        sent(() => setWinDeleted(userId, id, new Date().toISOString()));
      },
    });
  };

  // ------------------------------------------------------------ the steps

  // The eye sits beside each screen's question (GuidedTool's eye), not in its body.
  const eye = null;
  const screenEye = <WhoSees audience="me" />;
  const noPlan = (
    <div className="day-quiet">
      <p>Your to-dos and Strategies come from your plan.</p>
      <p>Build your plan, and they show here.</p>
      <Button className="day-quiet-btn" onClick={() => navigate('/performance-plan/build')}>Build my plan</Button>
    </div>
  );
  const stepIndex = (key) => steps.findIndex((s) => s.key === key);
  const row = (item, list) => (
    <TodoRow
      key={item.key}
      text={item.text}
      strategyName={item.strategyName}
      tags={list === 'today' ? (item.top ? ['Highest priority'] : []) : item.tags}
      done={item.done}
      onToggle={(done) => tick(item, done, list)}
    />
  );
  // UNDEFINED (audit R0, a day with no plan). CHOICE: the first screen
  // lists this week's list instead of today's three.
  const planned = view.today.length > 0;
  const weekShown = !planned || showWeek;
  // Today's to-dos still open: they stay on this week's list, so tomorrow's
  // Daily plan offers them again (M19 "Moving to tomorrow").
  const moving = view.today.filter((t) => t.kind === 'todo' && !t.done);

  const steps = [
    {
      key: 'do',
      name: 'Do',
      question: planned ? 'Which of today’s to‑dos did you do?' : 'Which of this week’s to‑dos did you do today?',
      nudges: ['Tick each one you did.'],
      render: () => (!view.hasPlan ? noPlan : (
        <div className="day-narrow">
          {eye}
          {planned && <TodoList label="Today’s to-dos" className="rev-list">{view.today.map((item) => row(item, 'today'))}</TodoList>}
          {planned && (
            <div className="rev-more">
              <p>Did you do anything else on this week’s list?</p>
              <Button variant="text" aria-expanded={showWeek} onClick={() => setShowWeek((s) => !s)}>
                {showWeek ? 'Hide this week’s list' : 'Show this week’s list'}
              </Button>
            </div>
          )}
          {weekShown && (view.weekList.length ? (
            <TodoList label="This week’s list" className="rev-list">{view.weekList.map((item) => row(item, 'week'))}</TodoList>
          ) : (
            <p className="day-quiet-line">{planned ? 'Nothing else is on this week’s list.' : 'Nothing is on this week’s list yet.'}</p>
          ))}
          {!view.running && <p className="day-quiet-line">{view.inRecovery ? RECOVERY_DAY_LINE : 'No sprint is running, so today’s to-dos aren’t scored yet.'}</p>}
        </div>
      )),
    },
    {
      key: 'be',
      name: 'Be',
      // Named in both questions (Tim, 5 Nov, 10:39; rule 64). With no way of
      // being from this morning, it first asks how they wanted to be today;
      // Skip skips both. Never a rating of nothing in particular.
      question: way ? wayQuestion(way) : 'How did you want to be today?',
      nudges: way ? [] : ['Choose one, or write your own.'],
      render: () => (!way ? (
        <div className="day-narrow day-stack">
          {wayChoices.length > 0 && (
            <Choice
              ariaLabel="How did you want to be today?"
              options={wayChoices.map((w) => ({ value: w, label: w }))}
              value={picking}
              // Shown as chosen for a moment, then the rating (Tim, 5 Nov, 10:23).
              onChange={(w) => { setPicking(w); setTimeout(() => { chooseWay(w); setPicking(null); }, ADVANCE_MS); }}
              form="rows"
            />
          )}
          {/* Half-typed words are kept on the device, so a refresh never loses them (experience rule 2). */}
          <WayOwnWords value={local.wayTyped || ''} onChange={(wayTyped) => setLocal((l) => ({ ...l, wayTyped }))} onDone={chooseWay} />
          {eye}
        </div>
      ) : (
        <div className="day-stack">
          <div>
            {/* The five words, never 1 to 10 (Tim, 10 Nov, 23:22): a word saves 2, 4, 6, 8 or 10, and an older figure shows as its word. */}
            <Choice
              ariaLabel={wayQuestion(way)}
              options={WAY_RATING_OPTIONS}
              value={wayRatingOption(answers.rating)}
              onChange={(rating) => change({ rating })}
              form="rows"
            />
          </div>
          <TextBox label={whereQuestion(way)} maxLength={WHERE_MAX} value={answers.where} onChange={(where) => change({ where })} />
          {!view.way && <Button variant="text" className="rev-way-change" onClick={() => chooseWay('')}>Choose another way of being</Button>}
        </div>
      )),
    },
    {
      key: 'numbers',
      name: 'Numbers',
      // "Log today", as Home's Log today section (Tim, 5 Nov, 10:37).
      title: 'Log today',
      nudges: ['Anything you logged earlier is already here.'],
      render: () => (
        <div>
          {eye}
          {view.numbers.length ? (
            <div className="rev-logs">
              {view.numbers.map((h) => {
                const common = { name: h.name, detail: h.line, entryLabel: `${h.name} today` };
                if (h.kind === 'number') {
                  return (
                    <LoggingRow
                      key={h.id}
                      {...common}
                      kind="number"
                      value={typed[h.id] ?? toText(h.todayShown)}
                      onChange={(text) => typeNumber(h, text)}
                      unit={h.unit}
                      decimals={h.decimals}
                      inputProps={{ onBlur: () => leaveNumber(h), placeholder: '0' }}
                    />
                  );
                }
                if (h.kind === 'stepper') {
                  return <LoggingRow key={h.id} {...common} kind="stepper" value={h.today ?? 0} min={0} max={h.top} onChange={(v) => putLog(h.id, v || null)} />;
                }
                return <LoggingRow key={h.id} {...common} kind={h.kind} value={h.today} onChange={(v) => putLog(h.id, v)} />;
              })}
            </div>
          ) : (
            <p className="day-quiet-line">
              {view.running ? 'None of this sprint’s habits are logged a day at a time.' : view.inRecovery ? RECOVERY_NUMBERS_LINE : 'No sprint is running, so there are no numbers to log today.'}
            </p>
          )}
          {view.weeklyLine && (
            <div className="rev-week">
              <p>{view.weeklyLine}</p>
              <p>You can log weekly habits in the sprint whenever they happen.</p>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'well',
      name: 'Went well',
      question: 'What went well today?',
      nudges: ['Start with what worked, however small.'],
      render: () => (
        <div>
          <TextBox ariaLabel="What went well today?" maxLength={REVIEW_TEXT_MAX} value={answers.wentWell} onChange={(wentWell) => change({ wentWell })} />
          {view.strategies.length > 0 && (
            <div className="rev-wins">
              <p>Did something outside your plan move the needle?</p>
              {view.wins.length > 0 && (
                <TodoList label="Unplanned wins" className="rev-list">
                  {view.wins.map((w) => (
                    <TodoRow key={w.id} win text={w.text} strategyName={w.strategyName} winTag={`Unplanned win, ${w.day}`} />
                  ))}
                </TodoList>
              )}
              <AddButton className="day-add" onClick={() => { setWinForm((f) => (f.text ? f : emptyWin(date))); setPanel(true); }}>Add an unplanned win</AddButton>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'differently',
      name: 'Differently',
      question: 'What would you do differently next time?',
      nudges: ['Pick one thing you’d change.'],
      example: DIFFERENTLY_EXAMPLE,
      render: () => (
        <TextBox ariaLabel="What would you do differently next time?" maxLength={REVIEW_TEXT_MAX} value={answers.differently} onChange={(differently) => change({ differently })} />
      ),
    },
    {
      key: 'strategies',
      name: 'Strategies',
      question: 'Which Strategies moved today?',
      nudges: ['Choose each one that moved, then how much.', view.reminder],
      render: () => (!view.hasPlan ? noPlan : (
        <div className="day-narrow">
          <LevelChoice
            ariaLabel="Which Strategies moved today?"
            options={view.strategies}
            values={view.moved}
            onChange={chooseMoved}
            question={movedQuestion}
          />
        </div>
      )),
    },
    {
      key: 'tomorrow',
      name: 'Tomorrow',
      question: 'What are the most important things to do tomorrow?',
      nudges: ['They’ll be waiting in tomorrow’s Daily plan, in this order.'],
      example: TOMORROW_EXAMPLE,
      render: () => (
        // One eye for the screen, and both boxes the same width (Tim, 5 Nov).
        <div className="day-narrow">
          {eye}
          <PriorityRows
            rows={answers.tomorrow}
            onChange={(tomorrow) => change({ tomorrow })}
            count={MAX_TOMORROW}
            maxLength={TOMORROW_ITEM_MAX}
            itemLabel={(n) => `Priority ${n} for tomorrow`}
          />
          <div className="rev-gap">
            <TextBox label="Is there anything else on your mind?" maxLength={REVIEW_TEXT_MAX} value={answers.onMind} onChange={(onMind) => change({ onMind })} />
          </div>
        </div>
      ),
    },
    {
      key: 'summary',
      name: 'Your day',
      required: true, // nothing to skip: Next goes on to closing the day
      question: 'This was your day',
      render: (tool) => {
        const tomorrow = tomorrowToRow(answers.tomorrow);
        return (
          <div>
            <GuidedSummary
              emptyWord="Skipped"
              addWhenEmpty
              onChange={tool.go}
              rows={[
                // Plain, full labels (Tim, 5 Nov, 10:41).
                { label: 'What you got done', value: view.todoLine, good: view.todoPlus, step: stepIndex('do') },
                { label: 'How you showed up', value: howYouWere(way, answers.rating), sub: answers.where.trim(), step: stepIndex('be') },
                { label: 'What went well', value: answers.wentWell.trim() || view.winsLine, good: answers.wentWell.trim() ? view.winsLine : null, step: stepIndex('well') },
                { label: 'What you’d do differently', value: answers.differently.trim(), step: stepIndex('differently') },
                { label: 'How today aligned with your Strategies', value: movedLines(view.moved, view.strategies), step: stepIndex('strategies') },
                { label: 'Priorities for tomorrow', value: tomorrow.map((t, i) => `${i + 1}. ${t}`), step: stepIndex('tomorrow') },
                { label: 'Anything else on your mind', value: answers.onMind.trim(), step: stepIndex('tomorrow') },
              ]}
            />
            {view.score && (
              <div className="day-score">
                <Stat label="Performance score this week so far" value={view.score.value} good={view.score.good} />
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'close',
      name: 'Close',
      question: 'Ready to close the day?',
      nudges: ['Check what moves to tomorrow.'],
      nudgeInfo: { label: 'About closing the day', text: 'Anything still open moves to tomorrow, so you can stop thinking about it.' },
      render: () => {
        const first = tomorrowToRow(answers.tomorrow)[0];
        return (
          <div className="day-narrow">
            <section className="ds-close-list" aria-labelledby="rev-moving">
              <h3 id="rev-moving" className="ds-pick-group-title">Moving to tomorrow</h3>
              {moving.length ? (
                <List label="Moving to tomorrow">
                  {moving.map((t) => <ListRow key={t.key} title={t.text} type="To-do" />)}
                </List>
              ) : <p className="day-quiet-line">Nothing is left open today.</p>}
            </section>
            {first && (
              <section className="ds-close-list" aria-labelledby="rev-first">
                <h3 id="rev-first" className="ds-pick-group-title">Tomorrow starts with</h3>
                <List label="Tomorrow starts with"><ListRow title={first} /></List>
              </section>
            )}
          </div>
        );
      },
    },
  ];

  // One eye per screen, beside its question (5e rules 10 and 29d): never a
  // second one in the body.
  for (const s of steps) if (!s.plain && !s.bare) s.eye = screenEye;

  const backTo = location.state?.from || '/performance-sprint';

  // Close my day: saved as finished, then Work's done for today (M19).
  const [closed, setClosed] = useState(null);
  const [anyway, setAnyway] = useState(false);
  const finish = async () => {
    const ok = await sendAnswers({ status: 'finished', finished_at: new Date().toISOString() });
    if (!ok) return false; // the tool lets Close my day be tapped again
    setData((d) => ({ ...d, dayReview: { ...(d.dayReview || {}), status: 'finished' } }));
    clearAnswersDraft();
    clearDraft(userId, draftName(date));
    clearGuideDraft(stepKey(userId, date));
    setClosed({ open: moving.length > 0, first: tomorrowToRow(answersRef.current.tomorrow)[0] || null });
    return true;
  };

  const close = () => {
    if (waiting.current) sendAnswers();
    if (!view.finished) toast.show('Saved as a draft, so you can continue from Home for 24 hours.');
    else {
      // Looking at a finished one never makes it part-way again (Tim, 5
      // Nov): any change is already sent, so the device forgets the step
      // and the typing, and Home's Carry on never lists it.
      clearAnswersDraft();
      clearDraft(userId, draftName(date));
      clearGuideDraft(stepKey(userId, date));
    }
    navigate(backTo, { replace: true });
  };

  // A paused tool is a gate (Tim, 5 Nov, 11:09): in Recovery, only the
  // calm screen, until they choose to go on (this visit only).
  if (view.inRecovery && !anyway && !view.finished) {
    return (
      <div className="ui-root plan-builder-wait">
        <GuidedTool
          name="Daily review"
          steps={[{
            key: 'paused',
            name: 'Paused',
            plain: true,
            render: (tool) => (
              <PausedGate
                toolName="Daily review" anywayLabel="Start my daily review anyway"
                headingRef={tool.headingRef}
                onBack={() => navigate(location.state?.from || '/recovery/today', { replace: true })}
                onAnyway={() => setAnyway(true)}
              />
            ),
          }]}
          onClose={() => navigate(backTo, { replace: true })}
        />
      </div>
    );
  }

  const toolName = date === today ? 'Daily review' : `Daily review, ${dayName(date, today)}`;
  if (closed) {
    return (
      <div className="ui-root plan-builder-wait">
        <GuidedTool
          name={toolName}
          steps={[{
            key: 'done',
            name: 'Work’s done',
            plain: true,
            render: (tool) => (
              <EndScreen
                kind="done"
                title="Work’s done for today"
                headingRef={tool.headingRef}
                lines={[
                  closed.open ? 'Your open to-dos are on tomorrow’s list.' : null,
                  closed.first ? `Tomorrow starts with “${closed.first}”.` : null,
                  !closed.open && !closed.first ? 'Your review is saved.' : null,
                ]}
                action={<Button variant="primary" onClick={() => navigate('/welcome', { replace: true })}>Back to Home</Button>}
              />
            ),
          }]}
          onClose={() => navigate(backTo, { replace: true })}
        />
      </div>
    );
  }

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name={toolName}
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel="Close my day"
        saveState={save}
        draftKey={stepKey(userId, date)}
        initialStep={view.finished || (pinned && date < today) ? 'summary' : undefined}
        onClose={close}
        onFinish={finish}
      />
      <AddWinPanel
        open={panel}
        onClose={() => setPanel(false)}
        form={{ ...winForm, day: winForm.day ?? date }}
        onFormChange={setWinForm}
        strategies={view.strategies}
        days={view.winDays.map((d) => ({ ...d, label: d.value === date ? 'Today' : d.label }))}
        onAdd={addWin}
      />
    </div>
  );
}

/** "How did you want to be today?" in their own words (Tim, 5 Nov, 10:39). */
function WayOwnWords({ value: text, onChange: setText, onDone }) {
  return (
    <div className="rev-way-own">
      <TextBox label="In your own words" lines="one" maxLength={120} value={text} onChange={setText} placeholder="e.g. Calm under pressure" />
      {text.trim() && <Button className="rev-way-use" onClick={() => onDone(text)}>Use these words</Button>}
    </div>
  );
}
