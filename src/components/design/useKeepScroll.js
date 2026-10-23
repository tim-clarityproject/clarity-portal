import { useEffect } from 'react';

// Panels never jump (Tim, 23 Oct): when the screen changes size (the
// phone turns, the keyboard opens), a scrolling panel keeps its place.
// Some browsers reset it while relaying out, so the place last scrolled
// to by the person is put back once the size has settled.
const SETTLE_MS = 350;

export default function useKeepScroll(ref, active) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    let kept = el.scrollTop;
    let resizingUntil = 0;
    let timer = 0;
    const onScroll = () => {
      if (Date.now() > resizingUntil) kept = el.scrollTop;
    };
    const onResize = () => {
      resizingUntil = Date.now() + SETTLE_MS;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const max = el.scrollHeight - el.clientHeight;
        const target = Math.min(kept, Math.max(0, max));
        if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target;
        kept = el.scrollTop;
      }, SETTLE_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [ref, active]);
}
