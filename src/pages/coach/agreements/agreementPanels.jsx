import { useEffect, useRef, useState } from 'react';
import { InlineChoice, TextField, ToolFrame, useToast } from '../../../components/design';
import { Card, Row } from '../../../components/design/Blocks';
import { AGREEMENT_LINES } from '../../../content/pageLines/coach';
import { ask } from '../../../lib/agreements/askClient';
import { moneyText } from '../../../lib/agreements/currency';
import { extendOptions, pauseMove } from '../../../lib/agreements/endDate';
import { ownSessions, refund14, sessionRanges, windowEnds } from '../../../lib/agreements/coolingOff';
import { usedCount } from '../../../lib/agreements/sessionOutcome';
import {
  endEarlyOptions, endEarlySentence, hoursState, paidOn, pauseFromOptions, pauseToOptions, penceFrom, perSessionMinor, settledInvoices,
} from '../../../lib/agreements/duringAgreement';
import { dayKeyWords } from '../../../lib/time/index.js';
import { futureSessionsPlan } from '../../../lib/coach/calendar';
import { kindOf } from '../../../lib/agreements/terms';
import { useCalendar } from '../calendarParts';
import { loadCoach, rowsOf } from '../../../lib/coach/store';
import { useCoachPortal } from '../parts';
import { Problem } from '../needsYou/panels';
import './agreementPage.css';

// The changes to a running agreement (Phase 6b run 3, Group D: M28 version 4's s-extend, s-pause, s-endearly,
// s-refund, and Cancel within 14 days from the brief, items 13 and 18; Polish 1, Stage C, C4: M28 v6 draws none of
// them, so each runs in focus mode as the builder does, one question per screen, a choice moving straight on, then
// "Does this read right?" with Change beside each answer and the change's own button as the last step's Finish).
// Each change is one step through the server (asks.js 'agreements' and 061's refund and credit), which emails the client
// and keeps the record; nothing here writes the agreement itself. An email can't be taken back, so each says what went
// without Undo. Cancel within 14 days is offered only to a self-funded individual inside their 14 days
// (coolingOff.offered, decided by the page): never a team or an organisation's.
//   kind: 'extend' | 'pause' | 'end' | 'refund' | 'cancel14'
//   a, v, t: the agreement, the version in force and its terms; name: the client's; end: the end date now; sessions: its own.

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const ONE_TAP_MS = 150;
/** What the toast says about the client's email: only that it went when the server says it did (Q13). */
const mailedWords = (ans, first) => (ans?.emailed ? `${first} has an email.` : `No email went, so let ${first} know.`);

function useAsk(onDone) {
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
      onDone();
    } finally { busy.current = false; }
  };
}

/** A choice that moves straight on (rule 21): the answer shows as chosen, then the next screen follows. */
function Pick({ question, options, value, onChange, onNext }) {
  return (
    <InlineChoice
      ariaLabel={question}
      options={options}
      value={value}
      onChange={onChange}
      onChoose={() => setTimeout(onNext, ONE_TAP_MS)}
      semantics="radio"
    />
  );
}

// ---------------------------------------------------------------- each change: its questions, its check and its button

function useExtend({ a, name, end, today, done }) {
  const options = end ? extendOptions(end, today) : [];
  const [to, setTo] = useState(options[0]?.value);
  const [problem, setProblem] = useState(null);
  const run = useAsk(done);
  const label = options.find((o) => o.value === to)?.label || '';
  const first = firstOf(name);
  return {
    name: 'Extend the end date',
    problem,
    steps: [{
      key: 'to', question: 'When should it end now?', hint: end ? `It ends on ${dayKeyWords(end, { year: true, today })} now.` : null,
      body: (next) => <Pick question="When should it end now?" options={options} value={to} onChange={(x) => { setTo(x); setProblem(null); }} onNext={next} />,
      check: `It ends on ${label} instead${end ? ` of ${dayKeyWords(end, { year: true, today })}` : ''}.`,
    }],
    say: `This only gives ${first} more time, so it applies straight away and ${first} gets an email. The price doesn’t change.`,
    finish: `Extend to ${label}`,
    go: () => run(() => ask('agreements', 'extend', { agreementId: a.id, endsOn: to }), (ans) => `Extended to ${label}. ${mailedWords(ans, first)}`, setProblem),
  };
}

function usePause({ a, t, end, today, done }) {
  const froms = pauseFromOptions(today);
  const [from, setFrom] = useState(froms[0]?.value);
  const tos = pauseToOptions(from, today);
  const [to, setTo] = useState(tos[0]?.value);
  useEffect(() => { if (!pauseToOptions(from).some((o) => o.value === to)) setTo(pauseToOptions(from)[0]?.value); }, [from, to]);
  const [problem, setProblem] = useState(null);
  const run = useAsk(done);
  const moved = end ? pauseMove(end, from, to, today) : { ok: Boolean(to > from), line: '' };
  // This year's dates without their year (writing rule 28).
  const words = (d) => (d ? dayKeyWords(d, { year: true, today }) : '');
  return {
    name: 'Pause coaching',
    problem,
    steps: [
      { key: 'from', question: 'Pause from when?', body: (next) => <Pick question="Pause from when?" options={froms} value={from} onChange={(x) => { setFrom(x); setProblem(null); }} onNext={next} />, check: `Coaching pauses from ${words(from)}.` },
      { key: 'to', question: 'Until when?', body: (next) => <Pick question="Until when?" options={tos} value={to} onChange={(x) => { setTo(x); setProblem(null); }} onNext={next} />, check: `It starts again after ${words(to)}.` },
    ],
    say: [moved.line, t?.kind === 'retainer' ? 'Its monthly invoices pause too.' : ''].filter(Boolean).join(' '),
    finish: 'Pause coaching',
    go: () => {
      if (!moved.ok) { setProblem('Choose an Until date after From.'); return; }
      run(() => ask('agreements', 'pause', { agreementId: a.id, from, to }), (ans) => (ans.endsOn || moved.end ? `Paused. It now ends on ${words(ans.endsOn || moved.end)}.` : 'Paused.'), setProblem);
    },
  };
}

function useEndEarly({ a, t, name, end, today, done }) {
  const options = endEarlyOptions(today, end);
  const first = firstOf(name);
  const [who, setWho] = useState('client');
  const [on, setOn] = useState(options[0]?.value);
  const [problem, setProblem] = useState(null);
  const run = useAsk(done);
  const label = options.find((o) => o.value === on)?.label || '';
  const whoOptions = [{ value: 'client', label: `${first} asked` }, { value: 'coach', label: 'You’re ending it' }];
  return {
    name: 'End early',
    problem,
    steps: [
      { key: 'who', question: 'Who’s ending it?', body: (next) => <Pick question="Who’s ending it?" options={whoOptions} value={who} onChange={setWho} onNext={next} />, check: who === 'client' ? `${first} asked to end it.` : 'You’re ending it.' },
      { key: 'on', question: 'What’s the last day?', body: (next) => <Pick question="What’s the last day?" options={options} value={on} onChange={(x) => { setOn(x); setProblem(null); }} onNext={next} />, check: `The last day is ${label}.` },
    ],
    say: `${endEarlySentence(t)} ${first} gets an email.`,
    finish: `End on ${label}`,
    go: () => run(() => ask('agreements', 'end_early', { agreementId: a.id, endsOn: on, by: who }), (ans) => `It ends on ${label}. ${mailedWords(ans, first)}`, setProblem),
  };
}

function useRefund({ a, name, done }) {
  const p = useCoachPortal();
  const list = settledInvoices(p.invoices, a.id, p.creditNotes);
  const [invId, setInvId] = useState(list[0]?.id);
  const inv = list.find((i) => i.id === invId) || null;
  const [type, setType] = useState('refund');
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const [problem, setProblem] = useState(null);
  const run = useAsk(done);
  const c = inv?.currency || 'GBP';
  const pence = penceFrom(amount);
  const money = pence > 0 ? moneyText(pence, c) : '';
  const first = firstOf(name);
  const invWords = (i) => `CLARITY-${i.number}, ${moneyText(Number(i.paid_minor) || Number(i.total_minor) || 0, i.currency || 'GBP')}`;
  const steps = [
    list.length > 1 && {
      key: 'invoice', question: 'Which invoice?',
      body: (next) => <Pick question="Which invoice?" options={list.map((i) => ({ value: i.id, label: invWords(i) }))} value={invId} onChange={(x) => { setInvId(x); setProblem(null); }} onNext={next} />,
      check: inv ? `From ${invWords(inv)}, settled.` : '',
    },
    {
      key: 'type', question: 'How should it go back?',
      body: (next) => <Pick question="How should it go back?" options={[{ value: 'refund', label: 'Refund' }, { value: 'credit', label: 'Credit for future work' }]} value={type} onChange={(x) => { setType(x); setProblem(null); }} onNext={next} />,
      check: type === 'refund' ? `As a refund to ${first}’s card.` : `As credit against ${first}’s next invoice.`,
    },
    {
      key: 'amount', question: 'How much?', hint: inv ? `Up to ${moneyText(inv.left_minor, c)} is left to give back on this invoice.` : null,
      body: () => <TextField aria-label="How much?" inputMode="decimal" value={amount} autoComplete="off" placeholder={c === 'GBP' ? 'e.g. 250' : undefined} onChange={(e) => { setAmount(e.target.value); setProblem(null); }} />,
      need: () => (!(pence > 0) ? 'Type how much should go back to carry on.' : inv && pence > inv.left_minor ? `That’s more than is left to give back on this invoice (${moneyText(inv.left_minor, c)}).` : null),
      check: money ? `${money} goes back.` : '',
    },
    {
      key: 'why', question: 'What’s it for?', hint: 'It’s on the credit note. You can leave it out.', skip: true,
      body: () => <TextField aria-label="What’s it for?" value={why} maxLength={500} autoComplete="off" onChange={(e) => setWhy(e.target.value)} />,
      check: why.trim() ? `For ${why.trim()}.` : 'No reason on the credit note.',
    },
  ].filter(Boolean);
  return {
    name: 'Give money back',
    problem,
    empty: !inv ? 'Nothing has been settled on this agreement yet, so there’s nothing to give back.' : null,
    steps,
    say: type === 'refund' ? `Stripe returns it to ${first}’s card and keeps a credit note with the invoice.` : `It stays as credit against ${first}’s next invoice, with a credit note.`,
    finish: type === 'refund' ? `Refund ${money}`.trim() : `Keep ${money || 'it'} as credit`,
    go: async () => {
      if (!inv) return;
      if (!(pence > 0)) { setProblem('Type how much should go back to carry on.'); return; }
      if (pence > inv.left_minor) { setProblem(`That’s more than is left to give back on this invoice (${moneyText(inv.left_minor, c)}).`); return; }
      // Through asks.js, so a build that isn't the live site has its stand-in (P14): never "didn't reach the server".
      run(() => ask('billing', type, { invoiceId: inv.id, amount: pence, ...(why.trim() ? { reason: why.trim() } : {}) }), (ans) => {
        const note = ans?.number ? `Credit note ${ans.number} is made.` : 'A credit note is made.';
        if (ans?.standIn) {
          return ans.number
            ? `${type === 'refund' ? `Refunded ${money}` : `${money} kept as credit`}, with credit note ${ans.number}. Off the live site nothing goes to Stripe.`
            : 'Nothing goes back off the live site, so nothing has changed.';
        }
        return type === 'refund' ? `Refunded ${money}. ${note}` : `${money} kept as credit. ${note}`;
      }, setProblem);
    },
  };
}

function useCancel14({ a, v, t, name, signed, sessions, firstV, today, zone = 'Europe/London', done }) {
  const p = useCoachPortal();
  const cal = useCalendar();
  const [problem, setProblem] = useState(null);
  const [delivered, setDelivered] = useState('');
  const run = useAsk(done);
  const c = t?.currency || 'GBP';
  const k = kindOf(t);
  // The first signing's tick and choice: a later signed version is an amendment (agreements rule 12).
  const startNow = Boolean((firstV || v)?.start_now);
  const per = k === 'sessions' || k === 'retainer' ? perSessionMinor(t, (firstV || v)?.settle_choice || 'plan') : 0;
  const paid = paidOn(p.invoices, a.id);
  const since = Date.parse((firstV || v)?.client_signed_at || 0);
  // Only this agreement's own sessions, never another running agreement's of the same client (F1).
  const ranges = sessionRanges({ agreement: a, agreements: rowsOf(p.state, 'agreements'), versions: rowsOf(p.state, 'agreement_versions') });
  const had = k === 'sessions' || k === 'retainer' ? usedCount(ownSessions(sessions, ranges, zone).filter((s) => Date.parse(s.starts_at) >= since)) : 0;
  const hoursMinor = k === 'hours' ? (() => {
    const h = hoursState({ agreement: a, terms: t, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices });
    const mins = h.log.filter((e) => Date.parse(e.started_at) >= since).reduce((m, e) => m + Math.max(0, Math.round((Date.parse(e.ended_at) - Date.parse(e.started_at)) / 60000)), 0);
    return Math.round(mins * (Number(t.hours?.rateMinor) || 0) / 60);
  })() : 0;
  const typed = k === 'oneoff' ? penceFrom(delivered) : null;
  const deliveredMinor = k === 'oneoff' ? (Number.isFinite(typed) ? typed : 0) : hoursMinor;
  const back = startNow ? Math.max(0, refund14({ paidMinor: paid, sessionsHad: had, perSessionMinor: per, startNow }) - deliveredMinor) : paid;
  const first = firstOf(name);
  const ownData = (data) => ({ ...data, sessions: ownSessions(data?.sessions, ranges, zone) });
  const ahead = futureSessionsPlan(a.profile_id, { data: ownData(cal.data), now: p.now });
  const asksDelivered = k === 'oneoff' && startNow;
  const facts = [
    `${first} signed on ${dayKeyWords(signed, { year: true, today })}, so their 14 days to change their mind run to ${dayKeyWords(windowEnds(signed), { year: true, today })}.`,
    `${moneyText(paid, c)} is settled so far.`,
    ...(startNow && per ? [had ? `${had} coaching ${had === 1 ? 'session was' : 'sessions were'} had, at ${moneyText(per, c)} each.` : 'No coaching sessions have been had yet.'] : []),
    ...(startNow && k === 'hours' ? [`${moneyText(hoursMinor, c)} of hours are logged.`] : []),
    `${moneyText(back, c)} goes back.`,
  ];
  return {
    name: 'Cancel within 14 days',
    problem,
    steps: asksDelivered ? [{
      key: 'delivered', question: 'How much of the work has been delivered?', hint: 'In pounds, like 500. Leave it empty for a full refund.',
      body: () => <TextField aria-label="How much of the work has been delivered?" inputMode="decimal" value={delivered} autoComplete="off" onChange={(e) => { setDelivered(e.target.value); setProblem(null); }} />,
      need: () => (Number.isNaN(typed) ? 'Type what was delivered in pounds, like 500.' : null),
      check: delivered.trim() ? `${moneyText(Number.isFinite(typed) ? typed : 0, c)} of the work was delivered.` : 'Nothing was delivered.',
    }] : [],
    facts,
    say: `${back > 0 ? `Stripe returns it to ${first}’s card, with a credit note, and ${first} gets an email.` : `${first} gets an email.`}${ahead.count ? ` ${ahead.count} coaching ${ahead.count === 1 ? 'session' : 'sessions'} still to come will come off your calendar, with no email about ${ahead.count === 1 ? 'it' : 'them'}, so let ${first} know.` : ''}`,
    finish: back > 0 ? `Cancel and refund ${moneyText(back, c)}` : 'Cancel the agreement',
    go: () => {
      if (asksDelivered && Number.isNaN(typed)) { setProblem('Type what was delivered in pounds, like 500.'); return; }
      run(() => ask('agreements', 'cancel_14', { agreementId: a.id, ...(asksDelivered && typed != null ? { deliveredMinor: typed } : {}) }),
        async (ans) => {
          // Coaching sessions still to come come off the calendar as its own Delete takes them; nothing is emailed about
          // them. The server has removed them (sessionsOff, with the rows it removed): this device only forgets those
          // rows. Only when it answered no count (a stand-in) does the device take them off itself.
          let off = 0;
          if (Number.isInteger(ans?.sessionsOff)) { cal.forgotten(ans.removed || [], ans.calls || []); off = ans.sessionsOff; }
          else if (ahead.count) { const fresh = futureSessionsPlan(a.profile_id, { data: ownData(cal.data), now: Date.now() }); if (await cal.run(fresh.plan, { quiet: true })) off = fresh.count; }
          const tell = off ? ` ${off} coaching ${off === 1 ? 'session' : 'sessions'} to come ${off === 1 ? 'is' : 'are'} off your calendar, so let ${first} know.` : '';
          return Number(ans.refundMinor) > 0 ? `Cancelled. ${moneyText(Number(ans.refundMinor), ans.currency || c)} goes back to ${first}, with a credit note.${tell}` : `Cancelled. ${mailedWords(ans, first)}${tell}`;
        }, setProblem);
    },
  };
}

const FLOWS = { extend: useExtend, pause: usePause, end: useEndEarly, refund: useRefund, cancel14: useCancel14 };

/** One change to a running agreement, in focus mode. `kind` picks it; `onClose` returns to the agreement's page. */
export function AgreementChange({ kind, onClose, ...facts }) {
  const useFlow = FLOWS[kind];
  if (!useFlow) return null;
  return <Flow key={kind} useFlow={useFlow} facts={facts} onClose={onClose} />;
}

function Flow({ useFlow, facts, onClose }) {
  const toast = useToast();
  const flow = useFlow({ ...facts, done: onClose });
  const [at, setAt] = useState(0);
  const [need, setNeed] = useState(null);
  // A Change on the check goes back to that question, then straight back to the check (as the builder's).
  const [toCheck, setToCheck] = useState(false);
  const steps = flow.steps;
  const total = steps.length + 1;
  const last = at >= steps.length;
  const step = last ? null : steps[at];
  const close = () => { toast.show(AGREEMENT_LINES.changeClosed); onClose(); };
  const next = () => {
    if (last) { flow.go(); return; }
    const missing = step.need?.();
    if (missing) { setNeed(missing); return; }
    setNeed(null);
    setAt(toCheck ? steps.length : at + 1);
    if (toCheck) setToCheck(false);
  };
  const back = at > 0 ? () => { setNeed(null); setToCheck(false); setAt(at - 1); } : undefined;
  const skip = step?.skip ? () => { setNeed(null); setAt(toCheck ? steps.length : at + 1); setToCheck(false); } : undefined;
  const name = facts.name ? `${flow.name}, ${facts.name}` : flow.name;

  if (flow.empty) {
    return (
      <ToolFrame step={1} steps={1} name={name} question={flow.name} onClose={onClose} closeLabel="Close" stepWords={<span aria-hidden="true" />} className="ap-flow">
        <p className="ap-flow-say">{flow.empty}</p>
      </ToolFrame>
    );
  }
  return (
    <ToolFrame
      step={at + 1}
      steps={total}
      name={name}
      question={last ? AGREEMENT_LINES.checkQuestion : step.question}
      hint={last ? null : step.hint}
      onClose={close}
      closeLabel="Close without changing anything"
      onNext={next}
      nextLabel={last ? flow.finish : 'Next'}
      onBack={back}
      onSkip={skip}
      skipLabel="Leave it out"
      last={last}
      stepWords={`Step ${at + 1} of ${total}`}
      className="ap-flow"
    >
      {!last && step.body(next)}
      {last && (
        <>
          {(steps.some((s) => s.check) || flow.facts) && (
            <Card className="ap-change">
              {steps.filter((s) => s.check).map((s) => (
                <Row
                  key={s.key}
                  name={s.check}
                  value={<button type="button" className="ds-more ds-more--small ds-more--bare" aria-label={`Change: ${s.question}`} onClick={() => { setToCheck(true); setNeed(null); setAt(steps.indexOf(s)); }}>Change</button>}
                />
              ))}
              {(flow.facts || []).map((f) => <Row key={f} name={f} />)}
            </Card>
          )}
          {flow.say && <p className="ap-flow-say">{flow.say}</p>}
        </>
      )}
      {(need || flow.problem) && <Problem>{need || flow.problem}</Problem>}
    </ToolFrame>
  );
}
