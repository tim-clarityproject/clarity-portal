import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The in-page "Delete this...?" pop-up, styled like the approved Discard
// pop-up (src/components/ui/DiscardDialog.jsx): the safe choice (Cancel)
// is the main filled button and comes first; Delete is a ghost button
// with the coral-tinted outline (class "dng", shared with
// .discard-dialog-discard in components.css - same recipe, not
// duplicated). Same shell mechanics as DiscardDialog (portal, scrim,
// focus trap, Escape, focus return, scroll lock), duplicated rather than
// imported for the same reason noted in NameDialog.jsx.
//
// After the caller's onConfirm resolves, show the existing toast
// ("Deleted.") - see useToast/Toast.jsx from commit 1e5e149. This
// component does not show the toast itself (every page already has its
// own toast instance); see showDeletedToast() below for the one-line
// helper callers can reuse instead of retyping the string per page.
export function showDeletedToast(showToast) {
  showToast('Deleted.');
}

export default function DeleteDialog({
  open,
  title = 'Delete this?',
  body = 'This cannot be undone.',
  onConfirm,
  onCancel,
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const dialogRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = 'delete-dialog-title';

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
      <style>{`
        .delete-dialog-scrim {
          position: fixed;
          inset: 0;
          background: var(--scrim);
          z-index: 5101;
          opacity: ${open ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .delete-dialog-card {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 100%;
          max-width: 420px;
          box-sizing: border-box;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-card);
          padding: var(--space-4);
          z-index: 5102;
          opacity: ${open ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${open ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
        }

        .delete-dialog-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 14px;
          color: var(--text);
          margin: 0 0 var(--space-2);
        }

        .delete-dialog-message {
          font-family: var(--font-body);
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-2);
          margin: 0 0 18px;
        }

        .delete-dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
      `}</style>

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
        <p className="delete-dialog-message">{body}</p>
        <div className="delete-dialog-actions">
          <button type="button" className="discard-dialog-keep" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dng" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
