import { useState } from 'react';
import {
  Button, ChartTable, Chip, ChipRow, Choice, Dissolve, FollowChoice, FollowQuestion, MultiChoice, NameRows, ResultsHeadline, ResultsSection,
  StartQuestions, StepBarRows, StepBars, TextBox, TodoWhere, useToast,
} from '../../components/design';
import { TODO_WHERE, todoWhereOptions } from '../../lib/performance';

// The parts the Visual tools brought (M10, version 5.6; 14 Nov), shared by
// the Team performance check, the Emotional wash and later results pages.
// Invented people only.
const PEOPLE = [
  { id: 'p1', title: 'Priya Shah', sub: 'Head of Operations', value: 5, word: 'Committed', tone: 'good', label: 'Priya Shah. Trust: Committed.' },
  { id: 'p2', title: 'Tom Ellis', sub: 'Sales Director', value: 2, word: 'Open resistance', tone: 'low', label: 'Tom Ellis. Trust: Open resistance.' },
  { id: 'p3', title: 'Daniel Reyes', sub: 'Product Lead', value: 4, word: 'Token cheerleader', tone: '', label: 'Daniel Reyes. Trust: Token cheerleader.' },
];

// An answer row with its line of meaning, and the tick's place.
export function AnswerHintDemo() {
  const [value, setValue] = useState(4);
  return (
    <Choice
      form="rows"
      tick
      label="How much does “Priya Shah” trust you as their leader?"
      value={value}
      onChange={setValue}
      options={[
        { value: 3, label: 'Uncommitted', hint: 'They go along with things without really backing them.' },
        { value: 4, label: 'Token cheerleader', hint: 'They say yes to your face, but do little to back it.' },
        { value: 5, label: 'Committed', hint: 'They back your decisions and act on them as their own.' },
      ]}
    />
  );
}

// Five fine steps, in a list and in a chart's table.
export function StepBarsDemo() {
  return (
    <div>
      <StepBarRows label="Trust" rows={PEOPLE} />
      <ChartTable
        link
        rowHead
        caption="Alignment and autonomy, one row for each person"
        columns={[{ key: 'person', label: 'Person' }, { key: 'alignment', label: 'Alignment' }, { key: 'autonomy', label: 'Autonomy' }]}
        rows={[
          { key: 'p1', cells: { person: <><b>Priya Shah</b><small>Head of Operations</small></>, alignment: <StepBars value={4} tone="good" word="Very well" />, autonomy: <StepBars value={4} tone="good" word="A lot" /> } },
          { key: 'p3', cells: { person: <><b>Daniel Reyes</b><small>Product Lead</small></>, alignment: <StepBars value={2} tone="low" word="Slightly well" />, autonomy: <StepBars value={4} word="A lot" /> } },
        ]}
      />
    </div>
  );
}

// Rows of names, each taken away with the crosshair ("Deleted" with Undo).
export function NameRowsDemo() {
  const toast = useToast();
  const [rows, setRows] = useState(PEOPLE.map(({ id, title, sub }) => ({ id, title, sub })));
  return (
    <NameRows
      label="Who reports to you"
      rows={rows}
      onRemove={(row, index) => {
        setRows((list) => list.filter((r) => r.id !== row.id));
        toast.saved({ message: 'Deleted', onUndo: () => setRows((list) => (list.some((r) => r.id === row.id) ? list : [...list.slice(0, index), row, ...list.slice(index)])) });
      }}
    />
  );
}

// A results page: the headline sentence, a named section, the questions last.
export function ResultsDemo() {
  return (
    <div>
      <ResultsSection first>
        <ResultsHeadline>1 of your 3 people is in the high-performance area right now.</ResultsHeadline>
      </ResultsSection>
      <ResultsSection title="Trust">
        <StepBarRows label="Trust" rows={PEOPLE.slice(0, 2)} />
      </ResultsSection>
      <StartQuestions questions={['What has changed for “Tom Ellis”, and what would rebuild their trust?']} />
    </div>
  );
}

// An answer whose follow-up opens inside its own card (M10's Emotional
// wash; 5e 29k), with starters that fill the box and "Where should it go?".
const WASHES = [
  { value: 'act', label: 'Accept and act', hint: 'Simplify it and move to action.' },
  { value: 'park', label: 'Park and reflect', hint: 'Turn it into a question to come back to.' },
  { value: 'trash', label: 'Trash', hint: 'It’s an unhelpful story, so let it go.' },
];
const STARTERS = ['What do I know for certain here?', 'What would I say to a friend in my place?', 'What matters most to me in this?'];
const WHERE_OPTIONS = todoWhereOptions({ running: true });

export function FollowChoiceDemo() {
  const [value, setValue] = useState('park');
  const [question, setQuestion] = useState('');
  const [step, setStep] = useState('');
  const [where, setWhere] = useState(TODO_WHERE.week);
  return (
    <FollowChoice
      ariaLabel="How will you wash “The chair has never rated me”?"
      options={WASHES}
      value={value}
      onChange={setValue}
      follow={(chosen) => {
        if (chosen === 'park') {
          return (
            <FollowQuestion label="What’s the question that will be helpful to reflect on?" hint="Keep it open, starting with “What” or “How”. Tap one to start, then make it yours.">
              {({ labelId, hintId }) => (
                <>
                  <ChipRow label="Questions to start from">
                    {STARTERS.map((words) => <Chip key={words} pressed={question === words} onClick={() => setQuestion(words)}>{words}</Chip>)}
                  </ChipRow>
                  <TextBox lines="one" aria-labelledby={labelId} aria-describedby={hintId} placeholder="e.g. What would show me where I stand with the chair?" value={question} onChange={setQuestion} />
                </>
              )}
            </FollowQuestion>
          );
        }
        if (chosen === 'act') {
          return (
            <>
              <FollowQuestion label="What’s one small step you’ll take?" hint="Keep it small and clear.">
                {({ labelId, hintId }) => (
                  <TextBox lines="one" aria-labelledby={labelId} aria-describedby={hintId} placeholder="e.g. Ask the chair for 20 minutes before the next board meeting" value={step} onChange={setStep} />
                )}
              </FollowQuestion>
              <TodoWhere options={WHERE_OPTIONS} value={where} onChange={setWhere} />
            </>
          );
        }
        return null;
      }}
    />
  );
}

// Short answers side by side, as many as fit.
export function AnswerColumnsDemo() {
  const [values, setValues] = useState(['Disappointment']);
  return (
    <MultiChoice
      columns
      label="Which words fit the feeling?"
      hint="Choose as many as fit."
      options={['Anger', 'Contempt', 'Disappointment', 'Disgust', 'Fear', 'Guilt'].map((w) => ({ value: w, label: w }))}
      values={values}
      onChange={setValues}
    />
  );
}

// Words that lift away letter by letter, then are gone.
export function DissolveDemo() {
  const [state, setState] = useState('there');
  const words = 'If I push back, I’ll look weak';
  return (
    <div>
      <p className="ds-headline" aria-live="polite">
        {state === 'gone' ? 'That thought has gone.' : <>“{state === 'going' ? <Dissolve text={words} onDone={() => setState('gone')} /> : words}”</>}
      </p>
      <div className="ds-results-link">
        <Button variant="text" onClick={() => setState(state === 'there' ? 'going' : 'there')}>{state === 'there' ? 'Let it go' : 'Bring it back'}</Button>
      </div>
    </div>
  );
}
