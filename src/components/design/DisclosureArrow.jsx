import Chevron from './Chevron';

// The chevron on anything that opens a list or a folded section (Tim,
// 23 Oct): drop-downs, folds and expandable rows. It points down, and
// turns to point up while open. The shared Chevron, with the turn
// animated between the two.
// beside: 'words' (the default: it is centred on the lowercase words it sits
//         beside), 'capitals' (beside a name in capitals) or null (a button
//         with no words on its row).
export default function DisclosureArrow({ open = false, beside = 'words', className = '' }) {
  const classes = ['ds-arrow'];
  if (open) classes.push('ds-arrow--open');
  if (className) classes.push(className);
  return <Chevron direction={open ? 'up' : 'down'} beside={beside} className={classes.join(' ')} />;
}
