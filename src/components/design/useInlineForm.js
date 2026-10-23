import { useLayoutEffect, useRef, useState } from 'react';
import useIsPhone from './useIsPhone';

// Pills or full-width answer rows (Tim, 23 Oct): measured in the real
// space, at the real text size, before the first paint and again on any
// resize, rotation, font load or text-size change, so a row of pills
// never wraps.
//
// Phone: pills sit on one line with equal-width buttons, so they fit
//        only if every pill can be as wide as the widest one, with its
//        normal padding. Otherwise, rows.
// Laptop: pills at their natural widths if they fit on one line;
//        otherwise, rows.
//
// The component renders a hidden measuring copy of the pill labels
// (each with the pill's own font and padding) into `measureRef`, inside
// `boxRef`, the space the pills must fit in.
// signature: changes whenever the labels do, so they're measured again.
export default function useInlineForm(force, signature) {
  const isPhone = useIsPhone();
  const boxRef = useRef(null);
  const measureRef = useRef(null);
  const [fits, setFits] = useState(true);

  useLayoutEffect(() => {
    if (force) return undefined;
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return undefined;

    const check = () => {
      const pills = [...measure.children];
      if (pills.length === 0) return;
      const style = getComputedStyle(measure);
      const frame = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const gap = parseFloat(style.columnGap) || 0;
      const widths = pills.map((el) => el.getBoundingClientRect().width);
      const gaps = gap * (widths.length - 1);
      const needed = isPhone
        ? Math.max(...widths) * widths.length + gaps + frame
        : widths.reduce((a, b) => a + b, 0) + gaps + frame;
      setFits(needed <= box.clientWidth + 0.5);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(box);
    observer.observe(measure);
    let cancelled = false;
    document.fonts?.ready.then(() => { if (!cancelled) check(); });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [force, isPhone, signature]);

  const form = force || (fits ? 'pills' : 'rows');
  return { form, isPhone, boxRef, measureRef };
}
