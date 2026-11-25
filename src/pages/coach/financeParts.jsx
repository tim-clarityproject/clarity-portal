import { useEffect, useMemo, useRef, useState } from 'react';
import { AddButton, Button, ChartTips, Dropdown, InlineChoice, SlidePanel, SwitchRow, TextField, tipProps, useIsPhone, useToast } from '../../components/design';
import { newId, removeRow, rowNow, saveChange, saveRow } from '../../lib/coach/store';
import { SUPERSEDED_MESSAGE } from '../../lib/friendlyError';
import { supabase } from '../../lib/supabase';
import { keptAssociateSessions, loadFinanceAssociateSessions } from '../../lib/coach/associateSessions';
import { amountProblem, draftDue, financeModel, invoiceNo, invoiceTitle, invoiceWho, overdueWords, paidDay, poundsFromTyped, reminderLines, dayWordsFrom, undoOf } from '../../lib/coach/financeData';
import { coachBilling, receiptProblem } from '../../lib/coach/financeActions';
import { moneyWords } from '../../lib/billing/money';
import { addMonths, DEFAULT_SECTORS, financialYear, monthKey } from '../../lib/finance/index.js';
import { TextLink, useCoachPortal } from './parts';

// Finances' shared parts (Phase 6b run 2; M11 C4 to C9): the data every tab reads, the months chart, the cash flow's
// line, a row with a figure at its right, who an invoice or payment is for, a receipt, and the invoice panels
// (a draft waiting to send, an overdue one, a new one), which Overview and Invoices both open. Every sum is
// src/lib/finance's (through financeData.js); nothing here works a figure out.

/** The settings row as the page uses it: the database's, or 062's defaults until it is there. */
export function settingsOf(row, coachId) {
  return { coach_id: coachId, year_start_month: 5, minimum_minor: 200000, targets_mode: 'each', tax_share_percent: 25, keep_above_minor: null,
    bank_balance_minor: null, bank_checked_at: null, no_shows_paid: false, vat_registered: false, vat_registered_on: null, cash_months: 6, ...(row || {}) };
}

/** Clients' and organisations' names by id (the owner's own clients, and every coach's from the admin list). */
export function useNames() {
  const { admin, clients, organisations } = useCoachPortal();
  return useMemo(() => {
    const person = {};
    for (const a of admin || []) person[a.profile_id] = a.name;
    for (const c of clients || []) person[c.id] = c.name;
    const org = {};
    for (const o of organisations || []) org[o.id] = o.name;
    return { person, org };
  }, [admin, clients, organisations]);
}

/** Everything Finances shows, worked out once per change to the rows it reads. */
/**
 * Associates' booked and held sessions (058's owner view: time and length only), 3 months back to a year ahead, for
 * their pay in the forecast: the device's copy at once, then the database's. Finances, Today's Finances line and
 * Settings, Coaches all read them here, so their figures always agree (UI tester, run 2).
 */
export function useAssociateSessions(userId, enabled = true) {
  const [assoc, setAssoc] = useState(() => (enabled ? keptAssociateSessions(userId) : []));
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setAssoc(keptAssociateSessions(userId));
    loadFinanceAssociateSessions(userId).then((rows) => { if (live && rows) setAssoc(rows); }).catch(() => {});
    return () => { live = false; };
  }, [userId, enabled]);
  return assoc;
}

// 062's associate_month_minutes, by account and month, read at most once every 5 minutes (each Finances tab and Today
// ask for the same months). In memory only: numbers, never a client or a time.
const minutesRead = new Map();
const MINUTES_FRESH_MS = 5 * 60 * 1000;

/** The months whose delivered minutes Finances needs: this financial year so far, and the 3 before this month (the average). */
export function minutesMonths(todayKey, startMonth) {
  const now = monthKey(todayKey);
  const fy = financialYear(todayKey, startMonth).months.filter((m) => m <= now);
  return [...new Set([addMonths(now, -3), addMonths(now, -2), addMonths(now, -1), ...fy])].sort();
}

/**
 * Each associate's delivered minutes for `months` from 062's associate_month_minutes (the owner with the code), as
 * { 'YYYY-MM': rows }: only the months that answered, so a month that couldn't be read (offline, or 062 not there yet)
 * quietly falls back to 058's reading of the sessions.
 */
export function useMonthMinutesMap(userId, months, enabled = true) {
  const key = (months || []).join(',');
  const [map, setMap] = useState(() => {
    const out = {};
    for (const m of months || []) { const hit = minutesRead.get(`${userId}#${m}`); if (hit?.rows) out[m] = hit.rows; }
    return out;
  });
  useEffect(() => {
    if (!enabled || !userId || !key) return undefined;
    let live = true;
    const now = Date.now();
    Promise.all(key.split(',').map((m) => {
      const k = `${userId}#${m}`;
      const hit = minutesRead.get(k);
      if (hit && now - hit.at < MINUTES_FRESH_MS) return hit.promise.then((rows) => [m, rows]);
      const promise = Promise.resolve(supabase.rpc('associate_month_minutes', { p_month: `${m}-01` }))
        .then(({ data, error }) => (!error && Array.isArray(data) ? data : null)).catch(() => null);
      const entry = { at: now, promise, rows: hit?.rows ?? null };
      minutesRead.set(k, entry);
      promise.then((rows) => { if (rows) entry.rows = rows; else if (minutesRead.get(k) === entry) minutesRead.delete(k); });
      return promise.then((rows) => [m, rows]);
    })).then((pairs) => {
      if (!live) return;
      setMap(Object.fromEntries(pairs.filter(([, rows]) => Array.isArray(rows))));
    });
    return () => { live = false; };
  }, [userId, key, enabled]);
  return map;
}

export function useFinance({ includeLikely = false } = {}) {
  const portal = useCoachPortal();
  const { userId, coach, todayKey } = portal;
  const assoc = useAssociateSessions(userId);
  const settings = useMemo(() => settingsOf(portal.financeSettings, coach.id), [portal.financeSettings, coach.id]);
  const months = [3, 6, 12].includes(Number(settings.cash_months)) ? Number(settings.cash_months) : 6;
  const startMonth = Number(settings.year_start_month) || 5;
  const wanted = useMemo(() => minutesMonths(todayKey, startMonth), [todayKey, startMonth]);
  const monthMinutes = useMonthMinutesMap(userId, wanted, Boolean(portal.isOwner));
  const model = useMemo(() => financeModel({ ...portal, financeSettings: settings, associateSessions: assoc, monthMinutes }, { today: todayKey, months, includeLikely, nowMs: Date.now() }),
    [settings, portal.payments, portal.creditNotes, portal.invoices, portal.agreementVersions, portal.orgDeals, portal.coaches, portal.statements, portal.outgoings,
      portal.deadlines, portal.leads, portal.leadStages, portal.financeTargets, assoc, monthMinutes, todayKey, months, includeLikely]);
  const names = useNames();
  const sectors = (portal.financeSectors || []).length ? portal.financeSectors.map((s) => s.name) : [...DEFAULT_SECTORS];
  return { ...portal, settings, months, model, names, sectors, associateSessions: assoc };
}

/**
 * Save, then the toast with Undo for 10 seconds (coach rule 5); the calm line when it can't. A save refused because the
 * row changed in another tab or device since (store.js saveChange) says so, and the page shows the newest row.
 */
export function useDone() {
  const toast = useToast();
  return async (work, message = 'Saved.', onUndo) => {
    try {
      const status = await work();
      if (status === 'superseded') { toast.error(SUPERSEDED_MESSAGE); return false; }
      toast.saved({ message: status === 'queued' ? 'Will sync' : message, onUndo, long: true });
      return true;
    } catch (error) {
      toast.error(error?.message || 'That didn’t save. Check your connection and try again.');
      return false;
    }
  };
}

/**
 * Saves only the settings a panel changed (062's one row a coach), onto the row as it is now, never the panel's older
 * copy; refused when the row moved on since `basedOn` (its updated_at as the panel opened it). Undo puts back only
 * those settings.
 */
export function useSaveSettings() {
  const { userId, coach } = useCoachPortal();
  const done = useDone();
  return (change, message = 'Saved.', { basedOn } = {}) => {
    const key = { coach_id: coach.id };
    const was = settingsOf(rowNow(userId, 'finance_settings', key), coach.id);
    return done(() => saveChange(userId, 'finance_settings', key, change, { basedOn }), message, () => saveChange(userId, 'finance_settings', key, undoOf(change, was)));
  };
}

/** A section heading with something quiet at its right (M11's "Share of income, November", "£1,810/month"). */
export function FinPart({ title, aside, asideHide = true, children, className = '' }) {
  return (
    <section className={`ds-section cc-part fin-part ${className}`.trim()}>
      <div className="ds-section-head fin-head">
        <h2 className="ds-section-title">{title}</h2>
        {aside && <span className={`fin-head-aside${asideHide ? ' fin-hide-phone' : ''}`}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** A row: its title, quiet facts under it, and a figure (or a link) at its right. `onClick` makes it a button. */
export function FigRow({ title, facts = [], value, onClick, label, children }) {
  const inner = (
    <>
      <span className="fin-row-words">
        <b>{title}</b>
        {facts.filter(Boolean).length > 0 && <small data-grey-line>{facts.filter(Boolean).map((f, i) => <span key={`${i}:${f}`} data-drop={i}>{f}</span>)}</small>}
      </span>
      {value != null && <span className="fin-row-value">{value}</span>}
      {children}
    </>
  );
  if (!onClick) return <div className="cc-row cc-row--still fin-row">{inner}</div>;
  return <button type="button" className="cc-row fin-row" onClick={onClick} aria-label={label}>{inner}</button>;
}

/** The readout's words in the shared pop-up: the figure first and larger, then when, then the rest. */
function readoutTip(readout) {
  const [when, value, ...extra] = String(readout).split(', ');
  return value ? tipProps({ value, when, extra }) : tipProps({ value: when });
}

/**
 * The months chart (M11 C4): twelve bars, or the running total as a line, with each month's own target as a short
 * dashed line, a month at its target in mint, a past month under the minimum as a soft coral outline, this month in
 * the text colour with its projected part dashed, and months to come as dashed outlines. Every bar reads out.
 */
export function IncomeChart({ chart, mode }) {
  const isPhone = useIsPhone();
  const max = chart.scaleMax || 1;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const running = mode === 'running';
  const points = chart.bars.map((b, i) => ({ x: ((i + 0.5) / chart.bars.length) * 100, paid: b.paid, all: b.paid + b.projected, target: b.target, state: b.state }));
  const y = (v) => 100 - Math.max(0, Math.min(100, (v / max) * 100));
  const solid = points.filter((p) => p.state !== 'future').map((p) => `${p.x},${y(p.paid)}`).join(' ');
  const nowAt = points.findIndex((p) => p.state === 'current');
  const dashed = points.filter((p, i) => i >= Math.max(0, nowAt) && p.all > 0).map((p) => `${p.x},${y(p.state === 'current' ? p.all : p.all)}`).join(' ');
  const targets = points.filter((p) => p.target).map((p) => `${p.x},${y(p.target)}`).join(' ');
  return (
    <ChartTips className="fin-chart-wrap">
      <div className={`fin-chart${running ? ' fin-chart--running' : ''}${chart.line ? ' fin-chart--labelled' : ''}`}>
        {running && (
          <svg className="fin-chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {targets && <polyline className="fin-line fin-line--target" points={targets} vectorEffect="non-scaling-stroke" />}
            {dashed && <polyline className="fin-line fin-line--projected" points={dashed} vectorEffect="non-scaling-stroke" />}
            {solid && <polyline className="fin-line fin-line--paid" points={solid} vectorEffect="non-scaling-stroke" />}
          </svg>
        )}
        {chart.bars.map((b) => {
          const cls = ['fin-bar', `fin-bar--${b.state}`, b.reached ? 'fin-bar--reached' : '', b.belowMinimum ? 'fin-bar--low' : ''].filter(Boolean).join(' ');
          return (
            <span key={b.month} className={cls} {...readoutTip(b.readout)}>
              {!running && b.projected > 0 && <i className="fin-bar-projected" style={{ height: pct(b.projected) }} />}
              {!running && b.paid > 0 && <i className="fin-bar-paid" style={{ height: pct(b.paid) }} />}
              {!running && b.target > 0 && <em className="fin-bar-target" style={{ bottom: pct(b.target) }} />}
            </span>
          );
        })}
        {chart.line && (
          <div className={`fin-chart-line${running ? ' fin-chart-line--target' : ''}`} style={{ bottom: pct(chart.line.value) }}>
            <span data-chart-label>{chart.line.words}</span>
          </div>
        )}
      </div>
      <div className="fin-chart-x" aria-hidden="true">
        {chart.bars.map((b) => <span key={b.month}>{isPhone ? b.letter : b.label}</span>)}
      </div>
    </ChartTips>
  );
}

/** The cash flow's line (M11 C6): today, then each month's end, with the dotted soft coral "Keep above" line. */
export function CashChart({ cash }) {
  const pts = [{ key: 'today', label: 'Today', value: cash.cashNow, readout: cash.todayReadout }, ...cash.rows.map((r) => ({ key: r.month, label: r.label.startsWith('Rest of ') ? r.label.slice(8, 11) : r.label.slice(0, 3), value: r.cash, readout: r.readout }))];
  const values = [...pts.map((p) => p.value), cash.keepAbove];
  const hi = Math.max(...values, 1);
  const lo = Math.min(...values, 0);
  const span = hi - lo || 1;
  const x = (i) => (i / (pts.length - 1 || 1)) * 100;
  const y = (v) => 8 + (1 - (v - lo) / span) * 84;
  const line = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  return (
    <ChartTips className="fin-cash-wrap">
      <div className="fin-cash">
        <svg className="fin-chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline className="fin-line fin-line--projected" points={line} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="fin-keep" style={{ top: `${y(cash.keepAbove)}%` }}><span data-chart-label>{`Keep above ${moneyWords(Math.round(cash.keepAbove / 100) * 100)}`}</span></div>
        {pts.map((p, i) => <span key={p.key} className={`fin-dot${i === 0 ? ' fin-dot--now' : ''}`} style={{ left: `${x(i)}%`, top: `${y(p.value)}%` }} {...readoutTip(p.readout)} />)}
      </div>
      <div className="fin-cash-x" aria-hidden="true">{pts.map((p, i) => <span key={p.key} style={{ left: `${x(i)}%` }}>{p.label}</span>)}</div>
    </ChartTips>
  );
}

/** Who an invoice or a payment is for: a client or an organisation, found as it is typed; a bank payment may name anyone. */
export function WhoPicker({ label, value, onChange, anyName = false }) {
  const { clients, organisations } = useCoachPortal();
  const [q, setQ] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { setQ(value?.name || ''); }, [value?.name]);
  const typed = q.trim().toLowerCase();
  const found = useMemo(() => {
    if (!typed || (value && value.name === q)) return [];
    const people = (clients || []).filter((c) => c.status !== 'past' && String(c.name || '').toLowerCase().includes(typed)).slice(0, 5).map((c) => ({ kind: 'person', id: c.id, name: c.name, sector: c.sector }));
    const orgs = (organisations || []).filter((o) => String(o.name || '').toLowerCase().includes(typed)).slice(0, 5).map((o) => ({ kind: 'org', id: o.id, name: o.name, sector: o.sector }));
    return [...orgs, ...people].slice(0, 8);
  }, [typed, clients, organisations, value, q]);
  return (
    <div className="fin-who">
      <TextField label={label} value={q} placeholder="Search clients and organisations" autoComplete="off" role="combobox" aria-expanded={open && found.length > 0} aria-autocomplete="list"
        onChange={(e) => { setQ(e.target.value); setOpen(true); onChange(anyName && e.target.value.trim() ? { kind: 'name', id: null, name: e.target.value.trim() } : null); }} />
      {open && found.length > 0 && (
        <div className="fin-who-list" role="listbox" aria-label={label}>
          {found.map((f) => (
            <button key={`${f.kind}:${f.id}`} type="button" role="option" aria-selected="false" className="fin-who-item" onClick={() => { onChange(f); setQ(f.name); setOpen(false); }}>
              <span>{f.name}</span><small>{f.kind === 'org' ? 'Organisation' : 'Client'}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A receipt: a drop row that also opens the file chooser (on a phone, a photo or a file). */
export function ReceiptField({ file, onChange }) {
  const isPhone = useIsPhone();
  const toast = useToast();
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState(null);
  const take = (f) => {
    if (!f) return;
    const p = receiptProblem(f);
    setProblem(p);
    if (p) return;
    onChange(f);
    toast.show('Receipt attached.');
  };
  return (
    <div className="cc-field">
      <span className="cc-field-label">Receipt</span>
      {file ? (
        <div className="cc-line fin-receipt"><span><b>{file.name}</b></span><TextLink onClick={() => onChange(null)}>Remove</TextLink></div>
      ) : (
        // The shared add row (M11 draws the drop row as one: the coral cross, the words in the secondary grey), which
        // also takes a file dropped on it.
        <AddButton className={`fin-drop${over ? ' fin-drop--over' : ''}`} onClick={() => ref.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer?.files?.[0]); }}>
          {isPhone ? 'Take a photo or choose a file' : 'Drop a file here, or choose one'}
        </AddButton>
      )}
      <input ref={ref} className="cc-hidden-file" type="file" accept="image/*,application/pdf" tabIndex={-1} aria-hidden="true" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </div>
  );
}

/** A browser download: the file is made here, never sent anywhere. */
export function download(name, bytes, type) {
  const url = URL.createObjectURL(new window.Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CURRENCY_OPTIONS = [{ value: 'GBP', label: 'Pounds' }, { value: 'USD', label: 'US dollars' }, { value: 'EUR', label: 'Euros' }];
const DUE_OPTIONS = [{ value: 'in_14', label: 'In 14 days' }, { value: 'in_30', label: 'In 30 days' }, { value: 'on_receipt', label: 'On receipt' }];

/**
 * The invoice panels (M11 C7): `panel` is { kind: 'new' } | { kind: 'draft', id } | { kind: 'overdue', id } | { kind: 'view', id }
 * (a sent or paid one with no Stripe page yet).
 * New invoice and Send in Stripe ask the server (coach-billing 'one_off' and 'send'); Send a reminder now sends the
 * newest reminder drafted for it ('send_reminder'); Pause reminders keeps 061's pause for the client or organisation.
 */
export function InvoicePanels({ panel, onClose }) {
  const { userId, coach, invoices, invoiceReminders, reminderPauses, todayKey } = useCoachPortal();
  const names = useNames();
  const toast = useToast();
  const busy = useRef(false);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    if (panel?.kind === 'new') setForm({ who: null, what: '', amount: '', currency: 'GBP', due: 'in_30' });
    setProblem(null);
  }, [panel]);
  const inv = panel?.id ? (invoices || []).find((i) => i.id === panel.id) : null;
  const ask = async (body, message) => {
    if (busy.current) return false; // one request per press
    busy.current = true;
    try {
      const answer = await coachBilling(userId, body);
      if (!answer.ok) { setProblem(answer.message); return false; }
      toast.saved({ message });
      onClose();
      return true;
    } finally { busy.current = false; }
  };
  const sendNew = (send) => {
    const amount = poundsFromTyped(form.amount);
    if (!form.who || form.who.kind === 'name') { setProblem({ at: 'who', words: 'Choose who it’s for to carry on.' }); return; }
    if (!form.what.trim()) { setProblem({ at: 'what', words: 'Type what it’s for to carry on.' }); return; }
    if (amount == null) { setProblem({ at: 'amount', words: amountProblem(form.amount, '1,200') }); return; }
    ask({ kind: 'one_off', amount, [form.who.kind === 'org' ? 'organisationId' : 'profileId']: form.who.id, whatFor: form.what.trim(), currency: form.currency, due: form.due, sector: form.who.sector || undefined, send },
      send ? 'Sent in Stripe. It shows under Sent and due.' : 'Saved.');
  };
  const at = (key) => (problem && typeof problem === 'object' && problem.at === key ? <p className="cc-problem" role="alert">{problem.words}</p> : null);
  const general = problem && typeof problem === 'string' ? <p className="cc-problem" role="alert">{problem}</p> : null;

  if (panel?.kind === 'new') {
    return (
      <SlidePanel open onClose={onClose} title="New invoice" draftKey="fin-invoice:new"
        footer={<div className="cc-panel-foot"><TextLink onClick={() => form && sendNew(false)}>Save as a draft</TextLink><Button variant="primary" onClick={() => form && sendNew(true)}>Send in Stripe</Button></div>}>
        {form && (
          <>
            <div className="cc-field"><WhoPicker label="Who is it for?" value={form.who} onChange={(who) => { setForm((f) => ({ ...f, who })); setProblem(null); }} />{at('who')}</div>
            <div className="cc-field"><TextField label="What is it for?" value={form.what} maxLength={200} placeholder="A keynote, a team day or anything else" autoComplete="off" onChange={(e) => { setForm({ ...form, what: e.target.value }); setProblem(null); }} />{at('what')}</div>
            <div className="cc-field cc-two">
              <TextField label="Amount" inputMode="decimal" value={form.amount} placeholder={{ GBP: '£', USD: '$', EUR: '€' }[form.currency]} autoComplete="off" onChange={(e) => { setForm({ ...form, amount: e.target.value }); setProblem(null); }} />
              <Dropdown label="Currency" options={CURRENCY_OPTIONS} value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
            </div>
            {at('amount')}
            <div className="cc-field"><InlineChoice label="When is it due?" options={DUE_OPTIONS} value={form.due} onChange={(v) => setForm({ ...form, due: v })} semantics="radio" /></div>
            {general}
          </>
        )}
      </SlidePanel>
    );
  }
  if (!inv) return null;
  const who = invoiceWho(inv, names);
  if (panel.kind === 'draft') {
    return (
      <SlidePanel open onClose={onClose} title={invoiceTitle(inv)}
        footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Not now</TextLink><Button variant="primary" onClick={() => ask({ kind: 'send', invoiceId: inv.id }, 'Sent in Stripe. It shows under Sent and due.')}>Send in Stripe</Button></div>}>
        <p className="cc-quiet fin-meta">{[who, inv.payer_name && inv.payer_name !== who ? `Invoices go to ${inv.payer_name}` : null].filter(Boolean).join('   ')}</p>
        <FigRow title="Amount" value={moneyWords(Number(inv.total_minor), inv.currency || 'GBP')} />
        <FigRow title="Due" facts={[draftDue(inv, todayKey).fact]} value={draftDue(inv, todayKey).value} />
        {inv.po_number && <FigRow title="PO number" facts={['On the invoice']} value={inv.po_number} />}
        {general}
      </SlidePanel>
    );
  }
  // A sent or paid invoice with no Stripe page yet (the row opens Stripe's page when there is one): its facts, read only.
  if (panel.kind === 'view') {
    const paidOn = paidDay(inv);
    return (
      <SlidePanel open onClose={onClose} title={invoiceTitle(inv)} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={onClose}>Done</Button></div>}>
        <p className="cc-quiet fin-meta">{who}</p>
        {invoiceNo(inv) && <FigRow title="Invoice" value={invoiceNo(inv)} />}
        <FigRow title="Amount" value={moneyWords(Number(inv.total_minor), inv.currency || 'GBP')} />
        {inv.status === 'paid' && paidOn ? <FigRow title="Paid" value={dayWordsFrom(paidOn, todayKey)} />
          : inv.due_on ? <FigRow title="Due" value={dayWordsFrom(inv.due_on, todayKey)} /> : null}
      </SlidePanel>
    );
  }
  // An overdue invoice: its reminders, Pause reminders, and Send a reminder now.
  const rem = reminderLines({ invoice: inv, reminders: invoiceReminders, today: todayKey });
  const pause = (reminderPauses || []).find((p) => (inv.organisation_id ? p.organisation_id === inv.organisation_id : p.profile_id === inv.profile_id)) || null;
  const firstWord = String(who).split(/\s+/)[0] || who;
  const togglePause = async (on) => {
    try {
      if (on) {
        const row = { id: newId(), coach_id: coach.id, profile_id: inv.organisation_id ? null : inv.profile_id, organisation_id: inv.organisation_id || null };
        await saveRow(userId, 'invoice_reminder_pauses', row);
        toast.saved({ message: 'On', onUndo: () => removeRow(userId, 'invoice_reminder_pauses', row.id), long: true });
      } else if (pause) {
        await removeRow(userId, 'invoice_reminder_pauses', pause.id);
        toast.saved({ message: 'Off', onUndo: () => saveRow(userId, 'invoice_reminder_pauses', pause), long: true });
      }
    } catch (error) { toast.error(error?.message || 'That didn’t save. Check your connection and try again.'); }
  };
  const copyLink = async () => {
    if (!inv.hosted_url) { toast.show('This invoice has no payment link yet.'); return; }
    try { await navigator.clipboard.writeText(inv.hosted_url); toast.show('Copied.'); } catch { toast.error('That didn’t copy. Try again.'); }
  };
  const remindNow = () => {
    if (!rem.waiting) { setProblem(`No reminder is waiting to send. ${rem.lines[1] ? `${rem.lines[1]}.` : ''}`.trim()); return; }
    ask({ kind: 'send_reminder', reminderId: rem.waiting.id }, 'Reminder sent, with the payment link.');
  };
  return (
    <SlidePanel open onClose={onClose} title={invoiceTitle(inv)}
      footer={<div className="cc-panel-foot"><TextLink onClick={copyLink}>Copy the payment link</TextLink><Button variant="primary" onClick={remindNow}>Send a reminder now</Button></div>}>
      <p className="cc-quiet fin-meta">{[who, inv.due_on && inv.due_on < todayKey ? overdueWords(inv.due_on, todayKey) : null].filter(Boolean).join('   ')}</p>
      <FigRow title="Amount" facts={[inv.due_on ? `Due ${dayWordsFrom(inv.due_on, todayKey)}` : null]} value={moneyWords(Math.max(0, Number(inv.total_minor) - Number(inv.paid_minor || 0)), inv.currency || 'GBP')} />
      <FigRow title="Reminders" facts={rem.lines} value={rem.count} />
      <SwitchRow label={`Pause reminders for ${firstWord}`} note="For when you’ve agreed a later date." checked={Boolean(pause)} onChange={togglePause} />
      {general}
    </SlidePanel>
  );
}
