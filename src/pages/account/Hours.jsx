import { Loading } from '../../components/design';

// Hours: Group C's page (Phase 6b run 3, plan section 6 C; M28 s-h-client: /my-account/hours). A stub laid down by Group A so the
// route and its part exist; Group C replaces it, keeping the default export.
export default function Hours() {
  return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
}
