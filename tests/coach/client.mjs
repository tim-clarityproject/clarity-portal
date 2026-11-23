// The client's side for the coach portal's browser tests (Phase 6a run 2):
// a signed-in context for the test CLIENT, what a coach has sent them (as
// 049's and 050's functions return it), and the stand-in that answers every
// function and table the client's Coaching page calls. 050 isn't on the
// test project, and nothing here ever reaches it: every other write is
// stopped and listed as `blocked`. No real invite is made and nothing is
// sent. Used by leftovers.mjs (what the page does) and by screens.mjs (the
// UI tester and the screenshots).
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP, readEnv, SIZES } from './shared.mjs';

// One saved client sign-in per address the portal is served on, as the coach's (shared.mjs coachContext): one file for
// every port loaded another port's sign-in, found no session on its own address and stood on the sign-in page (the
// break-it tester's d-client, 23 Nov, served on 4371 after a run on another port).
const CLIENT_STATE = join(tmpdir(), 'clarity-coach-tests', `client-${new URL(APP).host.replace(/[^a-z0-9]+/gi, '-')}.json`);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** A signed-in context for the test client (the session is kept in the system's temporary folder, never printed). */
export async function clientContext(browser, { size, theme, reducedMotion = 'reduce' }) {
  mkdirSync(join(tmpdir(), 'clarity-coach-tests'), { recursive: true });
  const opts = { viewport: SIZES[size] || size, colorScheme: theme, serviceWorkers: 'block', reducedMotion, hasTouch: size === 400 };
  if (existsSync(CLIENT_STATE)) return browser.newContext({ ...opts, storageState: CLIENT_STATE });
  const env = readEnv();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => json(r, { ok: true, sent: false }));
  // Signing in only reads: every write the portal would make after it is stopped here.
  await page.route('**/rest/v1/**', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.fallback() : json(route, null)));
  await page.goto(`${APP}/auth/login`);
  await page.fill('input[type=email]', env.TEST_CLIENT_EMAIL);
  await page.fill('input[type=password]', env.TEST_CLIENT_PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(/welcome/, { timeout: 30000 });
  await page.waitForTimeout(1200);
  await ctx.storageState({ path: CLIENT_STATE });
  await page.close();
  return ctx;
}

/** What a coach has sent, as the database's functions return it (049 and 050). `nothing`: someone with no coach at all. */
export function fromCoach({ nothing = false } = {}) {
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const dayKey = (offset) => { const d = new Date(now + offset * 86400000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  if (nothing) return { coach: null, invites: [], views: [], covers: [], recaps: [], prep: null };
  // Run 3: the client's own sessions (051's my_ functions). Quarter hours on the clock everywhere: 10:00 and 14:30 UTC.
  const at = (days, hour, minute = 0) => { const d = new Date(now + days * 86400000); d.setUTCHours(hour, minute, 0, 0); return d.toISOString(); };
  const soon = (() => { const d = new Date(now + 5 * 3600000); d.setUTCMinutes(0, 0, 0); return d.toISOString(); })();
  return {
    coach: { coach_id: uid(900), first_name: 'Tim', away_until: null, mobile: null, contact_ways: ['email'] },
    invites: [{ profile_id: uid(901), coach_first_name: 'Tim', invited_at: iso(now - 3600000) }],
    views: [{ request_id: uid(902), coach_first_name: 'Tim', asked_at: iso(now - 600000), answered_at: null, allowed: null, expires_at: null }],
    covers: [{ cover_id: uid(903), coach_first_name: 'Tim', cover_first_name: 'Maya', starts_on: dayKey(30), ends_on: dayKey(43), agreed_at: null }],
    recaps: [
      { session_id: uid(910), starts_at: iso(now - 3 * 86400000), minutes: 60, kind: 'session', coach_first_name: 'Tim', group_name: null, sent_at: iso(now - 3 * 86400000 + 7200000),
        recap: 'Thanks for today.\n\nWe looked at the pricing launch and where your time goes in the week before it. You named two things only you can do: the investor call and the pricing story for the sales team.\n\nYou’re handing the rest of the launch plan to Femi.',
        actions: [
          { id: uid(920), title: 'Hand the launch plan to Femi by Wednesday', goes_to: 'week', done: false, placed: false },
          { id: uid(921), title: 'Book a 15-minute check-in each morning of launch week, so nothing waits for the weekly meeting', goes_to: 'backlog', done: false, placed: false },
          { id: uid(922), title: 'Send the investor call notes', goes_to: 'week', done: true, placed: true },
        ] },
      { session_id: uid(911), starts_at: iso(now - 17 * 86400000), minutes: 60, kind: 'session', coach_first_name: 'Tim', group_name: 'Leadership team', sent_at: iso(now - 17 * 86400000 + 7200000), recap: 'A short one this time: the team agreed who decides on pricing, and when.', actions: [] },
    ],
    prep: null,
    // One session inside 24 hours (moving it is late) and one next week; the free times a client is offered.
    sessions: [
      { session_id: uid(930), starts_at: soon, minutes: 60, time_zone: 'Europe/London', place_kind: 'zoom', meeting_link: 'https://zoom.example.invalid/j/9930', location: null, coach_first_name: 'Tim', late: true, moved_in_google: false },
      { session_id: uid(931), starts_at: at(6, 10), minutes: 60, time_zone: 'Europe/London', place_kind: 'zoom', meeting_link: null, location: null, coach_first_name: 'Tim', late: false, moved_in_google: false },
    ],
    times: [at(2, 10), at(2, 11, 15), at(2, 14, 30), at(3, 10), at(3, 15), at(7, 10), at(7, 13, 45)],
  };
}

/**
 * Puts the client's stand-ins in front of a page: every function and table
 * the Coaching page calls is answered from `data` (which they change, as the
 * database would), and every other write is stopped.
 * @returns {{ calls: string[], blocked: string[] }} what was asked, and what was stopped
 */
export async function clientStandIn(page, data) {
  const calls = [];
  const blocked = [];
  await page.route('**/api/**', (r) => { blocked.push(`api ${new URL(r.request().url()).pathname}`); return json(r, { ok: true, sent: false }); });
  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const name = url.pathname.split('/rest/v1/')[1] || '';
    const args = (() => { try { return req.postDataJSON() || {}; } catch { return {}; } })();
    if (name.startsWith('rpc/')) {
      const fn = name.slice(4);
      const now = Date.now();
      switch (fn) {
        case 'my_coach': return json(route, data.coach ? [data.coach] : []);
        case 'my_coach_invites': calls.push(fn); return json(route, data.invites);
        case 'client_accept_invite': {
          calls.push(`${fn} ${args.p_profile}`);
          if (!data.invites.some((i) => i.profile_id === args.p_profile)) return json(route, { code: '42501', message: 'That invite isn’t open.' }, 403);
          const answer = data.acceptAnswer || 'linked';
          if (answer === 'linked') data.invites = data.invites.filter((i) => i.profile_id !== args.p_profile);
          return json(route, answer);
        }
        case 'my_view_asks': calls.push(fn); return json(route, data.views);
        case 'client_view_answer': {
          calls.push(`${fn} ${args.p_allowed}`);
          const v = data.views.find((x) => x.request_id === args.p_request && !x.answered_at);
          if (!v) return json(route, { code: '42501', message: 'That request isn’t open.' }, 403);
          Object.assign(v, { answered_at: new Date(now).toISOString(), allowed: args.p_allowed, expires_at: args.p_allowed ? new Date(now + 30 * 60000).toISOString() : null });
          return route.fulfill({ status: 204 });
        }
        case 'my_cover_asks': calls.push(fn); return json(route, data.covers);
        case 'cover_agree': {
          calls.push(fn);
          const c = data.covers.find((x) => x.cover_id === args.p_cover && !x.agreed_at);
          if (!c) return json(route, { code: '42501', message: 'That isn’t yours to agree.' }, 403);
          c.agreed_at = new Date(now).toISOString();
          return route.fulfill({ status: 204 });
        }
        case 'my_session_recaps': calls.push(fn); return json(route, data.recaps);
        case 'my_session_action': {
          calls.push(`${fn} done:${args.p_done} placed:${args.p_placed}`);
          const a = data.recaps.flatMap((r) => r.actions).find((x) => x.id === args.p_action);
          if (!a) return json(route, { code: '42501', message: 'That action isn’t yours.' }, 403);
          if (args.p_done != null) a.done = args.p_done;
          if (args.p_placed != null) a.placed = args.p_placed;
          return route.fulfill({ status: 204 });
        }
        // Run 3: the client's own sessions, as 051's my_ functions answer; without `sessions` the functions aren't there (before 051).
        case 'my_sessions_coming': case 'my_booking_times': case 'my_session_book': case 'my_session_move': case 'my_session_cancel': {
          if (!Array.isArray(data.sessions)) return json(route, { code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${fn} in the schema cache` }, 404);
          calls.push(fn === 'my_sessions_coming' || fn === 'my_booking_times' ? fn : `${fn} ${JSON.stringify(args)}`);
          const sorted = () => [...data.sessions].sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
          if (fn === 'my_sessions_coming') return json(route, sorted().map((s) => ({ ...s, late: new Date(s.starts_at).getTime() - now < 24 * 3600000 })));
          if (fn === 'my_booking_times') return json(route, (data.times || []).filter((t) => !data.sessions.some((s) => s.starts_at === t)).map((t) => ({ starts_at: t })));
          const free = (t) => (data.times || []).some((x) => new Date(x).getTime() === new Date(t).getTime()) && !data.sessions.some((s) => new Date(s.starts_at).getTime() === new Date(t).getTime());
          if (fn === 'my_session_book') {
            if (!free(args.p_start)) return json(route, { status: 'taken' });
            const s = { session_id: `00000000-0000-4000-8000-${String(940 + data.sessions.length).padStart(12, '0')}`, starts_at: new Date(args.p_start).toISOString(), minutes: 60, time_zone: 'Europe/London', place_kind: 'zoom', meeting_link: null, location: null, coach_first_name: 'Tim', late: false, moved_in_google: false };
            data.sessions = [...data.sessions, s];
            return json(route, { status: 'booked', session_id: s.session_id, starts_at: s.starts_at });
          }
          const s = data.sessions.find((x) => x.session_id === args.p_session);
          if (!s) return json(route, { status: 'not_found' });
          const late = new Date(s.starts_at).getTime() - now < 24 * 3600000;
          if (late && !args.p_late_ok) return json(route, { status: 'late', late: true });
          if (fn === 'my_session_cancel') { data.sessions = data.sessions.filter((x) => x !== s); return json(route, { status: 'cancelled', late }); }
          if (!free(args.p_start)) return json(route, { status: 'taken' });
          s.starts_at = new Date(args.p_start).toISOString();
          return json(route, { status: 'moved', late, session_id: s.session_id, starts_at: s.starts_at });
        }
        // Any other checked function is answered with nothing: it never runs.
        default: return json(route, null);
      }
    }
    if (name.startsWith('session_prep')) {
      calls.push(`${req.method()} session_prep`);
      if (req.method() === 'GET') return json(route, data.prep ? [data.prep] : []);
      if (req.method() === 'POST') { const row = Array.isArray(args) ? args[0] : args; data.prep = { body: row.body, noted_at: row.noted_at }; data.prepUser = row.user_id; return json(route, [], 201); }
      if (req.method() === 'DELETE') { data.prep = null; return route.fulfill({ status: 204 }); }
      return route.abort();
    }
    if (['GET', 'HEAD'].includes(req.method())) return route.fallback();
    // A to-do added from a recap's action is taken here and never reaches the test project.
    if (name.startsWith('todos') && req.method() === 'POST') { calls.push('POST todos'); data.todos = [...(data.todos || []), ...(Array.isArray(args) ? args : [args])]; return json(route, Array.isArray(args) ? args : [args], 201); }
    blocked.push(`${req.method()} ${name.split('?')[0]}`);
    return route.abort('blockedbyclient');
  });
  return { calls, blocked };
}

/** Clears what the Coaching page kept on this browser, before a walk (so it asks again) or after it (so nothing of a test is kept). */
export async function clearCoaching(page, { after = false } = {}) {
  await page.evaluate((done) => {
    for (const k of Object.keys(localStorage)) {
      if (/:coaching(-|$)/.test(k) || /coaching-prep/.test(k) || k === 'clarity-coaching-not-yet' || k === 'clarity-booking-not-yet') localStorage.removeItem(k);
      if (done && (k.startsWith('clarity-queue:') || k.startsWith('clarity-sending:'))) localStorage.removeItem(k);
    }
  }, after);
}
