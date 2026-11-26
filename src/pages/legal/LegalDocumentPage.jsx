import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import { legalDocuments } from '../../content/legal';
import LegalDocBody from '../../components/legal/LegalDocBody';
import { PageOpening } from '../../components/design';
import { BackLink } from '../../components/ui/DiscardLink';
import { B1_LINES } from '../../content/pageLines/client';
import '../../pages/hubs/clientPage.css';

// Standalone, publicly reachable pages for the same three documents the
// sign-up reading pop-up shows (src/components/auth/ReadingPopup.jsx),
// linked from the foot of the log in / sign up screens. One route,
// /legal/:doc, rather than three separate route components, since the
// only thing that differs between them is which entry of legalDocuments
// to render. Uses the Welcome flow's dark design tokens and fonts
// directly (background, text, coral, Nekst/DM Sans) rather than the
// AuthShell component itself - AuthShell's 420px centred column and
// letter-by-letter headline animation are built for short sign-up/login
// screens, not a multi-thousand-word document meant to be read start to
// finish.
const SLUG_TO_KEY = {
  terms: 'terms',
  privacy: 'privacy',
  'data-storage': 'dataStorage',
};

const PAGE_CLASS_NAMES = {
  heading: 'legal-page-doc-subheading',
  paragraph: 'legal-page-doc-para',
  list: 'legal-page-doc-list',
  listItem: 'legal-page-doc-li',
  link: 'legal-page-doc-link',
};

export default function LegalDocumentPage() {
  const { doc: slug } = useParams();
  const key = SLUG_TO_KEY[slug];
  const location = useLocation();
  const navigate = useNavigate();
  // Back goes to the page that opened this one (a guest's link, the sign-in
  // screens), so nobody loses their place; opened on its own (a new tab, a
  // bookmark), it goes to sign in (the functionality tester, 22 Nov).
  const cameFromPortal = location.key !== 'default';

  if (!key) {
    return <Navigate to="/auth/login" replace />;
  }

  const doc = legalDocuments[key];

  return (
    <div className="ui-root legal-page-root">
      <style>{`
        .legal-page-root {
          min-height: 100dvh;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }

        /* Back sits in the reading column, its chevron's visible edge on
           the column's left edge and 10px before its word: the shared
           BackLink (tidy pass item 17). */
        .legal-page-topbar {
          padding: var(--space-3) 0;
        }

        .legal-page-content {
          flex: 1;
          width: 100%;
          box-sizing: border-box;
          padding: 0 var(--page-x-phone) var(--space-7);
        }

        @media (min-width: 769px) {
          .legal-page-content {
            padding: 0 var(--page-x-desktop) var(--space-7);
          }
        }

        .legal-page-column {
          max-width: var(--content-max);
          margin: 0 auto;
        }

        .ui-root .legal-page-doc-subheading {
          font-family: var(--font-body);
          font-weight: var(--fw-medium);
          font-size: var(--fs-body) !important;
          color: var(--text);
          margin: var(--space-4) 0 var(--space-2) !important;
        }

        .legal-page-doc-para {
          font-family: var(--font-body);
          font-size: var(--fs-body-sub);
          line-height: 1.6;
          color: var(--text-2);
          margin: 0 0 var(--space-3);
        }

        /* index.css imports Tailwind, whose preflight reset sets
           list-style: none (and zeroes margin/padding) on every ul/ol in
           the app. Restored explicitly, same as the overrides in
           ReadingPopup.jsx. */
        .legal-page-doc-list {
          list-style: disc;
          margin: 0 0 var(--space-3);
          padding-left: var(--space-4);
        }

        .legal-page-doc-li {
          font-family: var(--font-body);
          font-size: var(--fs-body-sub);
          line-height: 1.6;
          color: var(--text-2);
          margin: 0 0 var(--space-2);
        }

        .legal-page-doc-link {
          color: var(--coral-text);
        }
      `}</style>

      <div className="legal-page-content">
        {/* ds-legal: a legal document's dates keep their year (the design check's `year` leaves it out). */}
        <div className="legal-page-column ds-legal">
          <div className="legal-page-topbar">
            {cameFromPortal ? <BackLink onClick={() => navigate(-1)} /> : <BackLink to="/auth/login" />}
          </div>
          <PageOpening title={doc.title} label={doc.lastUpdated} line={B1_LINES.legal} />
          <LegalDocBody blocks={doc.blocks} classNames={PAGE_CLASS_NAMES} />
        </div>
      </div>
    </div>
  );
}
