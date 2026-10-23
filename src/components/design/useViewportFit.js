import { useLayoutEffect } from 'react';

// Sizes a full-screen layer to the visible space (the visual viewport),
// so on a phone it fits above the keyboard and follows it as it opens
// and closes and as the phone rotates. Sets --vv-top and --vv-height on
// the element; its CSS uses them for top and height.
export default function useViewportFit(ref, active) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    const vv = window.visualViewport;
    const fit = () => {
      el.style.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
      el.style.setProperty('--vv-height', `${vv ? vv.height : window.innerHeight}px`);
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, [ref, active]);
}
