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
// beside:    'words' or 'capitals' when the chevron sits beside one line of
//            text (Tim, 11 Nov, 14:36): it is then centred on that text,
//            on the middle of the x-height beside lowercase words and the
//            middle of the cap height beside capitals, by standing on the
//            text's own baseline (see .ds-chevron-line in design.css)
//            rather than in the middle of its box. Left out, it sits in
//            the middle of its own square (a button with no words).
// Always decorative: the control around it carries the words or
// aria-expanded.
export default function Chevron({ direction = 'down', size = 'md', beside = null, className = '' }) {
  const classes = ['ds-chevron', `ds-chevron--${direction}`];
  if (size === 'sm') classes.push('ds-chevron--sm');
  if (className) classes.push(className);
  const glyph = <span className={classes.join(' ')} aria-hidden="true" />;
  if (!beside) return glyph;
  return (
    <span className={`ds-chevron-line${size === 'sm' ? ' ds-chevron-line--sm' : ''}${beside === 'capitals' ? ' ds-chevron-line--caps' : ''}`} aria-hidden="true">
      <span className="ds-chevron-base">{glyph}</span>
    </span>
  );
}
