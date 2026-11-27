// Where My Mission opens (walk item 5, 27 Nov): the laptop's Mission line under Home's and the Dashboard's
// title and the phone header's My Mission box both open the Individual Performance Plan at its My Mission
// card, scrolled there with its Edit in reach. With no plan yet: an older Mission opens its own page, and
// no Mission at all opens the new plan's Mission step.
export const MISSION_ANCHOR = 'my-mission';
export const MISSION_PLACE = `/performance-plan#${MISSION_ANCHOR}`;
export const MISSION_STEP = '/performance-plan/build?step=mission';

/** The address My Mission opens, from whether there is a plan and a Mission. */
export function missionAddress({ hasPlan, hasMission }) {
  if (hasPlan) return MISSION_PLACE;
  return hasMission ? '/personal-operating-plan' : MISSION_STEP;
}
