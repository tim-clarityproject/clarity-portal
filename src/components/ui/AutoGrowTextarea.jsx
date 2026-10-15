import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';

// Shared free-text field (CLAUDE.md rule 18): every field the user
// types into must show ALL of its text, so this grows with content
// instead of scrolling inside a fixed box. One component covers both
// the short one-line fields (Meeting title, Chair, objectives, agenda
// Item/Aim/Lead, each If.../Then I will - singleLine=true: Enter does
// not add a line, pasted line breaks become spaces) and the long
// free-form ones (Daily intentions answers, Meeting context, Attendee
// preparation, If-Then situation - singleLine=false, default). The
// visible look (border, background, padding, font) comes entirely from
// whichever skin class is passed in via `className`
// (.plan-input/.plan-dq-textarea/.name-dialog-input); this component
// only owns the grow behaviour.
//
// `minPixelHeight`/`onHeightChange` exist for the one case where two
// fields must grow together: the If-Then If.../Then I will pair, where
// the parent measures both children's own natural height and feeds the
// larger one back down so the shorter box stretches to match.
// Scrolls the PAGE just enough to keep the caret's line visible with a
// one-line margin above the keyboard / fixed action bar. The caret's
// position is found with a hidden mirror of the textarea, because a
// textarea that has grown to full height has no scroll of its own to
// ask. Nothing happens while the caret is already comfortably visible,
// so it does not fight the browser's own scrolling.
function keepCaretVisible(el) {
  const style = window.getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 16;
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;
  const mirror = document.createElement('div');
  const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'textTransform', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'tabSize'];
  props.forEach((p) => { mirror.style[p] = style[p]; });
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.width = `${el.offsetWidth}px`;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  const caret = el.selectionEnd ?? el.value.length;
  mirror.textContent = el.value.slice(0, caret);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const caretOffset = marker.offsetTop;
  document.body.removeChild(mirror);

  const rect = el.getBoundingClientRect();
  const caretTop = rect.top + caretOffset;
  const caretBottom = caretTop + lineHeight;

  // Everything is measured NOW, at the moment of the check (the bar, the
  // tab bar and the visual viewport all change when the keyboard opens,
  // closes or the phone rotates). The lowest usable edge is whichever is
  // higher: the bottom of the visual viewport (above the keyboard), or
  // the top of the fixed Save bar / tab bar if one is showing.
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  let limit = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const bar = document.querySelector('.ui-phone-action-bar');
  if (bar && window.getComputedStyle(bar).display !== 'none') {
    limit = Math.min(limit, bar.getBoundingClientRect().top);
  } else if (window.innerWidth <= 768) {
    const tab = document.querySelector('.design-tabbar');
    if (tab) limit = Math.min(limit, tab.getBoundingClientRect().top);
  }

  // One and a half lines of clear space: the caret line is always at
  // least one full line above the bar. behavior:'instant' because
  // src/index.css sets scroll-behavior: smooth on html - a smooth
  // scrollBy is relative to wherever the animation currently is, so
  // several quick keystrokes (or Return presses) under-scrolled and the
  // caret slid behind the bar.
  const margin = lineHeight * 1.5;
  if (caretBottom > limit - margin) {
    window.scrollBy({ top: caretBottom - (limit - margin), left: 0, behavior: 'instant' });
  } else if (caretTop < viewTop) {
    // Only when the caret line has gone off the top (e.g. after a paste
    // or Enter-and-delete) - never to nudge a caret that is on screen.
    window.scrollBy({ top: caretTop - viewTop - lineHeight, left: 0, behavior: 'instant' });
  }
}

const AutoGrowTextarea = forwardRef(function AutoGrowTextarea({
  value,
  onChange,
  singleLine = false,
  minPixelHeight,
  onHeightChange,
  className = '',
  ...props
}, forwardedRef) {
  const ref = useRef(null);
  const lastWidthRef = useRef(0);
  const lastLengthRef = useRef(0);
  const lastMinRef = useRef(minPixelHeight);
  // Exposes the plain textarea DOM node (not a custom handle), so
  // existing call sites' `.focus()`/`.select()` keep working unchanged.
  useImperativeHandle(forwardedRef, () => ref.current, []);

  const resize = (animate) => {
    const el = ref.current;
    if (!el) return;
    if (!animate) el.style.transition = 'none';

    // Growing needs no measuring pass: scrollHeight already reports the
    // full content height while the box is still too short, so typing
    // forward never sets height:auto (which collapsed the page for a
    // moment and made the scroll position jump on iPhone once the
    // entry was long). Only a shrink (text got shorter) or a re-wrap
    // (width/font change, animate=false) needs the collapse-and-measure
    // pass, and that pass puts the page scroll back where it was.
    const length = typeof value === 'string' ? value.length : 0;
    const typedForward = animate && length > lastLengthRef.current
      && minPixelHeight === lastMinRef.current && el.style.height !== '';
    lastLengthRef.current = length;
    lastMinRef.current = minPixelHeight;

    let natural;
    if (typedForward) {
      natural = el.scrollHeight;
    } else {
      const scroller = document.scrollingElement;
      const savedScroll = scroller ? scroller.scrollTop : 0;
      el.style.height = 'auto';
      natural = el.scrollHeight;
      if (scroller) scroller.scrollTop = savedScroll;
    }
    const applied = minPixelHeight ? Math.max(natural, minPixelHeight) : natural;
    const currentHeight = parseFloat(el.style.height);
    if (currentHeight !== applied) el.style.height = `${applied}px`;

    if (!animate) {
      // Let the instant height paint before transitions resume, so the
      // next (typing-driven) resize still animates smoothly.
      requestAnimationFrame(() => {
        if (el) el.style.transition = '';
      });
    }

    if (onHeightChange) onHeightChange(natural);

    // Keep the caret line (not the whole box - a long journal is taller
    // than the screen) visible above the keyboard and the fixed phone
    // action bar.
    if (document.activeElement === el) keepCaretVisible(el);
  };

  // While this field has focus, re-check the caret line whenever the
  // caret moves without the text changing (tapping into the middle,
  // arrow keys, select) and whenever the keyboard opens, closes or the
  // phone rotates (visual viewport resize / scroll). Typing and Return
  // are already covered by resize() above.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const check = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (document.activeElement === el) keepCaretVisible(el);
      });
    };
    const vv = window.visualViewport;
    const start = () => {
      document.addEventListener('selectionchange', check);
      window.addEventListener('resize', check);
      vv?.addEventListener('resize', check);
      vv?.addEventListener('scroll', check);
      check();
    };
    const stop = () => {
      document.removeEventListener('selectionchange', check);
      window.removeEventListener('resize', check);
      vv?.removeEventListener('resize', check);
      vv?.removeEventListener('scroll', check);
    };
    el.addEventListener('focus', start);
    el.addEventListener('blur', stop);
    if (document.activeElement === el) start();
    return () => {
      el.removeEventListener('focus', start);
      el.removeEventListener('blur', stop);
      stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The ResizeObserver/font-ready effects below are set up once (mount
  // only - there's no reason to tear down and recreate a
  // ResizeObserver every time a prop changes). Indirecting the resize
  // call through a ref holding the LATEST closure keeps them from
  // acting on a stale `minPixelHeight`/`onHeightChange`/`value` frozen
  // at mount time (a pair-mate growing later, for instance, must still
  // be honoured by a resize triggered by rotating the phone).
  const resizeRef = useRef(resize);
  resizeRef.current = resize;

  // Typing, an external value change (loading a saved plan/draft) or a
  // pair-mate forcing this box taller - all resize the same way here.
  useLayoutEffect(() => {
    resize(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minPixelHeight]);

  // Resizing/rotating/opening the drawer can rewrap the text without
  // the value changing - recalculate instantly (not animated) so the
  // box doesn't visibly lag the gesture.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    lastWidthRef.current = el.getBoundingClientRect().width;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && Math.abs(width - lastWidthRef.current) > 0.5) {
        lastWidthRef.current = width;
        resizeRef.current(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The body font finishing its swap-in can change how text wraps.
  useEffect(() => {
    if (!document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) resizeRef.current(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleChange = (e) => {
    let next = e.target.value;
    if (singleLine) next = next.replace(/\r?\n/g, ' ');
    onChange(next);
  };

  const handleKeyDown = (e) => {
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
    }
    props.onKeyDown?.(e);
  };

  const handlePaste = (e) => {
    if (!singleLine) return;
    const text = e.clipboardData?.getData('text');
    if (text == null || !/[\r\n]/.test(text)) return;
    e.preventDefault();
    const flattened = text.replace(/\r?\n+/g, ' ');
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    // Preventing the native paste to flatten line breaks also bypasses
    // the browser's own maxLength truncation, so it's reapplied here.
    let next = value.slice(0, start) + flattened + value.slice(end);
    if (props.maxLength != null && next.length > props.maxLength) {
      next = next.slice(0, props.maxLength);
    }
    onChange(next);
    requestAnimationFrame(() => {
      if (el) {
        const pos = Math.min(start + flattened.length, next.length);
        el.selectionStart = el.selectionEnd = pos;
      }
    });
  };

  // eslint-disable-next-line no-unused-vars -- pulled out of `rest` only
  // so it isn't spread onto the element twice (handleKeyDown calls it).
  const { onKeyDown: _onKeyDown, ...rest } = props;

  return (
    <textarea
      ref={ref}
      className={`ui-autogrow ${className}`.trim()}
      value={value}
      rows={1}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      {...rest}
    />
  );
});

export default AutoGrowTextarea;
