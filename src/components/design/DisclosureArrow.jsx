import Chevron from './Chevron';

// The chevron on anything that opens a list or a folded section (Tim,
// 23 Oct): drop-downs, folds and expandable rows. It points down, and
// turns to point up while open. The shared Chevron, with the turn
// animated between the two.
export default function DisclosureArrow({ open = false, className = '' }) {
  const classes = ['ds-arrow'];
  if (open) classes.push('ds-arrow--open');
  if (className) classes.push(className);
  return <Chevron direction={open ? 'up' : 'down'} className={classes.join(' ')} />;
}
