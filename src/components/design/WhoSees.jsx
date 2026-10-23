import { useCoachName, whoSeesText } from './coachContext';
import './design.css';

// Who can see this (experience rule 44, Tim 23 Oct; M6): a small lock and
// who can see what's typed here, right beside where people type, so they
// feel safe to write anything. It changes the moment something is
// shared, and back if sharing is undone (the page passes the current
// audience). Screen readers hear "Who can see this: Only you".
//
// audience:  'me' (Only you), 'coach' (You and [coach's first name]) or
//            'team' (Your team).
// coachName: the client's own coach's first name; from CoachContext when
//            not given. Never typed into the code.
const LOCK = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export default function WhoSees({ audience = 'me', coachName }) {
  const name = useCoachName(coachName);
  return (
    <span className="ds-who" aria-live="polite">
      {LOCK}
      <span className="ds-sr">Who can see this: </span>
      {whoSeesText(audience, name)}
    </span>
  );
}
