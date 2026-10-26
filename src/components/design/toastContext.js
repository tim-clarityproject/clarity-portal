import { createContext, useContext } from 'react';

// Shared by <ToastProvider> (Toast.jsx) and the pages that call useToast().
export const ToastContext = createContext(null);

// The default error (writing rule 15: what happened, then what to do).
// It never says it will keep trying: a page that really retries says so
// itself, with its own words.
export const ERROR_MESSAGE = 'That didn\u2019t save. Check your connection and try again.';

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
