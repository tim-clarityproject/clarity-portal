// The answers to "may viewer do this to owner's row?", shared by config.mjs
// and phase1.mjs. `related(kind)` is true when RELATIONSHIPS links the
// viewer to the owner that way.

export const OWN = ({ viewer, owner }) => viewer.role !== 'anon' && Boolean(owner) && viewer.key === owner.key;
export const NOBODY = () => false;
export const SIGNED_IN = ({ viewer }) => viewer.role !== 'anon';
export const ANYONE = () => true;
export const ONLY = (...keys) => ({ viewer }) => keys.includes(viewer.key);

// What each person shares once the rules test's set-up has run (phase1.mjs
// SETUP). Anything not listed is the part's default (sharing_parts()).
// org_wellbeing is for the first organisation (chosen per organisation from
// migration 033).
export const DEFAULT_SHARING = { mission: true, checkin: true, progress: false, org_wellbeing: false };
export const SHARING = {
  org_client: { progress: true, checkin: false, org_wellbeing: true },
  leaver: { org_wellbeing: true },
};
export const shares = (owner, part) => {
  const own = SHARING[owner.key];
  return own && part in own ? own[part] : DEFAULT_SHARING[part];
};

// The person, or their coach while the part is shared.
export const COACH_SEES = (part) => ({ viewer, owner, related }) => OWN({ viewer, owner }) || (related('coach of') && shares(owner, part));
// The person, or their coach (an item shared by default, such as a
// Recovery with "Let [coach] know" ticked).
export const OWN_OR_COACH = ({ viewer, owner, related }) => OWN({ viewer, owner }) || related('coach of');
// Only the coach, while the part is shared (flags: never the client).
export const COACH_ONLY = (part) => ({ owner, related }) => related('coach of') && shares(owner, part);
