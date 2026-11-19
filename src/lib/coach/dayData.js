// What the coaching day reads that isn't the coach's own rows (Phase 6a
// run 2; M11): things a client shares, read through the database's own
// rules and never kept in the coach's device store. Each loader answers
// with nothing (no error) when the tables aren't there yet, the connection
// is away or the database refuses, so a page simply leaves its section out.
//
// The rules themselves (what counts, the words) are day.js's.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { addDays } from './model';
import { PRESSURE_DAYS, pressureRows } from './day';
import { allOccurrences, tidyMoment } from '../peakMoments/model';

const MOMENT_COLUMNS = 'id,user_id,name,area,kind,starts_on,ends_on,place_city,place_zone,repeat_rule,shared';

/**
 * The shared work peak moments of these clients (their accounts' ids).
 * 048's rules give a coach only a current client's shared work moments; a
 * personal one is never shared. Clients with no account have none.
 * @param {string[]} clientUserIds
 * @returns {Promise<object[]>} moments as src/lib/peakMoments reads them, each with its owner's `userId`
 */
export async function loadPressure(clientUserIds) {
  const ids = [...new Set((clientUserIds || []).filter(Boolean))];
  if (!ids.length) return [];
  try {
    const { data, error } = await supabase.from('peak_moments').select(MOMENT_COLUMNS).in('user_id', ids).eq('area', 'work').eq('shared', true).limit(500);
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => {
      const m = tidyMoment({
        id: row.id, name: row.name, area: row.area, kind: row.kind, startsOn: row.starts_on, endsOn: row.ends_on,
        placeCity: row.place_city, placeZone: row.place_zone, repeat: row.repeat_rule, lesson: '', shared: row.shared,
      });
      return m && m.startsOn ? { ...m, userId: row.user_id } : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * The pressure forecast's rows for Today (day.js's pressureRows): empty
 * until the moments have been read, and whenever they can't be.
 * @param {object[]} clients the coach's own client profiles
 * @param {string} todayKey
 */
export function usePressure(clients, todayKey) {
  const ids = useMemo(() => [...new Set((clients || []).filter((c) => c.user_id && c.status !== 'past' && !c.merged_into).map((c) => c.user_id))].sort().join(','), [clients]);
  const [moments, setMoments] = useState([]);
  useEffect(() => {
    let live = true;
    if (!ids) { setMoments([]); return undefined; }
    loadPressure(ids.split(',')).then((list) => { if (live) setMoments(list); });
    return () => { live = false; };
  }, [ids]);
  return useMemo(
    () => pressureRows({ occurrences: allOccurrences(moments, addDays(todayKey, 1), addDays(todayKey, PRESSURE_DAYS)), clients, todayKey }),
    [moments, clients, todayKey],
  );
}
