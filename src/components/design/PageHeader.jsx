import { useId } from 'react';
import { SystemLink } from './Button';
import InfoIcon from './InfoIcon';
import useInfoToggle from './useInfoToggle';
import './design.css';

// Page header (design reference v3: Page header). The title in Nekst
// capitals and a quiet meta line (version, dates, the system link). No
// coral line under the title (Tim, 23 Oct), no overline above it and no
// intro line under it: the title is enough, and any explanation
// sits behind the small "i" beside it (Tim, 23 Oct).
//
// meta:           short items for the meta line, e.g. ['Version 2.1', '8 weeks · 28 Sep to 22 Nov'].
// info:           the page's one-line explanation, behind the "i" (it opens
//                 as every "i" does: useInfoToggle).
// onSystemLink:   shows "How the system fits together" in the meta line.
// as:             the heading element (h1 on a real page).
export default function PageHeader({ title, meta = [], info, onSystemLink, as: Heading = 'h1', className = '' }) {
  const infoId = useId();
  const { open: helpOpen, buttonRef: helpButtonRef, panelRef: helpPanelRef, buttonProps: helpProps } = useInfoToggle();
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
            aria-controls={infoId}
            aria-label={`About ${typeof title === 'string' ? title : 'this page'}`}
            ref={helpButtonRef}
            aria-expanded={helpOpen}
            {...helpProps}
          >
            <InfoIcon />
          </button>
        )}
      </div>
      {info && (
        <p id={infoId} ref={helpPanelRef} className="ds-page-info" hidden={!helpOpen}>{info}</p>
      )}
      {hasMeta && (
        <div className="ds-page-meta">
          {items.map((item) => <span key={item}>{item}</span>)}
          {onSystemLink && <SystemLink onClick={onSystemLink} />}
        </div>
      )}
    </header>
  );
}
