import { useCallback, useEffect, useState } from 'react';
import { getChartStyle, listCheckins, loadAreas } from '../../lib/wheelOfLifeApi';
import { DEFAULT_CHART_STYLE } from '../../lib/wheelOfLife';

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
  const [state, setState] = useState({
    loading: true, error: null, areas: null, checkins: [], chartStyle: DEFAULT_CHART_STYLE,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchWheelData(withChartStyle).then((next) => {
      if (!cancelled) setState(next);
    });
    return () => { cancelled = true; };
  }, [withChartStyle, attempt]);

  // Try again after a failed load.
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  // Replace the areas after a save that returned the fresh list.
  const setAreas = useCallback((areas) => setState((s) => ({ ...s, areas })), []);

  return { ...state, reload, setAreas };
}
