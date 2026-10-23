import { createContext, useContext } from 'react';

// The client's own coach: { firstName, mobile } (e.g. "Tim", "Adie"), for
// the who-sees label and "Chat to [first name]". The app provides it from
// the coach settings (src/content/coach.js until Phase 1 gives each client
// their own); it is never typed into a component, and it is null for
// someone without a coach. A plain first name is accepted too.
export const CoachContext = createContext(null);

export function useCoach() {
  const coach = useContext(CoachContext);
  if (!coach) return null;
  return typeof coach === 'string' ? { firstName: coach } : coach;
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
