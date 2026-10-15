import { createPortal } from 'react-dom';

// Full-page "work in progress" overlay for a save that takes a
// noticeable moment (Personal Operating Plan's Save plan, prompt 9
// fidelity patch 2b) - dims and blocks the whole page (not just the
// Save button) so nothing can be tapped mid-save, and disappears the
// instant isOpen goes false. z-index 6000: above every existing
// overlay in the app (highest previously used: 5102, ConfirmDialog/
// DeleteDialog/DiscardDialog/NameDialog's own dialog layer).
//
// The spinning crosshair reuses the exact mask-image + rotation
// approach already shipped on auth buttons (components.css's
// .auth-btn-spinner/@keyframes auth-btn-spin), just bigger - not a
// new motion idiom, the one "spin" already in the design system.
export default function SavingOverlay({ isOpen, message = 'Saving...' }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="ui-root">
      <style>{`
        .ui-saving-overlay {
          position: fixed;
          inset: 0;
          z-index: 6000;
          background: var(--scrim);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-4);
        }

        .ui-saving-overlay-spinner {
          width: 48px;
          height: 48px;
          background-color: var(--coral);
          -webkit-mask: url('/brand/crosshair_white.png') center / contain no-repeat;
          mask: url('/brand/crosshair_white.png') center / contain no-repeat;
          animation: ui-saving-overlay-spin var(--dur-slow) linear infinite;
        }

        @keyframes ui-saving-overlay-spin {
          to { transform: rotate(360deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ui-saving-overlay-spinner {
            animation: none;
          }
        }

        .ui-saving-overlay-text {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 12px;
          color: var(--text);
        }
      `}</style>

      <div className="ui-saving-overlay" role="status" aria-live="polite">
        <span className="ui-saving-overlay-spinner" aria-hidden="true" />
        <span className="ui-saving-overlay-text">{message}</span>
      </div>
    </div>,
    document.body
  );
}
