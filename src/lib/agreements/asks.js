// What the agreement screens ask the server, and the calm answers they get back (Phase 6b run 3, plan section 5).
// One shape for every ask: POST the route with JSON { kind, ...body } and the caller's own sign-in as Bearer (none for
// a link's own pages, which carry the link's token in the body). Every answer is { ok: true, ...answer } or
// { ok: false, message } in calm words (what happened, then what to do; rule 28), never the server's own text.
//
// Until Group E's server is in (its routes answer 501), a build that isn't the live site answers with the stand-ins
// below, so every screen can be built and tested; the live site never takes a stand-in. Pure: no Supabase, no
// window. The page-side caller is askClient.js. Checked by tests/performance/agreements-asks.test.mjs.

export const ROUTES = Object.freeze({
  agreements: '/api/coach-agreements', // the coach's own sign-in with the 6-digit code (api/_routes/coach-agreements.js)
  billing: '/api/coach-billing', //      the coach's own sign-in (api/_routes/coach-billing.js, 061/062's, extended)
  settle: '/api/agreement-settle', //    the client's own sign-in (api/_routes/agreement-settle.js)
  link: '/api/agreement-link', //        no sign-in: a quote's or a sponsor's link token in the body (api/_routes/agreement-link.js)
});

/**
 * Every ask: its route, who asks, the body's fields and the answer's fields (documentation the stand-ins follow;
 * FOUNDATION.md lists the same). Days are day keys, amounts minor units.
 */
export const ASKS = Object.freeze({
  agreements: {
    send: { who: 'coach', body: 'agreementId, versionId, signatureId | newSignature { kind, image?, typedName? }, personalNote, sendAs: agreement|quote, validDays?', answer: 'sentAt, expiresOn, quoteId?, quoteNumber?, validUntil?, emailed, already?' },
    reopen: { who: 'coach', body: 'versionId? | quoteId?, days?', answer: 'expiresOn? | validUntil?' },
    approve: { who: 'owner', body: 'agreementId', answer: 'sentAt, emailed' },
    ask_change: { who: 'owner', body: 'agreementId, note', answer: '' },
    send_sign_reminder: { who: 'coach', body: 'versionId, reminder: sign_3|sign_7, subject?, text?, again?', answer: 'sentAt, already?' },
    send_first_payment_reminder: { who: 'coach', body: 'versionId, subject?, text?', answer: 'sentAt, emailed' },
    extend: { who: 'coach', body: 'agreementId, endsOn', answer: 'endsOn, emailed' },
    pause: { who: 'coach', body: 'agreementId, from, to', answer: 'endsOn, emailed' },
    end_early: { who: 'coach', body: 'agreementId, endsOn, by: client|coach', answer: 'endingOn, emailed' },
    cancel_14: { who: 'coach', body: 'agreementId', answer: 'refundMinor, currency, creditNoteNumber, emailed' },
    answer_change: { who: 'coach', body: 'requestIds, reply?', answer: 'emailed?' },
    sponsor_send: { who: 'coach', body: 'agreementId, versionId, sponsor { name, email, role }', answer: 'sentAt, expiresAt, emailed, link? (off the live site only)' },
    team_agreements: { who: 'coach', body: 'agreementId', answer: 'made' },
  },
  billing: {
    // 061/062's own kinds (draft, paid_by_hand, refund, credit, bank_payment, one_off) keep their own callers; these two
    // are listed for the fields run 3 added.
    send: { who: 'coach', body: 'invoiceId, poNumber?', answer: '' },
    send_reminder: { who: 'coach', body: 'reminderId, text?, again?', answer: 'already? | unsure? | settled? | noAddress?' },
    delivered_invoice: { who: 'coach', body: 'agreementId, sessionIds', answer: 'invoiceId, number, totalMinor, currency' },
    top_up: { who: 'coach', body: 'agreementId', answer: 'invoiceId, number, totalMinor, currency' },
    org_invoice_preview: { who: 'coach', body: 'organisationId, sessionIds, entryIds, poNumber, rateMinor, evidenceIds, supplierNumber?, reference?', answer: 'pdf (base64), fileName, pages' },
    org_invoice_send: { who: 'coach', body: 'organisationId, sessionIds, entryIds, poNumber, rateMinor, evidenceIds, supplierNumber?, reference? | invoiceId, again: true', answer: 'invoiceId, number, fileName, sentTo, dueOn, emailed' },
    mark_uploaded: { who: 'coach', body: 'invoiceId', answer: 'uploadedAt' },
    funding_details: { who: 'coach', body: 'organisationId', answer: 'bankDetails { accountName, sortCode, accountNumber }' },
    updated_price: { who: 'coach', body: 'agreementId, newFeeMinor, fromDay, note', answer: 'versionId, sentAt, emailed' },
  },
  settle: {
    start: { who: 'client', body: 'versionId', answer: 'clientSecret, invoiceId, amountMinor, currency, publishableKey?, settled?, standIn?' },
    bacs: { who: 'client', body: 'versionId', answer: 'clientSecret' },
    state: { who: 'client', body: 'versionId', answer: 'settled, amountMinor, currency' },
    invoice_pdf: { who: 'client', body: 'invoiceId', answer: 'pdf (base64), fileName' },
    credit_notes: { who: 'client', body: '', answer: 'creditNotes [{ id, number, invoiceId, invoiceNumber, amountMinor, currency, kind, createdAt }]' },
    credit_note_pdf: { who: 'client', body: 'creditNoteId', answer: 'pdf (base64), fileName' },
  },
  link: {
    quote_accept: { who: 'link', body: 'token, extras, choice', answer: 'versionId, needsAccount, already?' },
    quote_pdf: { who: 'link', body: 'token', answer: 'pdf (base64), fileName' },
    quote_question: { who: 'link', body: 'token, text', answer: 'emailed' },
    sponsor_pdf: { who: 'link', body: 'token', answer: 'pdf (base64), fileName' },
    sponsor_sign: { who: 'link', body: 'token, name, role, po, image?, typed?, fingerprint', answer: 'signedAt' },
  },
});

export const WORDS = Object.freeze({
  notReached: 'That didn’t reach the server. Check your connection and try again.',
  signIn: 'Sign in again to carry on.',
  code: 'Enter the 6-digit code from your authenticator app first, then try again.',
  notYours: 'That isn’t yours to change.',
  changed: 'Something changed in another tab or on another device. Open it again to see the newest.',
  notReady: 'That isn’t ready yet. Try again later.',
  preview: 'Nothing is sent from a preview. Send it from the live site.',
  stripe: 'Stripe isn’t connected yet, so nothing was sent.',
  tryAgain: 'That didn’t work. Try again in a moment.',
});

const today = () => new Date().toISOString();
const STAND_PDF = 'JVBERi0xLjQKJSBzdGFuZC1pbgo='; // "%PDF-1.4\n% stand-in\n": the screens' preview only
let standNumber = 1250;

/** The stand-in answers: shaped like the real ones, sending nothing. */
export const STAND_INS = Object.freeze({
  agreements: {
    send: (b) => ({ sentAt: today(), expiresOn: null, emailed: false, ...(b.sendAs === 'quote' ? { quoteId: b.quoteId || null, quoteNumber: 42 } : {}) }),
    reopen: () => ({ expiresOn: null, validUntil: null }),
    approve: () => ({ sentAt: today(), emailed: false }),
    ask_change: () => ({}),
    send_sign_reminder: () => ({ sentAt: today() }),
    send_first_payment_reminder: () => ({ sentAt: today() }),
    extend: (b) => ({ endsOn: b.endsOn || null, emailed: false }),
    pause: () => ({ endsOn: null, emailed: false }),
    end_early: (b) => ({ endingOn: b.endsOn || null, emailed: false }),
    cancel_14: () => ({ refundMinor: 0, currency: 'GBP', creditNoteNumber: 'CLARITY-CN-0000', emailed: false }),
    answer_change: () => ({}),
    sponsor_send: () => ({ sentAt: today(), expiresAt: null, emailed: false, link: null }),
    team_agreements: () => ({ made: 0 }),
  },
  billing: {
    send: () => ({}),
    send_reminder: () => ({}),
    delivered_invoice: () => ({ invoiceId: null, number: (standNumber += 1), totalMinor: 0, currency: 'GBP' }),
    top_up: () => ({ invoiceId: null, number: (standNumber += 1), totalMinor: 0, currency: 'GBP' }),
    org_invoice_preview: () => ({ pdf: STAND_PDF, fileName: 'Invoice preview.pdf', pages: 1 }),
    org_invoice_send: (b) => ({ invoiceId: null, number: (standNumber += 1), fileName: 'Invoice.pdf', sentTo: b.sentTo || '', dueOn: null }),
    mark_uploaded: () => ({ uploadedAt: today() }),
    funding_details: () => ({ bankDetails: { accountName: 'The Clarity Project LTD', sortCode: '00-00-00', accountNumber: '00000000' } }),
    updated_price: () => ({ versionId: null, sentAt: today() }),
  },
  settle: {
    start: () => ({ clientSecret: 'stand_in_secret', invoiceId: null, amountMinor: 0, currency: 'GBP', standIn: true }),
    bacs: () => ({ clientSecret: 'stand_in_secret', standIn: true }),
    state: () => ({ settled: false, amountMinor: 0, currency: 'GBP' }),
    invoice_pdf: () => ({ pdf: STAND_PDF, fileName: 'Invoice.pdf' }),
    credit_notes: () => ({ creditNotes: [] }),
    credit_note_pdf: () => ({ pdf: STAND_PDF, fileName: 'Credit note.pdf' }),
  },
  link: {
    quote_accept: () => ({ versionId: null, needsAccount: true }),
    quote_pdf: () => ({ pdf: STAND_PDF, fileName: 'Quote.pdf' }),
    quote_question: () => ({ emailed: false }),
    sponsor_pdf: () => ({ pdf: STAND_PDF, fileName: 'Agreement.pdf' }),
    sponsor_sign: () => ({ signedAt: today() }),
  },
});

/** Whether a route and kind are known asks. */
export const isAsk = (route, kind) => Boolean(ASKS[route]?.[kind]);

/** The calm answer for whatever came back: { ok: true, ... } as sent, or { ok: false, message } in calm words. */
export function interpret(status, answer) {
  if (answer && typeof answer === 'object' && answer.ok === true) return answer;
  const a = answer && typeof answer === 'object' ? answer : {};
  if (status === 401) return { ok: false, message: WORDS.signIn };
  if (a.reason === 'needs_code' || a.code === 'aal2') return { ok: false, message: WORDS.code };
  if (a.reason === 'preview') return { ok: false, message: WORDS.preview };
  if (a.reason === 'not_connected') return { ok: false, message: WORDS.stripe };
  // A refusal the server words itself (the database's calm words, CC409 and 22023) is passed on; nothing else is.
  if (typeof a.message === 'string' && a.message && a.calm !== false && (status === 400 || status === 409 || status === 422 || a.calm === true)) return { ok: false, message: a.message, code: a.code };
  if (status === 403) return { ok: false, message: WORDS.notYours };
  if (status === 409) return { ok: false, message: WORDS.changed };
  if (status === 501) return { ok: false, message: WORDS.notReady, notBuilt: true };
  if (!status) return { ok: false, message: WORDS.notReached };
  return { ok: false, message: WORDS.tryAgain };
}

/**
 * One ask. `send(url, init)` is fetch (or apiFetch); `token` the caller's sign-in (none for link asks); `live` whether
 * this is the live site (a stand-in is never used there). Resolves the calm answer; never throws.
 */
export async function askWith({ route, kind, body = {}, token = null, send, live = false, standIn = 'when-not-built' }) {
  if (!isAsk(route, kind)) return { ok: false, message: WORDS.tryAgain };
  const stand = () => ({ ok: true, standIn: true, ...STAND_INS[route][kind](body || {}) });
  if (!live && standIn === 'always') return stand();
  if (ASKS[route][kind].who !== 'link' && !token) return { ok: false, message: WORDS.signIn };
  let status = 0;
  let answer = null;
  try {
    const res = await send(ROUTES[route], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ kind, ...(body || {}) }),
    });
    status = res?.status || 0;
    answer = await res.json().catch(() => null);
  } catch {
    return { ok: false, message: WORDS.notReached };
  }
  // Off the live site, a plain 404 (no answer of ours: the dev server and a local build serve no api/) is a route not
  // built here, as 501 is.
  const missing = status === 404 && !(answer && typeof answer === 'object' && typeof answer.ok === 'boolean');
  if (missing && !live && standIn !== 'never') return stand();
  const calm = interpret(status, answer);
  if (!calm.ok && calm.notBuilt && !live && standIn !== 'never') return stand();
  return calm;
}
