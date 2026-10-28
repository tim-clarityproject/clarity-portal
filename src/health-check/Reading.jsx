import { useEffect, useRef, useState } from 'react';
import { Cross, useDialog } from './parts';

// The reading pop-up for the Privacy Policy and Data Storage Notice (mock-up
// M7b: "This opens the document in a reading pop-up"): full screen on a phone,
// a centred panel on a laptop. Escape and the crosshair close it, and focus
// goes back to the link that opened it. The text is the documents' own, from
// src/content/legal.js (plain text with no portal code), loaded only when one
// is opened. "Open in a new tab" opens the same document's own page
// (READING in words.js).

const CLASSES = { heading: 'rdh', paragraph: 'rdp', list: 'rdl', listItem: 'rdli', link: 'rdk' };

// returnFocus: the link that opened it (Safari doesn't focus a link on click).
export function ReadingPanel({ doc, onClose, returnFocus }) {
  const { boxRef, closeRef } = useDialog(onClose, returnFocus);
  const [state, setState] = useState({ status: 'loading' });
  // A double-click on the link mustn't close it again with its second click.
  const settled = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { settled.current = true; }, 500);
    return () => clearTimeout(t);
  }, []);
  const fromScrim = () => { if (settled.current) onClose(); };

  useEffect(() => {
    let live = true;
    // A plain import: if it can't load, the pop-up says so and the page stays as it is.
    Promise.all([
      import('../content/legal'),
      import('../components/legal/LegalDocBody'),
    ]).then(([{ legalDocuments }, { default: Body }]) => {
      if (live) setState({ status: 'ready', text: legalDocuments[doc.key], Body });
    }).catch(() => {
      if (live) setState({ status: 'error' });
    });
    return () => { live = false; };
  }, [doc.key]);

  const { text, Body } = state;
  return (
    <>
      <div className="vscrim" onClick={fromScrim} aria-hidden="true" />
      <div className="vp rd" role="dialog" aria-modal="true" aria-label={doc.title} ref={boxRef}>
        <div className="vph">
          <h3>{doc.title}</h3>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Cross className="close" /></button>
        </div>
        <div className="rdb" tabIndex={0} aria-label={`${doc.title} text`}>
          <a className="rdn" href={doc.href} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
          {state.status === 'loading' && <div className="loading" role="status" aria-label="Loading"><span className="spin" aria-hidden="true" /></div>}
          {state.status === 'error' && <p className="rdp" role="alert">The document didn’t open. Check your connection and try again, or open it in a new tab.</p>}
          {state.status === 'ready' && (
            <>
              <p className="rdm">{text.lastUpdated}</p>
              <Body blocks={text.blocks} classNames={CLASSES} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
