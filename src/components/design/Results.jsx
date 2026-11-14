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
 */
export function ResultsSection({ title, first = false, children, className = '' }) {
  return (
    <section className={`ds-results-section${first ? ' ds-results-section--first' : ''} ${className}`.trim()}>
      {title && <h3 className="ds-results-head">{title}</h3>}
      {children}
    </section>
  );
}

/**
 * "Questions to start with:" (with its colon; Tim, 2 Nov): up to three
 * questions, each naming who or what it is about. Always the last section
 * of the summary. Nothing shows when there are no questions.
 */
export function StartQuestions({ questions, title = 'Questions to start with:' }) {
  if (!questions?.length) return null;
  return (
    <ResultsSection title={title} className="ds-startqs">
      {questions.map((q) => <p key={q} className="ds-startq">{q}</p>)}
    </ResultsSection>
  );
}
