// AgreementFold: Group B's (Phase 6b run 3, plan section 6 B; M28 s-client and s-sent): a client's Agreement fold
// with New agreement, [Name]'s agreement, Send [first name] a quote, and Sent, Opened, Signed, Settled. Mounted by Group
// A in ClientPage.jsx around run 1's fold. Props:
//   { profileId, name, first, fold (run 1's agreementFold), loading (the agreement still loading),
//     openAgreement() (run 1's Open the agreement), children (run 1's fold as drawn) }
// The stub draws run 1's fold unchanged; Group B replaces it, keeping the default export and these props.
export default function AgreementFold({ children }) {
  return children ?? null;
}
