import { Button } from './Button';
import { useCoachName } from './coachContext';

// Chat to the client's own coach (Tim, 23 Oct): "Chat to" and the coach's
// first name, e.g. "Chat to Tim". Never "Dr." and never a name typed into
// the code: it comes from the client's coach (prop or CoachContext).
// Nothing shows for someone without a coach. On desktop it sits in the
// header, top right, as a quiet labelled button; on phone, in My Account.
export default function ChatButton({ coachName, onClick }) {
  const name = useCoachName(coachName);
  if (!name) return null;
  return <Button onClick={onClick}>{`Chat to ${name}`}</Button>;
}
