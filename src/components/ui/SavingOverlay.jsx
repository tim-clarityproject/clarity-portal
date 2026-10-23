import { createPortal } from 'react-dom';
import { Loading } from '../design';

// Full-page "work in progress" overlay for a save that takes a
// noticeable moment (Personal Operating Plan's Save plan, prompt 9
// fidelity patch 2b) - dims and blocks the whole page (not just the
// Save button) so nothing can be tapped mid-save, and disappears the
// instant isOpen goes false. z-index 6000: above every existing
// overlay in the app (highest previously used: 5102, ConfirmDialog/
// DeleteDialog/DiscardDialog/NameDialog's own dialog layer).
//
// The turning crosshair and one short line come from the shared Loading
// part (src/components/design), shown at once: the save has started.
export default function SavingOverlay({ isOpen, message = 'Saving' }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="ui-root ds-portal">
      <style>{`
        .ui-root .ui-saving-overlay {
          position: fixed;
          inset: 0;
          z-index: 6000;
          background: var(--scrim);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>

      <div className="ui-saving-overlay">
        <Loading label={message} delay={0} />
      </div>
    </div>,
    document.body
  );
}
