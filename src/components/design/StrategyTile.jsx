import { Bar } from './Stat';
import { ObjectiveNumbers } from './ObjectiveNumber';
import './design.css';

// A Strategy's tile on the Individual Performance Plan (M1 .tile): "Serves"
// with the objectives' circled numbers (each opens "Outcome Objective 2",
// then the name), the Strategy's name, then its performance score this
// week so far with a thin bar: mint at or above the standard, the text
// colour and a grey bar below it (Tim, 26 Oct: mint means good, below the
// standard is grey). A Strategy that serves no objective says so in soft
// coral with a soft coral outline.
//
// The whole tile opens the Strategy's detail. The circled numbers sit
// above the tile's button (not inside it) so each can be tapped and
// focused for its own pop-up.
//
// strategy: { name, serves: [n], objectiveNames: [name], flagged,
//             score: { value, good } | null }
// scoreLabel: what the score is ("Performance score this week so far").
// scoreNote:  shown instead of a score when there is none (or null for nothing).
// open:       the detail is open (aria-expanded, outlined).
export default function StrategyTile({ strategy: s, onOpen, open = false, scoreLabel, scoreNote = null, controls }) {
  const numbers = s.serves.map((n, i) => ({ number: n, name: s.objectiveNames?.[i] || `Outcome Objective ${n}` }));
  return (
    <div className={`ds-stile${s.flagged ? ' ds-stile--flagged' : ''}${open ? ' ds-stile--open' : ''}`}>
      <div className="ds-stile-top">
        {s.flagged
          ? <span className="ds-stile-flag">Serves no objective yet</span>
          : <ObjectiveNumbers items={numbers} />}
      </div>
      <button
        type="button"
        className="ds-stile-btn"
        aria-expanded={open}
        aria-controls={controls}
        onClick={onOpen}
      >
        <span className="ds-stile-name">{s.name}</span>
      </button>
      {s.score ? (
        <div className="ds-stile-score">
          <span className="ds-stile-score-label">{scoreLabel}</span>
          <strong className={`ds-stile-figure${s.score.good ? ' ds-stile-figure--good' : ''}`}>{s.score.value}%</strong>
          <Bar value={s.score.value / 100} className={s.score.good ? '' : 'ds-bar--below'} />
        </div>
      ) : scoreNote ? (
        <p className="ds-stile-note">{scoreNote}</p>
      ) : null}
    </div>
  );
}

export function StrategyTiles({ children }) {
  return <div className="ds-stiles">{children}</div>;
}
