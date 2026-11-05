import { useId, useState } from 'react';
import { Button } from './Button';
import './design.css';

// A pattern card (mock-up M4 v47 "Patterns in your numbers"; methods M14;
// the 23 pattern rules, START-HERE 5d; Phase 5 step 3). One shared part,
// so the dashboard and the weekly debrief show a pattern the same way.
//
// Top to bottom, as M4's .pc: the kind ("A habit and its Strategy") with
// "Strong link" or "Clear link" at the right (rule 15), the sentence
// ("In weeks you…", never "because"; rule 7), the open question, the one
// action worded as the action (rule 16), then "How was this worked out?"
// (rule 8), which opens the groups, the averages, the usual swing, how
// unlikely chance is and that it held in both halves, and "Not useful",
// which hides the card for this person (M4).
//
// card: patterns.js patternCardWords() — { key, kind, strength, line,
//   question, action: { label }, how: [lines] }

export default function PatternCard({ card, onAct, onHide, className = '' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <article className={`ds-pattern ${className}`.trim()} aria-label={`${card.kind}, ${card.strength}`}>
      <div className="ds-pattern-head">
        <span className="ds-pattern-kind">{card.kind}</span>
        <span className="ds-pattern-strength">{card.strength}</span>
      </div>
      <p className="ds-pattern-line">{card.line}</p>
      <p className="ds-pattern-q">{card.question}</p>
      {card.action && onAct && (
        <Button variant="text" className="ds-pattern-act" onClick={() => onAct(card.action)}>{card.action.label}</Button>
      )}
      {open && (
        <div id={id} className="ds-pattern-how">
          {card.how.map((l) => <p key={l}>{l}</p>)}
        </div>
      )}
      <div className="ds-pattern-foot">
        <Button variant="text" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>How was this worked out?</Button>
        {onHide && <Button variant="text" onClick={() => onHide(card.key)}>Not useful</Button>}
      </div>
    </article>
  );
}
