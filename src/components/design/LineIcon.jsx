import './design.css';
import { LINE_ICONS } from './lineIconDrawings';

// One icon set (Tim, 27 Oct, 23:48; mock-up M7b version 26's ICON drawings):
// the eye (who can see this), the "i" and the Quick guide play icon. A 16px
// box with every outer shape 14px across on the same centre, 1.5px lines
// with round ends and corners, outlines only (the i's dot is the one fill,
// 2px across), drawn as inline SVG in the colour of its words. Every eye, i
// and play icon in the new portal is drawn from here.

export { LINE_ICONS };

/** @param {{ name: 'eye'|'info'|'play', className?: string }} props */
export default function LineIcon({ name, className = '' }) {
  return (
    <svg className={`ds-icon ${className}`.trim()} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {LINE_ICONS[name]}
    </svg>
  );
}
