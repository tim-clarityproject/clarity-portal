import './design.css';

// The brand crosshair (public/brand/crosshair_white.png, used as a CSS
// mask): every plus, and turned 45° every close. Never a typed + or ×,
// never a redrawn icon, never smaller than 14px. Always decorative: the
// button around it carries the words (aria-label).
//
// variant: 'plus' (coral by default) or 'close' (grey, turned 45°).
// size:    'sm' 14px, 'close' 18px, 'md' 22px, 'lg' 28px.
// tone:    'coral' | 'grey' | 'label' | 'white' | 'dark' (on coral).
// turned:  a plus that has turned into a close (Collapsible, Filter).
// spin:    turning, for loading and saving (fades instead with reduced motion).
export default function Crosshair({
  variant = 'plus',
  size,
  tone,
  turned = false,
  spin = false,
  className = '',
}) {
  const classes = ['ds-cross'];
  if (variant === 'close') classes.push('ds-cross--close');
  if (size && size !== 'close') classes.push(`ds-cross--${size}`);
  if (tone) classes.push(`ds-cross--${tone}`);
  if (turned) classes.push('ds-cross--turned');
  if (spin) classes.push('ds-cross--spin');
  if (className) classes.push(className);
  return <span className={classes.join(' ')} aria-hidden="true" />;
}
