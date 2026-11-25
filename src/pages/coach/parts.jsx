import { createContext, forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, DisclosureArrow, EyeIcon, InfoPop, Popover, useInfoToggle, useIsPhone } from '../../components/design';
import { BackLink } from '../../components/ui/DiscardLink';

// The coach portal's own small parts (Phase 6a run 1; M11, version 3.6),
// each built from the shared set (src/components/design) and used on every
// coach page, so no page draws its own.

/** Everything a coach page needs: who is signed in, their data, and today. */
export const CoachPortalContext = createContext(null);
export const useCoachPortal = () => useContext(CoachPortalContext);

export const TICK = <svg className="cc-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** A quiet text link (the shared one). */
export const TextLink = forwardRef(function TextLink({ children, ...rest }, ref) {
  return <Button variant="text" ref={ref} {...rest}>{children}</Button>;
});

/** A link inside a sentence, such as a person's name (Tim, 18 Nov). */
export function InlineLink({ children, ...rest }) {
  return <button type="button" className="cc-inline-link" {...rest}>{children}</button>;
}

/** Back, at the top left: the shared Back link (the chevron 10px from its words, on the content's left edge). */
export function Back({ to = 'Clients', onClick }) {
  return <div className="cc-backrow"><BackLink onClick={onClick} label={to} /></div>;
}

/** A section: the shared heading, then its rows (no line under the heading when rows with their own lines follow). */
export function Part({ title, aside, children }) {
  return (
    <section className="ds-section cc-part">
      <div className="ds-section-head"><h2 className="ds-section-title">{title}{aside}</h2></div>
      {children}
    </section>
  );
}

/** The eye, alone, with its one line in the shared pop-up. `shared` adds the small dot. */
export function Eye({ sentence, shared = false }) {
  const popId = useId();
  const { open, buttonRef, panelRef, buttonProps } = useInfoToggle();
  return (
    <>
      <button type="button" ref={buttonRef} className="ds-who ds-who--eye" aria-label={`Who can see this: ${sentence}`} aria-expanded={open} aria-controls={popId} {...buttonProps}>
        <span className={`ds-who-eye${shared ? ' ds-who-eye--shared' : ''}`} aria-hidden="true"><EyeIcon /></span>
      </button>
      <InfoPop id={popId} open={open} anchorRef={buttonRef} panelRef={panelRef} lines={[sentence]} />
    </>
  );
}

/**
 * A fold: it opens from anywhere on its heading row, and remembers what was
 * left open (the page keeps `open` and tells the device).
 */
export function Fold({ title, summary, eye, open, onToggle, children }) {
  const bodyId = useId();
  return (
    <section className="cc-fold">
      <div className="cc-fold-head">
        <h2>
          <button type="button" className="cc-fold-btn" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>{title}</button>
          {eye}
        </h2>
        <span className="cc-fold-sum">{open ? '' : summary}</span>
        <span className="cc-fold-mark"><DisclosureArrow open={open} beside="capitals" /></span>
      </div>
      <div id={bodyId} className="cc-fold-body" hidden={!open}>{open && children}</div>
    </section>
  );
}

/**
 * On a phone a row is at most two lines: its title, then one grey line (M11's
 * calm phone, Tim's 18 Nov phone rule 5; tidy follow-up 3, run 6's 33). Every
 * `[data-grey-line]` inside `rootRef` is a grey line of parts: while it wraps,
 * the part with the highest `data-drop` goes first (the last of them when
 * several share it), until one part is left. A part with no `data-drop` is
 * dropped after every numbered one. Parts come back whenever the words or the
 * width change, and nothing is trimmed on a wider screen.
 */
export function useGreyLines(rootRef, on) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined') return undefined;
    let frame = 0;
    const trim = () => {
      frame = 0;
      for (const line of root.querySelectorAll('[data-grey-line]')) trimGreyLine(line, on);
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(trim); };
    trim();
    const watch = new window.MutationObserver(later);
    watch.observe(root, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', later);
    return () => { watch.disconnect(); window.removeEventListener('resize', later); if (frame) cancelAnimationFrame(frame); };
  }, [rootRef, on]);
}

/** One grey line, trimmed as useGreyLines trims it: every part back, then (on a phone) the highest data-drop first while it wraps. */
export function trimGreyLine(line, on) {
  if (!line) return;
  const all = [...line.children].filter((c) => c.tagName === 'SPAN');
  all.forEach((p) => { if (p.dataset.trimmed) { p.style.display = ''; delete p.dataset.trimmed; } });
  if (!on) return;
  const wraps = (el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45;
    return el.offsetHeight > lh * 1.5;
  };
  let guard = all.length;
  while (guard-- > 0 && wraps(line)) {
    const shown = all.filter((p) => !p.dataset.trimmed);
    if (shown.length < 2) break;
    const rank = (p) => (p.dataset.drop == null ? 0 : Number(p.dataset.drop) + 1);
    const top = Math.max(...shown.map(rank));
    const go = shown.filter((p) => rank(p) === top).pop();
    go.dataset.trimmed = '1';
    go.style.display = 'none';
  }
}

/**
 * A grey line trimmed as it is drawn, before anything is painted or read (coach rule 49: a first screen's line is the
 * whole page's line). useGreyLines trims on the frame after a change, which is a moment too late for a line that
 * arrives with the first screen ("£100 over, with 4 working days left" on a phone, shown and then left out).
 */
export function useGreyLineNow(lineRef) {
  const on = useIsPhone();
  useLayoutEffect(() => { trimGreyLine(lineRef.current, on); });
}

/**
 * One line of a timeline: when at the left, the title, then its quiet lines. On a phone the date joins the one grey line
 * under the title (M11's calm phone, .tlxr; tidy follow-up 3, run 6's 33), and what doesn't fit is left out from the end.
 * `onClick` makes the whole row a button.
 */
export function TimelineRow({ when, title, lines = [], onClick, className = '' }) {
  const isPhone = useIsPhone();
  const words = lines.filter(Boolean);
  const inner = isPhone
    ? <div><b>{title}</b><small className="cc-timeline-line" data-grey-line>{when && <span>{when}</span>}{words.map((line, i) => <span key={`${i}:${line}`}>{line}</span>)}</small></div>
    : <><span>{when}</span><div><b>{title}</b>{words.map((line, i) => <p key={`${i}:${line}`}>{line}</p>)}</div></>;
  const cls = `cc-timeline-row${className ? ` ${className}` : ''}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

/** A list row that opens something: a name, quiet facts under it, and when at the right. */
export function Row({ title, facts = [], when, onClick, label }) {
  const inner = (
    <>
      <span>
        <b>{title}</b>
        {facts.filter(Boolean).length > 0 && <small data-grey-line>{facts.filter(Boolean).map((f) => <span key={f}>{f}</span>)}</small>}
      </span>
      <span className="cc-row-when">{when}</span>
    </>
  );
  if (!onClick) return <div className="cc-row cc-row--still">{inner}</div>;
  return <button type="button" className="cc-row" onClick={onClick} aria-label={label}>{inner}</button>;
}

/** A row with something at its right: a label, one quiet line, then a link or a state. */
export function Line({ title, small, children }) {
  return (
    <div className="cc-line">
      <span>
        <b>{title}</b>
        {small && <small>{small}</small>}
      </span>
      {children}
    </div>
  );
}

export function Detail({ label, children, edit = false }) {
  return (
    <div className={`cc-detail${edit ? ' cc-detail--edit' : ''}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * A small menu that floats above everything (the shared Popover, position
 * fixed), so a table never cuts it off. Children are MenuItem and MenuLabel.
 */
export function PopMenu({ open, onClose, anchorRef, title, children }) {
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} title={title} width="own" variant="list">
      <div className="cc-pop" role="menu" aria-label={title}>{children}</div>
    </Popover>
  );
}

export function MenuItem({ children, checked, onClick }) {
  const role = checked === undefined ? 'menuitem' : 'menuitemcheckbox';
  return (
    <button type="button" className="cc-pop-item" role={role} aria-checked={checked === undefined ? undefined : checked} onClick={onClick}>
      <span>{children}</span>
      {checked !== undefined && TICK}
    </button>
  );
}

export const MenuLabel = ({ children }) => <p className="cc-pop-label">{children}</p>;

/**
 * A value edited in place: it reads as text until it is chosen, then a box
 * opens with the quiet grey edge and the cursor at the end of the text.
 * Enter or leaving the box saves; Escape puts it back.
 * @param {{ kind: 'text'|'number'|'date'|'choice', options?: string[] }} props
 */
export function EditCell({ label, value, words, kind = 'text', options = [], empty = 'Add', onSave }) {
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState(false);
  const box = useRef(null);
  const again = useRef(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    if (!editing || !box.current) return;
    box.current.focus();
    // The cursor goes to the end; nothing is selected (Tim, 18 Nov).
    if (kind === 'text' || kind === 'number') {
      const end = box.current.value.length;
      try { box.current.setSelectionRange(end, end); } catch { /* a number box has no selection */ }
    }
  }, [editing, kind]);

  const start = () => {
    done.current = false;
    setProblem(false);
    setTyped(value == null ? '' : String(value));
    setEditing(true);
  };
  const finish = (next, keep = true) => {
    if (done.current) return;
    if (keep && next !== (value == null ? '' : String(value))) {
      const ok = onSave(next);
      if (ok === false) { setProblem(true); return; }
    }
    done.current = true;
    setEditing(false);
    requestAnimationFrame(() => again.current?.focus({ preventScroll: true }));
  };

  if (!editing) {
    const shown = words || (value == null || value === '' ? '' : String(value));
    return (
      <button type="button" ref={again} className={`cc-cell${shown ? '' : ' cc-cell--empty'}`} aria-label={`${label}, ${shown || 'empty'}. Edit`} onClick={start}>
        {shown || empty}
      </button>
    );
  }
  if (kind === 'choice') {
    return (
      <select ref={box} className="cc-cell-input" aria-label={label} value={typed} onChange={(e) => finish(e.target.value)} onBlur={() => finish(typed, false)} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(typed, false); } }}>
        <option value="">None</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input
      ref={box}
      className="cc-cell-input"
      aria-label={label}
      aria-invalid={problem || undefined}
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'number' ? 'decimal' : undefined}
      value={typed}
      onChange={(e) => { setTyped(e.target.value); setProblem(false); }}
      onBlur={() => finish(typed)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(typed); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(typed, false); }
      }}
    />
  );
}

/**
 * One Settings row: its label, its value and Edit. A box shows only while
 * editing, with Save and Cancel (M11, version 3.4).
 * `editor` is ({ value, setValue }) => the box; `check` returns a calm line or null.
 */
export function SettingRow({ label, value, words, editLabel = 'Edit', editor, onSave, check, still = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);
  const editRef = useRef(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true });
    wasEditing.current = editing;
  }, [editing]);

  if (still || !editor) {
    return (
      <div className="cc-setrow cc-setrow--still">
        <span className="cc-setrow-label">{label}</span>
        <span className="cc-setrow-value">{words ?? value}</span>
      </div>
    );
  }
  if (!editing) {
    return (
      <div className="cc-setrow">
        <span className="cc-setrow-label">{label}</span>
        <span className="cc-setrow-value">{words ?? value}</span>
        <Button variant="text" ref={editRef} aria-label={`${editLabel} ${label}`} onClick={() => { setDraft(value); setProblem(null); setEditing(true); }}>{editLabel}</Button>
      </div>
    );
  }
  const save = async () => {
    if (busy) return;
    const line = check ? check(draft) : null;
    if (line) { setProblem(line); return; }
    setBusy(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (error) {
      setProblem(error?.message || 'That didn’t save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form noValidate className="cc-setrow cc-setrow--edit" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}>
      <span className="cc-setrow-label">{label}</span>
      <div className="cc-setrow-edit">
        {editor({ value: draft, setValue: (v) => { setDraft(v); setProblem(null); }, label })}
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        <div className="cc-setrow-saves">
          <Button variant="primary" type="submit" aria-busy={busy || undefined}>Save</Button>
          <Button variant="text" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

/** Opens with the cursor at the end of what is there. */
export function useCursorAtEnd() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not a text box */ }
  }, []);
  return ref;
}

/** Runs something once a second while `on` (a running clock). */
export function useEverySecond(on) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return undefined;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/** Is the screen narrower than this many pixels? (The table needs a laptop's width: rule 20, tables never squash.) */
export function useNarrowerThan(px) {
  const query = `(max-width: ${px - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const check = () => setNarrow(media.matches);
    check();
    media.addEventListener('change', check);
    return () => media.removeEventListener('change', check);
  }, [query]);
  return narrow;
}
