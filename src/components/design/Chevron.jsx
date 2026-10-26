import './design.css';

// The one chevron (Tim, 26 Oct): back, open, close and drop-down chevrons
// are all the corner of the brand crosshair, only turned. No other arrow,
// chevron or caret is drawn anywhere in the portal.
//
// One corner of the standard crosshair, from the same mask image (never
// redrawn), clipped so only the corner and its two arms are left, then
// turned to point where it should. The small shift keeps the corner
// centred in its square whichever way it points.
//
// direction: 'down' (a closed drop-down or fold), 'up' (open), 'left'
//            (back, previous) or 'right' (next, goes somewhere).
// size:      'md' (18px, drop-downs and folds) or 'sm' (16px, beside
//            words, like a back link).
// Always decorative: the control around it carries the words or
// aria-expanded.
export default function Chevron({ direction = 'down', size = 'md', className = '' }) {
  const classes = ['ds-chevron', `ds-chevron--${direction}`];
  if (size === 'sm') classes.push('ds-chevron--sm');
  if (className) classes.push(className);
  return <span className={classes.join(' ')} aria-hidden="true" />;
}
