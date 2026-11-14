import BoldCrosshair from './BoldCrosshair';
import './design.css';

// Guest pages (M9 "Guest start" and "Guest end"; Tim, 21 Oct and 13 Nov,
// 09:36): a tool used without an account, through a coach's link. They
// share the outside Health Check's frame: the bold crosshair alone,
// centred at the top, with no menu, no Mission and no Breathe.
//
//   <GuestFrame>                 the page: the crosshair bar, then a column
//     <GuestTitle>Get unstuck</GuestTitle>    the start page's one title
//     …
//   </GuestFrame>
//
// narrow (the default) keeps the column at M9's 460px; narrow="wide" at
// M7b's 560px (the Health Check's welcome).
// markHref, markLabel: the crosshair is a link (M7b: to the website, in a
//   new tab).
// footer: a bottom bar for the page's one button (M7b's results:
//   "Download my PDF"), lined up with the column, as a guided tool's.
// CalmCard: the calm card at the foot of a guest's end page (design
// reference, Calm pages): one sentence, a quieter one under it, then one
// outlined button.
export function GuestMark({ href, label }) {
  if (!href) return <BoldCrosshair size={28} />;
  return (
    <a className="ds-guest-mark" href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
      <BoldCrosshair size={28} />
    </a>
  );
}

export function GuestFrame({ children, narrow = true, className = '', markHref, markLabel, footer = null }) {
  return (
    <div className={`ds-guest ${className}`.trim()}>
      <div className="ds-guest-top"><GuestMark href={markHref} label={markLabel} /></div>
      <main className="ds-guest-main">
        <div className={`ds-guest-col${narrow ? ' ds-guest-col--narrow' : ''}${narrow === 'wide' ? ' ds-guest-col--narrow-wide' : ''}`}>{children}</div>
      </main>
      {footer && <div className="ds-guest-foot"><div className="ds-guest-foot-in">{footer}</div></div>}
    </div>
  );
}

export function GuestTitle({ children, headingRef }) {
  return <h1 ref={headingRef} tabIndex={-1} className="ds-guest-title">{children}</h1>;
}

export function CalmCard({ line, sub, children }) {
  return (
    <div className="ds-calm-card">
      <p>{line}</p>
      {sub && <p className="ds-calm-card-sub">{sub}</p>}
      {children && <div className="ds-calm-card-action">{children}</div>}
    </div>
  );
}
