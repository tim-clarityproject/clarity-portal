import { useParams, Link, Navigate } from 'react-router-dom';
import { legalDocuments } from '../../content/legal';
import LegalDocBody from '../../components/legal/LegalDocBody';

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

        .legal-page-topbar {
          height: 76px;
          padding: 0 20px;
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        @media (min-width: 769px) {
          .legal-page-topbar {
            height: 72px;
            padding: 0 32px;
          }
        }

        .ui-root .legal-page-back {
          display: inline-flex;
          align-items: center;
          min-height: var(--tap-min) !important;
          padding: 0 !important;
          font-family: var(--font-body);
          font-size: 13px !important;
          color: var(--text-2);
          background: transparent;
          border: none;
          text-decoration: none;
          cursor: pointer;
          transition: color var(--dur-fast) var(--ease);
        }

        .ui-root .legal-page-back:hover,
        .ui-root .legal-page-back:focus-visible {
          color: var(--text);
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

        .ui-root .legal-page-title {
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: var(--ls-title);
          font-size: var(--fs-title-phone) !important;
          color: var(--text);
          margin: 0 0 var(--space-2) !important;
        }

        @media (min-width: 769px) {
          .ui-root .legal-page-title {
            font-size: var(--fs-title-desktop) !important;
          }
        }

        .legal-page-meta {
          font-family: var(--font-body);
          font-size: var(--fs-small);
          color: var(--text-2);
          margin: 0 0 var(--space-3);
        }

        .ui-root .legal-page-doc-subheading {
          font-family: var(--font-body);
          font-weight: 700;
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
          color: var(--coral);
        }
      `}</style>

      <div className="legal-page-topbar">
        <Link to="/auth/login" className="legal-page-back">← Back</Link>
      </div>

      <div className="legal-page-content">
        <div className="legal-page-column">
          <h1 className="legal-page-title">{doc.title}</h1>
          <p className="legal-page-meta">{doc.lastUpdated}</p>
          <LegalDocBody blocks={doc.blocks} classNames={PAGE_CLASS_NAMES} />
        </div>
      </div>
    </div>
  );
}
