// M15. Goal check (docs/scoring-methods.md, M15).
//
// Four reasons, each 1 to 5: enjoy (intrinsic), matters (identified),
// guilty (introjected), someone_else (external). Own reasons and pressure
// are the averages of each pair; balance is their difference, −4 to +4.

export const STRONG_BALANCE = 1.5;

/**
 * M15.
 * @param {{ enjoy: number, matters: number, guilty: number, someoneElse: number }} r
 * @returns {{ own: number, pressure: number, balance: number,
 *   reading: 'own_reasons'|'pressure'|'mixed'|'no_strong_reason', sentence: string }}
 */
export function m15GoalCheck(r) {
  for (const k of ['enjoy', 'matters', 'guilty', 'someoneElse']) {
    if (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 5) throw new Error(`${k} must be 1 to 5`);
  }
  const own = (r.enjoy + r.matters) / 2;
  const pressure = (r.guilty + r.someoneElse) / 2;
  const balance = own - pressure;
  let reading;
  if (balance >= STRONG_BALANCE) reading = 'own_reasons';
  else if (balance <= -STRONG_BALANCE) reading = 'pressure';
  else if (own >= 3) reading = 'mixed';
  else reading = 'no_strong_reason';
  const sentence = {
    own_reasons: 'is driven mostly by your own reasons',
    pressure: 'is driven mostly by pressure',
    mixed: 'has your own reasons and some pressure too',
    no_strong_reason: "doesn't have a strong reason behind it yet",
  }[reading];
  return { own, pressure, balance, reading, sentence };
}

/**
 * M15: an organisation objective driven mostly by pressure flags the coach
 * (Tim, 26 Oct, 17:26), never the sponsor.
 */
export function m15FlagsCoach(objectiveSource, result) {
  return objectiveSource === 'organisation' && result.reading === 'pressure';
}
