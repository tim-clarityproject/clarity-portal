import { moneyText } from './currency.js';
import { monthName } from './renewals.js';

// Talking points for the moments people go soft on (brief item 41; M28's s-say): for the coach to say, never written
// to the client. Word for word from M28; each coach may edit them in Settings, Agreements (065's talking_points).
// Shown on the Needs you item for that moment and together on What to say. Checked by
// tests/performance/agreements-talking-points.test.mjs.

export const MOMENTS = Object.freeze(['price', 'renew', 'extra', 'ending', 'testimonial']);
export const MOMENT_TITLES = Object.freeze({
  price: 'Raising your price', renew: 'Renewing', extra: 'Extra work', ending: 'Ending well', testimonial: 'Testimonials and referrals',
});
export const SAY_INTRO = 'Talking points for the moments people go soft on. For you to say, never sent.';
export const SAY_LABEL = 'What to say';

export const DEFAULT_POINTS = Object.freeze({
  price: {
    lines: ['From {month}, my fee for your coaching is {price} a month.', 'It reflects where my practice is now and the results we’re getting together.', 'Everything else stays the same, and I’ll send the updated agreement today.'],
    tip: 'Say the price first, give one reason, then stop and let them respond. Don’t apologise or explain further.',
  },
  renew: {
    lines: ['We’ve got a month left of these six, so let’s plan the next six.', 'Based on what we’ve done, I’d focus the next six months on {focus}.', 'Most people settle the six months up front, which saves 5%. I’ll send it over today.'],
    tip: 'Assume the renewal: ask what to focus on, not whether to carry on.',
  },
  extra: {
    lines: ['That’s outside what we agreed, so I’d treat it as a separate piece of work.', 'I can do it as an extra coaching session, at {rate} an hour. Shall I send that over?'],
    tip: 'Say yes to the need and no to the free version.',
  },
  ending: {
    lines: ['I think we’ve got what we came for, and I don’t want you investing in coaching you don’t need.', 'Let’s use our last coaching session to set you up to carry this on yourself.'],
    tip: 'End on their progress and keep the door open.',
  },
  testimonial: {
    lines: ['You’ve made real progress, and it would mean a lot if you’d put a few lines about it into words.', 'Who else do you know who’s leading through something like this? I’d be glad to talk with them.'],
    tip: 'Ask straight after a win, and be specific.',
  },
});

/** A coach's points for a moment: their own row (talking_points) where they have one, else the defaults. */
export function pointsFor(moment, rows = []) {
  const own = (rows || []).find((r) => r.moment === moment);
  const d = DEFAULT_POINTS[moment];
  if (!d) return null;
  return { moment, title: MOMENT_TITLES[moment], lines: own?.lines?.length ? own.lines : d.lines, tip: own?.tip ?? d.tip, own: Boolean(own) };
}

/**
 * The points with this moment's facts filled in: { price (minor), from (day key), currency, rate (minor), focus }.
 * "From January, my fee for your coaching is £3,300 a month." M28's examples are the defaults when a fact is missing.
 */
export function fill(moment, facts = {}, rows = []) {
  const p = pointsFor(moment, rows);
  if (!p) return null;
  const c = facts.currency || 'GBP';
  const values = {
    month: facts.from ? monthName(facts.from) : 'January',
    price: facts.price != null ? moneyText(facts.price, c) : '£3,300',
    rate: facts.rate != null ? moneyText(facts.rate, c) : '£750',
    focus: facts.focus || 'the board transition',
  };
  return { ...p, lines: p.lines.map((l) => `“${l.replace(/\{(month|price|rate|focus)\}/g, (_, k) => values[k])}”`) };
}
