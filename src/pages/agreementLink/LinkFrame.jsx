import { BoldCrosshair, Loading, PageHeader } from '../../components/design';
import '../coach/coach.css';
import '../coaching/clientAgreement.css';

// The outside pages' frame for a quote's and a sponsor's link (Phase 6b run 3, Group C), as the booking pages draw it:
// no account, the device's light or dark, the brand line at the top. One left edge (sign-in rule 49): a page with a
// form or a list is on the column's left edge; a short message (a title or a line, at most one button and a link) is
// centred throughout (`message`).
export default function LinkFrame({ children, message = false }) {
  return (
    <div className={`ui-root cc-public cl-public${message ? ' cc-public--message' : ''}`}>
      <div className="cc-page"><div className="cc-col cl-link cl-page" data-align={message ? 'centre' : 'start'}>
        <div className="cc-public-brand"><BoldCrosshair size={22} /><span>The Clarity Project</span></div>
        {children}
      </div></div>
    </div>
  );
}

/** A calm message page: a title and one line (and at most one action). */
export function LinkMessage({ title, line, children }) {
  return (
    <LinkFrame message>
      {title && <PageHeader title={title} />}
      <p className="cl-say" role="status">{line}</p>
      {children}
    </LinkFrame>
  );
}

export function LinkLoading() {
  return <div className="ui-root cc-public"><Loading label="Loading" /></div>;
}
