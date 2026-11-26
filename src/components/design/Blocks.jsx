import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Chevron from './Chevron';
import { fromKey, toKey, MONTH_NAMES } from './dates';
import { useFocusMode } from './Frame';
import { pushLayer } from './layers';
import useIsPhone from './useIsPhone';
import './blocks.css';

// The 25 Nov design reference's blocks (design-reference-25nov.html "Blocks",
// "Controls", "Calendar"; example-pages-25nov.html; polish 1, rules 1 to 21).
// Every page is built from these, so one change reaches every page. The full
// guide, with props and what a page may and mustn't change, is in the run's
// COMPONENTS.md.

/* ------------------------------------------------------------------ the page opening (rule 12) */

/**
 * Every page opens the same way: a small grey label where useful (the date,
 * "Week 8 of 26"), the Nekst title, one 16px grey line saying what the page
 * is for, its one main button if it has one, then the content.
 * `label`, `line`: words. `action`: the one main Button (variant "primary");
 * full width on a phone. `aside`: the page's eye beside the title.
 */
export function PageOpening({ label, title, line, action, aside, as: Heading = 'h1', className = '' }) {
  return (
    <header className={`ds-open ${className}`.trim()}>
      {label && <div className="ds-open-label">{label}</div>}
      <Heading className="ds-page-title ds-open-title">{title}{aside ? <span className="ds-page-aside ds-open-aside">{aside}</span> : null}</Heading>
      {line && <p className="ds-open-line">{line}</p>}
      {action && <div className="ds-open-act">{action}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ the card (rule 13) */

/**
 * One card: the box radius, a 1px line, no shadow; padding 24px (20px on a
 * phone); its label exactly the padding from the top and the left, with any
 * "View all" (`link`) or "+ Add" (`add`) on its right not moving it; no line
 * between the label and the first row; rows 14px above and below with
 * hairlines between; the last row ends the padding from the bottom.
 * `label`: the card's section label (DM Sans 13px spaced grey capitals).
 * `link`: { children, href?, onClick } a quiet link with the chevron.
 * `add`: an <AddLink /> (or its props), opening Quick Add.
 * `quickAdd`: a <QuickAdd /> placed under the label on a laptop.
 * `aside`: something small beside the label, outside its heading (the eye).
 */
export function Card({ label, link, add, aside, quickAdd, children, className = '', as: Tag = 'section', labelAs: Label = 'h2', ...rest }) {
  return (
    <Tag className={`ds-card ${className}`.trim()} {...rest}>
      {(label || link || add) && <CardHead label={label} link={link} add={add} aside={aside} as={Label} />}
      {quickAdd}
      {children}
    </Tag>
  );
}

/**
 * The card's label row: the label on the left, View all or + Add on the
 * right. `aside`: a small thing beside the label, outside its heading (the
 * eye on an organisation's Documents), so no button sits inside the h2.
 */
export function CardHead({ label, link, add, aside, as: Label = 'h2' }) {
  const addNode = add && !add.$$typeof && typeof add === 'object' ? <AddLink {...add} /> : add;
  const labelNode = label ? <Label className="ds-label">{label}</Label> : <span />;
  return (
    <div className="ds-card-head">
      {aside ? <span className="ds-card-head-l">{labelNode}{aside}</span> : labelNode}
      {link && <MoreLink {...link} small />}
      {addNode}
    </div>
  );
}

/** A section label outside a card: DM Sans 13px spaced capitals in grey. */
export function Label({ children, as: Tag = 'h2', className = '' }) {
  return <Tag className={`ds-label ${className}`.trim()}>{children}</Tag>;
}

/**
 * A quiet link that opens more, with the reference's chevron (it replaces
 * "→"). `small`: 13px grey, as "View all" beside a card's label. `bare`:
 * words only, for a link centred under a full-width button (rule 11).
 */
export function MoreLink({ children, href, onClick, small = false, bare = false, back = false, className = '', ...rest }) {
  const Tag = href ? 'a' : 'button';
  const inner = (
    <>
      {back && !bare && <Chevron direction="left" className="ds-more-back" />}
      <span>{children}</span>
      {/* Centred on the words' x-height (5e rule 29ao), not on the line box. */}
      {!back && !bare && <Chevron direction="right" beside="words" />}
    </>
  );
  return (
    <Tag
      className={`ds-more${small ? ' ds-more--small' : ''}${bare ? ' ds-more--bare' : ''} ${className}`.trim()}
      href={href}
      type={href ? undefined : 'button'}
      onClick={onClick}
      {...rest}
    >
      {inner}
    </Tag>
  );
}

/* ------------------------------------------------------------------ list rows (rule 14) */

/**
 * A list row: the name on the left, the date or value on the right in grey on
 * a laptop; on a phone the value sits under the name in small grey. Status in
 * words; at most a small dot (`dot`). `onClick` or `href` makes the whole row
 * open its item. `strong`: the name at 500 (a row's name, rule 1).
 */
export function Row({ name, value, sub, dot = false, onClick, href, strong = false, className = '', label, children }) {
  const Tag = href ? 'a' : onClick ? 'button' : 'div';
  // `label`: what a screen reader hears for a row that opens something ("Edit Portal seats"; requests-b4 7).
  return (
    <Tag className={`ds-li${onClick || href ? ' ds-li--go' : ''} ${className}`.trim()} href={href} onClick={onClick} type={Tag === 'button' ? 'button' : undefined} aria-label={label}>
      <span className={`ds-li-name${strong ? ' ds-li-name--strong' : ''}`}>
        {name}
        {sub && <small className="ds-li-sub">{sub}</small>}
      </span>
      {(value || dot) && (
        <span className="ds-li-value">
          {dot && <span className="ds-dot" aria-hidden="true" />}
          {value}
        </span>
      )}
      {children}
    </Tag>
  );
}

/** Rows in a list; inside a Card the first row has no line above it. */
export function Rows({ children, className = '', label }) {
  return <div className={`ds-rows-list ${className}`.trim()} role={label ? 'list' : undefined} aria-label={label}>{children}</div>;
}

/* ------------------------------------------------------------------ figures and empty states (rules 1, 16) */

/** A figure that says nothing yet: empty, or a bare 0, 0% or £0 (rule 16). */
export function bareFigure(value) {
  if (value == null) return true;
  return /^[£$€]?\s*0+(?:[.,]0+)?\s*%?$/.test(String(value).trim()) || String(value).trim() === '';
}

/**
 * A headline figure: DM Sans 24px light, the unit 16px grey ("£172k of
 * £250k", "72%"). `empty`: the sentence shown instead while there is
 * nothing to count, never a bare 0, 0% or £0 (rule 16; walk item 9):
 * "Nothing settled yet this month.", "Your score starts with your first log."
 */
export function Figure({ value, unit, empty, className = '' }) {
  if (empty && bareFigure(value)) return <p className={`ds-fig-empty ${className}`.trim()}>{empty}</p>;
  return (
    <div className={`ds-fig ${className}`.trim()}>
      {value}
      {unit && <span className="ds-fig-unit">{unit.startsWith('%') || unit.startsWith('/') ? unit : ` ${unit}`}</span>}
    </div>
  );
}

/**
 * Every empty state is a sentence and a next step, never a blank chart or a
 * bare 0. `children`: the sentence (what will appear here). `action`: the one
 * thing to do now, as a MoreLink's props or a node.
 */
export function Empty({ children, action, className = '' }) {
  const act = action && !action.$$typeof && typeof action === 'object' ? <MoreLink {...action} /> : action;
  return (
    <div className={`ds-empty-note ${className}`.trim()}>
      <p>{children}</p>
      {act}
    </div>
  );
}

/* ------------------------------------------------------------------ adding: "+ Add" and Quick Add (rule 10) */

/**
 * "+ Add": at the right of a list's label, 13px grey like "View all", a 10px
 * plus then the underlined word. `label` is what a screen reader hears
 * ("Add to-do"); the words shown stay "Add" unless `children` says more.
 */
export function AddLink({ children = 'Add', label, onClick, expanded, controls, className = '' }) {
  return (
    <button
      type="button"
      className={`ds-addrow ds-addlink ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded === undefined ? undefined : Boolean(expanded)}
      aria-controls={controls}
    >
      <span className="ds-addrow-mark" aria-hidden="true" />
      <span className="ds-addrow-words">{children}</span>
    </button>
  );
}

/**
 * Quick Add (after Todoist): on a phone a panel rising from the bottom with
 * the keyboard up; on a laptop a small box under the label. Just the name box
 * at first; the next options (`more`, such as Today and How long?) appear once
 * something is typed, then Add and Cancel. Enter adds, Escape closes.
 * `onAdd(name)` may return a promise; the box empties and closes once it's
 * done (keep it open for another with `stayOpen`). Where adding needs a
 * longer form, pass it as `children`: it shows in place of the name box.
 * `more` may be a function of what's typed, `(name) => node`, to carry the
 * name on (B4: "Add their details too").
 */
export function QuickAdd({ open, onClose, onAdd, placeholder = 'What do you need to do?', label, more, addLabel = 'Add', stayOpen = false, children, id }) {
  const phone = useIsPhone();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const autoId = useId();
  const boxId = id || `qa-${autoId}`;
  useEffect(() => {
    if (!open) { setName(''); return undefined; }
    const remove = pushLayer(() => onClose?.());
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: !phone }), 60);
    return () => { clearTimeout(t); remove(); };
  }, [open, onClose, phone]);
  if (!open) return null;
  const add = async () => {
    const v = name.trim();
    if (children) { await onAdd?.(); return; }
    if (!v) { inputRef.current?.focus(); return; }
    setBusy(true);
    try {
      await onAdd?.(v);
      setName('');
      if (!stayOpen) onClose?.();
      else inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  const body = (
    <div className={`ds-qa${phone ? ' ds-qa--sheet' : ''}`} id={boxId} role={phone ? 'dialog' : 'group'} aria-modal={phone ? 'true' : undefined} aria-label={label || placeholder}>
      {phone && <div className="ds-qa-grab" aria-hidden="true" />}
      {children || (
        <input
          ref={inputRef}
          className="ds-qa-box"
          value={name}
          placeholder={placeholder}
          aria-label={label || placeholder}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
          }}
        />
      )}
      {more && (children || name.trim()) && <div className="ds-qa-more">{typeof more === 'function' ? more(name.trim()) : more}</div>}
      <div className="ds-qa-acts">
        <button type="button" className="ds-btn ds-btn--primary" onClick={add} disabled={busy}>{addLabel}</button>
        <button type="button" className="ds-more ds-more--bare" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
  if (!phone) return body;
  return createPortal(
    <div className="ui-root ds-portal">
      <div className="ds-qa-scrim" onClick={onClose} aria-hidden="true" />
      {body}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ controls: counter and number box (rule 5) */

/**
 * The counter: one box with the control radius, a minus, the figure and a
 * plus, 40px high (44px on a phone). `step` 0.5 shows halves ("7½").
 */
export function Counter({ value, onChange, step = 1, min = 0, max = Infinity, label, lessLabel, moreLabel, format }) {
  const show = format || ((v) => (v == null ? '' : step < 1 && v % 1 ? `${Math.floor(v)}½` : String(v)));
  const set = (v) => onChange?.(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <div className="ds-count" role="group" aria-label={label}>
      <button type="button" aria-label={lessLabel || `Less${label ? `: ${label}` : ''}`} onClick={() => set((value ?? 0) - step)} disabled={value != null && value <= min}>−</button>
      <span aria-live="polite">{show(value)}</span>
      <button type="button" aria-label={moreLabel || `More${label ? `: ${label}` : ''}`} onClick={() => set((value ?? 0) + step)} disabled={value != null && value >= max}>+</button>
    </div>
  );
}

/** A number box with its unit inside ("8400 steps"), 40px high (44px on a phone). */
export function NumberBox({ value, onChange, unit, label, inputMode = 'numeric', ...rest }) {
  return (
    <label className="ds-numbox">
      <input value={value ?? ''} inputMode={inputMode} aria-label={label} onChange={(e) => onChange?.(e.target.value)} {...rest} />
      {unit && <span>{unit}</span>}
    </label>
  );
}

/** A control row: a name (500) with a small grey line under it on the left, its control on the right (Log today). */
export function ControlRow({ name, sub, children, className = '' }) {
  return (
    <div className={`ds-ctlrow ${className}`.trim()}>
      <span className="ds-ctlrow-name">{name}{sub && <small>{sub}</small>}</span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs (My Account, Finances) */

/**
 * Underlined section tabs: one section at a time; on a phone they scroll
 * sideways in one line. `tabs`: [{ key, label }]. Arrow keys move between them.
 */
export function SectionTabs({ tabs, value, onChange, label = 'Sections', className = '' }) {
  const refs = useRef([]);
  const at = Math.max(0, tabs.findIndex((t) => t.key === value));
  const move = (n) => { const i = (n + tabs.length) % tabs.length; onChange?.(tabs[i].key); refs.current[i]?.focus(); };
  return (
    <div className={`ds-tabs ${className}`.trim()} role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.key}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="tab"
          aria-selected={t.key === value}
          tabIndex={i === at ? 0 : -1}
          className="ds-tab"
          onClick={() => onChange?.(t.key)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the calendar (rule 17) */

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The month's grid as day keys, Monday first, whole weeks (days outside the month included). */
export function monthDays(monthKey) {
  const first = fromKey(`${monthKey.slice(0, 7)}-01`);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const trail = 6 - ((last.getDay() + 6) % 7);
  const count = lead + last.getDate() + trail;
  return Array.from({ length: count }, (_, i) => toKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

/** "November 2026" for a month key ("2026-11" or a day in it). */
export function monthTitle(monthKey) {
  const d = fromKey(`${monthKey.slice(0, 7)}-01`);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Wednesday 25 November", the label over a chosen day's list. */
export function dayTitle(key) {
  const d = fromKey(key);
  return `${WEEKDAY_NAMES[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/**
 * Every calendar (the coach's, the client's, the booking page, date pickers):
 * a plain month grid; today a filled circle; the chosen day outlined; days
 * outside the month grey; a small dot 6px under the number on days with
 * something on (`hasItems(key)`); unavailable days faded (`available(key)`
 * false, the booking page). `onSelect(key)`.
 */
export function MonthGrid({ month, today, selected, onSelect, hasItems, available, label }) {
  const days = monthDays(month);
  const inMonth = month.slice(0, 7);
  return (
    <div className="ds-cal" role="grid" aria-label={label || monthTitle(month)}>
      <div className="ds-cal-row" role="row">
        {WEEKDAY_LETTERS.map((d, i) => <span key={WEEKDAY_NAMES[i]} className="ds-cal-h" role="columnheader" aria-label={WEEKDAY_NAMES[i]}>{d}</span>)}
      </div>
      {Array.from({ length: days.length / 7 }, (_, w) => (
        <div className="ds-cal-row" role="row" key={days[w * 7]}>
          {days.slice(w * 7, w * 7 + 7).map((key) => {
            const out = key.slice(0, 7) !== inMonth;
            const off = !out && available && !available(key);
            const cls = ['ds-cal-day'];
            if (out) cls.push('ds-cal-day--out');
            if (off) cls.push('ds-cal-day--off');
            if (key === today) cls.push('ds-cal-day--today');
            if (key === selected) cls.push('ds-cal-day--sel');
            if (!out && hasItems?.(key)) cls.push('ds-cal-day--has');
            return (
              <span role="gridcell" key={key} aria-selected={key === selected || undefined}>
                <button
                  type="button"
                  className={cls.join(' ')}
                  disabled={out || off}
                  tabIndex={out ? -1 : undefined}
                  aria-hidden={out || undefined}
                  aria-current={key === today ? 'date' : undefined}
                  aria-label={out ? undefined : `${dayTitle(key)}${hasItems?.(key) ? ', something on' : ''}`}
                  onClick={() => onSelect?.(key)}
                >
                  <span>{Number(key.slice(8))}</span>
                </button>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The calendar's bar: the month as a 20px heading, previous, next and Today,
 * Month and Week as one joined switch (`view`, `onView`), and any filter in
 * one drop-down (`filter`, a node).
 */
export function CalendarBar({ title, onPrev, onNext, onToday, view, onView, filter, prevLabel = 'Previous month', nextLabel = 'Next month', compact = false }) {
  // `compact`: a date picker's bar (M28 v6 "build"): the month on the left, previous and next on the right, one line.
  return (
    <div className={`ds-calbar${compact ? ' ds-calbar--compact' : ''}`}>
      <div className="ds-calbar-nav">
        {onPrev && <button type="button" className="ds-btn ds-btn--outline ds-btn--square" aria-label={prevLabel} onClick={onPrev}><Chevron direction="left" /></button>}
        {onNext && <button type="button" className="ds-btn ds-btn--outline ds-btn--square" aria-label={nextLabel} onClick={onNext}><Chevron direction="right" /></button>}
        {onToday && <button type="button" className="ds-btn ds-btn--outline" onClick={onToday}>Today</button>}
      </div>
      {onView && (
        <div className="ds-seg ds-seg--equal ds-seg--placed" role="group" aria-label="Show">
          {['month', 'week'].map((v) => (
            <button key={v} type="button" className="ds-seg-btn" aria-pressed={view === v} onClick={() => onView(v)}>{v === 'month' ? 'Month' : 'Week'}</button>
          ))}
        </div>
      )}
      <div className="ds-calbar-title">
        <h2 className="ds-q">{title}</h2>
        {filter}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the tool frame: focus mode (rule 21) */

/**
 * Inside a tool the menu goes: a bar with × on the left (named "Close and
 * save my place") and "Step 2 of 3" on the right, the progress line under it,
 * the tool in one column. Steps change with a short settle (a fade and an 8px
 * rise). Next, Back and Skip this step at the foot: one row on a laptop,
 * stacked and centred on a phone (Back and Skip as words only). The last step
 * is a summary with Finish (`last`).
 *
 * step, steps: numbers (1-based). `name`: the tool's name, small and grey over
 * the question. `question`: the step's 20px question. `onClose`: × (save where
 * they are, then go back; the page says "Saved. Pick up where you left off
 * from Home."). `onNext`, `nextLabel` (Next; Finish on the last step),
 * `onBack`, `onSkip`, `nextDisabled`.
 */
export function ToolFrame({ step, steps, name, sub, question, hint, onClose, closeLabel = 'Close and save my place', onNext, nextLabel, onBack, onSkip, skipLabel = 'Skip this step', last = false, stepWords, children, className = '' }) {
  useFocusMode(true);
  const pct = last ? 100 : Math.max(4, ((step - 1) / Math.max(1, steps)) * 100 + 100 / Math.max(1, steps) / 3);
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0); }, [step]);
  return (
    <div className={`ds-tool ${className}`.trim()}>
      <div className="ds-tool-bar">
        <button type="button" className="ds-tool-x" aria-label={closeLabel} title="Close" onClick={onClose}><span className="ds-x" aria-hidden="true" /></button>
        <span className="ds-tool-step">{stepWords || (last ? 'Done' : `Step ${step} of ${steps}`)}</span>
      </div>
      <div className="ds-tool-prog" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      <div className="ds-tool-step-body" key={step}>
        {name && <div className="ds-open-label">{name}</div>}
        {/* A line under the group's name (M28 v6 .sofar: "So far: …"), 13px grey, sentence case (Polish 1, Stage C). */}
        {sub && <p className="ds-tool-sub">{sub}</p>}
        {question && <h1 className="ds-q ds-tool-q" ref={headingRef} tabIndex={-1}>{question}</h1>}
        {hint && <p className="ds-tool-hint">{hint}</p>}
        {children}
      </div>
      {(onNext || onBack || onSkip) && (
        <div className="ds-tool-foot">
          {onNext && <button type="button" className="ds-btn ds-btn--primary" onClick={onNext}>{nextLabel || (last ? 'Finish' : 'Next')}</button>}
          {onBack && <MoreLink back onClick={onBack} className="ds-tool-back">Back</MoreLink>}
          {onSkip && !last && <button type="button" className="ds-more ds-more--bare ds-tool-skip" onClick={onSkip}>{skipLabel}</button>}
        </div>
      )}
    </div>
  );
}
