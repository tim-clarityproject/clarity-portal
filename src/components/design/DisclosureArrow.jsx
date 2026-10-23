import './design.css';

// The arrow on anything that opens a list or a folded section (Tim,
// 23 Oct): drop-downs, folds and expandable rows. The standard crosshair
// is only for add and, turned 45°, close.
//
// One half of the standard crosshair, from the same mask image (never a
// redrawn arrow), with its corner pointing down; it turns to point up
// while open. Always decorative: the control around it keeps aria-expanded.
export default function DisclosureArrow({ open = false, className = '' }) {
  const classes = ['ds-arrow'];
  if (open) classes.push('ds-arrow--open');
  if (className) classes.push(className);
  return <span className={classes.join(' ')} aria-hidden="true" />;
}
