import { Button } from './Button';
import Chevron from './Chevron';
import { Popup } from './Dialogs';
import './design.css';

// The Individual Performance System pop-up (agreed 21 Oct; wording
// updated 23 Oct): how the layers fit together, in the one-pager's words
// (individual-performance-system-one-pager.md), with no personal detail.
// It opens over any page and closes back to it (Close, the rotated
// crosshair or Escape); full screen on a phone. Opened from "How the
// system fits together" on the plan, the sprint, the debrief, View your
// year, the dashboard and the My Mission panel.
//
// The 26 Oct rules applied to the one-pager:
// - one sentence per line (writing rule 49), so "What you aim for and how.
//   Changes rarely." and the sprint's first line are each two lines;
// - no text arrows (26 Oct rule 6): the two-way link uses the one chevron,
//   turned down and up;
// - no coral box (26 Oct rule 1: coral is for doing and the brand only):
//   the plan's box is outlined in the text colour, the sprint's in grey and
//   the dashboard's dashed;
// - the crosshair is only for add and close (CLAUDE.md rule 6), so the last
//   sprint line has none;
// - no overline (CLAUDE.md rule 4), so "How it fits together" isn't shown
//   above the title.

const CHAIN = [
  {
    name: 'My Mission',
    lines: ['The big aim that drives your daily performance.', 'Progress on it is measured by your Outcome Objectives.'],
    join: 'measured by',
  },
  {
    name: 'Outcome Objectives',
    lines: ['2 to 4 results by which progress on your mission is measured.', 'Each is a number, a milestone or a rating out of 10.'],
    join: 'delivered through',
  },
  {
    name: 'Strategies',
    lines: ['3 to 6 medium to long-term approaches to achieving your objectives.', 'Each serves one or more objectives.'],
    join: 'carried out by',
  },
  {
    name: 'Tactics',
    lines: ['The short-term habits and to-dos that carry out each Strategy.', 'Each has a simple measure.'],
  },
];

export function PerformanceSystemBody() {
  return (
    <div className="ds-system">
      <div className="ds-system-lead">
        <p>Your mission sits at the top.</p>
        <p>Your plan says what you aim for and how.</p>
        <p>Your sprints are where you do the work, week by week.</p>
      </div>

      <section className="ds-system-box ds-system-box--plan" aria-labelledby="ds-system-plan">
        <h3 id="ds-system-plan" className="ds-system-name">Individual Performance Plan</h3>
        <p className="ds-system-line">What you aim for and how.</p>
        <p className="ds-system-line">Changes rarely.</p>
        <ol className="ds-system-chain">
          {CHAIN.map((layer, i) => (
            <li key={layer.name} className="ds-system-layer">
              <span className="ds-system-num" aria-hidden="true">{i + 1}</span>
              <div>
                <p className="ds-system-term">{layer.name}</p>
                {layer.lines.map((l) => <p key={l} className="ds-system-line">{l}</p>)}
                {layer.join && <p className="ds-system-join">{layer.join}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="ds-system-link">
        <p><Chevron direction="down" size="sm" />Your tactics go into each sprint</p>
        <p><Chevron direction="up" size="sm" />Your scores and debriefs update your objectives and plan</p>
      </div>

      <section className="ds-system-box ds-system-box--sprint" aria-labelledby="ds-system-sprint">
        <h3 id="ds-system-sprint" className="ds-system-name">Performance Sprint</h3>
        <p className="ds-system-line">Where you do the work.</p>
        <p className="ds-system-line">2 to 16 weeks, 12 suggested, with Recovery between sprints.</p>
        <div className="ds-system-gap" />
        <p className="ds-system-line">Log every day.</p>
        <p className="ds-system-line">Your performance score shows how much of the week’s plan you did, weighted by impact.</p>
        <p className="ds-system-line">Your performance standard is the score that counts as a good week.</p>
        <p className="ds-system-line">For example: 85% means you completed most of your plan, not all of it.</p>
        <div className="ds-system-gap" />
        <p className="ds-system-line">At the end of each sprint, review and refine your plan, then start the next sprint or take Recovery.</p>
      </section>

      <section className="ds-system-box ds-system-box--dash" aria-labelledby="ds-system-dash">
        <h3 id="ds-system-dash" className="ds-system-name">Individual Performance Dashboard</h3>
        <p className="ds-system-line">Your performance over time.</p>
        <p className="ds-system-line">The patterns behind your best weeks, so you can repeat them.</p>
      </section>
    </div>
  );
}

export default function PerformanceSystem({ open, onClose }) {
  return (
    <Popup
      open={open}
      onClose={onClose}
      title="The Individual Performance System"
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <PerformanceSystemBody />
    </Popup>
  );
}
