import { useEffect, useId, useRef, useState } from 'react';

// The Light / Dark choice for every PDF (PDF rule 2): one Download PDF button,
// then "Light, for printing" or "Dark, for sharing". Used by PdfDownload and by
// any other trigger (the Health Check's Download a PDF card), so they always
// match. Desktop: a small panel by its trigger. Phone: a bottom sheet.

const OPTIONS = [
  { variant: 'light', name: 'Light', note: 'For printing' },
  { variant: 'dark', name: 'Dark', note: 'For sharing' },
];

/** A miniature page: a title, the coral line, a few text lines and a small bar chart. */
function Thumb({ variant }) {
  const light = variant === 'light';
  const paper = light ? 'var(--text)' : 'var(--bg)';
  const ink = light ? 'var(--placeholder)' : 'var(--btn-line)';
  return (
    <svg className="ds-pdfthumb" viewBox="0 0 56 79" width="56" height="79" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="55" height="78" rx="4" style={{ fill: paper, stroke: 'var(--line)' }} />
      <rect x="6" y="8" width="30" height="2.5" rx="1" style={{ fill: ink }} />
      <rect x="6" y="13" width="9" height="1" style={{ fill: 'var(--coral)' }} />
      <rect x="6" y="18" width="40" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <rect x="6" y="23" width="34" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <rect x="6" y="32" width="36" height="3" style={{ fill: 'var(--coral)' }} />
      <rect x="6" y="38" width="28" height="3" style={{ fill: 'var(--coral)' }} />
      <rect x="6.25" y="44.25" width="17.5" height="2.5" style={{ fill: 'none', stroke: ink, strokeWidth: 0.5 }} />
      <rect x="6" y="58" width="44" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <rect x="6" y="63" width="38" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <rect x="6" y="68" width="42" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
    </svg>
  );
}

function usePhone() {
  const [phone, setPhone] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 768px)').matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const q = window.matchMedia('(max-width: 768px)');
    const on = (e) => setPhone(e.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose closes the panel; focus is returned by the caller via `returnFocusRef`
 * @param {(variant: 'light'|'dark') => void} props.onChoose
 * @param {{current: HTMLElement|null}} props.containerRef wraps the trigger and the panel: clicks inside it are not "outside"
 * @param {{current: HTMLElement|null}} props.returnFocusRef the trigger button
 * @param {'up'|'down'} [props.placement] desktop: open above (default) or below the trigger
 * @param {'left'|'right'} [props.align] desktop: line up with the trigger's left or right edge (default)
 */
export default function PdfChoice({ open, onClose, onChoose, containerRef, returnFocusRef, placement = 'up', align = 'right' }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const phone = usePhone();

  // Focus the first option (Light) when it opens; nothing is pre-selected.
  useEffect(() => {
    if (open) panelRef.current?.querySelector('.ds-pdfopt')?.focus();
  }, [open]);

  // Click or tap outside closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (!phone && containerRef?.current?.contains(e.target)) return; // the trigger toggles itself
      onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, phone, onClose, containerRef]);

  if (!open) return null;

  const close = () => {
    onClose();
    returnFocusRef?.current?.focus();
  };

  const onKeyDown = (e) => {
    const opts = [...panelRef.current.querySelectorAll('.ds-pdfopt')];
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      opts[(i + 1 + opts.length) % opts.length]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      opts[(i - 1 + opts.length) % opts.length]?.focus();
    } else if (e.key === 'Tab' && phone) {
      // keep focus inside the sheet
      const all = [...panelRef.current.querySelectorAll('button')];
      const j = all.indexOf(document.activeElement);
      if (e.shiftKey && j <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
      else if (!e.shiftKey && j === all.length - 1) { e.preventDefault(); all[0].focus(); }
    }
  };

  const choose = (variant) => {
    onClose();
    onChoose(variant);
  };

  const panel = (
    <div
      ref={panelRef}
      className={phone ? 'ds-pdfsheet' : `ds-pdfpop${placement === 'down' ? ' ds-pdfpop--down' : ''}${align === 'left' ? ' ds-pdfpop--left' : ''}`}
      role="dialog"
      aria-modal={phone ? 'true' : undefined}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <p id={titleId} className="ds-pdftitle">Choose your PDF</p>
      <div className="ds-pdfopts">
        {OPTIONS.map((o) => (
          <button key={o.variant} type="button" className="ds-pdfopt" aria-label={`${o.name}, ${o.note.toLowerCase()}`} onClick={() => choose(o.variant)}>
            <Thumb variant={o.variant} />
            <span className="ds-pdfname">{o.name}</span>
            <span className="ds-pdfnote">{o.note}</span>
          </button>
        ))}
      </div>
      {phone && <button type="button" className="ds-pdfcancel" onClick={close}>Cancel</button>}
    </div>
  );

  if (!phone) return panel;
  return (
    <>
      <div className="ds-pdfscrim" aria-hidden="true" />
      {panel}
    </>
  );
}
