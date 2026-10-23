import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ERROR_MESSAGE, ToastContext } from './toastContext';
import { POPUP_MS, TOAST_MS, TOAST_UNDO_MS, prefersReducedMotion } from './timing';
import './design.css';

// Toast (design reference: Feedback; decisions: "Motion and feedback",
// "Undo", "Errors"). One short line at the bottom of the screen:
//   toast.show('Added to this week.')   about 3 seconds, mint tick
//   toast.saved({ onUndo })              "Saved · Undo", about 5 seconds
//   toast.error()                        "Couldn't save just now. We'll keep trying."
// One at a time: a new toast replaces the one showing. The timer pauses
// while the pointer or keyboard focus is on the toast, so Undo can always
// be reached. Calm wording only: no red, no exclamation marks.
//
// Wrap the app (or a page) in <ToastProvider>, then call useToast()
// (toastContext.js).

function Tick() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
  );
}

export function ToastProvider({ children }) {
  // phase: 'entering' (in the page, about to fade in), 'shown', 'leaving'.
  const [toast, setToast] = useState(null);
  const [phase, setPhase] = useState('leaving');
  const timer = useRef(null);
  const frame = useRef(null);
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const nextId = useRef(1);
  const focusBefore = useRef(null);

  const clearTimer = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };

  const hide = useCallback(() => {
    clearTimer();
    setPhase('leaving');
  }, []);

  const startTimer = useCallback((ms) => {
    clearTimer();
    remaining.current = ms;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => setPhase('leaving'), ms);
  }, []);

  const open = useCallback((next, ms) => {
    cancelAnimationFrame(frame.current);
    const active = document.activeElement;
    focusBefore.current = active && active !== document.body ? active : null;
    setToast({ ...next, id: nextId.current++ });
    setPhase('entering');
    // Shown on the next frame, so it fades and rises in.
    frame.current = requestAnimationFrame(() => setPhase('shown'));
    startTimer(ms);
  }, [startTimer]);

  const api = useMemo(() => ({
    show: (message) => open({ kind: 'done', message }, TOAST_MS),
    saved: ({ message = 'Saved', onUndo } = {}) => open({ kind: 'undo', message, onUndo }, TOAST_UNDO_MS),
    error: (message = ERROR_MESSAGE) => open({ kind: 'error', message }, TOAST_UNDO_MS),
    hide,
  }), [open, hide]);

  useEffect(() => () => {
    clearTimer();
    cancelAnimationFrame(frame.current);
  }, []);

  // Once leaving, the toast is removed after its fade (--dur), or at once
  // with reduced motion, so an invisible toast never sits over the page.
  useEffect(() => {
    if (phase !== 'leaving' || !toast) return undefined;
    const removal = setTimeout(() => setToast(null), prefersReducedMotion() ? 0 : POPUP_MS);
    return () => clearTimeout(removal);
  }, [phase, toast]);

  const restoreFocus = (back) => {
    if (back?.isConnected && !back.closest('[inert]')) {
      back.focus({ preventScroll: true });
      return;
    }
    // Otherwise into the open dialog, if there is one.
    const dialogs = document.querySelectorAll('.ds-modal--shown .ds-dialog');
    dialogs[dialogs.length - 1]?.focus({ preventScroll: true });
  };

  const pause = () => {
    if (!timer.current) return;
    remaining.current -= Date.now() - startedAt.current;
    clearTimer();
  };
  const resume = () => {
    if (timer.current || phase === 'leaving') return;
    startTimer(Math.max(remaining.current, 1000));
  };

  // Undo runs once, even on a double tap.
  const undone = useRef(new Set());
  const undo = () => {
    if (!toast?.onUndo || undone.current.has(toast.id)) return;
    undone.current.add(toast.id);
    // Undo goes away with the toast; focus returns to where it was before
    // (read first: onUndo may show a new toast).
    const back = focusBefore.current;
    hide();
    toast.onUndo();
    restoreFocus(back);
  };

  const hasUndo = toast?.kind === 'undo' && toast.onUndo;

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="ui-root ds-portal">
          <div className="ds-toast-region" role="status" aria-live="polite" aria-atomic="true">
            {toast && (
              <div
                key={toast.id}
                className={`ds-toast${phase === 'shown' ? ' ds-toast--shown' : ''}`}
                onMouseEnter={pause}
                onMouseLeave={resume}
                onFocus={pause}
                onBlur={resume}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  e.stopPropagation();
                  const back = focusBefore.current;
                  hide();
                  restoreFocus(back);
                }}
              >
                {toast.kind !== 'error' && <Tick />}
                <span className="ds-toast-text">{toast.message}</span>
                {hasUndo && (
                  <button type="button" className="ds-toast-undo" onClick={undo}>Undo</button>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
