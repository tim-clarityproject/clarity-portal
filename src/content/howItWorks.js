// How it works (Draft 9, "How it works page", 25 Nov; Stage D item 8, Tim, 27 Nov): the page's words, word for word,
// used in three places with the same words: the public page (/how-it-works), the page inside the portal
// (/about/how-it-works, from My Account's About) and the pop-up behind "How the system fits together".
// No research on it (item 18). Tim's open questions are answered as recommended where the draft assumes them: no
// coaching line, no room for animations yet, "Create my free account" in public, and "your team" in public.

export const HOW_IT_WORKS_TITLE = 'How it works';

export const HOW_IT_WORKS_LINE = 'The Clarity Portal helps you decide what matters, act on it every day, and see what’s really working.';

/** The five sections: a label (drawn as 13px grey capitals), a 20px line and two or three sentences. */
export const HOW_IT_WORKS_SECTIONS = Object.freeze([
  {
    key: 'direction',
    label: 'Set your direction',
    line: 'Get clear on what you’re going for.',
    text: 'Your Individual Performance Plan captures your Mission, the Outcome Objectives that would tell you you’re on track, and the Strategies that will get you there. It takes about 20 minutes, and you can update it any time your priorities shift.',
  },
  {
    key: 'sprints',
    label: 'Work in sprints',
    line: 'Put the plan to work, one week at a time.',
    text: 'A Performance Sprint lasts anywhere from 2 to 16 weeks. Each morning, take 3 minutes to plan what matters most that day. Each evening, look back on what went well. At the end of the week, a short debrief gets you ready for the next one.',
    cycle: true,
  },
  {
    key: 'reset',
    label: 'Get back to your best',
    line: 'Pressure is part of the job.',
    text: 'When the pressure’s on, the Reset tools help you in the moment, whether that’s a minute of breathing to settle your body, a plan for a big day, or a few minutes to work through a strong emotion. You can also mark the moments that matter most and plan your energy around them.',
  },
  {
    key: 'working',
    label: 'See what’s working',
    line: 'Know what’s really making the difference.',
    text: 'Your dashboard shows how each week compares with the standard you set, and which habits are making the biggest difference. Your confidence bank keeps a record of your wins, so you can look back on what you’ve achieved when you need it most.',
  },
  {
    key: 'lead',
    label: 'Lead others, and your organisation',
    line: 'Bring the same clarity to the people you lead.',
    text: 'Plan meetings and tough conversations, get a clear picture of your team and the people you need on side, and use the Strategic Alignment Health Check to see whether your team’s work is really serving its strategy.',
  },
]);

export const HOW_IT_WORKS_PRIVATE = {
  label: 'Private by default',
  text: 'Your plan, reviews and journal are yours. Your organisation can’t see them, and Tim only sees what you choose to share.',
};

/** The cycle under section 2: Plan, Sprint, Review, back to Plan, with Reset beside the Sprint. */
export const HOW_IT_WORKS_CYCLE = 'Plan, then Sprint, then Review, then back to Plan, with Reset beside the Sprint.';

export const HOW_IT_WORKS_BUTTONS = Object.freeze({
  public: { label: 'Create my free account', to: '/auth/sign-up' },
  inside: { label: 'Open my plan', to: '/performance-plan' },
});

export const HOW_IT_WORKS_PATHS = Object.freeze({ public: '/how-it-works', inside: '/about/how-it-works' });
