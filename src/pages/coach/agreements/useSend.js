import { useCallback, useEffect, useState } from 'react';
import { loadCoach, newId, noteRows, rowNow, rowsOf, saveRow } from '../../../lib/coach/store';
import { supabase } from '../../../lib/supabase';
import { ask } from '../../../lib/agreements/askClient';
import { checkTerms, kindOf } from '../../../lib/agreements/terms';
import { validUntil } from '../../../lib/agreements/quote';
import { loadSavedSignature, saveDrawnSignature } from '../../../lib/coaching/agreements';
import { sendBody, sendProblems, sentRows } from '../../../lib/coach/agreementBuilder';
import { isOnline } from '../../../lib/connection';
import { isOffline, needsConnection, SUPERSEDED_MESSAGE } from '../../../lib/friendlyError';

/** Sending needs a connection (P8): said in the one shape for that (friendlyError's needsConnection). */
export const SEND_OFFLINE = needsConnection('Sending an agreement');
/**
 * Why the draft didn't save before sending, in calm words (F2, P8): a refusal that isn't about the connection never says
 * "Check your connection". `answer`: the draft's save ('failed', 'queued', 'superseded'); `error`: what it threw.
 */
export function saveWords(answer, error) {
  if (answer === 'superseded') return `${SUPERSEDED_MESSAGE} Check it, then send it again.`;
  if (answer === 'queued' || isOffline(error)) return SEND_OFFLINE;
  if (['23514', '22003', '22P02', 'PGRST102'].includes(String(error?.code || '')) || error?.status === 400) {
    return 'That didn’t save, because something in it is more than an agreement can hold. Check the fee, then try again.';
  }
  return 'That didn’t save. Try again in a moment.';
}

// Sending an agreement or a quote (Phase 6b run 3, Group B; M28 s-check, s-sign, s-t-check, s-h-check; brief items 19,
// 21, 22 and 31; risk 23). The coach signs first (their saved signature, or one drawn or typed now, kept as their own
// in 061's signatures), the version is saved as it goes (its clauses with both settling texts, its rate, its note),
// then the server is asked to send it (asks.js agreements.send; Group E's route). Until that route is built, a build
// that isn't the live site takes the stand-in answer, and the page writes the sent state itself so the rest of the
// flow can be followed; the live site never does. An associate's agreement is signed and waits for the owner's
// approval instead (065's approval 'waiting'); the owner's Approve and send sends it from the associate.

/** The coach's saved signature (the newest drawn one), or null; undefined while it is being read. */
export function useSavedSignature(userId) {
  const [saved, setSaved] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadSavedSignature(userId).then((row) => { if (live) setSaved(row || null); }, () => { if (live) setSaved(null); });
    return () => { live = false; };
  }, [userId]);
  return saved;
}

async function signatureId(userId, { saved, drawn, typed }) {
  if (drawn) return (await saveDrawnSignature(userId, drawn)).id;
  if (typed) {
    const { data, error } = await supabase.from('signatures').insert({ user_id: userId, kind: 'typed', typed_name: String(typed).trim() }).select('id').single();
    if (error) throw new Error(isOffline(error) ? SEND_OFFLINE : 'Your signature didn’t save. Try again in a moment.');
    return data.id;
  }
  return saved?.id || null;
}

/**
 * send({ sendAs, validDays, personalNote, signature: { saved, drawn, typed } }) → { ok, message?, waiting?, quoteNumber? }.
 * `d` is useAgreementDraft's answer for the agreement being sent.
 */
export function useSend(d) {
  return useCallback(async ({ sendAs = 'agreement', validDays = 30, personalNote, signature = {} }) => {
    const { agreement, draft, userId, portal } = d;
    if (!agreement || !draft) return { ok: false, message: 'That agreement isn’t here.' };
    if (!isOnline()) return { ok: false, message: SEND_OFFLINE };
    const terms = draft.terms || {};
    const problems = [...checkTerms(terms), ...sendProblems(terms, { rate: d.rate })];
    if (problems.length) return { ok: false, message: problems[0] };
    let sigId;
    try { sigId = await signatureId(userId, signature); } catch (e) { return { ok: false, message: isOffline(e) ? SEND_OFFLINE : e?.message || 'Your signature didn’t save. Try again in a moment.' }; }
    if (!sigId) return { ok: false, message: 'Draw or type your signature first.' };
    const note = personalNote ?? draft.personal_note ?? '';
    const sentAt = new Date().toISOString();

    // An associate signs as coach; it waits for the owner (risk 23). Once the owner approved this very version (a quote
    // waits for its Send), it goes as the owner's would; the server and database check it is the version approved.
    const approvedNow = agreement.approval === 'approved' && Number(agreement.approved_version) === Number(draft.version);
    if (!portal.isOwner && !approvedNow) {
      const saved = await d.save(terms, { personalNote: note, fields: { send_as: sendAs, coach_signed_at: sentAt, coach_signature_id: sigId }, agreementChange: { approval: 'waiting' }, now: true });
      return ['failed', 'queued', 'superseded'].includes(saved) ? { ok: false, message: saveWords(saved, d.lastError?.()) } : { ok: true, waiting: true };
    }

    const saved = await d.save(terms, { personalNote: note, fields: { send_as: sendAs }, now: true });
    if (['failed', 'queued', 'superseded'].includes(saved)) return { ok: false, message: saveWords(saved, d.lastError?.()) };
    // The version and agreement as just saved (their clauses, rate and note), not the page's older copies.
    const version = rowNow(userId, 'agreement_versions', { id: draft.id }) || draft;
    const agreementNow = rowNow(userId, 'agreements', { id: agreement.id }) || agreement;
    let quote = null;
    if (sendAs === 'quote') {
      const had = rowsOf(portal.state, 'agreement_quotes').find((q) => q.version_id === draft.id && (q.status === 'draft' || q.status === 'withdrawn' || q.status === 'expired')) || null;
      quote = { ...(had || { id: newId(), coach_id: portal.coach.id, agreement_id: agreement.id, version_id: draft.id }), valid_days: Number(validDays) || 30, status: 'draft', coach_signature_id: sigId };
      try { await saveRow(userId, 'agreement_quotes', quote); } catch (e) { return { ok: false, message: saveWords('failed', e) }; }
    }
    const answer = await ask('agreements', 'send', sendBody({ agreement: agreementNow, version, signatureId: sigId, personalNote: note, sendAs, validDays, quoteId: quote?.id || null }));
    if (!answer.ok) return { ok: false, message: isOnline() ? answer.message : SEND_OFFLINE };

    if (answer.standIn) {
      // Off the live site only: the stand-in sends nothing, so the page writes what the server would have.
      const rows = sentRows({ agreement: agreementNow, version, signatureId: sigId, sentAt, sendAs, todayKey: portal.todayKey });
      try {
        await saveRow(userId, 'agreement_versions', rows.version);
        if (sendAs !== 'quote') await saveRow(userId, 'agreements', rows.agreement);
      } catch { /* kept on the device; the store sends it */ }
      if (quote) noteRows(userId, [['agreement_quotes', { ...quote, status: 'sent', number: answer.quoteNumber || null, sent_at: sentAt, valid_until: validUntil(portal.todayKey, Number(validDays) || 30) }]]);
    } else {
      if (sendAs === 'quote') noteRows(userId, [['agreement_quotes', { ...quote, status: 'sent', number: answer.quoteNumber || null, sent_at: answer.sentAt || sentAt, valid_until: answer.validUntil || validUntil(portal.todayKey, Number(validDays) || 30) }]]);
      else noteRows(userId, [['agreement_versions', { ...version, status: 'sent', sent_at: answer.sentAt || sentAt, coach_signed_at: answer.sentAt || sentAt, coach_signature_id: sigId, expires_on: answer.expiresOn || null }], ['agreements', { ...agreementNow, status: 'sent', current_version: version.version }]]);
      loadCoach(userId, { again: true }).catch(() => {});
    }
    // A team programme: the sponsor's link goes once the coach has signed (asks.js agreements.sponsor_send).
    if (kindOf(terms) === 'team' && sendAs !== 'quote') {
      const s = terms.team?.sponsor || {};
      const more = await ask('agreements', 'sponsor_send', { agreementId: agreement.id, versionId: draft.id, sponsor: { name: s.name || '', email: s.email || '', role: s.role || '' } });
      if (!more.ok) return { ok: false, message: more.message };
    }
    return { ok: true, quoteNumber: answer.quoteNumber || null, emailed: Boolean(answer.emailed) };
  }, [d]);
}
