import { useCallback, useRef, useState } from 'react';

// Pairs with src/components/ui/Toast.jsx. duration defaults to the 3.2s
// spec'd for "Saved as Name.", "Draft saved.", "Discarded." messages.
export default function useToast(duration = 3200) {
  const [message, setMessage] = useState(null);
  const timeoutRef = useRef(null);

  const showToast = useCallback((text) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(text);
    timeoutRef.current = setTimeout(() => setMessage(null), duration);
  }, [duration]);

  const hideToast = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(null);
  }, []);

  return { message, showToast, hideToast };
}
