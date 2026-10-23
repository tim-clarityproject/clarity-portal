import { Button, Popup } from '../design';

// "Discard this…?" on the shared Popup (src/components/design). Keep
// editing is the coral button; Discard is outlined. Escape, the close
// crosshair or a tap outside keep editing.
export default function DiscardDialog({
  isOpen,
  onDiscard,
  onKeep,
  title = 'Discard this decision?',
  message = 'Anything you have not saved will be lost.',
}) {
  return (
    <Popup
      open={isOpen}
      onClose={onKeep}
      title={title}
      footer={(
        <>
          <Button variant="primary" onClick={onKeep}>Keep editing</Button>
          <Button onClick={onDiscard}>Discard</Button>
        </>
      )}
    >
      {message && <p className="ds-dialog-text">{message}</p>}
    </Popup>
  );
}
