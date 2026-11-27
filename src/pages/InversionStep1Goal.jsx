import { GuidedSummary, GuidedTool, MultiChoice, TextBox, dayLabel } from '../components/design';
import DecisionFlow from './toolFocus/DecisionFlow';
import { BoxAndWhen, ListAnswer } from './toolFocus/Draft6Parts';
import { filled, quote } from '../lib/draft6Tools/shared';
import * as PM from '../lib/draft6Tools/preMortem';

// The Pre-mortem (Polish 1, Stage D item 1): Draft 6's ten screens, word for
// word, one question per screen in focus mode (GuidedTool), at /pre-mortem.
// It replaces the older three pages (/pre-mortem/risks and /pre-mortem/plan
// now come here) and opens every pre-mortem they saved
// (src/lib/draft6Tools/preMortem.js). Every question can be skipped but
// the last, "What will you do first, and when?". The summary's button saves
// it and opens its summary page, as Finish did.

export default function InversionStep1Goal() {
  return (
    <DecisionFlow model={PM} draftName="inversion-1" closeTo="/personal/plan">
      {(flow) => <PreMortemTool {...flow} />}
    </DecisionFlow>
  );
}

const NOT_YET = 'Not answered yet.';

function PreMortemTool({ answers: a, onAnswers, draftKey, initialStep, onClose, onFinish }) {
  const set = (patch) => onAnswers((s) => ({ ...s, ...patch }));
  const options = PM.causeOptions(a);
  const top = PM.ranked(a);
  const list = (key, label) => (
    <ListAnswer list={a[key]} onList={(rows) => set({ [key]: rows })} itemLabel={(n) => `${label} ${n}`} />
  );

  const steps = [
    {
      key: 'plan',
      name: 'The plan',
      question: PM.QUESTIONS.plan,
      example: PM.PLAN_EXAMPLES,
      render: () => <TextBox lines="many" ariaLabel={PM.QUESTIONS.plan} value={a.plan} onChange={(plan) => set({ plan })} />,
    },
    { key: 'going', name: 'What’s going for it', question: PM.QUESTIONS.going, render: () => list('going', 'What’s going for it') },
    { key: 'gone', name: 'What happened', question: PM.QUESTIONS.gone, render: () => list('gone', 'What happened') },
    { key: 'wreck', name: 'How you’d wreck it', question: PM.QUESTIONS.wreck, render: () => list('wreck', 'How you’d wreck it') },
    // Only once there's something to choose from.
    ...(options.length ? [
      {
        key: 'likely',
        name: 'Most likely',
        question: PM.QUESTIONS.likely,
        render: () => (
          <MultiChoice ariaLabel={PM.QUESTIONS.likely} options={options} values={a.likely} max={PM.PICK_MAX} onChange={(likely) => set({ likely })} />
        ),
      },
      {
        key: 'hurt',
        name: 'Would hurt most',
        question: PM.QUESTIONS.hurt,
        render: () => (
          <MultiChoice ariaLabel={PM.QUESTIONS.hurt} options={options} values={a.hurt} max={PM.PICK_MAX} onChange={(hurt) => set({ hurt })} />
        ),
      },
    ] : []),
    // One screen for each cause picked, most likely and most hurtful first.
    ...top.flatMap((cause, n) => [
      {
        key: `prevent-${cause.id}`,
        name: `Stop cause ${n + 1}`,
        question: PM.preventQuestion(cause.text),
        render: () => (
          <TextBox
            lines="many"
            ariaLabel={PM.preventQuestion(cause.text)}
            value={a.prevent[cause.id] || ''}
            onChange={(v) => set({ prevent: { ...a.prevent, [cause.id]: v } })}
          />
        ),
      },
      {
        key: `warn-${cause.id}`,
        name: `Warning sign ${n + 1}`,
        question: PM.warnQuestion(cause.text),
        render: () => (
          <TextBox
            lines="many"
            ariaLabel={PM.warnQuestion(cause.text)}
            value={a.warn[cause.id] || ''}
            onChange={(v) => set({ warn: { ...a.warn, [cause.id]: v } })}
          />
        ),
      },
    ]),
    {
      key: 'first',
      name: 'Your first step',
      question: PM.QUESTIONS.first,
      // The commit question: the one that can't be skipped (question rule 34).
      required: true,
      check: () => PM.firstProblem(a),
      render: () => (
        <BoxAndWhen
          question={PM.QUESTIONS.first}
          text={a.first.text}
          onText={(t) => set({ first: { ...a.first, text: t } })}
          date={a.first.date}
          onDate={(date) => set({ first: { ...a.first, date } })}
        />
      ),
    },
    {
      key: 'sum',
      name: 'Your pre-mortem',
      title: 'Your pre-mortem',
      noProgress: true,
      wide: true,
      nextLabel: 'Save my pre-mortem',
      render: (tool) => <GuidedSummary stacked rows={summaryRows(a, top)} onChange={(key, opts) => tool.go(tool.steps.findIndex((s) => s.key === key), opts)} />,
    },
  ];

  return (
    <GuidedTool
      name={PM.TOOL_NAME}
      steps={steps}
      draftKey={draftKey}
      initialStep={initialStep}
      onClose={onClose}
      onFinish={onFinish}
      finishLabel="Save my pre-mortem"
    />
  );
}

// The summary (Draft 6): the plan, what's going for it, the ranked causes
// with what will stop each and its warning sign, and your first step.
function summaryRows(a, top) {
  const lines = (rows) => (rows.length ? rows.map((r) => ({ text: r.text })) : [{ text: NOT_YET }]);
  const causes = PM.causes(a);
  return [
    { key: 'plan', step: 'plan', label: 'The plan', lines: [{ text: a.plan.trim() || NOT_YET }] },
    { key: 'going', step: 'going', label: 'What’s going for it', lines: lines(filled(a.going)) },
    // The causes picked, ranked; with none picked yet, every cause.
    ...(top.length ? top.map((c, n) => ({
      key: `cause-${c.id}`,
      step: `prevent-${c.id}`,
      // A short label that stays on one line; the cause itself is the row's words.
      label: `Cause ${n + 1}`,
      editName: `what will stop “${quote(c.text)}”`,
      lines: [{ text: c.text.trim(), sub: causeLine(a, c) }],
    })) : [{ key: 'causes', step: 'gone', label: 'What could go wrong', lines: lines(causes) }]),
    {
      key: 'first',
      step: 'first',
      label: 'Your first step',
      lines: [{ text: a.first.text.trim() || NOT_YET, sub: a.first.date ? dayLabel(a.first.date) : undefined }],
    },
  ];
}

/** "What will stop it: … Early warning sign: …", in one line under the cause. */
function causeLine(a, c) {
  const stop = (a.prevent[c.id] || '').trim().replace(/[.]+$/, '');
  const warn = (a.warn[c.id] || '').trim().replace(/[.]+$/, '');
  return [`What will stop it: ${stop || 'not answered yet'}.`, warn && `Early warning sign: ${warn}.`].filter(Boolean).join(' ');
}
