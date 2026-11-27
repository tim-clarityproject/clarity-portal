import { useEffect, useMemo, useState } from 'react';
import {
  AddButton, AddLink, Button, Chip, ChipRow, DatePicker, Dropdown, ExplainLink, FilterButton, InlineChoice, SearchField, SlidePanel, Stat, StatGroup, TextField, useToast,
} from '../../components/design';
import { newId, removeRow, saveRow, saveRows } from '../../lib/coach/store';
import { dayKeyWords } from '../../lib/time/index.js';
import {
  addMonths, checkDiscount, EXPORT_COLUMNS, financialYear, monthKey, perHourWords, updateAllPrices, ukTaxableIncome, yearExport, yearExportSheets, yearStarting,
} from '../../lib/finance/index.js';
import { toCsv } from '../../lib/finance/csv.js';
import { xlsxBytes } from '../../lib/coach/xlsx';
import {
  coachIdOf, coachNameOf, dayWordsFrom, discountFor, discountWords, EVERY_WORDS, invoiceGroups, nextDeadlines, packageDetail, percentFromTyped, poundsFromTyped, priceWords, pricingSections, typedPounds,
} from '../../lib/coach/financeData';
import { TextLink, useCoachPortal } from './parts';
import { download, FigRow, FinPart, InvoicePanels, useDone, useFinance } from './financeParts';

// Finances' Invoices, Pricing and Other tabs (Phase 6b run 2; M11 C7 to C9). See Finances.jsx.

// ---------------------------------------------------------------- Invoices (M11 C7)

const STATUS_OPTIONS = [{ value: '', label: 'Every status' }, { value: 'waiting', label: 'Waiting to send' }, { value: 'overdue', label: 'Overdue' }, { value: 'sent', label: 'Sent and due' }, { value: 'paid', label: 'Paid' }];
const GROUPS = [['waiting', 'Waiting to send'], ['overdue', 'Overdue'], ['sent', 'Sent and due'], ['paid', 'Paid this month']];

export function InvoicesTab() {
  const { invoices, todayKey, names, model } = useFinance();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [panel, setPanel] = useState(null);
  const groups = useMemo(() => invoiceGroups({ invoices, today: todayKey, names, q, who, status, year, startMonth: model.startMonth }), [invoices, todayKey, names, q, who, status, year, model.startMonth]);
  const whoOptions = useMemo(() => {
    const seen = new Map();
    for (const i of invoices || []) {
      const key = i.organisation_id ? `org:${i.organisation_id}` : i.profile_id ? `person:${i.profile_id}` : null;
      const name = i.organisation_id ? names.org[i.organisation_id] : names.person[i.profile_id];
      if (key && name && !seen.has(key)) seen.set(key, name);
    }
    return [{ value: '', label: 'Every client' }, ...[...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  }, [invoices, names]);
  const yearOptions = useMemo(() => {
    const now = financialYear(todayKey, model.startMonth).label;
    return [{ value: '', label: 'Every year' }, ...[now, now - 1, now - 2].map((y) => ({ value: String(y), label: yearStarting(y, model.startMonth).words }))];
  }, [todayKey, model.startMonth]);
  const applied = [whoOptions.find((o) => o.value === who && who)?.label, STATUS_OPTIONS.find((o) => o.value === status && status)?.label, yearOptions.find((o) => o.value === year && year)?.label].filter(Boolean).join(', ');
  const any = GROUPS.some(([k]) => groups[k].length);
  const open = (row, group) => {
    if (group === 'waiting') setPanel({ kind: 'draft', id: row.id });
    else if (group === 'overdue') setPanel({ kind: 'overdue', id: row.id });
    // Sent and paid: Stripe's own page for the invoice when it has one, otherwise its facts in a panel.
    else if (/^https:\/\//.test(row.invoice.hosted_url || '')) window.open(row.invoice.hosted_url, '_blank', 'noopener');
    else setPanel({ kind: 'view', id: row.id });
  };
  return (
    <>
      <div className={`fin-search${applied ? ' fin-search--applied' : ''}`}>
        <SearchField label="Search invoices" placeholder="Search invoices" value={q} onChange={setQ} />
        <FilterButton applied={applied} onClear={() => { setWho(''); setStatus(''); setYear(''); }}>
          <Dropdown label="Client" options={whoOptions} value={who} onChange={setWho} />
          <Dropdown label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          <Dropdown label="Year" options={yearOptions} value={year} onChange={setYear} />
        </FilterButton>
      </div>
      {!any && <p className="cc-quiet">{q || applied ? 'No invoices match.' : 'No invoices yet.'}</p>}
      {GROUPS.map(([key, title]) => (groups[key].length > 0 && (
        <FinPart key={key} title={key === 'paid' && (q || applied) ? 'Paid' : title}>
          {groups[key].map((r) => {
            return <FigRow key={r.id} title={r.title} facts={[r.number, r.who, r.when]} value={r.amount} onClick={() => open(r, key)} label={`${r.title}, ${r.amount}, ${r.when}`} />;
          })}
        </FinPart>
      )))}
      {panel && <InvoicePanels panel={panel} onClose={() => setPanel(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Pricing (M11 C8)

export function PricingTab() {
  const { userId, coach, packages, discounts, priceChanges, financeSectors, settings, todayKey } = useFinance();
  const done = useDone();
  const [panel, setPanel] = useState(null); // { kind: 'sweep' } | { kind: 'package', id } | { kind: 'discount', id? }
  const vatOn = settings.vat_registered === true;
  const sections = pricingSections(packages, financeSectors);
  return (
    <>
      <div className="fin-ctl"><Button variant="outline" onClick={() => setPanel({ kind: 'sweep' })}>Update all prices</Button></div>
      {sections.length === 0 && <p className="cc-quiet">No packages yet.</p>}
      {sections.map((s) => (
        <FinPart key={s.name} title={s.name} aside={vatOn ? 'Organisations + VAT, personally including VAT' : null}>
          <div className="fin-price-head fin-hide-phone" aria-hidden="true"><span /><span>Organisations</span><span>Personally</span></div>
          {s.packages.map((p) => (
            <button key={p.id} type="button" className="ds-li ds-li--go fin-row fin-price-row" onClick={() => setPanel({ kind: 'package', id: p.id })}
              aria-label={`${p.name}: organisations ${priceWords(p.org_price_minor, p.per) || 'none'}, personally ${priceWords(p.personal_price_minor, p.per) || 'none'}. Edit`}>
              <span className="ds-li-name fin-row-words">{p.name}<small className="ds-li-sub">{packageDetail(p, { vatOn })}</small></span>
              <span className="fin-price">{priceWords(p.org_price_minor, p.per)}</span>
              <span className="fin-price fin-price--quiet">{priceWords(p.personal_price_minor, p.per)}</span>
            </button>
          ))}
        </FinPart>
      ))}
      <FinPart title="Discounts" add={<AddLink label="Add a discount" expanded={panel?.kind === 'discount' && !panel.id} onClick={() => setPanel({ kind: 'discount' })} />}>
        {(discounts || []).length === 0 && <p className="cc-quiet fin-none">No discounts yet.</p>}
        {(discounts || []).map((d) => <FigRow key={d.id} title={d.name} facts={[discountFor(d, packages)]} value={discountWords(d)} onClick={() => setPanel({ kind: 'discount', id: d.id })} label={`Edit ${d.name}`} />)}
      </FinPart>
      {(priceChanges || []).length > 0 && (
        <FinPart title="Changes">
          {priceChanges.slice(0, 12).map((c) => <FigRow key={c.id} title={c.label} facts={[c.created_at ? dayWordsFrom(String(c.created_at).slice(0, 10), todayKey) : null]} />)}
        </FinPart>
      )}
      <p className="cc-note fin-footnote">The products page reads its prices from here.</p>

      <SweepPanel open={panel?.kind === 'sweep'} onClose={() => setPanel(null)} done={done} />
      <PackagePanel pkg={panel?.kind === 'package' ? (packages || []).find((p) => p.id === panel.id) : null} vatOn={vatOn} onClose={() => setPanel(null)} done={done} userId={userId} />
      <DiscountPanel panel={panel?.kind === 'discount' ? panel : null} onClose={() => setPanel(null)} done={done} userId={userId} coachId={coach.id} />
    </>
  );
}

const SWEEP_OPTIONS = [{ value: '2', label: '+2%' }, { value: '3', label: '+3%' }, { value: '5', label: '+5%' }, { value: 'other', label: 'Other' }];

/** Update all prices (M11 C8): by how much, from when, the preview, and the rounding rule. */
function SweepPanel({ open, onClose, done }) {
  const { userId, coach, packages, todayKey, model } = useFinance();
  const [by, setBy] = useState('3');
  const [other, setOther] = useState('');
  const [from, setFrom] = useState('');
  const [problem, setProblem] = useState(null);
  const nextJan = `${Number(todayKey.slice(0, 4)) + 1}-01-01`;
  const nextYear = `${financialYear(todayKey, model.startMonth).label + 1}-${String(model.startMonth).padStart(2, '0')}-01`;
  useEffect(() => { if (open) { setBy('3'); setOther(''); setFrom(nextJan); setProblem(null); } }, [open, nextJan]);
  const percent = by === 'other' ? percentFromTyped(other, { min: -49.99, max: 100 }) : Number(by);
  const plan = useMemo(() => (percent == null ? null : updateAllPrices({ packages: (packages || []).map((p) => ({ name: p.name, hours: p.hours, organisations_minor: p.org_price_minor, personally_minor: p.personal_price_minor })), percent })), [packages, percent]);
  const save = async () => {
    if (!plan) { setProblem('Type the change as a percentage, such as 4.'); return; }
    const before = packages || [];
    const after = before.map((p, i) => ({ ...p, org_price_minor: plan.packages[i].organisations?.now ?? p.org_price_minor, personal_price_minor: plan.packages[i].personally?.now ?? p.personal_price_minor }));
    const change = { id: newId(), coach_id: coach.id, label: `Prices ${percent >= 0 ? 'up' : 'down'} ${Math.abs(percent)}% from ${dayWordsFrom(from, todayKey)}`, percent, from_on: from,
      prices: plan.packages.map((p, i) => ({ id: before[i].id, name: p.name, organisations: p.organisations, personally: p.personally })) };
    const ok = await done(() => saveRows(userId, [...after.map((p) => ['pricing_packages', p]), ['pricing_changes', change]]), 'Saved.',
      async () => { await saveRows(userId, before.map((p) => ['pricing_packages', p])); await removeRow(userId, 'pricing_changes', change.id); });
    if (ok) onClose();
  };
  return (
    <SlidePanel open={open} onClose={onClose} title="Update all prices"
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>{plan ? plan.button : 'Update prices'}</Button></div>}>
      <div className="cc-field"><InlineChoice label="By how much?" options={SWEEP_OPTIONS} value={by} onChange={(v) => { setBy(v); setProblem(null); }} semantics="radio" /></div>
      {by === 'other' && <div className="cc-field"><TextField label="Percentage" inputMode="decimal" value={other} placeholder="%" autoComplete="off" onChange={(e) => { setOther(e.target.value); setProblem(null); }} /></div>}
      <div className="cc-field"><Dropdown label="From when?" options={[{ value: nextJan, label: dayKeyWords(nextJan, { year: true }) }, { value: nextYear, label: dayKeyWords(nextYear, { year: true }) }].filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i)} value={from} onChange={setFrom} /></div>
      {plan && (
        <>
          <p className="fin-small-head">Preview</p>
          {plan.preview.map((r) => <FigRow key={r.name} title={r.name} facts={[r.was]} value={r.now} />)}
          <p className="cc-note">{plan.footnote}</p>
        </>
      )}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** A package's two prices (M11 C8). With VAT off, no VAT words (the brief wins over M11). */
function PackagePanel({ pkg, vatOn, onClose, done, userId }) {
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => { setForm(pkg ? { org: typedPounds(pkg.org_price_minor), personal: typedPounds(pkg.personal_price_minor) } : null); setProblem(null); }, [pkg?.id]);
  if (!pkg || !form) return null;
  const read = (t) => (String(t).trim() === '' ? null : poundsFromTyped(t, { allowZero: true }));
  const org = read(form.org);
  const personal = read(form.personal);
  const orgHr = org ? perHourWords(org, pkg.hours) : '';
  const perHr = personal ? perHourWords(personal, pkg.hours, { includesVat: vatOn }) : '';
  const note = orgHr && perHr ? `That’s ${orgHr.toLowerCase()} for organisations and ${perHr.slice(6)} paying personally.` : orgHr ? `That’s ${orgHr.toLowerCase()} for organisations.` : '';
  const save = async () => {
    if ((String(form.org).trim() && org == null) || (String(form.personal).trim() && personal == null)) { setProblem('Type each price as an amount, such as 13,460.'); return; }
    const ok = await done(() => saveRow(userId, 'pricing_packages', { ...pkg, org_price_minor: org, personal_price_minor: personal }), 'Saved.', () => saveRow(userId, 'pricing_packages', pkg));
    if (ok) onClose();
  };
  return (
    <SlidePanel open onClose={onClose} title={pkg.name} draftKey={`fin-package:${pkg.id}`}
      footer={<div className="cc-panel-foot"><TextLink onClick={onClose}>Cancel</TextLink><Button variant="primary" onClick={save}>Save</Button></div>}>
      <div className="cc-field cc-two">
        <TextField label={vatOn ? 'Organisations, + VAT' : 'Organisations'} inputMode="decimal" value={form.org} placeholder="£" autoComplete="off" onChange={(e) => { setForm({ ...form, org: e.target.value }); setProblem(null); }} />
        <TextField label={vatOn ? 'Paying personally, including VAT' : 'Paying personally'} inputMode="decimal" value={form.personal} placeholder="£" autoComplete="off" onChange={(e) => { setForm({ ...form, personal: e.target.value }); setProblem(null); }} />
      </div>
      {note && <p className="cc-note">{note}</p>}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** Add discount (M11 C8), and editing one: a name (never charity), a percentage or a fixed amount, which packages. */
function DiscountPanel({ panel, onClose, done, userId, coachId }) {
  const { discounts, packages } = useCoachPortal();
  const before = panel?.id ? (discounts || []).find((d) => d.id === panel.id) : null;
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    if (!panel) { setForm(null); return; }
    setForm(before ? { name: before.name, kind: before.percent != null ? 'percent' : 'amount', value: before.percent != null ? String(Number(before.percent)) : typedPounds(before.amount_minor), all: before.all_packages !== false, ids: before.package_ids || [] }
      : { name: '', kind: 'percent', value: '', all: true, ids: [] });
    setProblem(null);
  }, [panel?.id, panel?.kind]);
  if (!panel || !form) return null;
  const save = async () => {
    let checked;
    try {
      checked = checkDiscount({ name: form.name, percent: form.kind === 'percent' ? percentFromTyped(form.value, { min: 0.01 }) ?? -1 : null,
        amount_minor: form.kind === 'amount' ? poundsFromTyped(form.value) ?? -1 : null, packages: form.all ? 'all' : form.ids });
    } catch (error) { setProblem(error.message); return; }
    const row = { ...(before || {}), id: before?.id || newId(), coach_id: coachId, name: checked.name, percent: checked.percent, amount_minor: checked.amount_minor, all_packages: form.all, package_ids: form.all ? [] : form.ids, archived: false };
    const ok = await done(() => saveRow(userId, 'discounts', row), 'Saved.', () => (before ? saveRow(userId, 'discounts', before) : removeRow(userId, 'discounts', row.id)));
    if (ok) onClose();
  };
  const remove = async () => {
    if (await done(async () => { await removeRow(userId, 'discounts', before.id); return 'saved'; }, 'Deleted', () => saveRow(userId, 'discounts', before))) onClose();
  };
  return (
    <SlidePanel open onClose={onClose} title={before ? 'Edit discount' : 'Add discount'} draftKey={`fin-discount:${before?.id || 'new'}`}
      footer={<div className="cc-panel-foot">{before ? <TextLink onClick={remove}>Delete</TextLink> : <TextLink onClick={onClose}>Cancel</TextLink>}<Button variant="primary" onClick={save}>{before ? 'Save my edit' : 'Add discount'}</Button></div>}>
      <div className="cc-field"><TextField label="What do you call it?" value={form.name} maxLength={80} placeholder="Such as Returning client" autoComplete="off" onChange={(e) => { setForm({ ...form, name: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field"><InlineChoice label="How much off?" options={[{ value: 'percent', label: 'A percentage' }, { value: 'amount', label: 'A fixed amount' }]} value={form.kind} onChange={(v) => setForm({ ...form, kind: v, value: '' })} semantics="radio" /></div>
      <div className="cc-field"><TextField label={form.kind === 'percent' ? 'Percentage' : 'Amount'} inputMode="decimal" value={form.value} placeholder={form.kind === 'percent' ? '%' : '£'} autoComplete="off" onChange={(e) => { setForm({ ...form, value: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field"><Dropdown label="Which packages?" options={[{ value: 'all', label: 'All packages' }, { value: 'some', label: 'Choose packages' }]} value={form.all ? 'all' : 'some'} onChange={(v) => setForm({ ...form, all: v === 'all' })} /></div>
      {!form.all && (
        <div className="cc-field"><ChipRow label="Packages">{(packages || []).map((p) => <Chip key={p.id} pressed={form.ids.includes(p.id)} onClick={() => setForm({ ...form, ids: form.ids.includes(p.id) ? form.ids.filter((x) => x !== p.id) : [...form.ids, p.id] })}>{p.name}</Chip>)}</ChipRow></div>
      )}
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

// ---------------------------------------------------------------- Other (M11 C9)

const VAT_HELP = {
  title: 'What counts towards £90,000',
  terms: [
    { term: 'Counts', meaning: 'Work for UK businesses and people living in the UK, and anything done in person in the UK, such as a workshop here.' },
    { term: 'Doesn’t count', meaning: ['Work for businesses outside the UK, and coaching for people living outside the UK.', 'Keep where each client lives as evidence.'] },
    { term: 'To check with your accountant', meaning: 'Whether every kind of one-to-one coaching counts as consultancy.' },
  ],
};
const KIND_WHO = { confirmation_statement: 'Companies House', accounts: 'Companies House', corporation_tax: 'HMRC', vat_return: 'HMRC' };
const kindOf = (name) => (/confirmation/i.test(name) ? 'confirmation_statement' : /corporation/i.test(name) ? 'corporation_tax' : /\bvat\b/i.test(name) ? 'vat_return' : /accounts/i.test(name) ? 'accounts' : 'other');

export function OtherTab() {
  const fin = useFinance();
  const { model, todayKey, clients, organisations, deadlines, settings } = fin;
  const [panel, setPanel] = useState(null); // { kind: 'deadline', id? } | { kind: 'export', label }
  const country = useMemo(() => {
    const person = Object.fromEntries((clients || []).map((c) => [c.id, c.country || null]));
    const org = Object.fromEntries((organisations || []).map((o) => [o.id, o.country || null]));
    return (l) => (l.organisation_id ? org[l.organisation_id] : l.profile_id ? person[l.profile_id] : null) ?? null;
  }, [clients, organisations]);
  const vat = ukTaxableIncome({ lines: model.lines, today: todayKey, countryOf: country });
  const abroad = (clients || []).filter((c) => c.country && c.country !== 'GB' && c.status !== 'past').length;
  const fy = financialYear(todayKey, model.startMonth);
  const last = yearStarting(fy.label - 1, model.startMonth);
  const upcoming = nextDeadlines(deadlines, todayKey);
  return (
    <>
      <FinPart title="VAT" aside={settings.vat_registered ? 'Registered' : 'Not registered'}>
        <StatGroup className="cc-stats fin-stats fin-stats--1">
          <Stat label="UK taxable income, last 12 months" value={vat.figure} unit={vat.of} bar={Math.min(1, vat.minor / 9000000)} />
        </StatGroup>
        <p className="cc-note">You register within 30 days of going over £90,000 in any 12 months. Work for clients outside the UK doesn’t count, unless it’s done in person here.</p>
        <div className="cc-acts"><ExplainLink explain={VAT_HELP} helpKey="finance-vat-counts">What counts</ExplainLink></div>
        <FigRow title="Where each client lives" facts={['Kept for every client outside the UK, as evidence']} value={abroad === 1 ? '1 client' : `${abroad} clients`} />
      </FinPart>

      <FinPart title="Company deadlines" add={<AddLink label="Add a deadline" expanded={panel?.kind === 'deadline' && !panel.id} onClick={() => setPanel({ kind: 'deadline' })} />}>
        {upcoming.length === 0 && <p className="cc-quiet fin-none">No deadlines yet.</p>}
        {upcoming.map((d) => <FigRow key={d.id} title={d.name} facts={[[KIND_WHO[d.kind], (EVERY_WORDS[d.every] || '').toLowerCase()].filter(Boolean).join(', ')]} value={dayWordsFrom(d.day, todayKey)} onClick={() => setPanel({ kind: 'deadline', id: d.id })} label={`Edit ${d.name}`} />)}
      </FinPart>

      {/* A financial year runs across two calendar years, so its dates keep their years (data-year). */}
      <FinPart title="Year end">
        <FigRow title="Export the financial year" facts={[<span data-year="">{fy.words}</span>, 'Every invoice and payment, for your accountant']} value="Download" onClick={() => setPanel({ kind: 'export', label: fy.label })} label={`Export the financial year, ${fy.words}. Download`} />
        <FigRow title="Last year" facts={[<span data-year="">{last.words}</span>]} value="Download" onClick={() => setPanel({ kind: 'export', label: last.label })} label={`Last year, ${last.words}. Download`} />
      </FinPart>

      <DeadlinePanel panel={panel?.kind === 'deadline' ? panel : null} onClose={() => setPanel(null)} />
      <YearExportPanel label={panel?.kind === 'export' ? panel.label : null} onClose={() => setPanel(null)} />
    </>
  );
}

/** Add deadline (M11 C9), and editing one: what, when, how often, and an amount that shows on the cash flow. */
function DeadlinePanel({ panel, onClose }) {
  const { userId, coach, deadlines, todayKey } = useCoachPortal();
  const done = useDone();
  const before = panel?.id ? (deadlines || []).find((d) => d.id === panel.id) : null;
  const [form, setForm] = useState(null);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    if (!panel) { setForm(null); return; }
    setForm(before ? { name: before.name, day: before.due_on, every: before.every, amount: typedPounds(before.amount_minor) } : { name: '', day: `${addMonths(monthKey(todayKey), 1)}-01`, every: 'year', amount: '' });
    setProblem(null);
  }, [panel?.id, panel?.kind]);
  if (!panel || !form) return null;
  const save = async () => {
    if (!form.name.trim()) { setProblem('Type what it is to carry on.'); return; }
    const amount = String(form.amount).trim() ? poundsFromTyped(form.amount, { allowZero: true }) : null;
    if (String(form.amount).trim() && amount == null) { setProblem('Type the amount, such as 4,500, or leave it empty.'); return; }
    const row = { ...(before || {}), id: before?.id || newId(), coach_id: coach.id, name: form.name.trim().slice(0, 120), kind: before?.kind && before.kind !== 'other' ? before.kind : kindOf(form.name), due_on: form.day, every: form.every, amount_minor: amount };
    if (await done(() => saveRow(userId, 'company_deadlines', row), 'Saved.', () => (before ? saveRow(userId, 'company_deadlines', before) : removeRow(userId, 'company_deadlines', row.id)))) onClose();
  };
  const remove = async () => {
    if (await done(async () => { await removeRow(userId, 'company_deadlines', before.id); return 'saved'; }, 'Deleted', () => saveRow(userId, 'company_deadlines', before))) onClose();
  };
  return (
    <SlidePanel open onClose={onClose} title={before ? 'Edit deadline' : 'Add deadline'} draftKey={`fin-deadline:${before?.id || 'new'}`}
      footer={<div className="cc-panel-foot">{before ? <TextLink onClick={remove}>Delete</TextLink> : <TextLink onClick={onClose}>Cancel</TextLink>}<Button variant="primary" onClick={save}>{before ? 'Save my edit' : 'Add deadline'}</Button></div>}>
      <div className="cc-field"><TextField label="What is it?" value={form.name} maxLength={120} placeholder="Such as a VAT return" autoComplete="off" onChange={(e) => { setForm({ ...form, name: e.target.value }); setProblem(null); }} /></div>
      <div className="cc-field cc-two">
        <DatePicker label="When is it due?" value={form.day} min="2000-01-01" onChange={(day) => setForm({ ...form, day })} />
        <Dropdown label="How often?" options={Object.entries(EVERY_WORDS).map(([value, label]) => ({ value, label }))} value={form.every} onChange={(v) => setForm({ ...form, every: v })} />
      </div>
      <div className="cc-field"><TextField label="Amount to pay, if any" inputMode="decimal" value={form.amount} placeholder="It shows on the cash flow" autoComplete="off" onChange={(e) => { setForm({ ...form, amount: e.target.value }); setProblem(null); }} /></div>
      {problem && <p className="cc-problem" role="alert">{problem}</p>}
    </SlidePanel>
  );
}

/** Export the financial year (M11 C9): Excel or CSV, made here and downloaded by the browser; never emailed. */
function YearExportPanel({ label, onClose }) {
  const fin = useFinance();
  const { model, todayKey, names, clients, organisations, outgoings, deadlines, statements, coaches, payments } = fin;
  const toast = useToast();
  const [format, setFormat] = useState('xlsx');
  const go = () => {
    const people = Object.fromEntries(Object.entries(names.person).map(([id, name]) => [id, { name, country: (clients || []).find((c) => c.id === id)?.country || '' }]));
    const orgs = Object.fromEntries((organisations || []).map((o) => [o.id, { name: o.name, country: o.country || '' }]));
    const receipts = Object.fromEntries((payments || []).filter((p) => p.receipt_path).map((p) => [p.id, String(p.receipt_path).split('/').pop()]));
    const nameOf = (id) => coachNameOf((coaches || []).find((c) => coachIdOf(c) === id));
    const payouts = (statements || []).filter((s) => s.paid_on).map((s) => ({ name: nameOf(s.associate_id), amount_minor: Number(s.paid_minor ?? s.total_minor) || 0, paid_at: `${s.paid_on}T12:00:00Z` }));
    const exp = yearExport({ yearLabel: label, startMonth: model.startMonth, today: todayKey, lines: model.lines, invoices: fin.invoices || [], outgoings, deadlines, associatePayouts: payouts, people, organisations: orgs, receipts });
    const name = `finances-${exp.year.label}-to-${exp.year.label + 1}`;
    if (format === 'csv') download(`${name}.csv`, `﻿${toCsv([[...EXPORT_COLUMNS], ...exp.rows])}`, 'text/csv;charset=utf-8');
    else {
      const [sheet, totals] = yearExportSheets(exp);
      download(`${name}.xlsx`, xlsxBytes([sheet.columns, ...sheet.rows, [], totals.columns, ...totals.rows], sheet.name), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    toast.show('Downloading the spreadsheet.');
    onClose();
  };
  return (
    <SlidePanel open={label != null} onClose={onClose} title="Export the financial year" footer={<div className="cc-panel-foot cc-panel-foot--end"><Button variant="primary" onClick={go}>Download</Button></div>}>
      <div className="cc-field"><InlineChoice label="Format" options={[{ value: 'xlsx', label: 'Excel' }, { value: 'csv', label: 'CSV' }]} value={format} onChange={setFormat} semantics="radio" /></div>
      <p className="cc-note">Every invoice and payment, with the currency, the rate it landed at and where each client lives.</p>
    </SlidePanel>
  );
}
