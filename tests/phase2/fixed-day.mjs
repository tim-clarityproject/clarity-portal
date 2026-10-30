// One fixed day and time for every Phase 2 test (Tim, 29 and 30 Oct: tests
// never depend on the day or time they run). The seed builds the plan
// around the fixed day (scripts/seed-test-plan.mjs --today=) and every
// browser's clock starts at the fixed time in London (Playwright's clock),
// so a test gives the same answer on any day at any hour.
//
//   TEST_TODAY=2026-10-23 TEST_TIME=00:30 node ... tests/phase2/sprint-page.mjs
//
// TEST_TODAY (YYYY-MM-DD) picks another day and TEST_TIME (HH:MM, London)
// another time, to prove a test on any weekday and near midnight. The
// default is a Wednesday at 12:30, in the past, so a sign-in token made
// now is never "expired" to the browser.
//
// Known limit: the database's own today (person_today, used by
// freeze_week) follows the real date, so tests compare with the
// database's answer rather than assert "final" against the fixed day.
import { execFileSync } from 'node:child_process';

export const FIXED_TODAY = process.env.TEST_TODAY || '2026-10-21';
export const FIXED_TIME = process.env.TEST_TIME || '12:30';
if (!/^\d{4}-\d{2}-\d{2}$/.test(FIXED_TODAY)) throw new Error('TEST_TODAY needs YYYY-MM-DD.');
if (!/^\d{2}:\d{2}$/.test(FIXED_TIME)) throw new Error('TEST_TIME needs HH:MM.');

// The instant a London wall clock shows a given day and time (GMT or BST;
// on the morning the clocks go back, the first time it shows).
export function londonInstant(dayKey, time = '12:00') {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const offset of [60, 0]) {
    const t = new Date(Date.UTC(y, m - 1, d, hh, mm) - offset * 60000);
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === dayKey && `${p.hour}:${p.minute}` === time) return t;
  }
  throw new Error(`${dayKey} ${time} never shows on a London clock.`);
}

export const FIXED_CLOCK = londonInstant(FIXED_TODAY, FIXED_TIME);
export const weekdayOf = (key) => (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The seed, built around the fixed day; seedForReal puts the test client
// back on the real today (the last step of every test).
const runSeed = (flags) => execFileSync('node', ['--import', './tests/scores/register.mjs', 'scripts/seed-test-plan.mjs', ...flags], { stdio: 'pipe' }).toString().trim();
export const seedFixed = (...flags) => runSeed([...flags, `--today=${FIXED_TODAY}`]);
export const seedForReal = (...flags) => runSeed(flags);

// Every page in the context sees the fixed time; time still moves on from
// there, so timers and save delays behave as usual.
export async function fixClock(contextOrPage, time = FIXED_CLOCK) {
  await contextOrPage.clock.install({ time });
}

export const fixedLabel = () => `${FIXED_TODAY} (${DAY_NAMES[weekdayOf(FIXED_TODAY)]}) ${FIXED_TIME} London`;
