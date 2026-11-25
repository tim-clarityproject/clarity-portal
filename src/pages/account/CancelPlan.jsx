import { Loading } from '../../components/design';

// CancelPlan: Group C's page (Phase 6b run 3, plan section 6 C; M28 s-cancel: /my-account/plan/cancel). A stub laid down by Group A so the
// route and its part exist; Group C replaces it, keeping the default export.
export default function CancelPlan() {
  return <div className="ui-root plan-builder-wait"><Loading label="Loading" /></div>;
}
