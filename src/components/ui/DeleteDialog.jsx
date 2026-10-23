import { Button, Popup } from '../design';

// "Delete this…?" on the shared Popup (src/components/design). The safe
// choice, Cancel, is the coral button; Delete is outlined. Escape, the
// close crosshair or a tap outside cancel.
//
// After the caller's onConfirm resolves, show "Deleted" with the shared
// toast; showDeletedToast() is the one-line helper for that.
export function showDeletedToast(showToast) {
  showToast('Deleted');
}

export default function DeleteDialog({
  open,
  title = 'Delete this?',
  body = 'This cannot be undone.',
  onConfirm,
  onCancel,
}) {
  return (
    <Popup
      open={open}
      onClose={onCancel}
      title={title}
      footer={(
        <>
          <Button variant="primary" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Delete</Button>
        </>
      )}
    >
      {body && <p className="ds-dialog-text">{body}</p>}
    </Popup>
  );
}
