import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AddButton, Button, DatePicker, Dropdown, ExplainLink, InlineChoice, Loading, PageHeader, SegmentedControl, SlidePanel, Stat, StatGroup, TextField, useIsPhone, useToast,
} from '../../components/design';
import { coach062ReadyNow, newId, removeRow, rowNow, rowsOf, saveChange, saveChanges, saveRow, saveRows } from '../../lib/coach/store';
import { SUPERSEDED_MESSAGE } from '../../lib/friendlyError';
import { refreshPins, updatePreference, usePreferences } from '../../lib/menuPins';
import { dayKeyWords } from '../../lib/time/index.js';
import { moneyWords, rateWords } from '../../lib/billing/money';
import {
  addMonths, clientRows, copyToNewYear, financialYear, incomeChart, expectedIncome, monthKey, monthName, moneyFigures, ofWords, OUTGOING_GROUPS, poundsWords,
  proBono, sameEveryMonth, sameEveryMonthSums, sectorsFor, shareWords, stripeFees, targetRows, targetsByMonth, outgoingRows, threeMonthAverage, yearExport,
  EXPORT_COLUMNS, yearStartWords, hoursWords, bankCheckDue, newYearCheckDue, newYearCopyRows, targetsToSave, waitingForPounds,
} from '../../lib/finance/index.js';
import { toCsv } from '../../lib/finance/csv.js';
import { xlsxBytes } from '../../lib/coach/xlsx';
import {
  amountProblem, associateSessionsForForecast, cashSettingsChange, dayWordsFrom, invoiceTitle, needsYouRows, percentFromTyped, pipelineLine, poundsFromTyped, TOO_MUCH, typedPounds, undoOf,
} from '../../lib/coach/financeData';
import { renewals, renewalsLine } from '../../lib/coach/associatePay';
import { coachBilling, uploadReceipt } from '../../lib/coach/financeActions';
import { UnderTabs } from './todoParts';
import { Line, TextLink, useCoachPortal } from './parts';
import {
  CashChart, download, FigRow, FinPart, IncomeChart, InvoicePanels, ReceiptField, settingsOf, useDone, useFinance, useSaveSettings, WhoPicker,
} from './financeParts';
import { InvoicesTab, OtherTab, PricingTab } from './FinancesMore';
import './todos.css';
import './finances.css';

// Finances (Phase 6b run 2; M11 C3 to C9, seq 77 with the 19 Nov Finances layers), the owner's alone: Overview,
// Money, Cash flow, Invoices, Pricing and Other as underlined tabs, each its own address (/coach/finances/money).
// An associate opening any of them is sent to Today (CoachApp's route). Every figure is src/lib/finance's; the
// screens' lists come from financeData.js. The brief wins over M11 where they differ (Tim, 23 Nov): no VAT words
// while VAT is off, a missed instalment never pauses sessions (no Paused section), CLARITY- numbers.

export const FINANCE_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'money', label: 'Money' },
  { value: 'cash-flow', label: 'Cash flow' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'other', label: 'Other' },
];

/**
 * A first visit's first screen (coach rule 49): while associates' pay isn't known yet, the tab waits on the quiet
 * crosshair (data-first-wait: the first screen isn't drawn until it goes), never on a figure that then changes.
 */
const FirstWait = () => <div data-first-wait=""><Loading label="Loading your finances" /></div>;

export default function Finances() {
  const { tab: raw } = useParams();
  const navigate = useNavigate();
  const tab = FINANCE_TABS.some((t) => t.value === raw) ? raw : 'overview';
  const { todayKey, financeSettings } = useCoachPortal();
  const startMonth = Number(financeSettings?.year_start_month) || 5;
  useEffect(() => { if (raw && !FINANCE_TABS.some((t) => t.value === raw)) navigate('/coach/finances', { replace: true }); }, [raw, navigate]);
  return (
    <div className="cc-page">
      <div className="cc-col cc-col--wide fin-page">
        <PageHeader title="Finances" meta={[dayKeyWords(todayKey, { long: true }), yearStartWords(startMonth)]} />
        <div className="fin-tabs">
          <UnderTabs label="Finances" tabs={FINANCE_TABS} value={tab} panelId="fin-panel" onChange={(v) => navigate(v === 'overview' ? '/coach/finances' : `/coach/finances/${v}`)} />
        </div>
        <div id="fin-panel" role="tabpanel" aria-labelledby={`fin-panel-${tab}`}>
          {tab === 'overview' && <Overview />}
          {tab === 'money' && <Money />}
          {tab === 'cash-flow' && <CashFlow />}
          {tab === 'invoices' && <InvoicesTab />}
          {tab === 'pricing' && <PricingTab />}
          {tab === 'other' && <OtherTab />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Overview (M11 C4)

/** How to read the chart, with the minimum's own figure (M11: "Your minimum, £2,000/month."). */
const chartHelp = (mode, minimumMinor) => (mode === 'running' ? CHART_HELP.running : {
  title: 'How to read the chart',
  terms: [
    { term: 'Dashed line over each bar', meaning: 'That month’s own target.' },
    { term: 'Mint bar', meaning: 'The month reached its target.' },
    { term: 'Grey bar', meaning: ['Below the target.', minimumMinor > 0 ? `An outline means below your ${poundsWords(minimumMinor)} minimum.` : 'An outline means below your minimum.'] },
    { term: 'Dashed outline', meaning: 'Projected income, from signed agreements, repeating income and drafted invoices.' },
    { term: 'Dotted line', meaning: minimumMinor > 0 ? `Your minimum, ${rateWords(minimumMinor, 'month')}.` : 'Your minimum each month.' },
  ],
});

/** A monthly figure in whole pounds, as M11 shows them ("£1,050/month"); the sums underneath stay exact. */
const monthlyWords = (minor) => rateWords(Math.round((Number(minor) || 0) / 100) * 100, 'month');

/** A box's figure for editing, as M11 shows it: "£5,000" ("£5,000.50" with pence); '' for none. Typing either works. */
const poundsBox = (minor) => {
  if (minor == null || minor === '') return '';
  const n = Number(minor);
  return `£${(n / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

const CHART_HELP = {
  running: {
    title: 'How to read the chart',
    terms: [
      { term: 'Solid line', meaning: 'Income so far this year.' },
      { term: 'Dashed line', meaning: 'Projected income, from signed agreements, repeating income and drafted invoices.' },
      { term: 'Fine grey line', meaning: 'Your targets, adding up month by month.' },
    ],
  },
};

function Overview() {
  const fin = useFinance();
  const { model, settings, todayKey, financeTargets, sectors, leads, leadStages, names } = fin;
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [mode, setMode] = useState('month');
  const [sector, setSector] = useState('all');
  const [showProjected, setShowProjected] = useState(true);
  const [panel, setPanel] = useState(null); // 'targets' | invoice panel
  // The minimum is measured after associate pay: this month's for Your targets, each month's for the chart's outline.
  const rows = useMemo(() => targetRows({ today: todayKey, lines: model.lines, targets: financeTargets, minimumMinor: Number(settings.minimum_minor) || 0,
    associatePayMinor: model.associatePay?.[monthKey(todayKey)] || 0, startMonth: model.startMonth }), [model, financeTargets, settings.minimum_minor, todayKey]);
  const fy = financialYear(todayKey, model.startMonth);
  const expected = useMemo(() => expectedIncome({ today: todayKey, untilMonth: fy.months[11], invoices: fin.invoices || [], versions: model.versions, repeating: model.repeating }), [todayKey, fy.months, fin.invoices, model]);
  const chart = useMemo(() => incomeChart({ today: todayKey, lines: model.lines, expected, targets: financeTargets, minimumMinor: Number(settings.minimum_minor) || 0,
    associatePay: model.associatePay || {}, sector: sector === 'all' ? null : sector, mode, showProjected, startMonth: model.startMonth }), [todayKey, model, expected, financeTargets, settings.minimum_minor, sector, mode, showProjected]);
  const newYear = useNewYearTargets(fin, fy);
  const associatesToPay = (model.associates || []).map((a) => ({ coach_id: a.coach_id, first: String(a.name || 'your associate').split(/\s+/)[0] }));
  // The same low-cash month as Today's line: the cash flow's chosen months (cash_months), signed work only.
  const { userId, invoiceReminders } = useCoachPortal();
  const toast = useToast();
  const sending = useRef(false);
  const needs = needsYouRows({ cash: model.cashChosen || model.cash, invoices: fin.invoices || [], deadlines: fin.deadlines || [], today: todayKey, names, targetsToCheck: newYear.toCheck, associatesToPay, reminders: invoiceReminders || [], coachId: fin.coach?.id || null });
  // Send again, for a reminder whose sending couldn't be confirmed, once the coach has checked (follow-up 5, item 5).
  const sendAgain = async (reminderId) => {
    if (sending.current) return; // one request per press
    sending.current = true;
    try {
      const answer = await coachBilling(userId, { kind: 'send_reminder', reminderId, again: true });
      if (answer.ok && answer.sent) toast.saved({ message: 'Reminder sent, with the payment link.' });
      else if (answer.ok) toast.show('That reminder has already gone.');
      else toast.error(answer.message || 'That reminder didn’t send. Check your connection and try again.');
    } finally { sending.current = false; }
  };
  if (bankCheckDue({ settings, today: todayKey })) needs.push({ key: 'bank', title: `Check your bank balance for ${monthName(todayKey)}.`, link: 'Check the balance', to: '/coach/finances/cash-flow?bank=1' });
  const pipe = pipelineLine(leads, leadStages);
  // The same renewals as Clients' Renewals tab (one function), so the two counts and amounts always agree.
  const renew = renewalsLine(renewals({ today: todayKey, admin: fin.admin, coachId: fin.coach.id, engagements: rowsOf(fin.state, 'engagements'),
    agreements: fin.agreements, versions: fin.agreementVersions, orgDeals: fin.orgDeals, organisations: fin.organisations }));
  const repeatingMonthly = model.repeating.reduce((a, r) => a + r.amount_minor, 0);
  const sectorOptions = [{ value: 'all', label: 'All income' }, ...sectors.map((s) => ({ value: s, label: s }))];
  const month = rows.month;
  const year = rows.year;
  if (fin.waiting) return <FirstWait />;
  // While only Finances' first screen is here (store.js's partial), the parts drawn from the rest (names, leads,
  // renewals) show the quiet crosshair in their own spot.
  const partial = Boolean(fin.partial);
  return (
    <>
      <StatGroup className="cc-stats fin-stats fin-stats--3">
        <Stat label={`Income in ${monthName(todayKey)} so far`} value={poundsWords(month.paid)} unit={ofWords(month.paid, month.target) || undefined} bar={month.target ? Math.min(1, month.paid / month.target) : undefined} />
        <Stat label="Income this year" value={poundsWords(year.paid)} unit={ofWords(year.paid, year.target) || undefined} bar={year.target ? Math.min(1, year.paid / year.target) : undefined} />
        <Stat label="Cash in 6 months" value={poundsWords(model.cash6.end)} />
      </StatGroup>

      <FinPart title={chart.title} asideHide={false} aside={<ExplainLink explain={chartHelp(mode, Number(settings.minimum_minor) || 0)} helpKey={mode === 'running' ? 'finance-chart-total' : 'finance-chart'}>How to read the chart</ExplainLink>}>
        <div className="fin-ctl">
          <SegmentedControl label="Show" options={[{ value: 'month', label: 'Each month' }, { value: 'running', label: 'Running total' }]} value={mode} onChange={setMode} />
          <div className="fin-ctl-dd"><Dropdown label="Which income" options={sectorOptions} value={sector} onChange={setSector} /></div>
          <TextLink aria-pressed={!showProjected} onClick={() => setShowProjected((v) => !v)}>{chart.toggle}</TextLink>
        </div>
        <IncomeChart chart={chart} mode={mode} />
        <p className="cc-note fin-chart-note">{chart.note}</p>
      </FinPart>

      <FinPart title="Your targets" asideHide={false} aside={<TextLink onClick={() => setPanel({ kind: 'targets' })}>Edit targets</TextLink>}>
        {[month, rows.quarter, year].map((r) => (
          <FigRow key={r.label} title={r.label} facts={[r.figure, r.detail, isPhone ? null : r.minimum]} value={r.percentWords} onClick={() => setPanel({ kind: 'targets' })} label={`${r.label}: ${r.figure}. Edit targets`} />
        ))}
      </FinPart>

      {partial && <Loading label="Loading what needs you" />}
      {!partial && needs.length > 0 && (
        <FinPart title="Needs you">
          {needs.map((n) => (
            <Line key={n.key} title={n.title} small={n.small}>
              <TextLink aria-label={`${n.link}: ${n.title}`} onClick={() => (n.reminderId ? sendAgain(n.reminderId) : n.invoiceId ? setPanel({ kind: 'overdue', id: n.invoiceId }) : n.open ? setPanel({ kind: n.open }) : navigate(n.to))}>{n.link}</TextLink>
            </Line>
          ))}
        </FinPart>
      )}

      <FinPart title="Coming in">
        {partial ? <Loading label="Loading what’s coming in" /> : (
          <>
            <FigRow title="Pipeline" facts={pipe.facts} value={pipe.figure} onClick={() => navigate('/coach/leads/reports')} label={`Pipeline, ${pipe.figure}. Open lead reports`} />
            <FigRow title="Renewals in the next 90 days" facts={renew.facts} value={renew.figure} onClick={() => navigate('/coach/clients?tab=renewals')} label={`Renewals in the next 90 days, ${renew.facts[0]}, ${renew.figure}. Open renewals`} />
            <FigRow title="Repeating income" facts={['Portal seats and memberships']} value={repeatingMonthly ? rateWords(repeatingMonthly, 'month') : '£0/month'} />
          </>
        )}
      </FinPart>

      {isPhone && <div className="fin-foot-btn"><Button variant="primary" onClick={() => setPanel({ kind: 'new' })}>New invoice</Button></div>}

      <TargetsPanel open={panel?.kind === 'targets'} onClose={() => setPanel(null)} />
      {panel && panel.kind !== 'targets' && <InvoicePanels panel={panel} onClose={() => setPanel(null)} />}
    </>
  );
}

/**
 * A new financial year (run 2's brief): when it has no targets and last year had, last year's are copied in, month for
 * month, once, as a real save; then Needs you asks Tim to check them until he saves Edit targets. Whether they were
 * copied and checked is kept with the account's page settings (finance_new_year: { year, copied_at, checked_at }).
 * Copied only once the whole store has loaded with 062 there, so a stale device copy never writes over another
 * device's targets.
 */
function useNewYearTargets(fin, fy) {
  const { userId, coach, financeTargets, whole, todayKey } = fin;
  const prefs = usePreferences(userId);
  useEffect(() => { if (userId) refreshPins(userId); }, [userId]); // at most every half a minute
  const copying = useRef(false);
  const toCopy = newYearCopyRows({ targets: financeTargets, today: todayKey, startMonth: fin.model.startMonth });
  useEffect(() => {
    if (!whole || coach062ReadyNow() !== true || !toCopy.length || copying.current) return;
    copying.current = true;
    saveRows(userId, toCopy.map((r) => ['finance_targets', { coach_id: coach.id, month: r.month, target_minor: r.target_minor }]))
      .then(() => updatePreference(userId, 'finance_new_year', () => ({ year: fy.label, copied_at: new Date().toISOString(), checked_at: null })))
      .catch(() => { copying.current = false; });
  }, [whole, toCopy.length, fy.label]);
  const ny = prefs?.finance_new_year;
  return { toCheck: Boolean(ny && Number(ny.year) === fy.label && newYearCheckDue({ copiedAt: ny.copied_at, checkedAt: ny.checked_at })) };
}

/** Edit targets saved: the new year's copied targets are checked. */
const targetsChecked = (userId, yearLabel) => updatePreference(userId, 'finance_new_year', (was) => (was && Number(was.year) === yearLabel && !was.checked_at
  ? { ...was, checked_at: new Date().toISOString() } : was)).catch(() => {});

/** Edit targets (M11 C4): Set each month, or Same every month; the minimum; footnote; Cancel and Save. */
function TargetsPanel({ open, onClose }) {
  const { userId, coach, todayKey, financeTargets, financeSettings } = useCoachPortal();
  const done = useDone();
  const settings = settingsOf(financeSettings, coach.id);
  const fy = financialYear(todayKey, Number(settings.year_start_month) || 5);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    if (!open) return;
    const have = targetsByMonth(financeTargets, fy.months);
    // A new year with none set starts from last year's, month for month, for Tim to check.
    const copied = Object.values(have).every((v) => !v) ? Object.fromEntries(copyToNewYear({ targets: financeTargets, fromYear: fy.label - 1, toYear: fy.label, startMonth: Number(settings.year_start_month) || 5 }).map((r) => [monthKey(r.month), r.target_minor])) : {};
    const each = Object.fromEntries(fy.months.map((m) => [m, poundsBox(have[m] || copied[m] || '')]));
    const thisMonth = monthKey(todayKey);
    const sameFrom = fy.months.find((m) => m >= thisMonth) || fy.months[0];
    // What the panel opened with, and each row's version then: Save sends only what changed, onto the rows as they are
    // by then, and is refused if one of them changed in another tab or device meanwhile (break-it tester, 6b run 2).
    const bases = { settings: financeSettings?.updated_at ?? null,
      months: Object.fromEntries(fy.months.map((m) => [m, (financeTargets || []).find((t) => monthKey(t.month) === m)?.updated_at ?? null])) };
    setForm({ mode: settings.targets_mode === 'same' ? 'same' : 'each', each, start: have, same: poundsBox(have[sameFrom] || copied[sameFrom] || ''), minimum: poundsBox(settings.minimum_minor), raise: '',
      startSettings: { minimum_minor: Number(settings.minimum_minor), targets_mode: settings.targets_mode }, bases });
    setProblem(null);
    // Read once as the panel opens.
  }, [open]);
  if (!form) return null;
  const read = (t) => (String(t).trim() === '' ? 0 : poundsFromTyped(t, { allowZero: true }));
  const eachTotal = fy.months.reduce((a, m) => a + (read(form.each[m]) || 0), 0);
  const sameMinor = read(form.same);
  const sums = sameMinor != null ? sameEveryMonthSums(sameMinor) : null;
  const save = () => {
    const minimum = read(form.minimum);
    if (minimum == null) { setProblem('Type your minimum as an amount, such as 2,000.'); return; }
    let raise = null;
    if (String(form.raise).trim()) {
      raise = percentFromTyped(form.raise, { min: -99.99, max: 100 });
      if (raise == null) { setProblem('Type the rise as a percentage, such as 3.'); return; }
    }
    if (form.mode === 'same' && sameMinor == null) { setProblem('Type each month’s target as an amount, such as 5,000.'); return; }
    const bad = form.mode === 'each' && fy.months.find((m) => read(form.each[m]) == null);
    if (bad) { setProblem(`Type ${monthName(bad)}’s target as an amount, such as 5,000.`); return; }
    // Only the months changed here are written, each its own row (newest wins per month), so another tab's edit to a
    // different month is never lost; Same every month never changes a month gone by.
    let changed;
    try {
      changed = targetsToSave({ mode: form.mode, each: Object.fromEntries(fy.months.map((m) => [m, read(form.each[m])])), same: sameMinor, raise, start: form.start,
        yearLabel: fy.label, today: todayKey, startMonth: Number(settings.year_start_month) || 5 });
    } catch (error) { setProblem(error.message); return; }
    // Only the settings and months changed here, each onto its row as it is now (never this panel's older copy), and
    // none of them if one changed elsewhere since the panel opened; Undo puts back only those.
    const settingsChange = {};
    if (minimum !== form.startSettings.minimum_minor) settingsChange.minimum_minor = minimum;
    if (form.mode !== form.startSettings.targets_mode) settingsChange.targets_mode = form.mode;
    const settingsKey = { coach_id: coach.id };
    const steps = [...(Object.keys(settingsChange).length ? [{ table: 'finance_settings', key: settingsKey, change: settingsChange, basedOn: form.bases.settings }] : []),
      ...changed.map((r) => ({ table: 'finance_targets', key: { coach_id: coach.id, month: r.month }, change: { target_minor: r.target_minor }, basedOn: form.bases.months[monthKey(r.month)] ?? null }))];
    const undo = async () => {
      if (Object.keys(settingsChange).length) await saveChange(userId, 'finance_settings', settingsKey, undoOf(settingsChange, form.startSettings));
      for (const r of changed) {
        const key = { coach_id: coach.id, month: r.month };
        if (form.bases.months[monthKey(r.month)] != null) await saveChange(userId, 'finance_targets', key, { target_minor: Number(form.start[monthKey(r.month)]) || 0 });
        else if (rowNow(userId, 'finance_targets', key)) await removeRow(userId, 'finance_targets', `${coach.id}|${r.month}`);
      }
    };
    const work = async () => {
      const status = steps.length ? await saveChanges(userId, steps) : 'saved';
      if (status !== 'superseded') targetsChecked(userId, fy.label);
      return status;
    };
    done(work, 'Saved.', undo).then((ok) => { if (ok) onClose(); });
  };
  const box = (label, value, onChange) => <TextField label={label} inputMode="decimal" value={value} placeholder="£" autoComplete="off" onChange={(e) => { onChange(e.target.value); setProblem(null); }} />;
  return (
    <SlidePanel open={open} onClose={onClose} title="Edit targets" draftKey="fin-targets"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><InlineChoice label="Each month’s target" options={[{ value: 'each', label: 'Set each month' }, { value: 'same', label: 'Same every month' }]} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} semantics="radio" /></div>
      {form.mode === 'each' ? (
        <>
          <div className="cc-field fin-months">{fy.months.map((m) => <div key={m}>{box(monthName(m), form.each[m], (v) => setForm((f) => ({ ...f, each: { ...f.each, [m]: v } })))}</div>)}</div>
          <FigRow title="This financial year, adding up the months" value={poundsWords(eachTotal)} />
        </>
      ) : (
        <>
          <div className="cc-field">{box('Each month', form.same, (v) => setForm((f) => ({ ...f, same: v })))}</div>
          <FigRow title="Each quarter" value={sums ? poundsWords(sums.quarter) : ''} />
          <FigRow title="This financial year" value={sums ? poundsWords(sums.year) : ''} />
        </>
      )}
      <div className="cc-field"><TextField label="Raise them all by a percentage" inputMode="decimal" value={form.raise} placeholder="%" autoComplete="off" onChange={(e) => { setForm({ ...form, raise: e.target.value }); setProblem(null); }} /></div>
      <p className="cc-note">This month and the months after it, when you save.</p>
      <div className="cc-field">{box('Your minimum each month', form.minimum, (v) => setForm((f) => ({ ...f, minimum: v })))}</div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
      <p className="cc-note">Today’s Finances line and the chart follow these.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Money (M11 C5)

const PERIODS = [{ value: 'month', label: 'This month' }, { value: 'quarter', label: 'This quarter' }, { value: 'year', label: 'This year' }];

function Money() {
  const fin = useFinance();
  const { model, todayKey, names, sectors, packages } = fin;
  const [period, setPeriod] = useState('month');
  const [panel, setPanel] = useState(null); // 'bank' | 'export'
  const figures = useMemo(() => moneyFigures({ period, today: todayKey, lines: model.lines, invoices: fin.invoices || [], versions: model.versions, startMonth: model.startMonth }), [period, todayKey, model, fin.invoices]);
  const bySector = sectorsFor({ figures, lines: model.lines, sectors });
  const sectorMax = Math.max(1, ...bySector.map((s) => s.paid + s.toCome));
  const clients = clientRows(model.lines, figures.months);
  // A client's line: what the newest payment in the period was for, or what it was for as typed (else Paid to your
  // bank) and Added by you.
  const forWhat = (c) => {
    if (c.addedByCoach) return [c.whatFor || 'Paid to your bank', 'Added by you'];
    const inv = (fin.invoices || []).filter((i) => (c.organisation_id ? i.organisation_id === c.organisation_id : i.profile_id === c.profile_id) && i.status === 'paid')
      .sort((a, b) => String(b.paid_at || '').localeCompare(String(a.paid_at || '')))[0];
    return [inv ? invoiceTitle(inv) : null];
  };
  // Pro bono this year: held sessions of pro bono engagements, worth the hours at your rates (the personal price per hour,
  // the middle of your packages'). Never income, never counted towards targets.
  const fy = financialYear(todayKey, model.startMonth);
  const engagements = rowsOf(fin.state, 'engagements');
  const proBonoIds = new Set(engagements.filter((e) => e.kind === 'pro_bono').map((e) => e.id));
  const proBonoProfiles = new Set(engagements.filter((e) => e.kind === 'pro_bono').map((e) => e.profile_id));
  const rates = (packages || []).filter((p) => Number(p.hours) > 0 && Number(p.personal_price_minor ?? p.org_price_minor) > 0).map((p) => Number(p.personal_price_minor ?? p.org_price_minor) / Number(p.hours)).sort((a, b) => a - b);
  const hourly = rates.length ? Math.round(rates[Math.floor(rates.length / 2)]) : 0;
  const pro = proBono({ sessions: (fin.sessions || []).filter((s) => proBonoIds.has(s.engagement_id) || (!s.engagement_id && proBonoProfiles.has(s.profile_id))), hourlyRateMinor: hourly, from: fy.start, to: todayKey });
  const fees = stripeFees(model.lines, [monthKey(todayKey)]);
  const waiting = waitingForPounds(model.lines);
  if (fin.waiting) return <FirstWait />;
  // While only Finances' first screen is here: clients' names and the sessions wait on the crosshair (rule 49).
  const partial = Boolean(fin.partial);
  return (
    <>
      <div className="fin-ctl"><SegmentedControl label="Period" options={PERIODS} value={period} onChange={setPeriod} /></div>
      <StatGroup className="cc-stats fin-stats fin-stats--4">
        <Stat label="Paid" value={poundsWords(figures.paid)} />
        <Stat label="Due" value={poundsWords(figures.due)} />
        <Stat label="Overdue" value={poundsWords(figures.overdue)} />
        <Stat label="Not invoiced yet" value={poundsWords(figures.notInvoiced)} />
      </StatGroup>

      <FinPart title="By sector" aside={shareWords(period, todayKey, model.startMonth)}>
        <div className="fin-sector-head fin-hide-phone" aria-hidden="true"><span /><span /><span>Paid</span><span>To come</span></div>
        {bySector.map((s) => (
          <div key={s.sector ?? 'none'} className="fin-sector">
            <span className="fin-sector-name">{s.sector ?? 'No sector'}</span>
            <span className="fin-track" aria-hidden="true">
              <i className="fin-track-paid" style={{ width: `${(s.paid / sectorMax) * 100}%` }} />
              {s.toCome > 0 && <i className="fin-track-come" style={{ width: `${(s.toCome / sectorMax) * 100}%` }} />}
            </span>
            <span className="fin-sector-fig" aria-label={`Paid ${poundsWords(s.paid)}, ${s.share}% of income`}>{poundsWords(s.paid)}</span>
            <span className="fin-sector-fig fin-sector-fig--come" aria-label={`To come ${poundsWords(s.toCome)}`}>{poundsWords(s.toCome)}</span>
          </div>
        ))}
      </FinPart>

      <FinPart title="By client">
        {partial && <Loading label="Loading your clients" />}
        {!partial && clients.length === 0 && <p className="cc-quiet">Nothing has come in yet in this period.</p>}
        {!partial && clients.slice(0, 30).map((c) => (
          <FigRow key={c.key} title={(c.organisation_id && names.org[c.organisation_id]) || (c.profile_id && names.person[c.profile_id]) || c.payer_name || 'Paid to your bank'} facts={forWhat(c)} value={<PoundsWithOriginal pounds={c.pounds} originals={c.originals} />} />
        ))}
        <div className="cc-add"><AddButton onClick={() => setPanel('bank')}>Add bank payment</AddButton></div>
        <div className="cc-acts"><TextLink onClick={() => setPanel('export')}>Export to a spreadsheet</TextLink></div>
      </FinPart>

      {partial ? <Loading label="Loading your pro bono hours" />
        : <FigRow title="Pro bono this year" facts={[`${hoursWords(pro.minutes)}, never counted towards targets`]} value={`Worth ${poundsWords(pro.worth)}`} />}
      {fees > 0 && <p className="cc-note">{`Stripe took ${moneyWords(fees)} in fees this month.`}</p>}
      <p className="cc-note fin-footnote">Payments in other currencies show in pounds at the rate they landed, with the amount paid underneath.</p>
      {waiting.count > 0 && <p className="cc-note">{waiting.words}</p>}
      {figures.notInPounds > 0 && <p className="cc-note">{figures.notInPounds === 1 ? 'One invoice in another currency is left out until it lands in pounds.' : `${figures.notInPounds} invoices in other currencies are left out until they land in pounds.`}</p>}

      <BankPaymentPanel open={panel === 'bank'} onClose={() => setPanel(null)} sectors={sectors} />
      <ExportPanel open={panel === 'export'} onClose={() => setPanel(null)} period={period} months={figures.months} />
    </>
  );
}

/** A pounds figure, with what was paid in another currency small and grey underneath ("$2,160"). */
function PoundsWithOriginal({ pounds, originals = {} }) {
  const other = Object.entries(originals || {}).filter(([, minor]) => minor);
  if (!other.length) return poundsWords(pounds);
  return (
    <span className="fin-fig-stack">
      <span>{poundsWords(pounds)}</span>
      {other.map(([currency, minor]) => <small key={currency} className="fin-fig-original">{moneyWords(minor, currency)}</small>)}
    </span>
  );
}

/** Add bank payment (M11 C5; the brief's "Add a payment made to your bank"): the server saves it, marked Added by you. */
function BankPaymentPanel({ open, onClose, sectors }) {
  const { userId, todayKey } = useCoachPortal();
  const toast = useToast();
  const busy = useRef(false);
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setForm({ who: null, amount: '', day: todayKey, sector: '', what: '', file: null }); setProblem(null); } }, [open, todayKey]);
  if (!form) return null;
  const add = async () => {
    const amount = poundsFromTyped(form.amount);
    if (!form.who) { setProblem({ at: 'who', words: 'Type who paid to carry on.' }); return; }
    if (amount == null) { setProblem({ at: 'amount', words: amountProblem(form.amount, '1,200') }); return; }
    if (busy.current) return;
    busy.current = true;
    try {
      let receiptPath;
      if (form.file) receiptPath = await uploadReceipt(userId, form.file);
      const answer = await coachBilling(userId, { kind: 'bank_payment', amount, arrivedOn: form.day,
        ...(form.who.kind === 'org' ? { organisationId: form.who.id } : form.who.kind === 'person' ? { profileId: form.who.id } : { payerName: form.who.name }),
        sector: form.sector || form.who.sector || undefined, whatFor: form.what.trim() || undefined, receiptPath });
      if (!answer.ok) { setProblem(answer.message); return; }
      toast.saved({ message: monthKey(form.day) === monthKey(todayKey) ? 'Payment added. It counts towards this month.' : `Payment added. It counts towards ${monthName(form.day)}.` });
      onClose();
    } catch (error) {
      setProblem(error?.message || 'That didn’t save. Check your connection and try again.');
    } finally { busy.current = false; }
  };
  const at = (key) => (problem && typeof problem === 'object' && problem.at === key ? <p className="cc-problem" role="alert">{problem.words}</p> : null);
  return (
    <SlidePanel open={open} onClose={onClose} title="Add bank payment" draftKey="fin-bank-payment"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={add}>Add payment</Button></div>}>
      <div className="cc-field"><WhoPicker label="Who paid?" value={form.who} anyName onChange={(who) => { setForm((f) => ({ ...f, who })); setProblem(null); }} />{at('who')}</div>
      <div className="cc-field cc-two">
        <TextField label="Amount" inputMode="decimal" value={form.amount} placeholder="£" autoComplete="off" onChange={(e) => { setForm({ ...form, amount: e.target.value }); setProblem(null); }} />
        <DatePicker label="When did it arrive?" value={form.day} min="2000-01-01" max={todayKey} onChange={(day) => setForm({ ...form, day })} />
      </div>
      {at('amount')}
      <div className="cc-field"><Dropdown label="Which sector?" options={sectors.map((s) => ({ value: s, label: s }))} value={form.sector || form.who?.sector || sectors[0]} onChange={(v) => setForm({ ...form, sector: v })} /></div>
      <div className="cc-field"><TextField label="What was it for?" value={form.what} maxLength={200} placeholder="Such as an invoice number" autoComplete="off" onChange={(e) => setForm({ ...form, what: e.target.value })} /></div>
      <ReceiptField file={form.file} onChange={(file) => setForm((f) => ({ ...f, file }))} />
      {typeof problem === 'string' && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** Export to a spreadsheet (M11 C5, with its leftover put right): this period's payments and refunds, Excel or CSV. */
function ExportPanel({ open, onClose, period, months }) {
  const fin = useFinance();
  const { model, todayKey, names, clients, organisations } = fin;
  const toast = useToast();
  const [what, setWhat] = useState(period);
  const [format, setFormat] = useState('xlsx');
  useEffect(() => { if (open) setWhat(period); }, [open, period]);
  const go = () => {
    const ms = what === period ? months : moneyFigures({ period: what, today: todayKey, lines: [], startMonth: model.startMonth }).months;
    const label = financialYear(`${ms[0]}-01`, model.startMonth).label;
    const people = Object.fromEntries(Object.entries(names.person).map(([id, name]) => [id, { name, country: (clients || []).find((c) => c.id === id)?.country || '' }]));
    const orgs = Object.fromEntries((organisations || []).map((o) => [o.id, { name: o.name, country: o.country || '' }]));
    const exp = yearExport({ yearLabel: label, startMonth: model.startMonth, today: todayKey, lines: model.lines, invoices: fin.invoices || [], people, organisations: orgs });
    const rows = exp.rows.filter((r) => (r[1] === 'Payment' || r[1] === 'Refund') && ms.includes(monthKey(r[0])));
    const name = `payments-${PERIODS.find((p) => p.value === what).label.toLowerCase().replace(/\s+/g, '-')}-${todayKey}`;
    if (format === 'csv') download(`${name}.csv`, `﻿${toCsv([[...EXPORT_COLUMNS], ...rows])}`, 'text/csv;charset=utf-8');
    else download(`${name}.xlsx`, xlsxBytes([[...EXPORT_COLUMNS], ...rows], 'Payments'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast.show('Downloading the spreadsheet.');
    onClose();
  };
  const count = (p) => {
    const ms = moneyFigures({ period: p, today: todayKey, lines: [], startMonth: model.startMonth }).months;
    return model.lines.filter((l) => ms.includes(l.month)).length;
  };
  const options = PERIODS.map((p) => ({ value: p.value, label: `${p.label}’s payments, ${count(p.value)}` }));
  return (
    <SlidePanel open={open} onClose={onClose} title="Export to a spreadsheet" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={go}>Download</Button></div>}>
      <div className="cc-field"><Dropdown label="What to export" options={options} value={what} onChange={setWhat} /></div>
      <div className="cc-field"><InlineChoice label="Format" options={[{ value: 'xlsx', label: 'Excel' }, { value: 'csv', label: 'CSV' }]} value={format} onChange={setFormat} semantics="radio" /></div>
      <p className="cc-note">Every payment and refund, with the currency, the rate it landed at and where each client lives.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Cash flow (M11 C6)

const HORIZON_OPTIONS = [{ value: '3', label: '3 months' }, { value: '6', label: '6 months' }, { value: '12', label: '12 months' }];
const EVERY_OPTIONS = [{ value: 'month', label: 'Each month' }, { value: 'quarter', label: 'Each quarter' }, { value: 'year', label: 'Each year' }];

function CashFlow() {
  const [likely, setLikely] = useState(false);
  // Likely deals come from the leads, which aren't here while only Finances' first screen is (rule 49).
  const { partial } = useCoachPortal();
  const fin = useFinance({ includeLikely: likely && !partial });
  const { model, todayKey, userId, settings, outgoings, outgoingGroups } = fin;
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState(() => (params.get('bank') === '1' ? { kind: 'bank' } : null));
  useEffect(() => { if (params.get('bank')) setParams({}, { replace: true }); }, [params, setParams]);
  const cash = model.cash;
  // Each associate at their 3-month average, from the same read of their sessions as the forecast (useFinance).
  const monthly = (model.associates || []).map((a) => ({ name: a.name, monthlyMinor: threeMonthAverage({ coachId: a.coach_id, rateMinor: a.hourly_rate_minor, sessions: associateSessionsForForecast(fin.associateSessions, Date.now()), month: monthKey(todayKey), noShowsPaid: settings.no_shows_paid, monthMinutes: model.monthMinutes }) }));
  const list = outgoingRows({ outgoings, today: todayKey, associates: monthly });
  const fy = financialYear(todayKey, model.startMonth);
  const oneOffs = (outgoings || []).filter((o) => o.every === 'once' && o.starts_on >= fy.start).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const toast = useToast();
  // Only how far ahead, onto the settings as they are now; refused (and said) when another device changed them since.
  const setMonths = (v) => saveChange(userId, 'finance_settings', { coach_id: settings.coach_id }, { cash_months: Number(v) })
    .then((status) => { if (status === 'superseded') toast.error(SUPERSEDED_MESSAGE); }).catch(() => {});
  const groups = (outgoingGroups || []).length ? outgoingGroups.map((g) => g.name) : [...OUTGOING_GROUPS];
  const keepWords = settings.keep_above_minor == null ? 'About 2 months of outgoings' : 'The level you set';
  if (fin.waiting) return <FirstWait />;
  return (
    <>
      <StatGroup className="cc-stats fin-stats fin-stats--4">
        <Stat label="Cash now" value={poundsWords(cash.cashNow)} />
        <Stat label={cash.endLabel} value={poundsWords(cash.end)} />
        <Stat label="Going out each month" value={poundsWords(cash.goingOut)} />
        <Stat label="Lowest point" value={poundsWords(cash.lowest.cash)} unit={cash.lowest.words} />
      </StatGroup>

      <FinPart title="Cash at the end of each month">
        <div className="fin-ctl">
          <SegmentedControl label="How far ahead" options={HORIZON_OPTIONS} value={String(fin.months)} onChange={setMonths} />
          <TextLink aria-pressed={likely} onClick={() => setLikely((v) => !v)}>{likely ? 'Leave out likely deals' : 'Include likely deals'}</TextLink>
        </div>
        <CashChart cash={cash} />
        <div className="fin-table" role="table" aria-label="Cash at the end of each month">
          <div className="fin-trow fin-trow--head" role="row"><span role="columnheader"><span className="fin-sr">Month</span></span><span role="columnheader">In</span><span role="columnheader">Out</span><span role="columnheader">Cash</span></div>
          {cash.rows.map((r) => (
            <div key={r.month} className="fin-trow" role="row">
              <span role="rowheader"><b>{r.label}</b>{r.belowWords && <small>{r.belowWords}</small>}</span>
              <span role="cell">{poundsWords(r.in)}</span>
              <span role="cell" className="fin-quiet-fig">{poundsWords(r.out)}</span>
              <span role="cell">{poundsWords(r.cash)}</span>
            </div>
          ))}
        </div>
        {cash.notInPounds > 0 && <p className="cc-note">Money in other currencies is left out until it lands in pounds.</p>}
      </FinPart>

      <FinPart title="Recurring outgoings" aside={monthlyWords(list.total)}>
        {list.rows.map((r) => <FigRow key={r.group} title={r.group} facts={[r.names]} value={monthlyWords(r.monthly)} onClick={() => setPanel({ kind: 'group', group: r.group })} label={`${r.group}, ${monthlyWords(r.monthly)}`} />)}
        <div className="cc-add"><AddButton onClick={() => setPanel({ kind: 'outgoing' })}>Add recurring outgoing</AddButton></div>
      </FinPart>

      <FinPart title="One-off costs">
        {oneOffs.map((o) => <FigRow key={o.id} title={o.name} facts={[dayWordsFrom(o.starts_on, todayKey), o.group_name]} value={poundsWords(o.amount_minor)} onClick={() => setPanel({ kind: 'oneoff', id: o.id })} label={`Edit ${o.name}`} />)}
        <div className="cc-add"><AddButton onClick={() => setPanel({ kind: 'oneoff' })}>Add one-off cost</AddButton></div>
      </FinPart>

      <FinPart title="Settings">
        <FigRow title="Tax pot" facts={['Set aside so far, paid out on each tax date']} value={poundsWords(cash.taxPotNow || 0)} onClick={() => setPanel({ kind: 'settings' })} />
        <FigRow title="Your bank balance" facts={[settings.bank_checked_at ? `Checked ${dayWordsFrom(String(settings.bank_checked_at).slice(0, 10), todayKey)}` : 'Not checked yet']} value={settings.bank_balance_minor == null ? '' : poundsWords(settings.bank_balance_minor)} onClick={() => setPanel({ kind: 'bank' })} />
        <FigRow title="Set aside for tax" facts={['Of profit, each month']} value={`${Number(settings.tax_share_percent)}%`} onClick={() => setPanel({ kind: 'settings' })} />
        <FigRow title="Keep cash above" facts={[keepWords]} value={poundsWords(cash.keepAbove)} onClick={() => setPanel({ kind: 'settings' })} />
      </FinPart>

      <GroupPanel panel={panel?.kind === 'group' ? panel : null} rows={list.rows} onClose={() => setPanel(null)} onOpen={(id) => setPanel({ kind: 'outgoing', id, back: panel })} onAdd={() => setPanel({ kind: 'outgoing', group: panel.group })} />
      <OutgoingPanel panel={panel?.kind === 'outgoing' || panel?.kind === 'oneoff' ? panel : null} groups={groups} onClose={() => setPanel(null)} />
      <BankBalancePanel open={panel?.kind === 'bank'} onClose={() => setPanel(null)} />
      <CashSettingsPanel open={panel?.kind === 'settings'} onClose={() => setPanel(null)} keepAbove={cash.keepAbove} />
    </>
  );
}

/** A group of outgoings (M11's "Software" panel): each with its monthly average, then Add recurring outgoing and Done. */
function GroupPanel({ panel, rows, onClose, onOpen, onAdd }) {
  const { outgoings, todayKey } = useCoachPortal();
  if (!panel) return null;
  const row = rows.find((r) => r.group === panel.group);
  const mine = (outgoings || []).filter((o) => o.every !== 'once' && (o.group_name || 'Other') === panel.group && (!o.ends_on || o.ends_on >= todayKey));
  return (
    <SlidePanel open onClose={onClose} title={panel.group} footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={onClose}>Done</Button></div>}>
      {(row?.items || []).map((it) => {
        const o = mine.find((x) => x.name === it.name);
        return <FigRow key={it.name} title={it.name} value={monthlyWords(it.monthly)} onClick={o ? () => onOpen(o.id) : undefined} label={o ? `Edit ${it.name}` : undefined} />;
      })}
      <div className="cc-add"><AddButton onClick={onAdd}>Add recurring outgoing</AddButton></div>
    </SlidePanel>
  );
}

/** Add recurring outgoing and Add one-off cost (M11 C6), and editing either. */
function OutgoingPanel({ panel, groups, onClose }) {
  const { userId, coach, outgoings, todayKey } = useCoachPortal();
  const done = useDone();
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  const once = panel?.kind === 'oneoff';
  const before = panel?.id ? (outgoings || []).find((o) => o.id === panel.id) : null;
  useEffect(() => {
    if (!panel) { setForm(null); return; }
    const firstOfNext = `${addMonths(monthKey(todayKey), 1)}-01`;
    setForm(before ? { name: before.name, amount: typedPounds(before.amount_minor), every: before.every, group: before.group_name, day: before.starts_on, file: null }
      : { name: '', amount: '', every: 'month', group: panel.group || (once ? 'Training and supervision' : 'Software'), day: once ? todayKey : firstOfNext, file: null });
    setProblem(null);
  }, [panel?.kind, panel?.id]);
  if (!panel || !form) return null;
  const save = async () => {
    const amount = poundsFromTyped(form.amount);
    if (!form.name.trim()) { setProblem('Type what it is to carry on.'); return; }
    if (amount == null) { setProblem(amountProblem(form.amount, '95')); return; }
    let receipt = before?.receipt_path || null;
    if (form.file) {
      try { receipt = await uploadReceipt(userId, form.file); } catch (error) { setProblem(error.message); return; }
    }
    const row = { ...(before || {}), id: before?.id || newId(), coach_id: coach.id, name: form.name.trim().slice(0, 120), group_name: form.group, amount_minor: amount, currency: 'GBP',
      every: once ? 'once' : form.every, starts_on: form.day, ends_on: before?.ends_on ?? null, receipt_path: receipt };
    const ok = await done(() => saveRow(userId, 'finance_outgoings', row), 'Saved.', () => (before ? saveRow(userId, 'finance_outgoings', before) : removeRow(userId, 'finance_outgoings', row.id)));
    if (ok) onClose();
  };
  const remove = async () => {
    const ok = await done(async () => { await removeRow(userId, 'finance_outgoings', before.id); return 'saved'; }, 'Deleted', () => saveRow(userId, 'finance_outgoings', before));
    if (ok) onClose();
  };
  const title = once ? (before ? 'Edit one-off cost' : 'Add one-off cost') : (before ? 'Edit recurring outgoing' : 'Add recurring outgoing');
  return (
    <SlidePanel open onClose={onClose} title={title} draftKey={`fin-outgoing:${before?.id || (once ? 'new-once' : 'new')}`}
      footer={<div className="cc-panel-foot">{before ? <TextLink onClick={remove}>Delete</TextLink> : <TextLink onClick={onClose}>Cancel</TextLink>}<Button variant="primary" onClick={save}>{before ? 'Save my edit' : once ? 'Add cost' : 'Add outgoing'}</Button></div>}>
      <div className="cc-field"><TextField label="What is it?" value={form.name} maxLength={120} placeholder={once ? 'Such as a conference ticket' : 'Such as Zoom'} autoComplete="off" onChange={(e) => { setForm({ ...form, name: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field cc-two">
        <TextField label="Amount" inputMode="decimal" value={form.amount} placeholder="£" autoComplete="off" onChange={(e) => { setForm({ ...form, amount: e.target.value }); setProblem(null); }} />
        {once ? <DatePicker label="When?" value={form.day} min="2000-01-01" onChange={(day) => setForm({ ...form, day })} />
          : <Dropdown label="How often?" options={EVERY_OPTIONS} value={form.every} onChange={(v) => setForm({ ...form, every: v })} />}
      </div>
      <div className="cc-field"><Dropdown label="Which group?" options={groups.map((g) => ({ value: g, label: g }))} value={form.group} onChange={(v) => setForm({ ...form, group: v })} /></div>
      {!once && <div className="cc-field"><DatePicker label="From when?" value={form.day} min="2000-01-01" onChange={(day) => setForm({ ...form, day })} /></div>}
      {once && <ReceiptField file={form.file} onChange={(file) => setForm((f) => ({ ...f, file }))} />}
      {once && !form.file && before?.receipt_path && <p className="cc-note">A receipt is attached.</p>}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** Your bank balance (M11 C6): what's in the business account today, kept with when it was checked. */
function BankBalancePanel({ open, onClose }) {
  const { userId, coach, financeSettings, todayKey } = useCoachPortal();
  const done = useDone();
  const settings = settingsOf(financeSettings, coach.id);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState(null);
  const basedOn = useRef(null); // the settings' version as the panel opened
  useEffect(() => { if (open) { setTyped(typedPounds(settings.bank_balance_minor)); setProblem(null); basedOn.current = financeSettings?.updated_at ?? null; } }, [open]);
  const save = async () => {
    const t = String(typed).trim();
    const minus = t.startsWith('-') || t.startsWith('−');
    const minor = poundsFromTyped(t.replace(/^[-−]/, ''), { allowZero: true });
    if (minor == null) { setProblem(amountProblem(t.replace(/^[-−]/, ''), '4,200', { allowZero: true }) === TOO_MUCH ? TOO_MUCH : 'Type the balance as an amount, such as 4,200.'); return; }
    const balance = minus ? -minor : minor;
    const check = { id: newId(), coach_id: coach.id, balance_minor: balance, checked_on: todayKey };
    // Only the balance and when it was checked, onto the settings as they are now; nothing if they changed elsewhere since.
    const key = { coach_id: coach.id };
    const change = { bank_balance_minor: balance, bank_checked_at: new Date().toISOString() };
    const was = settingsOf(rowNow(userId, 'finance_settings', key), coach.id);
    const ok = await done(async () => {
      const status = await saveChange(userId, 'finance_settings', key, change, { basedOn: basedOn.current });
      if (status === 'superseded') return status;
      await saveRow(userId, 'bank_balance_checks', check);
      return status;
    }, 'Saved.', async () => { await saveChange(userId, 'finance_settings', key, undoOf(change, was)); await removeRow(userId, 'bank_balance_checks', check.id); });
    if (ok) onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Your bank balance" draftKey="fin-bank-balance"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><TextField label="What’s in your business account today?" inputMode="decimal" value={typed} placeholder="£" autoComplete="off" onChange={(e) => { setTyped(e.target.value); setProblem(null); }} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** Cash flow settings (M11 C6): the share of profit to set aside for tax, and the level to keep cash above. */
function CashSettingsPanel({ open, onClose, keepAbove }) {
  const { coach, financeSettings } = useCoachPortal();
  const saveSettings = useSaveSettings();
  const settings = settingsOf(financeSettings, coach.id);
  const [form, setForm] = useState({ tax: '', keep: '', start: { tax: '', keep: '' } });
  const [problem, setProblem] = useState(null);
  const basedOn = useRef(null); // the settings' version as the panel opened
  useEffect(() => {
    if (!open) return;
    basedOn.current = financeSettings?.updated_at ?? null;
    // "Keep cash above" shows only a level Tim set; empty is the default (about 2 months of outgoings).
    const start = { tax: String(Number(settings.tax_share_percent)), keep: typedPounds(settings.keep_above_minor) };
    setForm({ ...start, start });
    setProblem(null);
  }, [open]);
  const save = async () => {
    // Only what was changed here is saved: saving one never fixes the other.
    const { change, problem: why } = cashSettingsChange({ start: form.start, tax: form.tax, keep: form.keep });
    if (why) { setProblem(why); return; }
    if (!change) { onClose(); return; }
    if (await saveSettings(change, 'Saved.', { basedOn: basedOn.current })) onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Cash flow settings" draftKey="fin-cash-settings"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><TextField label="Share of profit to set aside for tax" inputMode="decimal" value={form.tax} placeholder="%" autoComplete="off" onChange={(e) => { setForm({ ...form, tax: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field"><TextField label="Keep cash above" inputMode="decimal" value={form.keep} placeholder={poundsWords(keepAbove)} autoComplete="off" onChange={(e) => { setForm({ ...form, keep: e.target.value }); setProblem(null); }} /></div>
      <p className="cc-note">Leave it empty to keep about 2 months of outgoings.</p>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}
