// Shared footer Discard/Back links. Real <button> elements, so their
// classes get the `.ui-root` ancestor prefix in components.css to beat
// src/styles/mobile.css's `button:not(.breathe-button)` (0,1,1,
// !important) on font-size/padding - see the comment there.
import { Link } from 'react-router-dom';
import Chevron from '../design/Chevron';

function BinIcon() {
  return (
    <svg
      className="ui-discard-link-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
    </svg>
  );
}

// Back: the one chevron, turned to point left (Tim, 26 Oct).
function ArrowLeftIcon() {
  return <Chevron direction="left" size="sm" beside="words" className="ui-back-link-icon" />;
}

export function DiscardLink({ onClick, label = 'Discard', ...props }) {
  return (
    <button type="button" className="ui-discard-link" onClick={onClick} {...props}>
      <BinIcon />
      <span className="ui-discard-link-label">{label}</span>
    </button>
  );
}

// Back (rule 29t): the chevron's visible edge on the content's left edge,
// --back-gap (10px, Tim, 18 Nov, follow-up 1) before its words. With \`to\`
// it is a link to that address (the legal pages' Back to sign-in), drawn
// the same.
export function BackLink({ onClick, label = 'Back', to, ...props }) {
  if (to) {
    return (
      <Link to={to} className="ui-back-link" {...props}>
        <ArrowLeftIcon />
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" className="ui-back-link" onClick={onClick} {...props}>
      <ArrowLeftIcon />
      <span>{label}</span>
    </button>
  );
}

export function DiscardFooter({
  onBack,
  backLabel = 'Back',
  onDiscard,
  discardLabel = 'Discard',
  backProps,
  discardProps,
}) {
  return (
    <div className="ui-discard-footer">
      <div className="ui-discard-footer-left">
        {onBack ? <BackLink onClick={onBack} label={backLabel} {...backProps} /> : null}
      </div>
      <DiscardLink onClick={onDiscard} label={discardLabel} {...discardProps} />
    </div>
  );
}
