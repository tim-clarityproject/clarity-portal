import './design.css';

// A results or summary page's parts (M10 "Your team"; rule 29ar): it opens
// with one headline sentence, never a big figure, then the overview
// visuals, each under a section named in small capitals, and "Questions to
// start with:" always come last.

/** The opening sentence. */
export function ResultsHeadline({ children }) {
  return <p className="ds-headline">{children}</p>;
}

/**
 * One section of a results page: its name in small capitals with the line
 * under it, then what it holds. `first` is the section straight under the
 * page's title (the headline's own).
 * title can hold an ⓘ after its words (TermInfo).
 * `row` (M7b .sec and .sech, the Health Check): every section's name sits in
 * the same 44px row with the line under it, whether or not it has a link at
 * its right, so the sections are spaced alike.
 */
export function ResultsSection({ title, first = false, children, className = '', action = null, row = false }) {
  const inRow = row || Boolean(action);
  return (
    <section className={`ds-results-section${first ? ' ds-results-section--first' : ''}${row ? ' ds-results-section--row' : ''} ${className}`.trim()}>
      {title && !inRow && <h3 className="ds-results-head">{title}</h3>}
      {/* action: the section's own quiet link at the right of its name ("Edit"; M7b). */}
      {title && inRow && (
        <div className="ds-results-headrow">
          <h3 className="ds-results-head">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * "Questions to start with:" (with its colon; Tim, 2 Nov): up to three
 * questions, each naming who or what it is about. Always the last section
 * of the summary. Nothing shows when there are no questions.
 * A question can also be { key, label, question, reason, ...rest } (M7b's
 * Health Check): its topic small above it, and why it's asked under it,
 * every one alike. `onPoint(question|null)` says which one a mouse is on.
 */
export function StartQuestions({ questions, title = 'Questions to start with:', onPoint, row = false }) {
  if (!questions?.length) return null;
  return (
    <ResultsSection title={title} className="ds-startqs" row={row}>
      {questions.map((q) => (typeof q === 'string' ? <p key={q} className="ds-startq">{q}</p> : (
        <div
          key={q.key || q.question}
          className="ds-startq ds-startq--parts"
          onPointerEnter={onPoint ? (e) => { if (e.pointerType === 'mouse') onPoint(q); } : undefined}
          onPointerLeave={onPoint ? () => onPoint(null) : undefined}
        >
          {q.label && <span className="ds-startq-label">{q.label}</span>}
          <p>{q.question}</p>
          {q.reason && <p className="ds-startq-reason">{q.reason}</p>}
        </div>
      )))}
    </ResultsSection>
  );
}
