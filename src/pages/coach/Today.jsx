import { useState } from 'react';
import { PageHeader } from '../../components/design';
import { birthdaysOn, dayWords, possessive } from '../../lib/coach/model';
import { rowsOf } from '../../lib/coach/store';
import { InlineLink, useCoachPortal } from './parts';
import NameNote from './NameNote';

// Today (M11). The coaching day itself (calls, to-dos, the brief, the
// morning plan) is Phase 6a run 2: until then Today is the header and an
// empty calm page, with one quiet line for a birthday, whose name opens a
// drafted note (Tim, 18 Nov).
export default function Today() {
  const { state, clients, todayKey, coach } = useCoachPortal();
  const [note, setNote] = useState(null);
  const abouts = rowsOf(state, 'client_about').filter((a) => a.coach_id === coach.id);
  const birthdays = birthdaysOn(abouts, clients, todayKey);
  return (
    <div className="cc-page">
      <div className="cc-col">
        <PageHeader title="Today" meta={[dayWords(todayKey, todayKey)]} />
        {birthdays.map((p) => (
          <p key={p.id} className="cc-quiet">
            It’s <InlineLink onClick={() => setNote(p)}>{possessive(p.name)}</InlineLink> birthday today.
          </p>
        ))}
        <NameNote profile={note} reason="It’s their birthday today." onClose={() => setNote(null)} />
      </div>
    </div>
  );
}
