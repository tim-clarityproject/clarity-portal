import { Children, cloneElement, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import BigLogo from './BigLogo';
import Chevron from '../design/Chevron';

// Shared layout for every screen in the pre-login Welcome flow (log in,
// sign up, check your email, mission, finished, welcome back). Renders
// the top bar (back link or mark + step count), the 3 progress segments
// (sign-up steps only), the centred content column, and the animated
// headline/rule. Nothing here is used by any existing page - this is a
// new, opt-in layout for src/pages/auth/* only.
export default function AuthShell({
  step = null,
  topBar = 'back', // 'back' | 'mark' | 'none'
  backTo,
  backLabel = 'Back',
  align = 'center', // 'left' | 'center'
  logo = false,
  beforeHeadline, // optional node (envelope/clock/confirmed-tick-row) rendered above the headline, same slot logo uses
  columnClassName = '', // extra class(es) on .auth-column, e.g. the mock-up's "cc" (centred check-email/expired pages) or "mc" (mission)
  headline,
  sub,
  children,
  // Optional additions used by the standalone Strategic Alignment Health
  // Check (src/pages/alignment). Every one defaults to "off", so the
  // existing Welcome-flow screens render exactly as before.
  topBarContent, // node that replaces the whole top bar row (own layout)
  progress, // array of 0..1 fill amounts: replaces the 3-step progress with that many segments
  progressHidden = false, // keeps the progress row's space but hides it
  progressActions, // optional, same length as progress: null or { label, onClick } makes a segment a button (44px tall hit area)
  contentKey, // changes remount just the content (re-plays the headline reveal)
  headlineSize = 'lg', // 'lg' (26/32px) | 'md' (the title size, 22/26px)
  letterStaggerMs = 45, // delay between headline letters (lower for long text)
  footer, // node pinned below the content (sticky to the bottom of the screen)
  headlineAside, // node shown at the right of the headline row (a date); stacks under it on phone
}) {
  // Split into words (not just letters) so the headline can only wrap at
  // a space, never mid-word - each word is its own non-breaking group of
  // animated letter spans, with a normal breakable space between groups.
  const words = headline ? headline.split(' ') : [];
  let letterIndex = 0;
  let bodyIndex = 0;

  const staggeredChildren = Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    // A child that already sets its own animationDelay (e.g. Finished/
    // WelcomeBack's specific 1500ms/2200ms fade-up timings) keeps it as
    // given, instead of being overwritten by the generic 80ms stagger.
    const existingDelay = child.props.style?.animationDelay;
    const delay = existingDelay ?? `${250 + bodyIndex * 80}ms`;
    bodyIndex += 1;
    return cloneElement(child, {
      className: `auth-rise ${child.props.className || ''}`.trim(),
      style: { ...(child.props.style || {}), animationDelay: delay },
    });
  });

  return (
    <div className="ui-root auth-root">
      <style>{`
        .auth-root {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        .auth-topbar {
          height: 76px;
          padding: 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }

        @media (min-width: 769px) {
          .auth-topbar {
            height: 72px;
            padding: 0 32px;
          }
        }

        /* src/styles/mobile.css has button:not(.breathe-button) { min-height:
           44px; padding: 12px 16px !important; font-size: calc(14 * var(--u, 1px)) !important; }
           at max-width: 768px (and a bare anchor carries no such rule, but the
           back control here is a real <button> when there is no backTo
           route, so it needs the same .ui-root-scoped !important override
           as every other button in this design system). */
        .ui-root .auth-back {
          display: inline-flex;
          align-items: center;
          gap: var(--icon-gap);
          min-height: 44px !important;
          padding: 0 !important;
          font-family: var(--font-body);
          font-size: var(--fs-who) !important;
          color: var(--text-2);
          background: transparent;
          border: none;
          text-decoration: none;
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease);
        }

        /* The chevron with its words (Tim, 26 Oct): coral on hover or focus. */
        .ui-root .auth-back:hover,
        .ui-root .auth-back:focus-visible {
          color: var(--coral-text);
        }

        .ui-root .auth-back:focus-visible {
          outline: 2px solid var(--coral-text);
          outline-offset: 2px;
        }

        .auth-mark {
          width: 28px;
          height: 28px;
          opacity: 0;
          animation: auth-mark-in var(--dur-slow) var(--ease) forwards;
        }

        /* 44px tap target without shifting the visible mark (prompt 7h) -
           same technique as DesignHeader's phone logo. */
        .auth-mark-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          margin: -8px;
          border-radius: 8px;
        }

        .auth-mark-link:focus-visible {
          outline: 2px solid var(--coral-text);
          outline-offset: 2px;
        }

        @keyframes auth-mark-in {
          from { opacity: 0; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }

        .auth-step-label {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: calc(10 * var(--u, 1px));
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-2);
        }

        .auth-progress {
          display: flex;
          gap: 6px;
          padding: 0 20px;
          flex-shrink: 0;
        }

        @media (min-width: 769px) {
          .auth-progress {
            padding: 0 32px;
          }
        }

        .auth-progress-seg {
          flex: 1;
          height: 2px;
          border-radius: 2px;
          background: var(--line);
          overflow: hidden;
          position: relative;
        }

        .auth-progress-seg::after {
          content: '';
          position: absolute;
          inset: 0;
          background: var(--coral-text);
          transform: scaleX(0);
          transform-origin: left;
        }

        .auth-progress-seg.done::after {
          animation: auth-progress-draw 700ms var(--ease) forwards;
        }

        @keyframes auth-progress-draw {
          to { transform: scaleX(1); }
        }

        .auth-content {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
        }

        .auth-column {
          width: 100%;
          max-width: 420px;
          margin: 0 auto auto;
          box-sizing: border-box;
          padding: 28px 20px 32px;
        }

        @media (min-width: 769px) {
          .auth-column {
            /* Mock-up's ".col1{margin:auto}" - vertically centres the
               content on desktop (degrades to top-aligned once content
               is taller than the viewport, so long forms like Mission
               still start from the top, not mid-way down). Phone keeps
               margin: 0 auto auto (top-aligned) per the mock-up's own
               ".p .col1{margin:0 auto auto}". */
            margin: auto;
            padding: 24px 32px 40px;
          }
        }

        .auth-column.align-left {
          text-align: left;
        }

        .auth-column.align-center {
          text-align: center;
        }

        /* src/styles/mobile.css has h1 { font-size: calc(28 * var(--u-big, 1px)) !important;
           margin: 16px 0 !important; } at max-width: 768px (0,0,1
           specificity, !important). .auth-headline (0,1,0) already
           out-ranks that on specificity, but the legacy font-size and
           margin are !important, so this needs matching !important on
           both to actually win - the same fix already proven for
           .home-greeting in src/pages/Welcome.jsx. Without it this
           rendered at the legacy 28px on phone, not the mock-up's 26px. */
        .ui-root .auth-headline {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: calc(26 * var(--u-big, 1px)) !important;
          line-height: 1.25;
          color: var(--text);
          margin: 0 !important;
        }

        @media (min-width: 769px) {
          .ui-root .auth-headline {
            font-size: calc(32 * var(--u-big, 1px)) !important;
          }
        }

        .auth-headline-word {
          display: inline-block;
          white-space: nowrap;
        }

        .auth-headline-letter {
          display: inline-block;
          opacity: 0;
          filter: blur(4px);
          transform: translateY(0.45em);
          animation: auth-letter-in 700ms var(--ease) forwards;
        }

        @keyframes auth-letter-in {
          to { opacity: 1; filter: blur(0); transform: translateY(0); }
        }

        .auth-rule-wrap {
          display: flex;
        }

        .align-center .auth-rule-wrap {
          justify-content: center;
        }

        .auth-rule {
          width: 56px;
          height: 1px;
          /* No line under the headline (Tim, 23 Oct); the empty space keeps
             everything below where it was. */
          background: transparent;
          margin-top: 16px;
          transform: scaleX(0);
          animation: auth-rule-draw 900ms var(--ease) 350ms forwards;
        }

        @keyframes auth-rule-draw {
          to { transform: scaleX(1); }
        }

        .auth-sub {
          font-family: var(--font-body);
          font-size: calc(15 * var(--u, 1px));
          line-height: 1.5;
          color: var(--text-2);
          margin: 12px 0 0;
        }

        .auth-rise {
          opacity: 0;
          transform: translateY(10px);
          animation: auth-rise-in var(--dur-slow) var(--ease) forwards;
        }

        @keyframes auth-rise-in {
          to { opacity: 1; transform: none; }
        }

        .auth-progress-slot {
          flex: 1;
          position: relative;
          min-width: 0;
        }

        .auth-progress-slot .auth-progress-seg {
          width: 100%;
        }

        /* An invisible 44px-high hit area over the 2px line. mobile.css puts
           padding/min-height with !important on every button at phone width. */
        .ui-root .auth-progress-hit {
          position: absolute;
          left: 0;
          right: 0;
          top: 50%;
          height: 44px;
          min-height: 44px !important;
          margin: 0;
          padding: 0 !important;
          transform: translateY(-50%);
          background: transparent;
          border: 0;
          cursor: pointer;
        }

        .ui-root .auth-progress-hit:focus-visible {
          outline: 2px solid var(--coral-text);
          outline-offset: -2px;
          border-radius: 4px;
        }

        .auth-progress--hidden {
          opacity: 0;
        }

        .auth-progress-seg--fill::after {
          transform: scaleX(var(--fill, 0));
          transition: transform var(--dur-slow) var(--ease);
        }

        /* The title size (22px phone, 26px desktop) for screens whose
           heading is a page title rather than a greeting. Same
           !important reasoning as .auth-headline above. */
        .ui-root .auth-headline.auth-headline--md {
          font-size: var(--fs-title-phone) !important;
        }

        @media (min-width: 769px) {
          .ui-root .auth-headline.auth-headline--md {
            font-size: var(--fs-title-desktop) !important;
          }
        }

        .auth-headline-row {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-3);
        }

        .auth-headline-aside {
          font-size: var(--fs-small);
          color: var(--label);
        }

        .auth-footer {
          position: sticky;
          bottom: 0;
          z-index: 2;
          flex-shrink: 0;
          background: var(--bg);
          border-top: 1px solid var(--line);
        }

        /* Reduced motion: every bespoke animation in the auth flow turns
           off and content shows in its final, visible state immediately -
           nothing stays hidden waiting for an animation that will never
           run. Scoped under .ui-root, matching rule 10 in CLAUDE.md. */
        @media (prefers-reduced-motion: reduce) {
          .ui-root .auth-mark,
          .ui-root .auth-progress-seg::after,
          .ui-root .auth-headline-letter,
          .ui-root .auth-rule,
          .ui-root .auth-rise {
            animation: none !important;
            opacity: 1 !important;
            filter: none !important;
            transform: none !important;
          }

          /* Fractional progress is a value, not an animation: keep it. */
          .ui-root .auth-progress-seg--fill::after {
            transform: scaleX(var(--fill, 0)) !important;
            transition: none;
          }
        }
      `}</style>

      <div className="auth-topbar">
        {topBarContent}
        {!topBarContent && topBar === 'mark' && (
          // Pre-login: no signed-in Home to return to, so this goes back
          // to the sign-in start (prompt 7h) - not currently reached by
          // any page (none pass topBar="mark" today), fixed for when one
          // does rather than leaving a second dead copy of the mark.
          <Link to="/auth/login" className="auth-mark-link" aria-label="Home">
            <img className="auth-mark" src="/brand/mark_colour-on-dark.png" alt="" />
          </Link>
        )}
        {!topBarContent && topBar === 'back' && (
          backTo ? (
            <Link to={backTo} className="auth-back">
              <Chevron direction="left" size="sm" />
              <span>{backLabel}</span>
            </Link>
          ) : (
            <span />
          )
        )}
        {!topBarContent && topBar === 'none' && <span />}

        {!topBarContent && step && (
          <span className="auth-step-label">STEP {step} OF 3</span>
        )}
      </div>

      {progress && (
        <div className={`auth-progress${progressHidden ? ' auth-progress--hidden' : ''}`}>
          {progress.map((fill, n) => {
            const action = progressActions?.[n];
            return (
              <div key={n} className="auth-progress-slot">
                <div className="auth-progress-seg auth-progress-seg--fill" style={{ '--fill': fill }} />
                {action && !progressHidden && (
                  <button type="button" className="auth-progress-hit" aria-label={action.label} onClick={action.onClick} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {step && (
        <div className="auth-progress">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`auth-progress-seg${n <= step ? ' done' : ''}`} />
          ))}
        </div>
      )}

      <div className="auth-content" key={contentKey}>
        <div className={`auth-column align-${align} ${columnClassName}`.trim()}>
          {logo && (
            <div className="auth-rise" style={{ marginBottom: '28px', animationDelay: '0ms' }}>
              <BigLogo />
            </div>
          )}
          {beforeHeadline && (
            <div className="auth-rise" style={{ animationDelay: '0ms' }}>
              {beforeHeadline}
            </div>
          )}
          {headline && headlineAside ? (
            <div className="auth-headline-row">
              <div>
          {headline && (
                <h1 className={`auth-headline${headlineSize === 'md' ? ' auth-headline--md' : ''}`}>
                  {words.map((word, wi) => (
                    // The space between words is a separate sibling node, OUTSIDE
                    // the nowrap word span - a trailing space INSIDE a
                    // white-space:nowrap inline-block still gets collapsed away
                    // by the browser (nowrap stops wrapping, it doesn't stop
                    // whitespace collapsing), which silently ate the gap between
                    // words until this was split out.
                    <span key={wi}>
                      <span className="auth-headline-word">
                        {word.split('').map((char) => {
                          const delay = 250 + letterIndex * letterStaggerMs;
                          letterIndex += 1;
                          return (
                            <span
                              key={letterIndex}
                              className="auth-headline-letter"
                              style={{ animationDelay: `${delay}ms` }}
                            >
                              {char}
                            </span>
                          );
                        })}
                      </span>
                      {wi < words.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </h1>
              )}
              {headline && (
                <div className="auth-rule-wrap">
                  <div className="auth-rule" />
                </div>
              )}
                  </div>
              <div className="auth-headline-aside">{headlineAside}</div>
            </div>
          ) : (
            <>
          {headline && (
            <h1 className={`auth-headline${headlineSize === 'md' ? ' auth-headline--md' : ''}`}>
              {words.map((word, wi) => (
                // The space between words is a separate sibling node, OUTSIDE
                // the nowrap word span - a trailing space INSIDE a
                // white-space:nowrap inline-block still gets collapsed away
                // by the browser (nowrap stops wrapping, it doesn't stop
                // whitespace collapsing), which silently ate the gap between
                // words until this was split out.
                <span key={wi}>
                  <span className="auth-headline-word">
                    {word.split('').map((char) => {
                      const delay = 250 + letterIndex * letterStaggerMs;
                      letterIndex += 1;
                      return (
                        <span
                          key={letterIndex}
                          className="auth-headline-letter"
                          style={{ animationDelay: `${delay}ms` }}
                        >
                          {char}
                        </span>
                      );
                    })}
                  </span>
                  {wi < words.length - 1 ? ' ' : ''}
                </span>
              ))}
            </h1>
          )}
          {headline && (
            <div className="auth-rule-wrap">
              <div className="auth-rule" />
            </div>
          )}
            </>
          )}
          {sub && <p className="auth-sub">{sub}</p>}

          {staggeredChildren}
        </div>
      </div>

      {footer && <div className="auth-footer">{footer}</div>}
    </div>
  );
}
