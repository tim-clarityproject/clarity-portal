import { Bar } from './Stat';
import keepWords from './keepWords';
import StatusAction from './StatusAction';
import { Button } from './Button';
import './design.css';

// An Outcome Objective's card (M1 .ob; three ways to track, Tim 22 Oct).
// The label line (which objective, its kind, its date and the time left),
// the name, then the figure:
//   a number:   "31" with "of 40" small and grey beside it;
//   a rating:   "7/10" with "target 9/10";
//   a milestone: its status on its own, "Not yet" or a mint "Done", and a
//               quiet "Mark as done" link under it (Tim, 23 Oct).
// A thin mint bar shows progress towards the target (Tim, 26 Oct: progress
// is mint; a reached milestone is a full mint bar). The foot says how many
// Strategies work on it, or, when none does, "No Strategy working on this
// yet" in soft coral with a soft coral outline (needs you: words and an
// outline, never colour alone).
//
// objective: { number, name, kindLabel, dateText, timeLeft, figure, target,
//              progress (0 to 1), kind, reached, strategyCount, flagged }
// onMarkDone: (done) => void, for a milestone; leave out to show it read only.
// onEdit:     opens this objective on its own (Tim, 3 Nov): a quiet
//             "Edit this objective" link at the foot of the card.
export default function ObjectiveCard({ objective: o, onMarkDone, onEdit, as: Heading = 'h3' }) {
  // Its number and its date only (Tim, 10 Nov): the figure shows what kind
  // it is, and the date already says how long is left (29n).
  const labels = [`Outcome Objective ${o.number}`, o.dateText].filter(Boolean);
  return (
    <article className={`ds-objective${o.flagged ? ' ds-objective--flagged' : ''}`}>
      <p className="ds-objective-labels">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </p>
      <Heading className="ds-objective-name">{keepWords(o.name)}</Heading>
      {o.kind === 'milestone' ? (
        onMarkDone ? (
          <div className="ds-objective-milestone">
            <StatusAction done={o.reached} notDoneLabel="" onChange={onMarkDone} between={<Bar value={o.reached ? 1 : 0} className="ds-objective-bar" />} />
          </div>
        ) : (
          <div className="ds-objective-milestone">
            {/* Never "Not yet" in the figure style (Tim, 5 Nov): the empty bar says it. */}
            {o.reached && <p className="ds-objective-status ds-objective-status--done">Done</p>}
            <Bar value={o.reached ? 1 : 0} className="ds-objective-bar" />
          </div>
        )
      ) : (
        <>
          <p className="ds-objective-figure">
            {o.figure}
            <span className="ds-objective-target">{o.target}</span>
          </p>
          <Bar value={o.progress} className="ds-objective-bar" />
        </>
      )}
      {/* Only a gap is named: the Strategies' own Serves numbers show the rest. */}
      {o.flagged && <p className="ds-objective-foot">No Strategy working on this yet</p>}
      {onEdit && (
        <Button variant="text" className="ds-part-edit" onClick={onEdit} aria-label={`Edit this objective: ${o.name}`}>
          Edit this objective
        </Button>
      )}
    </article>
  );
}

export function ObjectiveGrid({ children, className = '' }) {
  return <div className={`ds-objectives ${className}`.trim()}>{children}</div>;
}
