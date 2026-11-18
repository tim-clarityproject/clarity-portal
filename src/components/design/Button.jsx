import { forwardRef } from 'react';
import keepWords from './keepWords';
import Crosshair from './Crosshair';
import InfoIcon from './InfoIcon';
import { IconText } from './IconText';
import './design.css';

// Buttons (design reference: Buttons; Quiet precision, Tim, 18 Nov): DM
// Sans 14px in sentence case, 34px high (40px on a phone) with a 44px tap
// area, 8px corners; the look is in src/styles/buttons.css. Labels are
// verb plus object ("Log today", "Save my win"), never Open, Go, Submit or
// Continue on their own.
//
// variant 'primary': flat coral, ONE per screen, for the thing most
//                    people come to do.
// variant 'outline': everything else (no fill, a hairline in the outline
//                    grey).
// variant 'text':    a text link, for minor actions.
export const Button = forwardRef(function Button(
  // eslint-disable-next-line no-unused-vars
  { variant = 'outline', icon, children, className = '', type = 'button', ...rest },
  ref,
) {
  const base = variant === 'text' ? 'ds-link' : `ds-btn ds-btn--${variant}`;
  return (
    <button ref={ref} type={type} className={`${base} ${className}`.trim()} {...rest}>
      {keepWords(children)}
    </button>
  );
});

// The add row (Tim, 18 Nov 2026; replaces the outlined add pill of 26 Oct
// and 5 Nov). Every Add that starts a new item at the end of a list ("Add
// a to-do", "Add an objective", "Add another thought") is this row: the
// list's full width, at least 48px high, a 12px coral cross in an 18px
// square, then the words in the secondary grey, turning the text colour on
// hover and keyboard focus. No box and no outline. An Add that saves or
// sends ("Add my to-do", "Add to this week") is a Button, never this row.
// The cross is drawn here, never the brand crosshair (which only closes).
export const AddButton = forwardRef(function AddButton(
  { children, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`ds-addrow ${className}`.trim()} {...rest}>
      <span className="ds-addrow-mark" aria-hidden="true" />
      <span className="ds-addrow-words">{keepWords(children)}</span>
    </button>
  );
});

// A 44px round button holding only a crosshair. `label` is required: it
// is what a screen reader says ("Close", "Add a to-do").
export const IconButton = forwardRef(function IconButton(
  { label, icon = 'close', className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`ds-icon-btn ${className}`.trim()}
      aria-label={label}
      {...rest}
    >
      <Crosshair variant={icon === 'close' ? 'close' : 'plus'} />
    </button>
  );
});

// "How the system fits together": the "i" then its words, in the
// icon-with-words standard (Tim, 26 Oct; design reference v15). Used in
// the page header's meta line and in empty states.
export function SystemLink({ children = 'How the system fits together', className = '', ...rest }) {
  return (
    <IconText icon={<InfoIcon />} className={`ds-info-link ${className}`.trim()} {...rest}>
      {keepWords(children)}
    </IconText>
  );
}
