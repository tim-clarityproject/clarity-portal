import { useRef, useState } from 'react';
import { SlidePanel } from './Dialogs';
import { ErrorMessage } from './Status';
import { savePdf, PDF_ERROR } from './pdfSave';
import { isOffline, needsConnection } from '../../lib/friendlyError';
import './design.css';

// The Light / Dark choice as a side panel (M7b version 51: the results'
// one coral button, "Download my PDF", opens "Download PDF" with "Light,
// for printing" and "Dark, for sharing"; PDF rule 2). For a page whose
// bottom bar's button is the download itself; everywhere else the choice
// opens beside its own button (PdfDownload). The PDF code loads only when
// a version is chosen, and a second press while one is being made does
// nothing.
//
//   getDocument: () => the document description for the template (or a promise of one)
const OPTIONS = [
  { look: 'light', words: 'Light, for printing' },
  { look: 'dark', words: 'Dark, for sharing' },
];

export default function PdfPanel({ open, onClose, getDocument }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const busyRef = useRef(false);
  // Each opening starts with nothing said.
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setMessage('');
  }
  const choose = async (look) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    try {
      await savePdf(getDocument, look);
      onClose();
    } catch (error) {
      console.error('[PdfPanel] the PDF was not made:', error);
      setMessage(isOffline(error) ? needsConnection('This PDF') : PDF_ERROR);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Download PDF">
      <div className="ds-listbox ds-sheet-options ds-pdfpanel" role="group" aria-label="Choose a version" aria-busy={busy || undefined}>
        {OPTIONS.map((o) => (
          <button key={o.look} type="button" className="ds-option" onClick={() => choose(o.look)}>
            <span className="ds-option-text">{o.words}</span>
          </button>
        ))}
      </div>
      {busy && <p className="ds-pdfpanel-busy" role="status">Making your PDF</p>}
      {message && <ErrorMessage>{message}</ErrorMessage>}
    </SlidePanel>
  );
}
