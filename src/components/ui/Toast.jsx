import { createPortal } from 'react-dom';

// Pairs with src/hooks/useToast.js. Rendered via portal into document.body
// so it needs its own .ui-root wrapper (rule 17). z-index 2500 sits above
// DesignTabBar's fixed bar (1999) and below PopupShell/DiscardDialog's
// scrim+card (5101/5102), so a toast fired from inside a dialog still
// reads on top of the tab bar without covering the dialog.
//
// `clearBarVar` (patch 3E area B): the name of a CSS variable holding
// the height of a page's OWN pinned action bar (e.g. BreathingPage's
// "--breathe-bar-height", measured by its StartBar), for pages whose
// bar sits ABOVE the default 32px/tabbar position this component
// already clears - without it, nothing changes, so every other page
// using this shared toast is unaffected. When given, the toast adds
// that bar's height (plus the safe-area inset on desktop, where the
// bar sits flush with no inset handling of its own - on phone the tab
// bar the page's own bar already sits above already bakes its inset
// in, so it is not added twice) on top of a 16px gap (var(--space-3)).
export default function Toast({ message, clearBarVar }) {
  if (!message) return null;
  const style = clearBarVar ? { '--toast-clear-bar': `var(${clearBarVar}, 0px)` } : undefined;

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

        .ui-toast.ui-toast--clear-bar {
          bottom: calc(var(--toast-clear-bar, 0px) + env(safe-area-inset-bottom) + var(--space-3));
        }

        @media (max-width: 768px) {
          .ui-toast.ui-toast--clear-bar {
            bottom: calc(var(--toast-clear-bar, 0px) + var(--tabbar-height, 79px) + var(--space-3));
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
      <div className={`ui-toast${clearBarVar ? ' ui-toast--clear-bar' : ''}`} style={style} role="status">{message}</div>
    </div>,
    document.body
  );
}
