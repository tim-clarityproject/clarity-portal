import { moneyWords as minorWords, rateWords as minorRateWords } from '../billing/money.js';
import { associateMonth, clientsPaid, statementLines } from '../finance/associates.js';
import { incomeLines } from '../finance/income.js';
import { monthDays, monthKey, monthName } from '../finance/year.js';
import { hoursWords, poundsWords } from '../finance/words.js';
import { isOpenLead, isWonLead, leadValue, moneyWords, pipelineTotals, rateWords, stagesInOrder, stageTotals } from './crm.js';
import { addDays, dayWords, firstName, possessive } from './model.js';

// The people side of the money (Phase 6b run 2, steps 3 and 5; M11 C10 to C13): an associate's hours and pay in
// Settings, Coaches and on their own Today, the monthly statement (its panel and its PDF), Clients' Renewals tab and
// Leads' reports. Plain functions over the rows the coach portal already holds; every sum underneath is
// src/lib/finance's. Checked by tests/performance/associate-pay-screens.test.mjs.

const num = (v) => (v == null || v === '' ? null : Number(v));
const sameMonth = (a, b) => monthKey(String(a || '').slice(0, 7)) === monthKey(String(b || '').slice(0, 7));

/** An hourly rate as coaches.hourly_rate holds it (pounds, 2 places) in pence; null when not set. */
export function rateMinorOf(coachRow) {
  const r = num(coachRow?.hourly_rate);
  return r != null && Number.isFinite(r) && r >= 0 ? Math.round(r * 100) : null;
}

/** "22", "22.5", "0": a figure of hours with no unit (M11 draws "Coaching hours in November" "22"). */
export function hoursFigure(minutes) {
  const h = Math.round((Math.max(0, Number(minutes) || 0) / 60) * 100) / 100;
  return h.toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/** A saved statement (062's associate_statements) in the shape associateMonth gives. */
export function fromStatement(row) {
  const minutes = Math.round((Number(row.hours) || 0) * 60);
  const rateMinor = Number(row.rate_minor) || 0;
  return {
    month: monthKey(String(row.month).slice(0, 7)),
    minutes,
    payMinor: Number(row.total_minor) || 0,
    hours: hoursWords(minutes),
    words: `${hoursWords(minutes)} at ${minorWords(rateMinor)}`,
    lateCancels: Number(row.late_cancel_minutes) > 0 ? 1 : 0,
    noShows: Number(row.no_show_minutes) > 0 ? 1 : 0,
  };
}

/**
 * An associate's month: from its saved statement when there is one, otherwise from their sessions (when the
 * device holds them), otherwise unknown.
 * @param {{ associateId: string, rateMinor: number|null, month: string, statements?: object[], sessions?: object[],
 *   noShowsPaid?: boolean, zone?: string, monthMinutes?: object|null, nowMs?: number }} a
 *   sessions: the associate's own (with their outcomes), or the owner's view of them (058: no outcome, so an ended one
 *   counts as held); nowMs: now, for that rule
 * @returns {{ from: 'statement'|'sessions'|null, delivered: object|null, statement: object|null, readyOn: string,
 *   paidOn: string|null, lines: { label: string, detail: string, value: string }[] }}
 */
export function associatePay({ associateId, rateMinor, month, statements = [], sessions = [], noShowsPaid = false, zone, monthMinutes = null, nowMs = 0 }) {
  const m = monthKey(month);
  const statement = (statements || []).find((s) => s && s.associate_id === associateId && sameMonth(s.month, m)) || null;
  const readyOn = statement?.ready_on ? String(statement.ready_on).slice(0, 10) : monthDays(m).last;
  const theirs = (sessions || []).filter((s) => s && s.coach_id === associateId);
  let delivered = null;
  let from = null;
  if (statement) {
    delivered = fromStatement(statement);
    from = 'statement';
  } else if (rateMinor != null && monthMinutes && monthMinutes.coach_id === associateId) {
    // The owner's view (062's associate_month_minutes): held and late-cancelled minutes count, no-shows only if paid.
    const minutes = (Number(monthMinutes.held_minutes) || 0) + (Number(monthMinutes.late_cancel_minutes) || 0) + (noShowsPaid ? Number(monthMinutes.no_show_minutes) || 0 : 0);
    delivered = fromStatement({ month: `${m}-01`, hours: minutes / 60, rate_minor: rateMinor, total_minor: Math.round((minutes * rateMinor) / 60),
      late_cancel_minutes: monthMinutes.late_cancel_minutes, no_show_minutes: noShowsPaid ? monthMinutes.no_show_minutes : 0 });
    from = 'minutes';
  } else if (rateMinor != null && theirs.length) {
    // A past session with no outcome yet counts as held until it's marked otherwise (062's rule, the forecast's).
    delivered = associateMonth({ coachId: associateId, rateMinor, sessions: theirs, month: m, zone, noShowsPaid, nowMs });
    from = 'sessions';
  }
  const savedLines = Array.isArray(statement?.lines) ? statement.lines.filter((l) => l && l.label) : [];
  const lines = delivered
    ? (savedLines.length ? savedLines.map((l) => ({ label: String(l.label), detail: String(l.detail || ''), value: String(l.value || '') }))
      : statementLines({ month: delivered, noShowsPaid: noShowsPaid || Boolean(statement && Number(statement.no_show_minutes) > 0) })
        .map(({ label, detail, value }) => ({ label, detail, value })))
    : [];
  return { from, delivered, statement, readyOn, paidOn: statement?.paid_on ? String(statement.paid_on).slice(0, 10) : null, lines };
}

/** What an associate's clients paid in a month, in pence (payments in pounds at the landed rate). */
export function theirClientsPaid({ payments = [], invoices = [], profileIds = [], month, zone }) {
  let lines = [];
  try {
    lines = incomeLines({ payments: (payments || []).filter((p) => p && p.paid_at), invoices, zone });
  } catch {
    lines = [];
  }
  return clientsPaid({ lines, profileIds, months: [monthKey(month)] });
}

/** The words of an associate's section and statement (M11 C12 and C13), for one month. */
export function payWords({ name, month, readyOn }) {
  const first = firstName(name) || name || 'They';
  const ready = dayWords(readyOn, readyOn);
  return {
    statementRow: `${monthName(month)}, ready on ${ready}`,
    panelTitle: `${possessive(first)} ${monthName(month)} statement`,
    panelNote: `${first} sees it in their portal on ${ready}. You pay them outside the portal.`,
  };
}

// ---------------------------------------------------------------- the statement as a PDF

const longDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/**
 * The monthly statement's facts for its PDF (src/lib/pdf/docs/associateStatement.js): the associate's own hours and
 * pay, never a business figure.
 */
export function statementFacts({ name, month, pay, rateMinor }) {
  const m = monthKey(month);
  const year = m.slice(0, 4);
  return {
    name: String(name || '').trim(),
    monthWords: `${monthName(m)} ${year}`,
    readyOn: longDay(pay.readyOn),
    paidOn: pay.paidOn ? longDay(pay.paidOn) : null,
    hours: pay.delivered ? hoursWords(pay.delivered.minutes) : '0 hours',
    pay: pay.delivered ? minorWords(pay.delivered.payMinor) : minorWords(0),
    rate: rateMinor != null ? minorRateWords(rateMinor, 'hour') : (pay.statement ? minorRateWords(Number(pay.statement.rate_minor) || 0, 'hour') : ''),
    lines: pay.lines,
  };
}

// ---------------------------------------------------------------- Clients: Renewals (owner)

export const RENEWALS_DAYS = 90;
export const RENEWALS_NOTE = 'Each one offers a renewal proposal for you to edit. Clients aren’t told until you send it.';

const inWindow = (day, today, days) => Boolean(day) && day >= today && day <= addDays(today, days);
/** A signed version's price in pence of pounds: a dollar one at its own fixed rate (dollars to the pound). */
const versionPounds = (v) => {
  const total = num(v?.total_minor);
  if (total == null) return null;
  if (!v.currency || v.currency === 'GBP') return total;
  const r = num(v.fx_rate);
  return r > 0 ? Math.round(total / r) : null;
};

/**
 * Renewals in the next 90 days and Repeating income (M11 C11), owner only.
 * - A client whose engagement ends in the window (every coach's: the owner's admin list), with the price of their
 *   current signed agreement when the owner can read it (the owner's own clients). Another coach's client reads
 *   "Maya’s client".
 * - An organisation's agreement (052's organisation_deals, active, one-off) that renews in the window, with its value.
 *   A client whose organisation renews on the same day is shown once, as the organisation.
 * - Repeating income: organisations' active deals priced a month or a year.
 * @returns {{ rows: object[], totalMinor: number, totalWords: string, repeating: object[] }}
 */
export function renewals({ today, admin = [], coachId, engagements = [], agreements = [], versions = [], orgDeals = [], organisations = [], days = RENEWALS_DAYS }) {
  const orgName = new Map((organisations || []).map((o) => [o.id, o.name]));
  const orgRows = (orgDeals || [])
    .filter((d) => d && (d.kind ?? 'agreement') === 'agreement' && d.status === 'active' && (d.per ?? 'once') === 'once' && inWindow(d.renews_on, today, days))
    .map((d) => ({
      key: `org:${d.id}`, kind: 'organisation', id: d.organisation_id, title: orgName.get(d.organisation_id) || d.name, facts: [d.name],
      endsOn: d.renews_on, value: moneyWords(d.value, d.currency || 'GBP'), poundsMinor: (d.currency || 'GBP') === 'GBP' && num(d.value) != null ? Math.round(Number(d.value) * 100) : null,
    }));
  const orgDays = new Set(orgRows.map((r) => `${r.id}#${r.endsOn}`));

  const current = new Map();
  const byAgreement = new Map((agreements || []).map((a) => [a.id, a]));
  for (const v of versions || []) {
    const a = byAgreement.get(v.agreement_id);
    if (!a || a.kind === 'sponsor' || !a.profile_id || v.status !== 'signed') continue;
    const seen = current.get(a.profile_id);
    if (!seen || String(v.client_signed_at || '') > String(seen.client_signed_at || '')) current.set(a.profile_id, v);
  }
  const named = new Map((engagements || []).filter((e) => e.profile_id).map((e) => [`${e.profile_id}#${e.ends_on}`, e.name]));

  const people = (admin || [])
    .filter((a) => a && a.status !== 'past' && inWindow(a.ends_on, today, days) && !orgDays.has(`${a.organisation_id}#${a.ends_on}`))
    .map((a) => {
      const mine = a.coach_id === coachId;
      const v = mine ? current.get(a.profile_id) : null;
      const pounds = versionPounds(v);
      const what = mine ? (named.get(`${a.profile_id}#${a.ends_on}`) || v?.terms?.coaching || null) : `${possessive(a.coach_first_name || 'Another coach')} client`;
      return {
        key: `client:${a.profile_id}`, kind: 'client', id: a.profile_id, mine, coachName: a.coach_first_name || '', title: a.name, facts: [what].filter(Boolean),
        endsOn: a.ends_on, value: v?.total_minor != null ? (v.currency && v.currency !== 'GBP' ? minorWords(Number(v.total_minor), v.currency) : poundsWords(Number(v.total_minor))) : '',
        poundsMinor: pounds,
      };
    });

  const rows = [...people, ...orgRows]
    .sort((x, y) => (x.endsOn < y.endsOn ? -1 : x.endsOn > y.endsOn ? 1 : x.title.localeCompare(y.title)))
    .map((r) => ({ ...r, ends: `Ends ${dayWords(r.endsOn, r.endsOn)}` }));
  const totalMinor = rows.reduce((n, r) => n + (r.poundsMinor || 0), 0);

  const repeating = (orgDeals || [])
    .filter((d) => d && d.status === 'active' && ['month', 'year'].includes(d.per) && num(d.value) > 0)
    .map((d) => ({ key: `rep:${d.id}`, id: d.organisation_id, title: d.name, facts: [orgName.get(d.organisation_id)].filter(Boolean), value: rateWords(d.value, d.per, d.currency || 'GBP') }))
    .sort((x, y) => x.title.localeCompare(y.title));

  return { rows, totalMinor, totalWords: totalMinor > 0 ? poundsWords(totalMinor) : '', repeating };
}

/**
 * Overview's Coming in row for the same renewals (M11 C4: "3 engagements" "£27,120"), so the Overview's count and the
 * Renewals tab always agree: one count, a thousands comma, and the amount (£0 when none is priced yet).
 */
export function renewalsLine(data) {
  const n = data?.rows?.length || 0;
  return { count: n, facts: [n === 1 ? '1 engagement' : `${n.toLocaleString('en-GB')} engagements`], figure: poundsWords(data?.totalMinor || 0) };
}

// ---------------------------------------------------------------- Leads: reports (owner)

export const REPORT_PERIOD = 'Last 12 months';
export const REPORT_LIKELY_NOTE = 'Likely counts each deal at its stage’s chance of winning, which you set in Edit stages.';
const SOURCE_NAMES = {
  referral: 'Referrals', chemistry_page: 'Chemistry Calls', connection_page: 'Connection Calls', booking_page: 'Booking pages', single_use_link: 'Booking links',
  manual: 'Added by you', import: 'A spreadsheet', email: 'Email', network: 'Network', other: 'Somewhere else',
};
const dayOf = (at) => String(at || '').slice(0, 10);
const utcDay = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / 86400000);
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Lead reports (M11 C10): the pipeline and what's likely (each open lead at its stage's chance), the win rate and the
 * time to win over the last 12 months, each stage's value and count, where won work came from, and referrers.
 * Values are in pounds, as coach_leads.value holds them.
 */
export function leadReport({ leads = [], stages = [], today }) {
  const since = addDays(today, -365);
  const real = (leads || []).filter((l) => l && !l.merged_into);
  const totals = pipelineTotals(stages, real);
  const wonIn = real.filter((l) => isWonLead(l, stages) && l.won_at && dayOf(l.won_at) >= since && dayOf(l.won_at) <= today);
  const coldIn = real.filter((l) => l.cold_at && dayOf(l.cold_at) >= since && dayOf(l.cold_at) <= today);
  const decided = wonIn.length + coldIn.length;
  const winRate = decided ? Math.round((wonIn.length * 100) / decided) : null;
  const waits = wonIn.filter((l) => l.created_at).map((l) => Math.max(0, daysBetween(dayOf(l.created_at), dayOf(l.won_at))));
  const timeToWin = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;

  const byStage = stageTotals(stages, real).filter((r) => !r.stage.is_won).map((r) => ({
    key: r.stage.id, name: r.stage.name, count: r.count, value: r.value, valueWords: moneyWords(r.value) || moneyWords(0),
    share: totals.value > 0 ? r.value / totals.value : 0,
  }));

  const sourceCounts = new Map();
  for (const l of wonIn) {
    const referred = Boolean(String(l.referred_by || '').trim() || l.referred_by_person);
    const key = referred ? 'referral' : (SOURCE_NAMES[l.source] ? l.source : 'other');
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }
  const sources = [...sourceCounts.entries()].map(([key, n]) => ({ key, name: SOURCE_NAMES[key], won: n, words: `${n} won`, share: wonIn.length ? n / wonIn.length : 0 }))
    .sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));

  const refs = new Map();
  for (const l of real) {
    const name = String(l.referred_by || '').trim();
    if (!name || !l.created_at || dayOf(l.created_at) < since) continue;
    const key = l.referred_by_person || name.toLowerCase();
    const r = refs.get(key) || { key, name, personId: l.referred_by_person || null, introductions: 0, won: 0, value: 0 };
    r.introductions += 1;
    if (isWonLead(l, stages)) { r.won += 1; r.value += leadValue(l); }
    refs.set(key, r);
  }
  const referrers = [...refs.values()].map((r) => ({
    ...r,
    line: r.introductions === 1 ? (r.won ? '1 introduction, won' : '1 introduction') : `${count(r.introductions, 'introduction', 'introductions')}${r.won ? `, ${r.won} won` : ''}`,
    right: r.won && r.value ? moneyWords(r.value) : (r.won ? '' : 'Thank them'),
  })).sort((a, b) => b.value - a.value || b.introductions - a.introductions || a.name.localeCompare(b.name));

  return {
    pipeline: moneyWords(totals.value) || moneyWords(0),
    likely: moneyWords(totals.likely) || moneyWords(0),
    winRate: winRate == null ? null : `${winRate}%`,
    timeToWin: timeToWin == null ? null : (timeToWin === 1 ? '1 day' : `${timeToWin} days`),
    byStage,
    sources,
    referrers,
    open: real.filter(isOpenLead).length,
    stagesShown: stagesInOrder(stages).length,
  };
}
