import { forwardRef } from 'react';
import Crosshair from './Crosshair';
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

// "How the system fits together", with its small circled i. Used in the
// page header's meta line and in empty states.
export function SystemLink({ children = 'How the system fits together', className = '', ...rest }) {
  return (
    <button type="button" className={`ds-info-link ${className}`.trim()} {...rest}>
      <span className="ds-info" aria-hidden="true">i</span>
      {children}
    </button>
  );
}
