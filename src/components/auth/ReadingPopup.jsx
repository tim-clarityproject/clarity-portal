import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { legalDocuments, legalDocumentOrder } from '../../content/legal';
import { AuthPrimaryButton, AuthGhostButton } from './AuthButton';

// A second, independent pop-up shell for the "BEFORE YOU JOIN" reading
// pop-up on sign-up step 2. Deliberately a SEPARATE component from
// src/components/PopupShell.jsx rather than a change to it - its tab
// strip, scrollable body and footer layout are different enough from
// every other pop-up in the app that reusing PopupShell's own markup
// would mean adding one-off conditionals to it, which could change how
// it behaves for the Edit Mission / Breathing Settings pop-ups it
// already serves. What IS reused is the exact proven behaviour from
// PopupShell: portal into document.body, keep mounted through the
// close animation, Escape to close, focus trapped inside while open,
// focus returned to the element that opened it on close, body scroll
// locked while open.
export default function ReadingPopup({ isOpen, onClose, onAgree, initialTab = 'terms' }) {
  const [shouldRender, setShouldRender] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const dialogRef = useRef(null);
  const tabRefs = useRef({});
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      previousFocusRef.current = document.activeElement;
      setActiveTab(initialTab);
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

  const handleTabKeyDown = (e, index) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = e.key === 'ArrowRight'
      ? (index + 1) % legalDocumentOrder.length
      : (index - 1 + legalDocumentOrder.length) % legalDocumentOrder.length;
    const nextKey = legalDocumentOrder[next];
    setActiveTab(nextKey);
    tabRefs.current[nextKey]?.focus();
  };

  const doc = legalDocuments[activeTab];

  return createPortal(
    <div className="ui-root">
      <style>{`
        .reading-popup-scrim {
          position: fixed;
          inset: 0;
          background: var(--scrim);
          z-index: 5201;
          opacity: ${isOpen ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .reading-popup-dialog {
          position: fixed;
          top: 50%;
          left: 50%;
          width: calc(100% - 32px);
          max-width: 520px;
          max-height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-sizing: border-box;
          z-index: 5202;
          opacity: ${isOpen ? 1 : 0};
          transform: translate(-50%, -50%) translateY(${isOpen ? '0' : '8px'});
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
        }

        .reading-popup-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 18px 20px 0 24px;
          flex-shrink: 0;
        }

        /* src/styles/mobile.css has h2 { font-size: 18px !important;
           margin: 12px 0 8px !important; } at max-width: 768px. Scoped
           under .ui-root with matching !important, same reason as the
           h1 fix in AuthShell.jsx's .auth-headline. */
        .ui-root .reading-popup-title {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 15px !important;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text);
          margin: 0 !important;
        }

        .ui-root .reading-popup-close {
          width: 44px;
          height: 44px;
          min-height: 44px !important;
          padding: 0 !important;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }

        .reading-popup-close-cross {
          width: 18px;
          height: 18px;
          background-color: var(--coral);
          -webkit-mask: url('/brand/crosshair_white.png') center / contain no-repeat;
          mask: url('/brand/crosshair_white.png') center / contain no-repeat;
          transform: rotate(45deg);
        }

        .reading-popup-tabs {
          display: flex;
          gap: 2px;
          margin: 12px 20px 0;
          padding: 3px;
          border: 1px solid var(--line);
          border-radius: 999px;
          flex-shrink: 0;
        }

        .ui-root .reading-popup-tab {
          flex: 1;
          min-width: 0;
          min-height: 44px !important;
          padding: 6px 4px !important;
          border-radius: 999px;
          border: none;
          background: transparent;
          font-family: var(--font-display);
          font-weight: 400;
          font-size: 10px !important;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-2);
          cursor: pointer;
          white-space: normal;
          line-height: 1.3;
          text-align: center;
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .ui-root .reading-popup-tab.active {
          background: var(--coral);
          color: #000;
        }

        .reading-popup-body {
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
        }

        /* src/styles/mobile.css has h3 { font-size: 16px !important;
           margin: 8px 0 4px !important; } at max-width: 768px. Scoped
           under .ui-root with matching !important, same reason as above. */
        .ui-root .reading-popup-doc-heading {
          font-family: var(--font-body);
          font-weight: 500;
          font-size: 17px !important;
          color: var(--text);
          margin: 0 0 12px !important;
        }

        .reading-popup-doc-para {
          font-family: var(--font-body);
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-2);
          margin: 0 0 14px;
        }

        .reading-popup-footer {
          display: flex;
          gap: 12px;
          padding: 16px 20px 20px;
          border-top: 1px solid var(--line);
          flex-shrink: 0;
        }

        .reading-popup-footer .auth-btn-primary {
          flex: 1;
          min-width: 140px;
          margin-top: 0;
        }

        .reading-popup-footer .auth-btn-ghost {
          flex-shrink: 0;
        }
      `}</style>

      <div className="reading-popup-scrim" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        className="reading-popup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-popup-title"
        tabIndex={-1}
      >
        <div className="reading-popup-head">
          <h2 id="reading-popup-title" className="reading-popup-title">Before you join</h2>
          <button type="button" className="reading-popup-close" aria-label="Close" onClick={onClose}>
            <span className="reading-popup-close-cross" />
          </button>
        </div>

        <div className="reading-popup-tabs" role="tablist" aria-label="Legal documents">
          {legalDocumentOrder.map((key, index) => (
            <button
              key={key}
              ref={(el) => { tabRefs.current[key] = el; }}
              type="button"
              role="tab"
              id={`reading-tab-${key}`}
              aria-selected={activeTab === key}
              aria-controls={`reading-panel-${key}`}
              tabIndex={activeTab === key ? 0 : -1}
              className={`reading-popup-tab${activeTab === key ? ' active' : ''}`}
              onClick={() => setActiveTab(key)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
            >
              {legalDocuments[key].tabLabel}
            </button>
          ))}
        </div>

        <div
          className="reading-popup-body"
          role="tabpanel"
          id={`reading-panel-${activeTab}`}
          aria-labelledby={`reading-tab-${activeTab}`}
        >
          <h3 className="reading-popup-doc-heading">{doc.heading}</h3>
          {doc.paragraphs.map((p, i) => (
            <p key={i} className="reading-popup-doc-para">{p}</p>
          ))}
        </div>

        <div className="reading-popup-footer">
          <AuthPrimaryButton onClick={() => { onAgree(); onClose(); }}>
            I Agree
          </AuthPrimaryButton>
          <AuthGhostButton onClick={onClose}>
            Close
          </AuthGhostButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
