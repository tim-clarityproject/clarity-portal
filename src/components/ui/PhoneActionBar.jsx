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
export default function PhoneActionBar({ children }) {
  const barRef = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (barRef.current) {
        const height = barRef.current.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--action-bar-height', `${height}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div ref={barRef} className="ui-phone-action-bar">
      {children}
    </div>
  );
}
