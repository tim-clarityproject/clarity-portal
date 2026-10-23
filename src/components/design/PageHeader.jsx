import { SystemLink } from './Button';
import './design.css';

// Page header (design reference v3: Page header). The title in Nekst
// capitals, a quiet meta line (version, dates, the system link), then the
// short coral rule, once per page, here only. No overline above the title
// and no intro line under it: the title is enough, and any explanation
// sits behind the small "i" (Tim, 23 Oct).
//
// meta:           short items for the meta line, e.g. ['Version 2.1', '8 weeks · 28 Sep to 22 Nov'].
// onSystemLink:   shows "How the system fits together" in the meta line.
// as:             the heading element (h1 on a real page).
export default function PageHeader({ title, meta = [], onSystemLink, as: Heading = 'h1', className = '' }) {
  const hasMeta = meta.length > 0 || onSystemLink;
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <Heading className="ds-page-title">{title}</Heading>
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
