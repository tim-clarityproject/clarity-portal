import { useToast as useSharedToast } from '../components/design';

// The old toast hook, now handing every message to the shared toast
// (src/components/design/Toast.jsx, mounted once for the whole app).
// Pages move to the shared useToast() directly in Phase 0c; this stays
// only until none of them use it. `message` is always null, so the old
// <Toast> component renders nothing.
export default function useToast() {
  const toast = useSharedToast();
  return { message: null, showToast: toast.show, hideToast: toast.hide };
}
