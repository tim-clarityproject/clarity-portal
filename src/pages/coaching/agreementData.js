import { useEffect, useMemo, useState } from 'react';
import { readCache, useCachedLoad, writeCache } from '../../lib/pageCache';
import { loadWithReload } from '../../lib/loadWithReload';
import { loadAgreements, loadSignaturesBefore, readyToSign, signatureFor, tidyAgreements } from '../../lib/coaching/agreements';

// The client's agreements and invoices on the device (Phase 6b run 1): one page copy shared by
// My coaching, Billing and Home's row, shown at once and refreshed quietly (Smoothness). The
// signature pictures are never kept in it: a signed PDF reads them when it is made.

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
 * The document for a signed version's PDF (src/lib/pdf/docs/agreement.js), light only. The
 * client's signature is the one given (just signed) or read from their own signatures.
 */
export async function agreementDocument({ userId, version, signature = null }) {
  const [{ agreementPdf }, sig] = await Promise.all([
    loadWithReload(() => import('../../lib/pdf/docs/agreement')),
    signature ? Promise.resolve(signature) : loadSignaturesBefore(userId, version.signedAt).then((list) => signatureFor(version, list)),
  ]);
  return agreementPdf({ version, signature: sig });
}
