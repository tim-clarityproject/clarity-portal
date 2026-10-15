// Shared footer Discard/Back links. Real <button> elements, so their
// classes get the `.ui-root` ancestor prefix in components.css to beat
// src/styles/mobile.css's `button:not(.breathe-button)` (0,1,1,
// !important) on font-size/padding - see the comment there.

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

function ArrowLeftIcon() {
  return (
    <svg
      className="ui-back-link-icon"
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
      <path d="M12.5 8h-9M7 3.5 2.5 8l4.5 4.5" />
    </svg>
  );
}

export function DiscardLink({ onClick, label = 'Discard', ...props }) {
  return (
    <button type="button" className="ui-discard-link" onClick={onClick} {...props}>
      <BinIcon />
      <span className="ui-discard-link-label">{label}</span>
    </button>
  );
}

export function BackLink({ onClick, label = 'Back', ...props }) {
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
