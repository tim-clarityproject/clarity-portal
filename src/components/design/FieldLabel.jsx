import WhoSees from './WhoSees';
import './design.css';

// The label row above a box (M6), one shared part for every box: the
// question on the left and, for anything personal, the who-sees eye
// label on the right. With no question it is just the who-sees label, at
// the right.
//
// label:    the question ("What needs doing?").
// id:       for aria-labelledby; htmlFor: makes it a <label>.
// who:      'me' | 'coach' | 'team' for the who-sees label, or leave it out.
// coachName: passed to the who-sees label (or comes from CoachContext).
export default function FieldLabel({ label, id, htmlFor, who, coachName }) {
  if (!label && !who) return null;
  const Tag = htmlFor ? 'label' : 'span';
  return (
    <div className={`ds-label-row${label ? '' : ' ds-label-row--solo'}`}>
      {label && <Tag id={id} htmlFor={htmlFor} className="ds-label-row-text">{label}</Tag>}
      {who && <WhoSees audience={who} coachName={coachName} />}
    </div>
  );
}
