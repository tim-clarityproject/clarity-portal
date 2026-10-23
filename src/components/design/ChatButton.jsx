import { useCoachName } from './coachContext';
import './design.css';

// Chat to the client's own coach (Tim, 23 Oct): "Chat to" and the coach's
// first name, e.g. "Chat to Tim". Never "Dr." and never a name typed into
// the code: it comes from the client's coach (prop or CoachContext).
// Nothing shows for someone without a coach. On desktop it sits in the
// header, top right, as M2's quiet outlined button (DM Sans, sentence
// case); on phone it is a row in My Account.
export default function ChatButton({ coachName, onClick, className = '' }) {
  const name = useCoachName(coachName);
  if (!name) return null;
  return (
    <button type="button" className={`ds-chat ${className}`.trim()} onClick={onClick}>
      {`Chat to ${name}`}
    </button>
  );
}
