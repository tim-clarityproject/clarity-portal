import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Standalone dialog shell for the Discard confirm pop-up. Does not reuse
// PopupShell: that component hardcodes its own card width (460px) and
// padding (26px 24px), which don't match this task's spec (420px / 24px),
// so a new shell was built instead - same proven interaction pattern as
// PopupShell (portal, scrim, focus trap, Escape, focus return, scroll
// lock) duplicated here rather than changing the shared PopupShell used
// elsewhere.
export default function DiscardDialog({
  isOpen,
  onDiscard,
  onKeep,
  title = 'Discard this decision?',
  message = 'Anything you have not saved will be lost.',
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const dialogRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = 'discard-dialog-title';

  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && shouldRender && dialogRef.current) {
      const focusable = dialogRef.current.querySelector(
        'button, [href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || dialogRef.current).focus();
    } else if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isOpen, shouldRender]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onKeep();
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
  }, [isOpen, onKeep]);

  useEffect(() => {
    if (isOpen) {
      const original = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return createPortal(
    <div className="ui-root">
      <style>{`
        .discard-dialog-scrim {
          position: fixed;
          inset: 0;
          background: var(--scrim);
          z-index: 5101;
          opacity: ${isOpen ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .discard-dialog-card {
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
          opacity: ${isOpen ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${isOpen ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
        }

        .discard-dialog-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 14px;
          color: var(--text);
          margin: 0 0 var(--space-2);
        }

        .discard-dialog-message {
          font-family: var(--font-body);
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-2);
          margin: 0 0 18px;
        }

        .discard-dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
      `}</style>

      <div className="discard-dialog-scrim" onClick={onKeep} aria-hidden="true" />

      <div
        ref={dialogRef}
        className="discard-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="discard-dialog-title">{title}</h2>
        <p className="discard-dialog-message">{message}</p>
        <div className="discard-dialog-actions">
          <button type="button" className="discard-dialog-keep" onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="discard-dialog-discard" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
