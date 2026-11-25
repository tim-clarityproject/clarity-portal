// /api/agreement-link (Phase 6b run 3, brief items 19 to 23; M28 s-q-client, s-s-sign, s-s-signed): a quote's and a
// sponsor's private link pages, with no account. The link's token is in the body; nothing else proves who asks.
//
//   POST { kind: 'quote_accept', token, extras, choice }   the quote becomes the agreement (version 1 with the extras
//                                                          ticked and the way of settling chosen), ready to sign
//   POST { kind: 'quote_pdf', token }                      the quote's PDF
//   POST { kind: 'quote_question', token, text }          a question asked from the quote page, emailed to the coach
//                                                          (Group C's request 3b; nobody's address is known, so it says so)
//   POST { kind: 'sponsor_pdf', token }                    the sponsor's agreement as a PDF (signed, once they have)
//   POST { kind: 'sponsor_sign', token, name, role, po, image?, typed?, fingerprint }   the sponsor signs; their signed
//                                                          copy is emailed to them; each person's own agreement follows
//
// The database checks every link (065's quote_open, quote_accept, sponsor_link_open, sponsor_sign: open, not run out,
// once only), so the server's key is used only after it has said yes, and only for that link's own quote or version.
// First opens are counted by the database itself, so these pages need no limit of their own (one open is recorded).
// Shapes: src/lib/agreements/asks.js ASKS.link.
import { createClient } from '@supabase/supabase-js';
import { supabaseOf } from '../_coachEmails.js';
import { maySend } from '../_guestEmails.js';
import { portalOrigin } from '../_portalOrigin.js';
import { forStorage } from '../../src/lib/agreements/clauses.js';
import { finalTotal } from '../../src/lib/agreements/upfront.js';
import { quoteQuestionEmail, sponsorSignedCopyEmail } from '../../src/lib/email/agreementEmails.js';
import { agreementsApi, sendAs, standardsFor } from './coach-agreements.js';

export const config = { maxDuration: 60 };
const reply = (res, status, body) => { res.status(status).setHeader('Cache-Control', 'no-store'); res.json(body); };
const DIDNT_WORK = 'That didn’t work. Try again in a moment.';
const TOKEN = /^[0-9a-f]{64}$/;
const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const calm = (status, message) => Object.assign(new Error(message), { status, calm: true });
// The last question asked on each quote (in this instance): one a minute, so a link can't be used to flood the coach.
const QUESTIONS = new Map();

/** The ask, checked, or null. */
export function askedFor(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (!['quote_accept', 'quote_pdf', 'quote_question', 'sponsor_pdf', 'sponsor_sign'].includes(b.kind) || !TOKEN.test(String(b.token || ''))) return null;
  const out = { kind: b.kind, token: String(b.token) };
  if (b.kind === 'quote_question') {
    const text = typeof b.text === 'string' ? b.text.replace(/\r\n?/g, '\n').trim().slice(0, 2000) : '';
    return text ? { ...out, text } : null;
  }
  if (b.kind === 'quote_accept') {
    const extras = Array.isArray(b.extras) ? b.extras : [];
    if (extras.length > 20 || !extras.every((x) => KEY.test(String(x)))) return null;
    return { ...out, extras: [...new Set(extras)], choice: b.choice === 'plan' ? 'plan' : b.choice === 'upfront' ? 'upfront' : null };
  }
  if (b.kind === 'sponsor_sign') {
    const image = typeof b.image === 'string' && b.image ? b.image : null;
    const typed = typeof b.typed === 'string' && b.typed.trim() ? b.typed.trim().slice(0, 160) : null;
    if ((image && !PNG.test(image)) || (image && image.length > 300000) || !image === !typed) return null;
    if (typeof b.name !== 'string' || b.name.length > 400 || typeof b.fingerprint !== 'string' || b.fingerprint.length > 64) return null;
    return { ...out, name: b.name, role: typeof b.role === 'string' ? b.role.slice(0, 120) : null, po: typeof b.po === 'string' ? b.po.slice(0, 100) : null,
      image, typed, fingerprint: b.fingerprint };
  }
  return out;
}

/** A database refusal in its own calm words (CC409, 22023, P0002), anything else as "didn't work". */
function refusalOf(error) {
  const code = String(error?.code || '');
  const message = typeof error?.message === 'string' && error.message.length < 200 ? error.message : '';
  if ((code === 'CC409' || code === '22023' || code === 'P0002') && message) return calm(code === 'P0002' ? 404 : code === 'CC409' ? 409 : 400, message);
  return new Error('db');
}

/** The link asks, with the server's own client (after the database has checked the link). */
export function linkApi({ server, env = {}, origin = 'https://portal.theclarityproject.co.uk', send = sendAs, now = () => new Date() }) {
  return {
    /**
     * Accept: the wording and the total are worked out here with the client's extras and choice (src/lib/agreements),
     * then quote_accept makes the quote's version the agreement, coach-signed and sent, once. Hands back the version to
     * sign, and whether the client needs to make their account first (signing is in the portal: risk 12).
     */
    async quoteAccept(asked) {
      const open = await server.rpc('quote_open', { p_token: asked.token });
      if (open.error) throw refusalOf(open.error);
      const q = open.data;
      if (!q) throw calm(404, 'That link isn’t working. Ask your coach for a new one.');
      if (q.state === 'accepted') return { versionId: q.version_id, needsAccount: await this._needsAccount(q.version_id), already: true };
      if (q.state !== 'open') throw calm(409, 'This quote has run out. Ask your coach to open it again.');
      const { data: quote } = await server.from('agreement_quotes').select('id, coach_id, version_id').eq('share_token', asked.token).maybeSingle();
      const { data: v } = quote ? await server.from('agreement_versions').select('id, overrides, terms').eq('id', quote.version_id).maybeSingle() : { data: null };
      if (!v) throw calm(404, 'That link isn’t working. Ask your coach for a new one.');
      const offered = new Set((q.terms?.extrasOffered || []).map((e) => e.key));
      if (asked.extras.some((k) => !offered.has(k))) throw calm(400, 'Only the extras offered can be chosen.');
      const terms = { ...q.terms, extrasChosen: asked.extras, choice: asked.choice };
      const kind = terms.kind || 'sessions';
      const standards = await standardsFor(server, quote.coach_id, kind);
      const clauses = forStorage(terms, { standards, overrides: v.overrides || {} });
      const total = finalTotal(terms, asked.choice || 'upfront', asked.extras);
      const r = await server.rpc('quote_accept', { p_token: asked.token, p_extras: asked.extras, p_choice: asked.choice, p_clauses: clauses, p_total_minor: total });
      if (r.error) throw refusalOf(r.error);
      return { versionId: r.data, needsAccount: await this._needsAccount(r.data) };
    },

    async _needsAccount(versionId) {
      const { data: v } = await server.from('agreement_versions').select('agreement_id').eq('id', versionId).maybeSingle();
      const { data: a } = v ? await server.from('agreements').select('profile_id').eq('id', v.agreement_id).maybeSingle() : { data: null };
      const { data: p } = a?.profile_id ? await server.from('client_profiles').select('user_id').eq('id', a.profile_id).maybeSingle() : { data: null };
      return !p?.user_id;
    },

    /** The quote's PDF while it's open, with the coach's saved signature as sent. */
    async quotePdf(asked) {
      const open = await server.rpc('quote_open', { p_token: asked.token });
      if (open.error) throw refusalOf(open.error);
      const q = open.data;
      if (!q) throw calm(404, 'That link isn’t working. Ask your coach for a new one.');
      if (q.state !== 'open') throw calm(409, q.state === 'accepted' ? 'This quote is your agreement now. Download it from your agreement.' : 'This quote has run out. Ask your coach to open it again.');
      const { data: quote } = await server.from('agreement_quotes').select('coach_id, coach_signature_id').eq('share_token', asked.token).maybeSingle();
      const { data: coach } = quote ? await server.from('coaches').select('user_id').eq('id', quote.coach_id).maybeSingle() : { data: null };
      const { data: sig } = quote?.coach_signature_id ? await server.from('signatures').select('kind, image, typed_name, user_id').eq('id', quote.coach_signature_id).maybeSingle() : { data: null };
      const { quoteFile } = await import('../_agreementPdf.js');
      const pdf = await quoteFile(q, { coachSignature: sig && sig.user_id === coach?.user_id ? sig : null });
      return { pdf: Buffer.from(pdf.bytes).toString('base64'), fileName: pdf.fileName };
    },

    /**
     * A question from the quote page, emailed to the coach (from The Clarity Portal). Once a minute a quote at most, and only
     * while the quote is open; the client's own email isn't known here, so the coach replies through their usual way.
     */
    async quoteQuestion(asked) {
      const open = await server.rpc('quote_open', { p_token: asked.token });
      if (open.error) throw refusalOf(open.error);
      if (!open.data || open.data.state !== 'open') throw calm(409, 'This quote has run out. Ask your coach to open it again.');
      const { data: quote } = await server.from('agreement_quotes').select('id, coach_id, agreement_id, updated_at').eq('share_token', asked.token).maybeSingle();
      const { data: coach } = quote ? await server.from('coaches').select('display_first_name, email').eq('id', quote.coach_id).maybeSingle() : { data: null };
      if (!coach?.email) throw calm(409, 'Your question couldn’t be sent. Reply to your coach’s email instead.');
      const key = quote.id;
      const last = QUESTIONS.get(key) || 0;
      if (now().getTime() - last < 60000) throw calm(429, 'Your question is on its way. Wait a minute before sending another.');
      QUESTIONS.set(key, now().getTime());
      const t = open.data.terms || {};
      const outcome = await send(env, { to: coach.email, doc: quoteQuestionEmail({ clientName: t.clientName || 'Your client', number: open.data.number,
        words: asked.text, link: `${origin}/coach/agreements/${quote.agreement_id}` }), fromName: 'The Clarity Portal', replyTo: null });
      if (outcome === 'refused' || outcome === 'unsure') throw calm(502, 'Your question didn’t send. Check your connection and try again.');
      return { emailed: outcome === 'sent' };
    },

    /** The sponsor's agreement as a PDF: by an open link, or by one that has signed (their signed copy). */
    async sponsorPdf(asked) {
      const open = await server.rpc('sponsor_link_open', { p_token: asked.token });
      if (open.error) throw refusalOf(open.error);
      const l = open.data;
      if (!l || l.state === 'ended') throw calm(404, 'That link isn’t working. Ask your coach for a new one.');
      const { sponsorFile } = await import('../_agreementPdf.js');
      const pdf = await sponsorFile(server, l.version_id);
      if (!pdf) throw new Error('pdf');
      return { pdf: Buffer.from(pdf.bytes).toString('base64'), fileName: pdf.fileName };
    },

    /** The sponsor signs; their signed copy is emailed to them; each person's own agreement follows. */
    async sponsorSign(asked) {
      const r = await server.rpc('sponsor_sign', { p_token: asked.token, p_name: asked.name, p_role: asked.role, p_po: asked.po, p_image: asked.image,
        p_typed: asked.typed, p_fingerprint: asked.fingerprint });
      if (r.error) throw refusalOf(r.error);
      const signedAt = r.data?.signed_at || now().toISOString();
      const versionId = r.data?.version_id;
      // Everything after signing is a courtesy: signing stands whatever happens next.
      try {
        const { data: v } = await server.from('agreement_versions').select('id, agreement_id, coach_id, sponsor_email, sponsor_name, terms').eq('id', versionId).maybeSingle();
        const { data: a } = v ? await server.from('agreements').select('*').eq('id', v.agreement_id).maybeSingle() : { data: null };
        const { data: coach } = v ? await server.from('coaches').select('id, role, user_id, display_first_name, email, active').eq('id', v.coach_id).maybeSingle() : { data: null };
        const { data: org } = a?.organisation_id ? await server.from('organisations').select('name').eq('id', a.organisation_id).maybeSingle() : { data: null };
        if (v && coach && maySend(env)) {
          const { sponsorFile } = await import('../_agreementPdf.js');
          const pdf = await sponsorFile(server, v.id).catch(() => null);
          await send(env, {
            to: v.sponsor_email,
            doc: sponsorSignedCopyEmail({ sponsorFirst: String(v.sponsor_name || '').split(' ')[0], orgName: org?.name || v.terms?.orgName || '', coachFirst: coach.display_first_name, fileName: pdf?.fileName || '' }),
            fromName: v.terms?.coachName || coach.display_first_name, replyTo: coach.email || null,
            files: pdf ? [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes).toString('base64') }] : [],
          });
        }
        if (a && coach?.active) await agreementsApi({ db: server, server, coach, env, origin, send }).teamAgreements({ agreementId: a.id }).catch(() => null);
      } catch { /* signed already */ }
      return { signedAt };
    },
  };
}

export default async function handler(req, res, env = process.env) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false, message: DIDNT_WORK });
  const asked = askedFor(req.body);
  if (!asked) return reply(res, 400, { ok: false, message: DIDNT_WORK });
  const { url } = supabaseOf(env);
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 200, { ok: false, reason: 'not_connected' });
  const server = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const api = linkApi({ server, env, origin: portalOrigin(req.headers || {}, env) });
  try {
    const run = { quote_accept: () => api.quoteAccept(asked), quote_pdf: () => api.quotePdf(asked), quote_question: () => api.quoteQuestion(asked), sponsor_pdf: () => api.sponsorPdf(asked), sponsor_sign: () => api.sponsorSign(asked) }[asked.kind];
    return reply(res, 200, { ok: true, ...(await run()) });
  } catch (e) {
    if (e?.calm) return reply(res, e.status || 409, { ok: false, calm: true, message: e.message });
    return reply(res, 502, { ok: false, message: DIDNT_WORK });
  }
}
