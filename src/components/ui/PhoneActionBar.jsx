import { useLayoutEffect, useRef } from 'react';

// Shared fixed Finish/Save-as-draft bar for phone, sitting just above
// DesignTabBar. Reused by every build-a-form prompt from here on (6-11),
// not just planning tools - a className/CSS class only (not inline
// position:fixed) because src/styles/mobile.css forces left/right:16px
// on any div with "position: fixed" literally inside its inline style
// attribute (see DesignHeader.jsx's .design-scrim for the same issue).
// bottom: var(--tabbar-height) only, no extra safe-area add-on - DesignTabBar
// already measures its own rendered height (padding, safe-area inset and
// all) into --tabbar-height, so adding the inset again here would double it.
// Rendered in-tree (not a portal) inside the page's own .ui-root, so unlike
// Toast/DiscardDialog it needs no .ui-root wrapper of its own.
//
// Measured with a ResizeObserver, not just on mount + window resize -
// this bar is rendered unconditionally (no async gate like Mission.jsx
// had), so a plain one-shot measure on mount is safe here, but its
// rendered height can still change later without the window itself
// resizing (the web font finishing loading, or button text wrapping
// differently) - a ResizeObserver catches that; a prompt-4e audit found
// and fixed the same one-shot gap on Mission.jsx's save bar.
export default function PhoneActionBar({ children }) {
  const barRef = useRef(null);

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;

    const measure = () => {
      document.documentElement.style.setProperty('--action-bar-height', `${el.getBoundingClientRect().height}px`);
    };
    measure();

    window.addEventListener('resize', measure);
    document.fonts?.ready?.then(measure);

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }

    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={barRef} className="ui-phone-action-bar">
      {children}
    </div>
  );
}
