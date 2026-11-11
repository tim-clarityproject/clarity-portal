// Earlier answers for the invented test client (Sam), so the five-word
// ratings can be seen converting on a preview (Tim, 10 Nov, 23:22): five
// earlier days of this sprint, each with a finished Daily plan (sleep hours
// and one of the five saved sleep-quality keys, and a way of being) and a
// finished Daily review whose way of being was rated OUT OF 10, as it was
// before 10 Nov (7, 5, 9, 8 and 6). On screen they read Very good, Good,
// Excellent, Very good and Good, and the sleep answers read straight across
// (very_poor Poor to very_good Excellent). TEST database only; it refuses
// any other. Today and yesterday are never touched, so Home and the daily
// tools stay as the usual seed leaves them.
//
//   node scripts/seed-test-ratings.mjs            adds the five days
//   node scripts/seed-test-ratings.mjs --remove   removes them again
//
// `node scripts/seed-test-plan.mjs --reset` removes them too (it clears every
// day plan and day review), so the browser suites always start without them.
//
// Signed in as the test client (~/.clarity-test-accounts.env, never
// printed), it writes only what the app itself writes, through the same
// rules every client has.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createClient } from '@supabase/supabase-js';

const TEST_REF = 'gqtqljngeenqzxneucoc';
const env = {};
for (const line of readFileSync(`${homedir()}/.clarity-test-accounts.env`, 'utf8').split('\n')) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
if (!env.TEST_SUPABASE_URL?.includes(TEST_REF)) {
  console.error('Not the test project: nothing was written.');
  process.exit(1);
}
const db = createClient(env.TEST_SUPABASE_URL, env.TEST_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await db.auth.signInWithPassword({ email: env.TEST_CLIENT_EMAIL, password: env.TEST_CLIENT_PASSWORD });
if (signInError) {
  console.error('Sign-in did not work: nothing was written.');
  process.exit(1);
}
const me = signIn.user.id;

// The person's own day, in UK time (the test person's zone), as a pure date.
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const today = `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
const day = (n) => {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); // a pure date sum in UTC, never "today"
};

// Days 7 to 3 days ago: [days ago, sleep hours, saved sleep key, rating out of 10].
const DAYS = [
  [7, 6, 'very_poor', 7],
  [6, 7.5, 'fair', 5],
  [5, 8, 'very_good', 9],
  [4, 7, 'good', 8],
  [3, 6.5, 'poor', 6],
];
const dates = DAYS.map(([ago]) => day(-ago));

const stop = (what, error) => {
  if (!error) return;
  console.error(`${what} did not save (${error.code || 'no code'}): stopped.`);
  process.exit(1);
};

stop('Clearing the day reviews', (await db.from('day_reviews').delete().eq('user_id', me).in('local_date', dates)).error);
stop('Clearing the day plans', (await db.from('day_plans').delete().eq('user_id', me).in('local_date', dates)).error);
if (process.argv.includes('--remove')) {
  console.log(`Removed the earlier answers for ${dates[0]} to ${dates[dates.length - 1]}.`);
  process.exit(0);
}

stop('The day plans', (await db.from('day_plans').insert(DAYS.map(([ago, hours, quality]) => ({
  user_id: me, local_date: day(-ago), sleep_hours: hours, sleep_quality: quality, way_of_being: 'Calm under pressure', status: 'finished', finished_at: `${day(-ago)}T07:30:00Z`,
})))).error);
stop('The day reviews', (await db.from('day_reviews').insert(DAYS.map(([ago, , , rating]) => ({
  user_id: me, local_date: day(-ago), way_of_being_rating: rating, where_it_showed: 'In the afternoon session.', status: 'finished', finished_at: `${day(-ago)}T18:30:00Z`,
})))).error);
console.log(`Added five earlier days (${dates[0]} to ${dates[dates.length - 1]}): sleep saved as ${DAYS.map((d) => d[2]).join(', ')}; way of being saved out of 10 as ${DAYS.map((d) => d[3]).join(', ')}.`);
