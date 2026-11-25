import { useId, useState } from 'react';
import { Button } from './Button';
import { GATING_ON, PLAN_WORDS, isLocked, onPlans } from '../../lib/levels';
import '../../pages/coaching/clientAgreement.css';

// A tool on the free plan (Phase 6b run 3, Group C; M28 version 4 s-locked; plan risk 20). Gently locked: the tile
// keeps its place in its hub, quieter (the raised surface, its name in grey), and says which plans have it ("On
// Individual and Executive") where an open tile says how long it takes. Opening it explains in two lines, the tool's
// name and what it does, with See plans (coral) and Not now. While gating is off (GATING_ON in src/lib/levels.js, until
// Tim sets prices and who keeps what) nothing is ever locked: it draws the ordinary tile, which opens the tool.
//   title:   the tool's name           line:   what it does, one sentence (shown when opened)
//   minutes: "~3 minutes" (an open tile's detail)
//   levels:  the plans that have it (['individual', 'executive'])   level: the plan someone is on
//   onOpen:  opens the tool           onPlans: opens Your plan
export default function LockedTile({ title, line, minutes, levels = [], level = 'free', onOpen, onPlans: openPlans, gating = GATING_ON }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!isLocked(levels, level, gating)) {
    return (
      <button type="button" className="cl-tile" onClick={onOpen}>
        <span className="cl-tile-title">{title}</span>
        {minutes && <span className="cl-tile-meta">{minutes}</span>}
      </button>
    );
  }
  return (
    <div>
      <button type="button" className="cl-tile cl-tile--locked" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className="cl-tile-title">{title}</span>
        <span className="cl-tile-meta">{onPlans(levels)}</span>
      </button>
      {open && (
        <div id={panelId} className="cl-panel cl-locked-panel">
          <h3 className="cl-locked-title">{title}</h3>
          {line && <p className="cl-say">{line}</p>}
          <div className="cl-acts">
            <Button variant="primary" onClick={openPlans}>{PLAN_WORDS.seePlans}</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>{PLAN_WORDS.notNow}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
