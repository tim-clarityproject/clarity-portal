import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  AddButton,
  Button,
  Choice,
  ErrorMessage,
  GuidedTool,
  InPlan,
  KeepChangeRow,
  Loading,
  ObjectiveEditor,
  PageHeader,
  SprintDial,
  Stat,
  StatGroup,
  TextBox,
  WhoSees,
  clearGuideDraft,
  useToast,
} from '../../components/design';
import { readCache, writeCache } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { isNetworkError, isOnline } from '../../lib/connection';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import {
  archivePlanRow,
  finishSprint,
  freezeWeek,
  linkSprintHabit,
  loadSprintReview,
  makeSprintSummary,
  recordPlanVersion,
  saveHabit,
  saveObjective,
} from '../../lib/performance/api';
import {
  MAX_OBJECTIVES,
  emptyObjective,
  localToday,
  objectiveDraft,
  reviewPlanChanges,
  reviewView,
  unfinishedNotes,
} from '../../lib/performance';
import { REVIEW_NEXT_EXAMPLE, REVIEW_WORKED_EXAMPLE, exampleRole } from '../../content/planBuilder';
import './performance.css';

// The end-of-sprint review (mock-up M6, "End-of-sprint review"; read in
// full with its notes). One guided tool, one question per screen, with
// the % complete bar (the approved rule over M6's step list):
//   Finished   "Great sprint, Sam! You averaged 86%." (or "Not your
//              strongest sprint. What still went well?"), the finished
//              dial, weeks at the standard, the best week, Since you started
//   Worked     "What worked best in this sprint?"
//   Next time  "What would make the next sprint even better?"
//   Objectives "Which objectives will you keep?" Keep, change or retire
//              each, or add one
//   Habits     "Which habits have stuck?" Add any to the plan
//   Next       "What's next?" Straight into the next sprint, or Recovery
//              first
// Every figure comes from src/lib/scores through src/lib/performance
// (reviewView); what finishing changes in the plan is worked out there too
// (reviewPlanChanges).
//
// Nothing is written until the end: the answers wait in the draft on the
// device ("Draft restored"). Finishing saves the plan's changes (one
// version, major or minor), finishes the sprint (status, actual end,
// finished at: one running sprint per person, R4) and asks for an
// organisation seat's frozen summary (make_sprint_summary, online only,
// best effort). Everything is sent through the offline queue, with ids
// made on the device, so finishing twice writes the same rows.
//
// The two written answers have no table yet (audit, section 4: a
// sprint_reviews table is needed): they are kept on this device only.

const CACHE = 'performance-sprint-review';
const DRAFT = 'performance-sprint-review';
const ANSWERS = 'performance-sprint-review-answers';
const stepDraftKey = (userId) => `performance-sprint-review-${userId}`;
const ANSWER_MAX = 4000; // as the weekly debrief's answers
const FINISH_ERROR = 'Your review didn’t save. Check your connection and try again.';

const RETIRE = [
  { value: 'keep', label: 'Keep' },
  { value: 'change', label: 'Change' },
  { value: 'retire', label: 'Retire' },
];

export default function SprintReview() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [state, setState] = useState({ data: null, error: null });

  // Fresh from the server, as finishing writes over what is there (which
  // sprint is running, the plan's latest version). Offline, the device's copy.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadSprintReview(userId).then((data) => {
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
      <Shell>
        <ErrorMessage keepsHappening>Your sprint didn’t load. Check your connection and try again.</ErrorMessage>
      </Shell>
    );
  }
  if (!state.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your sprint" className="ds-loading--page" /></div>;
  }
  return <ReviewView key={userId} userId={userId} data={state.data} />;
}

// A plain page (not the full-screen tool), for the states around the tool.
function Shell({ children, title = 'End-of-sprint review' }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-sprint')} label="Performance Sprint" /></div>
        <PageHeader title={title} />
        {children}
      </div>
    </div>
  );
}

function ReviewView({ userId, data }) {
  const navigate = useNavigate();
  const toast = useToast();
  const today = useMemo(() => localToday(data.personSettings?.time_zone), [data.personSettings]);
  const view = useMemo(() => reviewView(data, { today }), [data, today]);
  const [phase, setPhase] = useState(() => ({ kind: view.state === 'over' ? 'flow' : 'intro' }));
  const frozen = useRef(false);

  // Finished weeks into week_scores (R3) before the sprint is finished.
  const freezeAll = useCallback(async () => {
    if (!view.toFreeze?.length || !isOnline()) return;
    for (const w of view.toFreeze) {
      try {
        await freezeWeek(view.sprintId, w);
      } catch {
        // Best effort: the coach's copy can be frozen later.
      }
    }
  }, [view.toFreeze, view.sprintId]);
  useEffect(() => {
    if (frozen.current) return;
    frozen.current = true;
    freezeAll();
  }, [freezeAll]);

  const finish = async (draft) => {
    setPhase({ kind: 'finishing', draft });
    try {
      const changes = reviewPlanChanges(data, draft, today);
      const plan = data.plan;
      if (plan) {
        for (const o of changes.saves) await saveObjective(userId, plan.id, o).save;
        for (const id of changes.archive) await archivePlanRow(userId, 'outcome_objectives', id);
        for (const h of changes.habits) {
          await saveHabit(userId, plan.id, h.row).save;
          await linkSprintHabit(userId, h.sprintHabitId, h.row.id);
        }
        await recordPlanVersion(userId, plan, { before: changes.before, after: changes.after });
      }
      await freezeAll();
      const r = await finishSprint(userId, view.sprintId, view.finishOn);
      // An organisation seat's summary of the sprint: online only, best effort.
      if (r?.status !== 'queued') makeSprintSummary(view.sprintId).catch(() => {});
      // The two answers stay on this device until a table holds them.
      const kept = readCache(userId, ANSWERS)?.v || {};
      writeCache(userId, ANSWERS, { ...kept, [view.sprintId]: { worked: draft.worked, next: draft.next, at: today } });
      clearDraft(userId, DRAFT);
      clearGuideDraft(stepDraftKey(userId));
      if (draft.choice === 'recovery') {
        toast.show('Saved. Nothing is tracked during Recovery.');
        navigate('/recovery', { replace: true, state: { fromReview: view.sprintId } });
      } else {
        toast.show(`Saved. Set up Performance Sprint ${view.nextNumber} next.`);
        navigate('/performance-sprint/start', { replace: true, state: { skipReview: true } });
      }
    } catch (error) {
      setPhase({ kind: 'failed', draft, error });
    }
  };

  if (view.state === 'none' && !data.plan) {
    return (
      <Shell>
        <div className="ipp-gap ipp-coming">
          <p>No sprint is waiting for its review.</p>
          <p>Build your plan first, and your first sprint starts from there.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-plan/build')}>Build my plan</Button>
        </div>
      </Shell>
    );
  }
  if (view.state === 'none') {
    return (
      <Shell>
        <div className="ipp-gap ipp-coming">
          <p>No sprint is waiting for its review.</p>
          <p>You can start your next sprint now.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-sprint/start')}>Start a sprint</Button>
        </div>
      </Shell>
    );
  }

  if (view.state === 'future' || view.state === 'paused') {
    return (
      <Shell>
        <div className="ipp-gap ipp-coming">
          {view.state === 'future' ? (
            <>
              <p>{`${view.name} hasn’t started yet.`}</p>
              <p>{`It starts on ${view.startsOn}.`}</p>
            </>
          ) : (
            <>
              <p>{`You’re in recovery, so ${view.name} is paused.`}</p>
              <p>Its review opens when you’re back.</p>
            </>
          )}
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-sprint')}>Open my sprint</Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'intro') {
    // Still running: reviewing it now finishes it today.
    return (
      <Shell>
        <div className="ipp-gap ipp-coming">
          <p>{`${view.name} is still running.`}</p>
          <p>{`It ends on ${view.endsOn}.`}</p>
          <p>Reviewing it now finishes it today.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-sprint')}>Back to my sprint</Button>
          <Button onClick={() => setPhase({ kind: 'flow' })}>Review it now</Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'finishing') {
    return <div className="ui-root plan-builder-wait"><Loading label={`Finishing ${view.name}`} className="ds-loading--page" /></div>;
  }

  if (phase.kind === 'failed') {
    return (
      <Shell>
        <div className="ipp-gap">
          <ErrorMessage keepsHappening>{friendlyError(phase.error, FINISH_ERROR)}</ErrorMessage>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => finish(phase.draft)}>Try again</Button>
        </div>
      </Shell>
    );
  }

  return <ReviewFlow userId={userId} data={data} view={view} today={today} onFinish={finish} />;
}

function ReviewFlow({ userId, data, view, today, onFinish }) {
  const navigate = useNavigate();
  const toast = useToast();
  const role = exampleRole(data.describesYou);
  const [initial] = useState(() => ({ sprintId: view.sprintId, worked: '', next: '', objectives: {}, added: [], stick: {}, choice: 'sprint' }));
  const [draft, setDraft] = useState(initial);
  const set = useCallback((patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })), []);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Kept on the device and put back after a refresh ("Draft restored"),
  // for this same sprint.
  useDraft({
    userId,
    name: DRAFT,
    value: draft,
    ready: true,
    onRestore: (d) => {
      if (!d || d.sprintId !== view.sprintId) return;
      setDraft({ ...initial, ...d });
    },
  });

  const eyeRow = <div className="ds-label-row ds-label-row--solo"><WhoSees audience="me" /></div>;
  const objectivesById = new Map(view.objectives.map((o) => [o.id, o]));

  // ------------------------------------------------------------ objectives
  const chooseObjective = (o, choice) => set((d) => {
    const had = d.objectives[o.id];
    return { objectives: { ...d.objectives, [o.id]: { choice, edit: had?.edit || objectiveDraft(o.row) } } };
  });
  const editObjective = (o, patch) => set((d) => {
    const had = d.objectives[o.id]?.edit || objectiveDraft(o.row);
    return { objectives: { ...d.objectives, [o.id]: { choice: 'change', edit: { ...had, ...patch } } } };
  });
  const liveCount = view.objectives.filter((o) => draft.objectives[o.id]?.choice !== 'retire').length + draft.added.length;
  const addObjective = () => {
    const o = emptyObjective(newId());
    set((d) => ({ added: [...d.added, o] }));
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`review-objective-${o.id}`)?.focus()));
  };
  const changeAdded = (id, patch) => set((d) => ({ added: d.added.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
  const removeAdded = (o) => {
    const at = draftRef.current.added.indexOf(o);
    set((d) => ({ added: d.added.filter((x) => x.id !== o.id) }));
    toast.saved({
      message: 'Deleted',
      onUndo: () => set((d) => ({ added: [...d.added.slice(0, at), o, ...d.added.slice(at)] })),
    });
  };

  // ------------------------------------------------------------ habits
  // Added when the review is finished, with the rest of its changes.
  const stick = (h) => {
    set((d) => ({ stick: { ...d.stick, [h.id]: d.stick[h.id] || newId() } }));
    toast.saved({ message: 'It joins your plan when you finish this review.', onUndo: () => unstick(h) });
  };
  const unstick = (h) => set((d) => {
    const next = { ...d.stick };
    delete next[h.id];
    return { stick: next };
  });

  const notes = unfinishedNotes(reviewPlanChanges(data, draft, today));
  const centre = { small: 'Average', big: view.average, good: view.averageGood, note: `Standard ${view.standard}%` };
  if (!view.average) Object.assign(centre, { small: 'Nothing is scored yet.', big: null });

  const steps = [
    {
      key: 'finished',
      name: 'Finished',
      label: view.name,
      question: view.opening.question,
      render: () => (
        <div className="review-finished">
          <SprintDial
            finished
            weeks={view.weeks}
            centre={centre}
            crossTip={{ value: 'Start and end of the sprint', when: view.dates?.text, extra: view.lastSprintLine ? [view.lastSprintLine] : [] }}
            label={`${view.name}${view.atStandard ? `, ${view.atStandard.value} ${view.atStandard.of} weeks at your standard` : ''}${view.average ? `, average ${view.average}` : ''}`}
          />
          {(view.atStandard || view.best) && (
            <StatGroup className="review-facts">
              {view.atStandard && <Stat label="Weeks at your standard" value={view.atStandard.value} unit={view.atStandard.of} />}
              {view.best && <Stat label="Best week" value={view.best.value} note={view.best.range} good={view.best.good} />}
            </StatGroup>
          )}
          {view.sinceLine && <p className="review-since">{view.sinceLine}</p>}
        </div>
      ),
    },
    {
      key: 'worked',
      name: 'Worked',
      question: 'What worked best in this sprint?',
      nudges: ['Name 1 or 2 things you’d keep doing.'],
      example: REVIEW_WORKED_EXAMPLE,
      render: () => (
        <TextBox
          ariaLabel="What worked best"
          who="me"
          focusMode
          maxLength={ANSWER_MAX}
          value={draft.worked}
          onChange={(v) => set({ worked: v })}
        />
      ),
    },
    {
      key: 'next-time',
      name: 'Next time',
      question: 'What would make the next sprint even better?',
      nudges: ['Pick one thing you’d do differently.'],
      example: REVIEW_NEXT_EXAMPLE,
      render: () => (
        <TextBox
          ariaLabel="What would make the next sprint better"
          who="me"
          focusMode
          maxLength={ANSWER_MAX}
          value={draft.next}
          onChange={(v) => set({ next: v })}
        />
      ),
    },
    {
      key: 'objectives',
      name: 'Objectives',
      question: 'Which objectives will you keep?',
      nudges: ['Keep, change or retire each one.'],
      render: () => (
        <div>
          {eyeRow}
          {view.objectives.length ? (
            <div className="ds-carry">
              {view.objectives.map((o) => {
                const c = draft.objectives[o.id];
                return (
                  <KeepChangeRow
                    key={o.id}
                    name={o.name}
                    lines={o.lines}
                    options={RETIRE}
                    removeValue="retire"
                    value={c?.choice || 'keep'}
                    onChange={(choice) => chooseObjective(o, choice)}
                  >
                    <ObjectiveEditor
                      nameId={`review-objective-${o.id}`}
                      objective={c?.edit || objectiveDraft(objectivesById.get(o.id).row)}
                      startLabel="Where did you start?"
                      onChange={(patch) => editObjective(o, patch)}
                    />
                  </KeepChangeRow>
                );
              })}
            </div>
          ) : (
            <p className="plan-muted">Your plan has no Outcome Objectives yet.</p>
          )}
          {draft.added.length > 0 && (
            <div className="review-added">
              {draft.added.map((o) => (
                <ObjectiveEditor
                  key={o.id}
                  nameId={`review-objective-${o.id}`}
                  objective={o}
                  onChange={(patch) => changeAdded(o.id, patch)}
                  onRemove={() => removeAdded(o)}
                />
              ))}
              <p className="plan-muted">You can link a new objective to a Strategy when you edit your plan.</p>
            </div>
          )}
          {liveCount < MAX_OBJECTIVES && <AddButton className="plan-add" onClick={addObjective}>Add an objective</AddButton>}
        </div>
      ),
    },
    {
      key: 'habits',
      name: 'Habits',
      question: 'Which habits have stuck?',
      nudges: ['Add any to your plan, so every sprint starts with them.'],
      render: () => (
        view.stuck.length ? (
          <div className="ds-carry">
            {view.stuck.map((h) => {
              const added = Boolean(draft.stick[h.id]);
              return (
                <KeepChangeRow
                  key={h.id}
                  name={h.name}
                  lines={[h.measureLine, h.keptLine]}
                  action={h.inPlan || added ? <InPlan /> : (
                    <Button onClick={() => stick(h)}>Add to my plan</Button>
                  )}
                />
              );
            })}
          </div>
        ) : (
          <div className="review-lines">
            <p className="plan-muted">No habit was kept up in most weeks of this sprint.</p>
            <p className="plan-muted">You can change your habits when you start your next sprint.</p>
          </div>
        )
      ),
    },
    {
      key: 'next',
      name: 'Next',
      question: 'What’s next?',
      nudges: ['Go straight into the next sprint, or take a Recovery break first.'],
      render: () => (
        <div>
          <Choice
            form="rows"
            ariaLabel="What’s next?"
            options={[
              { value: 'sprint', label: `Straight into Performance Sprint ${view.nextNumber}` },
              { value: 'recovery', label: 'Recovery first' },
            ]}
            value={draft.choice}
            onChange={(choice) => set({ choice })}
          />
          {draft.choice === 'recovery' && (
            <div className="review-lines review-gap">
              <p className="plan-muted">Nothing is tracked during Recovery.</p>
              <p className="plan-muted">You choose how long on the next screen.</p>
            </div>
          )}
          {notes.length > 0 && (
            <div className="review-lines review-gap">
              {notes.map((n) => <p key={n} className="plan-muted">{n}</p>)}
            </div>
          )}
        </div>
      ),
    },
  ];

  const close = () => {
    navigate('/performance-sprint', { replace: true, state: { toast: 'Saved. Carry on from Home whenever you like.' } });
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name="End-of-sprint review"
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel={draft.choice === 'recovery' ? 'Start my Recovery' : `Set up Performance Sprint ${view.nextNumber}`}
        role={role}
        draftKey={stepDraftKey(userId)}
        onClose={close}
        onFinish={() => onFinish(draftRef.current)}
      />
    </div>
  );
}
