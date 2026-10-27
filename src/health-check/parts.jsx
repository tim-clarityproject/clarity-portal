import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { BOLD_CROSS_PATHS, BOLD_CROSS_STROKE, BOLD_CROSS_VIEWBOX } from '../lib/boldCrosshair';

// The Health Check's own parts, built to the mock-up (M7b version 4): every
// hover and focus is coral, every control is at least 44px to tap.

export const Chev = ({ dir = 'dn' }) => <span className={`chev ${dir}`} aria-hidden="true" />;
export const Cross = ({ className = '' }) => <span className={`x ${className}`.trim()} aria-hidden="true" />;

/** The bold crosshair, from its one shared drawing. */
export function BoldCross({ size = 26 }) {
  return (
    <svg viewBox={BOLD_CROSS_VIEWBOX.join(' ')} width={size} height={size} aria-hidden="true">
      <g fill="none" stroke="var(--fg)" strokeWidth={BOLD_CROSS_STROKE} strokeLinejoin="round">
        {BOLD_CROSS_PATHS.map((p) => <path key={p.d} d={p.d} transform={`translate(${p.dx.toFixed(2)} ${(p.dy).toFixed(2)})`} />)}
      </g>
    </svg>
  );
}

export const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const EYE = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M1.2 8C2.7 5.2 5.1 3.6 8 3.6s5.3 1.6 6.8 4.4C13.3 10.8 10.9 12.4 8 12.4S2.7 10.8 1.2 8Z" />
    <circle cx="8" cy="8" r="2.1" />
  </svg>
);

/** A phone layout (the mock-up's phone frame) below this width. */
export const PHONE = '(max-width: 640px)';
export function useIsPhone() {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE).matches;
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return undefined;
    const on = () => setPhone(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return phone;
}

export function PctBar({ pct }) {
  return (
    <div className="pctw" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% complete`}>
      <div className="pctb"><i style={{ width: `${pct}%` }} /></div>
      <span>{pct}%</span>
    </div>
  );
}

/** The eye, then How it works (results only), then Quick guide: one row, no dots. */
export function IconRow({ coach, onWho, onHow, onGuide, style }) {
  return (
    <div className="iw rv" style={style}>
      <button type="button" className="ilink" aria-haspopup="dialog" onClick={onWho}>
        {EYE}<span className="vh">Who can see this: </span>You and {coach}
      </button>
      {onHow && (
        <button type="button" className="ilink" aria-haspopup="dialog" onClick={onHow}>
          <span className="ic i" aria-hidden="true" />How it works
        </button>
      )}
      <button type="button" className="ilink" aria-haspopup="dialog" onClick={onGuide}>
        <span className="ic pl" aria-hidden="true" />Quick guide
      </button>
    </div>
  );
}

// ---- pop-ups ----------------------------------------------------------------
// Lines: { label } a small "what kind of thing", { bold } the name,
// { big, small } the value large, { line } one fact, { term, meaning } a term
// then its meaning. 12px inside both edges, below the target when there's no
// room above. Escape closes.

const TipContext = createContext(null);
export const useTip = () => useContext(TipContext);

export function TipProvider({ children }) {
  const [tip, setTip] = useState(null); // { lines, wide, el, owner }
  const boxRef = useRef(null);
  const show = useCallback((el, lines, opts = {}) => setTip({ el, lines, wide: !!opts.wide, owner: opts.owner || el }), []);
  const hide = useCallback((owner) => setTip((t) => (owner && t && t.owner !== owner ? t : null)), []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!tip || !box || !tip.el?.isConnected) return;
    const G = 12;
    const r = tip.el.getBoundingClientRect();
    const tw = box.offsetWidth;
    const th = box.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const x = Math.max(G, Math.min(vw - G - tw, r.left + r.width / 2 - tw / 2));
    let top = r.top - th - 8;
    if (top < G) top = r.bottom + 8;
    box.style.left = `${x}px`;
    box.style.top = `${top}px`;
  }, [tip]);

  useEffect(() => {
    if (!tip) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setTip(null); };
    const onScroll = () => setTip(null);
    const onDown = (e) => { if (!tip.el.contains(e.target) && !boxRef.current?.contains(e.target)) setTip(null); };
    // The pop-up's target went away (the screen changed): close it.
    if (!tip.el.isConnected) setTip(null);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [tip]);

  return (
    <TipContext.Provider value={{ show, hide, open: tip }}>
      {children}
      <div ref={boxRef} className={`ctip${tip?.wide ? ' wide' : ''}`} role="tooltip" id="hc-tip" hidden={!tip}>
        {tip && <TipLines lines={tip.lines} />}
      </div>
    </TipContext.Provider>
  );
}

function TipLines({ lines }) {
  let first = true;
  return lines.map((l, i) => {
    if (l.label) return <span key={i} className="tlab">{l.label}</span>;
    if (l.big) return <span key={i} className="tbig">{l.big}{l.small && <small>{l.small}</small>}</span>;
    if (l.term) return [<span key={`${i}t`} className="tterm">{l.term}</span>, <span key={`${i}m`} className="tc">{l.meaning}</span>];
    if (l.bold || (first && l.line)) { first = false; return <b key={i}>{l.bold || l.line}</b>; }
    return <span key={i} className="tc">{l.line}</span>;
  });
}

/** Hover, focus and tap open a pop-up on this element. */
export function useTipTarget(lines, opts = {}) {
  const tipApi = useTip();
  const ref = useRef(null);
  const owner = useId();
  const isOpen = tipApi.open?.owner === owner;
  const open = () => ref.current && tipApi.show(ref.current, lines, { ...opts, owner });
  return {
    ref,
    isOpen,
    onMouseEnter: open,
    onMouseLeave: () => tipApi.hide(owner),
    onFocus: open,
    onBlur: () => tipApi.hide(owner),
    onClick: (e) => { e.stopPropagation(); if (isOpen) tipApi.hide(); else open(); },
    'aria-describedby': isOpen ? 'hc-tip' : undefined,
  };
}

/** The ⓘ at the end of a sentence. */
export function InfoButton({ lines, label }) {
  const { isOpen, ...t } = useTipTarget(lines, { wide: true });
  return (
    <button type="button" className="ipb" aria-label={label} aria-expanded={isOpen} {...t}>
      <span className="ic i" aria-hidden="true" />
    </button>
  );
}

// ---- the panel: centred on a laptop, sliding up from the bottom on a phone ---

export function Sheet({ title, onClose, children, returnFocus }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const back = returnFocus?.current || document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [onClose, returnFocus]);
  return (
    <>
      <div className="ascrim" onClick={onClose} aria-hidden="true" />
      <div className="bs" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="bsh">
          <h3>{title}</h3>
          <button ref={closeRef} type="button" className="iconbtn" aria-label="Close" onClick={onClose}><Cross className="close" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

// ---- branded drop-down ------------------------------------------------------

export function Dropdown({ label, title, value, options, onChange, small = false, id }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const box = listRef.current;
    const sel = box?.querySelector('[aria-selected="true"]') || box?.querySelector('button');
    if (box && sel) {
      box.scrollTop = Math.max(0, sel.offsetTop - box.clientHeight / 2 + sel.offsetHeight / 2);
      sel.focus({ preventScroll: true });
    }
    if (phone) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, phone, close]);

  const pick = (v) => { onChange(v); close(); };
  const onListKey = (e) => {
    const items = [...listRef.current.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    if (e.key === 'Tab') close(false);
  };
  const list = (
    <div className="ddl" role="listbox" aria-label={title || label} ref={listRef} onKeyDown={onListKey}>
      {options.map((o) => (
        <button key={o.value} type="button" role="option" aria-selected={o.value === value} onClick={() => pick(o.value)}>{o.label}</button>
      ))}
    </div>
  );
  return (
    <div className="ddw" ref={wrapRef}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className={`dd${small ? ' sm' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ? `${label}: ${current.label}` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <span>{current.label}</span><Chev dir={open ? 'up' : 'dn'} />
      </button>
      {open && !phone && list}
      {open && phone && <Sheet title={title || label} onClose={() => close()} returnFocus={btnRef}>{list}</Sheet>}
    </div>
  );
}

// ---- the six-box access code ------------------------------------------------

export const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export function CodeBoxes({ id, value, onChange, onEnter }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`otp${focused ? ' fo' : ''}`}>
      <input
        id={id}
        value={value}
        maxLength={6}
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        aria-label="Access code, 6 characters"
        onChange={(e) => onChange(cleanCode(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
      />
      {[0, 1, 2, 3, 4, 5].map((i) => <b key={i} aria-hidden="true" className={i === Math.min(value.length, 5) ? 'on' : ''}>{value.charAt(i)}</b>)}
    </div>
  );
}

// ---- choices with their meanings --------------------------------------------

export function Choices({ options, value, onPick, label, start = 0, focusFirst = false, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!focusFirst || !ref.current) return;
    (ref.current.querySelector('[aria-checked="true"]') || ref.current.querySelector('button'))?.focus({ preventScroll: true });
  }, [focusFirst]);
  const idx = options.findIndex((_, i) => i + start === value);
  const onKey = (e) => {
    const items = [...ref.current.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    let j = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = Math.min(items.length - 1, i + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = Math.max(0, i - 1);
    if (j != null) { e.preventDefault(); items[j].focus(); }
  };
  return (
    <div className="opts5 rv" style={style} role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKey}>
      {options.map(([word, meaning], i) => (
        <button
          key={word}
          type="button"
          role="radio"
          aria-checked={i + start === value}
          tabIndex={(idx === -1 ? i === 0 : i === idx) ? 0 : -1}
          onClick={() => onPick(i + start)}
        >
          <b>{word}</b><small>{meaning}</small>
        </button>
      ))}
    </div>
  );
}

// ---- a box that grows to show all its text ------------------------------------

export function GrowBox({ value, onChange, className = '', inputRef, ...rest }) {
  const ref = useRef(null);
  const setRef = (el) => { ref.current = el; inputRef?.(el); };
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    // Keep the page where it is while the box grows.
    const y = window.scrollY;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
    if (window.scrollY !== y) window.scrollTo(window.scrollX, y);
  }, [value]);
  return <textarea ref={setRef} className={className} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

/** Numbered rows: one box each, the crosshair to remove, and the outlined add button. */
export function Rows({ kind, rows, placeholder, label, max, maxItem, addLabel, onChange, onAdd, onRemove }) {
  const refs = useRef({});
  const lastAdded = useRef(null);
  useEffect(() => {
    if (lastAdded.current && refs.current[lastAdded.current]) {
      refs.current[lastAdded.current].focus();
      lastAdded.current = null;
    }
  });
  return (
    <>
      {rows.map((row, i) => (
        <div className="srow" key={row.id}>
          <span className="n" aria-hidden="true">{i + 1}</span>
          <GrowBox
            inputRef={(el) => { refs.current[row.id] = el; }}
            className="one"
            rows={1}
            value={row.text}
            maxLength={maxItem}
            placeholder={i === 0 ? placeholder : ''}
            aria-label={`${label} ${i + 1}`}
            autoComplete="off"
            data-kind={kind}
            onChange={(v) => onChange(row.id, v.replace(/\n/g, ' '))}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
          />
          <button type="button" className="rm" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} disabled={rows.length < 2} onClick={() => onRemove(row.id)}>
            <Cross />
          </button>
        </div>
      ))}
      {rows.length < max && (
        <div className="addw">
          <button type="button" className="ghost" onClick={() => { lastAdded.current = onAdd(); }}><Cross />{addLabel}</button>
        </div>
      )}
    </>
  );
}

/** Deleted with Undo, or a short line, at the bottom of the screen. */
export function Toast({ toast, onUndo }) {
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      {TICK}<span>{toast.msg}</span>
      {toast.undo && <button type="button" className="ud" onClick={onUndo}>Undo</button>}
    </div>
  );
}

/** Saving and Saved, in the top bar. */
export function SaveLine({ state }) {
  if (state === 'saving') return <span className="saving" role="status"><span className="spin" aria-hidden="true" />Saving</span>;
  if (state === 'error') return <span className="notsaved" role="status">Not saved yet, retrying</span>;
  if (state === 'saved' || state === 'idle') return <span className="saved" role="status"><i />Saved</span>;
  return null;
}
