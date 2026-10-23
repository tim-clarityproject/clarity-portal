import { useEffect, useRef, useState } from 'react';
import { Button, ErrorMessage, Popup, TextBox } from '../design';

const MAX_NAME_LENGTH = 60;

// The "Name this..." pop-up shown on Finish/Save as draft for tools that
// need a name (decisions, audits, scripts - not daily plans or meetings,
// which name themselves), on the shared Popup (src/components/design).
// The suggested name is filled in and selected; Enter or Save confirms,
// Escape, the close crosshair, a tap outside or Cancel cancels.
export default function NameDialog({
  open,
  title = 'Name this',
  message = 'Give it a name so you can find it later.',
  suggestedName = '',
  onConfirm,
  onCancel,
}) {
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // Fresh each time it opens, with the suggestion selected.
  useEffect(() => {
    if (!open) return;
    setName(suggestedName);
    setError('');
    const frame = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleConfirm = (e) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give it a name to save.');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Popup
      open={open}
      onClose={onCancel}
      title={title}
      initialFocusRef={inputRef}
      footer={(
        <>
          <Button variant="primary" onClick={handleConfirm}>Save</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </>
      )}
    >
      {message && <p className="ds-dialog-text">{message}</p>}
      <TextBox
        ref={inputRef}
        lines="one"
        ariaLabel="Name"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        aria-invalid={error ? 'true' : undefined}
        onChange={(next) => {
          setName(next);
          if (error) setError('');
        }}
        onKeyDown={(e) => {
          // Enter saves, as a one-line field in a form does.
          if (e.key === 'Enter') handleConfirm(e);
        }}
      />
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </Popup>
  );
}
