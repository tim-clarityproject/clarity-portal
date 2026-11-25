import { Loading } from '../../../components/design';

// Group B's (Phase 6b run 3, plan section 6 B; M28 s-start and s-client's buttons). Stubs laid down by Group A.
//
// AgreementStart (default): Choose a starting point, /coach/agreements/new?for=client:<id> | org:<id> | lead:<id>.
// AgreementButtons: the buttons on an organisation's and a lead's page (New agreement, Send [name] a quote), mounted
//   by Group A in OrganisationPage.jsx and LeadPage.jsx. Props: { kind: 'organisation' | 'lead', id, name }.
//   (A client's page has AgreementFold, which holds its own buttons.) Renders nothing until Group B fills it.
export default function AgreementStart() {
  return <div className="cc-page"><div className="cc-col"><Loading label="Loading" /></div></div>;
}

// eslint-disable-next-line no-unused-vars
export function AgreementButtons({ kind, id, name }) {
  return null;
}
