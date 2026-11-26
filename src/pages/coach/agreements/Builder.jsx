import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AddLink, Button, Card, CalendarBar, Chevron, ControlRow, InlineChoice, Loading, MonthGrid, MoreLink, PageOpening, QuickAdd, Row, Rows,
  TextBox, TextField, ToolFrame, monthTitle, useIsPhone, useToast,
} from '../../../components/design';
import { ONE_TAP_MS } from '../../../components/design/GuidedTool';
import { newId, removeRow, rowsOf, saveRow } from '../../../lib/coach/store';
import { checkTerms, kindOf, selfFunded } from '../../../lib/agreements/terms';
import { CURRENCY, moneyText, rateText } from '../../../lib/agreements/currency';
import { gbpValue, underWarning } from '../../../lib/agreements/fx';
import { findCurrencies, findPlaces, placeLine, currencyName } from '../../../lib/agreements/places';
import { quoteNumber } from '../../../lib/agreements/quote';
import { clauseKeys } from '../../../lib/agreements/standardWording';
import { wordingLine } from '../../../lib/agreements/differences';
import {
  LENGTH_CHOICES, MOMENTUM_CHOICES, NOTICE_CHOICES, OFTEN_CHOICES, TERM_CHOICES, WHERE_CHOICES,
  answer, asQuestionnaire, blankFrom, checkLines, discountOf, feeRows, firstOfGroup, groupOf, lengthOf, localChoices, mainPrice, offerLine, perWords,
  poOf, questionKeys, questionWords, relocal, settleChoices, settleOf, soFar, termRows, termWords,
} from '../../../lib/agreements/questions';
import { afterRhythm, momentumWeeks } from '../../../lib/agreements/endDate';
import {
  RETAINER_SESSIONS, TEAM_SESSIONS, addDiscount, firstOf, newDraft, nextVersionDraft, packageChange, packageTerms, possessive, rateOf, sendWords,
  startPackages, termsFromPackage, isUntouched,
} from '../../../lib/coach/agreementBuilder';
import { builderClosed } from '../../../content/pageLines/coach';
import { Back, useCoachPortal } from '../parts';
import { Answer, FindBox, Hint, MoneyBox, SAVE_PROBLEM, useAgreementDraft, useRates } from './builderParts';
import { useSavedSignature, useSend } from './useSend';
import MistakeLine from '../../../components/agreements/MistakeLine';

// The agreement builder as a questionnaire (Polish 1, Stage C; M28 version 6, "build"; Tim, 25 Nov 18:10):
// /coach/agreements/:id/edit, one question per screen in focus mode (ToolFrame: × "Close and save the draft", "Question
// 3 of 18", the progress line). M28's order and words, the group (Who, What, When, Money, Included, Terms) and the "So
// far:" line above each question; every answer filled in from the package, so Next works at once; choosing an answer
// moves on by itself; the last screen, "Does this read right?", says it in plain sentences, each with Change, which
// goes through that group's questions and back to the check. Which questions, their words and what each answer changes
// are src/lib/agreements/questions.js; prices, dates and lines come from the engine. Every change is kept on the
// device at once and sent (the store's queue). `?q=` is the question, so a reload keeps the place; `?renew=<agreement
// id>` drafts the next term; a package's id edits that package's own defaults (Settings, Agreements) the same way.

export default function Builder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state } = useCoachPortal();
  const pkg = rowsOf(state, 'pricing_packages').find((p) => p.id === id) || null;
  if (pkg) return <PackageBuilder key={pkg.id} pkg={pkg} />;
  return <AgreementBuilder key={id} id={id} renew={params.get('renew')} />;
}

/** Makes the draft the page edits when there isn't one yet: the next 6 months (?renew=), or the next version. */
function useMakeDraft({ renew, d }) {
  const navigate = useNavigate();
  const { userId, coach, isOwner, todayKey, agreements = [], agreementVersions = [], clients = [], organisations = [] } = d.portal;
  const made = useRef(false);
  useEffect(() => {
    if (made.current || d.loading) return;
    if (renew) {
      const from = agreements.find((a) => a.id === renew);
      if (!from) return;
      made.current = true;
      const version = agreementVersions.filter((v) => v.agreement_id === from.id && (v.status === 'signed' || v.status === 'sent')).sort((a, b) => b.version - a.version)[0];
      const profile = clients.find((c) => c.id === from.profile_id) || null;
      const organisation = !profile ? organisations.find((o) => o.id === from.organisation_id) || null : null;
      const draft = newDraft({ who: { profile, organisation }, coach, isOwner, ids: { agreementId: newId(), versionId: newId() }, todayKey, renewFrom: { agreement: from, version } });
      saveRow(userId, 'agreements', draft.agreement).then(() => saveRow(userId, 'agreement_versions', draft.version))
        .then(() => navigate(`/coach/agreements/${draft.agreement.id}/edit`, { replace: true })).catch(() => { made.current = false; });
      return;
    }
    if (d.agreement && !d.draft && d.versions.length && d.versions.every((v) => v.status !== 'draft')) {
      made.current = true;
      saveRow(userId, 'agreement_versions', nextVersionDraft({ agreement: d.agreement, versions: d.versions, versionId: newId(), coachId: coach.id })).catch(() => { made.current = false; });
    }
  }, [renew, d.loading, d.agreement, d.draft, d.versions, agreements, agreementVersions, clients, organisations, coach, isOwner, todayKey, userId, navigate]);
}

/** The question in the address (?q=), and whether Change opened it from the check (?from=check). */
function useStep(keys) {
  const [params, setParams] = useSearchParams();
  const asked = params.get('q');
  const key = keys.includes(asked) ? asked : keys[0];
  const fromCheck = params.get('from') === 'check';
  const go = useCallback((next, { check = false } = {}) => {
    const p = new URLSearchParams(params);
    p.set('q', next);
    if (check) p.set('from', 'check'); else p.delete('from');
    setParams(p, { replace: true });
  }, [params, setParams]);
  return { key, fromCheck, go };
}

function AgreementBuilder({ id, renew }) {
  const navigate = useNavigate();
  const toast = useToast();
  const d = useAgreementDraft(id);
  useMakeDraft({ renew, d });
  const { agreement, draft, party, portal } = d;
  const quoteOut = draft ? rowsOf(portal.state, 'agreement_quotes').find((q) => q.version_id === draft.id && q.status === 'sent') || null : null;

  if (!agreement || !draft) {
    if (d.loading || renew || agreement) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the agreement" /></div></div>;
    return (
      <div className="cc-page"><div className="cc-col">
        <Back to="Clients" onClick={() => navigate('/coach/clients')} />
        <PageOpening title="Agreement" line="That agreement isn’t here. It may have been deleted on another device." />
      </div></div>
    );
  }
  if (quoteOut) {
    return (
      <div className="cc-page"><div className="cc-col ab-page">
        <Back to={party.name || 'Back'} onClick={() => navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : '/coach/clients')} />
        <PageOpening label={party.name} title={draft.version > 1 ? `Version ${draft.version}` : 'New agreement'}
          line={`This version is out as quote ${quote(quoteOut)}, so it can’t change. Withdraw the quote to edit it.`}
          action={<Button variant="primary" onClick={() => saveRow(d.userId, 'agreement_quotes', { ...quoteOut, status: 'withdrawn' })
            .then(() => toast.saved({ message: 'Quote withdrawn', long: true, onUndo: () => saveRow(d.userId, 'agreement_quotes', quoteOut) }))
            .catch(() => toast.error(SAVE_PROBLEM))}>Withdraw the quote</Button>} />
      </div></div>
    );
  }
  return <AgreementQuestions key={draft.id} d={d} />;
}
const quote = (q) => (q.number ? quoteNumber(q.number) : '').trim() || '';

function AgreementQuestions({ d }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { agreement, draft, party, portal } = d;
  const { coach, isOwner, organisations = [], todayKey } = portal;
  const pkgs = useStartPackages();
  const saved = useSavedSignature(d.userId);
  const send = useSend(d);
  const first = party.first || 'them';
  const isPhone = useIsPhone();
  const forOrg = !agreement.profile_id;
  const profile = (portal.clients || []).find((c) => c.id === agreement.profile_id) || null;
  const ownOrg = profile?.organisation_id ? organisations.find((o) => o.id === profile.organisation_id) || null : null;

  // The draft in the questionnaire's shape (a package's total spread over its months, the sessions worked out).
  const [terms, setTermsState] = useState(() => asQuestionnaire(draft.terms || {}));
  const termsRef = useRef(terms);
  const overrides = draft.overrides || {};
  const [note, setNote] = useState(draft.personal_note || '');
  const [sendAs, setSendAs] = useState(draft.send_as === 'quote' ? 'quote' : 'agreement');
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const rate = rateOf(d.rates, terms.currency || 'GBP').unitsPerGbp;

  // Any answer marks the draft as answered (P4): an untouched one is opened again by New agreement, and × removes it.
  const save = useCallback((given, opts = {}) => {
    const next = opts.quiet || given.answered ? given : { ...given, answered: true };
    termsRef.current = next;
    setTermsState(next);
    setProblem(null);
    return d.save(next, { overrides, ...opts });
  }, [d, overrides]);
  // Kept once in its new shape, so the client page, the check and the PDF read the same terms.
  useEffect(() => {
    if (JSON.stringify(terms) !== JSON.stringify(draft.terms || {})) d.save(terms, { overrides });
  // Only on the first draw: later changes save as they're made.
  }, []);
  // Today's rate arrives after the page: the client's figure follows it (their own figure stays).
  useEffect(() => {
    if (!rate || (terms.currency || 'GBP') === 'GBP' || terms.localMode === 'own') return;
    const next = relocal(termsRef.current, rate);
    if (mainPrice(next) !== mainPrice(termsRef.current)) save(next, { quiet: true });
  }, [rate]);

  const ctx = { first, orgName: ownOrg?.name || null, rate, forOrg, coachFirst: firstOf(coach?.display_first_name || coach?.full_name) || 'you' };
  const keysOf = (t) => questionKeys(t, { forOrg });
  const keys = keysOf(terms);
  const { key, fromCheck, go } = useStep(keys);
  const index = keys.indexOf(key);
  const last = key === 'check';

  const next = useCallback(() => {
    const ks = keysOf(termsRef.current);
    const i = ks.indexOf(key);
    if (fromCheck) {
      const nk = ks[i + 1];
      if (nk && nk !== 'check' && groupOf(nk) === groupOf(key)) go(nk, { check: true });
      else go('check');
      return;
    }
    if (i < ks.length - 1) go(ks[i + 1]);
  // keysOf reads only forOrg.
  }, [key, fromCheck, go, forOrg]);
  const nextRef = useRef(next);
  nextRef.current = next;
  const soon = () => setTimeout(() => nextRef.current(), ONE_TAP_MS);
  const set = (k, value, opts) => save(answer(termsRef.current, k, value, ctx), opts);

  const close = async () => {
    await d.flush();
    // A new draft nobody answered anything in isn't kept (P4): × leaves nothing behind.
    if (isUntouched(agreement, d.versions) && !termsRef.current.answered) {
      try {
        await removeRow(d.userId, 'agreement_versions', draft.id);
        await removeRow(d.userId, 'agreements', agreement.id);
        navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : agreement.organisation_id ? `/coach/organisations/${agreement.organisation_id}` : '/coach/clients');
        toast.show('Closed. Nothing was answered, so no draft was kept.');
        return;
      } catch { /* kept as a draft, as before */ }
    }
    navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : agreement.organisation_id ? `/coach/organisations/${agreement.organisation_id}` : '/coach/clients');
    toast.show(builderClosed(party.name ? `${possessive(first)} page` : 'their page'));
  };

  // A package chosen: its answers fill what follows; who it's with, the start, the place and the currency stay.
  const choosePackage = (value) => {
    const t = termsRef.current;
    if (value === 'blank') {
      save(blankFrom(t), { agreementChange: { package_id: null, agreement_kind: 'sessions' } });
      return;
    }
    const p = pkgs.find((x) => x.id === value);
    if (!p) return;
    const keep = ['clientName', 'clientFirst', 'coachName', 'coachFirst', 'funder', 'fundedBy', 'orgName', 'sponsor', 'needsPO', 'poNumber', 'poAnswer',
      'organisationId', 'invoicesEmail', 'startsOn', 'clientZone', 'basedIn', 'currency', 'localMode', ...(t.funder === 'org' ? ['dueDays', 'offerUpfront'] : [])];
    const fresh = termsFromPackage(p, { funded: !selfFunded(t), orgName: t.orgName, clientFirst: first, startsOn: t.startsOn });
    const merged = { ...fresh, ...Object.fromEntries(keep.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])) };
    if (kindOf(merged) === 'oneoff') merged.oneoff = { ...merged.oneoff, on: t.startsOn };
    const shaped = relocal(asQuestionnaire({ ...merged, currency: 'GBP', gbpMinor: undefined, gbpRateMinor: undefined }), null);
    const withCur = (t.currency || 'GBP') !== 'GBP' ? relocal({ ...shaped, currency: t.currency, localMode: t.localMode || 'up' }, rate) : shaped;
    const k = kindOf(withCur);
    save(withCur, {
      personalNote: p.personal_note ? p.personal_note.replace(/\[name\]|\{name\}/gi, first) : undefined,
      agreementChange: { package_id: p.id, agreement_kind: k, ...(k === 'team' ? { kind: 'sponsor' } : {}) },
    });
  };

  const sendIt = async () => {
    const t = termsRef.current;
    const lines = checkTerms(t);
    if (lines.length) { setProblem(lines[0]); return; }
    await d.save(t, { overrides, personalNote: note, fields: { send_as: sendAs }, now: true });
    const valid = Number(t.expiryDays) || 30;
    if (!saved) { navigate(`/coach/agreements/${agreement.id}/sign${sendAs === 'quote' ? `?as=quote&valid=${valid}` : ''}`); return; }
    setBusy(true);
    const answer2 = await send({ sendAs, validDays: valid, personalNote: note, signature: { saved } });
    setBusy(false);
    if (!answer2.ok) { setProblem(answer2.message); return; }
    // An agreement sent opens Sent (M28 version 6: Sign and send → "Sent to Sam"); a quote, or one waiting for the owner, the client's page.
    if (!answer2.waiting && sendAs !== 'quote') navigate(`/coach/agreements/${agreement.id}/sent`);
    else navigate(agreement.profile_id ? `/coach/clients/${agreement.profile_id}` : agreement.organisation_id ? `/coach/organisations/${agreement.organisation_id}` : '/coach/clients');
    const who = kindOf(t) === 'team' ? 'the sponsor' : first;
    if (answer2.waiting) toast.show(`Signed. It goes to ${who} once your practice’s owner approves it.`);
    else if (sendAs === 'quote') toast.show(answer2.quoteNumber ? `Signed by you and sent to ${first} as quote ${quoteNumber(answer2.quoteNumber)}.` : `Signed by you and sent to ${first} as a quote.`);
    else toast.show(`Signed by you and sent to ${who}.`);
  };

  const words = questionWords(key, terms, ctx);
  const group = groupOf(key);
  // On a phone the label is the person and the group only ("Sam Carter · Included"), so it stays on one line (Tim's
  // walk of Stage B, item 9: a section label never wraps; M28 v6 lets it wrap at 390).
  const eyebrow = isPhone && group && !last
    ? `${party.name || first} · ${group}`
    : `${draft.version > 1 ? `Version ${draft.version}` : 'New agreement'} for ${party.name || first}${group && !last ? ` · ${group}` : ''}`;
  const line = soFar(terms, key, keys, ctx);
  const nextLabel = last ? (sendAs === 'quote' ? 'Sign and send the quote' : sendWords({ kind: kindOf(terms), first }))
    : fromCheck ? (keys[index + 1] && keys[index + 1] !== 'check' && groupOf(keys[index + 1]) === group ? 'Next' : 'Back to the check') : 'Next';

  return (
    <div className="ab-q-page">
      <ToolFrame
        step={index + 1}
        steps={keys.length - 1}
        stepWords={last ? 'Check' : `Question ${index + 1} of ${keys.length - 1}`}
        name={eyebrow}
        sub={line || '\u00a0'}
        question={words.question}
        hint={words.hint}
        onClose={close}
        closeLabel="Close and save the draft"
        onNext={last ? (busy ? () => {} : sendIt) : next}
        nextLabel={nextLabel}
        onBack={index > 0 || fromCheck ? () => {
          // Opened by Change on the check (P3): Back from the group's first question returns to the check, and within
          // the group it stays in Change's path.
          if (fromCheck) { const prev = keys[index - 1]; if (groupOf(prev) === groupOf(key)) go(prev, { check: true }); else go('check'); return; }
          go(keys[index - 1]);
        } : undefined}
        last={last}
        className="ab-q"
      >
        <Question
          qkey={key} t={terms} set={set} save={save} soon={soon} next={next} ctx={ctx} todayKey={todayKey} pkgs={pkgs} choosePackage={choosePackage}
          agreement={agreement} organisations={organisations} ownOrg={ownOrg} portal={portal} rates={d.rates}
        />
        {last && (
          <CheckScreen
            t={terms} keys={keys} ctx={ctx} go={go} agreement={agreement} standardsCount={clauseKeys(terms).length}
            wording={wordingLine(terms, { overrides, standards: d.standards, clientFirst: first })}
            note={note} setNote={(v) => { setNote(v); save(termsRef.current, { personalNote: v }); }}
            sendAs={sendAs} setSendAs={(v) => { setSendAs(v); save(termsRef.current, { fields: { send_as: v } }); }}
            saved={saved} isOwner={isOwner} onPreview={async () => { await d.flush(); navigate(`/coach/agreements/${agreement.id}/preview`); }}
            onClauses={async () => { await d.flush(); navigate(`/coach/agreements/${agreement.id}/clauses`); }}
          />
        )}
        {problem && <MistakeLine>{problem}</MistakeLine>}
      </ToolFrame>
    </div>
  );
}

/** The practice's packages to start from (an associate reads the owner's; 065). */
function useStartPackages() {
  const { state } = useCoachPortal();
  return startPackages(rowsOf(state, 'pricing_packages'));
}

/** A one-tap choice (M28 version 6's .choices.stack): full-width answer rows, a grey line under each where it adds something. */
function Choose({ label, options, value, onPick, soon, still = false }) {
  return (
    <InlineChoice
      ariaLabel={label}
      options={options}
      value={value}
      form="rows"
      onChange={onPick}
      onChoose={still ? undefined : soon}
    />
  );
}

/** One question's answers, by its key. */
function Question({ qkey, t, set, save, soon, next, ctx, todayKey, pkgs, choosePackage, agreement, organisations, ownOrg, portal, rates }) {
  const k = kindOf(t);
  const c = t.currency || 'GBP';
  const first = ctx.first;
  const words = questionWords(qkey, t, ctx).question;
  const pick = (key2) => (v) => set(key2, v);
  switch (qkey) {
    case 'payer': return (
      <Choose label={words} soon={soon} value={selfFunded(t) ? 'self' : 'org'} onPick={(v) => set('payer', v)} options={[
        { value: 'self', label: `${first}, personally` },
        { value: 'org', label: ownOrg ? ownOrg.name : `${possessive(first)} organisation`, hint: ownOrg ? `${possessive(first)} organisation` : undefined },
      ]} />
    );
    case 'org': return <OrgQuestion t={t} set={set} save={save} soon={soon} organisations={organisations} ownOrg={ownOrg} portal={portal} label={words} />;
    case 'sponsor': return <SponsorQuestion t={t} save={save} next={next} />;
    case 'po': return <PoQuestion t={t} set={set} save={save} soon={soon} next={next} label={words} />;
    case 'invoices': return (
      <TextField label="Their invoices email" type="email" value={t.team?.invoicesEmail || ''} maxLength={320} autoComplete="off"
        onChange={(e) => save({ ...t, team: { ...(t.team || {}), invoicesEmail: e.target.value } })}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }} />
    );
    case 'people': return <PeopleQuestion t={t} save={save} portal={portal} agreement={agreement} />;
    case 'offer': {
      const options = pkgs.filter((p) => (k === 'team' || ctx.forOrg ? true : p.agreement_kind !== 'team')).map((p) => {
        const pt = asQuestionnaire(packageTerms(p));
        const price = mainPrice(pt);
        return {
          value: p.id, label: p.name, hint: offerLine(pt) || undefined,
          note: price ? (['sessions', 'retainer'].includes(kindOf(pt)) ? rateText(price, 'month', pt.currency || 'GBP') : kindOf(pt) === 'hours' && pt.hours?.rateMinor ? rateText(pt.hours.rateMinor, 'hour', 'GBP') : moneyText(price, pt.currency || 'GBP')) : undefined,
        };
      });
      options.push({ value: 'blank', label: 'Something different', hint: 'Start with a blank agreement' });
      return <Choose label={words} soon={soon} value={agreement.package_id || 'blank'} onPick={choosePackage} options={options} />;
    }
    case 'work': return k === 'hours'
      ? <TextBox label="What’s being built?" value={t.hours?.work || ''} maxLength={1000} onChange={(v) => save({ ...t, hours: { ...(t.hours || {}), work: v } })} />
      : <TextField label="What is the work?" value={t.work || ''} maxLength={300} onChange={(e) => save({ ...t, work: e.target.value, coaching: t.coaching || '' })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }} />;
    case 'start': case 'on': return <DateQuestion day={qkey === 'on' ? t.oneoff?.on : t.startsOn} todayKey={todayKey} onPick={pick(qkey)} label={qkey === 'on' ? 'On' : 'Starting'} />;
    case 'mom': return (
      <Choose label={words} soon={soon} value={momentumWeeks(t.rhythm) ? 'yes' : 'no'} onPick={(v) => set('mom', v === 'yes')} options={[
        { value: 'yes', label: 'Yes, weekly to begin with', hint: 'Builds momentum in the first weeks' },
        { value: 'no', label: 'No, the same rhythm throughout' },
      ]} />
    );
    case 'mlen': return (
      <Choose label={words} soon={soon} value={String(momentumWeeks(t.rhythm))} onPick={(v) => set('mlen', Number(v))}
        options={MOMENTUM_CHOICES.map((n) => ({ value: String(n), label: `${n} weeks`, hint: `${n} weekly sessions` }))} />
    );
    case 'often': return <Choose label={words} soon={soon} value={afterRhythm(t.rhythm)} onPick={pick('often')} options={OFTEN_CHOICES} />;
    case 'term': {
      const rows = termRows(t);
      return (
        <>
          <Choose label={words} soon={soon} value={String(t.months || 6)} onPick={(v) => set('term', Number(v))}
            options={TERM_CHOICES.map((n) => ({ value: String(n), label: `${n} months` }))} />
          <div className="ab-answers">
            <Answer label="That’s" value={rows.count} note={rows.countNote} />
            {rows.end && <Answer label="Ending" value={rows.end} note="the week of the last session" />}
          </div>
        </>
      );
    }
    case 'len': return <Choose label={words} soon={soon} value={lengthOf(t)} onPick={pick('len')} options={LENGTH_CHOICES} />;
    case 'where': return <Choose label={words} soon={soon} value={t.place || 'zoom'} onPick={pick('where')} options={k === 'oneoff' ? WHERE_CHOICES.slice(0, 2) : WHERE_CHOICES} />;
    case 'oplace': return <Choose label={words} soon={soon} value={t.oneoff?.place || 'zoom'} onPick={pick('oplace')} options={WHERE_CHOICES.slice(0, 2)} />;
    case 'tz': return <PlaceQuestion t={t} set={set} first={first} />;
    case 'rsess': return <Choose label={words} soon={soon} value={t.retainer?.sessions} onPick={pick('rsess')} options={RETAINER_SESSIONS.map((s) => ({ value: s, label: s }))} />;
    case 'tsess': return <Choose label={words} soon={soon} value={t.team?.sessions || TEAM_SESSIONS[0].value} onPick={pick('tsess')} options={TEAM_SESSIONS.map((s) => ({ value: s.value, label: s.value }))} />;
    case 'fee': {
      const rows = feeRows(t);
      return (
        <>
          <MoneyBox label={words} value={t.gbpMinor} currency="GBP" onChange={(v) => set('fee', v)} onEnter={next} />
          {rows && Number(t.gbpMinor) > 0 && <div className="ab-answers"><Answer label="In all" value={rows.total} note={rows.note} /></div>}
        </>
      );
    }
    case 'rate': return <MoneyBox label={words} value={t.gbpRateMinor ?? t.hours?.rateMinor} currency="GBP" onChange={(v) => set('rate', v)} onEnter={next} />;
    case 'cur': return <CurrencyQuestion t={t} save={save} ctx={ctx} rates={rates} />;
    case 'local': return <LocalQuestion t={t} set={set} save={save} soon={soon} rate={ctx.rate} label={words} />;
    case 'settle': return <Choose label={words} soon={soon} value={settleOf(t)} onPick={pick('settle')} options={settleChoices(t, { first, orgName: t.orgName })} />;
    case 'disc': return <DiscountQuestion t={t} set={set} save={save} soon={soon} label={words} />;
    case 'extras': return <ExtrasQuestion t={t} save={save} first={first} />;
    case 'notice': return (
      <Choose label={words} soon={soon} value={String(t.noticeHours ?? 24)} onPick={(v) => set('notice', Number(v))}
        options={[...new Set([...NOTICE_CHOICES, Number(t.noticeHours ?? 24)])].map((n) => ({ value: String(n), label: `${n} hours` }))} />
    );
    case 'after': {
      const n = Number(t.months) || 6;
      return (
        <Choose label={words} soon={soon} value={t.after || 'offer'} onPick={pick('after')} options={[
          { value: 'offer', label: `You offer the next ${termWords(n)}`, hint: 'A month before the end, Needs you reminds you' },
          { value: 'renew', label: `It renews for ${termWords(n)}`, hint: 'Unless either of you says so 30 days before' },
          { value: 'end', label: 'It simply ends' },
        ]} />
      );
    }
    case 'owner': return (
      <Choose label={words} soon={soon} value={t.hours?.owner || 'client'} onPick={pick('owner')} options={[
        { value: 'client', label: `${first}, once it’s settled` }, { value: 'coach', label: `You, licensed to ${first}` },
      ]} />
    );
    default: return null;
  }
}

function OrgQuestion({ t, save, soon, organisations, ownOrg, portal, label }) {
  const profiles = rowsOf(portal.state, 'org_billing_profiles');
  const list = [...(ownOrg ? [ownOrg] : []), ...organisations.filter((o) => o.id !== ownOrg?.id && !o.archived)].slice(0, 12);
  const isNew = t.organisationId === null && Boolean(t.orgName) && !list.some((o) => o.name === t.orgName);
  const [fresh, setFresh] = useState(isNew);
  const choose = (v) => {
    if (v === 'new') { setFresh(true); save({ ...t, organisationId: null, orgName: '', fundedBy: null }); return; }
    setFresh(false);
    const o = list.find((x) => x.id === v);
    const prof = profiles.find((p) => p.organisation_id === v) || null;
    save({ ...t, organisationId: o.id, orgName: o.name, fundedBy: o.name, invoicesEmail: prof?.invoices_email || t.invoicesEmail || '', needsPO: prof ? Boolean(prof.needs_po) : t.needsPO });
    soon();
  };
  const value = fresh ? 'new' : t.organisationId || list.find((o) => o.name === t.orgName)?.id || null;
  return (
    <>
      <Choose label={label} still value={value} onPick={choose} options={[
        ...list.map((o) => {
          const prof = profiles.find((p) => p.organisation_id === o.id);
          return { value: o.id, label: o.name, hint: prof?.invoices_email ? `Invoices to ${prof.invoices_email}` : undefined };
        }),
        { value: 'new', label: 'A new organisation', hint: 'Add their details next' },
      ]} />
      {fresh && (
        <div className="ab-more">
          <TextField label="What’s the organisation called?" value={t.orgName || ''} maxLength={160} onChange={(e) => save({ ...t, orgName: e.target.value, fundedBy: e.target.value || null })} />
          <TextField label="Where do their invoices go?" type="email" value={t.invoicesEmail || ''} maxLength={320} onChange={(e) => save({ ...t, invoicesEmail: e.target.value })} />
        </div>
      )}
    </>
  );
}

function SponsorQuestion({ t, save, next }) {
  const team = kindOf(t) === 'team';
  const s = (team ? t.team?.sponsor : t.sponsor) || {};
  const put = (part) => (team ? save({ ...t, team: { ...(t.team || {}), sponsor: { ...s, ...part } } }) : save({ ...t, sponsor: { ...s, ...part } }));
  const enter = (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
  return (
    <div className="ab-more">
      <TextField label="Their name" value={s.name || ''} maxLength={120} autoComplete="off" onChange={(e) => put({ name: e.target.value })} onKeyDown={enter} />
      <TextField label="Their role" value={s.role || ''} maxLength={120} autoComplete="off" onChange={(e) => put({ role: e.target.value })} onKeyDown={enter} />
      {team && <TextField label="Their email" type="email" value={s.email || ''} maxLength={320} autoComplete="off" onChange={(e) => put({ email: e.target.value })} onKeyDown={enter} />}
    </div>
  );
}

function PoQuestion({ t, set, save, soon, next, label }) {
  const value = poOf(t);
  return (
    <>
      <Choose label={label} still value={value} onPick={(v) => { set('po', v); if (v !== 'yes') soon(); }} options={[
        { value: 'yes', label: 'Yes, and I have the number' },
        { value: 'later', label: 'Yes, it will come later', hint: 'Invoices wait until it’s in' },
        { value: 'no', label: 'No' },
      ]} />
      {value === 'yes' && (
        <div className="ab-more">
          <TextField label="What’s the purchase order number?" value={t.poNumber || ''} maxLength={80} autoComplete="off"
            onChange={(e) => save({ ...t, poNumber: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }} />
        </div>
      )}
    </>
  );
}

function PeopleQuestion({ t, save, portal, agreement }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const toast = useToast();
  const people = t.team?.people || [];
  const theirs = (portal.clients || []).filter((p) => agreement.organisation_id && p.organisation_id === agreement.organisation_id && !people.some((x) => x.profileId === p.id));
  const put = (list) => save({ ...t, team: { ...(t.team || {}), people: list } });
  const add = (name) => {
    const known = theirs.find((p) => p.name.toLowerCase() === name.toLowerCase());
    put([...people, { name: known ? known.name : name, email: known ? known.email || '' : email.trim().toLowerCase(), profileId: known?.id || null }]);
    setEmail('');
  };
  const remove = (i) => {
    const before = t;
    put(people.filter((_, j) => j !== i));
    toast.saved({ message: `${people[i].name} removed`, long: true, onUndo: () => save(before) });
  };
  return (
    <Card label="The people" add={<AddLink label="Add person" expanded={open} onClick={() => setOpen(true)} />}
      quickAdd={<QuickAdd open={open} onClose={() => setOpen(false)} onAdd={add} stayOpen placeholder="Their full name" label="Add person"
        more={(name) => (theirs.some((p) => p.name.toLowerCase() === name.toLowerCase()) ? null
          : <TextField label="Their email" type="email" value={email} maxLength={320} onChange={(e) => setEmail(e.target.value)} />)} />}>
      <Rows>
        {people.map((p, i) => (
          <Row key={`${p.name}-${p.email}`} name={p.name} sub={p.email || undefined}
            value={<button type="button" className="ds-more ds-more--bare ds-more--small" aria-label={`Remove ${p.name}`} onClick={() => remove(i)}>Remove</button>} />
        ))}
      </Rows>
      {people.length === 0 && <p className="ab-hint">No one yet. Add each person, with their email.</p>}
    </Card>
  );
}

/** "When would you like to start?": the full month grid, any day from today (rule 17). */
function DateQuestion({ day, todayKey, onPick, label }) {
  const [month, setMonth] = useState((day || todayKey).slice(0, 7));
  const shift = (n) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <>
      <div className="ab-datepick">
        <CalendarBar compact title={monthTitle(`${month}-01`)} onPrev={() => shift(-1)} onNext={() => shift(1)} />
        <MonthGrid picker month={`${month}-01`} today={todayKey} selected={day} onSelect={onPick} available={(k) => k >= todayKey} label={monthTitle(`${month}-01`)} />
      </div>
      {day && <div className="ab-answers"><Answer label={label} value={longDay(day, todayKey)} /></div>}
    </>
  );
}
const longDay = (key, todayKey = null) => {
  const [y, m, d] = key.split('-').map(Number);
  const w = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  // This year's day without its year (writing rule 28; M28's "Mon 4 Jan 2027" is next year's).
  return todayKey && String(todayKey).slice(0, 4) === String(y) ? `${w} ${d} ${mon}` : `${w} ${d} ${mon} ${y}`;
};

function PlaceQuestion({ t, set, first }) {
  const [now] = useState(() => new Date());
  return (
    <>
      <FindBox
        label="City or country" placeholder="City or country" value={t.basedIn || ''}
        find={(q) => findPlaces(q).map((p) => ({ key: `${p.label}|${p.zone}`, label: p.label, line: placeLine(p.zone, now), zone: p.zone }))}
        onPick={(h) => set('tz', { zone: h.zone, label: h.label })}
        empty="No place found. Try the nearest big city."
      />
      {t.clientZone && <div className="ab-answers"><Answer label="Time zone" value={t.basedIn || t.clientZone} note={placeLine(t.clientZone, now)} /></div>}
      {!t.clientZone && <Hint>Until you choose, session times show in your own time.</Hint>}
    </>
  );
}

function CurrencyQuestion({ t, save, ctx, rates }) {
  const c = t.currency || 'GBP';
  const [problem, setProblem] = useState(null);
  // A currency is chosen with its own rate (F4): one with no rate today says so and isn't chosen, so no figure or
  // rate from the currency before is ever carried into it, and the saved rate always matches the currency.
  const pick = (code) => {
    const units = rateOf(rates, code).unitsPerGbp;
    if (code !== 'GBP' && !(units > 0)) {
      setProblem(rates ? `There’s no reference rate for ${currencyName(code).split(',')[0].replace(/^(Euros|Pounds)/, (w) => w.toLowerCase())} today, so it can’t be chosen yet. Choose another currency, or try again tomorrow.`
        : 'Today’s rates haven’t loaded. Check your connection and try again.');
      return;
    }
    setProblem(null);
    save(answer(t, 'cur', code, { ...ctx, rate: units }));
  };
  return (
    <>
      <FindBox
        label="Currency or country" placeholder="Currency or country" value={currencyName(c).split(',')[0]}
        find={(q) => findCurrencies(q).map((x) => ({ key: x.code, label: x.label, line: x.symbol, code: x.code }))}
        onPick={(h) => pick(h.code)}
        empty="No currency found. An agreement can be in pounds, euros, US, Canadian, Australian, New Zealand, Singapore or Hong Kong dollars, Swiss francs, UAE dirhams, Swedish, Norwegian or Danish kroner, South African rand or Japanese yen."
      />
      {problem && <MistakeLine>{problem}</MistakeLine>}
      <div className="ab-answers"><Answer label="Currency" value={currencyName(c)} note={c === 'GBP' ? '' : 'You choose the figure they see next'} /></div>
    </>
  );
}

function LocalQuestion({ t, set, save, soon, rate, label }) {
  const c = t.currency || 'GBP';
  const options = localChoices(t, rate, { per: perWords(t) });
  const [own, setOwn] = useState(t.localMode === 'own');
  const value = own ? 'own' : t.localMode || 'up';
  const warn = underWarning(mainPrice(t), c, rate, t.gbpMinor);
  return (
    <>
      <Choose label={label} still value={value} options={options.map(({ value: v, label: l, hint }) => ({ value: v, label: l, hint }))}
        onPick={(v) => {
          if (v === 'own') { setOwn(true); save({ ...t, localMode: 'own' }); return; }
          setOwn(false);
          set('local', { mode: v });
          soon();
        }} />
      {own && (
        <div className="ab-more">
          <MoneyBox label="Your own figure" value={mainPrice(t)} currency={c} autoFocus onChange={(v) => set('local', { mode: 'own', minor: v })} />
          {rate > 0 && mainPrice(t) > 0 && <Hint>{`About ${moneyText(gbpValue(mainPrice(t), c, rate), 'GBP')} at today’s rate.`}</Hint>}
        </div>
      )}
      {warn && <p className="ab-warn" role="status">{warn}</p>}
    </>
  );
}

function DiscountQuestion({ t, set, save, soon, label }) {
  const value = discountOf(t);
  const [other, setOther] = useState(value === 'other');
  const [form, setForm] = useState({ type: 'reduced', amount: '' });
  const [problem, setProblem] = useState(null);
  const c = t.currency || 'GBP';
  const add = () => {
    const { terms: next, problem: p } = addDiscount({ ...t, discounts: [] }, form);
    if (p) { setProblem(p); return; }
    save(next);
    setProblem(null);
  };
  return (
    <>
      <Choose label={label} still value={other ? 'other' : value} onPick={(v) => {
        if (v === 'other') { setOther(true); return; }
        setOther(false);
        set('disc', v);
        soon();
      }} options={[
        { value: 'none', label: 'No discount' },
        { value: 'returning10', label: 'Returning client, 10% off' },
        { value: 'other', label: 'Something else' },
      ]} />
      {other && (
        <div className="ab-more">
          <InlineChoice label="What kind?" options={[{ value: 'reduced', label: `${c === 'GBP' ? '£' : CURRENCY[c]?.symbol.trim()} off` }, { value: 'returning', label: '% off' }]} value={form.type} onChange={(v) => setForm({ ...form, type: v })} form="pills" />
          <TextField label={form.type === 'reduced' ? `How much off, in ${c === 'GBP' ? 'pounds' : c}?` : 'How much off, as a %?'} inputMode="decimal" value={form.amount}
            onChange={(e) => { setForm({ ...form, amount: e.target.value }); setProblem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          {problem && <MistakeLine>{problem}</MistakeLine>}
          <div className="ab-acts"><Button variant="outline" onClick={add}>Use this discount</Button></div>
          {value === 'other' && <Hint>{`Now: ${(t.discounts || []).map((x) => (x.type === 'returning' ? `${x.percent}% off` : `${moneyText(x.amountMinor, c)} off`)).join(', ')}.`}</Hint>}
        </div>
      )}
    </>
  );
}

/** A switch on a control row (M28's .ctlrow with .sw-t): the name and its line on the left, the 52 × 32 switch right. */
function SwitchLine({ name, sub, checked, onChange }) {
  return (
    <ControlRow name={name} sub={sub}>
      <button type="button" role="switch" className="ds-switch" aria-checked={Boolean(checked)} aria-label={name} onClick={() => onChange(!checked)} />
    </ControlRow>
  );
}

function ExtrasQuestion({ t, save, first }) {
  return (
    <Card className="ab-extras">
      <SwitchLine name="Ad hoc support between sessions" sub="By email and WhatsApp, whenever something comes up" checked={t.adhoc !== false} onChange={(v) => save({ ...t, adhoc: v })} />
      <SwitchLine name="The Clarity Portal" sub={`${possessive(first)} personal performance platform, for the length of the coaching`} checked={t.portal !== false} onChange={(v) => save({ ...t, portal: v })} />
      {t.portal !== false && (
        <ControlRow name="Level of access" className="ab-lvl">
          <InlineChoice ariaLabel="Level of access" form="pills" options={[{ value: 'Individual', label: 'Individual' }, { value: 'Executive', label: 'Executive' }]} value={t.level || 'Executive'} onChange={(v) => save({ ...t, level: v })} />
        </ControlRow>
      )}
      <SwitchLine name="Strategic Alignment Health Check" sub="For a team, at the start and the end" checked={Boolean(t.healthCheck)} onChange={(v) => save({ ...t, healthCheck: v })} />
      <SwitchLine name="Visit or workshop days" sub={t.visitDays?.n ? `${t.visitDays.n} days at ${rateText(t.visitDays.rateMinor || 0, 'day', t.currency || 'GBP')}, in person with ${possessive(first)} team` : `In person with ${possessive(first)} team, priced per day`}
        checked={Boolean(t.visitDays?.n)} onChange={(v) => save({ ...t, visitDays: v ? { n: 2, rateMinor: 250000 } : null })} />
    </Card>
  );
}

/** "Does this read right?": the plain sentences with Change, the standard terms, the note, and how it goes. */
function CheckScreen({ t, keys, ctx, go, standardsCount, wording, note, setNote, sendAs, setSendAs, isOwner, onPreview, onClauses }) {
  const lines = checkLines(t, { first: ctx.first, coachFirst: ctx.coachFirst === 'you' ? 'you' : ctx.coachFirst, keys });
  const canQuote = selfFunded(t) && kindOf(t) !== 'team';
  return (
    <>
      <Card className="ab-check">
        <Rows>
          {lines.map((l) => (
            <Row key={l.key} name={l.text}
              value={<button type="button" className="ds-link ab-change" aria-label={`Change ${l.key === 'what' ? 'what you’re offering' : l.key === 'who' ? 'who' : l.key === 'when' ? 'when' : l.key === 'fee' ? 'the fee' : l.key === 'also' ? 'what’s included' : 'the terms'}`} onClick={() => go(l.edit || firstOfGroup(keys, 'What'), { check: true })}>Change</button>} />
          ))}
          {/* Run 3's differences from the standard: an edited clause shows here (the rest is in the sentences above). */}
          <Row name={`Your standard terms, ${standardsCount} clauses`} sub={wording && wording !== 'No changes' ? wording : undefined} onClick={onClauses} value={<Chevron direction="right" />} label={`Your standard terms, ${standardsCount} clauses. Edit any one for ${ctx.first}.`} />
        </Rows>
      </Card>
      <div className="ab-check-note"><TextBox label={`A note to ${kindOf(t) === 'team' ? 'the sponsor' : ctx.first}`} value={note} maxLength={1000} onChange={setNote} /></div>
      {canQuote && (
        <InlineChoice label="Send it as" options={[{ value: 'agreement', label: 'An agreement to sign' }, { value: 'quote', label: 'A quote first' }]} value={sendAs} onChange={setSendAs} form="pills" />
      )}
      <div className="ab-check-more">
        <MoreLink small onClick={onPreview}>See the whole agreement</MoreLink>
      </div>
      {!isOwner && <Hint>It goes once your practice’s owner approves it.</Hint>}
    </>
  );
}

// ---------------------------------------------------------------- a package's own defaults

/** A package's own defaults (Settings, Agreements → a package): the same questions with no client, a name first. */
function PackageBuilder({ pkg }) {
  const navigate = useNavigate();
  const toast = useToast();
  const portal = useCoachPortal();
  const { userId, isOwner } = portal;
  const [terms, setTerms] = useState(() => asQuestionnaire(packageTerms(pkg)));
  const [name, setName] = useState(pkg.name || '');
  const [note, setNote] = useState(pkg.personal_note || '');
  const latest = useRef({ terms, name, note });
  const timer = useRef(null);
  const dirty = useRef(false);
  // The package as it was opened: every save is made from it, so a saved copy coming back never saves again.
  const opened = useRef(pkg);
  const sendNow = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    const { terms: t, name: n, note: nt } = latest.current;
    const base = opened.current;
    try {
      await saveRow(userId, 'pricing_packages', { ...packageChange(base, t, nt), name: String(n || '').trim().slice(0, 120) || base.name });
      return true;
    } catch { dirty.current = true; return false; }
  }, [userId]);
  const sendRef = useRef(sendNow);
  sendRef.current = sendNow;
  useEffect(() => () => { sendRef.current(); }, []);
  const later = () => { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(sendNow, 500); };
  const save = (next) => { latest.current = { ...latest.current, terms: next }; setTerms(next); later(); };
  const set = (k, v) => save(answer(latest.current.terms, k, v, {}));
  const keys = questionKeys(terms, { pkgMode: true });
  const { key, go } = useStep(keys);
  const index = keys.indexOf(key);
  const nextRef = useRef(null);
  const next = () => { const ks = questionKeys(latest.current.terms, { pkgMode: true }); const i = ks.indexOf(key); if (i < ks.length - 1) go(ks[i + 1]); };
  nextRef.current = next;
  const soon = () => setTimeout(() => nextRef.current(), ONE_TAP_MS);
  const back = () => navigate('/coach/settings/agreements');
  if (!isOwner) {
    return <div className="cc-page"><div className="cc-col"><Back to="Agreements" onClick={back} /><PageOpening title={pkg.name} line="Packages are set by the practice’s owner." /></div></div>;
  }
  const pkgRates = useRates(true);
  const ctx = { first: 'your client', pkgMode: true, rate: null, coachFirst: '' };
  const words = questionWords(key, terms, ctx);
  const last = key === 'pnote';
  const group = groupOf(key);
  return (
    <div className="ab-q-page">
      <ToolFrame
        step={index + 1} steps={keys.length} stepWords={`Question ${index + 1} of ${keys.length}`}
        name={`${name || pkg.name}${group ? ` · ${group}` : ''}`}
        question={words.question} hint={words.hint}
        onClose={async () => { await sendNow(); back(); toast.show('Saved. Your package is up to date.'); }}
        closeLabel="Close and save the package"
        onNext={last ? async () => { const ok = await sendNow(); if (!ok) { toast.error(SAVE_PROBLEM); return; } back(); toast.show('Saved. New agreements start from it.'); } : next}
        nextLabel={last ? 'Done' : 'Next'}
        onBack={index > 0 ? () => go(keys[index - 1]) : undefined}
        last={last}
        className="ab-q"
      >
        {key === 'pname' && <TextField label="Its name" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); latest.current = { ...latest.current, name: e.target.value }; later(); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } }} />}
        {key === 'pnote' && <TextBox label="Your note" value={note} maxLength={1000} onChange={(v) => { setNote(v); latest.current = { ...latest.current, note: v }; later(); }} />}
        {!['pname', 'pnote'].includes(key) && (
          <Question qkey={key} t={terms} set={set} save={save} soon={soon} next={next} ctx={ctx} todayKey={portal.todayKey} pkgs={[]} choosePackage={() => {}}
            agreement={{}} organisations={[]} ownOrg={null} portal={portal} rates={pkgRates} />
        )}
      </ToolFrame>
    </div>
  );
}

