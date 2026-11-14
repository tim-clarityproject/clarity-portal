import { useLayoutEffect, useRef } from 'react';
import { useHidePhoneBar } from './phoneBar';
import './design.css';

// A page's own bottom bar (M7's results: "Download my PDF"), the same bar as
// a guided tool's (rule 29o: it shows only when the screen has a button):
// a line above, the page's colour behind, the button at the right of the
// page's column, full width under the thumb on a phone. While it shows, the
// phone bar steps back (M7) and the Breathe pill rises above it; the page
// keeps its last line clear of it (--bottom-bar-h).
export default function BottomBar({ children, className = '' }) {
  const ref = useRef(null);
  useHidePhoneBar(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const measure = () => root.style.setProperty('--bottom-bar-h', `${el.getBoundingClientRect().height}px`);
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
    };
  }, []);
  return (
    <div ref={ref} className={`ds-bottombar no-print ${className}`.trim()}>
      <div className="ds-bottombar-in">{children}</div>
    </div>
  );
}
