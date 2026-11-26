import { useEffect, useRef, useState } from 'react';
import { Button, Loading, SlidePanel, useIsPhone } from '../../../components/design';
import { ask } from '../../../lib/agreements/askClient';
import { pageWords } from '../../../lib/agreements/orgInvoice';
import { TextLink } from '../parts';
import { Problem } from '../needsYou/panels';
import '../needsYou/needsyou.css';

// The invoice PDF before it goes (Phase 6b run 3, Group D; M28 s-inv-pdf; brief items 27 and 29): the real PDF, made by
// the server's one PDF (Group E's src/lib/pdf/docs/invoice.js: the invoice, a timesheet page where asked, then each
// attachment) through asks.js 'org_invoice_preview', shown in the browser's own PDF view on a laptop, with Download the
// PDF everywhere (Polish 1, Stage C: M28 v6 "pdf"'s title and line, Send to [organisation]). M28 draws the pages as pictures in the mock-up; the build shows the PDF itself, so what's previewed is
// exactly what goes. Light only, as every PDF is.
//   body: the ask's body (organisationId, sessionIds, entryIds, poNumber, rateMinor, evidenceIds); onSend: Send.

/* global atob, Blob */
const fromBase64 = (b64) => { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i); return out; };

/**
 * Off the live site the server's ask takes its stand-in answer (agreements rule 10): there the page makes the same
 * invoice in the browser from what it shows (C5's rebuilt src/lib/pdf/docs/invoice.js, the business's facts from 068),
 * so the preview is the rebuilt invoice rather than a blank page (M28 v6 "pdf"). The live site always shows the server's.
 */
async function localInvoice(input) {
  const [{ invoicePdf }, { renderPdf }, { loadPdfAssets }, { paperFor }, { businessFacts }] = await Promise.all([
    import('../../../lib/pdf/docs/invoice.js'), import('../../../lib/pdf/render'), import('../../../lib/pdf/assets'), import('../../../lib/pdf/paper'), import('../../../lib/pdf/business'),
  ]);
  const facts = await businessFacts();
  const spec = invoicePdf({ ...input, business: facts || null });
  const assets = await loadPdfAssets(spec);
  const { bytes, fileName } = await renderPdf(spec, { variant: 'light', paper: paperFor({ country: null }), assets });
  return { bytes, fileName };
}

export default function InvoicePreview({ open, onClose, body, onSend, sendLabel = 'Send to their finance team', local = null }) {
  const isPhone = useIsPhone();
  const [made, setMade] = useState(null); // { url, fileName, pages } | { problem }
  const asked = useRef(null);
  const localRef = useRef(local);
  localRef.current = local;
  const key = open ? JSON.stringify(body) : null;
  useEffect(() => {
    if (!open || asked.current === key) return undefined;
    asked.current = key;
    let live = true;
    setMade(null);
    ask('billing', 'org_invoice_preview', body).then(async (answer) => {
      if (!live) return;
      const here = localRef.current;
      if (answer.ok && answer.standIn && here) {
        try {
          const { bytes, fileName } = await localInvoice(here);
          if (!live) return;
          setMade({ url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), fileName, pages: 1 + (here.timesheet ? 1 : 0), standIn: true });
          return;
        } catch { /* the stand-in PDF below */ }
      }
      if (!answer.ok || !answer.pdf) { setMade({ problem: answer.message || 'The PDF wasn’t made. Try again in a moment.' }); return; }
      const url = URL.createObjectURL(new Blob([fromBase64(answer.pdf)], { type: 'application/pdf' }));
      setMade({ url, fileName: answer.fileName || 'Invoice.pdf', pages: Number(answer.pages) || 1, standIn: Boolean(answer.standIn) });
    });
    return () => { live = false; };
  }, [open, key, body]);
  useEffect(() => () => { if (made?.url) URL.revokeObjectURL(made.url); }, [made]);
  useEffect(() => { if (!open) asked.current = null; }, [open]);
  const download = () => {
    if (!made?.url) return;
    const a = document.createElement('a');
    a.href = made.url;
    a.download = made.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Check the PDF" wide
      footer={<div className="cc-panel-foot ny-foot"><TextLink onClick={download}>Download the PDF</TextLink><Button variant="primary" onClick={onSend}>{sendLabel}</Button></div>}>
      <div className="ny-panel">
        {!made && <Loading label="Making the PDF" />}
        {made?.problem && <Problem>{made.problem}</Problem>}
        {made?.url && (
          <>
            <p className="ny-meta"><span>{made.fileName}</span><span>{pageWords(made.pages)}</span></p>
            <p className="ny-say">{made.pages > 1 ? 'One file: the invoice, then the pages that go with it. It goes from your own email.' : 'One file, the invoice. It goes from your own email.'}</p>
            {made.standIn && <p className="ny-hint">Made on this device, off the live site. The live site sends the server’s own copy.</p>}
            {!isPhone && <iframe className="ny-pdf" src={made.url} title={made.fileName} />}
            {isPhone && <p className="ny-hint">Download the PDF to see every page.</p>}
          </>
        )}
      </div>
    </SlidePanel>
  );
}
