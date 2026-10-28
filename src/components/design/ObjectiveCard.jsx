import { Bar } from './Stat';
import StatusAction from './StatusAction';
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
export default function ObjectiveCard({ objective: o, onMarkDone, as: Heading = 'h3' }) {
  const labels = [`Outcome Objective ${o.number}`, o.kindLabel, o.dateText, o.timeLeft].filter(Boolean);
  return (
    <article className={`ds-objective${o.flagged ? ' ds-objective--flagged' : ''}`}>
      <p className="ds-objective-labels">
        {labels.map((l) => <span key={l}>{l}</span>)}
      </p>
      <Heading className="ds-objective-name">{o.name}</Heading>
      {o.kind === 'milestone' ? (
        onMarkDone ? (
          <div className="ds-objective-milestone">
            <StatusAction done={o.reached} onChange={onMarkDone} between={<Bar value={o.reached ? 1 : 0} className="ds-objective-bar" />} />
          </div>
        ) : (
          <div className="ds-objective-milestone">
            <p className={`ds-objective-status${o.reached ? ' ds-objective-status--done' : ''}`}>{o.reached ? 'Done' : 'Not yet'}</p>
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
      <p className="ds-objective-foot">
        {o.flagged
          ? 'No Strategy working on this yet'
          : `${o.strategyCount} ${o.strategyCount === 1 ? 'Strategy' : 'Strategies'} working on this`}
      </p>
    </article>
  );
}

export function ObjectiveGrid({ children, className = '' }) {
  return <div className={`ds-objectives ${className}`.trim()}>{children}</div>;
}
