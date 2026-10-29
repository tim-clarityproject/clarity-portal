import { useCallback, useEffect, useRef, useState } from 'react';
import { pushLayer } from './layers';

// How an ⓘ opens (Tim, 28 Oct, 14:22 and 14:42; START-HERE section 5),
// for an ⓘ whose explanation opens in place: the page title's
// (PageHeader), a section's (Section) and a guided tool step's.
//
// - With a mouse, pointing at the ⓘ previews its explanation, and it
//   closes when the pointer moves away.
// - A click keeps it open until you click away, click the ⓘ again or
//   press Escape.
// - On a touch screen there is no hover: it opens on tap.
// - Keyboard focus opens it; Enter keeps it open; Escape closes it and
//   returns focus to the ⓘ.
// The eye and the play icon are not explanations: they open their panel
// or video on click or tap only.
//
//   const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
//   <button ref={buttonRef} aria-expanded={open} {...buttonProps}>…</button>
//   <p ref={panelRef} hidden={!open}>…</p>

const keyboardFocus = (el) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
};

export default function useInfoToggle() {
  const [how, setHow] = useState(null); // null, 'preview' or 'kept'
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  // Focus going back to the ⓘ after Escape doesn't open it again.
  const quiet = useRef(false);

  useEffect(() => {
    if (!how) return undefined;
    // Escape closes the explanation first (the top layer), then focus goes
    // back to the ⓘ.
    const removeLayer = pushLayer(() => {
      setHow(null);
      const btn = buttonRef.current;
      if (btn?.isConnected && document.activeElement !== btn) {
        quiet.current = true;
        btn.focus({ preventScroll: true });
        quiet.current = false;
      }
    });
    if (how !== 'kept') return removeLayer;
    // Kept open: a click or tap anywhere but the ⓘ and its words closes it.
    const onDown = (e) => {
      if (buttonRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setHow(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      removeLayer();
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [how]);

  const close = useCallback(() => setHow(null), []);
  const preview = () => setHow((h) => h || 'preview');
  const endPreview = () => setHow((h) => (h === 'preview' ? null : h));

  return {
    open: !!how,
    close,
    buttonRef,
    panelRef,
    buttonProps: {
      // Only a mouse previews: a touch never leaves a hover preview behind.
      onPointerEnter: (e) => { if (e.pointerType === 'mouse') preview(); },
      onPointerLeave: (e) => { if (e.pointerType === 'mouse') endPreview(); },
      onFocus: (e) => { if (!quiet.current && keyboardFocus(e.currentTarget)) preview(); },
      onBlur: endPreview,
      onClick: () => setHow((h) => (h === 'kept' ? null : 'kept')),
    },
  };
}
