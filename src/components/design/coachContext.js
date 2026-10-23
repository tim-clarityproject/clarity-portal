import { createContext, useContext } from 'react';

// The client's own coach's first name (e.g. "Tim", "Adie"), for the
// who-sees label and "Chat to [first name]". Pages provide it from the
// person's account; it is never typed into the code, and it is null for
// someone without a coach.
export const CoachContext = createContext(null);

export function useCoachName(fromProp) {
  const fromContext = useContext(CoachContext);
  return fromProp ?? fromContext;
}

// The words of the who-sees label.
export function whoSeesText(audience, coachName) {
  if (audience === 'team') return 'Your team';
  if (audience === 'coach') return coachName ? `You and ${coachName}` : 'You and your coach';
  return 'Only you';
}
