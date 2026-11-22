import { useLayoutEffect } from 'react';

// A bar fixed at the foot of the screen that isn't a BottomBar or a guided
// tool's (the coach's Clients select-several bar, .cc-bulk): while it shows,
// toasts rise to 16px above its top, so a toast never covers its buttons
// (tidy pass item 2; BottomBar and GuidedTool do the same for theirs). The
// toast region sits max(safe area, 16px) + 16px up from the bottom, plus
// --ds-toast-offset; the offset here clears the bar's top by at least 16px.
// What the page had before comes back when the bar goes.
export function toastOffsetFor(viewportHeight, barTop) {
  return Math.max(0, Math.round(viewportHeight - barTop - 16));
}

export function useToastAbove(ref, active = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    const root = document.documentElement;
    const before = root.style.getPropertyValue('--ds-toast-offset');
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (!r.height) return;
      root.style.setProperty('--ds-toast-offset', `${toastOffsetFor(window.innerHeight, r.top)}px`);
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
      if (before) root.style.setProperty('--ds-toast-offset', before);
      else root.style.removeProperty('--ds-toast-offset');
    };
  }, [ref, active]);
}
