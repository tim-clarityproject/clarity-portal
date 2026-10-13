import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AutoGrowTextarea from './AutoGrowTextarea';

const MAX_NAME_LENGTH = 60;

// The "Name this..." pop-up shown on Finish/Save as draft for tools that
// need a name (decisions, audits, scripts - not daily plans or meetings,
// which name themselves). Same shell mechanics as
// src/components/ui/DiscardDialog.jsx (portal, scrim, focus trap,
// Escape, focus return, scroll lock) - duplicated rather than imported,
// same reasoning as that file's own header comment: a generically
// reusable shell would need prop-driven content anyway, and the two
// dialogs' field needs (one has a text input, one doesn't) differ
// enough that sharing one component would mean threading optional
// children through it.
export default function NameDialog({
  open,
  title = 'Name this',
  message = 'Give it a name so you can find it later.',
  suggestedName = '',
  onConfirm,
  onCancel,
}) {
  const [shouldRender, setShouldRender] = useState(false);
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = 'name-dialog-title';

  useEffect(() => {
    if (open) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      previousFocusRef.current = document.activeElement;
      setName(suggestedName);
      setError('');
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
    if (open && shouldRender && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
          dialogRef.current.querySelectorAll('input, textarea, button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
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

  const handleConfirm = (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give it a name to save.');
      return;
    }
    onConfirm(trimmed);
  };

  return createPortal(
    <div className="ui-root">
      <style>{`
        .name-dialog-scrim {
          position: fixed;
          inset: 0;
          background: var(--scrim);
          z-index: 5101;
          opacity: ${open ? 1 : 0};
          transition: opacity var(--dur) var(--ease);
        }

        .name-dialog-card {
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

        .name-dialog-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          font-size: 14px;
          color: var(--text);
          margin: 0 0 var(--space-2);
        }

        .name-dialog-message {
          font-family: var(--font-body);
          font-size: 14px;
          line-height: 1.5;
          color: var(--text-2);
          margin: 0 0 18px;
        }

        .ui-root .name-dialog-input {
          width: 100%;
          box-sizing: border-box;
          min-height: 48px;
          padding: 13px 16px !important;
          line-height: 1.4;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: var(--radius-input);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 16px;
          outline: none;
          transition: height var(--dur) var(--ease), border-color var(--dur) var(--ease);
        }

        .ui-root .name-dialog-input.error {
          border-color: var(--coral-soft);
        }

        .ui-root .name-dialog-input:focus {
          border-color: var(--coral);
        }

        .name-dialog-counter {
          font-size: 12px;
          color: var(--placeholder);
          margin: 8px 0 0;
          text-align: right;
        }

        .name-dialog-hint {
          font-family: var(--font-body);
          font-size: 13px;
          color: var(--text-2);
          margin: 8px 0 0;
        }

        .name-dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          flex-wrap: wrap;
          margin-top: var(--space-3);
        }

        /* Cancel here just abandons naming, it is not destructive like
           Discard/Delete, so it gets a neutral ghost pill, not the
           coral-tinted danger one those dialogs use. */
        .ui-root .name-dialog-cancel {
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--text);
          border: 1px solid var(--btn-line);
          font-family: var(--font-display);
          font-weight: 400;
          font-size: var(--fs-button);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          padding: 0 24px;
          min-height: 48px;
          cursor: pointer;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .ui-root .name-dialog-cancel:hover,
        .ui-root .name-dialog-cancel:focus-visible {
          border-color: var(--coral);
        }

        .ui-root .name-dialog-cancel:focus-visible {
          outline: 2px solid var(--coral);
          outline-offset: 2px;
        }
      `}</style>

      <div className="name-dialog-scrim" onClick={onCancel} aria-hidden="true" />

      <div
        ref={dialogRef}
        className="name-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="name-dialog-title">{title}</h2>
        <p className="name-dialog-message">{message}</p>

        <form onSubmit={handleConfirm} noValidate>
          <AutoGrowTextarea
            ref={inputRef}
            singleLine
            className={`name-dialog-input${error ? ' error' : ''}`}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            aria-label="Name"
            aria-invalid={error ? 'true' : undefined}
            onChange={(next) => {
              setName(next);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              // A single-line <input> inside a <form> submits on Enter
              // natively; AutoGrowTextarea's singleLine mode blocks the
              // newline a <textarea> would otherwise insert, so this
              // keeps that same Enter-to-save behaviour explicitly.
              if (e.key === 'Enter') handleConfirm(e);
            }}
          />
          <p className="name-dialog-counter">{name.length}/{MAX_NAME_LENGTH}</p>
          {error && <p className="name-dialog-hint" role="status">{error}</p>}

          <div className="name-dialog-actions">
            <button type="submit" className="discard-dialog-keep">
              Save
            </button>
            <button type="button" className="name-dialog-cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
