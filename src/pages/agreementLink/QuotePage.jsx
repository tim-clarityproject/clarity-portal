import { Loading } from '../../components/design';

// QuotePage: Group C's public page (Phase 6b run 3, plan section 6 C; M28 s-q-client: /quote/:token): outside the portal, no
// account needed, following the device's light or dark (as /book/ does), left to the network by the service worker.
// A stub laid down by Group A; Group C replaces it, keeping the default export.
export default function QuotePage() {
  return <div className="ui-root" style={{ minHeight: '100dvh', background: 'var(--bg)' }}><Loading label="Loading" /></div>;
}
