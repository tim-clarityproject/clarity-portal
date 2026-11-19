import { useEffect, useMemo, useState } from 'react';
import { readCache, writeCache } from '../../lib/pageCache';
import { coachingNews, loadCoaching, readCoachingNotNow, readCoachingSeen } from '../../lib/coaching';

// Home's one quiet line about the Coaching page (Phase 6a run 2): only when
// something there is new. It reads the Coaching page's own copy on the
// device first, and asks the database again when that copy is more than 10
// minutes old (a migration that hasn't run is asked for at most once an
// hour: src/lib/coaching.js). Quiet whatever happens: no answer, no line.
const FRESH_MS = 10 * 60 * 1000;

export default function useCoachingNews(userId, { today, now }) {
  const [data, setData] = useState(() => readCache(userId, 'coaching')?.v || null);
  useEffect(() => {
    if (!userId) return undefined;
    const kept = readCache(userId, 'coaching');
    setData(kept?.v || null);
    if (kept && Date.now() - Number(kept.at) < FRESH_MS && Date.now() >= Number(kept.at)) return undefined;
    let live = true;
    loadCoaching(userId)
      .then((fresh) => { writeCache(userId, 'coaching', fresh); if (live) setData(fresh); })
      .catch(() => { /* quiet: the line shows from the device's copy, or not at all */ });
    return () => { live = false; };
  }, [userId]);
  return useMemo(
    () => (data ? coachingNews(data, { now, today, notNow: readCoachingNotNow(userId), seenAt: readCoachingSeen(userId) }) : null),
    // The minute is enough: a yes that runs out, or a new day, changes the line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, today, userId, Math.floor(new Date(now).getTime() / 60000)],
  );
}
