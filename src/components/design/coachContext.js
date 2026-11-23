import { createContext, useContext } from 'react';
import { plainFirstName } from '../../lib/coachName';

// The client's own coach: { firstName, mobile, contactWays } (e.g. "Tim",
// "Adie"), for the who-sees label and "Chat to [first name]". The app
// provides it from the person's own coach link (my_coach, read by
// CoachChatProvider); it is never typed into a component, and it is null
// for someone without a coach. A plain first name is accepted too.
export const CoachContext = createContext(null);

export function useCoach() {
  const coach = useContext(CoachContext);
  if (!coach) return null;
  if (typeof coach === 'string') return plainFirstName(coach) ? { firstName: plainFirstName(coach) } : null;
  // Never "Dr." before the name (src/lib/coachName.js).
  const firstName = plainFirstName(coach.firstName);
  return firstName === coach.firstName ? coach : { ...coach, firstName };
}

export function useCoachName(fromProp) {
  const coach = useCoach();
  return fromProp ?? coach?.firstName ?? null;
}

// The words of the who-sees label.
export function whoSeesText(audience, coachName) {
  if (audience === 'team') return 'Your team';
  if (audience === 'coach') return coachName ? `You and ${coachName}` : 'You and your coach';
  return 'Only you';
}
