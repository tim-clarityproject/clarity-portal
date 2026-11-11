import { useState } from 'react';
import {
  Button,
  CarryOnList,
  DayFocus,
  HelpList,
  MiniDial,
  PlanSteps,
  QuietLines,
  SuggestionCard,
  WeekLine,
  useToast,
} from '../../components/design';

// Home as Today's parts (Phase 4 step 2, mock-up M2). Invented content
// only; every button stays on the gallery.

function useSay() {
  const toast = useToast();
  return (what) => toast.show(what);
}

export function SuggestionDemo() {
  const say = useSay();
  return (
    <div>
      <SuggestionCard
        question="Ready to plan your day?"
        time="~4 minutes"
        action={{ label: 'Daily plan', onClick: () => say('Opens Daily plan.') }}
      />
      <SuggestionCard
        label="Sleep wind down"
        question="Ready to wind down?"
        lines={['Write down what’s on your mind for tomorrow, then breathe slowly.']}
        time="~6 minutes"
        action={{ label: 'Start my wind down', onClick: () => say('Opens Sleep wind down.') }}
        link={{ label: 'Not tonight', onClick: () => say('You can wind down tomorrow evening.') }}
      />
      <QuietLines
        items={[{
          key: 'mission',
          lines: ['Ready to add your Mission?'],
          action: { label: 'Add my Mission', onClick: () => say('Opens the Mission step.') },
          onDismiss: () => say('We won’t ask again.'),
        }]}
      />
    </div>
  );
}

const WEEKS = [
  { state: 'good' }, { state: 'below' }, { state: 'good' }, { state: 'now' },
  { state: 'next' }, { state: 'next' }, { state: 'next' }, { state: 'next' },
];

export function MiniDialDemo() {
  const say = useSay();
  return (
    <div>
      <MiniDial
        weeks={WEEKS}
        dayInWeek={2}
        date="Wed 21 Oct"
        line="Week 4 of 8"
        label="Wed 21 Oct. Performance Sprint 4, week 4 of 8. Open the Performance Sprint."
        onClick={() => say('Opens the Performance Sprint.')}
      />
      <div style={{ marginTop: 'var(--space-5)' }}>
        <WeekLine
          label="Performance score this week"
          figure="86%"
          good
          line="Your usual range is 72 to 84%."
          onClick={() => say('Opens the Performance Sprint.')}
        />
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <WeekLine
          label="Performance score this week"
          figure="64%"
          line="Your usual range appears after 6 weeks."
          onClick={() => say('Opens the Performance Sprint.')}
        />
      </div>
    </div>
  );
}

export function DayFocusDemo() {
  return <DayFocus way="Calm under pressure" strategies={['Grow through referrals']} />;
}

export function PlanStepsDemo() {
  return (
    <PlanSteps
      steps={[
        { key: 'mission', name: 'My Mission', state: 'done' },
        { key: 'objectives', name: 'Outcome Objectives', state: 'next' },
        { key: 'strategies', name: 'Strategies', state: 'later' },
        { key: 'sprint', name: 'Performance Sprint 1', state: 'later' },
      ]}
    />
  );
}

export function HelpListDemo() {
  const say = useSay();
  const [open, setOpen] = useState(false);
  const items = [
    ['I’m under pressure', 'Pressure plan'],
    ['I’ve got a hard conversation coming up', 'Give difficult feedback'],
    ['I’m stuck on a decision', 'Get unstuck'],
    ['I want a meeting to go well', 'Meeting planner'],
    ['I need a moment to reset', 'Breathe'],
  ].map(([situation, tool]) => ({ situation, tool, onClick: () => { setOpen(false); say(`Opens ${tool}.`); } }));
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Get help with something</Button>
      <HelpList open={open} onClose={() => setOpen(false)} items={items} coach="Tim" onChat={() => { setOpen(false); say('Opens a chat with Tim.'); }} />
    </div>
  );
}

export function CarryOnDemo() {
  const say = useSay();
  return (
    <CarryOnList
      items={[
        { key: 'debrief', title: 'Weekly performance debrief', date: '23 Oct, 18:40', onClick: () => say('Opens the debrief where you left it.') },
        { key: 'journal', title: 'Journal', date: '23 Oct, 07:12', onClick: () => say('Opens the Journal where you left it.') },
      ]}
    />
  );
}
