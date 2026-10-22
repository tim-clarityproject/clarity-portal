import { createContext, useContext } from 'react';

// Shared by <ToastProvider> (Toast.jsx) and the pages that call useToast().
export const ToastContext = createContext(null);

export const ERROR_MESSAGE = 'Couldn\u2019t save just now. We\u2019ll keep trying.';

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
