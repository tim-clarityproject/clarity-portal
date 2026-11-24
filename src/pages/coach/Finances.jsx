import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AddButton, Button, DatePicker, Dropdown, ExplainLink, PageHeader, SegmentedControl, SlidePanel, Stat, StatGroup, TextField, useIsPhone, useToast,
} from '../../components/design';
import { newId, removeRow, rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { dayKeyWords } from '../../lib/time/index.js';
import { moneyWords, rateWords } from '../../lib/billing/money';
import {
  addMonths, clientRows, copyToNewYear, financialYear, incomeChart, expectedIncome, monthKey, monthName, moneyFigures, ofWords, OUTGOING_GROUPS, poundsWords,
  proBono, sameEveryMonth, sameEveryMonthSums, sectorsFor, shareWords, stripeFees, targetRows, targetsByMonth, outgoingRows, threeMonthAverage, yearExport,
  EXPORT_COLUMNS, yearStartWords, hoursWords, bankCheckDue,
} from '../../lib/finance/index.js';
import { toCsv } from '../../lib/finance/csv.js';
import { xlsxBytes } from '../../lib/coach/xlsx';
import {
  associateSessionsForForecast, dayWordsFrom, invoiceTitle, needsYouRows, percentFromTyped, pipelineLine, poundsFromTyped, renewalsSoon, typedPounds,
} from '../../lib/coach/financeData';
import { coachBilling, uploadReceipt } from '../../lib/coach/financeActions';
import { keptAssociateSessions } from '../../lib/coach/associateSessions';
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

const CHART_HELP = {
  month: {
    title: 'How to read the chart',
    terms: [
      { term: 'Dashed line over each bar', meaning: 'That month’s own target.' },
      { term: 'Mint bar', meaning: 'The month reached its target.' },
      { term: 'Grey bar', meaning: ['Below the target.', 'An outline means below your minimum.'] },
      { term: 'Dashed outline', meaning: 'Projected income, from signed agreements, repeating income and drafted invoices.' },
      { term: 'Dotted line', meaning: 'Your minimum each month.' },
    ],
  },
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
  const rows = useMemo(() => targetRows({ today: todayKey, lines: model.lines, targets: financeTargets, minimumMinor: Number(settings.minimum_minor) || 0, startMonth: model.startMonth }), [model, financeTargets, settings.minimum_minor, todayKey]);
  const fy = financialYear(todayKey, model.startMonth);
  const expected = useMemo(() => expectedIncome({ today: todayKey, untilMonth: fy.months[11], invoices: fin.invoices || [], versions: model.versions, repeating: model.repeating }), [todayKey, fy.months, fin.invoices, model]);
  const chart = useMemo(() => incomeChart({ today: todayKey, lines: model.lines, expected, targets: financeTargets, minimumMinor: Number(settings.minimum_minor) || 0,
    sector: sector === 'all' ? null : sector, mode, showProjected, startMonth: model.startMonth }), [todayKey, model, expected, financeTargets, settings.minimum_minor, sector, mode, showProjected]);
  const yearHasTargets = (financeTargets || []).some((t) => fy.months.includes(monthKey(t.month)));
  const associatesToPay = (model.associates || []).map((a) => ({ coach_id: a.coach_id, first: String(a.name || 'your associate').split(/\s+/)[0] }));
  const needs = needsYouRows({ cash: model.cash6, invoices: fin.invoices || [], deadlines: fin.deadlines || [], today: todayKey, names, targetsToCheck: false, associatesToPay });
  if (!yearHasTargets && (financeTargets || []).length) needs.push({ key: 'targets', title: 'This year’s targets aren’t set yet.', small: 'Last year’s are ready to copy and check.', link: 'Check the targets', open: 'targets' });
  if (bankCheckDue({ settings, today: todayKey })) needs.push({ key: 'bank', title: `Check your bank balance for ${monthName(todayKey)}.`, link: 'Check the balance', to: '/coach/finances/cash-flow?bank=1' });
  const pipe = pipelineLine(leads, leadStages);
  const renew = renewalsSoon({ engagements: rowsOf(fin.state, 'engagements'), admin: fin.admin, versions: fin.agreementVersions, today: todayKey });
  const repeatingMonthly = model.repeating.reduce((a, r) => a + r.amount_minor, 0);
  const sectorOptions = [{ value: 'all', label: 'All income' }, ...sectors.map((s) => ({ value: s, label: s }))];
  const month = rows.month;
  const year = rows.year;
  return (
    <>
      <StatGroup className="cc-stats fin-stats fin-stats--3">
        <Stat label={`Income in ${monthName(todayKey)} so far`} value={poundsWords(month.paid)} unit={ofWords(month.paid, month.target) || undefined} bar={month.target ? Math.min(1, month.paid / month.target) : undefined} />
        <Stat label="Income this year" value={poundsWords(year.paid)} unit={ofWords(year.paid, year.target) || undefined} bar={year.target ? Math.min(1, year.paid / year.target) : undefined} />
        <Stat label="Cash in 6 months" value={poundsWords(model.cash6.end)} />
      </StatGroup>

      <FinPart title={chart.title} asideHide={false} aside={<ExplainLink explain={CHART_HELP[mode === 'running' ? 'running' : 'month']} helpKey={mode === 'running' ? 'finance-chart-total' : 'finance-chart'}>How to read the chart</ExplainLink>}>
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

      {needs.length > 0 && (
        <FinPart title="Needs you">
          {needs.map((n) => (
            <Line key={n.key} title={n.title} small={n.small}>
              <TextLink aria-label={`${n.link}: ${n.title}`} onClick={() => (n.invoiceId ? setPanel({ kind: 'overdue', id: n.invoiceId }) : n.open ? setPanel({ kind: n.open }) : navigate(n.to))}>{n.link}</TextLink>
            </Line>
          ))}
        </FinPart>
      )}

      <FinPart title="Coming in">
        <FigRow title="Pipeline" facts={pipe.facts} value={pipe.figure} onClick={() => navigate('/coach/leads/reports')} label={`Pipeline, ${pipe.figure}. Open lead reports`} />
        <FigRow title="Renewals in the next 90 days" facts={renew.facts} value={renew.figure} onClick={() => navigate('/coach/clients/renewals')} label={`Renewals in the next 90 days${renew.figure ? `, ${renew.figure}` : ''}. Open renewals`} />
        <FigRow title="Repeating income" facts={['Portal seats and memberships']} value={repeatingMonthly ? rateWords(repeatingMonthly, 'month') : '£0/month'} />
      </FinPart>

      {isPhone && <div className="fin-foot-btn"><Button variant="primary" onClick={() => setPanel({ kind: 'new' })}>New invoice</Button></div>}

      <TargetsPanel open={panel?.kind === 'targets'} onClose={() => setPanel(null)} />
      {panel && panel.kind !== 'targets' && <InvoicePanels panel={panel} onClose={() => setPanel(null)} />}
    </>
  );
}

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
    const each = Object.fromEntries(fy.months.map((m) => [m, typedPounds(have[m] || copied[m] || '')]));
    setForm({ mode: settings.targets_mode === 'same' ? 'same' : 'each', each, same: typedPounds(have[fy.months[0]] || copied[fy.months[0]] || ''), minimum: typedPounds(settings.minimum_minor) });
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
    let rows;
    if (form.mode === 'same') {
      if (sameMinor == null) { setProblem('Type each month’s target as an amount, such as 5,000.'); return; }
      rows = sameEveryMonth({ yearLabel: fy.label, monthly: sameMinor, startMonth: Number(settings.year_start_month) || 5 });
    } else {
      const bad = fy.months.find((m) => read(form.each[m]) == null);
      if (bad) { setProblem(`Type ${monthName(bad)}’s target as an amount, such as 5,000.`); return; }
      rows = fy.months.map((m) => ({ month: `${m}-01`, target_minor: read(form.each[m]) }));
    }
    const before = (financeTargets || []).filter((t) => fy.months.includes(monthKey(t.month)));
    const beforeSettings = settings;
    const pairs = [['finance_settings', { ...settings, minimum_minor: minimum, targets_mode: form.mode }],
      ...rows.map((r) => ['finance_targets', { ...(before.find((b) => monthKey(b.month) === monthKey(r.month)) || {}), coach_id: coach.id, month: r.month, target_minor: r.target_minor }])];
    done(() => saveRows(userId, pairs), 'Saved.', () => saveRows(userId, [['finance_settings', beforeSettings], ...before.map((b) => ['finance_targets', b])])).then((ok) => { if (ok) onClose(); });
  };
  const box = (label, value, onChange) => <TextField label={label} inputMode="decimal" value={value} placeholder="£" autoComplete="off" onChange={(e) => { onChange(e.target.value); setProblem(null); }} />;
  return (
    <SlidePanel open={open} onClose={onClose} title="Edit targets" draftKey="fin-targets"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><SegmentedControl label="Each month’s target" options={[{ value: 'each', label: 'Set each month' }, { value: 'same', label: 'Same every month' }]} value={form.mode} onChange={(v) => setForm({ ...form, mode: v })} /></div>
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
  // A client's line: what the newest payment in the period was for, or Paid to your bank and Added by you.
  const forWhat = (c) => {
    if (c.addedByCoach) return ['Paid to your bank', 'Added by you'];
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
        {clients.length === 0 && <p className="cc-quiet">Nothing has come in yet in this period.</p>}
        {clients.slice(0, 30).map((c) => (
          <FigRow key={c.key} title={(c.organisation_id && names.org[c.organisation_id]) || (c.profile_id && names.person[c.profile_id]) || 'Paid to your bank'} facts={forWhat(c)} value={poundsWords(c.pounds)} />
        ))}
        <div className="cc-add"><AddButton onClick={() => setPanel('bank')}>Add bank payment</AddButton></div>
        <div className="cc-acts"><TextLink onClick={() => setPanel('export')}>Export to a spreadsheet</TextLink></div>
      </FinPart>

      <FigRow title="Pro bono this year" facts={[`${hoursWords(pro.minutes)}, never counted towards targets`]} value={`Worth ${poundsWords(pro.worth)}`} />
      {fees > 0 && <p className="cc-note">{`Stripe took ${moneyWords(fees)} in fees this month.`}</p>}
      <p className="cc-note fin-footnote">Payments in other currencies show in pounds at the rate they landed.</p>
      {figures.notInPounds > 0 && <p className="cc-note">{figures.notInPounds === 1 ? 'One invoice in another currency is left out until it lands in pounds.' : `${figures.notInPounds} invoices in other currencies are left out until they land in pounds.`}</p>}

      <BankPaymentPanel open={panel === 'bank'} onClose={() => setPanel(null)} sectors={sectors} />
      <ExportPanel open={panel === 'export'} onClose={() => setPanel(null)} period={period} months={figures.months} />
    </>
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
    if (amount == null) { setProblem({ at: 'amount', words: 'Type an amount, such as 1,200.' }); return; }
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
      <div className="cc-field"><SegmentedControl label="Format" options={[{ value: 'xlsx', label: 'Excel' }, { value: 'csv', label: 'CSV' }]} value={format} onChange={setFormat} /></div>
      <p className="cc-note">Every payment and refund, with the currency, the rate it landed at and where each client lives.</p>
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Cash flow (M11 C6)

const HORIZON_OPTIONS = [{ value: '3', label: '3 months' }, { value: '6', label: '6 months' }, { value: '12', label: '12 months' }];
const EVERY_OPTIONS = [{ value: 'month', label: 'Each month' }, { value: 'quarter', label: 'Each quarter' }, { value: 'year', label: 'Each year' }];

function CashFlow() {
  const [likely, setLikely] = useState(false);
  const fin = useFinance({ includeLikely: likely });
  const { model, todayKey, userId, settings, outgoings, outgoingGroups } = fin;
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState(() => (params.get('bank') === '1' ? { kind: 'bank' } : null));
  useEffect(() => { if (params.get('bank')) setParams({}, { replace: true }); }, [params, setParams]);
  const cash = model.cash;
  const monthly = (model.associates || []).map((a) => ({ name: a.name, monthlyMinor: threeMonthAverage({ coachId: a.coach_id, rateMinor: a.hourly_rate_minor, sessions: associateSessionsForForecast(keptAssociateSessions(userId), Date.now()), month: monthKey(todayKey) }) }));
  const list = outgoingRows({ outgoings, today: todayKey, associates: monthly });
  const fy = financialYear(todayKey, model.startMonth);
  const oneOffs = (outgoings || []).filter((o) => o.every === 'once' && o.starts_on >= fy.start).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const setMonths = (v) => saveRow(userId, 'finance_settings', { ...settings, cash_months: Number(v) }).catch(() => {});
  const groups = (outgoingGroups || []).length ? outgoingGroups.map((g) => g.name) : [...OUTGOING_GROUPS];
  const keepWords = settings.keep_above_minor == null ? 'About 2 months of outgoings' : 'The level you set';
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

      <FinPart title="Recurring outgoings" aside={rateWords(list.total, 'month')}>
        {list.rows.map((r) => <FigRow key={r.group} title={r.group} facts={[r.names]} value={rateWords(r.monthly, 'month')} onClick={() => setPanel({ kind: 'group', group: r.group })} label={`${r.group}, ${rateWords(r.monthly, 'month')}`} />)}
        <div className="cc-add"><AddButton onClick={() => setPanel({ kind: 'outgoing' })}>Add recurring outgoing</AddButton></div>
      </FinPart>

      <FinPart title="One-off costs">
        {oneOffs.map((o) => <FigRow key={o.id} title={o.name} facts={[dayWordsFrom(o.starts_on, todayKey), o.group_name]} value={poundsWords(o.amount_minor)} onClick={() => setPanel({ kind: 'oneoff', id: o.id })} label={`Edit ${o.name}`} />)}
        <div className="cc-add"><AddButton onClick={() => setPanel({ kind: 'oneoff' })}>Add one-off cost</AddButton></div>
      </FinPart>

      <FinPart title="Settings">
        <FigRow title="Tax pot" facts={['Set aside so far, paid out on each tax date']} value={poundsWords(cash.rows[0]?.taxPot || 0)} onClick={() => setPanel({ kind: 'settings' })} />
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
        return <FigRow key={it.name} title={it.name} value={rateWords(it.monthly, 'month')} onClick={o ? () => onOpen(o.id) : undefined} label={o ? `Edit ${it.name}` : undefined} />;
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
    if (amount == null) { setProblem('Type an amount, such as 95.'); return; }
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
  useEffect(() => { if (open) { setTyped(typedPounds(settings.bank_balance_minor)); setProblem(null); } }, [open]);
  const save = async () => {
    const t = String(typed).trim();
    const minus = t.startsWith('-') || t.startsWith('−');
    const minor = poundsFromTyped(t.replace(/^[-−]/, ''), { allowZero: true });
    if (minor == null) { setProblem('Type the balance as an amount, such as 4,200.'); return; }
    const balance = minus ? -minor : minor;
    const check = { id: newId(), coach_id: coach.id, balance_minor: balance, checked_on: todayKey };
    const ok = await done(() => saveRows(userId, [['finance_settings', { ...settings, bank_balance_minor: balance, bank_checked_at: new Date().toISOString() }], ['bank_balance_checks', check]]), 'Saved.',
      async () => { await saveRow(userId, 'finance_settings', settings); await removeRow(userId, 'bank_balance_checks', check.id); });
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
  const [form, setForm] = useState({ tax: '', keep: '' });
  const [problem, setProblem] = useState(null);
  useEffect(() => { if (open) { setForm({ tax: String(Number(settings.tax_share_percent)), keep: typedPounds(settings.keep_above_minor ?? keepAbove) }); setProblem(null); } }, [open]);
  const save = async () => {
    const tax = percentFromTyped(form.tax);
    const keep = poundsFromTyped(form.keep, { allowZero: true });
    if (tax == null) { setProblem('Type a share from 0% to 100%.'); return; }
    if (keep == null) { setProblem('Type an amount, such as 3,600.'); return; }
    if (await saveSettings({ tax_share_percent: tax, keep_above_minor: keep })) onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Cash flow settings" draftKey="fin-cash-settings"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field"><TextField label="Share of profit to set aside for tax" inputMode="decimal" value={form.tax} placeholder="%" autoComplete="off" onChange={(e) => { setForm({ ...form, tax: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field"><TextField label="Keep cash above" inputMode="decimal" value={form.keep} placeholder="£" autoComplete="off" onChange={(e) => { setForm({ ...form, keep: e.target.value }); setProblem(null); }} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}
