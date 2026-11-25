// /api/coach-agreements (Phase 6b run 3, plan section 5): the coach's agreement asks (send, reopen, approve, ask_change, reminders, extend, pause, end_early, cancel_14, answer_change, sponsor_send, team_agreements), with the coach's own sign-in and 6-digit code.
// Group E's. A stub laid down by Group A so the address, its router and its rewrite exist: it answers 501 to every
// ask, which src/lib/agreements/asks.js reads as "not built yet" (a build that isn't the live site then answers with
// its stand-ins). The request and answer shapes are in asks.js's ASKS.
export default async function handler(req, res) {
  res.status(501).setHeader('Cache-Control', 'no-store');
  res.json({ ok: false, reason: 'not_built' });
}
