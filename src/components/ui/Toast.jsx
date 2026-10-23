// The old per-page toast. Messages now go to the shared toast
// (src/components/design/Toast.jsx) through src/hooks/useToast.js, so
// this renders nothing; it stays only until no page renders it.
export default function Toast() {
  return null;
}
