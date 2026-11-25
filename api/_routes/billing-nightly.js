// The nightly billing round (Phase 6b run 1, steps 4 to 6), once a day from the database's own scheduler (061's pg_cron
// job clarity-billing-nightly at 03:15 UTC, as 058; never a Vercel cron, coach-portal rule 22), with the scheduler's secret:
//
//   GET /api/billing-nightly   Authorization: Bearer <CRON_SECRET>
//
// For every active coach: the instalments that have fallen due drafted in Stripe (never sent: they wait for the coach's
// Send), and the overdue reminders drafted at 3, 7 and 14 days (never sent either). Then Stripe's catch-up: the last 3
// days of its messages read back from Stripe and handled through the webhook's own rules, so a message that never
// arrived still lands and one that did is found already claimed (stripe_events). Then any payment still without the
// pounds that landed and Stripe's fee is looked up again (fillLanded). Nothing here sends anything.
//
// Phase 6b run 3 (065), in the same round (no new scheduler, coach-portal rule 22), with or without Stripe:
// - signing reminders drafted at 3 and 7 days while an agreement isn't signed (065's agreement_reminders, once each);
// - the first payment's reminder drafted 24 hours after signing while it isn't settled (brief item 10);
// - an unsigned agreement past its running-out day marked expired, and a quote past its valid day (both reopen in one step);
// - the European Central Bank's daily reference rates kept in fx_reference_rates (units to £1; the dirham by its peg).
// All drafts: the coach sends each with Send, from Needs you.
//
// Environment variables (Vercel, Production): CRON_SECRET, STRIPE_SECRET_KEY (test mode, sk_test_…), SUPABASE_SERVICE_ROLE_KEY.
import { isScheduler } from './workshop-emails.js';
import { billing } from './coach-billing.js';
import { fillLanded, handleEvent, serverClient } from '../stripe-webhook.js';
import { keyAllowed, stripeApi } from '../../src/lib/billing/stripe.js';
import { dayIn, daysBetween } from '../../src/lib/time/index.js';
import { firstPayment } from '../../src/lib/agreements/settling.js';
import { fetchEcbRates } from '../../src/lib/fx/ecb.js';

export const config = { maxDuration: 300 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const CATCH_UP_DAYS = 3;

/** One round, with the server's key and a Stripe (real or stand-in): what it drafted and caught up. */
export async function nightlyRound({ server, stripe, now = () => new Date() }) {
  const out = { invoices: 0, reminders: 0, caughtUp: 0, landed: 0, problems: 0 };
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
    try { if ((await handleEvent(server, e, stripe)) === 'handled') out.caughtUp += 1; } catch { out.problems += 1; }
  }
  // Payments still without the pounds that landed and Stripe's fee (Stripe couldn't be asked when they came in).
  try { out.landed = await fillLanded({ server, stripe, now }); } catch { out.problems += 1; }
  return out;
}

const LONDON = 'Europe/London';
const FIRST_KINDS = ['first_payment', 'deposit', 'instalment'];

/**
 * The agreements' part of the round (065): drafts, running out and the day's reference rates. Sends nothing.
 * @returns {Promise<{ signReminders: number, firstPayment: number, expired: number, quotesExpired: number, rates: number, problems: number }>}
 */
export async function agreementsNightly({ server, now = () => new Date(), fetcher = globalThis.fetch, fetchRates = fetchEcbRates }) {
  const out = { signReminders: 0, firstPayment: 0, expired: 0, quotesExpired: 0, rates: 0, problems: 0 };
  const today = dayIn(LONDON, now());
  const draft = async (coachId, versionId, kind) => {
    const r = await server.from('agreement_reminders').upsert({ coach_id: coachId, version_id: versionId, kind }, { onConflict: 'version_id,kind', ignoreDuplicates: true }).select('id');
    return !r.error && Boolean(r.data?.length);
  };
  try {
    // Sent and not signed: reminders at 3 and 7 days, or run out.
    const { data: waiting } = await server.from('agreement_versions').select('id, coach_id, agreement_id, version, sent_at, expires_on, send_as, status, client_signed_at')
      .eq('status', 'sent').is('client_signed_at', null);
    const agIds = [...new Set((waiting || []).map((v) => v.agreement_id))];
    const { data: ags } = agIds.length ? await server.from('agreements').select('id, kind, status, current_version').in('id', agIds) : { data: [] };
    const agOf = new Map((ags || []).map((a) => [a.id, a]));
    for (const v of waiting || []) {
      const a = agOf.get(v.agreement_id);
      if (!a || a.kind !== 'coaching' || a.status !== 'sent' || a.current_version !== v.version || !v.sent_at) continue;
      if (v.expires_on && v.expires_on < today) {
        const r = await server.from('agreements').update({ status: 'expired' }).eq('id', a.id).eq('status', 'sent').select('id');
        if (r.data?.length) out.expired += 1;
        continue;
      }
      const days = daysBetween(dayIn(LONDON, new Date(v.sent_at)), today);
      const kind = days >= 7 ? 'sign_7' : days >= 3 ? 'sign_3' : null;
      if (kind && (await draft(v.coach_id, v.id, kind))) out.signReminders += 1;
    }
  } catch { out.problems += 1; }
  try {
    // Signed over 24 hours ago (within the last 30 days), self-funded, and the first payment isn't settled.
    const since = new Date(now().getTime() - 30 * 86400000).toISOString();
    const before = new Date(now().getTime() - 86400000).toISOString();
    const { data: signed } = await server.from('agreement_versions').select('id, coach_id, terms, funded_by, settle_choice, client_signed_at')
      .eq('status', 'signed').is('funded_by', null).gte('client_signed_at', since).lte('client_signed_at', before);
    for (const v of signed || []) {
      if (!v.terms?.kind) continue; // 065's builder versions only: run 1's are invoiced as before
      if (!(firstPayment({ ...v.terms, fundedBy: null }, v.settle_choice || 'upfront', v.terms.extrasChosen || []) > 0)) continue;
      const { data: invs } = await server.from('invoices').select('status, kind, instalment_n').eq('version_id', v.id);
      if ((invs || []).some((i) => FIRST_KINDS.includes(i.kind) && i.instalment_n === 1 && i.status === 'paid')) continue;
      if (await draft(v.coach_id, v.id, 'first_payment')) out.firstPayment += 1;
    }
  } catch { out.problems += 1; }
  try {
    const r = await server.from('agreement_quotes').update({ status: 'expired' }).eq('status', 'sent').lt('valid_until', today).select('id');
    out.quotesExpired = r.data?.length || 0;
  } catch { out.problems += 1; }
  try {
    const rows = await fetchRates({ fetcher, now });
    if (rows.length) {
      const r = await server.from('fx_reference_rates').upsert(rows, { onConflict: 'day,currency' }).select('currency');
      if (r.error) out.problems += 1; else out.rates = r.data?.length || rows.length;
    }
  } catch { out.problems += 1; }
  return out;
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'GET') return reply(res, 405, { ok: false });
  if (!isScheduler(req.headers?.authorization, env.CRON_SECRET)) return reply(res, 401, { ok: false });
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 200, { ok: false, reason: 'not_connected' });
  try {
    const server = serverClient(env);
    // The agreements' drafts and the reference rates need no Stripe; the invoices' part does.
    const agreements = await agreementsNightly({ server });
    if (!keyAllowed(env.STRIPE_SECRET_KEY || '')) return reply(res, 200, { ok: false, reason: 'not_connected', agreements });
    return reply(res, 200, { ok: true, ...(await nightlyRound({ server, stripe: stripeApi(env.STRIPE_SECRET_KEY) })), agreements });
  } catch {
    return reply(res, 500, { ok: false });
  }
}
