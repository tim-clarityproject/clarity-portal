import { useState } from 'react';
import {
  Button, Choice, DatePicker, GuidedSummary, GuidedTool, MultiChoice, TextBox, ToolTodoPanel, dayLabel,
} from '../components/design';
import DecisionFlow from './toolFocus/DecisionFlow';
import { BoxAndWhen, ListAnswer, PairRows } from './toolFocus/Draft6Parts';
import { newId } from '../lib/syncQueue';
import { formatClockTime } from '../lib/dateFormatter';
import { quote } from '../lib/draft6Tools/shared';
import * as PP from '../lib/draft6Tools/pressurePlan';

// The Pressure plan (Polish 1, Stage D item 1): Draft 6's eleven screens,
// word for word, one question per screen in focus mode (GuidedTool), at
// /pressure-plan. A Reset tool: shorter and steadier, one thing at a time.
// It opens every plan the older page saved (its situation and if-then
// plans; src/lib/draft6Tools/pressurePlan.js). Every question can be
// skipped but the last, "When will you rehearse your routine?". What they
// control can go into this week as a to-do (the one shared add panel,
// "Where should it go?", rule 31). The summary's button saves it and opens
// its summary page, with Breathe one tap away.

export default function IfThenPlanning() {
  return (
    <DecisionFlow model={PP} draftName="if-then" closeTo="/personal/reset">
      {(flow) => <PressurePlanTool {...flow} />}
    </DecisionFlow>
  );
}

const NOT_YET = 'Not answered yet.';

function PressurePlanTool({ answers: a, onAnswers, draftKey, initialStep, onClose, onFinish, decisionId }) {
  const set = (patch) => onAnswers((s) => ({ ...s, ...patch }));
  const [adding, setAdding] = useState(null); // the controlled item whose add panel is open
  const [firstPair] = useState(newId);
  const items = PP.mindItems(a);
  const hard = PP.hardest(a);
  const ifThenQ = PP.ifThenQuestion(hard?.text);
  // The first If is what they quoted, until they write their own.
  const pairs = a.items.length ? a.items : [{ id: firstPair, ifCondition: hard ? quote(hard.text) : '', thenAction: '' }];

  const steps = [
    {
      key: 'moment',
      name: 'The moment',
      question: PP.QUESTIONS.moment,
      example: PP.MOMENT_EXAMPLES,
      render: () => <TextBox lines="many" ariaLabel={PP.QUESTIONS.moment} value={a.moment} onChange={(moment) => set({ moment })} />,
    },
    {
      key: 'when',
      name: 'When it is',
      question: PP.QUESTIONS.when,
      render: () => (
        <div className="d6-when">
          <DatePicker label="Which day?" value={a.noDate ? '' : a.date} onChange={(date) => set({ date, noDate: false })} />
          <MultiChoice
            ariaLabel={PP.NO_DATE}
            options={[{ value: 'none', label: PP.NO_DATE }]}
            values={a.noDate ? ['none'] : []}
            onChange={(v) => set({ noDate: v.includes('none'), date: v.includes('none') ? '' : a.date })}
          />
        </div>
      ),
    },
    {
      key: 'well',
      name: 'When you did it well',
      question: PP.QUESTIONS.well,
      render: () => <TextBox lines="many" ariaLabel={PP.QUESTIONS.well} value={a.well} onChange={(well) => set({ well })} />,
    },
    {
      key: 'mind',
      name: 'On your mind',
      question: PP.QUESTIONS.mind,
      render: () => <ListAnswer list={a.mind} onList={(mind) => set({ mind })} itemLabel={(n) => `On your mind ${n}`} />,
    },
    // One screen for each thing on their mind: one tap moves on (rule 21).
    ...items.map((m, n) => ({
      key: `hold-${m.id}`,
      name: `Which is true ${n + 1}`,
      question: PP.holdQuestion(m.text),
      oneTap: true,
      render: (tool) => (
        <Choice
          form="rows"
          tick
          ariaLabel={PP.holdQuestion(m.text)}
          options={PP.HOLDS}
          value={m.hold}
          onChange={(hold) => set({ mind: a.mind.map((x) => (x.id === m.id ? { ...x, hold } : x)) })}
          onChoose={() => tool.next()}
        />
      ),
    })),
    // What they control: what they'll do, which can go into this week.
    ...PP.controlled(a).map((m, n) => ({
      key: `act-${m.id}`,
      name: `What you’ll do ${n + 1}`,
      question: PP.actQuestion(m.text),
      render: () => (
        <div className="d6-when">
          <TextBox
            lines="many"
            ariaLabel={PP.actQuestion(m.text)}
            value={a.acts[m.id] || ''}
            onChange={(v) => set({ acts: { ...a.acts, [m.id]: v } })}
          />
          {a.todos[m.id]
            ? <p className="ds-guide-nudge" role="status">It’s in your to-dos.</p>
            : (
              <div>
                <Button variant="outline" onClick={() => setAdding(m.id)}>Add to this week</Button>
              </div>
            )}
        </div>
      ),
    })),
    {
      key: 'chance',
      name: 'The chance to show',
      question: PP.QUESTIONS.chance,
      render: () => <TextBox lines="many" ariaLabel={PP.QUESTIONS.chance} value={a.chance} onChange={(chance) => set({ chance })} />,
    },
    {
      key: 'ifthen',
      name: 'If it happens',
      question: ifThenQ,
      example: PP.IF_THEN_EXAMPLES,
      render: () => (
        <PairRows
          rows={pairs}
          onRows={(rows) => set({ items: rows })}
          fields={[{ key: 'ifCondition', label: 'If' }, { key: 'thenAction', label: 'Then' }]}
          itemName="plan"
        />
      ),
    },
    {
      key: 'routine',
      name: 'Your routine',
      question: PP.QUESTIONS.routine,
      render: () => (
        <div className="d6-when">
          {PP.ROUTINE.map((r) => (
            <TextBox
              key={r.key}
              label={r.label}
              lines="one"
              value={a.routine[r.key]}
              onChange={(v) => set({ routine: { ...a.routine, [r.key]: v } })}
            />
          ))}
        </div>
      ),
    },
    {
      key: 'rehearse',
      name: 'When you’ll rehearse',
      question: PP.QUESTIONS.rehearse,
      // The commit question: the one that can't be skipped (question rule 34).
      required: true,
      check: () => PP.rehearseProblem(a),
      render: () => (
        <BoxAndWhen
          question={PP.QUESTIONS.rehearse}
          date={a.rehearse.date}
          onDate={(date) => set({ rehearse: { ...a.rehearse, date } })}
          time={a.rehearse.time}
          onTime={(time) => set({ rehearse: { ...a.rehearse, time } })}
        />
      ),
    },
    {
      key: 'sum',
      name: 'Your pressure plan',
      title: 'Your pressure plan',
      noProgress: true,
      wide: true,
      nextLabel: 'Save my plan',
      render: (tool) => <GuidedSummary stacked rows={summaryRows(a)} onChange={(key, opts) => tool.go(tool.steps.findIndex((s) => s.key === key), opts)} />,
    },
  ];

  const open = adding ? items.find((m) => m.id === adding) : null;

  return (
    <>
      <GuidedTool
        name={PP.TOOL_NAME}
        steps={steps}
        draftKey={draftKey}
        initialStep={initialStep}
        onClose={onClose}
        onFinish={onFinish}
        finishLabel="Save my plan"
      />
      <ToolTodoPanel
        open={Boolean(open)}
        onClose={() => setAdding(null)}
        startText={open ? (a.acts[open.id] || '').trim() : ''}
        startWhere="week"
        sourceId={decisionId}
        item={open?.id}
        onDone={({ id }) => {
          if (open && id) set({ todos: { ...a.todos, [open.id]: id } });
          setAdding(null);
        }}
      />
    </>
  );
}

/** "Mon 30 Nov, 07:30": the day, and the time where there is one (times only through formatClockTime, rule 19). */
function whenWords(date, time) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time || '').split(':').map(Number);
  return time ? `${dayLabel(date)}, ${formatClockTime(new Date(y, m - 1, d, h, min))}` : dayLabel(date);
}

// An If or Then as it reads after its own word, whether or not they typed the word themselves.
const after = (word, text) => `${text || ''}`.trim().replace(new RegExp(`^${word}\\b[,\\s]*`, 'i'), '');

// The summary (Draft 6): the moment and its date, what you control, your
// if-then plans and your routine; Breathe is one tap away on the saved plan.
function summaryRows(a) {
  const controlled = PP.controlled(a);
  const plans = PP.ifThens(a);
  const routine = PP.ROUTINE.filter((r) => a.routine[r.key].trim()).map((r) => ({ text: a.routine[r.key].trim(), sub: r.label }));
  return [
    {
      key: 'moment',
      step: 'moment',
      label: 'The moment',
      lines: [{ text: a.moment.trim() || NOT_YET, sub: a.noDate ? PP.NO_DATE : a.date ? dayLabel(a.date) : undefined }],
    },
    {
      key: 'control',
      step: 'mind',
      label: 'What you control',
      lines: controlled.length ? controlled.map((m) => ({ text: m.text.trim(), sub: (a.acts[m.id] || '').trim() || undefined })) : [{ text: NOT_YET }],
    },
    {
      key: 'ifthen',
      step: 'ifthen',
      label: 'If it happens',
      lines: plans.length ? plans.map((p) => ({ text: `If ${after('if', p.ifCondition)}`, sub: `${p.thenAction || ''}`.trim() ? `Then ${after('then', p.thenAction)}` : undefined })) : [{ text: NOT_YET }],
    },
    { key: 'routine', step: 'routine', label: 'Your routine', lines: routine.length ? routine : [{ text: NOT_YET }] },
    { key: 'rehearse', step: 'rehearse', label: 'When you’ll rehearse', lines: [{ text: whenWords(a.rehearse.date, a.rehearse.time) || NOT_YET }] },
  ];
}
