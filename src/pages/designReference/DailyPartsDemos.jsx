import { useState } from 'react';
import {
  AddButton,
  AddTodoPanel,
  ExpandList,
  GuidedSummary,
  LevelChoice,
  LoggingWeekRow,
  MultiChoice,
  NotePanel,
  ObjectiveFigureRow,
  RowList,
  ScaleChoice,
  Stat,
  StatGroup,
  Stepper,
  SwitchRow,
  TodoList,
  TodoRow,
  useToast,
} from '../../components/design';

// The shared parts the daily tools and the weekly debrief need (Phase 3:
// M5 Plan my day and Review my day, M1's debrief). Invented text only.

const STRATEGIES = [
  { value: 's1', label: 'Maintain my availability to do good work' },
  { value: 's2', label: 'Deepen my coaching craft' },
  { value: 's3', label: 'Grow through referrals' },
  { value: 's4', label: 'Build The Clarity Portal' },
];

const DO_LIST = [
  { value: 'n1', label: 'Call Evan before 09:00 about the referral', tags: ['On last night’s list'] },
  { value: 't1', label: 'Send the Harbour proposal by 12:00', detail: 'Grow through referrals', tags: ['To-do this week'] },
  { value: 'h1', label: 'Training sessions', detail: 'Maintain my availability to do good work', tags: ['Habit, 1 of 4 this week'] },
  { value: 'h2', label: 'Weekly strategic block', detail: 'Build The Clarity Portal', tags: ['Habit, not yet this week'] },
  { value: 't2', label: 'Book a physio assessment', detail: 'Maintain my availability to do good work', tags: ['Rolled over from week 3'] },
];

/** The 1 to 10 scale and the Low, Medium, High rows. */
export function ScaleLevelDemo() {
  const [rating, setRating] = useState(7);
  const [moved, setMoved] = useState({ s3: 3 });
  return (
    <div className="dr-stack dr-stack--fill">
      <ScaleChoice ariaLabel="How calm under pressure were you today?" who="me" value={rating} onChange={setRating} lowLabel="1 is not at all" highLabel="10 is completely" />
      <LevelChoice
        ariaLabel="Which Strategies moved today?"
        who="me"
        options={STRATEGIES}
        values={moved}
        onChange={setMoved}
        question={(name) => `How much did “${name}” move?`}
      />
    </div>
  );
}

/** Pick up to three, with a second line; rows with Add another; rows that open. */
export function RowsDemo() {
  const [picked, setPicked] = useState(['n1', 'h1']);
  const [tomorrow, setTomorrow] = useState(['Call Evan before 09:00 about the referral', '']);
  return (
    <div className="dr-stack dr-stack--fill">
      <MultiChoice variant="pick" ariaLabel="What will you do today?" who="me" options={DO_LIST} values={picked} onChange={setPicked} max={3} />
      <RowList who="me" rows={tomorrow} onChange={setTomorrow} max={3} maxLength={300} itemLabel={(n) => `Important thing ${n} for tomorrow`} />
      <ExpandList
        label="Your days"
        items={[
          { key: 'mon', title: 'Mon 19 Oct', summary: 'The Harbour call landed and the proposal went out.', render: () => <p className="dr-p">Went well: The Harbour call landed and the proposal went out at 11:50.</p> },
          { key: 'tue', title: 'Tue 20 Oct', summary: 'Two sessions ran over, so I started the third late.', render: () => <p className="dr-p">Differently: Leave ten minutes between calls.</p> },
        ]}
      />
    </div>
  );
}

/** A note that never looks like a task, a switch with its words, the half-hour stepper. */
export function NoteSwitchDemo() {
  const [shared, setShared] = useState(false);
  const [hours, setHours] = useState(7.5);
  return (
    <div className="dr-stack dr-stack--fill">
      <NotePanel label="Last night you also wrote this note." after="If it needs doing, add it as a to-do.">
        Idea: a short workshop for the Harbour leadership team.
      </NotePanel>
      <SwitchRow
        label="Share with Alex"
        note={shared ? 'Alex will see this week’s scores, your objective figures and your three answers.' : 'Only you can see this debrief.'}
        checked={shared}
        onChange={setShared}
      />
      <Stepper
        label="Total hours"
        value={hours}
        onChange={setHours}
        min={0}
        max={14}
        step={0.5}
        startFrom={7}
        lessLabel="Half an hour less"
        moreLabel="Half an hour more"
        unit="hours"
      />
    </div>
  );
}

/** An objective's figure, the debrief's week rows with their totals (mint at
 * or above the standard, grey below), and next week's to-dos, shown not ticked. */
export function FiguresDemo() {
  const [clients, setClients] = useState('40');
  const [steps, setSteps] = useState({ mo: '11,200', tu: '8,400', we: '' });
  const days = [['mo', 'Mo', 'Monday 19 Oct'], ['tu', 'Tu', 'Tuesday 20 Oct'], ['we', 'We', 'Wednesday 21 Oct'], ['th', 'Th', 'Thursday 22 Oct'], ['fr', 'Fr', 'Friday 23 Oct']]
    .map(([key, box, full]) => ({ key, box, full }));
  return (
    <div className="dr-stack dr-stack--fill">
      <ObjectiveFigureRow name="Coaching clients" value={clients} onChange={setClients} lastLine="Last week 31" change={clients ? { text: '+9', good: true } : null} />
      <LoggingWeekRow
        name="Steps"
        detail="10,000 steps a day"
        days={days}
        texts={steps}
        onChange={(d, t) => setSteps((s) => ({ ...s, [d]: t }))}
        dashEmpty
        total={{ label: '19,600 of 50,000 steps', value: '39%', good: false }}
      />
      <LoggingWeekRow
        name="Training sessions"
        detail="3 sessions a week"
        days={days}
        texts={{ mo: '1', tu: '', we: '1', th: '1', fr: '' }}
        onChange={() => null}
        dashEmpty
        total={{ label: '3 of 3', value: '100%', good: true }}
      />
      <TodoList label="Next week’s to-dos">
        <TodoRow plain text="Book a physio assessment" strategyName="Maintain my availability to do good work" tags={['Rolls over from week 3']} />
        <TodoRow plain text="Update my LinkedIn profile" strategyName="Grow through referrals" />
      </TodoList>
    </div>
  );
}

/** The editable summary with Skipped and Add, and the mint celebration. */
export function SummaryDemo() {
  const toast = useToast();
  const [panel, setPanel] = useState(false);
  const [form, setForm] = useState({ text: '', strategyId: 's3', impact: 2 });
  return (
    <div className="dr-stack dr-stack--fill">
      <GuidedSummary
        emptyWord="Skipped"
        addWhenEmpty
        onChange={() => toast.show('This would open that step.')}
        rows={[
          { label: 'Sleep', value: '7.5 hours, good', step: 0 },
          { label: 'Gratitude', value: '', step: 1 },
          { label: 'To-dos', value: ['1. Call Evan before 09:00 about the referral', '2. Training sessions'], sub: 'Highest priority is the first.', step: 3 },
          { label: 'Went well', value: 'The Harbour call landed.', good: 'Plus 1 unplanned win.', step: 4 },
        ]}
      />
      <StatGroup>
        <Stat celebrate label="Week score" value="88%" good note="Your standard is 85%." />
        <Stat panel label="Debrief streak" value="6" unit="weeks" note="You’ve debriefed 6 weeks in a row, including this one." />
      </StatGroup>
      <div className="dr-row">
        <AddButton onClick={() => setPanel(true)}>Add a to-do</AddButton>
      </div>
      <AddTodoPanel
        open={panel}
        onClose={() => setPanel(false)}
        form={form}
        onFormChange={setForm}
        strategies={STRATEGIES}
        todayNote="It’s added to today and to this week’s sprint."
        onAdd={() => { setPanel(false); setForm((f) => ({ ...f, text: '' })); toast.show('Added to today and this week’s sprint.'); }}
      />
    </div>
  );
}
