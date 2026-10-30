import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  AddButton,
  AddTodoPanel,
  AddWinPanel,
  Button,
  Choice,
  Collapsible,
  ErrorMessage,
  ExpandList,
  GuidedTool,
  Loading,
  LoggingWeekRow,
  ObjectiveFigureRow,
  PageHeader,
  Section,
  Stat,
  StatGroup,
  StatusAction,
  SwitchRow,
  TextBox,
  TodoList,
  TodoRow,
  WhoSees,
  clearGuideDraft,
  useToast,
} from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { friendlyError } from '../../lib/friendlyError';
import { isOnline } from '../../lib/connection';
import { keepForLater, newId, saveOrQueue, useQueueState, waitingToSend } from '../../lib/syncQueue';
import { toStored } from '../../lib/units';
import {
  createDebrief,
  debriefAnswersOp,
  freezeWeek,
  habitLogOp,
  loadDebrief,
  loadDebriefRow,
  objectiveFigureOp,
  saveHabitLog,
  saveMilestoneReached,
  saveTodo,
  saveWin,
  setTodoDeleted,
  setWinDeleted,
} from '../../lib/performance/api';
import { useLatestWhenSuperseded } from '../../lib/performance/hooks';
import {
  DEBRIEF_TEXT_MAX,
  STRESS_OPTIONS,
  STRESS_QUESTION,
  dayName,
  debriefAnswersFromRow,
  debriefAnswersToRow,
  debriefHeading,
  debriefView,
  figureChange,
  finishToast,
  localToday,
  shareLine,
  yourDaysLine,
} from '../../lib/performance';
import './performance.css';

// The Weekly performance debrief (mock-up M1, R.debrief, read in full with
// its notes; decisions "Weekly performance debrief"). One guided tool,
// one question per screen on phone and desktop, with the % complete bar
// (the approved rule over M1's step list) and "~5 minutes" ("No more than
// 5 minutes"):
//   Numbers     "How did week 3 go?" every habit's seven days, grouped by
//               Strategy, with its total and score; Unplanned wins
//   Stress      the agreed question, Not at all to Very much, "Only you"
//               always: it is never shared
//   Objectives  "Where are your Outcome Objectives now?" a figure for each
//               number or rating (M9, objective_figures), Mark as done for
//               a milestone
//   Went well   with "Your days" (the week's Review my day entries) folded
//   In the way, Adjust
//   Next week   the open to-dos that roll over and next week's, Add a to-do
//               (into the sprint, next week chosen)
//   Summary     the week's score (mint and a glow at or above the
//               standard), the usual range, the debrief streak (M11), and
//               Share with [coach] when there is a coach; Finish my debrief
//
// The window (M0.4, audit 2.4): /performance-sprint/debrief opens the week
// whose window is open, from its last 3 days until 3 days after it ends;
// /performance-sprint/debrief/:sprintId/:week opens a given week. Before
// its window, or once closed with no debrief done, the page says so (a
// closed week shows its score). A finished debrief opens on its summary
// and can still be changed (experience rule 7).
//
// Finishing marks the debrief finished, then finalises the week's score
// through the database's own freeze_week when online with nothing waiting
// (otherwise the sprint page freezes it on its next visit). Every figure
// comes from src/lib/scores through src/lib/performance (debriefView).
//
// Everything saves as it goes, as the daily tools do: the answers into the
// week's weekly_debriefs row a moment after typing pauses, logs, figures,
// wins and to-dos at once, all through the offline queue (Saving, Will
// sync, Saved) with the version it was based on. Typing is kept as a
// draft on the device and the step is remembered, so a refresh carries on.
//
// Sharing (decisions, confirmed 21 Oct): Share with [coach] starts off,
// and switching it on sets weekly_debriefs.shared_with_coach, nothing
// more. What the coach may read of it (this week's scores, the objective
// figures and the three answers, never stress) comes with the coach's view
// in Phase 6a, through a checked read (progress.md, Step 3).

const SAVE_AFTER_MS = 800;
const LOG_AFTER_MS = 700;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const toText = (v) => (v == null ? '' : String(v));
const parseTyped = (text) => {
  const t = (text || '').replace(',', '.');
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const emptyWin = (day) => ({ text: '', strategyIds: [], impact: 2, day });
const emptyTodo = (week) => ({ text: '', strategyId: null, impact: 2, week });
const nameOf = (sprintId, week) => `${sprintId}:${week}`;

export default function WeeklyDebrief() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const params = useParams();
  const today = localToday();
  const pinned = params.sprintId && /^\d+$/.test(params.week || '') ? { sprintId: params.sprintId, week: Number(params.week) } : null;
  const loaded = useCachedLoad({
    userId,
    name: pinned ? `debrief:${nameOf(pinned.sprintId, pinned.week)}` : 'debrief:now',
    load: () => loadDebrief(userId, { ...(pinned || {}), today }),
    deps: [pinned?.sprintId, pinned?.week, today],
  });
  useLatestWhenSuperseded(loaded.reload);
  const view = useMemo(() => (loaded.data ? debriefView(loaded.data, { today }) : null), [loaded.data, today]);

  if (!loaded.data && loaded.error) {
    return (
      <Shell>
        <ErrorMessage keepsHappening>Your debrief didn’t load. Check your connection and try again.</ErrorMessage>
      </Shell>
    );
  }
  if (!view) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your week" className="ds-loading--page" /></div>;
  }
  if (view.state !== 'open') return <NotOpen view={view} />;
  return <DebriefFlow key={nameOf(view.sprintId, view.week)} userId={userId} today={today} loaded={loaded} view={view} />;
}

function Shell({ children }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <PageHeader title="Weekly performance debrief" />
        {children}
        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-sprint')}>Open my sprint</Button>
        </div>
      </div>
    </div>
  );
}

// No week to debrief today: when the next one opens, or a closed week's score.
function NotOpen({ view }) {
  const navigate = useNavigate();
  const nextLine = view.next ? `Your next debrief opens on ${dayName(view.next.opensOn, view.today)}, in the last 3 days of week ${view.next.week}.` : null;
  let lines;
  if (view.state === 'none') {
    lines = nextLine ? ['No debrief is open today.', nextLine] : ['No sprint is running, so there’s no week to debrief.'];
  } else if (view.state === 'before') {
    lines = [`The debrief for week ${view.week} opens on ${view.opensOn}.`];
  } else {
    lines = [`The debrief for week ${view.week} closed on ${view.closedOn}.`];
  }
  // Another week's debrief open today says so (an old week's link), else when the next opens.
  const openLine = view.openNow ? `The debrief for week ${view.openNow.week} is open now.` : null;
  if (openLine && view.state !== 'none') lines.push(openLine);
  else if (nextLine && view.state === 'closed') lines.push(nextLine);
  return (
    <Shell>
      <div className="deb-closed">
        {lines.map((l) => <p key={l}>{l}</p>)}
      </div>
      {openLine && (
        <div className="ds-actions deb-open-now">
          <Button variant="primary" onClick={() => navigate('/performance-sprint/debrief')}>Start my debrief</Button>
        </div>
      )}
      {view.state === 'closed' && (
        <div className="deb-closed-score">
          <Stat
            label={`Week ${view.week} performance score`}
            value={view.score ? `${view.score.value}%` : 'None'}
            good={Boolean(view.score?.good)}
            note={view.score ? `Your standard is ${view.standard}%.` : 'Nothing was planned this week.'}
          />
        </div>
      )}
    </Shell>
  );
}


function DebriefFlow({ userId, today, loaded, view }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queue = useQueueState();
  const { data, setData } = loaded;
  const { sprintId, week } = view;
  const key = nameOf(sprintId, week);

  const [answers, setAnswers] = useState(() => debriefAnswersFromRow(data.debrief));
  const [shared, setShared] = useState(() => Boolean(data.debrief?.shared_with_coach));
  const [save, setSave] = useState('idle');
  const [typed, setTyped] = useState({});      // habit:day -> what is in the box
  const [figTyped, setFigTyped] = useState({}); // objective id -> what is in the box
  const [panel, setPanel] = useState(null);    // 'win' | 'todo'
  const [winForm, setWinForm] = useState(() => emptyWin(view.winDays[view.winDays.length - 1]?.value));
  const [todoForm, setTodoForm] = useState(() => emptyTodo(view.nextWeek?.number ?? null));

  const debriefId = useRef(data.debrief?.id || null);
  const creating = useRef(null);
  const typedYet = useRef(false);
  const timer = useRef(null);
  const waiting = useRef(null);
  const answersRef = useRef(answers);
  const logTimers = useRef({});
  const logsWaiting = useRef({}); // habit:day -> { habitId, day, value }
  const figTimers = useRef({});
  const figsWaiting = useRef({}); // objective id -> op
  const figIds = useRef({});      // objective id -> this debrief's figure row id
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { if (data.debrief?.id) debriefId.current = data.debrief.id; }, [data.debrief?.id]);
  useEffect(() => {
    if (!typedYet.current && data.debrief?.updated_at) {
      setAnswers(debriefAnswersFromRow(data.debrief));
      setShared(Boolean(data.debrief.shared_with_coach));
    }
  }, [data.debrief?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (save === 'offline' && queue.waiting === 0 && queue.failed === 0) setSave('saved');
    if (save === 'offline' && queue.failed > 0) setSave('failed');
  }, [save, queue.waiting, queue.failed]);

  const { clear: clearAnswersDraft } = useDraft({
    userId,
    name: `debrief:${key}`,
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
    name: `debrief:${key}:win`,
    value: panel === 'win' ? winForm : null,
    ready: true,
    onRestore: (d) => { if (d?.text) { setWinForm(d); setPanel('win'); } },
  });
  const { clear: clearTodoDraft } = useDraft({
    userId,
    name: `debrief:${key}:todo`,
    value: panel === 'todo' ? todoForm : null,
    ready: true,
    onRestore: (d) => { if (d?.text) { setTodoForm(d); setPanel('todo'); } },
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

  // The week's debrief row, made once with its id from the device, so the
  // to-dos added for next week can name it at once, offline too.
  const ensureDebrief = () => {
    if (debriefId.current) return Promise.resolve(debriefId.current);
    if (!creating.current) {
      creating.current = (async () => {
        const id = newId();
        const r = await createDebrief(userId, id, sprintId, week);
        let real = id;
        if (r?.status === 'saved' && !r.data?.length) real = (await loadDebriefRow(userId, sprintId, week))?.id || id;
        debriefId.current = real;
        setData((d) => ({ ...d, debrief: { ...(d.debrief || {}), id: real, sprint_id: sprintId, sprint_week: week, status: d.debrief?.status || 'draft' } }));
        return real;
      })().catch((e) => {
        creating.current = null;
        throw e;
      });
    }
    return creating.current;
  };

  const answersOp = (a, extra = {}) => debriefAnswersOp(userId, sprintId, week, { ...debriefAnswersToRow(a), ...extra });

  const sendAnswers = (extra = {}) => {
    clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
    const a = answersRef.current;
    return sent(async () => {
      await ensureDebrief();
      setData((d) => ({ ...d, debrief: { ...(d.debrief || {}), ...debriefAnswersToRow(a), ...extra } }));
      return saveOrQueue(userId, answersOp(a, extra));
    });
  };

  const change = (patch) => {
    typedYet.current = true;
    setAnswers((a) => ({ ...a, ...patch }));
  };

  useEffect(() => {
    if (!typedYet.current) return;
    setSave('saving');
    waiting.current = answers;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => sendAnswers(), SAVE_AFTER_MS);
    // Only when the answers change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  // Logs and figures still waiting for their delay: kept on the device when
  // the page is closed or refreshed, sent now when it is left.
  const takeWaiting = () => {
    Object.values(logTimers.current).forEach((t) => clearTimeout(t));
    Object.values(figTimers.current).forEach((t) => clearTimeout(t));
    logTimers.current = {};
    figTimers.current = {};
    const logs = Object.values(logsWaiting.current);
    const figs = Object.values(figsWaiting.current);
    logsWaiting.current = {};
    figsWaiting.current = {};
    return { logs, figs };
  };
  useEffect(() => {
    const onHide = () => {
      const w = takeWaiting();
      w.logs.forEach((l) => keepForLater(userId, habitLogOp(userId, l.habitId, l.day, l.value)));
      w.figs.forEach((op) => keepForLater(userId, op));
      if (!waiting.current || !debriefId.current) return;
      keepForLater(userId, answersOp(waiting.current));
      waiting.current = null;
      clearTimeout(timer.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      const w = takeWaiting();
      w.logs.forEach((l) => { saveHabitLog(userId, l.habitId, l.day, l.value).catch(() => null); });
      w.figs.forEach((op) => { saveOrQueue(userId, op).catch(() => null); });
      if (waiting.current) {
        clearTimeout(timer.current);
        const a = waiting.current;
        waiting.current = null;
        ensureDebrief().then(() => saveOrQueue(userId, answersOp(a))).catch(() => null);
      }
    };
    // Once, for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ numbers

  const putLog = (habitId, day, value, { delay = 0 } = {}) => {
    setData((d) => {
      const others = (d.logs || []).filter((l) => !(l.sprint_habit_id === habitId && l.local_date === day));
      const before = (d.logs || []).find((l) => l.sprint_habit_id === habitId && l.local_date === day);
      return {
        ...d,
        logs: value == null ? others : [...others, { id: before?.id || `device-${habitId}-${day}`, sprint_habit_id: habitId, local_date: day, value, to_confirm: false }],
      };
    });
    const k = `${habitId}:${day}`;
    clearTimeout(logTimers.current[k]);
    const go = () => {
      delete logTimers.current[k];
      delete logsWaiting.current[k];
      return sent(() => saveHabitLog(userId, habitId, day, value));
    };
    if (!delay) {
      delete logsWaiting.current[k];
      return go();
    }
    setSave('saving');
    logsWaiting.current[k] = { habitId, day, value };
    logTimers.current[k] = setTimeout(go, delay);
    return Promise.resolve(true);
  };

  const typeNumber = (h, day, text) => {
    if (h.measure === 'rating' && text !== '' && !/^[1-5]$/.test(text)) return;
    const shown = parseTyped(text);
    if ((h.measure === 'count' || h.measure === 'count_limit') && shown != null && (!Number.isInteger(shown) || shown > h.top)) return;
    setTyped((t) => ({ ...t, [`${h.id}:${day}`]: text }));
    const stored = h.measure === 'amount' ? toStored(shown, h.storedUnit, data.personSettings?.units) : shown;
    putLog(h.id, day, stored, { delay: LOG_AFTER_MS });
  };

  const leaveNumber = (h, day) => {
    const k = `${h.id}:${day}`;
    if (logTimers.current[k]) {
      const w = logsWaiting.current[k];
      clearTimeout(logTimers.current[k]);
      delete logTimers.current[k];
      delete logsWaiting.current[k];
      sent(() => saveHabitLog(userId, h.id, day, w?.value ?? null));
    }
    setTyped((t) => {
      const next = { ...t };
      delete next[k];
      return next;
    });
  };

  // Once a week: the tick logs the week's last day it can (today, or the
  // week's end); untick clears every day logged.
  const tickWeekly = (h, done) => {
    if (done) {
      putLog(h.id, view.figureDay, 1);
      return;
    }
    Object.entries(h.values).filter(([, v]) => v > 0).forEach(([day]) => putLog(h.id, day, null));
  };

  // ------------------------------------------------------------ wins and to-dos

  const addWin = async (form) => {
    const id = newId();
    const strategyIds = [...form.strategyIds];
    const row = { id, what: form.text.trim(), local_date: form.day, impact: form.impact, deleted_at: null };
    setData((d) => ({
      ...d,
      wins: [...(d.wins || []), row],
      winLinks: [...(d.winLinks || []), ...strategyIds.map((s) => ({ win_id: id, strategy_id: s }))],
    }));
    setPanel(null);
    setWinForm(emptyWin(form.day));
    clearWinDraft();
    // The database saves every win to Performance Evidence too (wins_to_evidence).
    const ok = await sent(() => saveWin(userId, { id, what: row.what, date: row.local_date, impact: row.impact, strategyIds }));
    if (!ok) {
      setData((d) => ({ ...d, wins: (d.wins || []).filter((w) => w.id !== id) }));
      setWinForm(form);
      setPanel('win');
      return;
    }
    const names = view.strategies.filter((s) => strategyIds.includes(s.value));
    toast.saved({
      message: `Win added to ${names.length === 1 ? names[0].label : `${names.length} Strategies`} and your Performance Evidence.`,
      onUndo: () => {
        setData((d) => ({ ...d, wins: (d.wins || []).filter((w) => w.id !== id) }));
        sent(() => setWinDeleted(userId, id, new Date().toISOString()));
      },
    });
  };

  const addTodo = async (form) => {
    const id = newId();
    const row = { id, strategy_id: form.strategyId, text: form.text.trim(), impact: form.impact, sprint_id: sprintId, planned_week: form.week, created_on: today, done_on: null, source: 'debrief', move_on: null, deleted_at: null };
    setData((d) => ({ ...d, todos: [...(d.todos || []), row] }));
    setPanel(null);
    setTodoForm(emptyTodo(view.nextWeek?.number ?? null));
    clearTodoDraft();
    const ok = await sent(async () => {
      const source = await ensureDebrief();
      return saveTodo(userId, { id, strategyId: row.strategy_id, text: row.text, impact: row.impact, sprintId, week: row.planned_week, createdOn: today, source: 'debrief', sourceId: source });
    });
    if (!ok) {
      setData((d) => ({ ...d, todos: (d.todos || []).filter((t) => t.id !== id) }));
      setTodoForm(form);
      setPanel('todo');
      return;
    }
    toast.saved({
      message: `Added to week ${form.week}.`,
      onUndo: () => {
        setData((d) => ({ ...d, todos: (d.todos || []).filter((t) => t.id !== id) }));
        sent(() => setTodoDeleted(userId, id, new Date().toISOString()));
      },
    });
  };

  // ------------------------------------------------------------ objectives

  const typeFigure = (o, text) => {
    if (o.kind === 'rating' && text !== '' && !/^(10|[0-9])$/.test(text)) return;
    setFigTyped((t) => ({ ...t, [o.id]: text }));
    const value = parseTyped(text);
    // One figure row per objective and debrief, whatever is typed and cleared.
    if (!figIds.current[o.id]) figIds.current[o.id] = o.figureId || newId();
    const id = figIds.current[o.id];
    const op = objectiveFigureOp(userId, { id, objectiveId: o.id, value, recordedOn: view.figureDay, sprintId, sprintWeek: week });
    setData((d) => {
      const others = (d.figures || []).filter((f) => f.id !== id);
      return {
        ...d,
        figures: value == null ? others : [...others, { id, objective_id: o.id, value, recorded_on: view.figureDay, sprint_id: sprintId, sprint_week: week, created_at: new Date().toISOString() }],
      };
    });
    clearTimeout(figTimers.current[o.id]);
    setSave('saving');
    figsWaiting.current[o.id] = op;
    figTimers.current[o.id] = setTimeout(() => {
      delete figTimers.current[o.id];
      delete figsWaiting.current[o.id];
      sent(() => saveOrQueue(userId, op));
    }, LOG_AFTER_MS);
  };

  const markReached = async (o, done) => {
    const on = done ? view.figureDay : null;
    const before = data.objectives.find((r) => r.id === o.id)?.reached_on ?? null;
    const set = (v) => setData((d) => ({ ...d, objectives: d.objectives.map((r) => (r.id === o.id ? { ...r, reached_on: v } : r)) }));
    set(on);
    const ok = await sent(() => saveMilestoneReached(userId, o.id, on));
    if (!ok) {
      set(before);
      return;
    }
    if (done) {
      toast.saved({
        message: `${o.name} is marked as reached.`,
        onUndo: () => {
          set(before);
          sent(() => saveMilestoneReached(userId, o.id, before));
        },
      });
    }
  };

  // ------------------------------------------------------------ sharing

  const share = (on) => {
    setShared(on);
    sent(async () => {
      await ensureDebrief();
      setData((d) => ({ ...d, debrief: { ...(d.debrief || {}), shared_with_coach: on } }));
      return saveOrQueue(userId, debriefAnswersOp(userId, sprintId, week, { shared_with_coach: on }));
    });
  };

  // ------------------------------------------------------------ the steps

  // The who-sees label follows the share switch (M1): "You and [coach]"
  // on what is shared; stress is always "Only you".
  const audience = shared && view.coach ? 'coach' : 'me';
  const eye = (who = audience) => <WhoSees audience={who} coachName={view.coach || undefined} />;
  const habitRow = (h) => {
    const common = { name: h.name, detail: h.measureLine, days: view.days, total: h.total, dashEmpty: true };
    if (h.measure === 'yes_no_weekly') {
      return <LoggingWeekRow key={h.id} {...common} kind="tick" tickWords="Happened this week" value={Object.values(h.values).some((v) => v > 0)} onChange={(v) => tickWeekly(h, v)} />;
    }
    if (h.measure === 'yes_no_days_limit' || h.measure === 'yes_no_days_target') {
      return <LoggingWeekRow key={h.id} {...common} kind="yesno" values={h.values} onChange={(d, v) => putLog(h.id, d, v)} />;
    }
    const texts = Object.fromEntries(view.days.map((d) => [d.key, typed[`${h.id}:${d.key}`] ?? toText(h.shown[d.key])]));
    return (
      <LoggingWeekRow
        key={h.id}
        {...common}
        kind="boxes"
        decimals={h.decimals}
        texts={texts}
        onChange={(d, text) => typeNumber(h, d, text)}
        onBlur={(d) => leaveNumber(h, d)}
      />
    );
  };
  const box = (k, label) => (
    <TextBox
      ariaLabel={label}
      who={audience}
      coachName={view.coach || undefined}
      maxLength={DEBRIEF_TEXT_MAX}
      value={answers[k]}
      onChange={(v) => change({ [k]: v })}
    />
  );

  const steps = [
    {
      key: 'numbers',
      name: 'Numbers',
      label: '~5 minutes',
      question: `How did week ${week} go?`,
      // Writing rule 5 over M1's "Fill in any day you missed".
      nudges: ['Let’s start with your numbers.', 'Fill in any day you didn’t log, or leave it empty.'],
      render: () => (
        <div>
          <div className="deb-subrow">
            <span>{view.range}</span>
            {eye()}
          </div>
          {view.groups.length ? view.groups.map((g) => (
            <div key={g.id} className="deb-group">
              <p className="deb-group-name">{g.name}</p>
              <div className="deb-habits">{g.habits.map(habitRow)}</div>
            </div>
          )) : <p className="day-quiet-line">This sprint has no habits to log.</p>}
          <Section title="Unplanned wins" line="Anything you did that wasn’t planned but moved the needle." as="h3" className="deb-wins">
            {view.wins.length > 0 && (
              <TodoList label="Unplanned wins" className="rev-list">
                {view.wins.map((w) => <TodoRow key={w.id} win text={w.text} strategyName={w.strategyName} winTag={`Unplanned win, ${w.day}`} />)}
              </TodoList>
            )}
            <AddButton className="day-add" onClick={() => { setWinForm((f) => (f.text ? f : emptyWin(view.winDays[view.winDays.length - 1]?.value))); setPanel('win'); }}>Add an unplanned win</AddButton>
          </Section>
        </div>
      ),
    },
    {
      key: 'stress',
      name: 'Stress',
      question: STRESS_QUESTION,
      nudges: ['Choose the answer closest to your week.'],
      render: () => (
        <div className="day-narrow">
          <div className="ds-label-row ds-label-row--solo">{eye('me')}</div>
          <Choice ariaLabel={STRESS_QUESTION} options={STRESS_OPTIONS} value={answers.stress} onChange={(stress) => change({ stress })} form="rows" />
        </div>
      ),
    },
    {
      key: 'objectives',
      name: 'Objectives',
      question: 'Where are your Outcome Objectives now?',
      nudges: ['Update any that have moved since last week.'],
      render: () => (
        <div className="day-narrow">
          {view.objectives.length ? view.objectives.map((o) => (o.kind === 'milestone' ? (
            <div key={o.id} className="ds-objfig">
              <div className="ds-objfig-name">{o.name}</div>
              <StatusAction done={o.reached} onChange={(done) => markReached(o, done)} doneLabel="Reached" notDoneLabel={o.status} />
            </div>
          ) : (
            <ObjectiveFigureRow
              key={o.id}
              name={o.name}
              entryLabel={`${o.name} now`}
              value={figTyped[o.id] ?? toText(o.value)}
              onChange={(text) => typeFigure(o, text)}
              unit={o.unit}
              decimals={o.decimals}
              lastLine={o.lastLine}
              change={figureChange(o.objective, o.value, o.before)}
            />
          ))) : <p className="day-quiet-line">Your plan has no Outcome Objectives yet.</p>}
          <div className="deb-subrow deb-subrow--end">{eye()}</div>
        </div>
      ),
    },
    {
      key: 'well',
      name: 'Went well',
      question: 'What went well this week?',
      nudges: ['Start with what worked, however small.'],
      render: () => (
        <div>
          {view.yourDays.length > 0 && (
            <div className="deb-days">
              <Collapsible summary={(
                <span className="sprint-later-head">
                  <span className="sprint-later-title">Your days</span>
                  <span className="sprint-later-line">{yourDaysLine(view.yourDays.length)}</span>
                </span>
              )}
              >
                <ExpandList
                  label="Your days"
                  items={view.yourDays.map((x) => ({
                    key: x.key,
                    title: x.title,
                    summary: x.wentWell || x.differently,
                    render: () => (
                      <div className="deb-day">
                        {x.wentWell && <p><span>What went well?</span>{x.wentWell}</p>}
                        {x.differently && <p><span>What would you do differently next time?</span>{x.differently}</p>}
                        {x.moved.length > 0 && <p><span>{x.moved.length === 1 ? 'Strategy that moved' : 'Strategies that moved'}</span>{x.moved.map((m) => <span key={m} className="deb-day-line">{m}</span>)}</p>}
                      </div>
                    ),
                  }))}
                />
              </Collapsible>
            </div>
          )}
          {box('wentWell', 'What went well this week?')}
        </div>
      ),
    },
    {
      key: 'inTheWay',
      name: 'In the way',
      question: 'What got in the way?',
      nudges: ['Name one or two things.'],
      render: () => box('inTheWay', 'What got in the way?'),
    },
    {
      key: 'adjust',
      name: 'Adjust',
      question: 'What will you adjust next week?',
      nudges: ['Pick one change you can make.'],
      render: () => box('adjust', 'What will you adjust next week?'),
    },
    {
      key: 'next',
      name: 'Next week',
      question: view.nextWeek ? 'What’s planned for next week?' : 'What comes next?',
      nudges: view.nextWeek ? ['Open to-dos roll over.', 'Add anything new.'] : [],
      render: () => (!view.nextWeek ? (
        // UNDEFINED (audit D7): the sprint's last week has no next week.
        <div className="day-quiet">
          <p>Your sprint ends with this week.</p>
          <p>Your end-of-sprint review comes next.</p>
        </div>
      ) : (
        <div className="day-narrow">
          <div className="deb-subrow">
            <span>{view.nextWeek.range}</span>
            {eye('me')}
          </div>
          {view.nextWeek.todos.length ? (
            <TodoList label="Next week’s to-dos" className="rev-list">
              {view.nextWeek.todos.map((t) => <TodoRow key={t.id} plain text={t.text} strategyName={t.strategyName} done={t.done} tags={t.tags} />)}
            </TodoList>
          ) : <p className="day-quiet-line">Nothing is planned for next week yet.</p>}
          <div className="deb-carry">
            <p>Habits carry on with the same targets.</p>
            <p>You can change them in the sprint.</p>
          </div>
          <AddButton className="day-add" onClick={() => { setTodoForm((f) => (f.text ? f : emptyTodo(view.nextWeek.number))); setPanel('todo'); }}>Add a to-do</AddButton>
        </div>
      )),
    },
    {
      key: 'summary',
      name: 'Summary',
      question: debriefHeading(view),
      nudges: view.finished
        ? ['Your week is debriefed.', 'You can still change your answers.']
        : view.score?.good ? ['Finish to lock in your score.'] : ['What went well is saved with your week.', 'Finish to lock in your score.'],
      render: () => (
        <div>
          <StatGroup className="deb-facts">
            <Stat
              panel
              celebrate={Boolean(view.score?.good)}
              label={view.scoreLabel}
              value={view.score ? `${view.score.value}%` : 'None'}
              good={Boolean(view.score?.good)}
              note={view.score ? [view.usualLine, `Your standard is ${view.standard}%.`] : ['Nothing was planned this week.']}
            />
            <Stat panel label="Debrief streak" value={String(view.streak)} unit={view.streak === 1 ? 'week' : 'weeks'} note={view.streakLine} />
          </StatGroup>
          {view.coach && (
            <div className="deb-share">
              <SwitchRow label={`Share with ${view.coach}`} note={shareLine(view.coach, shared)} checked={shared} onChange={share} />
            </div>
          )}
        </div>
      ),
    },
  ];

  const backTo = location.state?.from || '/performance-sprint';
  const draftKey = `debrief-${userId}-${key}`;

  const finish = async () => {
    // Anything still waiting for its delay goes first, so the score is frozen with it.
    const w = takeWaiting();
    for (const l of w.logs) await sent(() => saveHabitLog(userId, l.habitId, l.day, l.value));
    for (const op of w.figs) await sent(() => saveOrQueue(userId, op));
    const ok = await sendAnswers({ status: 'finished', finished_at: new Date().toISOString() });
    if (!ok) return;
    setData((d) => ({ ...d, debrief: { ...(d.debrief || {}), status: 'finished' }, allDebriefs: [...(d.allDebriefs || []).filter((x) => !(x.sprint_id === sprintId && x.sprint_week === week)), { sprint_id: sprintId, sprint_week: week, status: 'finished' }] }));
    // Finalise the week's score (M0.4) through the database's own
    // freeze_week, once everything this page saved has arrived; offline,
    // the sprint page freezes it on its next visit.
    if (isOnline() && waitingToSend(userId) === 0) {
      try {
        await freezeWeek(sprintId, week);
      } catch {
        // Best effort: frozen on the next visit.
      }
    }
    clearAnswersDraft();
    clearDraft(userId, `debrief:${key}`);
    clearGuideDraft(draftKey);
    toast.show(finishToast(view, shared));
    navigate(backTo, { replace: true });
  };

  const close = () => {
    if (waiting.current) sendAnswers();
    if (!view.finished) toast.show(`Saved as a draft, so you can finish it by ${view.window.closesOnText}.`);
    navigate(backTo, { replace: true });
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name="Weekly performance debrief"
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel="Finish my debrief"
        saveState={save}
        draftKey={draftKey}
        initialStep={view.finished ? 'summary' : undefined}
        onClose={close}
        onFinish={finish}
      />
      <AddWinPanel
        open={panel === 'win'}
        onClose={() => setPanel(null)}
        form={winForm}
        onFormChange={setWinForm}
        strategies={view.strategies}
        days={view.winDays}
        onAdd={addWin}
      />
      {view.nextWeek && (
        <AddTodoPanel
          open={panel === 'todo'}
          onClose={() => setPanel(null)}
          form={todoForm}
          onFormChange={setTodoForm}
          strategies={view.strategies}
          weeks={view.nextWeek.weekOptions}
          onAdd={addTodo}
        />
      )}
    </div>
  );
}
