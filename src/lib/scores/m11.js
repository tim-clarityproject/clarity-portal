// M11. Streaks, habits kept up and logging (docs/scoring-methods.md, M11).

/**
 * M11: the debrief streak: sprint weeks in a row with a finished weekly
 * debrief, counted back from the latest finished week. A week whose debrief
 * window is still open doesn't break it yet; Recovery doesn't break it
 * (Claude); a missed week resets it quietly (decided 21 Oct).
 * @param {{ debriefDone: boolean, windowOpen?: boolean, recovery?: boolean }[]} weeks
 *   finished sprint weeks across sprints, oldest first
 */
export function m11DebriefStreak(weeks) {
  let streak = 0;
  for (let i = (weeks || []).length - 1; i >= 0; i -= 1) {
    const w = weeks[i];
    if (w.debriefDone) streak += 1;
    else if (w.windowOpen || w.recovery) continue;
    else break;
  }
  return streak;
}

/**
 * M11: a habit is kept up in a finished week when it scored 100 (target
 * met): "kept up in 6 of 8 weeks".
 * @param {(number|null)[]} weekScores finished weeks' scores
 */
export function m11HabitKeptUp(weekScores) {
  const scored = (weekScores || []).filter((s) => s != null);
  return { keptUp: scored.filter((s) => s >= 100 - 1e-9).length, of: scored.length };
}

/**
 * M11: "You logged on 4 of your 5 working days this week." A working day is
 * logged when at least one habit was logged for it.
 * @param {string[]} workingDays
 * @param {string[]} loggedDays days with at least one log
 */
export function m11LoggedWorkingDays(workingDays, loggedDays) {
  const logged = new Set(loggedDays || []);
  return { logged: (workingDays || []).filter((d) => logged.has(d)).length, of: (workingDays || []).length };
}

/** M11: Breathe sessions in a week, an exact count. */
export function m11BreathingSessions(sessionDays, weekDays) {
  const inWeek = new Set(weekDays || []);
  return (sessionDays || []).filter((d) => inWeek.has(d)).length;
}
