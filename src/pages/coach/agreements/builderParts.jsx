import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AddButton, Button, Dropdown, InlineChoice, SaveStatus, SwitchRow, TextField } from '../../../components/design';
import { newId, rowNow, rowSent, rowsOf, saveRow } from '../../../lib/coach/store';
import { guardRows, noteVersions, unguardRows } from '../../../lib/syncQueue';
import { supabase } from '../../../lib/supabase';
import { CURRENCY, CURRENCY_LIST, moneyText, parseMoney, toMajor, toMinor } from '../../../lib/agreements/currency';
import MistakeLine from '../../../components/agreements/MistakeLine';
import { SESSION_LENGTHS } from '../../../lib/agreements/terms';
import { draftTracker, packageRow, partyOf, rateOf, standardsFor, versionFields } from '../../../lib/coach/agreementBuilder';
import { useCoachPortal } from '../parts';
import './builder.css';

// The builder's shared parts (Phase 6b run 3, Group B; M28 s-builder and the four other builders, s-check, s-sign):
// the draft as a page reads and saves it (device first, through the coach store), today's rates, and the small form
// parts M28 draws (a money box, a currency drop-down, the blocks of coaching sessions, a small form opened by an add
// row, a list row). Every figure and line comes from src/lib/agreements through src/lib/coach/agreementBuilder.js.

export const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
export const CURRENCY_OPTIONS = CURRENCY_LIST.map((c) => ({ value: c, label: `${CURRENCY[c].name.replace(/^./, (x) => x.toUpperCase())}, ${c}` }));
export const LENGTH_OPTIONS = SESSION_LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` }));

// ---------------------------------------------------------------- today's rates

let ratesCache = null;
let ratesAsking = null;
/** coach_fx_rates() (065: { day, rates: { EUR: units per £1 } }), asked once a visit. Null while it can't be read. */
export function useRates(on = true) {
  const [rates, setRates] = useState(ratesCache);
  useEffect(() => {
    if (!on || ratesCache) return undefined;
    let live = true;
    if (!ratesAsking) {
      ratesAsking = supabase.rpc('coach_fx_rates').then(({ data, error }) => {
        if (!error && data && typeof data === 'object') ratesCache = data;
        return ratesCache;
      }).catch(() => null).finally(() => { ratesAsking = null; });
    }
    ratesAsking.then((r) => { if (live && r) setRates(r); });
    return () => { live = false; };
  }, [on]);
  return rates;
}

// ---------------------------------------------------------------- the draft

/**
 * An agreement and the version being built, as the store holds them, with what the pages need around them: who it is
 * with, the coach's standard wording for its kind, the extras list, the package it came from and today's rate.
 * `save(terms, extra)` keeps the version on the device at once and sends it (the store queues it offline).
 */
export function useAgreementDraft(agreementId) {
  const portal = useCoachPortal();
  const { userId, coach, state, clients = [], organisations = [], agreements = [], agreementVersions = [], partial } = portal;
  const agreement = agreements.find((a) => a.id === agreementId) || null;
  const versions = useMemo(() => agreementVersions.filter((v) => v.agreement_id === agreementId).sort((a, b) => b.version - a.version), [agreementVersions, agreementId]);
  const draft = versions.find((v) => v.status === 'draft') || null;
  const party = useMemo(() => partyOf({ agreement, clients, organisations }), [agreement, clients, organisations]);
  const standardRows = rowsOf(state, 'agreement_clause_standards');
  const kind = draft?.terms?.kind || agreement?.agreement_kind || 'sessions';
  const standards = useMemo(() => standardsFor(standardRows, kind), [standardRows, kind]);
  const pkg = agreement?.package_id ? rowsOf(state, 'pricing_packages').find((p) => p.id === agreement.package_id) || null : null;
  // Today's rates are read with the draft, so choosing a currency knows its rate at once (F4).
  const rates = useRates(Boolean(draft));
  const [status, setStatus] = useState('saved');
  const timer = useRef(null);
  const pending = useRef(null);
  const chain = useRef(Promise.resolve('saved'));
  const lastError = useRef(null);
  // What this page holds or has sent (draftPrint), so a copy of the draft from elsewhere is told apart from the echo of
  // its own saves (F3: two tabs or two devices).
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = draftTracker();
  // The first copy seen is this page's own, registered as it draws: before the questions' first save, and before the
  // database answers the save that made the draft (that answer is this page's too, never another window's).
  tracker.current.first(draft);
  const [elsewhere, setElsewhere] = useState(0);

  const rate = rateOf(rates, draft?.terms?.currency || 'GBP');
  const packageGbpMinor = pkg && (pkg.currency || 'GBP') === 'GBP' ? (party.funded || draft?.terms?.funder === 'org' ? pkg.org_price_minor : pkg.personal_price_minor) ?? null : null;

  // F3: while it is open, the draft's saves go "only if unchanged" since the version this page last saw in the database
  // (syncQueue's guarded rows and version book, as the inside Health Check's): a stale tab's or device's save is refused
  // and the device takes the database's copy, never the other way round.
  const draftId = draft?.id || null;
  useEffect(() => {
    if (!draftId) return undefined;
    const rows = [{ id: draftId }];
    guardRows('agreement_versions', rows);
    return () => unguardRows('agreement_versions', rows);
  }, [draftId]);
  useEffect(() => {
    if (!draft) return;
    const sent = rowSent(userId, 'agreement_versions', { id: draft.id });
    const note = () => { if (sent && draft.updated_at) noteVersions('agreement_versions', [{ id: draft.id, updated_at: draft.updated_at }]); };
    const what = tracker.current.see(draft, { sent, pending: pending.current?.version || null });
    if (what === 'mine') {
      note();
      return;
    }
    // Another tab's unsent copy waits until the database has it; then it is the newer one, and this page takes it.
    if (what === 'wait') return;
    clearTimeout(timer.current);
    pending.current = null;
    note();
    setStatus('saved');
    setElsewhere((n) => n + 1);
  }, [draft, userId]);

  const flushNow = useCallback(async () => {
    const next = pending.current;
    if (!next) return 'saved';
    pending.current = null;
    clearTimeout(timer.current);
    setStatus('saving');
    try {
      const answer = await saveRow(userId, 'agreement_versions', next.version);
      if (answer === 'superseded') { setStatus('saved'); return 'superseded'; }
      // The database's own copy of this save (as its guards stored it) is this page's too.
      if (answer === 'saved' && rowSent(userId, 'agreement_versions', { id: next.version.id })) tracker.current.saved(rowNow(userId, 'agreement_versions', { id: next.version.id }));
      if (next.agreement) await saveRow(userId, 'agreements', next.agreement);
      lastError.current = null;
      setStatus(answer === 'queued' ? 'offline' : 'saved');
      return answer;
    } catch (error) {
      lastError.current = error;
      setStatus('failed');
      return 'failed';
    }
  }, [userId]);
  // One save at a time, in order, so each is based on the one before it.
  const flush = useCallback(() => {
    chain.current = chain.current.then(flushNow, flushNow);
    return chain.current;
  }, [flushNow]);
  useEffect(() => () => { flush(); }, [flush]);

  /** Saves the version with these terms (and edits), a moment after the last change. */
  const save = useCallback((terms, { overrides, personalNote, agreementChange, fields: more = null, now = false } = {}) => {
    if (!draft) return Promise.resolve('failed');
    const base = pending.current?.version || draft;
    const fields = versionFields(terms, { standards, overrides: overrides ?? base.overrides ?? {}, rate: rateOf(rates, terms.currency || 'GBP') });
    const version = { ...base, ...fields, ...(personalNote !== undefined ? { personal_note: personalNote } : {}), ...(more || {}) };
    const agr = agreementChange || terms.kind !== agreement?.agreement_kind ? { ...(pending.current?.agreement || agreement), agreement_kind: terms.kind, ...(agreementChange || {}) } : pending.current?.agreement || null;
    pending.current = { version, agreement: agr };
    tracker.current.sending(version);
    setStatus('saving');
    clearTimeout(timer.current);
    if (now) return flush();
    timer.current = setTimeout(flush, 500);
    return Promise.resolve('saving');
  }, [draft, standards, rates, agreement, flush]);

  return {
    portal, userId, coach, agreement, versions, draft, party, standards, standardRows, pkg, rates, rate, packageGbpMinor,
    status, save, flush, loading: Boolean(partial) && !agreement, newId, elsewhere, lastError: () => lastError.current,
    packageLine: pkg ? packageRow(pkg, { funded: party.funded }) : null,
  };
}

// ---------------------------------------------------------------- small form parts

/** The meta line's save state (M28's mint "Saved"). */
export const Saved = ({ status }) => (status === 'idle' ? null : <SaveStatus key="status" state={status} />);

/**
 * A money box (M28's data-money input): shows "£18,000" until it is typed in, then the plain figure. `value` and
 * `onChange` are minor units of `currency`.
 */
export function MoneyField({ label, value, currency = 'GBP', onChange, id }) {
  const [typing, setTyping] = useState(null);
  const shown = typing ?? (value != null && Number(value) > 0 ? moneyText(Number(value), currency) : '');
  return (
    <TextField
      id={id}
      label={label}
      inputMode="decimal"
      value={shown}
      onFocus={() => setTyping(value != null && Number(value) > 0 ? String(toMajor(Number(value), currency)) : '')}
      onBlur={() => setTyping(null)}
      onChange={(e) => {
        const raw = e.target.value;
        setTyping(raw);
        const n = parseFloat(raw.replace(/[^\d.]/g, ''));
        onChange(Number.isFinite(n) ? toMinor(n, currency) : 0);
      }}
    />
  );
}

/** A whole-number box (days, coaching sessions, a percentage). */
export function NumberBox({ label, ariaLabel, value, onChange, id }) {
  return (
    <TextField
      id={id}
      label={label}
      aria-label={label ? undefined : ariaLabel}
      inputMode="numeric"
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const n = parseInt(e.target.value.replace(/[^\d]/g, ''), 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

/** Two boxes side by side (M28's .two), one under the other on a phone. */
export const Two = ({ children }) => <div className="ab-two">{children}</div>;
/** A grey line under a part (M28's .hint). */
export const Hint = ({ children }) => (children ? <p className="ab-hint">{children}</p> : null);
/** A section heading inside the form (M28's .sec h4), with an id the tabs row jumps to. */
export const Sec = ({ id, children }) => <div className="ab-sec" id={id}><h2 className="ab-sec-title">{children}</h2></div>;
/** A small form opened by an add row (M28's .sub), indented with no side line (CLAUDE.md 4a). */
export const Sub = ({ children }) => <div className="ab-sub">{children}</div>;

/** "Which currency?" (M28's fifteen). */
export const CurrencyChoice = ({ value, onChange }) => <Dropdown label="Which currency?" options={CURRENCY_OPTIONS} value={value || 'GBP'} onChange={onChange} />;

/** A row of the M28 lists (.lr): a title, one quiet line, and something at the right; a button when it opens something. */
export function ListRow({ title, line, aside, onClick, label, still = false }) {
  const inner = (
    <>
      <span className="ab-row-words"><b>{title}</b>{line && <small>{line}</small>}</span>
      {aside != null && <span className="ab-row-aside">{aside}</span>}
    </>
  );
  if (still || !onClick) return <div className="ab-row ab-row--still">{inner}</div>;
  return <button type="button" className="ab-row" onClick={onClick} aria-label={label}>{inner}</button>;
}

/** The blocks of coaching sessions (M28's blocks render): a count × a length, Remove while there are two or more. */
export function Blocks({ blocks = [], onSet, onRemove, onAdd }) {
  return (
    <div className="ab-field">
      <p className="ab-label" id="ab-blocks-label">How many coaching sessions, and how long?</p>
      <div role="group" aria-labelledby="ab-blocks-label">
        {blocks.map((b, i) => (
          // The block's position is its identity: a block has no id of its own.
          <div key={i} className="ab-blk">
            <NumberBox ariaLabel="How many coaching sessions" value={b.n} onChange={(n) => onSet(i, { n })} />
            <span className="ab-times" aria-hidden="true">×</span>
            <Dropdown label="How long?" options={LENGTH_OPTIONS} value={String(b.minutes)} onChange={(v) => onSet(i, { minutes: Number(v) })} />
            {blocks.length > 1 && <Button variant="text" className="ab-rm" onClick={() => onRemove(i)} aria-label={`Remove ${b.n} of ${b.minutes} minutes`}>Remove</Button>}
          </div>
        ))}
      </div>
      <AddButton onClick={onAdd}>Add coaching sessions</AddButton>
    </div>
  );
}

/** A switch with its line (the shared SwitchRow). */
export const Switch = ({ label, note, checked, onChange }) => <SwitchRow label={label} note={note} checked={Boolean(checked)} onChange={onChange} />;
/** A choice of a few (the shared gliding switch, or rows when the words are long). */
export const Pick = ({ label, options, value, onChange }) => <InlineChoice label={label} options={options} value={value} onChange={onChange} semantics="radio" />;

/** A list of lines with a Remove at the right (discounts, extras offered, the people in a programme). */
export function RemoveRows({ rows, empty, onRemove }) {
  if (!rows.length) return empty ? <p className="ab-empty">{empty}</p> : null;
  return (
    <div className="ab-lines">
      {rows.map((r) => (
        <div key={r.key} className="ab-line">
          <span className="ab-row-words"><b>{r.title}</b>{r.line && <small>{r.line}</small>}</span>
          <span className="ab-line-end">
            {r.amount && <span className="ab-amount">{r.amount}</span>}
            <Button variant="text" className="ab-rm" onClick={() => onRemove(r.key)} aria-label={`Remove ${r.title}`}>Remove</Button>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The live view's rows (M28's .kv in the aside): label over value. */
export function PointsList({ points = [], compact = false }) {
  return (
    <dl className={`ab-kv${compact ? ' ab-kv--compact' : ''}`}>
      {points.map((p) => (
        <div key={p.label}><dt>{p.label}</dt><dd>{p.value}</dd></div>
      ))}
    </dl>
  );
}

/** Whether the page is wide enough for the live view beside the form (≥ 1100px, the plan). */
export function useWide(px = 1100) {
  const q = `(min-width: ${px}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [q]);
  return wide;
}


// ---------------------------------------------------------------- the questionnaire's parts (Polish 1, Stage C)

/**
 * A money box in one currency (M28 version 6's .box.money): the symbol, then the figure. `value` and `onChange` are
 * minor units; the figure shows without its symbol while typed. What's typed is read by `parseMoney` (F2, P1): a figure
 * it can't read ("1e5", "-500", "2,50") is never kept as another figure; `onChange` isn't called and `onProblem` gets the
 * calm line (null once it reads again), for the page to show under the box when it is asked to move on. An empty box is
 * 0. Arabic-Indic digits read as the same figures. `problem`: the line shown under the box now (MistakeLine).
 */
export function MoneyBox({ label, value, currency = 'GBP', onChange, onProblem, onEnter, autoFocus = false, problem = null, words = 'pounds' }) {
  const [typing, setTyping] = useState(null);
  const shown = typing ?? (value != null && Number(value) > 0 ? String(toMajor(Number(value), currency)) : '');
  const symbol = CURRENCY[currency]?.symbol?.trim() || currency;
  const errId = useId();
  return (
    <>
      <div className="ds-field ab-money">
        <span className="ab-money-cur" aria-hidden="true">{symbol}</span>
        <input
          aria-label={label}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={shown}
          aria-invalid={problem ? 'true' : undefined}
          aria-describedby={problem ? errId : undefined}
          onFocus={() => setTyping(shown)}
          onBlur={() => {
            // A figure that was kept shows as kept; one that was refused stays as typed, so the line under it makes sense.
            const read = parseMoney(typing, currency, words);
            if (read.empty ? !(Number(value) > 0) : read.minor === Number(value)) setTyping(null);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); } }}
          onChange={(e) => {
            const raw = e.target.value.slice(0, 40);
            setTyping(raw);
            const read = parseMoney(raw, currency, words);
            if (read.problem) { onProblem?.(read.problem); return; }
            onProblem?.(null);
            onChange(read.empty ? 0 : read.minor);
          }}
        />
      </div>
      {problem && <div id={errId}><MistakeLine>{problem}</MistakeLine></div>}
    </>
  );
}

/** M28 version 6's answer line under a question ("Starting  Mon 4 Jan 2027"): a small label, the answer, a note. */
export function Answer({ label, value, note }) {
  return (
    <p className="ab-answer">
      <span className="ab-answer-l">{label}</span>
      <span className="ab-answer-v">{value}</span>
      {note && <span className="ab-answer-n">{note}</span>}
    </p>
  );
}

/**
 * A box to type a place or a currency, with what matches under it as rows to choose (M28 version 6's .tzres). Enter
 * takes the first. `find(q)` → [{ key, label, line }]; `onPick(item)`.
 */
export function FindBox({ label, placeholder, value, find, onPick, empty }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) setQ(value || ''); }, [value, open]);
  const hits = open && q.trim() && q.trim() !== value ? find(q) : [];
  const pick = (h) => { onPick(h); setQ(h.label); setOpen(false); };
  return (
    <div className="ab-find">
      <TextField
        label={label}
        className="ab-find-field"
        placeholder={placeholder}
        autoComplete="off"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); pick(hits[0]); } }}
      />
      {open && q.trim() && q.trim() !== value && (
        hits.length ? (
          <div className="ab-find-list" role="listbox" aria-label={label}>
            {hits.map((h) => (
              <button key={h.key} type="button" role="option" aria-selected="false" className="ab-find-row" onClick={() => pick(h)}>
                <span>{h.label}</span>{h.line && <small>{h.line}</small>}
              </button>
            ))}
          </div>
        ) : <p className="ab-hint">{empty}</p>
      )}
    </div>
  );
}

export { newId };
