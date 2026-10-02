import { createPortal } from 'react-dom';

// Pairs with src/hooks/useToast.js. Rendered via portal into document.body
// so it needs its own .ui-root wrapper (rule 17). z-index 2500 sits above
// DesignTabBar's fixed bar (1999) and below PopupShell/DiscardDialog's
// scrim+card (5101/5102), so a toast fired from inside a dialog still
// reads on top of the tab bar without covering the dialog.
export default function Toast({ message }) {
  if (!message) return null;

  return createPortal(
    <div className="ui-root">
      <style>{`
        .ui-toast {
          position: fixed;
          left: 50%;
          bottom: 32px;
          transform: translateX(-50%);
          z-index: 2500;
          max-width: calc(100vw - 32px);
          box-sizing: border-box;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: var(--radius-pill);
          padding: 12px 20px;
          font-family: var(--font-body);
          font-size: var(--fs-small);
          color: var(--text);
          text-align: center;
          animation: ui-toast-in var(--dur-slow) var(--ease);
        }

        @media (max-width: 768px) {
          .ui-toast {
            bottom: calc(var(--tabbar-height, 79px) + 16px);
          }
        }

        @keyframes ui-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .ui-toast {
            animation: none !important;
          }
        }
      `}</style>
      <div className="ui-toast" role="status">{message}</div>
    </div>,
    document.body
  );
}
