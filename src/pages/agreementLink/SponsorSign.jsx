import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Checkbox, Label, PageOpening, PdfDownload, TextField } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { isOnline } from '../../lib/connection';
import { teamPoints } from '../../lib/agreements/clauses';
import { isNewClause } from '../../lib/billing/agreementText';
import {
  FLOW, FULL_NAME, LINK_WORDS, PAPER, PO_HINT, PO_LABEL, SIGN_NEEDS, SPONSOR_TITLE, YOUR_ROLE, signNeeds, sponsorButton, sponsorSignedLine, sponsorTick,
} from '../../lib/coaching/clientMoney';
import { clientAsk, storedPdf } from '../../lib/coaching/clientAsk';
import SignBox from '../coaching/SignBox';
import { ClausesCard, PointsCard } from '../coaching/AgreementParts';
import LinkFrame, { LinkLoading, LinkMessage } from './LinkFrame';
import MistakeLine from '../../components/agreements/MistakeLine';

// The sponsor signs (Polish 1, Stage C, C3: not drawn in M28 v6, so built from its "sign" patterns: the page opening
// with the organisation and version, The main points and The agreement as cards (the clauses opening one at a time),
// then Sign as a plain section: the purchase order where needed, the full name and role, the typed signature, the tick
// and the one main button, with the PDF for paper under it). Before Polish 1:
// The sponsor signs (Phase 6b run 3, Group C; M28 version 4 s-s-sign and s-s-signed; plan Q23): /sign/:token, by link
// with no account. "Coaching agreement", the organisation and the version, the team's Main points, the agreement's
// clauses to read, "Do you have a purchase order?" where the organisation needs one, the tick for the organisation,
// the full name and role side by side, the signature box (Clear, Type instead), Sign for [organisation], and "Rather
// sign on paper? Download the PDF" (the coach then uploads the signed copy). Signed: M28's centred line. The server
// (Group E's sponsor_sign) records the signature, makes the signed PDF and sends each person's own agreement.
// Difference from M28: the clauses are shown under the points (M28 draws the points only), so "I've read this
// agreement" can be true on the page itself.

export default function SponsorSign() {
  const { token } = useParams();
  const [link, setLink] = useState(undefined);
  const [loadProblem, setLoadProblem] = useState(null);
  const [po, setPo] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [need, setNeed] = useState(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(false);
  const sigRef = useRef(null);

  useEffect(() => {
    let live = true;
    if (!isOnline()) { setLoadProblem(LINK_WORDS.offline); return undefined; }
    supabase.rpc('sponsor_link_open', { p_token: String(token || '') }).then((res) => {
      if (!live) return;
      if (res.error) { setLoadProblem(LINK_WORDS.didntLoad); return; }
      const d = res.data && typeof res.data === 'object' ? res.data : null;
      setLink(d);
      if (d?.sponsor_name) setName((n) => n || d.sponsor_name);
      if (d?.sponsor_role) setRole((r) => r || d.sponsor_role);
    }).catch(() => { if (live) setLoadProblem(LINK_WORDS.didntLoad); });
    return () => { live = false; };
  }, [token]);

  const terms = useMemo(() => (link?.terms && typeof link.terms === 'object' ? { ...link.terms, currency: link.terms.currency || link.currency || 'GBP' } : {}), [link]);
  const coachFirst = link?.coach_first || terms.coachFirst || '';
  const org = link?.org_name || terms.orgName || terms.fundedBy || '';

  if (loadProblem) return <LinkMessage title={SPONSOR_TITLE} line={loadProblem} />;
  if (link === undefined) return <LinkLoading />;
  if (!link) return <LinkMessage title={SPONSOR_TITLE} line={LINK_WORDS.notFound} />;
  if (signed || link.state === 'signed') return <LinkMessage line={sponsorSignedLine(coachFirst)} />;
  if (link.state === 'ended') return <LinkMessage title={SPONSOR_TITLE} line={LINK_WORDS.sponsorEnded(coachFirst)} />;

  let points = [];
  try { points = teamPoints(terms); } catch { points = []; }
  const clauses = (Array.isArray(link.clauses) ? link.clauses : []).filter((c) => c && c.title && (isNewClause(c) || Array.isArray(c.paragraphs)));
  const needsPO = link.needs_po === true;

  const sign = async () => {
    const missing = signNeeds({ agreed, name, hasSignature: Boolean(sigRef.current?.has()) });
    if (missing) { setNeed(missing); return; }
    const typed = Boolean(sigRef.current?.typed);
    const image = typed ? '' : sigRef.current?.image();
    if (!typed && !image) { setNeed(SIGN_NEEDS.signature); return; }
    if (busy) return;
    if (!isOnline()) { setProblem(LINK_WORDS.offline); return; }
    setBusy(true);
    setProblem(null);
    const a = await clientAsk('link', 'sponsor_sign', {
      token, name: name.trim(), role: role.trim(), po: po.trim() || null, ...(typed ? { typed: name.trim() } : { image }), fingerprint: link.fingerprint || null,
    });
    setBusy(false);
    if (!a.ok) { setProblem(a.message); return; }
    setSigned(true);
  };

  const pdf = async () => {
    const a = await clientAsk('link', 'sponsor_pdf', { token });
    if (!a.ok) throw new Error(a.message);
    return storedPdf(a, `${SPONSOR_TITLE}, ${org || 'organisation'}.pdf`);
  };

  const label = [org, link.version ? `Version ${link.version}` : null].filter(Boolean).join(' · ');
  return (
    <LinkFrame>
      <PageOpening label={label} title={SPONSOR_TITLE} line={link.personal_note || `Read the agreement, then sign for ${org || 'your organisation'}.`} />
      <PointsCard points={points} />
      <ClausesCard clauses={clauses} idPrefix="sp" />
      <section className="cl-stack cl-sponsor-sign" aria-labelledby="sp-sign">
        <Label as="h2"><span id="sp-sign">{FLOW.signQuestion}</span></Label>
        {needsPO && <TextField label={PO_LABEL} placeholder={PO_HINT} value={po} maxLength={80} onChange={(e) => setPo(e.target.value)} />}
        <div className="cl-two">
          <TextField label={FULL_NAME} autoComplete="name" value={name} maxLength={160} onChange={(e) => { setName(e.target.value); setNeed(null); }} />
          <TextField label={YOUR_ROLE} autoComplete="organization-title" value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} />
        </div>
        <SignBox ref={sigRef} name={name} onChange={() => setNeed(null)} />
        <Checkbox checked={agreed} onChange={(v) => { setAgreed(v); setNeed(null); }}>{sponsorTick(org)}</Checkbox>
        {need && <MistakeLine>{need}</MistakeLine>}
        {problem && <MistakeLine>{problem}</MistakeLine>}
        <div className="cl-acts"><Button variant="primary" aria-busy={busy || undefined} onClick={sign}>{sponsorButton(org)}</Button></div>
        <PdfDownload lightOnly variant="text" label={PAPER} getDocument={pdf} />
      </section>
    </LinkFrame>
  );
}
