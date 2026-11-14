import { useState } from 'react';
import { Button, ButtonNote, CalmCard, GuidedSummary, GuidedTool, NextStepRow, NextSteps, RowList, TextBox } from '../../components/design';

// The calm stepped frame and its parts (M9 Get unstuck, M10 and M7b; Tim,
// 13 Nov): GuidedTool with `calm`, a step's `check`, rows with Deleted
// and Undo, next steps, the stacked summary, and a guest page's calm card.
export function CalmFrameDemo() {
  const [goal, setGoal] = useState('');
  const [rows, setRows] = useState(['Hiring managers take a week to give feedback.', '']);
  const [step, setStep] = useState('Agree a 48-hour feedback rule at Monday’s meeting.');
  const [added, setAdded] = useState(false);
  const steps = [
    {
      key: 'goal', name: 'Goal', label: 'Goal', question: 'What do you want to achieve?', nudges: ['Make it specific enough to know when you’re there.'],
      example: 'Win the Northfield contract renewal by the end of January.', required: true,
      check: () => (goal.trim() ? null : 'Type your goal to carry on.'),
      render: () => <TextBox ariaLabel="What do you want to achieve?" value={goal} onChange={setGoal} placeholder="e.g. Cut our time to hire to 30 days by March" />,
    },
    {
      key: 'rows', name: 'Reality', label: 'Reality', question: 'What’s in the way?', nudges: ['Type one constraint in each box.'],
      render: () => <RowList rows={rows} onChange={setRows} max={Infinity} removeAlways undo itemLabel={(n) => `Constraint ${n}`} addLabel="Add another constraint" />,
    },
    {
      key: 'steps', name: 'Will', label: 'Will', question: 'What exactly will you do?', nudges: ['Make each one something you can start this week.'],
      render: () => (
        <NextSteps>
          <NextStepRow
            label="Next step 1"
            value={step}
            onChange={setStep}
            line={added ? 'It’s in this week’s sprint.' : 'It isn’t in this week’s sprint yet.'}
            good={added}
            link={added ? 'Edit' : 'Add to this week'}
            linkLabel={added ? 'Edit next step 1 in this week' : 'Add next step 1 to this week'}
            onLink={() => setAdded((v) => !v)}
          />
        </NextSteps>
      ),
    },
    {
      key: 'sum', name: 'Your plan', question: 'Here’s your plan.',
      render: (tool) => (
        <GuidedSummary
          stacked
          onChange={tool.go}
          rows={[
            { key: 'goal', step: 0, label: 'Your goal', lines: [{ text: goal || 'You skipped this.' }] },
            { key: 'rows', step: 1, label: 'What’s in the way', lines: rows.filter(Boolean).map((text) => ({ text })) },
            { key: 'steps', step: 2, label: 'Your next steps', lines: [{ text: step, sub: added ? 'It’s in this week’s sprint.' : 'It isn’t in this week’s sprint yet.', good: added }] },
          ]}
        />
      ),
    },
  ];
  return (
    <div className="dr-tool-frame">
      <GuidedTool calm layout="framed" name="Get unstuck" progress="percent" finishLabel="Finish my plan" steps={steps} onClose={() => {}} onFinish={() => {}} />
    </div>
  );
}

export function CalmCardDemo() {
  return (
    <div className="dr-stack">
      <ButtonNote beside note="~15 minutes"><Button variant="primary">Start my plan</Button></ButtonNote>
      <CalmCard
        line="Plan this into your week with The Clarity Portal, your personal performance tool."
        sub="It’s free, and this plan moves into it."
      >
        <Button>Create my free account</Button>
      </CalmCard>
    </div>
  );
}
