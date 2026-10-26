import { useEffect, useState } from 'react';
import Crosshair from './Crosshair';
import { useCoach } from './coachContext';
import { LOADING_DELAY_MS } from './timing';
import './design.css';

// Saving happens automatically (no Save buttons). These say where it is:
// "Saving" (small grey turning crosshair), then the mint "Saved" once the
// server confirms, or "Will sync" when there's no signal and the entry is
// kept on the device until it can be sent.
export function SavingIndicator() {
  return (
    <span className="ds-status ds-status--saving">
      <Crosshair size="sm" tone="grey" spin />
      Saving
    </span>
  );
}

export function SavedIndicator() {
  return (
    <span className="ds-status ds-status--saved">
      <span className="ds-dot" aria-hidden="true" />
      Saved
    </span>
  );
}

export function WillSyncIndicator() {
  return (
    <span className="ds-status ds-status--sync">
      <span className="ds-dot ds-dot--hollow" aria-hidden="true" />
      Will sync
    </span>
  );
}

// One place on a page for the current state, announced politely to
// screen readers. state: 'saving' | 'saved' | 'offline' | 'idle'.
export function SaveStatus({ state }) {
  return (
    <span role="status" aria-live="polite">
      {state === 'saving' && <SavingIndicator />}
      {state === 'saved' && <SavedIndicator />}
      {state === 'offline' && <WillSyncIndicator />}
    </span>
  );
}

// A small win (Tim, 23 Oct): the tick fills mint (Tim, 26 Oct) and a few words show,
// e.g. "Done. 3 of 4 this week." Big moments get the full celebration.
export function SmallWin({ children }) {
  return (
    <span className="ds-win">
      <span className="ds-win-tick" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </span>
      {children}
    </span>
  );
}

// A calm error: what happened, then what to do, on a soft coral tint.
// No blame, no codes, never red. e.g. "That didn't save. Check your
// connection and try again."
// keepsHappening: adds where to turn if it doesn't go away (Tim, 26 Oct):
// "If it keeps happening, let your coach know." for someone with a
// coach, and "If it keeps happening, use Something not working? in My
// Account." for someone without.
export function ErrorMessage({ children, keepsHappening = false }) {
  const coach = useCoach();
  return (
    <div className="ds-error" role="alert">
      <span className="ds-error-mark" aria-hidden="true">!</span>
      <span>
        {children}
        {keepsHappening && <span className="ds-line">{keepsHappeningLine(coach)}</span>}
      </span>
    </div>
  );
}

export function keepsHappeningLine(coach) {
  return coach
    ? 'If it keeps happening, let your coach know.'
    : 'If it keeps happening, use Something not working? in My Account.';
}

// Loading: the brand crosshair turning, centred in the space that is
// loading, with one short line saying what is loading ("Loading your
// plan"). Nothing shows for the first 0.3 seconds, so fast loads never
// flash. With reduced motion the crosshair fades gently instead.
export function Loading({ label, delay = LOADING_DELAY_MS, className = '' }) {
  const [visible, setVisible] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return undefined;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return (
    <div className={`ds-loading ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      {visible && (
        <>
          <Crosshair size="lg" tone="coral" spin />
          <span>{label}</span>
        </>
      )}
    </div>
  );
}
