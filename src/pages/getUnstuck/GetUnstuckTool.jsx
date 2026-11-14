import { useMemo, useRef, useState } from 'react';
import {
  GuidedSummary,
  GuidedTool,
  MultiChoice,
  NextStepRow,
  NextSteps,
  RowList,
  TextBox,
  Timer,
  ToolTodoPanel,
  WhoSees,
  useCoach,
  useToast,
} from '../../components/design';
import { newId } from '../../lib/syncQueue';
import {
  GOAL_EXAMPLE,
  GOAL_MAX,
  NOUN,
  PLACEHOLDER,
  ROW_MAX,
  STAGE,
  STEP_KEYS,
  TODO_SOURCE,
  TOOL_NAME,
  WHERE,
  nudge,
  optionChoices,
  pickedOptions,
  question,
  removeOption,
  requiredMessage,
  setAct,
  summaryRows,
  togglePick,
  whereLine,
} from '../../lib/getUnstuck/model';
import './getUnstuck.css';

// Get unstuck (mock-up M9, version 12; read in full with its notes): one
// guided tool, one question per screen, in the calm stepped frame. The
// same screens for someone signed in and for a guest (a coach's link):
// the page around it owns the plan and saves it; this owns the screens.
//
//   plan, onPlan(fn)   the plan (src/lib/getUnstuck/model.js) and its setter
//   guest              no sprint lines, no add panel, "start soon"
//   name               the person's first name, for "Here’s your plan, Sam."
//   coachName          a guest's coach's first name (from the link)
//   onShare(shared)    saves who can see it (signed in, with a coach)
//   sourceId           the saved item's id, for the to-dos made from it
//   onTodoGone(id)     a to-do replaced by an edit: the page deletes it
//   pdf                “Download my PDF”, the quiet link at Your plan's bottom bar (signed in)
//   draftKey, initialStep, onClose, onFinish   as GuidedTool's
//
// The eye shows on the first step and on Your plan only (Tim, 13 Nov,
// 09:32), never on every step.

const cap = (word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

export default function GetUnstuckTool({
  plan,
  onPlan,
  guest = false,
  name = '',
  coachName,
  onShare,
  sourceId = null,
  onTodoGone,
  pdf = null,
  draftKey,
  initialStep,
  onClose,
  onFinish,
}) {
  const coach = useCoach();
  const toast = useToast();
  const [adding, setAdding] = useState(null); // the next step whose add panel is open
  const linkRefs = useRef({});
  // The next steps as they were when an option was taken out, for its Undo.
  const actsBefore = useRef(null);

  const eye = guest ? (
    <WhoSees
      audience="coach"
      coachName={coachName || undefined}
      note={`Your answers go to ${coachName || 'your coach'}, who sent you the link.`}
    />
  ) : coach && onShare ? (
    <WhoSees plain audience={plan.shared ? 'coach' : 'me'} onChange={(audience) => onShare(audience === 'coach')} />
  ) : (
    <WhoSees audience="me" />
  );

  const rowsStep = (key) => ({
    key,
    name: STAGE[key],
    label: STAGE[key],
    question: question(key, plan),
    nudges: [nudge(key)],
    render: () => (
      <>
        {key === 'opts' && <Timer className="gu-timer" />}
        <RowList
          rows={plan[key]}
          max={Infinity}
          maxLength={ROW_MAX}
          removeAlways
          undo
          itemLabel={(n) => `${cap(NOUN[key])} ${n}`}
          addLabel={`Add another ${NOUN[key]}`}
          placeholder={PLACEHOLDER[key]}
          onChange={(rows, change) => onPlan((p) => {
            if (key !== 'opts') return { ...p, [key]: rows };
            if (change?.removed != null) {
              actsBefore.current = p.acts;
              return { ...removeOption(p, change.removed), opts: rows };
            }
            if (change?.restored != null && actsBefore.current) {
              const acts = actsBefore.current;
              actsBefore.current = null;
              return { ...p, opts: rows, acts };
            }
            return { ...p, opts: rows };
          })}
        />
      </>
    ),
  });

  const choices = useMemo(() => optionChoices(plan), [plan]);
  const addingAct = adding ? plan.acts.find((a) => a.id === adding) : null;

  const steps = [
    {
      key: 'goal',
      name: STAGE.goal,
      label: STAGE.goal,
      question: question('goal', plan),
      nudges: [nudge('goal')],
      example: GOAL_EXAMPLE,
      required: true,
      check: () => requiredMessage('goal', plan),
      eye,
      render: () => (
        <TextBox
          ariaLabel={question('goal', plan)}
          className="gu-goal"
          maxLength={GOAL_MAX}
          placeholder={PLACEHOLDER.goal}
          value={plan.goal}
          onChange={(goal) => onPlan((p) => ({ ...p, goal }))}
        />
      ),
    },
    rowsStep('cons'),
    rowsStep('opps'),
    rowsStep('opts'),
    {
      key: 'will',
      name: STAGE.will,
      label: STAGE.will,
      question: question('will', plan),
      nudges: [nudge('will')],
      required: true,
      check: () => requiredMessage('will', plan),
      render: () => (
        choices.length ? (
          <MultiChoice
            ariaLabel={question('will', plan)}
            options={choices}
            values={pickedOptions(plan)}
            onChange={(values) => onPlan((p) => {
              const had = pickedOptions(p);
              const changed = [...values.filter((v) => !had.includes(v)), ...had.filter((v) => !values.includes(v))];
              return changed.reduce((q, option) => togglePick(q, option, newId), p);
            })}
          />
        ) : (
          <div className="gu-lines">
            <p>You haven’t typed any options yet.</p>
            <p>Go back to add at least one.</p>
          </div>
        )
      ),
    },
    {
      key: 'steps',
      name: STAGE.steps,
      label: STAGE.steps,
      question: question('steps', plan),
      nudges: [nudge('steps', { guest })],
      render: () => (
        <NextSteps>
          {plan.acts.map((a, j) => {
            const w = guest ? null : whereLine(a, j + 1);
            return (
              <NextStepRow
                key={a.id}
                label={`Next step ${j + 1}`}
                maxLength={ROW_MAX}
                value={a.text}
                onChange={(text) => onPlan((p) => setAct(p, a.id, { text }))}
                line={w?.line}
                good={w?.good}
                link={w?.link}
                linkLabel={w?.linkLabel}
                linkRef={(el) => { linkRefs.current[a.id] = el; }}
                onLink={() => setAdding(a.id)}
              />
            );
          })}
        </NextSteps>
      ),
    },
    {
      key: 'sum',
      name: 'Your plan',
      question: question('sum', plan, { name, guest }),
      eye,
      // "Download my PDF" is the quiet link at the bottom bar's left, as on the two Visual tools (M10).
      footAside: pdf || undefined,
      render: (tool) => (
        <GuidedSummary
          stacked
          rows={summaryRows(plan, { guest }).map((r) => ({ ...r, step: STEP_KEYS.indexOf(r.step) }))}
          onChange={tool.go}
        />
      ),
    },
  ];

  return (
    <>
      <GuidedTool
        calm
        name={TOOL_NAME}
        steps={steps}
        progress="percent"
        finishLabel="Finish my plan"
        draftKey={draftKey}
        initialStep={initialStep}
        onClose={onClose}
        onFinish={onFinish}
        onEdited={() => toast.show('Saved')}
      />
      {!guest && (
        <ToolTodoPanel
          open={Boolean(addingAct)}
          onClose={() => setAdding(null)}
          startText={addingAct?.text || ''}
          startStrategyId={addingAct?.strategyId || null}
          startWhere={addingAct?.where || undefined}
          source={TODO_SOURCE}
          sourceId={sourceId}
          onDone={({ where, id, text, strategyId }) => {
            const act = addingAct;
            if (!act) return;
            // An edit puts a new to-do in the old one's place.
            if (act.todoId && act.todoId !== id) onTodoGone?.(act.todoId);
            onPlan((p) => setAct(p, act.id, {
              text: text || act.text,
              where,
              todoId: where === WHERE.none ? null : id,
              strategyId: strategyId || act.strategyId || null,
            }));
          }}
          onUndone={({ id }) => onPlan((p) => ({
            ...p,
            acts: p.acts.map((a) => (a.todoId === id ? { ...a, where: null, todoId: null } : a)),
          }))}
        />
      )}
    </>
  );
}
