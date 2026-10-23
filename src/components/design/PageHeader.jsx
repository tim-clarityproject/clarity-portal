import { useEffect, useId, useState } from 'react';
import { SystemLink } from './Button';
import InfoIcon from './InfoIcon';
import './design.css';

// Page header (design reference v3: Page header). The title in Nekst
// capitals, a quiet meta line (version, dates, the system link), then the
// short coral rule, once per page, here only. No overline above the title
// and no intro line under it: the title is enough, and any explanation
// sits behind the small "i" beside it (Tim, 23 Oct).
//
// meta:           short items for the meta line, e.g. ['Version 2.1', '8 weeks · 28 Sep to 22 Nov'].
// info:           the page's one-line explanation, shown when the "i" is tapped.
// onSystemLink:   shows "How the system fits together" in the meta line.
// as:             the heading element (h1 on a real page).
export default function PageHeader({ title, meta = [], info, onSystemLink, as: Heading = 'h1', className = '' }) {
  const infoId = useId();
  const [infoOpen, setInfoOpen] = useState(false);

  // Escape closes the explanation, like every other panel.
  useEffect(() => {
    if (!infoOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setInfoOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [infoOpen]);
  const items = meta.filter(Boolean);
  const hasMeta = items.length > 0 || onSystemLink;
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <div className="ds-page-title-row">
        <Heading className="ds-page-title">{title}</Heading>
        {info && (
          <button
            type="button"
            className="ds-help-toggle ds-page-info-toggle"
            aria-expanded={infoOpen}
            aria-controls={infoId}
            aria-label={`About ${typeof title === 'string' ? title : 'this page'}`}
            onClick={() => setInfoOpen((open) => !open)}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {info && (
        <p id={infoId} className="ds-page-info" hidden={!infoOpen}>{info}</p>
      )}
      {hasMeta && (
        <div className="ds-page-meta">
          {items.map((item) => <span key={item}>{item}</span>)}
          {onSystemLink && <SystemLink onClick={onSystemLink} />}
        </div>
      )}
      <div className="ds-rule" aria-hidden="true" />
    </header>
  );
}
