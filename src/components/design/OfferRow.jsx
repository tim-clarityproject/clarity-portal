import { Button, IconButton } from './Button';
import './design.css';

// The offer row (5e rule 8b; Tim, 14 Nov, 10:14 and 10:17; drawn from M7
// version 8.2's Quick guide row, .qg): anything the portal offers but
// doesn't need is one slim row in the soft surface (18px corners, no
// border), the height of a list row (56px inside, 76px overall), as wide as
// its section. Never a big card with a sentence and a row of buttons.
//
//   Left, one button: a 44px fine-outline circle holding one icon, then the
//   action as a verb and thing (17px medium) over one quiet detail (14px
//   grey: the time as "~1 minute", or a few words).
//   Right, the way out as quiet text links: "Not now", with "Don’t show
//   this again" beside it from the second offer (never); a one-off offer
//   has a single close cross instead (oneOff).
//
// No coral: an offer is never the page's main action. On a phone, two links
// wrap to a second line, on the right, and the button keeps the first line.
// Its state (when it shows, Not now's counting) is useOffer's.
//
//   <OfferRow action="Watch the Quick guide" detail="~1 minute" onTake={…}
//             onNotNow={guide.notNow} never={guide.never} onNever={guide.stop} />

/** The icons an offer can hold, each drawn for the 44px circle (or pass a drawing as `icon`). */
const OFFER_ICONS = {
  // A filled play triangle (M7's PLAY), nudged right so it looks centred.
  play: (
    <svg className="ds-offer-icon ds-offer-icon--play" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 3v10l8-5z" />
    </svg>
  ),
};

export default function OfferRow({
  action, detail, icon = 'play', onTake, onNotNow, never = false, onNever, oneOff = false, onClose, closeLabel = 'Close', className = '',
}) {
  const drawn = typeof icon === 'string' ? OFFER_ICONS[icon] : icon;
  return (
    <div className={`ds-offer${never && !oneOff ? ' ds-offer--two' : ''} ${className}`.trim()}>
      <button type="button" className="ds-offer-take" onClick={onTake}>
        <span className="ds-offer-circle" aria-hidden="true">{drawn}</span>
        <span className="ds-offer-words">
          <b>{action}</b>
          {detail && <small>{detail}</small>}
        </span>
      </button>
      {oneOff ? (
        <IconButton label={closeLabel} onClick={onClose} className="ds-offer-close" />
      ) : (
        <span className="ds-offer-ways">
          {never && <Button variant="text" onClick={onNever}>Don’t show this again</Button>}
          <Button variant="text" onClick={onNotNow}>Not now</Button>
        </span>
      )}
    </div>
  );
}
