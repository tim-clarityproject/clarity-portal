import { useState } from 'react';
import { ChartTable, Choice, NameRows, ResultsHeadline, ResultsSection, StartQuestions, StepBarRows, StepBars, useToast } from '../../components/design';

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
