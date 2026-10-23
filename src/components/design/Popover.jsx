import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { pushLayer } from './layers';
import { lockPage, returnFocus, trapTab, unlockPage } from './pageLock';
import { themeProps, useThemeScope } from './themeScope';
import { PANEL_MS, POPUP_MS, prefersReducedMotion } from './timing';
import useIsPhone from './useIsPhone';
import './design.css';

// What opens from a box: the drop-down's list and the calendar
// (decisions: "Drop-downs are branded everywhere"; M6 set-up flows).
//
// Laptop: it opens just below the box, or above it only when there isn't
// room below, and never covers the box. It follows the box when the page
// scrolls. A click outside closes it.
// Phone: a panel slides up from the bottom with the question as its
// title. Swipe down, a tap outside or the rotated crosshair closes it.
// Both: Escape closes it (the top layer first), and focus goes back to
// the box.
//
// variant 'list':  the list itself is what opens (the drop-down).
// variant 'panel': a small panel with the title and close (the calendar).
// width:           'anchor' (as wide as the box) or 'css' (the stylesheet's).
// keepFocus:       on laptop, focus stays on the box (the drop-down reads
//                  its list through aria-activedescendant); otherwise
//                  focus moves to initialFocusRef inside.

const SWIPE_CLOSE_PX = 80;
const EDGE = 12;                  // keep this far from the window's edges

function place(anchor, pop, width) {
  const box = anchor.getBoundingClientRect();
  const gap = parseFloat(getComputedStyle(pop).getPropertyValue('--pop-gap')) || 8;
  const viewH = window.innerHeight;
  const viewW = document.documentElement.clientWidth;
  const natural = pop.scrollHeight;
  const below = viewH - box.bottom - gap - EDGE;
  const above = box.top - gap - EDGE;
  const openUp = natural > below && above > below;
  const room = Math.max(0, openUp ? above : below);
  const height = Math.min(natural, room);
  // 'anchor': as wide as the box; 'css': as its stylesheet says.
  const own = pop.getBoundingClientRect().width;
  const w = Math.min(width === 'anchor' ? box.width : own, viewW - 2 * EDGE);
  const left = Math.min(Math.max(EDGE, box.left), Math.max(EDGE, viewW - w - EDGE));
  return {
    top: openUp ? box.top - gap - height : box.bottom + gap,
    left,
    width: w,
    maxHeight: room,
    up: openUp,
  };
}

export default function Popover({
  open,
  onClose,
  anchorRef,
  title,
  variant = 'list',
  width = 'anchor',
  keepFocus = false,
  initialFocusRef,
  children,
}) {
  const isPhone = useIsPhone();
  const scope = useThemeScope();
  const titleId = useId();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Mount, then show on the next frame so it can fade or slide in; on
  // close, hide, then unmount once the motion has finished.
  useEffect(() => {
    if (open) {
      setMounted(true);
      if (sheetRef.current) sheetRef.current.style.transform = '';
      let second;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setShown(false);
    const timer = setTimeout(() => {
      setMounted(false);
      setPos(null);
    }, prefersReducedMotion() ? 0 : (isPhone ? PANEL_MS : POPUP_MS));
    return () => clearTimeout(timer);
  }, [open, isPhone]);

  const active = open && mounted;

  // Escape, focus in and back out, and on phone the page lock.
  useLayoutEffect(() => {
    if (!active) return undefined;
    const removeLayer = pushLayer(() => onCloseRef.current?.());
    if (isPhone) lockPage();
    if (isPhone || !keepFocus) {
      const target = initialFocusRef?.current || (isPhone ? sheetRef.current : popRef.current);
      target?.focus({ preventScroll: true });
    }
    const anchor = anchorRef.current;
    const pop = popRef.current;
    const sheet = sheetRef.current;
    return () => {
      removeLayer();
      if (isPhone) unlockPage();
      const focusInside = pop?.contains(document.activeElement) || sheet?.contains(document.activeElement);
      // After React has finished this update (it would otherwise put focus
      // back on what was focused when the update began, inside here).
      if (isPhone || !keepFocus || focusInside) queueMicrotask(() => returnFocus(anchor));
    };
    // initialFocusRef is read once, when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isPhone]);

  // Laptop: sit beside the box and follow it as the page scrolls.
  useLayoutEffect(() => {
    if (!active || isPhone) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = anchorRef.current;
      const pop = popRef.current;
      if (anchor && pop) setPos(place(anchor, pop, width));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer && anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [active, isPhone, anchorRef, width]);

  // Laptop: a click anywhere else closes it (the box itself toggles).
  useEffect(() => {
    if (!active || isPhone) return undefined;
    const onPointer = (e) => {
      if (popRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onCloseRef.current?.();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [active, isPhone, anchorRef]);

  if (!mounted) return null;

  if (!isPhone) {
    const style = pos
      ? { top: pos.top, left: pos.left, width: width === 'anchor' ? pos.width : undefined, maxHeight: pos.maxHeight }
      // Not placed yet: it is still fully transparent (not hidden, so
      // focus can already move into it).
      : { top: 0, left: 0 };
    return createPortal(
      <div className="ui-root ds-portal" {...themeProps(scope)} inert={!open}>
        <div
          ref={popRef}
          className={`ds-pop ds-pop--${variant}${shown && pos ? ' ds-pop--shown' : ''}${pos?.up ? ' ds-pop--up' : ''}`}
          style={style}
          tabIndex={-1}
          role={variant === 'panel' ? 'dialog' : undefined}
          aria-labelledby={variant === 'panel' ? titleId : undefined}
          onKeyDown={variant === 'panel' ? (e) => trapTab(e, popRef.current) : undefined}
        >
          {variant === 'panel' && (
            <div className="ds-sheet-head">
              <h3 id={titleId} className="ds-sheet-title">{title}</h3>
              <IconButton label="Close" onClick={() => onCloseRef.current?.()} />
            </div>
          )}
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  // Phone: swipe down to close, from anywhere but a scrolled list.
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const scroller = e.target.closest('.ds-sheet-body');
    if (scroller && scroller.scrollTop > 0) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e) => {
    const el = sheetRef.current;
    if (!drag.current || !el) return;
    const dy = e.touches[0].clientY - drag.current.y;
    drag.current.dy = dy;
    el.classList.toggle('ds-sheet--dragging', dy > 0);
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const onTouchEnd = () => {
    const el = sheetRef.current;
    if (!drag.current || !el) return;
    const { dy } = drag.current;
    drag.current = null;
    el.classList.remove('ds-sheet--dragging');
    if (dy > SWIPE_CLOSE_PX) {
      el.style.transform = 'translateY(100%)';
      onCloseRef.current?.();
    } else {
      el.style.transform = '';
    }
  };

  return createPortal(
    <div className={`ui-root ds-portal${shown ? ' ds-sheet--shown' : ''}`} {...themeProps(scope)} inert={!open}>
      <div className="ds-sheet-scrim" aria-hidden="true" onClick={() => onCloseRef.current?.()} />
      <div
        ref={sheetRef}
        className={`ds-sheet ds-sheet--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, sheetRef.current)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="ds-sheet-grab" aria-hidden="true" />
        <div className="ds-sheet-head">
          <h3 id={titleId} className="ds-sheet-title">{title}</h3>
          <IconButton label="Close" onClick={() => onCloseRef.current?.()} />
        </div>
        <div className="ds-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
