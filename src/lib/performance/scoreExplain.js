// The ⓘ beside combined scores (walk item 6, 27 Nov: the ⓘ comes back only beside terms a client may not know
// and beside combined scores, saying how the score is worked out). Each opens the shared side panel
// (Explain.jsx: longer than one short line), one sentence per line, from docs/scoring-methods.md M4 and M5.
// Their fixed names (helpKey) are in src/lib/hiddenHelp.js's HELP_KEYS.

/** The weekly Performance score (M5), and the sprint's average of it (M6). */
export const PERFORMANCE_SCORE_EXPLAIN = Object.freeze({
  title: 'How your Performance score is worked out',
  lines: [
    'Each Strategy scores how much of its plan you did that week: its habits, its to-dos and any wins.',
    'High-impact items count three times as much as low-impact ones, and medium-impact ones twice as much.',
    'Your Performance score is the average of your Strategies’ scores.',
    'A Strategy that serves two Outcome Objectives counts twice.',
    'During the week it’s your score so far: habit targets count only the working days gone, and an open to-do counts once the week ends.',
    'The average of finished weeks leaves out the week you’re in.',
  ],
});

/** A Strategy's score (M4), on the plan's Strategies. */
export const STRATEGY_SCORE_EXPLAIN = Object.freeze({
  title: 'How a Strategy’s score is worked out',
  lines: [
    'It’s the average of the Strategy’s habits, to-dos and wins this week.',
    'Each habit scores how close you came to its target, up to 100%.',
    'A to-do done in its week scores 100%, and one not done scores nothing.',
    'A win counts as a done to-do.',
    'High-impact items count three times as much as low-impact ones, and medium-impact ones twice as much.',
  ],
});

export const PERFORMANCE_SCORE_HELP = 'performance-score';
export const STRATEGY_SCORE_HELP = 'strategy-score';
