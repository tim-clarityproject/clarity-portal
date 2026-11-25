// /api/agreement-link (Phase 6b run 3, plan section 5): a quote's and a sponsor's link pages (quote_accept, quote_pdf, sponsor_pdf, sponsor_sign), by the link's token, no sign-in.
// Group E's. A stub laid down by Group A so the address, its router and its rewrite exist: it answers 501 to every
// ask, which src/lib/agreements/asks.js reads as "not built yet" (a build that isn't the live site then answers with
// its stand-ins). The request and answer shapes are in asks.js's ASKS.
export default async function handler(req, res) {
  res.status(501).setHeader('Cache-Control', 'no-store');
  res.json({ ok: false, reason: 'not_built' });
}
