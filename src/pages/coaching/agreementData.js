import { useEffect, useMemo, useState } from 'react';
import { readCache, useCachedLoad, writeCache } from '../../lib/pageCache';
import { loadAgreements, loadSignaturesBefore, loadSignedPdf, readyToSign, signatureFor, tidyAgreements } from '../../lib/coaching/agreements';
import { isNotThere } from '../../lib/coachingRules';
import { loadWithReload } from '../../lib/loadWithReload';

// The client's agreements and invoices on the device (Phase 6b run 1): one page copy shared by
// My coaching, Billing and Home's row, shown at once and refreshed quietly (Smoothness). The
// signature pictures are never kept in it: the signed PDF is made on the server at signing, with
// both signatures, and kept (follow-up 5, 064).

export const AGREEMENTS_CACHE = 'coaching-agreements';

/** My coaching and Billing: the device's copy first, then the database's. */
export function useAgreements(userId) {
  const load = useCachedLoad({ userId, name: AGREEMENTS_CACHE, load: () => loadAgreements(userId) });
  const data = useMemo(() => tidyAgreements(load.data), [load.data]);
  return { ...load, data };
}

const FRESH_MS = 10 * 60 * 1000;

/**
 * Home's row (M13 A1): the version waiting to be signed, from the device's copy, asked again when
 * that copy is more than 10 minutes old. Quiet whatever happens: no answer, no row.
 */
export function useAgreementWaiting(userId) {
  const [data, setData] = useState(() => readCache(userId, AGREEMENTS_CACHE)?.v || null);
  useEffect(() => {
    if (!userId) return undefined;
    const kept = readCache(userId, AGREEMENTS_CACHE);
    setData(kept?.v || null);
    if (kept && Date.now() - Number(kept.at) < FRESH_MS && Date.now() >= Number(kept.at)) return undefined;
    let live = true;
    loadAgreements(userId)
      .then((fresh) => { writeCache(userId, AGREEMENTS_CACHE, fresh); if (live) setData(fresh); })
      .catch(() => { /* quiet: the row shows from the device's copy, or not at all */ });
    return () => { live = false; };
  }, [userId]);
  return useMemo(() => readyToSign(tidyAgreements(data).agreements), [data]);
}

/**
 * A signed version's PDF, as it was made and kept at signing (follow-up 5, 064), for the shared
 * Download PDF button (PdfDownload's getDocument): saved as it is, never made again here. Light
 * only (PDF rule 1).
 * Only until 064 has run on the database (agreement_signed_pdf isn't there yet), the PDF is made
 * here as before, with the client's own signature alone.
 * @param {{ userId?: string, version: { id: string, version?: number }, signature?: object|null }} p
 */
export async function agreementDocument({ userId, version, signature = null }) {
  try {
    return { storedPdf: await loadSignedPdf(version) };
  } catch (error) {
    if (!isNotThere(error)) throw error;
  }
  const [{ agreementPdf }, sig] = await Promise.all([
    loadWithReload(() => import('../../lib/pdf/docs/agreement')),
    signature ? Promise.resolve(signature) : loadSignaturesBefore(userId, version.signedAt).then((list) => signatureFor(version, list)),
  ]);
  return agreementPdf({ version, signature: sig });
}
