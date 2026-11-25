import { Loading } from '../../../components/design';

// Clauses: Group B's page (Phase 6b run 3, plan section 6 B; M28 s-library and s-clause: /coach/agreements/:id/clauses[/:key] and the standard wording at /coach/settings/agreements/wording/:kind[/:key] (prop standard)). A stub laid down by Group A so the
// route, its title and its part exist; Group B replaces it, keeping the default export.
export default function Clauses() {
  return <div className="cc-page"><div className="cc-col"><Loading label="Loading" /></div></div>;
}
