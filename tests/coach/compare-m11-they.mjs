// They and them (Tim, 19 Nov, 21:43; Phase 6a run 5, step 3): the portal
// speaks of people as they, them and their, its seed and demo text included,
// so the seed's lines that M11 words with she, he, her, his or him say it
// another way (tests/performance/they-and-them.test.mjs). Each holds on every
// screen of runs 2 to 4, met where M11 shows the line, never required.
const WHY = 'they and them: the portal speaks of people as they, them and their, its seed included (Tim, 19 Nov, 21:43; run 5, step 3)';
const they = (m11, built, more = {}) => [m11, built, WHY, { quiet: true, say: m11, ...more }];
// M11's phone shows a call's notes line alone, so on a phone the built lines stay the run 4 list's own addition (“left for Tim to decide”).
const LAPTOP = { on: 'd' };

export const THEY = [
  they('Check in with Tom Hale on his decision', 'Check in with Tom Hale on the decision'),
  they('Check in on his decision', 'Check in on the decision'),
  they('Reply to her email', 'Reply to Elena’s email'),
  they('Every decision still comes back to her.', 'Every decision still comes back to Amy.'),
  they('Amy, with her CEO.', 'Amy, with the CEO.'),
  they('Wants her senior team pulling the same way before the Q1 restructure.', 'Wants the senior team pulling the same way before the Q1 restructure.', LAPTOP),
  they('Decides with her CEO by the end of November.', 'Decides with the CEO by the end of November.', LAPTOP),
  they('Suggested a different approach to his team’s human performance challenge.', 'Suggested a different approach to the team’s human performance challenge.'),
  they('Maya is his coach.', 'Maya is Owen’s coach.'),
];

// A control named for its line (“Select …”, “Mark “…” done”, “Move “…” to tomorrow”) says the new words to a screen reader too.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const THEY_NAMES = [
  [new RegExp(`^name: .*(${THEY.map((e) => esc(e[1])).join('|')})`), WHY, null, { quiet: true, say: 'a control named for one of those lines' }],
];
