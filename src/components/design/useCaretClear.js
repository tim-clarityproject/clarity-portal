import { useEffect } from 'react';

// Keeps the line being typed just above the keyboard (decisions: "Typing
// must never jump"). It only acts when the box gets focus and when the
// visible area changes (the keyboard opening or closing, the phone
// rotating), and then only if the caret's line is actually hidden: one
// quiet scroll, never on each keystroke. While typing, the browser keeps
// the caret in view by itself, and the box never shrinks and re-measures,
// so nothing fights it.

const MIRROR_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'tabSize',
  'whiteSpace', 'overflowWrap', 'wordBreak'];

// Where the caret's line is, inside the box (a box that has grown to fit
// its text has no scroll of its own to ask).
function caretOffset(el) {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement('div');
  MIRROR_PROPS.forEach((p) => { mirror.style[p] = style[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.width = `${el.offsetWidth}px`;
  mirror.textContent = el.value.slice(0, el.selectionEnd ?? el.value.length);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const height = marker.offsetHeight || parseFloat(style.lineHeight) || 24;
  document.body.removeChild(mirror);
  return { top, height };
}

// The scroller to move: the nearest scrolling box, or the page.
function scrollerOf(el) {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

export function keepCaretClear(el) {
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const { top, height } = caretOffset(el);
  const rect = el.getBoundingClientRect();
  const lineTop = rect.top + top;
  const lineBottom = lineTop + height;
  const margin = height;   // one clear line above the keyboard
  let by = 0;
  if (lineBottom > viewBottom - margin) by = lineBottom - (viewBottom - margin);
  else if (lineTop < viewTop) by = lineTop - viewTop - margin;
  if (Math.abs(by) < 1) return;
  const scroller = scrollerOf(el);
  if (scroller) scroller.scrollTop += by;
  else window.scrollBy({ top: by, left: 0, behavior: 'instant' });
}

export default function useCaretClear(ref, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement === el) keepCaretClear(el);
      });
    };
    const vv = window.visualViewport;
    const start = () => {
      vv?.addEventListener('resize', check);
      window.addEventListener('orientationchange', check);
      check();
    };
    const stop = () => {
      vv?.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
    el.addEventListener('focus', start);
    el.addEventListener('blur', stop);
    if (document.activeElement === el) start();
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('focus', start);
      el.removeEventListener('blur', stop);
      stop();
    };
  }, [ref, enabled]);
}
