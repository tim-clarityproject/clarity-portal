import { useRef, useState } from 'react';
import { Button, Popup, TextField } from './design';

export default function NamingModal({ isOpen, itemType, onConfirm, onCancel, defaultName = '' }) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef(null);

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim());
      setName('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <Popup
      open={isOpen}
      onClose={onCancel}
      title={`Give your ${itemType} a name`}
      initialFocusRef={inputRef}
      footer={(
        <>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!name.trim()}>
            Save {itemType}
          </Button>
        </>
      )}
    >
      <TextField
        ref={inputRef}
        aria-label={`Name for your ${itemType}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type here"
      />
    </Popup>
  );
}
