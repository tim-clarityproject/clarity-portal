import { forwardRef } from 'react';
import './design.css';
import LineIcon from './LineIcon';

// Icons with words, one standard (Tim, 26 Oct; design reference v15):
// the eye (who can see this), the "i" (learn more) and any other small
// icon beside words.
// - Words in DM Sans 14px, in the secondary grey.
// - The icon in a 16px square drawn with 1.5px lines, in the colour of
//   its words, 6px from them (measured to the icon's visible edge), and
//   centred on the middle of the capital letters.
// - A tappable one looks the same at rest, turns coral on hover or
//   keyboard focus, and has a 44px tap area.
// Items on one line sit 20px apart in an IconTextRow, never with a dot
// between them.
//
// icon:    the icon (an <svg> or InfoIcon), drawn before the words.
// onClick: makes it a button.
export const IconText = forwardRef(function IconText(
  { icon, children, onClick, className = '', ...rest },
  ref,
) {
  const classes = ['ds-iconword'];
  if (onClick) classes.push('ds-iconword--tap');
  if (className) classes.push(className);
  if (onClick) {
    return (
      <button ref={ref} type="button" className={classes.join(' ')} onClick={onClick} {...rest}>
        <span className="ds-iconword-icon" aria-hidden="true">{icon}</span>
        <span className="ds-iconword-text">{children}</span>
      </button>
    );
  }
  return (
    <span ref={ref} className={classes.join(' ')} {...rest}>
      <span className="ds-iconword-icon" aria-hidden="true">{icon}</span>
      <span className="ds-iconword-text">{children}</span>
    </span>
  );
});

export function IconTextRow({ children, className = '' }) {
  return <div className={`ds-iconwords ${className}`.trim()}>{children}</div>;
}

// The eye: only ever means who can see this. From the one icon set.
export function EyeIcon() {
  return <LineIcon name="eye" className="ds-eye" />;
}
