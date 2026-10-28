import './design.css';

// One icon set (Tim, 27 Oct, 23:48; mock-up M7b version 26's ICON drawings):
// the eye (who can see this), the "i" and the Quick guide play icon. A 16px
// box with every outer shape 14px across on the same centre, 1.5px lines
// with round ends and corners, outlines only (the i's dot is the one fill,
// 2px across), drawn as inline SVG in the colour of its words. Every eye, i
// and play icon in the new portal is drawn from here.

export const LINE_ICONS = {
  eye: (
    <>
      <path d="M1 8C2.6 4.9 5.1 3.5 8 3.5S13.4 4.9 15 8C13.4 11.1 10.9 12.5 8 12.5S2.6 11.1 1 8Z" />
      <circle cx="8" cy="8" r="2.25" />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="7" />
      <circle className="f" cx="8" cy="4.75" r="1" />
      <path d="M8 7.25V11.25" />
    </>
  ),
  play: (
    <>
      <circle cx="8" cy="8" r="7" />
      <path d="M6.6 5.3V10.7L10.9 8Z" />
    </>
  ),
};

/** @param {{ name: 'eye'|'info'|'play', className?: string }} props */
export default function LineIcon({ name, className = '' }) {
  return (
    <svg className={`ds-icon ${className}`.trim()} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {LINE_ICONS[name]}
    </svg>
  );
}
