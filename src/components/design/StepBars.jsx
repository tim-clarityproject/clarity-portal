import './design.css';

// Five fine steps for an answer on a five-step scale (M10's trust list and
// its table; M7b's project list will use the same part): as many steps
// filled as the answer, and the answer in words for screen readers, so
// nothing depends on colour.
//
//   value: 1 to 5 (of `steps`)
//   tone:  'good' (mint: at or above the standard), 'low' (coral: the one
//          that needs you; never on anything that can be tapped), or ''
//          (grey)
//   word:  the answer in words, read by screen readers only; leave it out
//          where the words are on screen beside the bars
//   under: the word shows under the bars instead (M7b's project list; Tim,
//          14 Nov, 09:43: "can't tell what the bars are"), in the text
//          colour when the tone is good
//   strong: the filled steps in the secondary grey, clearly darker than the
//          empty ones in dark mode too (M7b version 51)
export default function StepBars({ value, tone = '', word, steps = 5, className = '', under = false, strong = false }) {
  const on = Math.max(0, Math.min(steps, Math.round(Number(value) || 0)));
  return (
    <>
      <span className={`ds-stepbars${tone ? ` ds-stepbars--${tone}` : ''}${strong ? ' ds-stepbars--strong' : ''} ${className}`.trim()} aria-hidden="true">
        {Array.from({ length: steps }, (_, k) => <i key={k} className={k < on ? 'ds-stepbars-on' : undefined} />)}
      </span>
      {word && <span className={under ? `ds-stepbars-word${tone === 'good' ? ' ds-stepbars-word--good' : ''}` : 'ds-sr'}>{word}</span>}
    </>
  );
}

// A list of people or things, each with its five steps and the level in
// words at the right (M10's Trust). The rows are words only: nothing here
// can be tapped, so coral may mark the one that needs attention.
//
//   rows: [{ id, title, sub, value, word, tone, label }]
//         label: what a screen reader hears for the row ("Tom Ellis. Trust: Open resistance.")
export function StepBarRows({ rows, label }) {
  return (
    <div className="ds-steprows" role="list" aria-label={label}>
      {rows.map((r) => (
        <div key={r.id} className="ds-steprow" role="listitem" aria-label={r.label}>
          <span className="ds-steprow-name">
            <b>{r.title}</b>
            {r.sub && <small>{r.sub}</small>}
          </span>
          <StepBars value={r.value} tone={r.tone} className="ds-steprow-bars" />
          <span className={`ds-steprow-word${r.tone ? ` ds-steprow-word--${r.tone}` : ''}`}>{r.word}</span>
        </div>
      ))}
    </div>
  );
}
