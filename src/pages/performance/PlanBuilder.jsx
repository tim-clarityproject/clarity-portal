import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { MissionContext } from '../../context/MissionContext';
import {
  AddButton,
  AlignmentCheck,
  Button,
  Dropdown,
  ErrorMessage,
  FieldLabel,
  GuidedSummary,
  GuidedTool,
  HabitEditor,
  HelpPanel,
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
} from '../../components/design';
import { readCache, writeCache } from '../../lib/pageCache';
import { useDraft, clearDraft } from '../../lib/drafts';
import { isNetworkError } from '../../lib/connection';
import { newId, useQueueState } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import {
  archivePlanRow,
  deletePlanRow,
  loadPlanEditor,
  recordPlanVersion,
  savePlan,
  saveHabit,
  saveObjective,
  saveSharing,
  saveStrategy,
  saveStrategyLink,
  saveWorkingDays,
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
  habitsWords,
  localToday,
  namedObjectives,
  objectiveComplete,
  objectiveSummary,
  planSaves,
  removeObjective,
  removeStrategyFrom,
  rowsSnapshot,
  savableRows,
  servesNames,
  snapshotIds,
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
import { MISSION_EXAMPLE, MISSION_PLACEHOLDER, STRATEGY_IDEAS, exampleRole } from '../../content/planBuilder';
import './performance.css';

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
const SYNC_AFTER_MS = 700;
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
        <ErrorMessage keepsHappening>Your plan didn’t load. Check your connection and try again.</ErrorMessage>
      </div>
    );
  }
  if (!state.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your plan" className="ds-loading--page" /></div>;
  }
  // A plan with a version is edited; one without is still being built
  // (never a second active plan).
  const mode = state.data.plan && state.data.latestVersion ? 'edit' : 'build';
  if (mode === 'edit' && !editing) return <Navigate to="/performance-plan/edit" replace />;
  if (mode === 'build' && editing) return <Navigate to="/performance-plan/build" replace />;
  return <PlanTool key={`${userId}-${mode}`} userId={userId} data={state.data} mode={mode} />;
}

function PlanTool({ userId, data, mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queue = useQueueState();
  const { mission: oldMission } = useContext(MissionContext) || {};
  const building = mode === 'build';
  const today = useMemo(() => localToday(data.personSettings?.time_zone), [data.personSettings]);
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
  const savedRef = useRef(savableRows(draftFromRows(data, { planId: initial.planId }), today));
  const planExistsRef = useRef(Boolean(data.plan));
  const versionRef = useRef({
    major: data.plan?.major ?? 1,
    minor: data.plan?.minor ?? 0,
    snapshot: data.latestVersion?.snapshot ?? null,
  });
  const inVersion = useMemo(() => snapshotIds(data.latestVersion?.snapshot), [data.latestVersion]);
  const draftRef = useRef(draft);
  const [saveState, setSaveState] = useState('idle');
  const running = useRef(null);
  const again = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const send = useCallback(async (op) => {
    const planId = draftRef.current.planId;
    switch (op.kind) {
      case 'plan': return savePlan(userId, { id: op.row.id, mission: op.row.mission || null }).save;
      case 'objective': return saveObjective(userId, planId, op.row).save;
      case 'strategy': return saveStrategy(userId, planId, op.row).save;
      case 'habit': return saveHabit(userId, planId, op.row).save;
      case 'link': return saveStrategyLink(userId, op.link.strategyId, op.link.objectiveId, op.serves);
      case 'days': return saveWorkingDays(userId, today, op.days);
      case 'archive': return archivePlanRow(userId, op.table, op.id);
      case 'delete': return deletePlanRow(userId, op.table, op.id);
      default: return null;
    }
  }, [userId, today]);

  // Sends whatever the draft says that the database doesn't hold yet, one
  // save at a time and in order. A change made while saving is sent next.
  const sync = useCallback(() => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const work = (async () => {
      let queued = false;
      let sent = false;
      do {
        again.current = false;
        const want = savableRows(draftRef.current, today);
        const ops = planSaves(savedRef.current, want, { planExists: planExistsRef.current, inVersion });
        if (ops.length) {
          sent = true;
          setSaveState('saving');
        }
        for (const op of ops) {
          const result = await send(op);
          if (result?.status === 'queued') queued = true;
          savedRef.current = applySave(savedRef.current, op);
          if (op.kind === 'plan') planExistsRef.current = true;
        }
      } while (again.current);
      if (sent) setSaveState(queued ? 'offline' : 'saved');
    })();
    running.current = work;
    return work.catch((e) => {
      setSaveState('failed');
      toast.error(friendlyError(e, SAVE_ERROR));
      throw e;
    }).finally(() => {
      running.current = null;
    });
  }, [send, today, inVersion, toast]);

  // Nothing is written until the person changes something: opening a new
  // plan never creates one (the old mission it starts from included).
  useEffect(() => {
    if (draft === initial) return undefined;
    const timer = setTimeout(() => { sync().catch(() => {}); }, SYNC_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft, initial, sync]);

  // "Will sync" turns to Saved once the queue has sent everything.
  const shownState = saveState === 'offline' && queue.waiting === 0 ? 'saved' : saveState;

  // A version, when the plan changed since its last one (editing), or the
  // first version (finishing a new plan).
  const keepVersion = async (first) => {
    const after = rowsSnapshot(savedRef.current);
    const plan = { id: draftRef.current.planId, major: versionRef.current.major, minor: versionRef.current.minor };
    const v = await recordPlanVersion(userId, plan, { before: versionRef.current.snapshot, after, first });
    if (!v.kind) return null;
    versionRef.current = { major: v.major, minor: v.minor, snapshot: after };
    return v;
  };

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
      let message = 'Saved. Carry on from Home whenever you like.';
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
        const setup = sprintSetupFrom(draftRef.current.sprint, fixedStandard);
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
  const missionWho = who('mission', 'Your mission');
  const progressWho = who('progress', 'Your Outcome Objective figures and scores');
  const eyeRow = (props) => (
    <div className="ds-label-row ds-label-row--solo"><WhoSees {...props} /></div>
  );

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
    question: 'What’s your mission?',
    nudges: ['Write the big aim that drives your daily performance.', 'You can change it any time.'],
    example: MISSION_EXAMPLE,
    nextLabel: 'Save my mission',
    render: () => (
      <div>
        {eyeRow(missionWho)}
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
              who={missionWho.audience}
              coachName={coachName || undefined}
              value={draft.help.known}
              onChange={(known) => set((d) => ({ help: { ...d.help, known } }))}
            />
            <TextBox label="Who do you serve?" value={draft.help.serve} onChange={(serve) => set((d) => ({ help: { ...d.help, serve } }))} />
            <TextBox label="What does great look like in 3 years?" value={draft.help.great} onChange={(great) => set((d) => ({ help: { ...d.help, great } }))} />
            <div className="plan-help-act">
              <Button onClick={() => set((d) => ({ mission: draftMission(d.help) }))}>Draft my mission</Button>
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
    question: 'What 2 to 4 results would show your mission is moving?',
    nudges: ['Pick ones you can track.'],
    tip: { key: 'performance-plan-saves', text: 'Everything saves as you go.' },
    render: () => (
      <div>
        {eyeRow(progressWho)}
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
        {draft.objectives.length < MAX_OBJECTIVES && (
          <AddButton className="plan-add" onClick={addObjective}>Add an objective</AddButton>
        )}
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
      question: o ? `How will you move “${o.name.trim()}”?` : 'What approaches will you use to achieve your objectives?',
      nudges: [o ? (k === 0 ? 'Add 1 or 2 Strategies.' : '1 or 2 Strategies is usually enough.') : 'Add 2 to 4 Strategies.'],
      render: () => (
        <div>
          {k === 0 && (
            <div className="plan-strategy-help">
              <HelpPanel
                line="Strategies are medium to long-term approaches to achieving your objectives."
                example={`For example: ${ideas[0]}.`}
              />
            </div>
          )}
          {eyeRow(progressWho)}
          {strategyRows(mine, o?.id || null)}
          <AddButton className="plan-add" onClick={() => addStrategy(o?.id || null)}>Add a Strategy</AddButton>
          {others.length > 0 && (
            <div className="plan-picks">
              <FieldLabel label="Do any of your other Strategies help this too?" />
              {others.map((s) => <AddButton key={s.id} onClick={() => serveToo(s.id, o.id)}>{s.name.trim()}</AddButton>)}
            </div>
          )}
          {fresh.length > 0 && (
            <div className="plan-picks">
              {/* M6's "Need ideas? Pick one, then make it yours." as two lines: one sentence per line (writing rule 49). */}
              <FieldLabel label="Need ideas?" />
              <p className="plan-muted plan-picks-nudge">Pick one, then make it yours.</p>
              {fresh.map((idea) => <AddButton key={idea} onClick={() => addStrategy(o?.id || null, idea)}>{idea}</AddButton>)}
            </div>
          )}
        </div>
      ),
    };
  };

  const habitsStep = {
    key: 'habits',
    name: 'Habits',
    question: 'Which habits will carry out each Strategy?',
    nudges: ['Add a measure and a target for each.', 'You can change them in any sprint.'],
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
            who="me"
            options={namedStrategies.map((s) => ({ value: s.id, label: s.name.trim() }))}
            value={habitStrategyId}
            onChange={(habitStrategy) => set({ habitStrategy })}
          />
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
          <AddButton className="plan-add" onClick={addHabit}>Add a habit</AddButton>
        </div>
      );
    },
  };

  const daysStep = {
    key: 'days',
    name: 'Working days',
    question: 'Which days do you work?',
    nudges: ['Pick every day you usually work.', 'Daily targets and logging count these days only.'],
    render: () => (
      <div className="plan-days">
        <MultiChoice
          ariaLabel="Which days do you work?"
          options={WORKING_DAY_OPTIONS}
          values={draft.workingDays}
          onChange={(workingDays) => set({ workingDays })}
          who="me"
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
      nudges: ['Pick 2 to 16 weeks.', '12 is long enough to see results and short enough to stay focused.'],
      render: () => <SprintLengthChoice sprint={sprint} onChange={setSprint} label="How long is your first Performance Sprint?" />,
    },
    {
      key: 'start',
      name: 'Start',
      question: 'When does it start?',
      nudges: ['Pick any day.', 'You can move it before it starts.'],
      render: () => <SprintStartChoice sprint={sprint} onChange={setSprint} />,
    },
    {
      key: 'standard',
      name: 'Standard',
      question: 'What’s your performance standard?',
      nudges: fixedStandard != null ? [] : ['Lower it for a heavy period, or raise it for a stretch.'],
      render: () => <StandardChoice sprint={sprint} onChange={setSprint} fixed={fixedStandard} />,
    },
  ];

  const steps = [
    missionStep,
    objectivesStep,
    ...(named.length ? named.map((o, k) => strategyStep(o, k)) : [strategyStep(null, 0)]),
    habitsStep,
    ...(building ? [daysStep, ...sprintSteps] : []),
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
        { label: 'Starts', step: stepAt('start'), value: sprint.start === today ? `Today, ${dayLabel(sprint.start)}` : dayLabel(sprint.start) },
        { label: 'Performance standard', step: stepAt('standard'), value: std != null ? `${std}%` : '' },
      );
    }
    return out;
  };

  const check = alignmentCheck(rows.objectives, rows.strategies, rows.links);
  steps.push({
    key: 'ready',
    name: 'Ready',
    title: building ? 'Your plan and first sprint' : 'Your plan',
    nudges: building ? ['Check it, then start.', 'You can change anything later.'] : ['Check it, then save.', 'You can change anything later.'],
    render: (tool) => (
      <div>
        {building && <SprintDial length={sprintWeeks(sprint) ?? 12} />}
        {eyeRow({ audience: 'me' })}
        <GuidedSummary rows={readyRows()} onChange={tool.go} />
        {(rows.objectives.length > 0 || rows.strategies.length > 0) && (
          <AlignmentCheck lines={alignmentLines(check)} className="plan-ready-align" />
        )}
      </div>
    ),
  });

  // "Edit this Strategy" opens that Strategy's own step.
  const [initialStep] = useState(() => {
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
        finishLabel={building ? 'Start Performance Sprint 1' : 'Save my plan'}
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
