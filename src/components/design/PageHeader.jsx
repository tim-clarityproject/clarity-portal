import keepWords from './keepWords';
import './design.css';

// Page header (design reference v3: Page header). The title in Nekst
// capitals and a quiet meta line. No coral line, no overline and no intro
// line under the title (Tim, 23 Oct).
//
// No "i" beside a page title, ever (Tim, 5 Nov, 10:14 to 11:00): the title
// and the page itself make clear what the page is, and an "i" stays only
// beside a term or a combined score that needs explaining. `info` and
// `onSystemLink` are still accepted from older callers and not shown
// ("How the system fits together" goes into the Quick guide and the
// first-visit tip).
//
// meta:   short items for the meta line, e.g. ['Version 2.1', '8 weeks · 28 Sep to 22 Nov'].
// aside:  what sits beside the title, aligned with it: the page's eye
//         (WhoSees), once per page (Tim, 5 Nov, 11:09).
// as:     the heading element (h1 on a real page).
// eslint-disable-next-line no-unused-vars
export default function PageHeader({ title, meta = [], info, onSystemLink, aside, as: Heading = 'h1', className = '' }) {
  const items = meta.filter(Boolean);
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <div className="ds-page-title-row">
        <Heading className="ds-page-title">{keepWords(title)}</Heading>
        {aside && <span className="ds-page-aside">{aside}</span>}
      </div>
      {items.length > 0 && (
        <div className="ds-page-meta">
          {items.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
    </header>
  );
}
