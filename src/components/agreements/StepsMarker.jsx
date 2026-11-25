import './agreements.css';

// The steps marker (M28's .steps3): Read, Sign, Settle. The current step in the text colour, done in mint, never coral
// (the brief's design-reference rules). `current` is 0, 1 or 2 (3 when all are done). A client funded by an
// organisation has no Settle step (`steps` = ['Read', 'Sign']).
export const STEPS = Object.freeze(['Read', 'Sign', 'Settle']);

export default function StepsMarker({ current = 0, steps = STEPS, label = 'Your steps' }) {
  return (
    <ol className="ag-steps" aria-label={label}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'on' : 'to-do';
        return (
          <li key={s} className={`ag-step ag-step--${state}`} aria-current={state === 'on' ? 'step' : undefined}>
            <span className="ag-step-n" aria-hidden="true">{i + 1}</span>
            <span>{s}</span>
            {state === 'done' && <span className="ds-sr">, done</span>}
          </li>
        );
      })}
    </ol>
  );
}
