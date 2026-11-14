import { useEffect, useState } from 'react';
import { Popup } from '../components/design/Dialogs';
import { Loading } from '../components/design/Status';

// The reading pop-up for the Privacy Policy and Data Storage Notice: the
// shared centred pop-up (full screen on a phone). Escape and the crosshair
// close it, and focus goes back to the link that opened it. The text is the
// documents' own, from src/content/legal.js (plain text with no portal
// code), loaded only when one is opened. "Open in a new tab" opens the same
// document's own page (READING in words.js).

const CLASSES = { heading: 'hc-read-h', paragraph: 'hc-read-p', list: 'hc-read-list', listItem: 'hc-read-p', link: 'hc-read-link' };

export function ReadingPanel({ doc, onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  const key = doc?.key;
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    setState({ status: 'loading' });
    // A plain import: if it can't load, the pop-up says so and the page stays as it is.
    Promise.all([
      import('../content/legal'),
      import('../components/legal/LegalDocBody'),
    ]).then(([{ legalDocuments }, { default: Body }]) => {
      if (live) setState({ status: 'ready', text: legalDocuments[key], Body });
    }).catch(() => {
      if (live) setState({ status: 'error' });
    });
    return () => { live = false; };
  }, [key]);

  const { text, Body } = state;
  return (
    <Popup open={!!doc} onClose={onClose} title={doc?.title || ''}>
      {doc && (
        <div className="hc-read">
          <a className="ds-link" href={doc.href} target="_blank" rel="noopener noreferrer">Open in a new tab</a>
          {state.status === 'loading' && <Loading label="Loading" />}
          {state.status === 'error' && <p className="hc-read-p" role="alert">The document didn’t open. Check your connection and try again, or open it in a new tab.</p>}
          {state.status === 'ready' && (
            <>
              <p className="hc-read-meta">{text.lastUpdated}</p>
              <Body blocks={text.blocks} classNames={CLASSES} />
            </>
          )}
        </div>
      )}
    </Popup>
  );
}
