import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import {
  AddButton,
  AddTodoPanel,
  Button,
  Choice,
  ErrorMessage,
  GuidedSummary,
  GuidedTool,
  Loading,
  MultiChoice,
  NotePanel,
  PageHeader,
  Stat,
  Stepper,
  TextBox,
  WhoSees,
  clearGuideDraft,
  useToast,
} from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { deviceKey, readJson, writeJson } from '../../lib/deviceStore';
import { friendlyError } from '../../lib/friendlyError';
import { keepForLater, newId, saveOrQueue, useQueueState } from '../../lib/syncQueue';
import { createDayPlan, dayPlanAnswersOp, loadDayPlan, loadDayPlanRow, saveTodo, setTodoDeleted } from '../../lib/performance/api';
import { useLatestWhenSuperseded } from '../../lib/performance/hooks';
import {
  DAY_TEXT_MAX,
  GRATITUDE_EXAMPLE,
  MAX_DAY_STRATEGIES,
  MAX_DAY_TODOS,
  SLEEP_MAX_HOURS,
  SLEEP_QUALITY_OPTIONS,
  WAY_MAX,
  WAY_SUGGESTIONS,
  answersFromRow,
  answersToRow,
  dayName,
  dayPlanView,
  dayStrategyOps,
  dayTodoOps,
  hoursWords,
  ifItHappens,
  localToday,
  sleepToConfirm,
  sleepWords,
} from '../../lib/performance';
import './performance.css';

// Plan my day (mock-up M5, version 19, approved by Tim on 23 Oct; read in
// full with its notes). One guided tool, one question per screen on phone
// and desktop, with the % complete bar (the approved rule over M5's step
// list), "~4 minutes" on the first screen and the eye on every answer:
//   Sleep      "How did you sleep last night?" Total hours (half hours)
//              and Quality, skippable (day_plans, the same row as
//              Recovery's Sleep tile)
//   Gratitude  "What’s one thing you’re grateful for today?"
//   Be         "How do you want to be today?" own words, recent ones, three suggestions
//   Do         "What will you do today?" up to three from last night's
//              list, this week's to-dos and weekly habits; last night's
//              note; Add a to-do
//   Priority   "Which one is your highest priority?" on its own screen
//   Strategy   "Which Strategies does today serve most?" one recommended, two at most
//   Risk       "What’s the biggest risk to today?" two boxes
//   Your day   the summary, with the score this week so far; Set my day
// One extra question can go near the top later (Peak moments and the sleep
// wind down come in a follow-up): it is one more entry in `steps`.
//
// Everything saves as it goes: the answers into today's day_plans row a
// moment after typing pauses, each choice at once, all through the offline
// queue (Saving, Will sync, Saved) with the version it was based on.
// Typing is kept as a draft on the device and the step is remembered, so
// a refresh carries on where it was. The to-dos chosen are the sprint's
// own (day_plan_todos), so the sprint page and its score see them; a
// habit chosen for the day has no table yet and is kept on the device.

const SAVE_AFTER_MS = 800;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const cacheName = (date) => `day-plan:${date}`;
const draftName = (date) => `day-plan:${date}`;
const stepKey = (userId, date) => `day-plan-${userId}-${date}`;
const localKey = (userId, date) => deviceKey('day-plan-local', userId, date);

export default function PlanMyDay() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const params = useParams();
  const today = localToday();
  const date = isDay(params.date) ? params.date : today;
  const loaded = useCachedLoad({ userId, name: cacheName(date), load: () => loadDayPlan(userId, date), deps: [date] });
  useLatestWhenSuperseded(loaded.reload);

  if (!loaded.data && loaded.error) {
    return (
      <Shell>
        <ErrorMessage keepsHappening>Your day didn’t load. Check your connection and try again.</ErrorMessage>
      </Shell>
    );
  }
  if (!loaded.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your day" className="ds-loading--page" /></div>;
  }
  return <PlanFlow key={`${userId}:${date}`} userId={userId} date={date} today={today} loaded={loaded} />;
}

function Shell({ children }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <PageHeader title="Plan my day" />
        {children}
        <div className="ds-actions ipp-actions">
          <Button onClick={() => navigate('/performance-sprint')}>Open my sprint</Button>
        </div>
      </div>
    </div>
  );
}

function PlanFlow({ userId, date, today, loaded }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queue = useQueueState();
  const { data, setData } = loaded;

  // What the device keeps for the day: the habits chosen, the order of the
  // choices and a habit at the top (no table holds a habit chosen for a day).
  const [local, setLocalState] = useState(() => readJson(localKey(userId, date)) || {});
  const setLocal = useCallback((fn) => setLocalState((l) => {
    const next = typeof fn === 'function' ? fn(l) : fn;
    writeJson(localKey(userId, date), next);
    return next;
  }), [userId, date]);

  const view = useMemo(() => dayPlanView(data, { date, local }), [data, date, local]);
  const [answers, setAnswers] = useState(() => answersFromRow(data.dayPlan));
  const [confirmed, setConfirmed] = useState(() => (data.dayPlan && !data.dayPlan.sleep_to_confirm ? Number(data.dayPlan.sleep_hours) : null));
  const [save, setSave] = useState('idle');
  const [panel, setPanel] = useState(false);
  const firstStrategy = view.dayStrategies[0] || view.strategies[0]?.value || null;
  const [todoForm, setTodoForm] = useState(() => ({ text: '', strategyId: firstStrategy, impact: 2 }));

  const planId = useRef(data.dayPlan?.id || null);
  const creating = useRef(null);
  const typedYet = useRef(false);
  const timer = useRef(null);
  const waiting = useRef(null); // the answers waiting for their delay
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { if (data.dayPlan?.id) planId.current = data.dayPlan.id; }, [data.dayPlan?.id]);
  // A fresher copy from the server (the device's showed first): its
  // answers come in, unless something has been typed here already.
  useEffect(() => {
    if (!typedYet.current && data.dayPlan?.updated_at) setAnswers(answersFromRow(data.dayPlan));
  }, [data.dayPlan?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const { clear: clearTodoDraft } = useDraft({
    userId,
    name: `${draftName(date)}:todo`,
    value: panel ? todoForm : null,
    ready: true,
    onRestore: (d) => { if (d?.text) { setTodoForm(d); setPanel(true); } },
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

  // The day's row, made once with its id from the device, so its to-dos
  // and Strategies can follow it at once, offline too.
  const ensurePlan = () => {
    if (planId.current) return Promise.resolve(planId.current);
    if (!creating.current) {
      creating.current = (async () => {
        const id = newId();
        const r = await createDayPlan(userId, id, date);
        let real = id;
        // Already there (Recovery's Sleep tile, or another window): use that row.
        if (r?.status === 'saved' && !r.data?.length) real = (await loadDayPlanRow(userId, date))?.id || id;
        planId.current = real;
        setData((d) => ({ ...d, dayPlan: { ...(d.dayPlan || {}), id: real, local_date: date, status: d.dayPlan?.status || 'draft' } }));
        return real;
      })().catch((e) => {
        creating.current = null;
        throw e;
      });
    }
    return creating.current;
  };

  const answersOp = (a, extra = {}) => dayPlanAnswersOp(userId, date, { ...answersToRow(a), ...extra });

  const sendAnswers = (extra = {}) => {
    clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
    const a = answersRef.current;
    return sent(async () => {
      await ensurePlan();
      // The device's copy of the page learns the answers too, so the
      // next visit shows them at once, offline as well.
      setData((d) => ({ ...d, dayPlan: { ...(d.dayPlan || {}), ...answersToRow(a), ...extra } }));
      return saveOrQueue(userId, answersOp(a, extra));
    });
  };

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

  // Closing or refreshing with answers still waiting keeps them on the
  // device, sent on the next start; leaving the page sends them now.
  useEffect(() => {
    const onHide = () => {
      if (!waiting.current || !planId.current) return;
      keepForLater(userId, answersOp(waiting.current));
      waiting.current = null;
      clearTimeout(timer.current);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      if (waiting.current) {
        clearTimeout(timer.current);
        const a = waiting.current;
        waiting.current = null;
        ensurePlan().then(() => saveOrQueue(userId, answersOp(a))).catch(() => null);
      }
    };
    // Once, for the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ the day's to-dos

  // Where the database is now (or will be once the queue has sent it).
  const dbTodos = useRef({ todos: view.pickedTodoIds, top: view.topTodoId });
  useEffect(() => {
    dbTodos.current = { todos: (data.dayTodos || []).map((t) => t.todo_id), top: (data.dayTodos || []).find((t) => t.is_top)?.todo_id || null };
  }, [data.dayTodos]);

  const applyPicks = async (keys, top) => {
    const todos = keys.filter((k) => k.startsWith('todo:')).map((k) => k.slice(5));
    const topTodo = top && top.startsWith('todo:') ? top.slice(5) : null;
    setLocal((l) => ({ ...l, habits: keys.filter((k) => k.startsWith('habit:')).map((k) => k.slice(6)), order: keys, top }));
    setData((d) => ({ ...d, dayTodos: todos.map((id) => ({ todo_id: id, is_top: id === topTodo })) }));
    const before = dbTodos.current;
    const after = { todos, top: topTodo };
    dbTodos.current = after;
    const ops = () => dayTodoOps(userId, planId.current, before, after);
    if (before.todos.join() === after.todos.join() && before.top === after.top) return true;
    return sent(async () => {
      await ensurePlan();
      let last = null;
      for (const op of ops()) last = await saveOrQueue(userId, op);
      return last;
    });
  };

  // A thing from last night's list becomes a to-do only when chosen
  // (decisions 23 Oct, 12:58), on this week of the sprint.
  const todoFromNight = async (option) => {
    const id = newId();
    const row = {
      id, strategy_id: view.nightStrategyId, text: option.text, impact: 2, sprint_id: view.sprintId, planned_week: view.week,
      created_on: date, done_on: null, source: 'review_my_day', source_id: view.review.id, move_on: null, deleted_at: null,
    };
    const listKey = view.running ? 'todos' : 'looseTodos';
    setData((d) => ({ ...d, [listKey]: [...(d[listKey] || []), row] }));
    const ok = await sent(() => saveTodo(userId, { id, strategyId: row.strategy_id, text: row.text, impact: 2, sprintId: row.sprint_id, week: row.planned_week, createdOn: date, source: 'review_my_day', sourceId: row.source_id }));
    if (!ok) {
      setData((d) => ({ ...d, [listKey]: (d[listKey] || []).filter((t) => t.id !== id) }));
      return null;
    }
    return `todo:${id}`;
  };

  const choosePicks = async (values) => {
    const added = values.find((v) => !view.picks.includes(v));
    const removed = view.picks.find((v) => !values.includes(v));
    let keys = values.filter((v) => !v.startsWith('night:'));
    if (added?.startsWith('night:')) {
      if (!view.nightStrategyId) return;
      const option = view.options.find((o) => o.value === added);
      const key = await todoFromNight(option);
      if (!key) return;
      keys = [...keys, key];
    }
    if (keys.length > MAX_DAY_TODOS) return;
    const top = keys.includes(view.top) ? view.top : keys[0] || null;
    await applyPicks(keys, top);
    // Unchosen the same day it was made from last night's list: it goes
    // back to being only on that list, out of the sprint.
    if (removed?.startsWith('todo:')) {
      const id = removed.slice(5);
      const row = [...(data.todos || []), ...(data.looseTodos || [])].find((t) => t.id === id);
      if (row && row.source === 'review_my_day' && row.source_id === view.review?.id && row.created_on === date) {
        const listKey = view.running ? 'todos' : 'looseTodos';
        setData((d) => ({ ...d, [listKey]: (d[listKey] || []).filter((t) => t.id !== id) }));
        sent(() => setTodoDeleted(userId, id, new Date().toISOString()));
      }
    }
  };

  const chooseTop = (key) => applyPicks(view.picks, key);

  const chooseStrategies = (ids) => {
    if (ids.length > MAX_DAY_STRATEGIES) return;
    const before = view.dayStrategies;
    setData((d) => ({ ...d, dayStrategies: ids.map((strategy_id) => ({ strategy_id })) }));
    sent(async () => {
      await ensurePlan();
      let last = null;
      for (const op of dayStrategyOps(userId, planId.current, before, ids)) last = await saveOrQueue(userId, op);
      return last;
    });
  };

  const addTodo = async (form) => {
    const id = newId();
    const room = view.picks.length < MAX_DAY_TODOS;
    setPanel(false);
    setTodoForm({ text: '', strategyId: firstStrategy, impact: 2 });
    clearTodoDraft();
    const ok = await sent(async () => {
      const dayId = await ensurePlan();
      return saveTodo(userId, { id, strategyId: form.strategyId, text: form.text.trim(), impact: form.impact, sprintId: view.sprintId, week: view.week, createdOn: date, source: 'plan_my_day', sourceId: dayId });
    });
    if (!ok) {
      setTodoForm(form);
      setPanel(true);
      return;
    }
    const row = {
      id, strategy_id: form.strategyId, text: form.text.trim(), impact: form.impact, sprint_id: view.sprintId, planned_week: view.week,
      created_on: date, done_on: null, source: 'plan_my_day', source_id: planId.current, move_on: null, deleted_at: null,
    };
    const listKey = view.running ? 'todos' : 'looseTodos';
    setData((d) => ({ ...d, [listKey]: [...(d[listKey] || []), row] }));
    if (room) await applyPicks([...view.picks, `todo:${id}`], view.top || `todo:${id}`);
    const where = view.running ? 'this week’s sprint' : 'your to-dos';
    toast.show(room ? `Added to today and ${where}.` : `Added to ${where}. Today already has three to-dos.`);
  };

  // ------------------------------------------------------------ the steps

  const eye = <div className="ds-label-row ds-label-row--solo"><WhoSees audience="me" /></div>;
  // An odd night (outside 2 to 14 hours, M12) is asked about once.
  const odd = sleepToConfirm(answers.hours, confirmed !== answers.hours);
  const noPlan = (
    <div className="day-quiet">
      <p>Your to-dos and Strategies come from your plan.</p>
      <p>Build your plan, and they show here.</p>
      <Button className="day-quiet-btn" onClick={() => navigate('/performance-plan/build')}>Build my plan</Button>
    </div>
  );
  const stepIndex = (key) => steps.findIndex((s) => s.key === key);

  const steps = [
    {
      key: 'sleep',
      name: 'Sleep',
      label: '~4 minutes',
      question: 'How did you sleep last night?',
      render: () => (
        <div className="day-narrow">
          <div className="ds-label-row">
            <span className="ds-label-row-text">Total hours</span>
            <WhoSees audience="me" />
          </div>
          <Stepper
            label="Total hours"
            value={answers.hours}
            onChange={(hours) => change({ hours })}
            min={0}
            max={SLEEP_MAX_HOURS}
            step={0.5}
            startFrom={7}
            lessLabel="Half an hour less"
            moreLabel="Half an hour more"
            format={(v) => `${v}`}
            unit="hours"
          />
          {odd && (
            <div className="day-confirm">
              <p>{`Is ${hoursWords(answers.hours)} right?`}</p>
              <Button
                variant="text"
                onClick={() => {
                  setConfirmed(answers.hours);
                  sendAnswers({ sleep_to_confirm: false });
                }}
              >
                Yes, that’s right
              </Button>
            </div>
          )}
          <div className="day-gap">
            <Choice label="Quality" form="rows" options={SLEEP_QUALITY_OPTIONS} value={answers.quality} onChange={(quality) => change({ quality })} />
          </div>
        </div>
      ),
    },
    {
      key: 'gratitude',
      name: 'Gratitude',
      question: 'What’s one thing you’re grateful for today?',
      nudges: ['It can be something small.'],
      example: GRATITUDE_EXAMPLE,
      render: () => (
        <TextBox ariaLabel="One thing you’re grateful for today" who="me" maxLength={DAY_TEXT_MAX} value={answers.grateful} onChange={(grateful) => change({ grateful })} />
      ),
    },
    {
      key: 'be',
      name: 'Be',
      question: 'How do you want to be today?',
      nudges: ['Choose one way of being for today.'],
      render: () => {
        const pick = (list, name) => (
          <Choice ariaLabel={name} form="rows" options={list.map((w) => ({ value: w, label: w }))} value={list.find((w) => w === answers.way.trim()) ?? null} onChange={(way) => change({ way })} />
        );
        return (
          <div>
            <TextBox ariaLabel="How you want to be today" who="me" lines="one" maxLength={WAY_MAX} value={answers.way} onChange={(way) => change({ way })} />
            {view.recent.length > 0 && (
              <>
                <p className="day-sgh">You’ve used these recently.</p>
                {pick(view.recent, 'Ways of being you’ve used recently')}
              </>
            )}
            <p className="day-sgh">{view.recent.length ? 'Or try one of these.' : 'Try one of these.'}</p>
            {pick(WAY_SUGGESTIONS.filter((w) => !view.recent.includes(w)), 'Suggested ways of being')}
          </div>
        );
      },
    },
    {
      key: 'do',
      name: 'Do',
      question: 'What will you do today?',
      nudges: ['Choose up to three from this week’s habits and to-dos.'],
      render: () => (!view.hasPlan ? noPlan : (
        <div className="day-narrow">
          {view.options.length ? (
            <MultiChoice
              variant="pick"
              ariaLabel="What will you do today?"
              who="me"
              options={view.options}
              values={view.picks}
              onChange={choosePicks}
              max={MAX_DAY_TODOS}
            />
          ) : (
            <>
              {eye}
              <p className="day-quiet-line">Nothing is on this week’s list yet.</p>
            </>
          )}
          {!view.running && <p className="day-quiet-line">No sprint is running, so today’s to-dos aren’t scored yet.</p>}
          {view.note && (
            <NotePanel className="day-note" label={view.note.label} after="If it needs doing, add it as a to-do.">{view.note.text}</NotePanel>
          )}
          <AddButton className="day-add" onClick={() => setPanel(true)}>Add a to-do</AddButton>
        </div>
      )),
    },
    {
      key: 'priority',
      name: 'Priority',
      question: 'Which one is your highest priority?',
      nudges: ['It comes first on Home and in Review my day.'],
      render: (tool) => (view.picks.length ? (
        <div className="day-narrow">
          {eye}
          <Choice
          ariaLabel="Which one is your highest priority?"
          form="rows"
          options={view.ordered.map((o) => ({ value: o.value, label: o.label }))}
          value={view.top}
          onChange={chooseTop}
          />
        </div>
      ) : (
        <div className="day-quiet">
          <p>You haven’t chosen any to-dos yet.</p>
          <Button variant="text" onClick={() => tool.go(stepIndex('do'))}>Choose my to-dos</Button>
        </div>
      )),
    },
    {
      key: 'strategy',
      name: 'Strategy',
      question: 'Which Strategies does today serve most?',
      nudges: ['One is best, so the day has a clear focus.', 'You can choose two if you need to.', 'Review my day will ask how they moved tonight.'],
      render: () => (!view.hasPlan ? noPlan : (
        <div className="day-narrow">
        <MultiChoice
          ariaLabel="Which Strategies does today serve most?"
          who="me"
          options={view.strategies}
          values={view.dayStrategies}
          onChange={chooseStrategies}
          max={MAX_DAY_STRATEGIES}
        />
        </div>
      )),
    },
    {
      key: 'risk',
      name: 'Risk',
      question: 'What’s the biggest risk to today?',
      nudges: ['Name what could knock today off course.', 'Then decide what you’ll do if it happens.'],
      render: () => (
        <div className="day-stack">
          <TextBox label="What could knock today off course?" who="me" maxLength={DAY_TEXT_MAX} value={answers.risk} onChange={(risk) => change({ risk })} />
          <TextBox label="If it happens, what will you do?" who="me" maxLength={DAY_TEXT_MAX} value={answers.response} onChange={(response) => change({ response })} />
        </div>
      ),
    },
    {
      key: 'summary',
      name: 'Your day',
      question: view.firstName ? `Here’s your day, ${view.firstName}.` : 'Here’s your day.',
      nudges: ['Check it over.', 'Change anything you need to.'],
      render: (tool) => {
        const strategyName = new Map(view.strategies.map((s) => [s.value, s.label]));
        return (
          <div>
            <GuidedSummary
              emptyWord="Skipped"
              addWhenEmpty
              onChange={tool.go}
              rows={[
                { label: 'Sleep', value: sleepWords(answers), step: stepIndex('sleep') },
                { label: 'Gratitude', value: answers.grateful.trim(), step: stepIndex('gratitude') },
                { label: 'How you want to be', value: answers.way.trim(), step: stepIndex('be') },
                {
                  label: 'To-dos',
                  value: view.ordered.map((o, i) => (
                    <>
                      {`${i + 1}. ${o.label}`}
                      {i === 0 && <span className="day-tag">Highest priority</span>}
                    </>
                  )),
                  step: stepIndex('do'),
                },
                { label: 'Strategies of the day', value: view.dayStrategies.map((id) => strategyName.get(id)), step: stepIndex('strategy') },
                { label: 'Biggest risk', value: answers.risk.trim(), sub: ifItHappens(answers.response), step: stepIndex('risk') },
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
  ];

  const backTo = location.state?.from || '/performance-sprint';

  const finish = async () => {
    const ok = await sendAnswers({ status: 'finished', finished_at: new Date().toISOString() });
    if (!ok) return;
    setData((d) => ({ ...d, dayPlan: { ...(d.dayPlan || {}), status: 'finished' } }));
    clearAnswersDraft();
    clearDraft(userId, draftName(date));
    clearGuideDraft(stepKey(userId, date));
    // CHOICE: Home doesn't show the day's to-dos until Phase 4, so the
    // toast says where they are now.
    toast.show(view.running ? 'Your day is set, and your to-dos are in this week’s sprint.' : 'Your day is set.');
    navigate(backTo, { replace: true });
  };

  const close = () => {
    if (waiting.current) sendAnswers();
    if (!view.finished) toast.show('Saved as a draft, so you can continue from Home for 24 hours.');
    navigate(backTo, { replace: true });
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name={date === today ? 'Plan my day' : `Plan my day, ${dayName(date, today)}`}
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel="Set my day"
        saveState={save}
        draftKey={stepKey(userId, date)}
        initialStep={view.finished || date < today ? 'summary' : undefined}
        onClose={close}
        onFinish={finish}
      />
      <AddTodoPanel
        open={panel}
        onClose={() => setPanel(false)}
        form={todoForm}
        onFormChange={setTodoForm}
        strategies={view.strategies}
        todayNote={view.running ? 'It’s added to today and to this week’s sprint.' : 'It’s added to today and to your to-dos.'}
        onAdd={addTodo}
      />
    </div>
  );
}
