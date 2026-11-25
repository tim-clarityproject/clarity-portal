import { Loading } from '../../../components/design';

// Group D's (Phase 6b run 3, plan section 6 D; M28 s-org-billing). Stubs laid down by Group A.
// OrgBilling (default): an organisation's billing, /coach/organisations/:id/billing.
// OrgBillingLink: the way there from the organisation's page (mounted by Group A in OrganisationPage.jsx).
//   Props: { organisationId, name }. Renders nothing until Group D fills it.
export default function OrgBilling() {
  return <div className="cc-page"><div className="cc-col"><Loading label="Loading" /></div></div>;
}

// eslint-disable-next-line no-unused-vars
export function OrgBillingLink({ organisationId, name }) {
  return null;
}
