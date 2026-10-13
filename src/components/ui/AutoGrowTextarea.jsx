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
  // Exposes the plain textarea DOM node (not a custom handle), so
  // existing call sites' `.focus()`/`.select()` keep working unchanged.
  useImperativeHandle(forwardedRef, () => ref.current, []);

  const resize = (animate) => {
    const el = ref.current;
    if (!el) return;
    if (!animate) el.style.transition = 'none';

    el.style.height = 'auto';
    const natural = el.scrollHeight;
    const applied = minPixelHeight ? Math.max(natural, minPixelHeight) : natural;
    el.style.height = `${applied}px`;

    if (!animate) {
      // Let the instant height paint before transitions resume, so the
      // next (typing-driven) resize still animates smoothly.
      requestAnimationFrame(() => {
        if (el) el.style.transition = '';
      });
    }

    if (onHeightChange) onHeightChange(natural);

    // Keep the caret in view past the fixed phone action bar -
    // .ui-autogrow's scroll-margin-bottom reserves space for it.
    if (document.activeElement === el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  };

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
