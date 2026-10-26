import { useRef, useState } from 'react';
import { Button } from './Button';
import PdfChoice from './PdfChoice';
import { savePdf, PDF_ERROR } from './pdfSave';

// The one "Download PDF" button (PDF rule 2). It opens the Light / Dark choice,
// then makes the PDF on the shared template and saves it. The PDF code loads
// only when a PDF is asked for. A second tap while one is being made does
// nothing, so a double tap never saves two files.

/**
 * @param {Object} props
 * @param {() => Object|Promise<Object>} props.getDocument the document description for the template
 * @param {'primary'|'outline'} [props.variant]
 * @param {'up'|'down'} [props.placement] where the choice opens on desktop
 * @param {'left'|'right'} [props.align]
 * @param {string} [props.className]
 */
export default function PdfDownload({ getDocument, variant = 'outline', placement = 'up', align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);

  const choose = async (look) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      await savePdf(getDocument, look);
    } catch (error) {
      console.error('[PdfDownload] the PDF was not made:', error);
      setMessage(PDF_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className={`ds-pdfmenu ${className}`.trim()} ref={wrapRef}>
      <Button
        ref={buttonRef}
        variant={variant}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? 'Making your PDF' : 'Download PDF'}
      </Button>
      <PdfChoice
        open={open}
        onClose={() => setOpen(false)}
        onChoose={choose}
        containerRef={wrapRef}
        returnFocusRef={buttonRef}
        placement={placement}
        align={align}
      />
      {message && <p className="ds-pdfmessage" role="alert">{message}</p>}
    </div>
  );
}
