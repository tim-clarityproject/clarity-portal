import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Generic in-page confirm pop-up (prompt 9's "no browser confirm/alert"
// rule): same shell mechanics as DiscardDialog/DeleteDialog (portal,
// scrim, focus trap, Escape, focus return, scroll lock), reusing their
// existing .delete-dialog-*/.discard-dialog-keep CSS (already generic
// in meaning, not Delete-specific) instead of adding new classes.
// confirmLabel/confirmClassName let one component serve Restore,
// Archive, Delete and similar actions, each with its own wording.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmClassName = 'ui-btn-primary',
  hideCancel = false,
  onConfirm,
  onCancel,
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const dialogRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = 'confirm-dialog-title';

  useEffect(() => {
    if (open) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      previousFocusRef.current = document.activeElement;
      setShouldRender(true);
    } else if (shouldRender) {
      closeTimeoutRef.current = setTimeout(() => setShouldRender(false), 260);
    }
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && shouldRender && dialogRef.current) {
      const focusable = dialogRef.current.querySelector(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || dialogRef.current).focus();
    } else if (!open && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [open, shouldRender]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="ui-root">
      <div className="delete-dialog-scrim" onClick={onCancel} aria-hidden="true" />
      <div
        ref={dialogRef}
        className="delete-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="delete-dialog-title">{title}</h2>
        <p className="delete-dialog-message">{message}</p>
        <div className="delete-dialog-actions">
          {!hideCancel && <button type="button" className="discard-dialog-keep" onClick={onCancel}>{cancelLabel}</button>}
          <button type="button" className={confirmClassName} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
