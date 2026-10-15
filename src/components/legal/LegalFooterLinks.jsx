import { AuthTextLink } from '../auth/AuthButton';

// Footer row of links to the standalone /legal/* pages (see
// src/pages/legal/LegalDocumentPage.jsx), used at the bottom of the log
// in and sign-up (step 1) screens. Separate from the "I agree to the
// Terms..." checkbox row on sign-up step 2, which opens the same content
// in ReadingPopup instead - this is a plain way to read the documents
// without starting a sign-up.
export default function LegalFooterLinks({ align = 'left', newTab = false }) {
  // newTab opens each document in a new tab (the Strategic Alignment Health
  // Check uses it so a respondent does not lose their place).
  const tabProps = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <div className={`legal-footer-links legal-footer-links-${align}`}>
      <style>{`
        .legal-footer-links {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          column-gap: var(--space-2);
          row-gap: 0;
        }

        .legal-footer-links-left {
          justify-content: flex-start;
        }

        .legal-footer-links-center {
          justify-content: center;
        }

        .legal-footer-links-sep {
          color: var(--text-2);
        }
      `}</style>
      <AuthTextLink to="/legal/terms" {...tabProps}>Terms of Service</AuthTextLink>
      <span className="legal-footer-links-sep" aria-hidden="true">·</span>
      <AuthTextLink to="/legal/privacy" {...tabProps}>Privacy Policy</AuthTextLink>
      <span className="legal-footer-links-sep" aria-hidden="true">·</span>
      <AuthTextLink to="/legal/data-storage" {...tabProps}>Data Storage Notice</AuthTextLink>
    </div>
  );
}
