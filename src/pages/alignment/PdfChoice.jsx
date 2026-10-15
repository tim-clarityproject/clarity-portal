import { useEffect, useId, useRef, useState } from 'react';

// The Light / Dark choice for the PDF. One component, used by both the coral
// Download PDF button in the footer and the Download a PDF card, so the two
// always match. Desktop: a small panel above its anchor. Phone: a bottom sheet.

const OPTIONS = [
  { variant: 'light', name: 'Light', note: 'For printing' },
  { variant: 'dark', name: 'Dark', note: 'For screens' },
];

/** A miniature A4 page: a few text lines, a tiny dot field, a coral and a mint dot. */
function Thumb({ variant }) {
  const light = variant === 'light';
  const paper = light ? 'var(--text)' : 'var(--bg)';
  const ink = light ? 'var(--placeholder)' : 'var(--btn-line)';
  const field = light ? 'var(--line)' : 'var(--btn-line)';
  const dots = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 5; c += 1) dots.push(<circle key={`${r}-${c}`} cx={4 + c * 5} cy={4 + r * 5} r="0.9" style={{ fill: field }} />);
  }
  return (
    <svg className="al-thumb" viewBox="0 0 56 79" width="56" height="79" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="55" height="78" rx="4" style={{ fill: paper, stroke: 'var(--line)' }} />
      <rect x="6" y="8" width="26" height="2" rx="1" style={{ fill: ink }} />
      <rect x="6" y="14" width="40" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <rect x="6" y="19" width="34" height="1.5" rx="0.75" style={{ fill: ink, opacity: 0.6 }} />
      <g transform="translate(15 30)">
        {dots}
        <circle cx="9" cy="9" r="2.4" style={{ fill: 'var(--coral)' }} />
        <circle cx="19" cy="4" r="2.4" style={{ fill: 'var(--mint)' }} />
      </g>
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
 */
export default function PdfChoice({ open, onClose, onChoose, containerRef, returnFocusRef }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const phone = usePhone();

  // Focus the first option (Light) when it opens; nothing is pre-selected.
  useEffect(() => {
    if (open) panelRef.current?.querySelector('.al-pdfopt')?.focus();
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
    const opts = [...panelRef.current.querySelectorAll('.al-pdfopt')];
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
      className={phone ? 'al-pdfsheet' : 'al-pdfpop'}
      role="dialog"
      aria-modal={phone ? 'true' : undefined}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
    >
      <p id={titleId} className="al-pdftitle">Choose your PDF</p>
      <div className="al-pdfopts">
        {OPTIONS.map((o) => (
          <button key={o.variant} type="button" className="al-pdfopt" onClick={() => choose(o.variant)}>
            <Thumb variant={o.variant} />
            <span className="al-pdfname">{o.name}</span>
            <span className="al-pdfnote">{o.note}</span>
          </button>
        ))}
      </div>
      {phone && <button type="button" className="al-pdfcancel" onClick={close}>Cancel</button>}
    </div>
  );

  if (!phone) return panel;
  return (
    <>
      <div className="al-pdfscrim" aria-hidden="true" />
      {panel}
    </>
  );
}
