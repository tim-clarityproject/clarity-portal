import { useId, useRef, useState } from 'react';
import InfoPop from './InfoPop';
import LineIcon from './LineIcon';
import './design.css';

// Two small icons beside a title (Tim, 14 Nov, 09:28; M7b version 51 and M7
// version 8.2; replaces rule 29d's 28px): 12px from the title's last letter
// to the first icon, then 16px between the two, visible edge to visible
// edge. The order is play, then the eye, with at most two together, each
// centred on the capitals. Each keeps a 44px-tall tap area; where the two
// would overlap, the second takes the shared strip, so the first is 32px
// wide and no two tap areas ever overlap.
//
//   <PageHeader title="…" aside={<TitleIcons><PlayButton onClick={…} /><WhoSees … /></TitleIcons>} />
//   a guided step: eye: <TitleIcons>…</TitleIcons>
//
// One icon alone needs no wrapper.
export default function TitleIcons({ children }) {
  return <span className="ds-title-icons">{children}</span>;
}

// The play icon (the one icon set): opens a Quick guide or a short video on
// a click or tap only. Pointing at it shows its words in the standard
// pop-up, and screen readers hear the same.
export function PlayButton({ label = 'Quick guide', onClick }) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [hover, setHover] = useState(false);
  const popId = useId();
  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="ds-who ds-who--eye ds-play"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => { setHover(false); onClick?.(); }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(true); }}
        onPointerLeave={() => setHover(false)}
      >
        <span className="ds-who-eye" aria-hidden="true"><LineIcon name="play" /></span>
      </button>
      <InfoPop id={popId} open={hover} anchorRef={buttonRef} panelRef={panelRef} lines={[label]} />
    </>
  );
}
