import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddButton, Button, Dropdown, ErrorMessage, Loading, PageHeader, TextBox, TextField, useToast } from '../../../components/design';
import { newId, rowsOf, saveRow } from '../../../lib/coach/store';
import { KIND_NAMES, checkTerms, kindOf } from '../../../lib/agreements/terms';
import { RHYTHMS } from '../../../lib/agreements/endDate';
import { discountLines } from '../../../lib/agreements/pricing';
import { moneyText } from '../../../lib/agreements/currency';
import { wordingLine } from '../../../lib/agreements/differences';
import {
  BUILDER_PARTS, DUE_CHOICES, LEVELS, MONTH_CHOICES, NOTICE_CHOICES, RETAINER_SESSIONS, TEAM_SESSIONS, WORDING_NAMES,
  addBlock, addDiscount, builderLines, endDays, extraLine, extraOf, extrasList, fxLines, matched, newDraft, nextVersionDraft,
  packageChange, packageTerms, readerView, removeBlock, setBlock, settleChoices, startDays, withChange,
} from '../../../lib/coach/agreementBuilder';
import { matchLine } from '../../../lib/agreements/fx';
import { Back, TextLink, useCoachPortal } from '../parts';
import { UnderTabs } from '../todoParts';
import {
  Blocks, CurrencyChoice, Hint, ListRow, MoneyField, NumberBox, Pick, PointsList, RemoveRows, Saved, Sec, Sub, Switch, Two,
  useAgreementDraft, useWide,
} from './builderParts';

// The builder (Phase 6b run 3, Group B; M28 s-builder, s-b-retainer, s-b-team, s-b-oneoff, s-b-hours; brief items 1 to
// 7, 20, 37 and 42): /coach/agreements/:id/edit. One page for the five kinds, each drawing M28's own parts; Sam's view
// live on the right on a laptop (≥ 1100px) with the underlined tabs row jumping to each part. Every change is kept on
// the device at once and sent (the store's queue), and carries through to the check, the preview and the signing page.
// `?renew=<agreement id>` drafts the next 6 months from that agreement, up front chosen (item 40); an agreement whose
// versions have all gone out gets its next version (a change is always a new version). With a package's id it edits
// that package's own defaults (Settings, Agreements; M28 s-packages' Edit).

const KIND_OPTIONS = Object.entries(KIND_NAMES).map(([value, label]) => ({ value, label }));
const RHYTHM_OPTIONS = RHYTHMS.map((r) => ({ value: r, label: r }));
const days = (n) => `${n} days`;
const hours = (n) => `${n} hours`;

export default function Builder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state } = useCoachPortal();
  const pkg = rowsOf(state, 'pricing_packages').find((p) => p.id === id) || null;
  if (pkg) return <PackageBuilder pkg={pkg} />;
  return <AgreementBuilder key={id} id={id} renew={params.get('renew')} />;
}

/** Makes the draft the page edits when there isn't one yet: the next 6 months (?renew=), or the next version. */
function useMakeDraft({ id, renew, d }) {
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
  }, [renew, d.loading, d.agreement, d.draft, d.versions, agreements, agreementVersions, clients, organisations, coach, isOwner, todayKey, userId, navigate, id]);
}

function AgreementBuilder({ id, renew }) {
  const navigate = useNavigate();
  const toast = useToast();
  const d = useAgreementDraft(id);
  useMakeDraft({ id, renew, d });
  const { agreement, draft, party, standards, rate, packageGbpMinor, status } = d;
  const [terms, setTerms] = useState(draft?.terms || null);
  const [overrides, setOverrides] = useState(draft?.overrides || {});
  const [problem, setProblem] = useState(null);
  const seen = useRef(draft?.id);
  useEffect(() => {
    if (draft && seen.current !== draft.id) { seen.current = draft.id; setTerms(draft.terms); setOverrides(draft.overrides || {}); }
    if (draft && !terms) setTerms(draft.terms);
  }, [draft, terms]);
  const quotes = rowsOf(d.portal.state, 'agreement_quotes');
  const quoteOut = draft ? quotes.find((q) => q.version_id === draft.id && q.status === 'sent') || null : null;

  if (!agreement || !draft || !terms) {
    if (d.loading || renew || agreement) return <div className="cc-page"><div className="cc-col"><Loading label="Loading the agreement" /></div></div>;
    return (
      <div className="cc-page"><div className="cc-col">
        <Back to="Clients" onClick={() => navigate('/coach/clients')} />
        <PageHeader title="Agreement" />
        <p className="cc-quiet">That agreement isn’t here. It may have been deleted on another device.</p>
      </div></div>
    );
  }

  const first = party.first || 'them';
  const change = (part, opts = {}) => {
    const next = typeof part === 'function' ? part(terms) : withChange(terms, part);
    setTerms(next);
    setProblem(null);
    d.save(next, { overrides, ...opts });
  };
  const changeKind = (kind) => {
    if (kind === kindOf(terms)) return;
    if (kind === 'team' && !party.organisationId && !agreement.organisation_id) { setProblem('A team programme is with an organisation. Start it from the organisation’s page.'); return; }
    const next = withChange(terms, { kind });
    setTerms(next);
    d.save(next, { overrides: {}, agreementChange: { agreement_kind: kind, kind: kind === 'team' || !agreement.profile_id ? 'sponsor' : 'coaching' } });
    setOverrides({});
  };
  const go = async (where) => {
    const lines = checkTerms(terms);
    if (where === 'check' && lines.length) { setProblem(lines[0]); return; }
    await d.flush();
    navigate(`/coach/agreements/${id}/${where}`);
  };
  const kind = kindOf(terms);
  const startHere = agreement.profile_id ? `client:${agreement.profile_id}` : agreement.organisation_id ? `org:${agreement.organisation_id}` : '';
  const title = draft.version > 1 ? `Version ${draft.version}` : 'New agreement';
  const view = readerView(terms, { standards, overrides });
  const lines = builderLines(terms, { first, orgName: party.orgName });

  return (
    <div className="cc-page">
      <div className={`cc-col${kind === 'sessions' ? ' cc-col--wide' : ''}`}>
        <Back to="Choose a starting point" onClick={() => navigate(startHere ? `/coach/agreements/new?for=${startHere}` : '/coach/clients')} />
        <PageHeader title={title} meta={[party.name, <Saved key="s" status={status} />]} />
        {quoteOut && (
          <div className="ab-panel">
            <p className="ab-say">This version is out as a quote, so it can’t change. Withdraw the quote to edit it.</p>
            <TextLink onClick={() => saveRow(d.userId, 'agreement_quotes', { ...quoteOut, status: 'withdrawn' }).then(() => toast.saved({ message: 'Quote withdrawn', long: true, onUndo: () => saveRow(d.userId, 'agreement_quotes', quoteOut) })).catch(() => toast.error('That didn’t save. Check your connection and try again.'))}>Withdraw the quote</TextLink>
          </div>
        )}
        {kind === 'sessions' && <JumpTabs />}
        <div className={kind === 'sessions' ? 'ab-split' : undefined}>
          <div className="ab-form">
            <KindForm terms={terms} change={change} changeKind={changeKind} first={first} party={party} d={d} rate={rate} packageGbpMinor={packageGbpMinor} overrides={overrides} lines={lines} agreementId={id} />
            {problem && <ErrorMessage>{problem}</ErrorMessage>}
            <div className="ab-acts">
              <Button variant="primary" onClick={() => go('check')}>Check and send</Button>
              {kind !== 'hours' && <Button variant="outline" onClick={() => go('preview')}>Preview the agreement</Button>}
            </div>
          </div>
          {kind === 'sessions' && (
          <aside className="ab-live" aria-label={`As ${first} sees it`}>
            <p className="ab-live-h">As {first} sees it</p>
            <PointsList points={view.points} compact />
            {lines.short && <p className="ab-live-t">{lines.short}</p>}
          </aside>
          )}
        </div>
      </div>
    </div>
  );
}

/** M28's underlined tabs row: the five parts, each a jump to its heading. */
function JumpTabs() {
  const [at, setAt] = useState(BUILDER_PARTS[0].value);
  const jump = (value) => {
    setAt(value);
    const el = document.getElementById(`ab-${value}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  return <div className="ab-toc"><UnderTabs label="Parts of the agreement" tabs={BUILDER_PARTS} value={at} onChange={jump} /></div>;
}

/** The form for the agreement's kind, M28's parts in M28's order. `pkgMode` leaves out what belongs to one client. */
function KindForm({ terms, change, changeKind, first, party, d, rate, packageGbpMinor, overrides, lines, agreementId, pkgMode = false }) {
  const kind = kindOf(terms);
  const navigate = useNavigate();
  const { todayKey } = d.portal;
  const c = terms.currency || 'GBP';
  const fx = fxLines(terms, { rate: rate?.rate, packageGbpMinor, day: rate?.day });
  const toast = useToast();
  const match = () => {
    const before = terms;
    change(matched(terms, fx.match));
    toast.saved({ message: matchLine(fx.match, c, packageGbpMinor), long: true, onUndo: () => change(() => before) });
  };
  const kindPick = <Dropdown label="Which kind?" options={KIND_OPTIONS} value={kind} onChange={changeKind} />;
  const startPick = (value, onChange, label = 'When does it start?') => <Dropdown label={label} options={startDays(todayKey, value)} value={value || ''} onChange={onChange} />;
  const fxParts = c !== 'GBP' && (
    <>
      {fx.line && <p className="ab-hint" title={rate?.day ? `Reference rate from ${rate.day}` : undefined}>{fx.line}</p>}
      {!fx.line && <Hint>Today’s rate for {c} hasn’t loaded yet.</Hint>}
      {fx.warn && <div className="ab-warn" role="status"><span>{fx.warn}</span><TextLink onClick={match}>Match my £ price</TextLink></div>}
    </>
  );
  const terms4 = (
    <>
      <Sec id="ab-terms">The terms</Sec>
      <Two>
        <Dropdown label="How much notice to rearrange?" options={NOTICE_CHOICES.map((n) => ({ value: String(n), label: hours(n) }))} value={String(terms.noticeHours ?? 24)} onChange={(v) => change({ noticeHours: Number(v) })} />
        <Dropdown label="When are invoices due?" options={DUE_CHOICES.map((n) => ({ value: String(n), label: days(n) }))} value={String(terms.dueDays ?? 14)} onChange={(v) => change({ dueDays: Number(v) })} />
      </Two>
      <Dropdown label="When does an unsigned offer run out?" options={[14, 30, 60].map((n) => ({ value: String(n), label: days(n) }))} value={String(terms.expiryDays ?? 30)} onChange={(v) => change({ expiryDays: Number(v) })} />
      <Switch label="Pausing allowed" note="By agreement, dates move on by the pause." checked={terms.pausing !== false} onChange={(v) => change({ pausing: v })} />
    </>
  );
  const wording = !pkgMode && (
    <>
      <Sec id="ab-wording">The wording</Sec>
      <div className="ab-rows">
        <ListRow title={`Your standard ${WORDING_NAMES[kind].toLowerCase()}`} line={wordingLine(terms, { overrides, standards: d.standards, clientFirst: first })} aside="Edit"
          onClick={async () => { await d.flush(); navigate(`/coach/agreements/${agreementId}/clauses`); }} />
      </div>
    </>
  );

  if (kind === 'retainer') {
    return (
      <>
        <Sec id="ab-coaching">The coaching</Sec>
        {kindPick}
        <Dropdown label="How many coaching sessions?" options={RETAINER_SESSIONS.map((s) => ({ value: s, label: s }))} value={terms.retainer?.sessions} onChange={(v) => change({ retainer: { sessions: v } })} />
        <Pick label="Where?" options={[{ value: 'zoom', label: 'Zoom' }, { value: 'inperson', label: 'In person' }, { value: 'either', label: 'Either' }]} value={terms.place} onChange={(v) => change({ place: v })} />
        {!pkgMode && startPick(terms.startsOn, (v) => change({ startsOn: v }))}
        <Hint>It runs in 6-month terms, renewing unless either of you says otherwise.</Hint>
        <Sec id="ab-investment">The investment</Sec>
        <Two>
          <MoneyField label="What’s the monthly fee?" value={terms.retainer?.feeMinor} currency={c} onChange={(v) => change({ retainer: { feeMinor: v } })} />
          <CurrencyChoice value={c} onChange={(v) => change({ currency: v })} />
        </Two>
        {fxParts}
        <Pick label="How is it invoiced?" options={[{ value: 'monthly', label: 'Every month' }, { value: 'delivered', label: 'As delivered' }]} value={terms.retainer?.invoice || 'monthly'} onChange={(v) => change({ retainer: { invoice: v } })} />
        <Hint>{terms.retainer?.invoice === 'delivered' ? 'Each invoice is drafted in Needs you after coaching sessions happen.' : 'Each invoice is drafted in Needs you on the 1st.'}</Hint>
        <Switch label="Offer 6 months up front, 5% off" note={`${pkgMode ? 'Your client' : first} can choose it on the quote or when signing.`} checked={terms.offerUpfront !== false} onChange={(v) => change({ offerUpfront: v })} />
        {terms.offerUpfront !== false && <Hint>{lines.upfront}</Hint>}
        {terms4}
        {wording}
      </>
    );
  }
  if (kind === 'team') return <TeamForm {...{ terms, change, kindPick, startPick, lines, c, fxParts, pkgMode, d, party }} />;
  if (kind === 'oneoff') {
    return (
      <>
        {kindPick}
        <Sec id="ab-coaching">The work</Sec>
        <TextField label="What is it?" value={terms.work || ''} maxLength={300} onChange={(e) => change({ work: e.target.value })} />
        <Two>
          {!pkgMode && startPick(terms.oneoff?.on, (v) => change({ oneoff: { on: v } }), 'When is it?')}
          <Dropdown label="Where?" options={[{ value: 'zoom', label: 'Zoom' }, { value: 'inperson', label: 'In person' }]} value={terms.oneoff?.place || 'zoom'} onChange={(v) => change({ oneoff: { place: v } })} />
        </Two>
        <Sec id="ab-investment">The investment</Sec>
        <Two>
          <MoneyField label="What’s the total?" value={terms.oneoff?.totalMinor} currency={c} onChange={(v) => change({ oneoff: { totalMinor: v } })} />
          <CurrencyChoice value={c} onChange={(v) => change({ currency: v })} />
        </Two>
        {fxParts}
        <Dropdown label="How is it settled?" options={settleChoices(terms)} value={terms.oneoff?.settle || 'before'} onChange={(v) => change({ oneoff: { settle: v } })} />
        {!pkgMode && <Hint>{lines.firstPay}</Hint>}
      </>
    );
  }
  if (kind === 'hours') {
    return (
      <>
        {kindPick}
        <Sec id="ab-coaching">The work</Sec>
        <TextBox label="What’s being built?" value={terms.hours?.work || ''} maxLength={1000} onChange={(v) => change({ hours: { work: v } })} />
        <Sec id="ab-investment">The investment</Sec>
        <Two>
          <MoneyField label="What’s the hourly rate?" value={terms.hours?.rateMinor} currency={c} onChange={(v) => change({ hours: { rateMinor: v } })} />
          <MoneyField label="How big is the block?" value={terms.hours?.blockMinor} currency={c} onChange={(v) => change({ hours: { blockMinor: v } })} />
        </Two>
        <Hint>{lines.block}</Hint>
        <Switch label="Tell me at 80% used" note="A line in Needs you, with a top-up invoice ready in case you want it." checked={terms.hours?.tellAt80 !== false} onChange={(v) => change({ hours: { tellAt80: v } })} />
        <Sec id="ab-terms">Ownership</Sec>
        <Pick label="Who owns the work?" options={[{ value: 'client', label: `${pkgMode ? 'The client' : first}, once settled` }, { value: 'coach', label: `You, licensed to ${pkgMode ? 'the client' : first}` }]} value={terms.hours?.owner || 'client'} onChange={(v) => change({ hours: { owner: v } })} />
        <Hint>You always keep your own methods and earlier work.</Hint>
      </>
    );
  }
  return <SessionsForm {...{ terms, change, kindPick, startPick, lines, c, fxParts, terms4, wording, first, pkgMode, d }} />;
}

function SessionsForm({ terms, change, kindPick, startPick, lines, c, fxParts, terms4, wording, first, pkgMode, d }) {
  const [adding, setAdding] = useState(null); // { type, amount } while the discount form is open
  const [extra, setExtra] = useState(null); // the extra being chosen
  const [discProblem, setDiscProblem] = useState(null);
  const toast = useToast();
  const funded = terms.funder === 'org';
  const extras = extrasList(rowsOf(d.portal.state, 'agreement_extras'));
  const offered = terms.extrasOffered || [];
  const left = extras.filter((e) => !offered.some((o) => o.key === e.key));
  const visits = terms.visitDays;
  const ends = endDays(terms);

  const addDisc = () => {
    const { terms: next, problem } = addDiscount(terms, adding || {});
    if (problem) { setDiscProblem(problem); return; }
    const before = terms;
    change(() => next);
    setAdding(null);
    setDiscProblem(null);
    toast.saved({ message: `${discountLines(next).at(-1).label} added`, long: true, onUndo: () => change(() => before) });
  };
  const removeDisc = (i) => {
    const before = terms;
    const label = discountLines(terms)[i]?.label;
    change({ discounts: terms.discounts.filter((_, j) => j !== i) });
    toast.saved({ message: `${label} removed`, long: true, onUndo: () => change(() => before) });
  };
  const addExtra = () => {
    const e = extras.find((x) => x.key === extra);
    if (!e) { setExtra(null); return; }
    const before = terms;
    change({ extrasOffered: [...offered, extraOf(e)] });
    setExtra(null);
    toast.saved({ message: `${e.title} added to quotes`, long: true, onUndo: () => change(() => before) });
  };

  return (
    <>
      <Sec id="ab-coaching">The coaching</Sec>
      {kindPick}
      {!pkgMode && <Pick label="Who funds it?" options={[{ value: 'self', label: first }, { value: 'org', label: 'An organisation' }]} value={funded ? 'org' : 'self'} onChange={(v) => change({ funder: v })} />}
      {!pkgMode && funded && (
        <Sub>
          <TextField label="Which organisation?" value={terms.orgName || ''} maxLength={160} onChange={(e) => change({ orgName: e.target.value })} />
          <Two>
            <TextField label="Who’s the sponsor?" value={terms.sponsor?.name || ''} maxLength={120} onChange={(e) => change({ sponsor: { ...(terms.sponsor || {}), name: e.target.value } })} />
            <TextField label="What’s their role?" value={terms.sponsor?.role || ''} maxLength={120} onChange={(e) => change({ sponsor: { ...(terms.sponsor || {}), role: e.target.value } })} />
          </Two>
          <TextField label="Where do invoices go?" type="email" value={terms.invoicesEmail || ''} maxLength={320} onChange={(e) => change({ invoicesEmail: e.target.value })} />
          <Switch label="Needs a purchase order" note="Invoices wait until the PO number is in." checked={terms.needsPO} onChange={(v) => change({ needsPO: v })} />
        </Sub>
      )}
      <Blocks blocks={terms.blocks || []} onSet={(i, part) => change((t) => setBlock(t, i, part))} onRemove={(i) => change((t) => removeBlock(t, i))} onAdd={() => change((t) => addBlock(t))} />
      <Hint>{lines.sessions}</Hint>
      <Dropdown label="How often?" options={RHYTHM_OPTIONS} value={terms.rhythm} onChange={(v) => change({ rhythm: v })} />
      <Pick label="Where?" options={[{ value: 'zoom', label: 'Zoom' }, { value: 'inperson', label: 'In person' }, { value: 'either', label: 'Either' }]} value={terms.place} onChange={(v) => change({ place: v })} />
      {!pkgMode && (
        <>
          <Two>
            {startPick(terms.startsOn, (v) => change({ startsOn: v }))}
            <Dropdown label="When does it end?" options={ends} value={terms.endsOn || ''} onChange={(v) => change({ endsOn: v })} />
          </Two>
          <Hint>{lines.end}</Hint>
        </>
      )}

      <Sec id="ab-included">What’s included</Sec>
      <Switch label="Health Check with a debrief" note="For corporate teams and CEOs. At the start, and again at the end." checked={terms.healthCheck} onChange={(v) => change({ healthCheck: v })} />
      <Switch label="Visit or workshop days" note="Priced per day." checked={Boolean(visits)} onChange={(v) => change({ visitDays: v ? { n: 2, rateMinor: 250000 } : null })} />
      {visits && (
        <Two>
          <NumberBox label="How many days?" value={visits.n} onChange={(n) => change({ visitDays: { ...visits, n } })} />
          <MoneyField label="How much a day?" value={visits.rateMinor} currency={c} onChange={(v) => change({ visitDays: { ...visits, rateMinor: v } })} />
        </Two>
      )}
      <Dropdown label="Which portal level?" options={LEVELS} value={terms.level || 'Executive'} onChange={(v) => change({ level: v })} />
      <Hint>Chat between coaching sessions is always included.</Hint>

      <Sec id="ab-investment">The investment</Sec>
      <Pick label="How is it priced?" options={[{ value: 'total', label: 'A total' }, { value: 'hourly', label: 'Hourly rate' }, { value: 'monthly', label: 'Monthly fee' }]} value={terms.priceMode || 'total'} onChange={(v) => change({ priceMode: v })} />
      {(terms.priceMode || 'total') === 'total' && (
        <>
          <Two>
            <MoneyField label="What’s the total?" value={terms.totalMinor} currency={c} onChange={(v) => change({ totalMinor: v })} />
            <CurrencyChoice value={c} onChange={(v) => change({ currency: v })} />
          </Two>
          {fxParts}
        </>
      )}
      {terms.priceMode === 'hourly' && (
        <>
          <Two>
            <MoneyField label="What’s the hourly rate?" value={terms.rateMinor} currency={c} onChange={(v) => change({ rateMinor: v })} />
            <CurrencyChoice value={c} onChange={(v) => change({ currency: v })} />
          </Two>
          <Hint>{lines.hourly}</Hint>
          {fxParts}
        </>
      )}
      {terms.priceMode === 'monthly' && (
        <Two>
          <MoneyField label="What’s the monthly fee?" value={terms.monthlyMinor} currency={c} onChange={(v) => change({ monthlyMinor: v })} />
          <Dropdown label="For how many months?" options={MONTH_CHOICES.map((n) => ({ value: String(n), label: `${n} months` }))} value={String(terms.months || 6)} onChange={(v) => change({ months: Number(v) })} />
        </Two>
      )}
      <div className="ab-disc">
        <RemoveRows rows={discountLines(terms).map((l, i) => ({ key: i, title: l.label, amount: moneyText(l.amount, c) }))} onRemove={removeDisc} />
        {!adding && <AddButton onClick={() => setAdding({ type: 'returning', amount: '' })}>Add discount</AddButton>}
        {adding && (
          <Sub>
            <Dropdown label="Which discount?" options={[{ value: 'returning', label: 'Returning client, % off' }, { value: 'reduced', label: `Reduced fee, ${c === 'GBP' ? '£' : c} off` }]} value={adding.type} onChange={(v) => setAdding({ ...adding, type: v })} />
            <TextField label={adding.type === 'reduced' ? `How much off, in ${c === 'GBP' ? 'pounds' : c}?` : 'How much off, as a %?'} inputMode="decimal" value={adding.amount} onChange={(e) => { setAdding({ ...adding, amount: e.target.value }); setDiscProblem(null); }} />
            {discProblem && <ErrorMessage>{discProblem}</ErrorMessage>}
            <div className="ab-acts">
              <Button variant="outline" onClick={addDisc}>Add discount</Button>
              <Button variant="outline" onClick={() => { setAdding(null); setDiscProblem(null); }}>Cancel</Button>
            </div>
          </Sub>
        )}
      </div>
      <Hint>{lines.fin}</Hint>
      <Dropdown label="How is it settled?" options={settleChoices(terms)} value={terms.settle} onChange={(v) => change({ settle: v })} />
      {!pkgMode && <Hint>{lines.firstPay}</Hint>}
      <Switch label="Offer 5% off for settling up front" note={`${pkgMode ? 'Your client' : first} can choose it on the quote or when signing.`} checked={terms.offerUpfront !== false} onChange={(v) => change({ offerUpfront: v })} />
      {terms.offerUpfront !== false && <Hint>{lines.upfront}</Hint>}
      <MoneyField label="What’s the rate beyond the package?" value={terms.beyondRateMinor} currency={c} onChange={(v) => change({ beyondRateMinor: v || null })} />
      <Switch label="Expenses allowed" note="Agreed travel goes on the next invoice." checked={terms.expenses !== false} onChange={(v) => change({ expenses: v })} />

      {!pkgMode && (
        <>
          <Sec id="ab-extras">Quote extras</Sec>
          <Hint>Only the extras you add here, and only in a quote.</Hint>
          <RemoveRows rows={offered.map((e) => ({ key: e.key, title: e.title, line: [moneyText(e.priceMinor || 0, c), e.hint].filter(Boolean).join(', ') }))} empty="No extras offered."
            onRemove={(key) => change({ extrasOffered: offered.filter((e) => e.key !== key), extrasChosen: (terms.extrasChosen || []).filter((k) => k !== key) })} />
          {extra === null && left.length > 0 && <AddButton onClick={() => setExtra(left[0].key)}>Add extra</AddButton>}
          {extra !== null && (
            <Sub>
              <Dropdown label="Which extra?" options={left.map((e) => ({ value: e.key, label: extraLine(e, c) }))} value={extra} onChange={setExtra} />
              <div className="ab-acts">
                <Button variant="outline" onClick={addExtra}>Add to quotes</Button>
                <Button variant="outline" onClick={() => setExtra(null)}>Cancel</Button>
              </div>
            </Sub>
          )}
        </>
      )}
      {terms4}
      {wording}
    </>
  );
}

function TeamForm({ terms, change, kindPick, startPick, lines, c, fxParts, pkgMode, d, party }) {
  const team = terms.team || {};
  const [adding, setAdding] = useState(null); // { pick, name, email }
  const [problem, setProblem] = useState(null);
  const toast = useToast();
  const orgId = party.organisationId;
  const theirs = (d.portal.clients || []).filter((p) => orgId && p.organisation_id === orgId && !(team.people || []).some((x) => x.profileId === p.id));
  const sponsor = team.sponsor || {};
  const setTeam = (part) => change({ team: part });
  const ends = endDays(terms);
  const addPerson = () => {
    const chosen = adding?.pick && adding.pick !== 'new' ? theirs.find((p) => p.id === adding.pick) : null;
    const name = chosen ? chosen.name : String(adding?.name || '').trim();
    const email = chosen ? chosen.email || '' : String(adding?.email || '').trim().toLowerCase();
    if (!name) { setProblem('Add a name first.'); return; }
    const before = terms;
    setTeam({ people: [...(team.people || []), { name, email, profileId: chosen?.id || null }] });
    setAdding(null);
    setProblem(null);
    toast.saved({ message: `${name} added`, long: true, onUndo: () => change(() => before) });
  };
  const removePerson = (i) => {
    const before = terms;
    const p = team.people[i];
    setTeam({ people: team.people.filter((_, j) => j !== i) });
    toast.saved({ message: `${p.name} removed`, long: true, onUndo: () => change(() => before) });
  };
  return (
    <>
      {kindPick}
      <Sec id="ab-coaching">The organisation</Sec>
      <Two>
        <TextField label="Who’s the sponsor?" value={sponsor.name || ''} maxLength={120} onChange={(e) => setTeam({ sponsor: { ...sponsor, name: e.target.value } })} />
        <TextField label="What’s their role?" value={sponsor.role || ''} maxLength={120} onChange={(e) => setTeam({ sponsor: { ...sponsor, role: e.target.value } })} />
      </Two>
      {!pkgMode && <TextField label="What’s the sponsor’s email?" type="email" value={sponsor.email || ''} maxLength={320} onChange={(e) => setTeam({ sponsor: { ...sponsor, email: e.target.value } })} />}
      <TextField label="Where do invoices go?" type="email" value={team.invoicesEmail || ''} maxLength={320} onChange={(e) => setTeam({ invoicesEmail: e.target.value })} />
      <Switch label="Needs a purchase order" note="Invoices wait until the PO number is in." checked={team.needsPO} onChange={(v) => setTeam({ needsPO: v })} />
      {!pkgMode && (
        <>
          <Sec id="ab-people">The people</Sec>
          <RemoveRows rows={(team.people || []).map((p, i) => ({ key: i, title: p.name, line: p.email || '' }))} empty="No one yet." onRemove={removePerson} />
          {!adding && <AddButton onClick={() => setAdding({ pick: theirs.length ? theirs[0].id : 'new', name: '', email: '' })}>Add person</AddButton>}
          {adding && (
            <Sub>
              {theirs.length > 0 && <Dropdown label="Who else is in the programme?" options={[...theirs.map((p) => ({ value: p.id, label: p.name })), { value: 'new', label: 'Someone else' }]} value={adding.pick} onChange={(v) => setAdding({ ...adding, pick: v })} />}
              {(adding.pick === 'new' || !theirs.length) && (
                <>
                  <TextField label={theirs.length ? 'What’s their name?' : 'Who else is in the programme?'} placeholder="Full name" value={adding.name} maxLength={160} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
                  <TextField label="What’s their email?" type="email" value={adding.email} maxLength={320} onChange={(e) => setAdding({ ...adding, email: e.target.value })} />
                </>
              )}
              {problem && <ErrorMessage>{problem}</ErrorMessage>}
              <div className="ab-acts">
                <Button variant="outline" onClick={addPerson}>Add to the programme</Button>
                <Button variant="outline" onClick={() => { setAdding(null); setProblem(null); }}>Cancel</Button>
              </div>
            </Sub>
          )}
        </>
      )}
      <Sec id="ab-included">Each person’s coaching</Sec>
      <Dropdown label="How many coaching sessions each?" options={TEAM_SESSIONS.map((s) => ({ value: s.value, label: s.value }))} value={team.sessions || TEAM_SESSIONS[0].value} onChange={(v) => setTeam({ sessions: v })} />
      <Dropdown label="How often?" options={RHYTHM_OPTIONS} value={terms.rhythm} onChange={(v) => change({ rhythm: v })} />
      {!pkgMode && (
        <>
          <Two>
            {startPick(terms.startsOn, (v) => change({ startsOn: v }))}
            <Dropdown label="When does it end?" options={ends} value={terms.endsOn || ''} onChange={(v) => change({ endsOn: v })} />
          </Two>
          <Hint>{lines.end}</Hint>
        </>
      )}
      <Sec id="ab-investment">The investment</Sec>
      <Two>
        <MoneyField label="What’s the total?" value={team.totalMinor} currency={c} onChange={(v) => setTeam({ totalMinor: v })} />
        <CurrencyChoice value={c} onChange={(v) => change({ currency: v })} />
      </Two>
      {fxParts}
      <Dropdown label="How is it settled?" options={settleChoices(terms)} value={team.settle || 'deposit'} onChange={(v) => setTeam({ settle: v })} />
      {!pkgMode && (
        <>
          <Sec id="ab-wording">The wording</Sec>
          <div className="ab-rows"><ListRow still title="Standard sponsor agreement" line="Each person also signs their own coaching agreement, with no money rows, once the sponsor has signed." /></div>
        </>
      )}
    </>
  );
}

/** A package's own defaults (Settings, Agreements → a package's Edit; M28 s-packages): the same form with no client. */
function PackageBuilder({ pkg }) {
  const navigate = useNavigate();
  const toast = useToast();
  const portal = useCoachPortal();
  const { userId, isOwner } = portal;
  const [terms, setTerms] = useState(() => packageTerms(pkg));
  const [note, setNote] = useState(pkg.personal_note || '');
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);
  const latest = useRef({ terms, note });
  const send = useMemo(() => async () => {
    clearTimeout(timer.current);
    setStatus('saving');
    try {
      const answer = await saveRow(userId, 'pricing_packages', packageChange(pkg, latest.current.terms, latest.current.note));
      setStatus(answer === 'queued' ? 'offline' : 'saved');
    } catch { setStatus('failed'); }
  }, [userId, pkg]);
  const later = () => { setStatus('saving'); clearTimeout(timer.current); timer.current = setTimeout(send, 500); };
  const change = (part) => {
    const next = typeof part === 'function' ? part(terms) : withChange(terms, part);
    setTerms(next);
    latest.current = { ...latest.current, terms: next };
    later();
  };
  const d = { portal, standards: {}, flush: send };
  const lines = builderLines(terms, { first: 'Your client' });
  if (!isOwner) {
    return <div className="cc-page"><div className="cc-col"><Back to="Agreements" onClick={() => navigate('/coach/settings/agreements')} /><PageHeader title={pkg.name} /><p className="cc-quiet">Packages are set by the practice’s owner.</p></div></div>;
  }
  return (
    <div className="cc-page">
      <div className="cc-col">
        <Back to="Agreements" onClick={async () => { await send(); navigate('/coach/settings/agreements'); }} />
        <PageHeader title={pkg.name} meta={['Your package', <Saved key="s" status={status} />]} />
        <div className="ab-form">
          <KindForm terms={terms} change={change} changeKind={(k) => change({ kind: k })} first="Your client" party={{ first: 'Your client' }} d={d} rate={null} packageGbpMinor={null} overrides={{}} lines={lines} pkgMode />
          <Sec id="ab-note">The note</Sec>
          <TextBox label="What would you like to say to each client?" value={note} maxLength={1000} onChange={(v) => { setNote(v); latest.current = { ...latest.current, note: v }; later(); }} />
          <Hint>[name] becomes the client’s first name. It opens the email and the agreement.</Hint>
          <div className="ab-acts"><Button variant="primary" onClick={async () => { await send(); toast.show('Saved'); navigate('/coach/settings/agreements'); }}>Done</Button></div>
        </div>
      </div>
    </div>
  );
}
