import { useCallback, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { themeProps, useThemeScope } from './themeScope';
import './design.css';

// What an ⓘ explains, floating over the page (Tim's preview check, 3 Nov
// 2026; experience rule 45: nothing on the page moves). One pop-up for
// every ⓘ: the page title's (PageHeader), a section's (Section), a guided
// tool step's (GuidedTool) and the "i" with words (InfoWords). It opens as
// every ⓘ does (useInfoToggle), and looks like the chart pop-up (ChartTips)
// in its wider form, as the Health Check's ⓘ.
//
// - It sits above its ⓘ, centred on it, and flips below when there is no
//   room above; it stays at least 12px inside both screen edges and wraps
//   rather than run off the side.
// - It stays with its ⓘ when the page scrolls, and is display none when
//   closed, so the page never moves.
// - It renders into document.body inside its own .ui-root (rule 17).
//
//   const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
//   <button ref={buttonRef} aria-expanded={open} aria-controls={id} {...buttonProps}>…</button>
//   <InfoPop id={id} open={open} anchorRef={buttonRef} panelRef={panelRef}>…</InfoPop>
//
// lines: a sentence or a list of sentences, one per line (writing rule
// 49); or children, for anything else. A line can also be one of these
// (M7b version 51; Tim, 14 Nov, 09:41: "what it is and isn't" explainers):
//   { title }          the pop-up's own name, first ("What is a Success Factor?")
//   { term, meaning }  a word, then what it means under it, quieter
//   { heading }        a short heading part-way down ("What it’s not:")
//   { bullets: [] }    a short bullet list
const lineKey = (line, n) => (typeof line === 'string' ? line : `${n}:${line.title || line.term || line.heading || line.bullets?.[0] || ''}`);

function PopLine({ line }) {
  if (line == null || typeof line !== 'object') return <span className="ds-infopop-line">{line}</span>;
  if (line.title) return <b className="ds-infopop-title">{line.title}</b>;
  if (line.term) {
    return (
      <span className="ds-infopop-term">
        <span className="ds-infopop-term-word">{line.term}</span>
        <span className="ds-infopop-term-meaning">{line.meaning}</span>
      </span>
    );
  }
  if (line.heading) return <span className="ds-infopop-heading">{line.heading}</span>;
  if (line.bullets) {
    return <ul className="ds-infopop-bullets">{line.bullets.map((b) => <li key={b}>{b}</li>)}</ul>;
  }
  return null;
}

export default function InfoPop({ id, open, anchorRef, panelRef, lines, children, className = '' }) {
  const scope = useThemeScope();

  const place = useCallback(() => {
    const box = panelRef.current;
    const anchor = anchorRef.current;
    if (!open || !box || !anchor) return;
    const cs = getComputedStyle(box);
    const edge = parseFloat(cs.getPropertyValue('--tip-edge')) || 12;
    const gap = parseFloat(cs.getPropertyValue('--tip-gap')) || 8;
    const viewW = document.documentElement.clientWidth;
    const viewH = document.documentElement.clientHeight;
    box.style.maxWidth = `min(var(--info-pop-max-w), ${viewW - 2 * edge}px)`;
    box.style.left = '0px';
    box.style.top = '0px';
    // The visible icon, not its 44px tap area.
    const icon = anchor.querySelector('.ds-info') || anchor;
    const mark = icon.getBoundingClientRect();
    const { width: w, height: h } = box.getBoundingClientRect();
    const centre = mark.left + mark.width / 2;
    const left = Math.max(edge, Math.min(viewW - edge - w, centre - w / 2));
    let top = mark.top - gap - h;
    if (top < edge) top = mark.bottom + gap;
    // An ⓘ scrolled almost out of sight: still inside the screen.
    top = Math.max(edge, Math.min(viewH - edge - h, top));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }, [open, anchorRef, panelRef]);

  useLayoutEffect(place, [place, lines, children]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.fonts?.ready?.then(place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const list = lines == null ? null : (Array.isArray(lines) ? lines : [lines]);
  return createPortal(
    <div className="ui-root ds-portal" {...themeProps(scope)}>
      <div id={id} ref={panelRef} className={`ds-infopop ${className}`.trim()} role="note" hidden={!open}>
        {list ? list.map((line, n) => <PopLine key={lineKey(line, n)} line={line} />) : children}
      </div>
    </div>,
    document.body,
  );
}
