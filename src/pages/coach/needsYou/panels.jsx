import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, InlineChoice, SlidePanel, TextBox, TextField, useToast } from '../../../components/design';
import { Card } from '../../../components/design/Blocks';
import { supabase } from '../../../lib/supabase';
import { ask } from '../../../lib/agreements/askClient';
import { moneyText, rateText, hoursWords } from '../../../lib/agreements/currency';
import { invoiceLine, NONE_TICKED, sendLabel } from '../../../lib/agreements/delivered';
import { differences } from '../../../lib/agreements/differences';
import { blockShort, balanceLine } from '../../../lib/agreements/hours';
import { priceLine } from '../../../lib/agreements/renewals';
import { fill } from '../../../lib/agreements/talkingPoints';
import { sessionsToInvoice } from '../../../lib/agreements/delivered';
import { mainPoints, resolveChoice } from '../../../lib/agreements/clauses';
import AgreementView from '../../../components/agreements/AgreementView';
import { calendarLink } from '../../../components/agreements/SessionCheckRow';
import {
  dayOfStamp, hoursState, perSessionMinor, priceFromOptions, versionInForce, reminderToOffer,
} from '../../../lib/agreements/duringAgreement';
import { firstPaymentReminderEmail, signReminderEmail } from '../../../lib/email/agreementEmails';
import { invoiceReminderEmail } from '../../../lib/email/billingEmails';
import { dayIn, daysBetween, dayKeyWords } from '../../../lib/time/index.js';
import { keyOf, loadCoach, newId, removeRow, rowsOf, saveChange, saveRow } from '../../../lib/coach/store';
import { doneRow } from '../../../lib/agreements/needsYou';
import { TextLink, useCoachPortal } from '../parts';
import { MoneyField } from '../agreements/builderParts';
import './needsyou.css';

// Group D's Needs you panels (Phase 6b run 3; M28 s-n-delivered, s-n-signrem, s-n-hours, s-n-assoc, s-n-po, s-n-renew,
// s-n-price, s-n-change, s-n-overdue). Each opens from its Needs you row in the shared side panel (full screen on a
// phone), shows the drafted next step, and sends nothing until the coach presses its button. Done and Not now leave
// the list with Undo (065's needs_you_done); a sent email can't be taken back, so a send says what went, without Undo
// (as Finances' reminders do). The panels' foot follows the portal's panels: the quiet way out on the left, the one
// coral button on the right (M28 draws the button first and Not now as an outlined button).

const firstOf = (name) => String(name || '').trim().split(/\s+/)[0] || '';
import { possessive } from '../../../lib/possessive.js';

// ---------------------------------------------------------------- shared small parts

/** The drafted email as it will read (M28 .mail): subject, greeting, its paragraphs, the button, the coach's name. */
export function MailPreview({ doc, editing, text, onText }) {
  if (!doc) return null;
  const blocks = (doc.blocks || []).filter(Boolean);
  const headIdx = blocks.findIndex((b) => b.type === 'heading');
  const btnIdx = blocks.findIndex((b) => b.type === 'button');
  const middle = blocks.slice(headIdx + 1, btnIdx < 0 ? blocks.length : btnIdx).filter((b) => b.type === 'text');
  const after = btnIdx < 0 ? [] : blocks.slice(btnIdx + 1).filter((b) => b.type === 'text');
  return (
    <div className="ny-mail">
      <p className="ny-mail-subject">Subject: {doc.subject}</p>
      {headIdx >= 0 && <p>{blocks[headIdx].text}</p>}
      {editing
        ? <TextBox label="The email’s words" value={text} onChange={onText} maxLength={4000} />
        : middle.map((b, i) => <p key={`m${i}`}>{b.text}</p>)}
      {btnIdx >= 0 && <p><span className="ny-mail-button">{blocks[btnIdx].label}</span></p>}
      {after.map((b, i) => <p key={`a${i}`}>{b.text}</p>)}
    </div>
  );
}
/** The words between the greeting and the button, as the Edit box starts them (paragraphs, a blank line between). */
export function mailWords(doc) {
  const blocks = (doc?.blocks || []).filter(Boolean);
  const headIdx = blocks.findIndex((b) => b.type === 'heading');
  const btnIdx = blocks.findIndex((b) => b.type === 'button');
  return blocks.slice(headIdx + 1, btnIdx < 0 ? blocks.length : btnIdx).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
}

/** Talking points, for the coach to say (M28 .panel.talk). Never sent. */
export function TalkPanel({ points }) {
  if (!points) return null;
  return (
    <div className="ny-talk">
      <p className="ny-talk-label">What to say</p>
      {points.lines.map((l) => <p key={l} className="ny-talk-line">{l}</p>)}
      {points.tip && <p className="ny-talk-tip">{points.tip}</p>}
    </div>
  );
}

/** A block's balance as a bar (M28 .meter): mint, never coral. */
export function Meter({ used, block, label }) {
  const share = block > 0 ? Math.min(100, Math.round((used / block) * 1000) / 10) : 0;
  return <div className="ny-meter" role="img" aria-label={label}><i style={{ '--ny-fill': `${share}%` }} /></div>;
}

/** Label and value rows (M28 .kv), the agreement parts' own. */
export function Points({ rows, label }) {
  return (
    <dl className="ag-points ny-points" aria-label={label}>
      {rows.filter((r) => r.value).map((r) => (
        <div key={r.label} className="ag-point"><dt>{r.label}</dt><dd>{r.value}</dd></div>
      ))}
    </dl>
  );
}

/** The panel's own error line (M28 .err): what happened, then what to do. */
export const Problem = ({ children }) => (children ? <p className="cc-problem" role="alert">{children}</p> : null);

// ---------------------------------------------------------------- what every panel does

/** Done and Not now (065's needs_you_done, keyed by coach and item), each with Undo; asks that reload what they changed. */
export function useNeedsYouActs() {
  const { userId, coach, todayKey } = useCoachPortal();
  const toast = useToast();
  const busy = useRef(false);
  const mark = async (item, { state = 'done', until = null, message, undo = true }) => {
    const key = { coach_id: coach.id, item_key: item.key };
    const row = doneRow(coach.id, item.key, { state, until });
    try {
      await saveChange(userId, 'needs_you_done', key, { state: row.state, until: row.until, at: row.at });
    } catch { toast.error('That didn’t save. Check your connection and try again.'); return false; }
    const back = () => removeRow(userId, 'needs_you_done', keyOf('needs_you_done', key)).catch(() => {});
    if (message) {
      if (undo) toast.saved({ message, long: true, onUndo: back });
      else toast.saved({ message });
    }
    return true;
  };
  /** One ask at a time; on success the store reads again and the item is marked done (said without Undo). */
  const send = async (route, kind, body, { item, message, onProblem }) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const answer = await ask(route, kind, body);
      if (!answer.ok) { onProblem?.(answer.message); return false; }
      const said = typeof message === 'function' ? message(answer) : message;
      if (item) await mark(item, { message: said, undo: false });
      else if (said) toast.saved({ message: said });
      loadCoach(userId, { again: true }).catch(() => {});
      return answer;
    } finally { busy.current = false; }
  };
  return { mark, send, todayKey, busy };
}

function Foot({ left, children }) {
  return <div className="cc-panel-foot ny-foot">{left || <span />}{children}</div>;
}

// ---------------------------------------------------------------- the panels

function DeliveredBody({ item, close }) {
  const p = useCoachPortal();
  const navigate = useNavigate();
  const { mark, send } = useNeedsYouActs();
  const a = p.agreements.find((x) => x.id === item.data.agreementId);
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = v?.terms || {};
  const list = useMemo(() => (a ? sessionsToInvoice({ sessions: p.sessions, sources: rowsOf(p.state, 'invoice_sources'), profileId: a.profile_id, startsOn: t.startsOn, now: p.now }) : []), [a, p.sessions, p.state, t.startsOn, p.now]);
  const [ticked, setTicked] = useState(() => Object.fromEntries(list.map((s) => [s.id, true])));
  const [problem, setProblem] = useState(null);
  const per = perSessionMinor(t);
  const c = t.currency || 'GBP';
  const chosen = list.filter((s) => ticked[s.id] !== false);
  const name = p.clients.find((x) => x.id === a?.profile_id)?.name || '';
  const go = () => {
    if (!chosen.length) { setProblem(NONE_TICKED); return; }
    send('billing', 'delivered_invoice', { agreementId: a.id, sessionIds: chosen.map((s) => s.id) },
      { item, message: `Invoice for ${moneyText(per * chosen.length, c)} sent to ${firstOf(name)}`, onProblem: setProblem }).then((ok) => ok && close());
  };
  return {
    title: `${possessive(name)} invoice`,
    footer: <Foot left={<TextLink onClick={() => mark(item, { state: 'not_now', until: notNow(item, p.todayKey), message: 'Moved to tomorrow' }).then((ok) => ok && close())}>Not now</TextLink>}><Button variant="primary" onClick={go}>{sendLabel(chosen.length, per, c)}</Button></Foot>,
    body: (
      <>
        <p className="ny-meta">{`${t.coaching || 'Coaching'}, invoiced as delivered`}</p>
        <p className="ny-say">Coaching sessions since the last invoice:</p>
        <div className="ny-ticks">
          {list.map((s) => (
            <Checkbox key={s.id} checked={ticked[s.id] !== false} onChange={(on) => { setTicked((was) => ({ ...was, [s.id]: on })); setProblem(null); }}>
              {`${dayKeyWords(dayIn(p.settings?.time_zone || 'Europe/London', new Date(s.starts_at)), { year: true, today: p.todayKey })}, ${s.minutes || 60} minutes`}
            </Checkbox>
          ))}
        </div>
        {list[0] && <div className="cc-acts"><TextLink onClick={() => { close(); navigate(calendarLink(list[0].id)); }}>Check them in your calendar</TextLink></div>}
        <p className="ny-hint">{invoiceLine(chosen.length, per, c)}</p>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

const notNow = (item, today) => {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (item.kind === 'renew' || item.kind === 'price' || item.kind === 'fx' ? 7 : 1));
  return d.toISOString().slice(0, 10);
};

/** A drafted email to send (a signing reminder, a first payment's, an overdue invoice's), with Edit (M28 s-n-signrem). */
function MailBody({ item, close, doc, sendAsk, sentWords, title, extra }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => mailWords(doc));
  const [problem, setProblem] = useState(null);
  const { send } = useNeedsYouActs();
  const edited = text.trim() !== mailWords(doc).trim();
  const go = () => {
    if (!text.trim()) { setProblem('Type what the email says to carry on.'); return; }
    send(sendAsk.route, sendAsk.kind, { ...sendAsk.body, ...(edited ? { text: text.trim() } : {}) }, { item, message: sentWords, onProblem: setProblem }).then((ok) => ok && close());
  };
  return {
    title,
    footer: <Foot left={<TextLink onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</TextLink>}><Button variant="primary" onClick={go}>Send reminder</Button></Foot>,
    body: (
      <>
        <MailPreview doc={doc} editing={editing} text={text} onText={(v) => { setText(v); setProblem(null); }} />
        {extra}
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function SignReminderBody({ item, close }) {
  const p = useCoachPortal();
  const v = p.agreementVersions.find((x) => x.id === item.data.versionId);
  const a = v && p.agreements.find((x) => x.id === v.agreement_id);
  const name = p.clients.find((c) => c.id === a?.profile_id)?.name || '';
  const doc = useMemo(() => safeDoc(() => signReminderEmail({ firstName: firstOf(name), coachFirst: p.coach.display_first_name || 'Tim', link: 'https://portal.theclarityproject.co.uk/coaching' })), [name, p.coach.display_first_name]);
  return MailBody({ item, close, doc, title: `Reminder for ${firstOf(name)}`, sentWords: `Reminder sent to ${firstOf(name)}`,
    sendAsk: { route: 'agreements', kind: 'send_sign_reminder', body: { versionId: item.data.versionId, reminder: item.data.reminder } } });
}
function FirstPaymentBody({ item, close }) {
  const p = useCoachPortal();
  const v = p.agreementVersions.find((x) => x.id === item.data.versionId);
  const a = v && p.agreements.find((x) => x.id === v.agreement_id);
  const name = p.clients.find((c) => c.id === a?.profile_id)?.name || '';
  // The agreement's first payment, whichever version it was made from (an amendment's is the first signing's).
  const first = (p.invoices || []).find((i) => i.agreement_id === v?.agreement_id && (i.instalment_n ?? 1) === 1 && i.status !== 'void'
    && (i.kind === 'first_payment' || i.kind === 'deposit' || i.kind === 'instalment'));
  const amount = first ? moneyText(Math.max(0, Number(first.total_minor) - Number(first.paid_minor || 0)), first.currency || 'GBP') : '';
  const doc = useMemo(() => safeDoc(() => firstPaymentReminderEmail({ firstName: firstOf(name), coachFirst: p.coach.display_first_name || 'Tim', link: 'https://portal.theclarityproject.co.uk/coaching', amountWords: amount })), [name, p.coach.display_first_name, amount]);
  return MailBody({ item, close, doc, title: `Reminder for ${firstOf(name)}`, sentWords: `Reminder sent to ${firstOf(name)}`,
    sendAsk: { route: 'agreements', kind: 'send_first_payment_reminder', body: { versionId: item.data.versionId } } });
}
function safeDoc(make) { try { return make(); } catch { return null; } }

function OverdueBody({ item, close }) {
  const p = useCoachPortal();
  const toast = useToast();
  const inv = (p.invoices || []).find((i) => i.id === item.data.invoiceId);
  // The reminder drafted and waiting, or the one owed and not drafted yet (Stage D, item 15: Send drafts it then sends).
  const r = inv ? reminderToOffer(inv, p.invoiceReminders, p.todayKey) : null;
  const org = inv?.settles_to === 'organisation' ? p.organisations.find((o) => o.id === inv.organisation_id) : null;
  const client = p.clients.find((c) => c.id === inv?.profile_id);
  const first = firstOf(org ? (inv?.payer_name || org.name) : client?.name || inv?.payer_name);
  const left = inv ? Math.max(0, Number(inv.total_minor) - Number(inv.paid_minor || 0)) : 0;
  const doc = useMemo(() => (inv && r ? safeDoc(() => invoiceReminderEmail({
    stage: r.stage, firstName: first, number: `CLARITY-${inv.number}`, amountWords: moneyText(left, inv.currency || 'GBP'), dueDayWords: inv.due_on ? dayKeyWords(inv.due_on, { year: true, today: p.todayKey }) : '',
    settleByWords: r.settle_by ? dayKeyWords(r.settle_by, { year: true, today: p.todayKey }) : null, coachFirst: p.coach.display_first_name || 'Tim', settleLink: inv.hosted_url || 'https://invoice.stripe.com/',
    coachee: org && inv.profile_id ? (p.clients || []).find((c) => c.id === inv.profile_id)?.name || null : null, poNumber: org ? inv.po_number || null : null,
    toOrganisation: inv.settles_to === 'organisation' || Boolean(org),
    // The true days overdue today, as the server says it when it goes (Stage D, F3).
    daysOverdue: inv.due_on && p.todayKey ? Math.max(0, daysBetween(inv.due_on, p.todayKey)) : null,
  })) : null), [inv, r, first, left, org, p.clients, p.coach.display_first_name, p.todayKey]);
  const pause = (p.reminderPauses || []).find((x) => (org ? x.organisation_id === org.id : x.profile_id === inv?.profile_id)) || null;
  const togglePause = async () => {
    try {
      if (!pause) {
        const row = { id: newId(), coach_id: p.coach.id, profile_id: org ? null : inv.profile_id, organisation_id: org ? org.id : null };
        await saveRow(p.userId, 'invoice_reminder_pauses', row);
        toast.saved({ message: `Reminders paused for ${first}.`, long: true, onUndo: () => removeRow(p.userId, 'invoice_reminder_pauses', row.id).catch(() => {}) });
        close();
      } else {
        await removeRow(p.userId, 'invoice_reminder_pauses', pause.id);
        toast.saved({ message: `Reminders on again for ${first}.`, long: true, onUndo: () => saveRow(p.userId, 'invoice_reminder_pauses', pause).catch(() => {}) });
      }
    } catch { toast.error('That didn’t save. Check your connection and try again.'); }
  };
  const made = MailBody({ item, close, doc, title: `Reminder for ${first}`, sentWords: `Reminder sent to ${first}`,
    sendAsk: { route: 'billing', kind: 'send_reminder', body: r?.id ? { reminderId: r.id } : { invoiceId: inv?.id } },
    extra: <div className="cc-acts"><TextLink onClick={togglePause}>{pause ? 'Start reminders again' : `Pause reminders for ${first}`}</TextLink></div> });
  if (!inv || !r || !doc) return { title: 'Reminder', body: <p className="cc-quiet">This reminder has gone or isn’t needed any more.</p> };
  return made;
}

function HoursBody({ item, close }) {
  const p = useCoachPortal();
  const navigate = useNavigate();
  const { mark, send } = useNeedsYouActs();
  const [problem, setProblem] = useState(null);
  const a = p.agreements.find((x) => x.id === item.data.agreementId);
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = v?.terms || {};
  const h = hoursState({ agreement: a, terms: t, entries: rowsOf(p.state, 'time_entries'), invoices: p.invoices });
  const name = p.clients.find((c) => c.id === a?.profile_id)?.name || '';
  const c = t.currency || 'GBP';
  const block = Number(t.hours?.blockMinor) || 0;
  const go = () => send('billing', 'top_up', { agreementId: a.id }, { item, message: `Top-up invoice sent to ${firstOf(name)}`, onProblem: setProblem }).then((ok) => ok && close());
  return {
    title: `${possessive(firstOf(name))} hours`,
    footer: <Foot left={<TextLink onClick={() => mark(item, { state: 'not_now', until: notNow(item, p.todayKey), message: 'Moved to tomorrow' }).then((ok) => ok && close())}>Not now</TextLink>}><Button variant="primary" onClick={go}>Send top-up invoice</Button></Foot>,
    body: (
      <>
        <p className="ny-meta">{blockShort(t.hours, c)}</p>
        <Meter used={h.used} block={h.block} label={balanceLine(h.used, h.block)} />
        <p className="ny-say">{balanceLine(h.used, h.block)}</p>
        <h3 className="ny-sec">Top-up invoice</h3>
        <Points label="Top-up invoice" rows={[{ label: 'Amount', value: moneyText(block, c) }, { label: 'For', value: `${hoursWords(Math.floor(block * 60 / (Number(t.hours?.rateMinor) || 1)))} more` }]} />
        <p className="ny-hint">{`${firstOf(name)} isn’t told by the portal. Nothing goes until you send it.`}</p>
        <div className="cc-acts"><TextLink onClick={() => { close(); navigate(`/coach/agreements/${a.id}/hours`); }}>See the hours log</TextLink></div>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function ApprovalBody({ item, close }) {
  const p = useCoachPortal();
  const { send } = useNeedsYouActs();
  const [info, setInfo] = useState(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.rpc('agreement_for_approval', { p_agreement: item.data.agreementId }).then(({ data }) => { if (live) setInfo(data || false); }).catch(() => { if (live) setInfo(false); });
    return () => { live = false; };
  }, [item.data.agreementId]);
  const t = info?.terms || {};
  const coachFirst = info?.coach_first || 'them';
  const rows = info ? differences(t, { overrides: info.overrides || {}, clientFirst: firstOf(info.client_name) }) : [];
  const points = info ? mainPoints(t, {}).filter((r) => ['Coaching sessions', 'Your investment', 'Dates'].includes(r.label)) : [];
  const approve = () => send('agreements', 'approve', { agreementId: item.data.agreementId }, { item, message: `Approved and sent to ${firstOf(info?.client_name)}`, onProblem: setProblem }).then((ok) => ok && close());
  const askChange = () => {
    if (!note.trim()) { setProblem(`Type what ${coachFirst} should change to carry on.`); return; }
    send('agreements', 'ask_change', { agreementId: item.data.agreementId, note: note.trim() }, { item, message: `Sent to ${coachFirst}`, onProblem: setProblem }).then((ok) => ok && close());
  };
  return {
    title: info?.client_name ? `${possessive(info.client_name)} agreement` : 'An agreement to approve',
    footer: asking
      ? <Foot left={<TextLink onClick={() => { setAsking(false); setProblem(null); }}>Cancel</TextLink>}><Button variant="primary" onClick={askChange}>{`Send to ${coachFirst}`}</Button></Foot>
      : <Foot left={<TextLink onClick={() => setAsking(true)}>{`Ask ${coachFirst} to change it`}</TextLink>}><Button variant="primary" onClick={approve}>Approve and send</Button></Foot>,
    body: info === null ? <p className="cc-quiet">Loading the agreement…</p> : info === false ? <p className="cc-quiet">This agreement isn’t waiting for you any more.</p> : (
      <>
        <p className="ny-meta">{`Made by ${item.title.replace(/ made an agreement for you to approve$/, '')}`}</p>
        <h3 className="ny-sec">What’s different</h3>
        {rows.length ? (
          <ul className="ny-list">{rows.map((r) => <li key={r.label} className="ny-li"><span><span className="ny-li-t">{r.label}</span><span className="ny-li-m">{r.detail}</span></span></li>)}</ul>
        ) : <p className="ny-say">Nothing. It uses your standard wording and package.</p>}
        <Points label="The agreement" rows={[{ label: 'Coaching', value: t.coaching || '' }, ...points]} />
        {/* The wording as it is stored and would be sent, every clause in full (break-it tester, run 3, finding 5). */}
        {Array.isArray(info.clauses) && info.clauses.length > 0 && (
          <>
            <h3 className="ny-sec">The wording</h3>
            <AgreementView clauses={resolveChoice(info.clauses, t.choice ?? 'upfront')} contents={false} idPrefix="ny-approve" />
          </>
        )}
        {asking && <div className="cc-field"><TextBox label={`What should ${coachFirst} change?`} value={note} onChange={(v) => { setNote(v); setProblem(null); }} maxLength={2000} /></div>}
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function PoBody({ item, close }) {
  const p = useCoachPortal();
  const { mark, busy } = useNeedsYouActs();
  const toast = useToast();
  const [po, setPo] = useState('');
  const [problem, setProblem] = useState(null);
  const org = p.organisations.find((o) => o.id === item.data.organisationId);
  const inv = (p.invoices || []).find((i) => i.id === item.data.invoiceId);
  const contact = rowsOf(p.state, 'organisation_contacts').find((c) => c.organisation_id === org?.id && /finance|sponsor|buyer/i.test(`${c.role || ''}`))
    || rowsOf(p.state, 'organisation_contacts').find((c) => c.organisation_id === org?.id) || null;
  const who = firstOf(contact?.name) || 'them';
  const amount = inv ? moneyText(Number(inv.total_minor) || 0, inv.currency || 'GBP') : '';
  const go = async () => {
    const n = po.trim();
    if (!n) { setProblem('Add the purchase order number first.'); return; }
    if (busy.current) return;
    busy.current = true;
    try {
      // The PO is kept for the organisation (062's purchase_orders), then the invoice goes with it on.
      if (!(p.purchaseOrders || []).some((x) => x.organisation_id === org.id && x.number === n)) {
        await saveRow(p.userId, 'purchase_orders', { id: newId(), coach_id: p.coach.id, organisation_id: org.id, number: n.slice(0, 80), currency: 'GBP', status: 'open' }).catch(() => {});
      }
      const { coachBilling } = await import('../../../lib/coach/financeActions');
      const answer = await coachBilling(p.userId, { kind: 'send', invoiceId: inv.id, poNumber: n });
      if (!answer.ok) { setProblem(answer.message); return; }
      await mark(item, { message: `Invoice sent with ${n}`, undo: false });
      close();
    } finally { busy.current = false; }
  };
  const askThem = () => {
    if (contact?.email) window.location.href = `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`A purchase order for ${inv?.number ? `invoice CLARITY-${inv.number}` : 'our invoice'}`)}`;
    mark(item, { state: 'not_now', until: notNow({ kind: 'po' }, p.todayKey), message: `Asked ${who} for the PO` }).then((ok) => ok && close());
    void toast;
  };
  return {
    title: org?.name || 'Purchase order',
    footer: <Foot left={<TextLink onClick={askThem}>{`Ask ${who} for it`}</TextLink>}><Button variant="primary" onClick={go}>Add and send invoice</Button></Foot>,
    body: (
      <>
        <p className="ny-meta">{inv?.number != null ? `Invoice CLARITY-${inv.number}, ${amount}` : `An invoice for ${amount}`}</p>
        <p className="ny-say">{`${firstOf(org?.name)} needs a purchase order before this invoice can go.`}</p>
        <div className="cc-field"><TextField label="What’s the purchase order?" value={po} placeholder="e.g. PO-48213" maxLength={80} autoComplete="off" onChange={(e) => { setPo(e.target.value); setProblem(null); }} /></div>
        <Problem>{problem}</Problem>
      </>
    ),
  };
}

function RenewBody({ item, close }) {
  const p = useCoachPortal();
  const navigate = useNavigate();
  const { mark } = useNeedsYouActs();
  const a = p.agreements.find((x) => x.id === item.data.agreementId);
  const name = p.clients.find((c) => c.id === a?.profile_id)?.name || '';
  const points = fill('renew', { focus: a ? versionInForce(p.agreementVersions, a.id)?.terms?.focus : null }, rowsOf(p.state, 'talking_points').filter((r) => r.coach_id === p.coach.id));
  const months = Number(item.data?.months) || 6;
  const draft = () => {
    mark(item, { message: `The next ${months} months are ready to check and send` });
    close();
    navigate(`/coach/agreements/${a.id}/edit?renew=${a.id}`);
  };
  return {
    title: `${possessive(name)} renewal`,
    footer: <Foot left={<TextLink onClick={() => mark(item, { state: 'not_now', until: notNow(item, p.todayKey), message: 'Moved to next week' }).then((ok) => ok && close())}>Not now</TextLink>}><Button variant="primary" onClick={draft}>{`Draft the next ${months} months`}</Button></Foot>,
    body: (
      <>
        <p className="ny-meta">{item.line.replace(/, \d+ days? to go$/, '')}</p>
        <TalkPanel points={points} />
      </>
    ),
  };
}

function PriceBody({ item, close }) {
  const p = useCoachPortal();
  const { mark, send } = useNeedsYouActs();
  const a = p.agreements.find((x) => x.id === item.data.agreementId);
  const v = a ? versionInForce(p.agreementVersions, a.id) : null;
  const t = v?.terms || {};
  const c = t.currency || 'GBP';
  const fee = Number(t.retainer?.feeMinor) || 0;
  const due = item.key.split(':')[2] || p.todayKey;
  const options = priceFromOptions(due, p.todayKey);
  // The new price as money (£3,300, as every money box shows it: builderParts' MoneyField), in minor units.
  const [priceMinor, setPriceMinor] = useState(() => Math.round(fee * 1.1 / 10000) * 10000);
  const [from, setFrom] = useState(options[0]?.value);
  const [problem, setProblem] = useState(null);
  const name = p.clients.find((x) => x.id === a?.profile_id)?.name || '';
  const pence = Number(priceMinor) || 0;
  const valid = pence > 0;
  const points = fill('price', { from, price: valid ? pence : null, currency: c }, rowsOf(p.state, 'talking_points').filter((r) => r.coach_id === p.coach.id));
  const go = () => {
    if (!valid) { setProblem('Type the new monthly price, like 3,300.'); return; }
    send('billing', 'updated_price', { agreementId: a.id, newFeeMinor: pence, fromDay: from, note: 'As we discussed, here’s your updated agreement.' },
      // An associate's new version waits for the owner's approval (break-it tester, run 3, finding 6).
      { item, message: (answer) => (answer.waiting ? `Signed. It goes to ${firstOf(name)} once your practice’s owner approves it.` : `Sent to ${firstOf(name)}: the updated agreement to sign`), onProblem: setProblem }).then((ok) => ok && close());
  };
  return {
    title: `${possessive(name)} price`,
    footer: <Foot left={<TextLink onClick={() => mark(item, { state: 'not_now', until: notNow(item, p.todayKey), message: 'Moved to next week' }).then((ok) => ok && close())}>Not now</TextLink>}><Button variant="primary" onClick={go}>Send the updated agreement</Button></Foot>,
    body: (
      <>
        <p className="ny-meta">{`${t.coaching || 'Monthly retainer'}, ${rateText(fee, 'month', c)} since ${dayKeyWords(t.priceSince || t.startsOn || due, { year: true }).replace(/^[A-Z][a-z]{2} \d{1,2} /, '')}`}</p>
        {/* Polish 1, Stage C (C2): the new price, then From when? as answer boxes (the reference's choices), not a drop-down. */}
        <div className="cc-field"><MoneyField label="What’s the new price?" value={priceMinor} currency={c} onChange={(v) => { setPriceMinor(v); setProblem(null); }} /></div>
        <div className="cc-field"><InlineChoice label="From when?" options={options} value={from} onChange={setFrom} /></div>
        {valid && fee > 0 && <p className="ny-hint">{priceLine(fee, pence, p.todayKey, from)}</p>}
        <TalkPanel points={points} />
        <Problem>{problem}</Problem>
        <p className="ny-hint">It goes with a short note: As we discussed, here’s your updated agreement.</p>
      </>
    ),
  };
}

function ChangeBody({ item, close }) {
  const p = useCoachPortal();
  const navigate = useNavigate();
  const { mark } = useNeedsYouActs();
  const r = rowsOf(p.state, 'agreement_change_requests').find((x) => x.id === item.data.requestId);
  const v = p.agreementVersions.find((x) => x.id === item.data.versionId);
  const a = p.agreements.find((x) => x.id === item.data.agreementId);
  const client = p.clients.find((c) => c.id === a?.profile_id);
  const make = () => {
    mark(item, { message: `Version ${(v?.version || 1) + 1} is ready to edit.` });
    close();
    navigate(`/coach/agreements/${a.id}/edit`, { state: { newVersion: true, changeRequestId: r?.id } });
  };
  const reply = () => {
    const email = client?.email;
    if (email) window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your coaching agreement')}`;
  };
  return {
    title: 'Change asked for',
    footer: <Foot left={<TextLink onClick={reply}>{`Reply to ${firstOf(client?.name)}`}</TextLink>}><Button variant="primary" onClick={make}>Make a new version</Button></Foot>,
    body: (
      <>
        <p className="ny-meta"><span>{client?.name}</span><span>{`Version ${v?.version || 1}`}</span></p>
        <blockquote className="ny-quote">{`“${r?.words || ''}”`}</blockquote>
        <p className="ny-hint">{item.line}</p>
        <p className="ny-hint">{`A new version keeps everything else as it is. ${firstOf(client?.name) || 'They'} signs it again, and nothing goes until you send it.`}</p>
      </>
    ),
  };
}

function FxBody({ item, close }) {
  const navigate = useNavigate();
  const p = useCoachPortal();
  const { mark } = useNeedsYouActs();
  return {
    title: 'The pound has moved',
    footer: <Foot left={<TextLink onClick={() => mark(item, { state: 'not_now', until: notNow(item, p.todayKey), message: 'Moved to next week' }).then((ok) => ok && close())}>Not now</TextLink>}><Button variant="primary" onClick={() => { mark(item, { message: 'Done' }); close(); navigate(`/coach/agreements/${item.data.agreementId}`); }}>Open the agreement</Button></Foot>,
    body: (<><p className="ny-say">{item.title}</p><p className="ny-hint">{item.line}</p></>),
  };
}

const BODIES = {
  delivered: DeliveredBody, sign_reminder: SignReminderBody, first_payment: FirstPaymentBody, overdue: OverdueBody, hours: HoursBody,
  approval: ApprovalBody, po: PoBody, renew: RenewBody, price: PriceBody, change: ChangeBody, fx: FxBody,
};

/** The panel for one Needs you item (the portal item opens its own page instead). */
export function NeedsYouPanel({ item, onClose }) {
  const shown = useRef(item);
  if (item) shown.current = item;
  const it = shown.current;
  const Body = it && BODIES[it.kind];
  if (!Body) return <SlidePanel open={false} onClose={onClose} title="Needs you" />;
  return <PanelFrame key={it.key} open={Boolean(item)} item={it} Body={Body} onClose={onClose} />;
}
function PanelFrame({ open, item, Body, onClose }) {
  const made = Body({ item, close: onClose });
  return (
    <SlidePanel open={open} onClose={onClose} title={made.title} footer={made.footer} draftKey={`needs-you:${item.key}`}>
      <div className="ny-panel">{made.body}</div>
    </SlidePanel>
  );
}
/**
 * The chosen item's detail on the Needs you page (Polish 1, Stage C, C2; M28 v6 "needs"): the same drafted next step as
 * its side panel, drawn as the reference's card beside the list, its button first and the quiet way out after it.
 * `onDone`: the item has gone (sent, Done or Not now), so the page shows the next one.
 */
export function NeedsYouDetail({ item, onDone }) {
  const navigate = useNavigate();
  if (!item) return null;
  if (item.kind === 'portal') {
    return (
      // A short label, so it stays on one line (design check `label-wrap`); the item's own words follow it.
      <Card label="Their supplier portal" className="ny-detail">
        <p className="ny-say">{`${item.title}.`}</p>
        <p className="ny-say">{item.line}</p>
        <div className="ny-detail-acts"><Button variant="primary" onClick={() => navigate(`/coach/invoices/${item.data.invoiceId}`)}>Open the invoice</Button></div>
      </Card>
    );
  }
  const Body = BODIES[item.kind];
  if (!Body) return null;
  return <DetailFrame key={item.key} item={item} Body={Body} onDone={onDone} />;
}
function DetailFrame({ item, Body, onDone }) {
  const made = Body({ item, close: onDone });
  return (
    <Card label={made.title} className="ny-detail">
      <div className="ny-panel ny-detail-body">{made.body}</div>
      {made.footer && <div className="ny-detail-acts">{made.footer}</div>}
    </Card>
  );
}
export { dayOfStamp };
