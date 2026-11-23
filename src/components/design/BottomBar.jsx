import { useLayoutEffect, useRef } from 'react';
import { toastReaches } from './toastAbove';
import { useHidePhoneBar } from './phoneBar';
import './design.css';

// A page's own bottom bar (M7's results: "Download my PDF"), the same bar as
// a guided tool's (rule 29o: it shows only when the screen has a button):
// a line above, the page's colour behind, the button at the right of the
// page's column, full width under the thumb on a phone. While it shows, the
// phone bar steps back (M7) and the Breathe pill rises above it; the page
// keeps its last line clear of it (--bottom-bar-h). Where its button runs
// under the middle of the screen (a phone), toasts rise to 16px above it, as
// a guided tool's do (GuidedTool; follow-up 1: a toast never sits on it).
export default function BottomBar({ children, className = '' }) {
  const ref = useRef(null);
  useHidePhoneBar(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const before = root.style.getPropertyValue('--ds-toast-offset');
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      root.style.setProperty('--bottom-bar-h', `${h}px`);
      if (toastReaches(el)) root.style.setProperty('--ds-toast-offset', `${Math.max(0, Math.round(h) - 16)}px`);
      else if (before) root.style.setProperty('--ds-toast-offset', before);
      else root.style.removeProperty('--ds-toast-offset');
    };
    measure();
    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--bottom-bar-h');
      if (before) root.style.setProperty('--ds-toast-offset', before);
      else root.style.removeProperty('--ds-toast-offset');
    };
  }, []);
  return (
    <div ref={ref} className={`ds-bottombar no-print ${className}`.trim()}>
      <div className="ds-bottombar-in">{children}</div>
    </div>
  );
}
