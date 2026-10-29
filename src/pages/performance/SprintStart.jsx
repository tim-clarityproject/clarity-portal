import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  AddButton,
  Button,
  Dropdown,
  ErrorMessage,
  GuidedSummary,
  GuidedTool,
  HabitEditor,
  KeepChangeRow,
  Loading,
  PageHeader,
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
import { clearDraft, readDraft, useDraft } from '../../lib/drafts';
import { isNetworkError } from '../../lib/connection';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { loadSprintStart, makeSprintSummary, startSprint } from '../../lib/performance/api';
import {
  IMPACTS,
  LABEL_MAX,
  draftFromRows,
  earliestStart,
  emptyHabit,
  finishDay,
  openRecovery,
  recoveriesEnded,
  recoveryToEnd,
  habitCountWords,
  habitFromPlanRow,
  habitMeasureLine,
  localToday,
  nextSprintNumber,
  pendingAction,
  pendingStart,
  runningSprint,
  sprintAnswersFrom,
  sprintHabitsFrom,
  sprintLabel,
  sprintStanding,
  sprintStandard,
  sprintWeeks,
  startingSprint,
  toMeasure,
  withMeasure,
} from '../../lib/performance';
import {
  clearPendingStart,
  clearSprintSetup,
  keepPendingStart,
  readPendingStart,
  readSprintSetup,
} from '../../lib/performance/sprintSetup';
import { SPRINT_LABEL_PLACEHOLDER, exampleRole } from '../../content/planBuilder';
import './performance.css';

// Start a sprint (mock-up M6, "Start a sprint"; read in full with its
// notes). One guided tool, one question per screen, with the % complete
// bar (the approved rule over M6's step list): how long (2 to 16 weeks, 12
// suggested, and an optional label), when it starts (any day), the
// performance standard (85 suggested; 85 and fixed for an organisation
// seat), the habits it takes from the plan (keep, change or remove each,
// or add one for this sprint only), then Ready.
//
// Coming from Build your plan, the first sprint was chosen there: it is
// created straight away from that hand-over (sprintSetup.js), with every
// habit in the plan.
//
// One running sprint per person (audit risk R4): when one is running, the
// page says so first, with its review or a new sprint; starting the new
// one finishes the old one, even when its review was skipped.
//
// Nothing is written until "Start": the answers wait in the draft on the
// device. The start itself is kept on the device with all its ids before
// anything is sent (pendingStart), so a double tap or a refresh mid-save
// sends the same rows again and never makes a second sprint.

const CACHE = 'performance-sprint-start';
const DRAFT = 'performance-sprint-start';
const stepDraftKey = (userId) => `performance-sprint-start-${userId}`;
const START_ERROR = 'Your sprint didn’t start. Check your connection and try again.';

// One start at a time for each pending record, even if the page is
// mounted twice (a second tap, or React checking effects in development).
const underWay = new Map();

function focusSoon(id) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus()));
}

export default function SprintStart() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [state, setState] = useState({ data: null, error: null });

  // Fresh from the server, as the start writes over what is there (which
  // sprint is running, the next number). Offline, the device's copy.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    loadSprintStart(userId).then((data) => {
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
        <ErrorMessage keepsHappening>Your plan didn’t load. Check your connection and try again.</ErrorMessage>
      </Shell>
    );
  }
  if (!state.data) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your plan" className="ds-loading--page" /></div>;
  }
  return <SprintStartView key={userId} userId={userId} data={state.data} />;
}

// A plain page (not the full-screen tool): the header, the back link and
// the title, for the states around the tool.
function Shell({ children, title = 'Start a sprint' }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-plan')} label="Individual Performance Plan" /></div>
        <PageHeader title={title} />
        {children}
      </div>
    </div>
  );
}

function SprintStartView({ userId, data }) {
  const navigate = useNavigate();
  const location = useLocation();
  const today = useMemo(() => localToday(data.personSettings?.time_zone), [data.personSettings]);
  const running = runningSprint(data.sprints);
  const number = nextSprintNumber(data.sprints);
  const allHabits = useMemo(() => (data.habits || []).map(habitFromPlanRow), [data.habits]);

  // What this visit does, decided once from what is saved and on the device.
  const [phase, setPhase] = useState(() => {
    const pending = readPendingStart(userId);
    if (pending) {
      if (pendingAction(pending, data.sprints) === 'resend') return { kind: 'starting', pending };
      clearPendingStart(userId);
    }
    if (!data.plan) return { kind: 'noplan' };
    const handover = location.state?.sprintSetup || readSprintSetup(userId);
    if (handover && data.sprints.length) clearSprintSetup(userId);
    // The first sprint, chosen in Build your plan: made straight away,
    // unless its start day has passed (then it is asked again).
    if (handover && !data.sprints.length && handover.startOn >= today) {
      return {
        kind: 'starting',
        pending: pendingStart({
          endRecovery: recoveryToEnd(data.recoveries || [], today),
          planId: data.plan.id,
          number: 1,
          startOn: handover.startOn,
          lengthWeeks: handover.lengthWeeks,
          standard: data.fixedStandard ?? handover.standard,
          label: handover.label,
          habits: allHabits,
        }, newId),
      };
    }
    const proceeded = Boolean(readDraft(userId, DRAFT)?.v?.proceed) || Boolean(location.state?.skipReview);
    if (running && !proceeded) return { kind: 'running' };
    return { kind: 'flow' };
  });

  const forgetFlow = useCallback(() => {
    clearDraft(userId, DRAFT);
    clearGuideDraft(stepDraftKey(userId));
  }, [userId]);

  const begin = useCallback((pending) => {
    keepPendingStart(userId, pending);
    setPhase({ kind: 'starting', pending });
  }, [userId]);

  // The start itself, once per pending record.
  useEffect(() => {
    if (phase.kind !== 'starting') return;
    const p = phase.pending;
    keepPendingStart(userId, p);
    let work = underWay.get(p.sprintId);
    if (!work) {
      work = startSprint(userId, p).finally(() => underWay.delete(p.sprintId));
      underWay.set(p.sprintId, work);
    }
    let live = true;
    work.then((r) => {
      // An organisation seat's summary of the sprint just finished: online
      // only, best effort.
      if (p.finish && !r.queued) makeSprintSummary(p.finish.sprintId).catch(() => {});
      // Waiting in the offline queue (or cut off by a refresh, which the
      // queue then holds): kept, so the next visit sends it again.
      if (r.queued) keepPendingStart(userId, { ...p, queued: true });
      else clearPendingStart(userId);
      clearSprintSetup(userId);
      forgetFlow();
      if (!live) return;
      navigate('/performance-sprint', {
        replace: true,
        state: { toast: `Saved. Performance Sprint ${p.number} starts ${dayLabel(p.startOn)}.` },
      });
    }).catch((error) => {
      if (live) setPhase({ kind: 'failed', pending: p, error });
    });
    return () => { live = false; };
  }, [phase, userId, navigate, forgetFlow]);

  if (phase.kind === 'starting') {
    return <div className="ui-root plan-builder-wait"><Loading label={`Starting Performance Sprint ${phase.pending.number}`} className="ds-loading--page" /></div>;
  }

  if (phase.kind === 'failed') {
    return (
      <Shell>
        <div className="ipp-gap">
          <ErrorMessage keepsHappening>{friendlyError(phase.error, START_ERROR)}</ErrorMessage>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => setPhase({ kind: 'starting', pending: phase.pending })}>Try again</Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'noplan') {
    return (
      <Shell>
        <div className="ipp-gap ipp-coming">
          <p>A sprint carries out your plan.</p>
          <p>Build your plan first, and your first sprint starts from there.</p>
        </div>
        <div className="ds-actions ipp-actions">
          <Button variant="primary" onClick={() => navigate('/performance-plan/build')}>Build my plan</Button>
        </div>
      </Shell>
    );
  }

  if (phase.kind === 'running') {
    const standing = sprintStanding(running, data.recoveries, today);
    const name = `Performance Sprint ${running.number}`;
    const review = () => navigate('/performance-sprint/review');
    const proceed = () => setPhase({ kind: 'flow' });
    return (
      <Shell>
        <div className="ipp-gap ipp-coming sprint-start-running">
          {standing.over ? (
            <>
              <p>{`${name} ended on ${dayLabel(standing.endOn)}.`}</p>
              <p>Its review is waiting for you.</p>
            </>
          ) : standing.started ? (
            <>
              <p>{`${name} is still running.`}</p>
              <p>{`It ends on ${dayLabel(standing.endOn)}.`}</p>
            </>
          ) : (
            <>
              <p>{`${name} hasn’t started yet.`}</p>
              <p>{`It starts on ${dayLabel(running.start_on)}.`}</p>
            </>
          )}
          <p>{`Starting a new sprint finishes ${name}.`}</p>
        </div>
        <div className="ds-actions ipp-actions">
          {standing.over ? (
            <>
              <Button variant="primary" onClick={review}>Review this sprint</Button>
              <Button onClick={proceed}>Start a new sprint</Button>
            </>
          ) : (
            <>
              <Button variant="primary" onClick={proceed}>Start a new sprint</Button>
              <Button onClick={review}>Review this sprint</Button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <SprintFlow
      userId={userId}
      data={data}
      today={today}
      number={number}
      running={running}
      proceed={Boolean(running)}
      onStart={begin}
    />
  );
}

function SprintFlow({ userId, data, today, number, running, proceed, onStart }) {
  const navigate = useNavigate();
  const toast = useToast();
  const role = exampleRole(data.personSettings?.describes_you);
  const fixedStandard = data.fixedStandard ?? null;
  const planHabits = data.habits || [];
  const strategies = data.strategies || [];
  const name = `Performance Sprint ${number}`;

  // The answers start as M6 suggests (12 weeks, next Monday, 85%), or from
  // a first sprint chosen in Build your plan whose start day has passed.
  // Never on a day the last sprint still holds (its review finished it today).
  const earliest = earliestStart(data.sprints || [], today);
  const [initial] = useState(() => {
    const handover = readSprintSetup(userId);
    const monday = nextMondayKey(today);
    const answers = handover ? sprintAnswersFrom(handover, monday) : startingSprint(monday);
    return {
      planId: data.plan.id,
      number,
      proceed,
      sprint: answers.start < earliest ? { ...answers, start: monday } : answers,
      label: handover?.label && !handover.template ? handover.label : '',
      carry: {},
      added: [],
      addTo: strategies[0]?.id || null,
    };
  });
  const [draft, setDraft] = useState(initial);
  const set = useCallback((patch) => setDraft((d) => ({ ...d, ...(typeof patch === 'function' ? patch(d) : patch) })), []);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // Kept on the device and put back after a refresh ("Draft restored"),
  // for this same plan and sprint number.
  useDraft({
    userId,
    name: DRAFT,
    value: draft,
    ready: true,
    onRestore: (d) => {
      if (!d || d.planId !== data.plan.id || d.number !== number || !d.sprint) return;
      const sprintBack = d.sprint.start < earliest ? { ...d.sprint, start: initial.sprint.start } : d.sprint;
      setDraft({ ...initial, ...d, sprint: sprintBack, proceed: initial.proceed || d.proceed });
    },
  });

  const sprint = draft.sprint;
  const setSprint = (patch) => set((d) => ({ sprint: { ...d.sprint, ...patch } }));
  const weeks = sprintWeeks(sprint);
  const standard = sprintStandard(sprint, fixedStandard);
  const label = sprintLabel(draft.label, sprint.tpl);
  const chosen = sprintHabitsFrom(planHabits, draft.carry, draft.added);

  // ------------------------------------------------------------ habits
  const habitDraft = (row) => draftFromRows({ habits: [row] }).habits[0];
  const choose = (row, choice) => set((d) => {
    const had = d.carry[row.id];
    return { carry: { ...d.carry, [row.id]: { choice, edit: had?.edit || habitDraft(row) } } };
  });
  const changeEdit = (row, patch) => set((d) => {
    const had = d.carry[row.id]?.edit || habitDraft(row);
    const edit = patch.measure ? withMeasure({ ...had, ...patch }, patch.measure) : { ...had, ...patch };
    return { carry: { ...d.carry, [row.id]: { choice: 'change', edit } } };
  });
  const addTo = strategies.some((s) => s.id === draft.addTo) ? draft.addTo : strategies[0]?.id;
  const addHabit = () => {
    if (!addTo) return;
    const h = emptyHabit(newId(), addTo);
    set((d) => ({ added: [...d.added, h] }));
    focusSoon(`sprint-habit-${h.id}`);
  };
  const changeAdded = (id, patch) => set((d) => ({
    added: d.added.map((h) => (h.id === id ? (patch.measure ? withMeasure({ ...h, ...patch }, patch.measure) : { ...h, ...patch }) : h)),
  }));
  const removeAdded = (h) => {
    const at = draftRef.current.added.indexOf(h);
    set((d) => ({ added: d.added.filter((x) => x.id !== h.id) }));
    toast.saved({
      message: 'Deleted',
      onUndo: () => set((d) => ({ added: [...d.added.slice(0, at), h, ...d.added.slice(at)] })),
    });
  };
  const impactWord = (n) => `${IMPACTS.find((i) => i.value === n)?.label || 'Medium'} impact`;

  const eyeRow = <div className="ds-label-row ds-label-row--solo"><WhoSees audience="me" /></div>;

  // ------------------------------------------------------------ steps
  const steps = [
    {
      key: 'length',
      name: 'Length',
      label: name,
      question: 'How long is this sprint?',
      nudges: ['Pick 2 to 16 weeks.', '12 is long enough to see results and short enough to stay focused.'],
      render: () => (
        <div>
          <SprintLengthChoice sprint={sprint} onChange={setSprint} />
          <div className="sprint-start-label">
            <TextBox
              label="What would you like to call it?"
              lines="one"
              maxLength={LABEL_MAX}
              value={draft.label}
              onChange={(v) => set({ label: v })}
              placeholder={SPRINT_LABEL_PLACEHOLDER[role]}
            />
            <p className="ds-hint">Optional.</p>
          </div>
        </div>
      ),
    },
    {
      key: 'start',
      name: 'Start',
      question: 'When does it start?',
      nudges: earliest > today
        ? ['Pick any day from tomorrow.', 'Today still belongs to your last sprint.']
        : ['Pick any day.', 'You can move it before it starts.'],
      render: () => <SprintStartChoice sprint={sprint} onChange={setSprint} earliest={earliest} />,
    },
    {
      key: 'standard',
      name: 'Standard',
      question: 'What’s your performance standard this time?',
      nudges: fixedStandard != null ? [] : ['Lower it for a heavy period, or raise it for a stretch.'],
      render: () => <StandardChoice sprint={sprint} onChange={setSprint} fixed={fixedStandard} label="What’s your performance standard this time?" />,
    },
    {
      key: 'habits',
      name: 'Habits',
      label: 'From your plan',
      question: 'Which habits are you bringing across?',
      nudges: ['Keep, change or remove each one.', 'Changes start with this sprint.'],
      render: () => (
        <div>
          {eyeRow}
          {planHabits.length ? (
            <div className="ds-carry">
              {planHabits.map((row) => {
                const c = draft.carry[row.id];
                return (
                  <KeepChangeRow
                    key={row.id}
                    name={row.name}
                    lines={[habitMeasureLine(toMeasure(row)), impactWord(row.impact)]}
                    value={c?.choice || 'keep'}
                    onChange={(choice) => choose(row, choice)}
                  >
                    <HabitEditor
                      nameId={`sprint-habit-${row.id}`}
                      habit={c?.edit || habitDraft(row)}
                      onChange={(patch) => changeEdit(row, patch)}
                    />
                  </KeepChangeRow>
                );
              })}
            </div>
          ) : (
            <div className="plan-muted-lines">
              <p className="plan-muted">Your plan has no habits yet.</p>
              <p className="plan-muted">You can add one for this sprint here.</p>
            </div>
          )}
          {draft.added.length > 0 && (
            <div className="plan-habits sprint-start-added">
              {draft.added.map((h) => (
                <div key={h.id} className="sprint-start-new">
                  <Dropdown
                    label="Which Strategy?"
                    options={strategies.map((s) => ({ value: s.id, label: s.name }))}
                    value={h.strategyId}
                    onChange={(strategyId) => { changeAdded(h.id, { strategyId }); set({ addTo: strategyId }); }}
                  />
                  <HabitEditor
                    nameId={`sprint-habit-${h.id}`}
                    habit={h}
                    onChange={(patch) => changeAdded(h.id, patch)}
                    onRemove={() => removeAdded(h)}
                  />
                </div>
              ))}
            </div>
          )}
          {addTo ? (
            <AddButton className="plan-add" onClick={addHabit}>Add a habit</AddButton>
          ) : (
            <p className="plan-muted sprint-start-gap">Add a Strategy to your plan first, then its habits.</p>
          )}
        </div>
      ),
    },
  ];
  const stepAt = (key) => Math.max(0, steps.findIndex((s) => s.key === key));

  const habitNotes = [];
  if (chosen.unfinishedChanges) {
    habitNotes.push(chosen.unfinishedChanges === 1
      ? 'One change isn’t finished, so that habit stays as your plan has it.'
      : `${chosen.unfinishedChanges} changes aren’t finished, so those habits stay as your plan has them.`);
  }
  if (chosen.unfinishedAdded) {
    habitNotes.push(chosen.unfinishedAdded === 1
      ? 'One new habit isn’t finished, so it isn’t added.'
      : `${chosen.unfinishedAdded} new habits aren’t finished, so they aren’t added.`);
  }
  const habitsValue = (
    <span className="plan-sum-list">
      <span>{habitCountWords(chosen.habits.length)}</span>
      {chosen.habits.filter((h) => !h.habitId).map((h) => (
        <small key={`${h.strategyId}-${h.name}`} className="plan-sum-note">{`${h.name} is for this sprint only.`}</small>
      ))}
      {habitNotes.map((n) => <small key={n} className="plan-sum-note">{n}</small>)}
    </span>
  );

  steps.push({
    key: 'ready',
    name: 'Ready',
    title: name,
    nudges: ['Check it, then start.'],
    render: (tool) => (
      <div>
        <SprintDial length={weeks ?? 12} />
        {eyeRow}
        <GuidedSummary
          onChange={tool.go}
          rows={[
            { label: 'Length', step: stepAt('length'), value: weeks ? `${weeks} weeks${sprint.tpl ? ', for your first 90 days in a new role' : ''}` : '' },
            { label: 'Label', step: stepAt('length'), value: label || 'None' },
            { label: 'Starts', step: stepAt('start'), value: sprint.start === today ? `Today, ${dayLabel(sprint.start)}` : dayLabel(sprint.start) },
            { label: 'Performance standard', step: stepAt('standard'), value: standard != null ? `${standard}%` : '' },
            { label: 'Habits', step: stepAt('habits'), value: habitsValue },
          ]}
        />
        {running && (
          <p className="plan-muted sprint-start-gap">{`Starting it finishes Performance Sprint ${running.number}.`}</p>
        )}
        {openRecovery(data.recoveries || []) && (
          <p className="plan-muted sprint-start-gap">Starting it ends your recovery today.</p>
        )}
      </div>
    ),
  });

  const leaving = useRef(false);
  const close = () => {
    navigate('/performance-plan', { replace: true, state: { toast: 'Saved. Carry on from Home whenever you like.' } });
  };

  const finish = () => {
    if (leaving.current) return;
    if (!weeks) {
      toast.error('This sprint has no length yet. Pick one from 2 to 16 weeks, then start.');
      return;
    }
    if (standard == null) {
      toast.error('This sprint has no performance standard yet. Pick one from 50 to 100, then start.');
      return;
    }
    leaving.current = true;
    const ending = recoveryToEnd(data.recoveries || [], today);
    onStart(pendingStart({
      planId: data.plan.id,
      number,
      startOn: sprint.start,
      lengthWeeks: weeks,
      standard,
      label,
      habits: chosen.habits,
      finish: running ? { sprintId: running.id, number: running.number, endOn: finishDay(running, recoveriesEnded(data.recoveries, ending), today, sprint.start) } : null,
      endRecovery: ending,
    }, newId));
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GuidedTool
        name="Start a sprint"
        steps={steps}
        progress="percent"
        skipLabel="Skip"
        finishLabel={`Start ${name}`}
        role={role}
        draftKey={stepDraftKey(userId)}
        onClose={close}
        onFinish={finish}
      />
    </div>
  );
}
