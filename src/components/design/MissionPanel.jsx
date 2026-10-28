import { Button, SystemLink } from './Button';
import { DropPanel } from './Dialogs';
import WhoSees from './WhoSees';
import './design.css';

// The My Mission panel (M1 mpanel), opened from the header's My Mission
// pill: who sees the mission, the mission, each Outcome Objective with its
// figure on the right ("31 of 40", "7/10 of 9/10", "Not yet, by 30 Jun
// 2027"), the performance score this week so far (mint at the standard),
// "How the system fits together" and "Open my plan". Below the header on a
// laptop, rising from the bottom on a phone.
//
// mission:       the mission text.
// objectives:    [{ id, name, stripFigure }]
// score:         { value, good } or null (no sprint running, or in Recovery:
//                scores are hidden then).
// who:           the WhoSees props for the mission ({ audience, onChange, name }).
// onSystemLink:  opens The Individual Performance System pop-up.
// onOpenPlan:    goes to the Individual Performance Plan.
export default function MissionPanel({ open, onClose, mission, objectives = [], score = null, who = {}, onSystemLink, onOpenPlan }) {
  return (
    <DropPanel open={open} onClose={onClose} title="My Mission">
      <div className="ds-mpanel">
        <div className="ds-mpanel-who"><WhoSees {...who} /></div>
        <p className="ds-mpanel-mission">{mission}</p>
        {objectives.length > 0 && (
          <ul className="ds-mpanel-objectives" aria-label="Outcome Objectives">
            {objectives.map((o) => (
              <li key={o.id}>
                <span>{o.name}</span>
                <b>{o.stripFigure}</b>
              </li>
            ))}
          </ul>
        )}
        <div className="ds-mpanel-week">
          {score && (
            <p className="ds-mpanel-score">
              Performance score this week so far
              <strong className={score.good ? 'ds-mpanel-score--good' : ''}>{score.value}%</strong>
            </p>
          )}
          {onSystemLink && <SystemLink onClick={onSystemLink} />}
        </div>
        {onOpenPlan && (
          <div className="ds-actions ds-mpanel-actions">
            <Button onClick={onOpenPlan}>Open my plan</Button>
          </div>
        )}
      </div>
    </DropPanel>
  );
}
