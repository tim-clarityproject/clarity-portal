import { Button, Popup } from '../design';

// A yes-or-no pop-up on the shared Popup (src/components/design): the
// title, one short message, then the two choices. Escape, the close
// crosshair or a tap outside cancel.
//
// confirmClassName 'dng' marks a destructive confirm (Delete): then the
// safe choice (Cancel) is the coral button and Delete is outlined.
// hideCancel: an information pop-up with one button ("Got it").
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
  const destructive = confirmClassName.includes('dng');
  return (
    <Popup
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <>
          {!hideCancel && (
            <Button variant={destructive ? 'primary' : 'outline'} onClick={onCancel}>{cancelLabel}</Button>
          )}
          <Button variant={destructive ? 'outline' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      )}
    >
      {message && <p className="ds-dialog-text">{message}</p>}
    </Popup>
  );
}
