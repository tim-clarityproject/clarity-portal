import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { getChartStyle, listCheckins, loadAreas } from '../../lib/wheelOfLifeApi';
import { DEFAULT_CHART_STYLE } from '../../lib/wheelOfLife';
import { readCache, writeCache } from '../../lib/pageCache';
import { isOnline } from '../../lib/connection';
import { FIRST_OPEN_OFFLINE } from '../../lib/friendlyError';

// The last wheel shown, kept on the device (Works on a flight): offline,
// the screens show it as last seen instead of an error.
const CACHE = (withChartStyle) => (withChartStyle ? 'life-balance:styled' : 'life-balance');

async function fetchWheelData(withChartStyle) {
  const [a, c, st] = await Promise.all([
    loadAreas(),
    listCheckins(),
    withChartStyle ? getChartStyle() : Promise.resolve({ data: DEFAULT_CHART_STYLE, error: null }),
  ]);
  const error = a.error || c.error || null;
  return {
    loading: false,
    error: error ? error.message : null,
    areas: a.data,
    checkins: c.data || [],
    chartStyle: st.data || DEFAULT_CHART_STYLE,
  };
}

// Loads what a Wheel of Life screen needs: the areas (seeding the ten
// standard rows on a first visit), the saved check-ins and, when asked,
// the chart style. Never throws: a failed load sets `error` (a short
// message to show) and the page offers Try again.
export default function useWheelData({ withChartStyle = false } = {}) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [state, setState] = useState({
    loading: true, error: null, areas: null, checkins: [], chartStyle: DEFAULT_CHART_STYLE,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchWheelData(withChartStyle).then((next) => {
      if (cancelled) return;
      if (!next.error) {
        writeCache(userId, CACHE(withChartStyle), next);
        setState(next);
        return;
      }
      const copy = readCache(userId, CACHE(withChartStyle))?.v;
      if (copy && !isOnline()) setState({ ...copy, loading: false, error: null });
      else setState(isOnline() ? next : { ...next, error: FIRST_OPEN_OFFLINE });
    });
    return () => { cancelled = true; };
  }, [withChartStyle, attempt, userId]);

  // Try again after a failed load.
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  // Replace the areas after a save that returned the fresh list.
  const setAreas = useCallback((areas) => setState((s) => ({ ...s, areas })), []);

  return { ...state, reload, setAreas };
}
