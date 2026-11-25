// "A brand-new client" (polish 1): the rule on plain facts, with no database, so it is tested
// (tests/performance/home-cards.test.mjs). src/lib/clientPreparing.js reads the facts and calls it.
// A coaching client is "being prepared" while their coach has sent them nothing: they have a coach,
// and no plan of their own, no agreement (sent or signed) and no coaching session booked. Each fact
// is true, false or null (not known); anything not known is never "being prepared".

/** The rule on plain facts. Each fact is true, false or null (not known). */
export function isPreparing({ hasCoach, hasPlan, hasAgreement, hasSessions } = {}) {
  return hasCoach === true && hasPlan === false && hasAgreement === false && hasSessions === false;
}

