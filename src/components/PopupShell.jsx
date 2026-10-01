import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Shared scaffolding for every pop-up in the design system: portal into
// document.body, scrim, dialog fade+slide, Escape to close, focus moves
// in on open and is trapped, focus returns to whatever opened it on
// close, body scroll lock while open, kept mounted through the close
// animation then removed. z-index: scrim 5101, dialog 5102 - both above
// the header/drawer/tab-bar stack (highest previously used: 5003) and
// above every other overlay already in the app (highest found: 5000).
export default function PopupShell({ isOpen, onClose, titleId, children }) {
  const [shouldRender, setShouldRender] = useState(false);
  const dialogRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);

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
        'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
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
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll(
            'input, textarea, select, button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
          )
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
  }, [isOpen, onClose]);

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
        .popup-scrim {
          position: fixed;
          inset: 0;
          background: var(--scrim);
          z-index: 5101;
          opacity: ${isOpen ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .popup-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          width: min(460px, calc(100vw - 32px));
          max-height: calc(100dvh - 32px);
          overflow-y: auto;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 26px 24px;
          box-sizing: border-box;
          z-index: 5102;
          opacity: ${isOpen ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${isOpen ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
        }

        .popup-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 15px;
          color: var(--text);
          margin: 0;
        }

        .popup-desc {
          font-family: var(--font-body);
          font-size: 15px;
          color: var(--text-2);
          margin: 12px 0 18px;
          line-height: 1.5;
        }

        .popup-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 12px;
          margin-top: 26px;
        }
      `}</style>

      <div className="popup-scrim" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        className="popup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
