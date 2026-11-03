import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  HabitEditor,
  MultiChoice,
  ObjectiveEditor,
  SaveStatus,
  SlidePanel,
  TextBox,
  WhoSees,
  useToast,
} from '../../components/design';
import { PANEL_MS } from '../../components/design/timing';
import { useDraft } from '../../lib/drafts';
import { friendlyError } from '../../lib/friendlyError';
import { saveSharing } from '../../lib/performance/api';
import {
  MISSION_MAX,
  NAME_MAX,
  draftFromRows,
  habitComplete,
  objectiveComplete,
  localToday,
  switchIsOn,
  versionLabel,
  withMeasure,
} from '../../lib/performance';
import { MISSION_PLACEHOLDER, exampleRole } from '../../content/planBuilder';
import usePlanSaves from './usePlanSaves';

// Change one part of the plan without the whole flow (Tim's preview check,
// 3 Nov 2026). On the Individual Performance Plan page, each saved part,
// the Mission, each Outcome Objective, each Strategy and each habit, opens
// on its own in the slide-across panel the add panels use (M1 sheetPanel;
// SlidePanel), is changed there with the same editor as Edit my plan, and
// saves by itself (Saving, then Saved; no Save button). Done closes it, as
// M1's habit panel. Leaving keeps the version as Edit my plan does
// (usePlanSaves, versions.js): a habit, a name, a target or a date is a
// minor change; the mission or which objectives a Strategy serves is a
// major one, by the same rule as today. The full guided flow stays for
// building a plan or a big change (adding or removing parts).
//
// Same rule, same wording and same look for every part: a quiet link
// ("Edit my mission", "Edit this objective", "Edit this Strategy",
// "Edit this habit") opens a panel with the same words as its title.
//
// part:   { kind: 'mission'|'objective'|'strategy'|'habit', id } or null
// data:   loadPlanEditor's rows, fresh (the page loads them)
// onDone: (version or null, how) once its changes are saved and its
//         version kept; the page then closes it (part null). how:
//         'saved', 'unchanged' (closed with no change: nothing to say) or
//         'unfinished' (a box left empty: kept on the device for next time)

export const PART_TITLE = {
  mission: 'Edit my mission',
  objective: 'Edit this objective',
  strategy: 'Edit this Strategy',
  habit: 'Edit this habit',
};

const draftName = (part) => `performance-plan-part:${part.kind}:${part.id || 'plan'}`;

// The panel stays on screen with its part while it slides away.
export default function PlanPartPanel({ userId, part, data, onDone }) {
  const [shown, setShown] = useState(part);
  useEffect(() => {
    if (part) setShown(part);
  }, [part]);
  const gone = useCallback(() => setShown(null), []);
  if (!shown || !data) return null;
  return (
    <PartEditor
      key={`${shown.kind}:${shown.id}`}
      userId={userId}
      part={shown}
      open={Boolean(part)}
      data={data}
      onDone={onDone}
      onGone={gone}
    />
  );
}

function PartEditor({ userId, part, open, data, onDone, onGone }) {
  const toast = useToast();
  const today = localToday();
  const role = exampleRole(data.personSettings?.describes_you);
  const coachName = data.coach?.firstName || null;
  const [initial] = useState(() => draftFromRows(data, { planId: data.plan.id }));
  const [draft, setDraft] = useState(initial);
  const set = (fn) => setDraft((d) => ({ ...d, ...fn(d) }));
  const { sync, keepVersion, shownState } = usePlanSaves({ userId, data, draft, initial, today });

  // Typing is kept on the device ("Draft restored"), for this same plan.
  const { clear } = useDraft({
    userId,
    name: draftName(part),
    value: draft === initial ? null : draft,
    ready: true,
    onRestore: (d) => {
      if (!d || d.planId !== initial.planId || !Array.isArray(d.objectives)) return;
      setDraft({ ...initial, ...d });
    },
  });

  // Leaving: send what is left, keep the version, then say so.
  const leaving = useRef(false);
  const leave = async () => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      // Nothing changed: it just closes, with no version and no "Saved".
      if (draft === initial) {
        onDone?.(null, 'unchanged');
        return;
      }
      await sync();
      const v = await keepVersion(false);
      // An unfinished change stays on the device and comes back next time.
      if (!complete()) {
        onDone?.(v, 'unfinished');
        return;
      }
      clear();
      onDone?.(v, 'saved');
    } catch (e) {
      leaving.current = false;
      toast.error(friendlyError(e, 'That didn’t save. Check your connection and try again.'));
    }
  };
  // Hidden or closed mid-way: what is typed is sent at once.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') sync().catch(() => {}); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [sync]);
  // Once it has slid away, it leaves the page.
  useEffect(() => {
    if (open) return undefined;
    const timer = setTimeout(onGone, PANEL_MS + 50);
    return () => clearTimeout(timer);
  }, [open, onGone]);

  const objective = part.kind === 'objective' ? draft.objectives.find((o) => o.id === part.id) : null;
  const strategy = part.kind === 'strategy' ? draft.strategies.find((s) => s.id === part.id) : null;
  const habit = part.kind === 'habit' ? draft.habits.find((h) => h.id === part.id) : null;

  // Whether what is typed is complete enough to save (as Edit my plan).
  function complete() {
    if (objective) return objectiveComplete(objective);
    if (strategy) return Boolean((strategy.name || '').trim());
    if (habit) return habitComplete(habit);
    return true;
  }

  const [switches, setSwitches] = useState(data.switches || []);
  const who = (p, name) => {
    if (!coachName) return { audience: 'me' };
    return {
      audience: switchIsOn(switches, p) ? 'coach' : 'me',
      coachName,
      name,
      onChange: async (next) => {
        await saveSharing(userId, p, next === 'coach');
        setSwitches((list) => [...list.filter((x) => x.part !== p), { part: p, is_on: next === 'coach' }]);
      },
    };
  };
  const eyeRow = (props) => <div className="ds-label-row ds-label-row--solo"><WhoSees {...props} /></div>;

  let body = null;
  let unfinished = null;
  if (part.kind === 'mission') {
    body = (
      <>
        {eyeRow(who('mission', 'Your mission'))}
        <TextBox
          ariaLabel="My Mission"
          value={draft.mission}
          maxLength={MISSION_MAX}
          onChange={(mission) => setDraft((d) => ({ ...d, mission }))}
          placeholder={MISSION_PLACEHOLDER[role]}
        />
      </>
    );
  } else if (objective) {
    body = (
      <>
        {eyeRow(who('progress', 'Your Outcome Objective figures and scores'))}
        <ObjectiveEditor
          objective={objective}
          startLabel="Where did you start?"
          onChange={(patch) => set((d) => ({ objectives: d.objectives.map((o) => (o.id === objective.id ? { ...o, ...patch } : o)) }))}
        />
      </>
    );
    unfinished = 'Fill in each box to save this objective.';
  } else if (strategy) {
    const named = draft.objectives.filter((o) => (o.name || '').trim());
    body = (
      <>
        {eyeRow(who('progress', 'Your Outcome Objective figures and scores'))}
        <TextBox
          label="What is the Strategy?"
          lines="one"
          maxLength={NAME_MAX}
          value={strategy.name}
          onChange={(name) => set((d) => ({ strategies: d.strategies.map((s) => (s.id === strategy.id ? { ...s, name } : s)) }))}
        />
        {named.length > 0 && (
          <div className="plan-part-serves">
            <MultiChoice
              label="Which Outcome Objectives does it serve?"
              ariaLabel="Which Outcome Objectives does it serve?"
              options={named.map((o) => ({ value: o.id, label: o.name.trim() }))}
              values={strategy.objectiveIds}
              onChange={(objectiveIds) => set((d) => ({ strategies: d.strategies.map((s) => (s.id === strategy.id ? { ...s, objectiveIds } : s)) }))}
            />
          </div>
        )}
      </>
    );
    unfinished = 'Name the Strategy to save it.';
  } else if (habit) {
    body = (
      <>
        {eyeRow({ audience: 'me' })}
        <HabitEditor
          habit={habit}
          onChange={(patch) => set((d) => ({
            habits: d.habits.map((h) => (h.id === habit.id ? (patch.measure ? withMeasure({ ...h, ...patch }, patch.measure) : { ...h, ...patch }) : h)),
          }))}
        />
      </>
    );
    unfinished = 'Fill in each box to save this habit.';
  } else {
    body = <p className="ipp-muted">This part of your plan isn’t there any more.</p>;
  }

  // The crosshair, Escape, a swipe and Done all leave the same way.
  return (
    <SlidePanel
      open={open}
      onClose={leave}
      title={PART_TITLE[part.kind]}
      closeLabel="Back to the plan"
      footer={(
        <div className="plan-part-foot">
          <SaveStatus state={shownState} />
          <Button onClick={leave}>Done</Button>
        </div>
      )}
    >
      <div className="plan-part">
        {body}
        {unfinished && !complete() && <p className="ds-hint plan-part-hint">{unfinished}</p>}
      </div>
    </SlidePanel>
  );
}

/** What the page says once a part has closed, or null for nothing. */
export function partSavedMessage(v, how = 'saved') {
  if (how === 'unchanged') return v ? `Saved. Your plan is now ${versionLabel(v)}.` : null;
  if (how === 'unfinished') return 'Your change is kept on this device until each box is filled in.';
  return v ? `Saved. Your plan is now ${versionLabel(v)}.` : 'Saved';
}
