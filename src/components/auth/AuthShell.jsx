import { Children, cloneElement, isValidElement } from 'react';
import { Link } from 'react-router-dom';
import BigLogo from './BigLogo';

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
  backLabel = '<- Back',
  align = 'center', // 'left' | 'center'
  logo = false,
  headline,
  sub,
  children,
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
           44px; padding: 12px 16px !important; font-size: 14px !important; }
           at max-width: 768px (and a bare anchor carries no such rule, but the
           back control here is a real <button> when there is no backTo
           route, so it needs the same .ui-root-scoped !important override
           as every other button in this design system). */
        .ui-root .auth-back {
          display: inline-flex;
          align-items: center;
          min-height: 44px !important;
          padding: 0 !important;
          font-family: var(--font-body);
          font-size: 13px !important;
          color: var(--text-2);
          background: transparent;
          border: none;
          text-decoration: none;
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease);
        }

        .ui-root .auth-back:hover,
        .ui-root .auth-back:focus-visible {
          color: var(--text);
        }

        .ui-root .auth-back:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
        }

        .auth-mark {
          width: 28px;
          height: 28px;
          opacity: 0;
          animation: auth-mark-in var(--dur-slow) var(--ease) forwards;
        }

        @keyframes auth-mark-in {
          from { opacity: 0; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }

        .auth-step-label {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 10px;
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
          background: var(--coral);
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
          margin: 0 auto;
          box-sizing: border-box;
          padding: 28px 20px 32px;
        }

        @media (min-width: 769px) {
          .auth-column {
            padding: 24px 32px 40px;
          }
        }

        .auth-column.align-left {
          text-align: left;
        }

        .auth-column.align-center {
          text-align: center;
        }

        /* src/styles/mobile.css has h1 { font-size: 28px !important;
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
          font-size: 26px !important;
          line-height: 1.25;
          color: var(--text);
          margin: 0 !important;
        }

        @media (min-width: 769px) {
          .ui-root .auth-headline {
            font-size: 32px !important;
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
          background: var(--coral);
          margin-top: 16px;
          transform: scaleX(0);
          animation: auth-rule-draw 900ms var(--ease) 350ms forwards;
        }

        @keyframes auth-rule-draw {
          to { transform: scaleX(1); }
        }

        .auth-sub {
          font-family: var(--font-body);
          font-size: 15px;
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
        }
      `}</style>

      <div className="auth-topbar">
        {topBar === 'mark' && (
          <img className="auth-mark" src="/brand/mark_colour-on-dark.png" alt="The Clarity Project" />
        )}
        {topBar === 'back' && (
          backTo ? (
            <Link to={backTo} className="auth-back">{backLabel}</Link>
          ) : (
            <span />
          )
        )}
        {topBar === 'none' && <span />}

        {step && (
          <span className="auth-step-label">STEP {step} OF 3</span>
        )}
      </div>

      {step && (
        <div className="auth-progress">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`auth-progress-seg${n <= step ? ' done' : ''}`} />
          ))}
        </div>
      )}

      <div className="auth-content">
        <div className={`auth-column align-${align}`}>
          {logo && (
            <div className="auth-rise" style={{ marginBottom: '28px', animationDelay: '0ms' }}>
              <BigLogo />
            </div>
          )}
          {headline && (
            <h1 className="auth-headline">
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
                      const delay = 250 + letterIndex * 45;
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
          {sub && <p className="auth-sub">{sub}</p>}

          {staggeredChildren}
        </div>
      </div>
    </div>
  );
}
