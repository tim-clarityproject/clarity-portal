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
import { COMING_UP_DAYS, PRESSURE_DAYS, pressureRows } from './day';
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

// ---------------------------------------------------------------- the brief before a call

const quiet = async (ask) => {
  try {
    const { data, error } = await ask();
    return error ? null : data;
  } catch {
    return null;
  }
};

/**
 * For this call: the client's own For next time (050's session_prep, which
 * their current coach reads). Null when there is none, or it can't be read.
 * @returns {Promise<{ body: string, noted_at: string }|null>}
 */
export async function loadPrep(clientUserId) {
  if (!clientUserId) return null;
  const row = await quiet(() => supabase.from('session_prep').select('body,noted_at').eq('user_id', clientUserId).maybeSingle());
  return row && typeof row.body === 'string' && row.body.trim() ? { body: row.body, noted_at: row.noted_at } : null;
}

/**
 * A client's finished weeks' scores (028's week_scores), which the
 * database returns only while the client shares Progress, each with its
 * sprint's standard (028's sprints, shared the same way): the client's own
 * standard for the brief's bar (run 6, item 5). A standard that can't be
 * read is left out, and the bar uses the default.
 * @returns {Promise<{ week_end: string, score: number|null, standard: number|null }[]>}
 */
export async function loadWeekScores(clientUserId) {
  if (!clientUserId) return [];
  const rows = await quiet(() => supabase.from('week_scores').select('week_end,score,sprint_id').eq('user_id', clientUserId).order('week_end', { ascending: false }).limit(60));
  const weeks = Array.isArray(rows) ? rows.filter((r) => r && typeof r.week_end === 'string') : [];
  const ids = [...new Set(weeks.map((w) => w.sprint_id).filter((id) => typeof id === 'string'))];
  const sprints = ids.length ? await quiet(() => supabase.from('sprints').select('id,standard').in('id', ids)) : [];
  const standards = new Map((Array.isArray(sprints) ? sprints : []).filter((s) => s && s.id).map((s) => [s.id, Number(s.standard)]));
  return weeks.map(({ sprint_id: id, ...w }) => ({ ...w, standard: standards.get(id) ?? null }));
}

/**
 * The reviews a client wrote after their shared work peak moments (048: a
 * coach reads a review only of a shared work moment).
 * @returns {Promise<{ moment_id: string, occurs_on: string, answer: string, kept: string|null, lesson: string|null }[]>}
 */
export async function loadSharedReviews(clientUserId) {
  if (!clientUserId) return [];
  const rows = await quiet(() => supabase.from('peak_reviews').select('moment_id,occurs_on,answer,kept,lesson').eq('user_id', clientUserId).order('occurs_on', { ascending: false }).limit(20));
  return Array.isArray(rows) ? rows.filter((r) => r && r.moment_id && typeof r.occurs_on === 'string') : [];
}

/**
 * The monthly reviews a client shares (029's checkins, read while the
 * "Monthly check-in" part is shared): the scores and the First review's goals.
 * @returns {Promise<object[]>}
 */
export async function loadReviews(clientUserId) {
  if (!clientUserId) return [];
  const rows = await quiet(() => supabase.from('checkins').select('kind,month,status,hardware_score,software_score,goals').eq('user_id', clientUserId).order('month', { ascending: true }).limit(120));
  return Array.isArray(rows) ? rows : [];
}

const NOTHING = Object.freeze({ loaded: false, prep: null, scores: [], reviews: [], moments: [], coming: [] });

/**
 * Everything the brief reads that the client shares, asked for each time
 * the brief opens and never kept past the visit. Each part is empty when
 * the client has no account, doesn't share it, or the database doesn't answer.
 * @param {string|null} clientUserId the client's account (null: nothing is asked)
 * @param {string} todayKey
 */
export function useBriefData(clientUserId, todayKey) {
  const [data, setData] = useState(NOTHING);
  useEffect(() => {
    let live = true;
    setData(NOTHING);
    if (!clientUserId) return undefined;
    Promise.all([loadPrep(clientUserId), loadWeekScores(clientUserId), loadSharedReviews(clientUserId), loadPressure([clientUserId])]).then(([prep, scores, reviews, moments]) => {
      if (live) setData({ loaded: true, prep, scores, reviews, moments, coming: allOccurrences(moments, todayKey, addDays(todayKey, COMING_UP_DAYS)) });
    });
    return () => { live = false; };
  }, [clientUserId, todayKey]);
  return data;
}

/** The reviews a client shares, for the guided close: empty until read, and whenever they can't be. */
export function useReviews(clientUserId) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    setRows([]);
    if (!clientUserId) return undefined;
    loadReviews(clientUserId).then((list) => { if (live) setRows(list); });
    return () => { live = false; };
  }, [clientUserId]);
  return rows;
}
