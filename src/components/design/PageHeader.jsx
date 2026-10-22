import { SystemLink } from './Button';
import './design.css';

// Page header (design reference: Page header). The title in Nekst
// capitals, one sentence saying the page's job, a quiet meta line
// (version, dates, the system link), then the short coral rule. The
// coral rule appears once per page, here only. No overline above the
// title (decisions: "No overline").
//
// meta:           short items for the meta line, e.g. ['Version 2.1', '8 weeks · 28 Sep to 22 Nov'].
// onSystemLink:   shows "How the system fits together" in the meta line.
// as:             the heading element (h1 on a real page).
export default function PageHeader({ title, job, meta = [], onSystemLink, as: Heading = 'h1', className = '' }) {
  const hasMeta = meta.length > 0 || onSystemLink;
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <Heading className="ds-page-title">{title}</Heading>
      {job && <p className="ds-page-job">{job}</p>}
      {hasMeta && (
        <div className="ds-page-meta">
          {meta.map((item) => <span key={item}>{item}</span>)}
          {onSystemLink && <SystemLink onClick={onSystemLink} />}
        </div>
      )}
      <div className="ds-rule" aria-hidden="true" />
    </header>
  );
}
