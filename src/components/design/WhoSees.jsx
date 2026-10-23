import { useCoachName, whoSeesText } from './coachContext';
import './design.css';

// Who can see this (experience rule 44, Tim 23 Oct; M6): a small eye and
// who can see what's typed here, right beside where people type, so they
// feel safe to write anything. It changes the moment something is
// shared, and back if sharing is undone (the page passes the current
// audience). Screen readers hear "Who can see this: Only you".
//
// audience:  'me' (Only you), 'coach' (You and [coach's first name]) or
//            'team' (Your team).
// coachName: the client's own coach's first name; from CoachContext when
//            not given. Never typed into the code.
const EYE = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.2 8C2.7 5.2 5.1 3.6 8 3.6s5.3 1.6 6.8 4.4C13.3 10.8 10.9 12.4 8 12.4S2.7 10.8 1.2 8Z" />
    <circle cx="8" cy="8" r="2.1" />
  </svg>
);

export default function WhoSees({ audience = 'me', coachName }) {
  const name = useCoachName(coachName);
  return (
    <span className="ds-who" aria-live="polite">
      {EYE}
      <span className="ds-sr">Who can see this: </span>
      {whoSeesText(audience, name)}
    </span>
  );
}
