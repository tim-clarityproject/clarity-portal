import { useState } from 'react';
import { BreathOrb, Button, EndScreen, InfoWords, IconTextRow, MultiChoice, NightScope, RowList, WhoSees, useOrbStyle, useToast } from '../../components/design';

// Sleep wind down and Work's done for today (M19, Phase 4 step 6): the
// night colours, the centred end screen, the thoughts in rows and the
// next morning's Carried over list. Invented text only.

/** The night colours, the orb with no words, and Sleep well. */
export function NightDemo() {
  const toast = useToast();
  const [style] = useOrbStyle();
  const [rows, setRows] = useState(['Call Evan before 09:00 about the referral', 'Book a day off for the half term']);
  return (
    <div className="dr-stack dr-stack--fill">
      <span className="dr-small">The thoughts, one row each, 300 characters at most, as many as needed:</span>
      <IconTextRow>
        <WhoSees audience="me" />
        <InfoWords title="Why write it down" text="In a sleep study, people who wrote a to-do list for the next day fell asleep faster.">Why write it down</InfoWords>
      </IconTextRow>
      <RowList numbered rows={rows} onChange={setRows} max={Infinity} maxLength={300} itemLabel={(n) => `Thought ${n}`} addLabel="Add a thought" />
      <span className="dr-small">At night: the mode’s own colours, one step quieter, the orb alone:</span>
      <NightScope className="dr-night">
        <div className="ds-night-breathe">
          <BreathOrb style={style} pattern="wind" night size="night" label="Breathe in for 4 seconds as the circle grows, and out for 6 seconds as it shrinks." />
          <Button variant="text" onClick={() => toast.show('Sleep well shows next.')}>End early</Button>
        </div>
        <EndScreen
          kind="night"
          title="Sleep well"
          lines={['Your thoughts are saved for the morning.', 'Plan my day will have them ready.']}
          action={<Button variant="outline" onClick={() => toast.show('Home opens here.')}>Back to Home</Button>}
        />
      </NightScope>
    </div>
  );
}

/** Work's done for today: the centred end screen with the one coral button. */
export function WorkDoneDemo() {
  const toast = useToast();
  return (
    <EndScreen
      kind="done"
      title="Work’s done for today"
      lines={['Your open to-dos are on tomorrow’s list.', 'Tomorrow starts with “Call Evan before 09:00 about the referral”.']}
      action={<Button variant="primary" onClick={() => toast.show('Home opens here.')}>Back to Home</Button>}
    />
  );
}

const CARRIED = [
  { value: 'c0', label: 'Call Evan before 09:00 about the referral', tags: ['From Review my day and last night’s sleep wind down'], group: 'carried' },
  { value: 'c1', label: 'Finish the Harbour case study', tags: ['From Review my day and last night’s sleep wind down'], group: 'carried' },
  { value: 'c2', label: 'Reply to Max about the workshop', tags: ['From Review my day'], group: 'carried' },
  { value: 'c3', label: 'Book a day off for the half term', tags: ['From last night’s sleep wind down'], group: 'carried' },
  { value: 'w0', label: 'Send the Harbour proposal by 12:00', detail: 'Grow through referrals', tags: ['To-do this week'], group: 'week' },
  { value: 'w1', label: 'Check-in message to a past client', detail: 'Grow through referrals', tags: ['Habit, 3 of 5 this week'], group: 'week' },
];

/** The next morning's Carried over list, with where each came from. */
export function CarriedOverDemo() {
  const [picked, setPicked] = useState(['c0', 'c1']);
  return (
    <MultiChoice
      variant="pick"
      ariaLabel="What will you do today?"
      who="me"
      options={CARRIED}
      values={picked}
      onChange={setPicked}
      max={3}
      groups={[{ key: 'carried', title: 'Carried over' }, { key: 'week', title: 'This week' }]}
      count={(n) => `You’ve chosen ${n} of 3.`}
    />
  );
}
