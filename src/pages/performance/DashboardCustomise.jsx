import { useCallback, useContext, useEffect, useMemo } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { Chevron, SlidePanel, useToast } from '../../components/design';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import {
  DASHBOARD_KEY,
  SECTION_NAMES,
  moveSection,
  readDashboardPrefs,
  storedPrefs,
  toggleFold,
  toggleHidden,
} from '../../lib/performance/dashboard';
import './dashboard.css';

// The person's dashboard settings (mock-up M4 v47, Phase 5 step 2): which
// parts show, the order of the two that move, and which sections they
// left closed. Kept in the account with their other page settings
// (person_settings.page_preferences.dashboard, as menu_pins and
// sleep_target; menuPins.js), through the offline queue, with the
// device's copy shown at once, offline too. Each change is made on top of
// the account's latest copy, so a change in one tab never undoes another.

/** [settings, change(fn)]: fn(settings) gives the new settings. */
export function useDashboardPrefs() {
  const userId = useContext(AuthContext)?.user?.id || null;
  const prefs = usePreferences(userId);
  useEffect(() => {
    if (!userId) return undefined;
    refreshPins(userId);
    const back = () => { if (document.visibilityState === 'visible') refreshPins(userId); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [userId]);
  const saved = prefs?.[DASHBOARD_KEY];
  const settings = useMemo(() => readDashboardPrefs({ [DASHBOARD_KEY]: saved }), [saved]);
  const change = useCallback((fn) => {
    if (!userId) return Promise.resolve('saved');
    return updatePreference(userId, DASHBOARD_KEY, (old) => storedPrefs(fn(readDashboardPrefs({ [DASHBOARD_KEY]: old }))));
  }, [userId]);
  return [settings, change];
}

/** Opening or closing a section from its heading: remembered quietly, no toast. */
export function useFold() {
  const [settings, change] = useDashboardPrefs();
  const toggle = useCallback((key) => { change((s) => toggleFold(s, key)).catch(() => {}); }, [change]);
  return [settings.closed, toggle];
}

/**
 * The Customise panel (M4 cusPanel): "Which parts do you want to see, and
 * in what order?", a switch each for the Performance score chart and
 * Current sprint (they always stay at the top), then the two sections that
 * move, each with up and down (the brand chevron, 26 Oct rule 6, over M4's
 * own arrows) and its switch. Every change saves at once and says "Saved"
 * ("Will sync" offline). The same panel opens from the dashboard and from
 * My Account, Settings.
 */
export function DashboardCustomise({ open, onClose }) {
  const toast = useToast();
  const [settings, change] = useDashboardPrefs();
  const save = async (fn) => {
    try {
      const how = await change(fn);
      toast.show(how === 'queued' ? 'Will sync' : 'Saved');
    } catch {
      toast.error('That didn’t save. Check your connection and try again.');
    }
  };
  const row = (key, { movable = false, i = 0 } = {}) => (
    <div className="dash-cus-row" key={key}>
      <span className="dash-cus-name">{SECTION_NAMES[key]}</span>
      {movable && (
        <>
          <button type="button" className="dash-cus-move" aria-label={`Move ${SECTION_NAMES[key]} up`} disabled={i === 0} onClick={() => save((s) => moveSection(s, key, -1))}>
            <Chevron direction="up" />
          </button>
          <button type="button" className="dash-cus-move" aria-label={`Move ${SECTION_NAMES[key]} down`} disabled={i === settings.order.length - 1} onClick={() => save((s) => moveSection(s, key, 1))}>
            <Chevron direction="down" />
          </button>
        </>
      )}
      <button
        type="button"
        role="switch"
        className="ds-switch"
        aria-checked={!settings.hidden[key]}
        aria-label={`Show ${SECTION_NAMES[key]}`}
        onClick={() => save((s) => toggleHidden(s, key))}
      />
    </div>
  );
  return (
    <SlidePanel open={open} onClose={onClose} title="Customise">
      <div className="dash-cus">
        <p className="dash-cus-q">Which parts do you want to see, and in what order?</p>
        {row('hero')}
        {row('sum')}
        <p className="dash-cus-note">The Performance score chart and Current sprint always stay at the top, and can be switched off.</p>
        <p className="dash-cus-note">Home, the Performance Sprint and the Individual Performance Plan stay as they are.</p>
        {settings.order.map((key, i) => row(key, { movable: true, i }))}
      </div>
    </SlidePanel>
  );
}
