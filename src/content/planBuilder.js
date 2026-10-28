// Build your plan (mock-up M6, "Build your plan"): the examples, ideas
// and box examples, each written for the role picked on "Which best
// describes you?" (Tim, 23 Oct). Other gets the Leader version, so a CEO
// never sees sport words. Word for word from M6 (EXM, IDEAS, MPH).

/** The person's role (person_settings.describes_you) as the examples' key. */
export function exampleRole(describesYou) {
  if (describesYou === 'ceo_executive') return 'ceo';
  if (describesYou === 'head_coach') return 'coach';
  return 'leader';
}

/** "See an example" on the mission step. */
export const MISSION_EXAMPLE = {
  ceo: 'Lead with clarity so the business grows and the best people want to stay.',
  coach: 'Be the coach every player wants to play for, and win the right way.',
  leader: 'Lead a team that delivers under pressure and grows while doing it.',
};

/** The example inside the mission box. */
export const MISSION_PLACEHOLDER = {
  ceo: 'e.g. Lead a business people are proud to work for',
  coach: 'e.g. Build a club that develops players and wins with integrity',
  leader: 'e.g. Lead a team that delivers under pressure',
};

/** "Need ideas? Pick one, then make it yours." Three per role (the reading list limit). */
export const STRATEGY_IDEAS = {
  ceo: ['Build a leadership team I can trust', 'Protect time for strategic work', 'Keep the board close'],
  coach: ['Develop players through daily habits', 'Build trust with the owner', 'Make every session count'],
  leader: ['Protect time for deep work', 'Grow my people', 'Lead calmly through change'],
};

/** The examples inside the first-sprint label box (Start a sprint uses them too). */
export const SPRINT_LABEL_PLACEHOLDER = {
  ceo: 'e.g. Q1, Merger year',
  coach: 'e.g. Pre-season, In-season block 2',
  leader: 'e.g. Q1, New team',
};

/** "See an example" on the end-of-sprint review's "What worked best in this sprint?" (M6 EXM.worked). */
export const REVIEW_WORKED_EXAMPLE = {
  ceo: 'Blocking Monday mornings for strategic work. I kept it 7 weeks out of 8.',
  coach: 'Reviewing every session with my staff the same day. It kept us sharp.',
  leader: 'A one-to-one with each of my team every week. I kept it up 7 weeks out of 8.',
};

/** "See an example" on "What would make the next sprint even better?" (M6 EXM.next). */
export const REVIEW_NEXT_EXAMPLE = {
  ceo: 'Finish by 18:30 on 4 nights a week, so training doesn’t slip.',
  coach: 'Protect one full rest day a week, even in-season.',
  leader: 'Say no to one meeting a week that I don’t need to be in.',
};
