import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, PdfDownload, SlidePanel, Stat } from '../../components/design';
import { moneyWords as minorWords, rateWords as minorRateWords } from '../../lib/billing/money.js';
import { associateMonth, payLabels } from '../../lib/finance/associates.js';
import { monthKey } from '../../lib/finance/year.js';
import { poundsWords } from '../../lib/finance/words.js';
import { associatePay, canMarkPaid, hoursFigure, paidStatementRow, payWords, rateMinorOf, statementFacts, theirClientsPaid } from '../../lib/coach/associatePay';
import { keyOf, newId, removeRow, rowsOf, saveRow } from '../../lib/coach/store';
import { dayWordsFrom } from '../../lib/coach/financeData';
import { Row, TextLink, useCoachPortal } from './parts';
import { useAssociateSessions, useDone } from './financeParts';
import './pay.css';

// An associate's hours and pay (Phase 6b run 2, step 5; M11 C12 and C13).
// - Settings, Coaches (owner): each associate's section, with Coaching hours, Pay owed and What their clients paid for
//   this month, Their clients and the Monthly statement with its Preview panel. Supervision and Documents aren't built.
// - Today (an associate): Your hours and pay, their own figures only, with Download my <Month> statement (a light PDF).
// The owner reads the month from its saved statement (062's associate_statements, through usePayData below),
// 062's associate_month_minutes, or the owner's view of the associate's sessions (058); an associate reads their own
// sessions and rate. Everywhere a past session with no outcome yet counts as held until it's marked otherwise.

const sessionsOf = (state) => rowsOf(state, 'coach_sessions');

/**
 * Finances' rows this needs, from the coach context: `finance` ({ ready, settings, statements }) as the brief names it,
 * or the flat fields the store gives (`statements`, `financeSettings`). Neither there: not ready, so nothing new shows.
 */
export function usePayData() {
  const { finance, statements, financeSettings } = useCoachPortal();
  if (finance) return { ready: Boolean(finance.ready), statements: finance.statements || [], settings: finance.settings || null };
  if (Array.isArray(statements)) return { ready: true, statements, settings: financeSettings || null };
  return { ready: false, statements: [], settings: null };
}

/**
 * The owner's view of every associate's month (062's associate_month_minutes: minutes only, the owner with the code).
 * Empty until 062 is there or while offline; the saved statement wins when there is one.
 */
export function useMonthMinutes(month, enabled = true) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!enabled || !month) return undefined;
    let live = true;
    supabase.rpc('associate_month_minutes', { p_month: `${month}-01` })
      .then(({ data, error }) => { if (live && !error && Array.isArray(data)) setRows(data); })
      .catch(() => { /* quiet: offline, or 062 not there yet */ });
    return () => { live = false; };
  }, [month, enabled]);
  return rows;
}

/** The three figures, on an equal grid (the hours alone on its row on a phone, as M11 draws it). */
function PayFigures({ label, children }) {
  return <div className="cc-pay-figures" role="group" aria-label={label}>{children}</div>;
}

/**
 * Maya's November statement: its lines, the note, and Done (M11 C12). The owner's panel also ends with "Mark as paid"
 * (run 2's brief, step 5: he pays outside the portal, and Mark as paid records it on the cash flow), or, once marked,
 * "Paid Tue 1 Dec".
 */
export function StatementPanel({ open, onClose, title, lines = [], note, paidWords = null, onMarkPaid = null }) {
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={title}
      footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={onClose}>Done</Button></div>}
    >
      <div className="cc-rows cc-pay-lines">
        {lines.map((l) => <Row key={l.label} title={l.label} facts={[l.detail]} when={l.value} />)}
      </div>
      {note && <p className="cc-note cc-pay-note">{note}</p>}
      {paidWords && <p className="cc-note cc-pay-paid">{paidWords}</p>}
      {!paidWords && onMarkPaid && <div className="cc-acts cc-pay-acts"><TextLink onClick={onMarkPaid}>Mark as paid</TextLink></div>}
    </SlidePanel>
  );
}

/**
 * Settings, Coaches: one associate's section (owner only). `onOpenClients` opens the associate's own panel, which
 * lists their clients.
 */
export function AssociateSection({ associate, onOpenClients }) {
  const { userId, coach, state, todayKey, admin, payments, invoices } = useCoachPortal();
  const finance = usePayData();
  const done = useDone();
  const [preview, setPreview] = useState(false);
  const month = monthKey(todayKey);
  const name = associate.full_name || associate.first_name;
  const rateMinor = rateMinorOf(associate);
  const minutes = useMonthMinutes(month, finance.ready);
  // Before 062's associate_month_minutes is there, or offline: the owner's view of their sessions (058, the same read
  // as Finances' forecast), an ended one counting as held, so the figures still show rather than vanish.
  const assoc = useAssociateSessions(userId);
  const pay = useMemo(() => associatePay({
    associateId: associate.coach_id, rateMinor, month, statements: finance.statements,
    sessions: [...sessionsOf(state), ...assoc.map((r) => ({ coach_id: r.coach_id, starts_at: r.starts_at, minutes: r.minutes, outcome: null }))],
    noShowsPaid: Boolean(finance.settings?.no_shows_paid), monthMinutes: minutes.find((r) => r.coach_id === associate.coach_id) || null, nowMs: Date.now(),
  }), [associate.coach_id, rateMinor, month, finance.statements, finance.settings, state, minutes, assoc]);
  const theirs = useMemo(() => (admin || []).filter((a) => a.coach_id === associate.coach_id && a.status !== 'past'), [admin, associate.coach_id]);
  const paid = useMemo(() => theirClientsPaid({ payments, invoices, profileIds: theirs.map((a) => a.profile_id), month }), [payments, invoices, theirs, month]);
  const labels = payLabels(month);
  const words = payWords({ name, month, readyOn: pay.readyOn });
  const clients = associate.clients == null ? theirs.length : Number(associate.clients);
  const markPaid = () => {
    const before = pay.statement;
    const row = paidStatementRow({ id: newId(), statement: before, ownerId: coach.id, associateId: associate.coach_id, month, pay, rateMinor,
      minutesRow: minutes.find((r) => r.coach_id === associate.coach_id) || null, noShowsPaid: Boolean(finance.settings?.no_shows_paid), today: todayKey });
    // One row an associate and month (the store keys it so), so two devices marking the same month write the same row.
    done(() => saveRow(userId, 'associate_statements', row), 'Saved.', () => (before ? saveRow(userId, 'associate_statements', before) : removeRow(userId, 'associate_statements', keyOf('associate_statements', row))));
  };
  const rateUnit = rateMinor != null ? minorRateWords(rateMinor, 'hour') : (pay.statement ? minorRateWords(Number(pay.statement.rate_minor) || 0, 'hour') : undefined);

  return (
    <section className="ds-section cc-part cc-pay-part" aria-labelledby={`cc-pay-${associate.coach_id}`}>
      <div className="ds-section-head cc-pay-head">
        <h2 className="ds-section-title" id={`cc-pay-${associate.coach_id}`}>{name}</h2>
        <span className="cc-pay-aside">Associate</span>
      </div>
      <PayFigures label={`${name}, ${labels.hours}`}>
        {pay.delivered && <Stat className="cc-pay-hours" label={labels.hours} value={hoursFigure(pay.delivered.minutes)} />}
        {pay.delivered && <Stat label={labels.owed} value={poundsWords(pay.delivered.payMinor)} unit={rateUnit} />}
        <Stat label="What their clients paid" value={poundsWords(paid)} />
      </PayFigures>
      <div className="cc-rows cc-pay-rows">
        <Row title="Their clients" facts={[clients === 1 ? '1 client' : `${clients} clients`]} when="Open" label={`Their clients, ${clients === 1 ? '1 client' : `${clients} clients`}. Open`} onClick={onOpenClients} />
        {pay.delivered
          ? <Row title="Monthly statement" facts={[words.statementRow]} when="Preview" label={`Monthly statement, ${words.statementRow}. Preview`} onClick={() => setPreview(true)} />
          : <Row title="Monthly statement" facts={[words.statementRow]} />}
      </div>
      <StatementPanel open={preview} onClose={() => setPreview(false)} title={words.panelTitle} lines={pay.lines} note={words.panelNote}
        paidWords={pay.paidOn ? `Paid ${dayWordsFrom(pay.paidOn, todayKey)}` : null} onMarkPaid={canMarkPaid(pay, todayKey) ? markPaid : null} />
    </section>
  );
}

/** Today's last section for an associate: their own hours and pay this month, and the statement as a PDF. */
export function YourHoursAndPay() {
  const { coach, sessions, todayKey } = useCoachPortal();
  const finance = usePayData();
  const month = monthKey(todayKey);
  const rateMinor = rateMinorOf(coach);
  // A past session with no outcome written yet counts as held until it's marked otherwise (062's rule, the forecast's
  // and Settings, Coaches'), so these hours agree with what Tim sees; the statement PDF reads the same figures.
  const pay = useMemo(() => associatePay({
    associateId: coach.id, rateMinor, month, statements: finance.statements.filter((s) => s.associate_id === coach.id), sessions: sessions || [],
    noShowsPaid: Boolean(finance.settings?.no_shows_paid), nowMs: Date.now(),
  }), [coach.id, rateMinor, month, finance.statements, finance.settings, sessions]);
  const labels = payLabels(month);
  // With no sessions this month yet, the month is 0 hours (and £0 once there is a rate): never another coach's figure.
  // Hours are known without a rate: the same rule, counted at £0 (pay shows only once there is a rate or a statement).
  const minutes = pay.delivered ? pay.delivered.minutes
    : associateMonth({ coachId: coach.id, rateMinor: 0, sessions: sessions || [], month, noShowsPaid: Boolean(finance.settings?.no_shows_paid), nowMs: Date.now() }).minutes;
  const payMinor = pay.delivered ? pay.delivered.payMinor : 0;
  const known = rateMinor != null || pay.from === 'statement';
  const getDocument = async () => {
    const { associateStatementPdf } = await import('../../lib/pdf/docs/associateStatement');
    const full = pay.delivered ? pay : { ...pay, delivered: { minutes: 0, payMinor: 0 }, lines: [{ label: 'Coaching hours', detail: `0 hours at ${minorWords(rateMinor || 0)}`, value: minorWords(0) }] };
    return associateStatementPdf(statementFacts({ name: coach.full_name || coach.display_first_name, month, pay: full, rateMinor }));
  };
  return (
    <>
      <PayFigures label="Your hours and pay">
        <Stat label={labels.hours} value={hoursFigure(minutes)} empty="No coaching hours yet this month." />
        {known && <Stat label={labels.pay} value={poundsWords(payMinor)} empty="Nothing earned yet this month." />}
      </PayFigures>
      {known && (
        <div className="cc-acts cc-pay-acts">
          <PdfDownload variant="text" lightOnly label={labels.download} getDocument={getDocument} />
        </div>
      )}
    </>
  );
}
