// The nightly billing round (Phase 6b run 1, steps 4 to 6), once a day from Vercel's own schedule (vercel.json crons,
// the live site only), with the scheduler's secret:
//
//   GET /api/billing-nightly   Authorization: Bearer <CRON_SECRET>
//
// For every active coach: the instalments that have fallen due drafted in Stripe (never sent: they wait for the coach's
// Send), and the overdue reminders drafted at 3, 7 and 14 days (never sent either). Then Stripe's catch-up: the last 3
// days of its messages read back from Stripe and handled through the webhook's own rules, so a message that never
// arrived still lands and one that did is found already claimed (stripe_events). Nothing here sends anything.
//
// Environment variables (Vercel, Production): CRON_SECRET, STRIPE_SECRET_KEY (test mode, sk_test_…), SUPABASE_SERVICE_ROLE_KEY.
import { isScheduler } from './workshop-emails.js';
import { billing } from './coach-billing.js';
import { handleEvent, serverClient } from './stripe-webhook.js';
import { keyAllowed, stripeApi } from '../src/lib/billing/stripe.js';

export const config = { maxDuration: 300 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const CATCH_UP_DAYS = 3;

/** One round, with the server's key and a Stripe (real or stand-in): what it drafted and caught up. */
export async function nightlyRound({ server, stripe, now = () => new Date() }) {
  const out = { invoices: 0, reminders: 0, caughtUp: 0, problems: 0 };
  const { data: coaches } = await server.from('coaches').select('id, role, active').eq('active', true);
  for (const coach of coaches || []) {
    const b = billing({ server, stripe, coach, now });
    const { data: agreements } = await server.from('agreements').select('id').eq('coach_id', coach.id).eq('status', 'signed');
    for (const a of agreements || []) {
      try { out.invoices += (await b.draft(a.id)).drafted; } catch { out.problems += 1; }
    }
    try { out.reminders += (await b.draftReminders()).drafted; } catch { out.problems += 1; }
  }
  const since = new Date(now().getTime() - CATCH_UP_DAYS * 86400000).toISOString();
  const { data: events } = await stripe.events({ since });
  // Oldest first, as Stripe sent them; each is claimed once, whoever handles it first.
  for (const e of [...(events || [])].sort((x, y) => (x.created || 0) - (y.created || 0))) {
    try { if ((await handleEvent(server, e)) === 'handled') out.caughtUp += 1; } catch { out.problems += 1; }
  }
  return out;
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'GET') return reply(res, 405, { ok: false });
  if (!isScheduler(req.headers?.authorization, env.CRON_SECRET)) return reply(res, 401, { ok: false });
  if (!keyAllowed(env.STRIPE_SECRET_KEY || '') || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 200, { ok: false, reason: 'not_connected' });
  try {
    return reply(res, 200, { ok: true, ...(await nightlyRound({ server: serverClient(env), stripe: stripeApi(env.STRIPE_SECRET_KEY) })) });
  } catch {
    return reply(res, 500, { ok: false });
  }
}
