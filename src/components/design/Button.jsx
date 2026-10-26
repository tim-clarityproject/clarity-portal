import { forwardRef } from 'react';
import Crosshair from './Crosshair';
import InfoIcon from './InfoIcon';
import { IconText } from './IconText';
import './design.css';

// Buttons (design reference: Buttons). Nekst capitals, labels are verb
// plus object ("Log today", "Add a to-do"), never Open, Go, Submit or
// Continue on their own.
//
// variant 'primary': flat coral, ONE per screen, for the thing most
//                    people come to do.
// variant 'outline': everything else (brand grey #3C3C3B outline).
// variant 'text':    a text link, for minor actions.
// icon 'plus':       the crosshair before the label ("Add a to-do").
export const Button = forwardRef(function Button(
  { variant = 'outline', icon, children, className = '', type = 'button', ...rest },
  ref,
) {
  const base = variant === 'text' ? 'ds-link' : `ds-btn ds-btn--${variant}`;
  return (
    <button ref={ref} type={type} className={`${base} ${className}`.trim()} {...rest}>
      {icon === 'plus' && <Crosshair tone={variant === 'primary' ? 'dark' : undefined} />}
      {children}
    </button>
  );
});

// The one add button (Tim, 26 Oct, 16:54): every button that adds
// something looks the same. An outlined pill, the brand crosshair in the
// text colour (not coral), words that say what it adds ("Add objective",
// "Add agenda item", "Add a to-do", "Add another"), coral only on hover
// or keyboard focus, and full width on a phone.
export const AddButton = forwardRef(function AddButton(
  { children, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`ds-btn ds-btn--outline ds-add ${className}`.trim()} {...rest}>
      <Crosshair />
      {children}
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
      {children}
    </IconText>
  );
}
