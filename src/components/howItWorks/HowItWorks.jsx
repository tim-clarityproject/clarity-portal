import Chevron from '../design/Chevron';
import {
  HOW_IT_WORKS_CYCLE,
  HOW_IT_WORKS_PRIVATE,
  HOW_IT_WORKS_SECTIONS,
  privateText,
} from '../../content/howItWorks';
import './howItWorks.css';

// How it works (Draft 9; Stage D item 8): the five sections and "Private by default", one body for the public page,
// the page inside the portal and the pop-up behind "How the system fits together", so all three say the same words.
// Each section is a 13px grey label, a 20px line and its two or three sentences (the 25 Nov reference's rhythm).
// `heading`: the level of each section's label ('h2' on a page, 'h3' inside the pop-up, under its own title).
// `coach`: inside the portal, the client's own coach's first name (null: "your coach"); left out in public ("Tim").

/**
 * The cycle under section 2: Plan, then Sprint, then Review, and back to Plan, with Reset beside the Sprint. Drawn
 * in the reference's thin lines and the one chevron (26 Oct rule 6), in the text colours only (no coral, no mint).
 * One picture for a screen reader, with the whole cycle in its name.
 */
export function HowItWorksCycle() {
  return (
    <figure className="hiw-cycle" role="img" aria-label={`The cycle: ${HOW_IT_WORKS_CYCLE}`}>
      <div className="hiw-cycle-side" aria-hidden="true">
        <span className="hiw-node hiw-node--side">Reset</span>
        <span className="hiw-cycle-tie" />
      </div>
      <div className="hiw-cycle-row" aria-hidden="true">
        <span className="hiw-node">Plan</span>
        <span className="hiw-cycle-step"><Chevron direction="right" size="sm" /></span>
        <span className="hiw-node">Sprint</span>
        <span className="hiw-cycle-step"><Chevron direction="right" size="sm" /></span>
        <span className="hiw-node">Review</span>
      </div>
      <div className="hiw-cycle-back" aria-hidden="true">
        <span className="hiw-cycle-up"><Chevron direction="up" size="sm" /></span>
      </div>
    </figure>
  );
}

export default function HowItWorksBody({ heading: Heading = 'h2', className = '', coach }) {
  return (
    <div className={`hiw ${className}`.trim()}>
      {HOW_IT_WORKS_SECTIONS.map((s) => (
        <section key={s.key} className="hiw-section" aria-labelledby={`hiw-${s.key}`}>
          <Heading id={`hiw-${s.key}`} className="ds-label hiw-label">{s.label}</Heading>
          <p className="hiw-line">{s.line}</p>
          <p className="hiw-text">{s.text}</p>
          {s.cycle && <HowItWorksCycle />}
        </section>
      ))}
      <section className="hiw-section hiw-private" aria-labelledby="hiw-private">
        <Heading id="hiw-private" className="ds-label hiw-label">{HOW_IT_WORKS_PRIVATE.label}</Heading>
        <p className="hiw-text">{privateText(coach)}</p>
      </section>
    </div>
  );
}
