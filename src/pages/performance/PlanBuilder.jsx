import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import {
  AddLink,
  CardHead,
  AlignmentCheck,
  Button,
  Dropdown,
  FieldLabel,
  GuidedSummary,
  GuidedTool,
  HabitEditor,
  IconButton,
  Loading,
  MultiChoice,
  ObjectiveEditor,
  SprintDial,
  SprintLengthChoice,
  SprintStartChoice,
  StandardChoice,
  TextBox,
  WhoSees,
  clearGuideDraft,
  dayLabel,
  nextMondayKey,
  useToast,
  LoadError,
} from '../../components/design';
import { readCache, writeCache } from '../../lib/pageCache';
import { useDraft, clearDraft } from '../../lib/drafts';
import { isNetworkError } from '../../lib/connection';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import {
  loadPlanEditor,
  saveSharing,
} from '../../lib/performance/api';
import {
  MAX_OBJECTIVES,
  MISSION_MAX,
  NAME_MAX,
  WORKING_DAY_OPTIONS,
  alignmentCheck,
  alignmentLines,
  applySave,
  draftFromRows,
  draftMission,
  emptyHabit,
  emptyObjective,
  habitsQuestion,
  habitsWords,
  localToday,
  namedObjectives,
  objectiveComplete,
  objectiveSummary,
  removeObjective,
  removeStrategyFrom,
  savableRows,
  servesNames,
  sprintSetupFrom,
  sprintStandard,
  sprintWeeks,
  startingSprint,
  switchIsOn,
  unusedIdeas,
  versionLabel,
  withMeasure,
  workingDaysWords,
} from '../../lib/performance';
import { keepSprintSetup } from '../../lib/performance/sprintSetup';
import usePlanSaves from './usePlanSaves';
import CommitTodo from './CommitTodo';
import { COMMIT_NEEDED, PLAN_FIRST_QUESTION, commitTodo } from '../../lib/performance/commitQuestions';
import { MISSION_EXAMPLE, MISSION_PLACEHOLDER, STRATEGY_IDEAS, exampleRole } from '../../content/planBuilder';
import './performance.css';
import { TOOL_CLOSED } from '../../content/pageLines/client';

// Build your plan, and editing it afterwards (mock-up M6, "Build your
// plan"; read in full with its notes). One guided tool, one question per
// screen, with the % complete bar (the approved rule over M6's step list):
// My Mission, Outcome Objectives, one Strategies screen per named
// objective, habits, then for a new plan the working days (decisions 26
// Oct, 14:38: "M6 set-up gets the question"), the first sprint's length,
// start and standard, and Ready. Editing uses the same steps, without the
// sprint's (Start a sprint asks those each time).
//
// Everything saves as you go (Saving, Saved, Will sync offline): each
// change is written once it is complete enough for the tables, and until
// then it waits in the draft on the device (src/lib/performance/builder.js).
// A plan's version is kept when the plan is first finished (1.0) and,
// when editing, each time the editor is left after a change, major or
// minor by the rules in versions.js.
//
// The first sprint's length, start and standard are handed to Start a
// sprint, which creates the sprint (Phase 2 step 3).

const CACHE = 'performance-plan-editor';
const draftName = (mode) => `performance-plan:${mode}`;
const stepDraftKey = (mode, userId) => `performance-plan-${mode}-${userId}`;
const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';

// Moves focus to a box that has just been added, once it is on screen.
function focusSoon(id) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus()));
}

export default function PlanBuilder({ editing = false }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const { search } = useLocation();
  const [state, setState] = useState({ data: null, error: null });

  // The plan as it stands now, fresh from the server: the editor writes
  // over it, so it never starts from an old copy. Offline, the device's
  // copy is used, and the saves wait in the queue.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadPlanEditor(userId).then((data) => {
      if (!live) return;
      writeCache(userId, CACHE, data);
      setState({ data, error: null });
    }).catch((error) => {
      if (!live) return;
      const cached = isNetworkError(error) ? readCache(userId, CACHE) : null;
      setState(cached ? { data: cached.v, error: null } : { data: null, error });
    });
    return () => { live = false; };
  }, [userId]);

  if (state.error) {
    return (
      <div className="ui-root plan-builder-wait">
        <LoadError>Your plan didn’t load. Check your connection and try again.</LoadError>
      </div>
    );
  }
  if (!state.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your plan" className="ds-loading--page" /></div>;
  }
  // A plan with a version is edited; one without is still being built
  // (never a second active plan).
  // The address's question (?step=mission, the header's pill) goes along.
  const mode = state.data.plan && state.data.latestVersion ? 'edit' : 'build';
  if (mode === 'edit' && !editing) return <Navigate to={`/performance-plan/edit${search}`} replace />;
  if (mode === 'build' && editing) return <Navigate to={`/performance-plan/build${search}`} replace />;
  return <PlanTool key={`${userId}-${mode}`} userId={userId} data={state.data} mode={mode} />;
}

function PlanTool({ userId, data, mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { mission: oldMission } = useContext(MissionContext) || {};
  const building = mode === 'build';
  const today = localToday();
  const role = exampleRole(data.personSettings?.describes_you);
  const ideas = STRATEGY_IDEAS[role];
  const fixedStandard = data.fixedStandard ?? null;
  const coachName = data.coach?.firstName || null;
  const params = new URLSearchParams(location.search);
  const askedStrategy = params.get('strategy');

  // The draft starts from what is saved. A new plan starts with one empty
  // objective, the first sprint as M6 suggests it, and the old mission
  // (the live portal's) to start from, if there was one.
  const [initial] = useState(() => {
    const d = draftFromRows(data, { planId: newId(), sprint: startingSprint(nextMondayKey(today)) });
    if (building && !d.objectives.length) d.objectives = [emptyObjective(newId())];
    if (building && !d.mission && oldMission) d.mission = String(oldMission).slice(0, MISSION_MAX);
    if (askedStrategy && d.strategies.some((s) => s.id === askedStrategy)) d.habitStrategy = askedStrategy;
    return d;
  });
  const [draft, setDraft] = useState(initial);
  const [run, setRun] = useState(0); // a new run of the tool after a finish that didn't save
  const set = useCallback((patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })), []);

  // Typing is kept on the device and put back after a refresh ("Draft
  // restored"), as long as it is for this same plan.
  const { clear: clearOwnDraft } = useDraft({
    userId,
    name: draftName(mode),
    value: draft,
    ready: true,
    onRestore: (d) => {
      if (!d || !Array.isArray(d.objectives)) return;
      if (data.plan && d.planId !== data.plan.id) return;
      setDraft({ ...initial, ...d });
    },
  });

  // ------------------------------------------------------------ saving
  // One engine for building, editing and changing one part (usePlanSaves).
  const { draftRef, savedRef, planExistsRef, send, sync, keepVersion, shownState } = usePlanSaves({ userId, data, draft, initial, today });

  const forget = () => {
    clearOwnDraft();
    clearDraft(userId, draftName('build'));
    clearDraft(userId, draftName('edit'));
    clearGuideDraft(stepDraftKey('build', userId));
    clearGuideDraft(stepDraftKey('edit', userId));
  };

  const leaving = useRef(false);
  const close = async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      if (draftRef.current !== initial) await sync();
      let message = TOOL_CLOSED;
      if (!building) {
        const v = await keepVersion(false);
        message = v ? `Saved. Your plan is now ${versionLabel(v)}.` : 'Saved';
      }
      navigate('/performance-plan', { replace: true, state: { toast: message } });
    } catch {
      leaving.current = false;
    }
  };

  const finish = async () => {
    if (leaving.current) return;
    leaving.current = true;
    const tryAgain = () => {
      leaving.current = false;
      setRun((n) => n + 1);
    };
    try {
      await sync();
    } catch {
      tryAgain(); // sync has said what happened
      return;
    }
    try {
      if (building) {
        if (!planExistsRef.current) {
          const op = { kind: 'plan', row: savableRows(draftRef.current, today).plan };
          await send(op);
          savedRef.current = applySave(savedRef.current, op);
          planExistsRef.current = true;
        }
        await keepVersion(true);
        const commit = commitTodo(draftRef.current.firstStep, draftRef.current.firstStepStrategy, savableRows(draftRef.current, today).strategies);
        // The commit answer rides with the first sprint, as a to-do in its week 1 (Stage D, Draft 11).
        const setup = { ...sprintSetupFrom(draftRef.current.sprint, fixedStandard), firstTodo: commit ? { ...commit, createdOn: today } : null };
        keepSprintSetup(userId, setup);
        forget();
        navigate('/performance-sprint/start', { replace: true, state: { sprintSetup: setup, toast: 'Saved' } });
        return;
      }
      const v = await keepVersion(false);
      forget();
      navigate('/performance-plan', { replace: true, state: { toast: v ? `Saved. Your plan is now ${versionLabel(v)}.` : 'Saved' } });
    } catch (e) {
      toast.error(friendlyError(e, SAVE_ERROR));
      tryAgain();
    }
  };

  // ------------------------------------------------------------ who sees it
  const [switches, setSwitches] = useState(data.switches || []);
  const who = (part, name) => {
    if (!coachName) return { audience: 'me' };
    const shared = switchIsOn(switches, part);
    return {
      audience: shared ? 'coach' : 'me',
      coachName,
      name,
      onChange: async (next) => {
        await saveSharing(userId, part, next === 'coach');
        setSwitches((list) => [...list.filter((s) => s.part !== part), { part, is_on: next === 'coach' }]);
      },
    };
  };
  const missionWho = who('mission', 'Your Mission');
  const progressWho = who('progress', 'Your Outcome Objective figures and scores');

  // ------------------------------------------------------------ edits
  const changeObjective = (id, patch) => set((d) => ({ objectives: d.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const changeStrategy = (id, patch) => set((d) => ({ strategies: d.strategies.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const changeHabit = (id, patch) => set((d) => ({
    habits: d.habits.map((h) => (h.id === id ? (patch.measure ? withMeasure({ ...h, ...patch }, patch.measure) : { ...h, ...patch }) : h)),
  }));

  // Deleting happens straight away, with "Deleted" and Undo (writing rule 14).
  const removeWithUndo = (next, restore) => {
    setDraft(next);
    toast.saved({ message: 'Deleted', onUndo: () => setDraft(restore) });
  };

  const addObjective = () => {
    const o = emptyObjective(newId());
    set((d) => ({ objectives: [...d.objectives, o] }));
    focusSoon(`plan-objective-${o.id}`);
  };

  const addStrategy = (objectiveId, name = '') => {
    const s = { id: newId(), name, description: null, objectiveIds: objectiveId ? [objectiveId] : [] };
    set((d) => ({ strategies: [...d.strategies, s], habitStrategy: d.habitStrategy || s.id }));
    focusSoon(`plan-strategy-${s.id}`);
  };

  const serveToo = (strategyId, objectiveId) => set((d) => ({
    strategies: d.strategies.map((s) => (s.id === strategyId && !s.objectiveIds.includes(objectiveId)
      ? { ...s, objectiveIds: [...s.objectiveIds, objectiveId] } : s)),
  }));

  const namedStrategies = draft.strategies.filter((s) => (s.name || '').trim());
  const habitStrategyId = namedStrategies.some((s) => s.id === draft.habitStrategy) ? draft.habitStrategy : namedStrategies[0]?.id;

  const addHabit = () => {
    if (!habitStrategyId) return;
    const h = emptyHabit(newId(), habitStrategyId);
    set((d) => ({ habits: [...d.habits, h] }));
    focusSoon(`plan-habit-${h.id}`);
  };

  // ------------------------------------------------------------ steps
  const named = namedObjectives(draft);
  const rows = savableRows(draft, today);

  const missionStep = {
    key: 'mission',
    name: 'Mission',
    question: 'What’s your Mission?',
    example: MISSION_EXAMPLE,
    nextLabel: 'Save my Mission',
    // The eye beside the question (rule 29d, Tim, 5 Nov).
    eye: <WhoSees {...missionWho} />,
    render: () => (
      <div>
        <TextBox
          ariaLabel="My Mission"
          value={draft.mission}
          maxLength={MISSION_MAX}
          onChange={(mission) => set({ mission })}
          placeholder={MISSION_PLACEHOLDER[role]}
        />
        {draft.help?.open ? (
          <div className="plan-help-card">
            <TextBox
              label="What do you want to be known for?"
              value={draft.help.known}
              onChange={(known) => set((d) => ({ help: { ...d.help, known } }))}
            />
            <TextBox label="Who do you serve?" value={draft.help.serve} onChange={(serve) => set((d) => ({ help: { ...d.help, serve } }))} />
            <TextBox label="What does great look like in 3 years?" value={draft.help.great} onChange={(great) => set((d) => ({ help: { ...d.help, great } }))} />
            <div className="plan-help-act">
              <Button onClick={() => set((d) => ({ mission: draftMission(d.help) }))}>Draft my Mission</Button>
            </div>
          </div>
        ) : (
          <Button variant="text" className="plan-help-link" onClick={() => set((d) => ({ help: { ...d.help, open: true } }))}>
            Not sure? Answer 3 questions
          </Button>
        )}
      </div>
    ),
  };

  const objectivesStep = {
    key: 'objectives',
    name: 'Objectives',
    question: 'What 2 to 4 results would show your Mission is moving?',
    tip: { key: 'performance-plan-saves', text: 'Everything saves as you go.' },
    eye: <WhoSees {...progressWho} />,
    render: () => (
      <div>
        {/* "+ Add" at the right of the list's label (Polish 1, rule 10). */}
        <CardHead label="Your objectives" as="h3" add={draft.objectives.length < MAX_OBJECTIVES ? <AddLink label="Add an objective" onClick={addObjective} /> : null} />
        {draft.objectives.map((o, i) => (
          <ObjectiveEditor
            key={o.id}
            nameId={`plan-objective-${o.id}`}
            objective={o}
            startLabel={o.saved && !building ? 'Where did you start?' : 'Where are you now?'}
            onChange={(patch) => changeObjective(o.id, patch)}
            onRemove={() => {
              const before = draft;
              removeWithUndo(removeObjective(draft, o.id), {
                ...draftRef.current,
                objectives: [...draftRef.current.objectives.slice(0, i), o, ...draftRef.current.objectives.slice(i)],
                strategies: draftRef.current.strategies.map((s) => {
                  const had = before.strategies.find((x) => x.id === s.id)?.objectiveIds.includes(o.id);
                  return had && !s.objectiveIds.includes(o.id) ? { ...s, objectiveIds: [...s.objectiveIds, o.id] } : s;
                }),
              });
            }}
          />
        ))}
      </div>
    ),
  };

  const strategyRows = (list, objectiveId) => (
    <div className="plan-srows">
      {list.map((s, j) => (
        <div key={s.id} className="plan-srow">
          <span className="plan-srow-n" aria-hidden="true">{j + 1}</span>
          <TextBox
            id={`plan-strategy-${s.id}`}
            lines="one"
            ariaLabel={`Strategy ${j + 1}`}
            maxLength={NAME_MAX}
            value={s.name}
            onChange={(name) => changeStrategy(s.id, { name })}
            placeholder={`e.g. ${ideas[1]}`}
          />
          <IconButton
            label="Remove this Strategy"
            onClick={() => {
              const before = draftRef.current;
              const next = removeStrategyFrom(before, s.id, objectiveId);
              const gone = !next.strategies.some((x) => x.id === s.id);
              removeWithUndo(next, gone
                ? {
                  ...draftRef.current,
                  strategies: [...draftRef.current.strategies.slice(0, before.strategies.indexOf(s)), s, ...draftRef.current.strategies.slice(before.strategies.indexOf(s))],
                  habits: [...draftRef.current.habits, ...before.habits.filter((h) => h.strategyId === s.id)],
                }
                : { ...draftRef.current, strategies: draftRef.current.strategies.map((x) => (x.id === s.id ? s : x)) });
            }}
          />
        </div>
      ))}
    </div>
  );

  const strategyStep = (o, k) => {
    const mine = o ? draft.strategies.filter((s) => s.objectiveIds.includes(o.id)) : draft.strategies;
    const others = o ? draft.strategies.filter((s) => !s.objectiveIds.includes(o.id) && (s.name || '').trim()) : [];
    const fresh = unusedIdeas(draft, ideas);
    return {
      key: o ? `strategies-${o.id}` : 'strategies',
      name: o ? o.name.trim() : 'Strategies',
      // Stage D, Draft 11: their own objective quoted back.
      question: o ? `How will you achieve “${o.name.trim()}”?` : 'How will you achieve your objectives?',
      eye: <WhoSees {...progressWho} />,
      // Nothing under the question but "See an example", with three different examples together (Stage D question
      // rules; the UI tester's question 5); what a Strategy is sits behind the ⓘ on the first, a term a client may not know.
      example: [STRATEGY_IDEAS.ceo[0], STRATEGY_IDEAS.coach[0], STRATEGY_IDEAS.leader[0]],
      info: k === 0 ? 'Strategies are medium to long-term approaches to achieving your objectives.' : undefined,
      render: () => (
        <div>
          <CardHead label={o ? 'Strategies for this objective' : 'Your Strategies'} as="h3" add={<AddLink label="Add a Strategy" onClick={() => addStrategy(o?.id || null)} />} />
          {strategyRows(mine, o?.id || null)}
          {others.length > 0 && (
            <div className="plan-picks">
              <FieldLabel label="Which of your other Strategies help this too?" />
              {others.map((s) => <Button key={s.id} className="plan-pick" onClick={() => serveToo(s.id, o.id)}>{s.name.trim()}</Button>)}
            </div>
          )}
          {fresh.length > 0 && (
            <div className="plan-picks">
              {/* M6's "Need ideas? Pick one, then make it yours." as two lines: one sentence per line (writing rule 49). */}
              <FieldLabel label="Need ideas?" />
              <p className="plan-muted plan-picks-nudge">Pick one, then make it yours.</p>
              {fresh.map((idea) => <Button key={idea} className="plan-pick" onClick={() => addStrategy(o?.id || null, idea)}>{idea}</Button>)}
            </div>
          )}
        </div>
      ),
    };
  };

  const habitsStep = {
    key: 'habits',
    name: 'Habits',
    // Stage D, Draft 11: the Strategy chosen below, quoted back.
    question: habitsQuestion(namedStrategies.find((s) => s.id === habitStrategyId)?.name),
    // The eye beside the question, once (rule 29d), not at the far edge
    // of the drop-down's label row.
    eye: <WhoSees audience="me" />,
    render: () => {
      if (!habitStrategyId) {
        return (
          <div className="plan-muted-lines">
            <p className="plan-muted">Add a Strategy first.</p>
            <p className="plan-muted">Its habits go here.</p>
          </div>
        );
      }
      const list = draft.habits.filter((h) => h.strategyId === habitStrategyId);
      return (
        <div>
          <Dropdown
            label="Which Strategy?"
            options={namedStrategies.map((s) => ({ value: s.id, label: s.name.trim() }))}
            value={habitStrategyId}
            onChange={(habitStrategy) => set({ habitStrategy })}
          />
          <CardHead label="Your habits" as="h3" add={<AddLink label="Add a habit" onClick={addHabit} />} />
          <div className="plan-habits">
            {list.map((h) => (
              <HabitEditor
                key={h.id}
                nameId={`plan-habit-${h.id}`}
                habit={h}
                onChange={(patch) => changeHabit(h.id, patch)}
                onRemove={() => {
                  const at = draftRef.current.habits.indexOf(h);
                  removeWithUndo(
                    { ...draftRef.current, habits: draftRef.current.habits.filter((x) => x.id !== h.id) },
                    { ...draftRef.current, habits: [...draftRef.current.habits.slice(0, at), h, ...draftRef.current.habits.slice(at)] },
                  );
                }}
              />
            ))}
          </div>
        </div>
      );
    },
  };

  const daysStep = {
    key: 'days',
    name: 'Working days',
    question: 'Which days do you work?',
    // The eye inside the heading, with its last word (rule 29d; Tim, 10 Nov), so the answers have none.
    eye: <WhoSees audience="me" />,
    render: () => (
      <div className="plan-days">
        <MultiChoice
          ariaLabel="Which days do you work?"
          options={WORKING_DAY_OPTIONS}
          values={draft.workingDays}
          onChange={(workingDays) => set({ workingDays })}
        />
        {!draft.workingDays.length && <p className="ds-hint">Pick at least 1 day.</p>}
      </div>
    ),
  };

  const sprint = draft.sprint;
  const setSprint = (patch) => set((d) => ({ sprint: { ...d.sprint, ...patch } }));
  const sprintSteps = [
    {
      key: 'length',
      name: 'Length',
      question: 'How long is your first Performance Sprint?',
      render: () => <SprintLengthChoice sprint={sprint} onChange={setSprint} label="How long is your first Performance Sprint?" />,
    },
    {
      key: 'start',
      name: 'Start',
      question: 'When does it start?',
      render: () => <SprintStartChoice sprint={sprint} onChange={setSprint} />,
    },
    {
      key: 'standard',
      name: 'Standard',
      question: 'What’s your performance standard?',
      render: () => <StandardChoice sprint={sprint} onChange={setSprint} fixed={fixedStandard} />,
    },
  ];

  // The commit question before Ready (Stage D, Draft 11), for a new plan
  // with a Strategy to serve: it can't be skipped, and becomes a to-do in
  // the first sprint's week 1. Editing a plan has no commit question.
  const firstStrategy = rows.strategies.some((s) => s.id === draft.firstStepStrategy) ? draft.firstStepStrategy : rows.strategies[0]?.id || null;
  const firstStep = {
    key: 'first',
    name: 'First step',
    question: PLAN_FIRST_QUESTION,
    required: true,
    eye: <WhoSees audience="me" />,
    check: () => ((draft.firstStep || '').trim() ? null : COMMIT_NEEDED),
    render: () => (
      <CommitTodo
        question={PLAN_FIRST_QUESTION}
        text={draft.firstStep || ''}
        onText={(text) => set({ firstStep: text })}
        strategies={rows.strategies}
        strategyId={firstStrategy}
        onStrategy={(id) => set({ firstStepStrategy: id })}
      />
    ),
  };

  const steps = [
    missionStep,
    objectivesStep,
    ...(named.length ? named.map((o, k) => strategyStep(o, k)) : [strategyStep(null, 0)]),
    habitsStep,
    ...(building ? [daysStep, ...sprintSteps] : []),
    ...(building && rows.strategies.length ? [firstStep] : []),
  ];
  const stepAt = (key) => Math.max(0, steps.findIndex((s) => s.key === key));
  const firstStrategyStep = steps.findIndex((s) => s.key.startsWith('strategies'));

  // Ready: the plan (and the first sprint) on one page, each with Change.
  const readyRows = () => {
    const complete = draft.objectives.filter(objectiveComplete);
    const unfinished = draft.objectives.filter((o) => !objectiveComplete(o) && ((o.name || '').trim() || o.start || o.target || o.date)).length;
    const nameOf = new Map(rows.objectives.map((o) => [o.id, o.name]));
    const habitStrategies = new Set(rows.habits.map((h) => h.strategyId));
    const out = [
      {
        label: 'Outcome Objectives',
        step: stepAt('objectives'),
        value: complete.length || unfinished ? (
          <span className="plan-sum-list">
            {complete.map((o) => (
              <span key={o.id} className="plan-sum-item">
                <span>{o.name.trim()}</span>
                <small>{objectiveSummary(o)}</small>
              </span>
            ))}
            {unfinished > 0 && (
              <small className="plan-sum-note">
                {unfinished === 1 ? 'One objective isn’t finished, so it isn’t saved yet.' : `${unfinished} objectives aren’t finished, so they aren’t saved yet.`}
              </small>
            )}
          </span>
        ) : '',
      },
      {
        label: 'Strategies',
        step: Math.max(0, firstStrategyStep),
        value: rows.strategies.length ? (
          <span className="plan-sum-list">
            {rows.strategies.map((s) => {
              const names = rows.links.filter((l) => l.strategyId === s.id).map((l) => nameOf.get(l.objectiveId));
              return (
                <span key={s.id} className="plan-sum-item">
                  <span>{s.name}</span>
                  <small>{servesNames(names)}</small>
                </span>
              );
            })}
          </span>
        ) : '',
      },
      { label: 'Habits', step: stepAt('habits'), value: habitsWords(rows.habits.length, habitStrategies.size) },
    ];
    if (building) {
      const weeks = sprintWeeks(sprint);
      const std = sprintStandard(sprint, fixedStandard);
      out.push(
        { label: 'Working days', step: stepAt('days'), value: workingDaysWords(draft.workingDays) },
        { label: 'Length', step: stepAt('length'), value: weeks ? `${weeks} weeks${sprint.tpl ? ', for your first 90 days in a new role' : ''}` : '' },
        { label: 'Starts', editName: 'the start date', step: stepAt('start'), value: sprint.start === today ? `Today, ${dayLabel(sprint.start)}` : dayLabel(sprint.start) },
        { label: 'Performance standard', step: stepAt('standard'), value: std != null ? `${std}%` : '' },
      );
      if (rows.strategies.length) out.push({ label: 'First step', editName: 'what you’ll do first', step: stepAt('first'), value: (draft.firstStep || '').trim() });
    }
    return out;
  };

  const check = alignmentCheck(rows.objectives, rows.strategies, rows.links);
  steps.push({
    key: 'ready',
    name: 'Ready',
    title: building ? 'Your plan and first sprint' : 'Your plan',
    nudges: building ? ['Check it, then start.', 'You can change anything later.'] : ['Check it, then save.', 'You can change anything later.'],
    eye: <WhoSees audience="me" />,
    render: (tool) => (
      <div>
        {building && <SprintDial length={sprintWeeks(sprint) ?? 12} />}
        <GuidedSummary rows={readyRows()} onChange={tool.go} />
        {(rows.objectives.length > 0 || rows.strategies.length > 0) && (
          <AlignmentCheck lines={alignmentLines(check)} className="plan-ready-align" />
        )}
      </div>
    ),
  });

  // "Edit this Strategy" opens that Strategy's own step; the header's pill
  // with no mission opens the mission step (?step=mission).
  const [initialStep] = useState(() => {
    if (params.get('step') === 'mission') return 'mission';
    if (!askedStrategy) return undefined;
    const s = initial.strategies.find((x) => x.id === askedStrategy);
    const objectiveId = s?.objectiveIds.find((id) => initial.objectives.some((o) => o.id === id && (o.name || '').trim()));
    return objectiveId ? `strategies-${objectiveId}` : s ? 'habits' : undefined;
  });

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        key={run}
        name={building ? 'Build your plan' : 'Edit my plan'}
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel={building ? 'Start my first sprint' : 'Save my plan'}
        saveState={shownState}
        role={role}
        draftKey={stepDraftKey(mode, userId)}
        initialStep={run === 0 ? initialStep : undefined}
        onClose={close}
        onFinish={finish}
      />
    </div>
  );
}
