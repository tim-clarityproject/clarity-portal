// Counts in words people read (tidy follow-up 4, part 2, item 4): "3,629 more", never "3629 more". The coach portal's
// figures follow the portal's region, as its money already does ("£10,000"): British today (rule 29y: every page is
// British until spelling follows the visitor), so a thousands comma and no decimals for a count.
// Tests: tests/performance/coach-tidy4.test.mjs.

const LOCALE = 'en-GB';

/** A count as a figure: 3629 is "3,629"; nothing or not a number is "0". */
export function countFigure(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? Math.round(v) : 0).toLocaleString(LOCALE);
}

/** A count with its noun: "1 client", "3,629 clients". */
export const countWords = (n, one, many = `${one}s`) => `${countFigure(n)} ${Number(n) === 1 ? one : many}`;
