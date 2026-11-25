import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, InlineChoice, SlidePanel, TextField, useToast } from '../../../components/design';
import { ask } from '../../../lib/agreements/askClient';
import { moneyText } from '../../../lib/agreements/currency';
import { extendOptions, pauseMove } from '../../../lib/agreements/endDate';
import { refund14, windowEnds } from '../../../lib/agreements/coolingOff';
import { usedCount } from '../../../lib/agreements/sessionOutcome';
import {
  endEarlyOptions, endEarlySentence, hoursState, paidOn, pauseFromOptions, pauseToOptions, penceFrom, perSessionMinor, settledInvoices,
} from '../../../lib/agreements/duringAgreement';
import { dayKeyWords } from '../../../lib/time/index.js';
import { futureSessionsPlan } from '../../../lib/coach/calendar';
import { kindOf } from '../../../lib/agreements/terms';
import { useCalendar } from '../calendarParts';
import { loadCoach, rowsOf } from '../../../lib/coach/store';
import { TextLink, useCoachPortal } from '../parts';
import { Points, Problem } from '../needsYou/panels';
import '../needsYou/needsyou.css';

// Group D's panels on an agreement's page (Phase 6b run 3; M28 s-extend, s-pause, s-endearly, s-refund, and Cancel
// within 14 days from the brief, items 13 and 18): each changes a running agreement in one step through the server
// (asks.js 'agreements' and 061's refund and credit), which emails the client and keeps the record; nothing here writes
// the agreement itself. An email can't be taken back, so each says what went without Undo. Cancel within 14 days is
// offered only to a self-funded individual inside their 14 days (coolingOff.offered): never a team or an organisation's.
//   panel: 'extend' | 'pause' | 'end' | 'refund' | 'cancel14' | null
//   a, v, t: the agreement, the version in force and its terms; name: the client's; end: the end date now; sessions: its own.

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function useAsk(onClose) {
  const { userId } = useCoachPortal();
  const toast = useToast();
  const busy = useRef(false);
  return async (fn, message, setProblem) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const answer = await fn();
      if (!answer?.ok) { setProblem(answer?.message || 'That didn’t work. Try again in a moment.'); return; }
      toast.saved({ message: typeof message === 'function' ? await message(answer) : message });
      loadCoach(userId, { again: true }).catch(() => {});
      onClose();
    } finally { busy.current = false; }
  };
}
const foot = (left, button) => <div className="cc-panel-foot ny-foot">{left || <span />}{button}</div>;

function Extend({ a, name, end, onClose }) {
  const options = end ? extendOptions(end) : [];
  const [to, setTo] = useState(options[0]?.value);
  const [problem, setProblem] = useState(null);
  const run = useAsk(onClose);
  const label = options.find((o) => o.value === to)?.label || '';
  const go = () => run(() => ask('agreements', 'extend', { agreementId: a.id, endsOn: to }), `Extended to ${label}. ${firstOf(name)} has an email.`, setProblem);
  return {
    title: 'New end date',
    footer: foot(null, <Button variant="primary" onClick={go}>{`Extend to ${label}`}</Button>),
    body: (
      <>
        <p className="ny-meta"><span>{name}</span></p>
        <Points label="The end date" rows={[{ label: 'Ends now', value: end ? dayKeyWords(end, { year: true }) : '' }]} />
        <div className="cc-field"><Dropdown label="When should it end now?" options={options} value={to} onChange={(v) => { setTo(v); setProblem(null); }} /></div>
        <p className="ny-say">{`This only gives ${firstOf(name)} more time, so it applies straight away and ${firstOf(name)} gets an email.`}</p>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function Pause({ a, t, name, end, today, onClose }) {
  const froms = pauseFromOptions(today);
  const [from, setFrom] = useState(froms[0]?.value);
  const tos = pauseToOptions(from);
  const [to, setTo] = useState(tos[0]?.value);
  useEffect(() => { if (!pauseToOptions(from).some((o) => o.value === to)) setTo(pauseToOptions(from)[0]?.value); }, [from, to]);
  const [problem, setProblem] = useState(null);
  const run = useAsk(onClose);
  const moved = end ? pauseMove(end, from, to) : { ok: Boolean(to > from), line: '' };
  const go = () => {
    if (!moved.ok) { setProblem('Choose an Until date after From.'); return; }
    run(() => ask('agreements', 'pause', { agreementId: a.id, from, to }), (ans) => (ans.endsOn || moved.end ? `Paused. It now ends on ${dayKeyWords(ans.endsOn || moved.end, { year: true })}.` : 'Paused.'), setProblem);
  };
  return {
    title: 'Pause coaching',
    footer: foot(null, <Button variant="primary" onClick={go}>Pause coaching</Button>),
    body: (
      <>
        <p className="ny-meta"><span>{name}</span></p>
        <div className="cc-field cc-two ny-two">
          <Dropdown label="Pause from when?" options={froms} value={from} onChange={(v) => { setFrom(v); setProblem(null); }} />
          <Dropdown label="Until when?" options={tos} value={to} onChange={(v) => { setTo(v); setProblem(null); }} />
        </div>
        {moved.line && <p className="ny-say">{moved.line}</p>}
        {t?.kind === 'retainer' && <p className="ny-hint">Its monthly invoices pause too.</p>}
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function EndEarly({ a, t, name, end, today, onClose }) {
  const options = endEarlyOptions(today, end);
  const [who, setWho] = useState('client');
  const [on, setOn] = useState(options[0]?.value);
  const [problem, setProblem] = useState(null);
  const run = useAsk(onClose);
  const label = options.find((o) => o.value === on)?.label || '';
  const go = () => run(() => ask('agreements', 'end_early', { agreementId: a.id, endsOn: on, by: who }), `It ends on ${label}. ${firstOf(name)} has an email.`, setProblem);
  return {
    title: 'End early',
    footer: foot(null, <Button variant="primary" onClick={go}>{`End on ${label}`}</Button>),
    body: (
      <>
        <p className="ny-meta"><span>{name}</span></p>
        <div className="cc-field"><InlineChoice label="Who’s ending it?" options={[{ value: 'client', label: `${firstOf(name)} asked` }, { value: 'coach', label: 'You’re ending it' }]} value={who} onChange={setWho} semantics="radio" /></div>
        <div className="cc-field"><Dropdown label="What’s the last day?" options={options} value={on} onChange={(v) => { setOn(v); setProblem(null); }} /></div>
        <p className="ny-say">{endEarlySentence(t)}</p>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function Refund({ a, name, onClose }) {
  const p = useCoachPortal();
  const list = settledInvoices(p.invoices, a.id, p.creditNotes);
  const [invId, setInvId] = useState(list[0]?.id);
  const inv = list.find((i) => i.id === invId) || null;
  const [type, setType] = useState('refund');
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const [problem, setProblem] = useState(null);
  const run = useAsk(onClose);
  const c = inv?.currency || 'GBP';
  const pence = penceFrom(amount);
  const money = pence > 0 ? moneyText(pence, c) : '';
  const go = async () => {
    if (!inv) return;
    if (!(pence > 0)) { setProblem('Add an amount.'); return; }
    if (pence > inv.left_minor) { setProblem(`That’s more than is left to give back on this invoice (${moneyText(inv.left_minor, c)}).`); return; }
    const { coachBilling } = await import('../../../lib/coach/financeActions');
    run(() => coachBilling(p.userId, { kind: type, invoiceId: inv.id, amount: pence, reason: why.trim() || undefined }),
      type === 'refund' ? `Refunded ${money}. A credit note is made.` : `${money} kept as credit. A credit note is made.`, setProblem);
  };
  const first = firstOf(name);
  return {
    title: 'Give money back',
    footer: foot(null, inv ? <Button variant="primary" onClick={go}>{type === 'refund' ? `Refund ${money}`.trim() : `Keep ${money || 'it'} as credit`}</Button> : null),
    body: !inv ? <p className="cc-quiet">Nothing has been settled on this agreement yet, so there’s nothing to give back.</p> : (
      <>
        <p className="ny-meta"><span>{name}</span><span>{`CLARITY-${inv.number}, ${moneyText(Number(inv.paid_minor) || Number(inv.total_minor) || 0, c)}, settled`}</span></p>
        {list.length > 1 && <div className="cc-field"><Dropdown label="Which invoice?" options={list.map((i) => ({ value: i.id, label: `CLARITY-${i.number}, ${moneyText(Number(i.paid_minor) || Number(i.total_minor) || 0, i.currency || 'GBP')}` }))} value={invId} onChange={setInvId} /></div>}
        <div className="cc-field"><InlineChoice label="How should it go back?" options={[{ value: 'credit', label: 'Credit for future work' }, { value: 'refund', label: 'Refund' }]} value={type} onChange={(v) => { setType(v); setProblem(null); }} semantics="radio" /></div>
        <div className="cc-field"><TextField label="How much?" inputMode="decimal" value={amount} autoComplete="off" onChange={(e) => { setAmount(e.target.value); setProblem(null); }} /></div>
        <div className="cc-field"><TextField label="What’s it for?" value={why} maxLength={500} autoComplete="off" onChange={(e) => setWhy(e.target.value)} /></div>
        <p className="ny-say">{type === 'refund' ? `Stripe returns it to ${first}’s card and keeps a credit note with the invoice.` : `It stays as credit against ${first}’s next invoice, with a credit note.`}</p>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function Cancel14({ a, v, t, name, signed, sessions, firstV, onClose }) {
  const p = useCoachPortal();
  const cal = useCalendar();
  const [problem, setProblem] = useState(null);
  const [delivered, setDelivered] = useState('');
  const run = useAsk(onClose);
  const c = t?.currency || 'GBP';
  const k = kindOf(t);
  // The first signing's tick and choice: a later signed version is an amendment (agreements rule 12).
  const startNow = Boolean((firstV || v)?.start_now);
  const per = k === 'sessions' || k === 'retainer' ? perSessionMinor(t, (firstV || v)?.settle_choice || 'plan') : 0;
  const paid = paidOn(p.invoices, a.id);
  const since = Date.parse((firstV || v)?.client_signed_at || 0);
  const had = k === 'sessions' || k === 'retainer' ? usedCount((sessions || []).filter((s) => Date.parse(s.starts_at) >= since)) : 0;
  const hoursMinor = k === 'hours' ? (() => {
    const h = hoursState({ agreement: a, terms: t, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices });
    const mins = h.log.filter((e) => Date.parse(e.started_at) >= since).reduce((m, e) => m + Math.max(0, Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000)), 0);
    return Math.round(mins * (Number(t.hours?.rateMinor) || 0) / 60);
  })() : 0;
  const typed = k === 'oneoff' ? penceFrom(delivered) : null;
  const deliveredMinor = k === 'oneoff' ? (Number.isFinite(typed) ? typed : 0) : hoursMinor;
  const back = startNow ? Math.max(0, refund14({ paidMinor: paid, sessionsHad: had, perSessionMinor: per, startNow }) - deliveredMinor) : paid;
  const first = firstOf(name);
  const ahead = futureSessionsPlan(a.profile_id, { data: cal.data, now: p.now });
  const go = () => {
    if (k === 'oneoff' && startNow && Number.isNaN(typed)) { setProblem('Type what was delivered in pounds, like 500.'); return; }
    run(() => ask('agreements', 'cancel_14', { agreementId: a.id, ...(k === 'oneoff' && startNow && typed != null ? { deliveredMinor: typed } : {}) }),
      async (ans) => {
        // Coaching sessions still to come come off the calendar as its own Delete takes them; nothing is emailed about them.
        let off = 0;
        if (ahead.count) { const fresh = futureSessionsPlan(a.profile_id, { data: cal.data, now: Date.now() }); if (await cal.run(fresh.plan, { quiet: true })) off = fresh.count; }
        const tell = off ? ` ${off} coaching ${off === 1 ? 'session' : 'sessions'} to come ${off === 1 ? 'is' : 'are'} off your calendar, so let ${first} know.` : '';
        return Number(ans.refundMinor) > 0 ? `Cancelled. ${moneyText(Number(ans.refundMinor), ans.currency || c)} goes back to ${first}, with a credit note.${tell}` : `Cancelled. ${first} has an email.${tell}`;
      }, setProblem);
  };
  return {
    title: 'Cancel within 14 days',
    footer: foot(<TextLink onClick={onClose}>Keep the agreement</TextLink>, <Button variant="primary" onClick={go}>{back > 0 ? `Cancel and refund ${moneyText(back, c)}` : 'Cancel the agreement'}</Button>),
    body: (
      <>
        <p className="ny-meta"><span>{name}</span></p>
        <p className="ny-say">{`${first} signed on ${dayKeyWords(signed, { year: true })}, so their 14 days to change their mind run to ${dayKeyWords(windowEnds(signed), { year: true })}.`}</p>
        {k === 'oneoff' && startNow && <div className="cc-field"><TextField label="How much of the work has been delivered?" inputMode="decimal" value={delivered} autoComplete="off" onChange={(e) => { setDelivered(e.target.value); setProblem(null); }} /></div>}
        <Points label="What happens" rows={[
          { label: 'Settled so far', value: moneyText(paid, c) },
          ...(startNow && per ? [{ label: 'Coaching sessions had', value: `${had}, at ${moneyText(per, c)} each` }] : []),
          ...(startNow && k === 'hours' ? [{ label: 'Hours logged', value: moneyText(hoursMinor, c) }] : []),
          { label: 'Goes back', value: moneyText(back, c) },
        ]} />
        <p className="ny-hint">{`${back > 0 ? `Stripe returns it to ${first}’s card, with a credit note, and ${first} gets an email.` : `${first} gets an email.`}${ahead.count ? ` ${ahead.count} coaching ${ahead.count === 1 ? 'session' : 'sessions'} still to come ${ahead.count === 1 ? 'comes' : 'come'} off your calendar, with no email about ${ahead.count === 1 ? 'it' : 'them'}, so let ${first} know.` : ''}`}</p>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

const BODIES = { extend: Extend, pause: Pause, end: EndEarly, refund: Refund, cancel14: Cancel14 };

/** One of the agreement page's panels (null when none is open). */
export function AgreementPanels({ panel, onClose, ...facts }) {
  const shown = useRef(panel);
  if (panel) shown.current = panel;
  const kind = shown.current;
  const Body = kind && BODIES[kind];
  if (!Body) return <SlidePanel open={false} onClose={onClose} title="The agreement" />;
  return <Frame key={kind} open={Boolean(panel)} Body={Body} facts={facts} onClose={onClose} kind={kind} />;
}
function Frame({ open, Body, facts, onClose, kind }) {
  const made = Body({ ...facts, onClose });
  return (
    <SlidePanel open={open} onClose={onClose} title={made.title} footer={made.footer} draftKey={`agreement-${kind}:${facts.a?.id}`}>
      <div className="ny-panel">{made.body}</div>
    </SlidePanel>
  );
}
