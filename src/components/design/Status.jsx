import { useEffect, useState } from 'react';
import Crosshair from './Crosshair';
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
