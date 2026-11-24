import { moneyWords, rateWords, invoiceNumber, REMINDER_DAYS } from '../billing/money.js';
import { payReminderDue } from '../finance/associates.js';
import { monthName } from '../finance/year.js';
import { addDays, daysBetween, dayKeyWords } from '../time/index.js';
import {
  addMonths, cashFlow, DEFAULT_YEAR_START_MONTH, financialYear, incomeLines, monthKey, overdueCount, perHourWords, poundsWords, todayFinanceLine,
} from '../finance/index.js';
import { leadValue } from './crm.js';

// Finances' screens, put together from the coach store's rows (Phase 6b run 2; M11 C1 to C9). Every sum is
// src/lib/finance's: this file only gathers the rows each sum asks for and words the rows Finances lists (an
// invoice's line, a deadline, a package's prices, Needs you and Coming in). No clock is read here: today comes in.
// Checked by tests/performance/finance-screens.test.mjs.

const ANY_YEAR_AWAY = 330;

/** "Thu 14 Jan", or "Sat 3 Jul 2027" when it is most of a year from today (M11 drops the year inside that). */
export function dayWordsFrom(key, today) {
  if (!key) return '';
  const day = String(key).slice(0, 10);
  const far = Math.abs(daysBetween(today, day)) > ANY_YEAR_AWAY;
  return dayKeyWords(day, { year: far });
}

/**
 * An amount typed in pounds ("£1,200", "1200.50", "1,200") as pence; null when it isn't one. At most `max` pence
 * (£1,000,000 by default), never below 0 (`allowZero` lets 0 through).
 */
export function poundsFromTyped(text, { max = 100000000, allowZero = false } = {}) {
  const t = String(text ?? '').replace(/[£$€,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const minor = Math.round(Number(t) * 100);
  if (!Number.isFinite(minor) || minor > max || (minor === 0 && !allowZero)) return null;
  return minor;
}

/** A percentage typed ("25", "25%", "2.5"); null when it isn't one from `min` to `max`. */
export function percentFromTyped(text, { min = 0, max = 100 } = {}) {
  const t = String(text ?? '').replace(/[%\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** Pence as the figure a box shows to edit ("1200", "1200.50"); '' for none. */
export const typedPounds = (minor) => (minor == null || minor === '' ? '' : (Number(minor) % 100 ? (Number(minor) / 100).toFixed(2) : String(Number(minor) / 100)));

/** Repeating income (Overview's Coming in, the forecast): each active monthly agreement with an organisation. */
export function repeatingFrom(deals = []) {
  return (deals || []).filter((d) => d && d.per === 'month' && (d.status ?? 'active') === 'active' && Number(d.value) > 0)
    .map((d) => ({ name: d.name, amount_minor: Math.round(Number(d.value) * 100), per: 'month', sector: d.sector ?? null }));
}

/** The pipeline's leads for the forecast's "Include likely deals": each open lead's value at its stage's chance. */
export function leadsForForecast(leads = [], stages = []) {
  const byId = new Map((stages || []).map((s) => [s.id, s]));
  return (leads || []).filter((l) => l && !l.won_at && !l.cold_at && !l.merged_into).map((l) => {
    const stage = byId.get(l.stage_id);
    return { likelihood: stage && !stage.is_won ? Number(stage.likelihood) || 0 : 0, value_minor: Math.round(leadValue(l) * 100), expected_on: null };
  }).filter((l) => l.likelihood > 0 && l.value_minor > 0);
}

/** Overview's Coming in: Pipeline, its open deals and what's likely (value in pounds, as Leads keeps it). */
export function pipelineLine(leads = [], stages = []) {
  const byId = new Map((stages || []).map((s) => [s.id, s]));
  let count = 0;
  let value = 0;
  let likely = 0;
  for (const l of leads || []) {
    if (!l || l.won_at || l.cold_at || l.merged_into) continue;
    const stage = byId.get(l.stage_id);
    if (stage?.is_won) continue;
    count += 1;
    const v = Math.round(leadValue(l) * 100);
    value += v;
    likely += Math.round((v * (Number(stage?.likelihood) || 0)) / 100);
  }
  return { count, value, likely, facts: [count === 1 ? '1 open deal' : `${count} open deals`, likely ? `Likely ${poundsWords(likely)}` : null].filter(Boolean), figure: poundsWords(value) };
}

/** Renewals in the next 90 days: engagements ending from today to 90 days on, with the signed agreement's price when known. */
export function renewalsSoon({ engagements = [], admin = [], versions = [], today }) {
  const until = addDays(today, 90);
  const ends = new Map();
  for (const e of engagements || []) if (e?.ends_on && e.ends_on >= today && e.ends_on <= until && !e.closed_at) ends.set(e.profile_id || e.id, e);
  for (const a of admin || []) if (a?.ends_on && a.ends_on >= today && a.ends_on <= until && !ends.has(a.profile_id)) ends.set(a.profile_id, a);
  let value = 0;
  for (const key of ends.keys()) {
    const v = (versions || []).filter((x) => x.profile_id === key && x.client_signed_at && x.currency !== 'USD').sort((a, b) => String(b.client_signed_at).localeCompare(String(a.client_signed_at)))[0];
    if (v) value += Number(v.total_minor ?? v.terms?.total_minor) || 0;
  }
  const n = ends.size;
  return { count: n, value, facts: [n === 1 ? '1 engagement' : `${n} engagements`], figure: value ? poundsWords(value) : '' };
}

// ---------------------------------------------------------------- invoices

/** What an invoice is for: its first line ("Team Workshop, November"), else "Invoice". */
export const invoiceTitle = (inv) => String(inv?.lines?.[0]?.description || '').trim() || 'Invoice';
/** "CLARITY-1214", or '' before the database has given it a number. */
export const invoiceNo = (inv) => (Number.isInteger(Number(inv?.number)) && Number(inv.number) >= 1201 ? invoiceNumber(Number(inv.number)) : '');
/** Who an invoice is for, in words: the organisation, the client, or the payer's name. */
export const invoiceWho = (inv, names = {}) => (inv?.organisation_id && names.org?.[inv.organisation_id]) || (inv?.profile_id && names.person?.[inv.profile_id]) || inv?.payer_name || '';
const left = (inv) => Math.max(0, Number(inv.total_minor) - Number(inv.paid_minor || 0));
const dueOf = (inv, today) => inv.due_on || addDays(today, Number(inv.terms_days) || 14);

/** "7 days overdue", "1 day overdue". */
export const overdueWords = (dueOn, today) => { const d = Math.max(1, daysBetween(dueOn, today)); return d === 1 ? '1 day overdue' : `${d} days overdue`; };

/**
 * Invoices' four lists, as M11 draws them: Waiting to send (drafts), Overdue, Sent and due, Paid this month. A search
 * matches the title, the number, who it's for or the amount; filters by client (a profile or organisation key), status
 * and year (the financial year's label).
 */
export function invoiceGroups({ invoices = [], today, names = {}, q = '', who = '', status = '', year = '', startMonth = DEFAULT_YEAR_START_MONTH }) {
  const typed = String(q || '').trim().toLowerCase();
  const month = monthKey(today);
  const out = { waiting: [], overdue: [], sent: [], paid: [] };
  for (const inv of invoices || []) {
    if (!inv || inv.status === 'void' || inv.waived_at) continue;
    const row = { id: inv.id, invoice: inv, title: invoiceTitle(inv), number: invoiceNo(inv), who: invoiceWho(inv, names), amount: moneyWords(inv.status === 'paid' ? Number(inv.total_minor) : left(inv) || Number(inv.total_minor), inv.currency || 'GBP') };
    let group;
    if (inv.status === 'draft') { group = 'waiting'; row.when = `Due ${dayWordsFrom(dueOf(inv, today), today)}`; row.sort = dueOf(inv, today); }
    else if (inv.status === 'sent' && left(inv) > 0) {
      const due = dueOf(inv, today);
      if (due < today) { group = 'overdue'; row.when = overdueWords(due, today); row.sort = due; }
      else { group = 'sent'; row.when = `Due ${dayWordsFrom(due, today)}`; row.sort = due; }
    } else if (inv.status === 'paid' && inv.paid_at && String(inv.paid_at).slice(0, 7) === month) {
      group = 'paid'; row.when = `Paid ${dayWordsFrom(String(inv.paid_at).slice(0, 10), today)}`; row.sort = `~${String(inv.paid_at)}`;
    }
    if (!group) {
      // Paid before this month: shown only when searched or filtered for.
      if (!(typed || who || status || year) || inv.status !== 'paid') continue;
      group = 'paid'; row.when = inv.paid_at ? `Paid ${dayWordsFrom(String(inv.paid_at).slice(0, 10), today)}` : 'Paid'; row.sort = `~${String(inv.paid_at || '')}`;
    }
    if (who && who !== (inv.organisation_id ? `org:${inv.organisation_id}` : `person:${inv.profile_id}`)) continue;
    if (status && status !== group) continue;
    if (year) {
      const day = String(inv.issued_on || inv.due_on || inv.created_at || '').slice(0, 10);
      if (!day || String(financialYear(day, startMonth).label) !== String(year)) continue;
    }
    if (typed && ![row.title, row.number, row.who, row.amount].some((w) => String(w).toLowerCase().includes(typed))) continue;
    out[group].push(row);
  }
  out.waiting.sort((a, b) => a.sort.localeCompare(b.sort));
  out.overdue.sort((a, b) => a.sort.localeCompare(b.sort));
  out.sent.sort((a, b) => a.sort.localeCompare(b.sort));
  out.paid.sort((a, b) => b.sort.localeCompare(a.sort));
  return out;
}

/**
 * An overdue invoice's reminders (M11: "Sent Fri 13 Nov and Mon 16 Nov", "The last one goes on Tue 24 Nov", "2 of 3"),
 * and the newest one drafted and not yet sent (Send a reminder now sends it).
 */
export function reminderLines({ invoice, reminders = [], today }) {
  const mine = (reminders || []).filter((r) => r.invoice_id === invoice.id);
  const sent = mine.filter((r) => r.sent_at).sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)));
  const waiting = mine.filter((r) => !r.sent_at).sort((a, b) => b.stage - a.stage)[0] || null;
  const lines = [];
  if (sent.length) {
    const days = sent.map((r) => dayWordsFrom(String(r.sent_at).slice(0, 10), today));
    lines.push(`Sent ${days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days.at(-1)}` : days[0]}`);
  } else lines.push('None sent yet');
  const last = invoice.due_on ? addDays(invoice.due_on, REMINDER_DAYS.at(-1)) : null;
  if (last && sent.length < REMINDER_DAYS.length) lines.push(`${last >= today ? 'The last one goes on' : 'The last one was due on'} ${dayWordsFrom(last, today)}`);
  return { lines, count: `${sent.length} of ${REMINDER_DAYS.length}`, waiting };
}

// ---------------------------------------------------------------- Needs you and Today's line

/** Overdue invoices listed one by one on Needs you, up to this many. */
export const OVERDUE_LINES = 3;

/**
 * Overview's Needs you, in M11's order: low cash, each overdue invoice, drafts waiting to send, company deadlines in
 * the next 2 weeks, and the year's targets to check after a new year copied them.
 * @returns {{ key: string, title: string, small?: string, link: string, to: string|null, invoiceId?: string }[]}
 */
export function needsYouRows({ cash = null, invoices = [], deadlines = [], today, names = {}, targetsToCheck = false, associatesToPay = [] }) {
  const rows = [];
  if (cash?.needsYou) rows.push({ key: 'cash', title: cash.needsYou, link: 'View the forecast', to: '/coach/finances/cash-flow' });
  // Each overdue invoice on its own line, the longest overdue first; past OVERDUE_LINES of them, one line for them all.
  const overdue = (invoices || []).filter((inv) => inv.status === 'sent' && !inv.waived_at && inv.due_on && inv.due_on < today && left(inv) > 0)
    .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
  if (overdue.length > OVERDUE_LINES) rows.push({ key: 'od', title: `${overdue.length} invoices are overdue.`, link: 'View them', to: '/coach/finances/invoices' });
  else for (const inv of overdue) {
    const d = Math.max(1, daysBetween(inv.due_on, today));
    rows.push({ key: `od:${inv.id}`, title: `An invoice for ${moneyWords(left(inv), inv.currency || 'GBP')} is ${d === 1 ? '1 day' : `${d} days`} overdue.`, small: invoiceWho(inv, names), link: 'View the invoice', to: null, invoiceId: inv.id });
  }
  const drafts = (invoices || []).filter((i) => i.status === 'draft' && !i.waived_at).length;
  if (drafts) rows.push({ key: 'drafts', title: drafts === 1 ? '1 invoice is waiting to send.' : `${drafts} invoices are waiting to send.`, link: 'Check and send', to: '/coach/finances/invoices' });
  for (const d of nextDeadlines(deadlines, today)) {
    if (daysBetween(today, d.day) > 14) continue;
    rows.push({ key: `dl:${d.id}`, title: `${d.name} is due on ${dayWordsFrom(d.day, today)}.`, link: 'View the deadline', to: '/coach/finances/other' });
  }
  // The last day of each month: pay each associate, outside the portal (run 2's brief, step 5).
  if (payReminderDue(today)) {
    for (const a of associatesToPay) rows.push({ key: `pay:${a.coach_id}`, title: `Pay ${a.first} for ${monthName(today)}.`, link: `View ${a.first}`, to: '/coach/settings/coaches' });
  }
  if (targetsToCheck) rows.push({ key: 'targets', title: 'This year’s targets were copied from last year.', small: 'Check them, or raise them all by a percentage.', link: 'Check the targets', to: null });
  return rows;
}

/** Each deadline's next day from today on (a repeating one moves on by its repeat), soonest first. */
export function nextDeadlines(deadlines = [], today) {
  const step = { month: 1, quarter: 3, year: 12 };
  const out = [];
  for (const d of deadlines || []) {
    if (!d?.due_on) continue;
    let day = d.due_on;
    if (d.every && step[d.every]) {
      for (let k = 0; day < today && k < 1200; k += 1) {
        const m = addMonths(monthKey(d.due_on), step[d.every] * (k + 1));
        const want = Number(d.due_on.slice(8, 10));
        const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
        day = `${m}-${String(Math.min(want, last)).padStart(2, '0')}`;
      }
    }
    if (day < today || (d.done_on && d.done_on >= day)) continue;
    out.push({ ...d, id: d.id, name: d.name, day });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** "Companies House, each year" style line for a deadline's repeat. */
export const EVERY_WORDS = Object.freeze({ once: 'Once', month: 'Each month', quarter: 'Each quarter', year: 'Each year' });

/** Associate pay in the forecast: each associate with their hourly rate (their row, else their latest statement's). */
export function associatesForForecast({ coaches = [], statements = [] }) {
  return (coaches || []).filter((c) => c && c.role !== 'owner' && c.active !== false).map((c) => {
    const latest = (statements || []).filter((s) => s.associate_id === c.id).sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
    // coaches.hourly_rate (049) is in pounds; else their latest statement's rate (the same rule as Settings, Coaches).
    const rate = (c.hourly_rate != null && Number.isFinite(Number(c.hourly_rate)) ? Math.round(Number(c.hourly_rate) * 100) : Number(latest?.rate_minor)) || 0;
    return { coach_id: c.id, name: c.display_name || c.full_name || c.display_first_name || 'Associate', hourly_rate_minor: rate };
  }).filter((a) => a.hourly_rate_minor > 0);
}

/** Statements marked paid, as the cash flow's associate payouts. */
export const payoutsFrom = (statements = []) => (statements || []).filter((s) => s.paid_on).map((s) => ({ coach_id: s.associate_id, month: monthKey(s.month), amount_minor: Number(s.paid_minor ?? s.total_minor) || 0, paid_at: `${s.paid_on}T12:00:00Z` }));

/** Associates' sessions as the forecast reads them: one before now counts as held (the owner's read carries no outcome). */
export const associateSessionsForForecast = (rows = [], nowMs = 0) => (rows || []).map((r) => ({ coach_id: r.coach_id, starts_at: r.starts_at, minutes: r.minutes, outcome: Date.parse(r.starts_at) < nowMs ? 'held' : null }));

/**
 * Everything Finances reads, gathered once from the store's rows: the income lines, the cash flow for `months` ahead
 * and Today's line. `rows` holds the store's lists (CoachApp's context).
 */
export function financeModel(rows, { today, months = 6, includeLikely = false, nowMs = 0 } = {}) {
  const settings = rows.financeSettings || {};
  const startMonth = Number(settings.year_start_month) || DEFAULT_YEAR_START_MONTH;
  const lines = incomeLines({ payments: rows.payments || [], creditNotes: rows.creditNotes || [], invoices: rows.invoices || [] });
  const versions = (rows.agreementVersions || []).filter((v) => v.status === 'signed' || v.client_signed_at);
  const repeating = repeatingFrom(rows.orgDeals);
  const associates = associatesForForecast({ coaches: rows.coaches, statements: rows.statements });
  const cash = cashFlow({ today, months: [3, 6, 12].includes(months) ? months : 6, settings, lines, outgoings: rows.outgoings || [], deadlines: rows.deadlines || [],
    invoices: rows.invoices || [], versions, repeating, leads: leadsForForecast(rows.leads, rows.leadStages), includeLikely, associates,
    sessions: associateSessionsForForecast(rows.associateSessions, nowMs), associatePayouts: payoutsFrom(rows.statements) });
  const today6 = months === 6 ? cash : cashFlow({ today, months: 6, settings, lines, outgoings: rows.outgoings || [], deadlines: rows.deadlines || [], invoices: rows.invoices || [], versions, repeating, associates,
    sessions: associateSessionsForForecast(rows.associateSessions, nowMs), associatePayouts: payoutsFrom(rows.statements) });
  const line = todayFinanceLine({ today, lines, targets: rows.financeTargets || [], cashShort: cash.todayShort, overdueCount: overdueCount(rows.invoices || [], today) });
  return { settings, startMonth, lines, versions, repeating, associates, cash, cash6: today6, line };
}

/** A package's two prices in words: "£7,460", "£2,460/month"; '' for none. */
export function priceWords(minor, per = 'once') {
  if (minor == null || minor === '') return '';
  return per === 'month' ? rateWords(Number(minor), 'month') : moneyWords(Number(minor));
}

/** A package's grey line: "About £830/hr", else "Monthly" or "A day", else its own detail. */
export function packageDetail(p, { vatOn = false } = {}) {
  if (p.detail) return p.detail;
  if (p.per === 'month') return 'Monthly';
  if (p.per === 'day') return 'A day';
  return perHourWords(Number(p.org_price_minor ?? p.personal_price_minor), Number(p.hours), { includesVat: vatOn && p.org_price_minor == null }) || '';
}

/** Pricing's sections, in the sectors' order, then any sector a package names that isn't listed, then "Other". */
export function pricingSections(packages = [], sectors = []) {
  const names = (sectors || []).map((s) => s.name);
  const by = new Map();
  for (const p of packages || []) {
    const key = p.sector || 'Other';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(p);
  }
  const order = [...names.filter((n) => by.has(n)), ...[...by.keys()].filter((k) => !names.includes(k) && k !== 'Other'), ...(by.has('Other') ? ['Other'] : [])];
  return order.map((name) => ({ name, packages: by.get(name) }));
}

/** A discount's grey line: "All packages", or the packages' names ("Leadership Accelerator and Partnership" style). */
export function discountFor(d, packages = []) {
  if (d.all_packages !== false) return 'All packages';
  const names = (d.package_ids || []).map((id) => (packages || []).find((p) => p.id === id)?.name).filter(Boolean);
  if (!names.length) return 'No packages yet';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** "15% off", "£500 off". */
export const discountWords = (d) => (d.percent != null ? `${Number(d.percent)}% off` : `${moneyWords(Number(d.amount_minor))} off`);
