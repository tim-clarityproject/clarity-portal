import { useEffect, useId, useRef, useState } from 'react';
import Crosshair from './Crosshair';
import FieldLabel from './FieldLabel';
import Popover from './Popover';
import useIsPhone from './useIsPhone';
import './design.css';

// The branded drop-down (Tim, 22 Oct: replaces the browser's own menu
// everywhere, the Filter's included; M6 "Which Strategy?" and "How will
// you measure it?").
//
// The box: the chosen option in 17px with room to breathe, long choices
// wrapping onto a second line, and the grey crosshair, which turns 45°
// while the list is open.
// Laptop: the list opens just below the box (above only when there isn't
// room), never covering it. Options are 16px, at least 52px high, with
// an optional grey second line; the chosen one has a shade and a coral
// tick.
// Phone: a panel slides up with the question as its title, one option
// per row.
// Keyboard and screen readers (a select-only combobox): arrows, Home,
// End, Page Up and Down, Enter or Space to choose, Escape to close, type
// to jump; focus is back on the box when it closes.
//
// options: [{ value, label, hint }], hint being the optional grey line.
// who:     the who-sees label for the label row (see FieldLabel).

const TYPEAHEAD_MS = 500;
const PAGE_STEP = 5;

function text(option) {
  return typeof option.label === 'string' ? option.label : String(option.value);
}

export default function Dropdown({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose one',
  who,
  coachName,
  className = '',
}) {
  const isPhone = useIsPhone();
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const optionId = (i) => `${baseId}-opt-${i}`;
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [byKeyboard, setByKeyboard] = useState(false);
  const typed = useRef({ text: '', at: 0 });

  const selected = options.findIndex((o) => o.value === value);
  const current = options[selected];

  const openList = (at, keyboard) => {
    setActive(at >= 0 ? at : Math.max(0, selected));
    setByKeyboard(keyboard);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const choose = (i) => {
    const option = options[i];
    setOpen(false);
    if (option && option.value !== value) onChange(option.value);
  };

  // Keep the active option in sight inside the list (the list scrolls,
  // never the page).
  useEffect(() => {
    if (!open || active < 0) return;
    const list = listRef.current;
    const el = list?.querySelector(`#${CSS.escape(optionId(active))}`);
    const scroller = list?.closest('.ds-pop, .ds-sheet-body');
    if (!el || !scroller) return;
    const view = scroller.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (box.top < view.top) scroller.scrollTop -= view.top - box.top;
    else if (box.bottom > view.bottom) scroller.scrollTop += box.bottom - view.bottom;
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  // Type to jump: the next option starting with what's been typed.
  const jump = (char) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > TYPEAHEAD_MS ? char : t.text + char;
    t.at = now;
    const query = t.text.toLowerCase();
    const from = open ? active : selected;
    const start = query.length === 1 ? from + 1 : Math.max(0, from);
    for (let k = 0; k < options.length; k += 1) {
      const i = (start + k) % options.length;
      if (text(options[i]).toLowerCase().startsWith(query)) return i;
    }
    return -1;
  };

  const isTypeKey = (e) => e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;

  const onListKey = (e) => {
    const last = options.length - 1;
    const move = (to) => {
      e.preventDefault();
      setByKeyboard(true);
      setActive(Math.max(0, Math.min(last, to)));
    };
    switch (e.key) {
      case 'ArrowDown': move(active + 1); break;
      case 'ArrowUp':
        if (e.altKey) { e.preventDefault(); choose(active); break; }
        move(active - 1);
        break;
      case 'Home': move(0); break;
      case 'End': move(last); break;
      case 'PageDown': move(active + PAGE_STEP); break;
      case 'PageUp': move(active - PAGE_STEP); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Tab':
        // Laptop: leaving the box closes the list. The phone panel keeps
        // Tab inside itself.
        if (!isPhone) close();
        break;
      default:
        if (isTypeKey(e)) {
          const i = jump(e.key);
          if (i >= 0) move(i);
        }
    }
  };

  const onBoxKey = (e) => {
    if (open && !isPhone) {
      onListKey(e);
      return;
    }
    if (open) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList(selected, true);
    } else if (isTypeKey(e)) {
      e.preventDefault();
      openList(jump(e.key), true);
    }
  };

  const list = (
    <div
      ref={listRef}
      id={listId}
      className="ds-listbox"
      role="listbox"
      aria-labelledby={labelId}
      tabIndex={isPhone ? 0 : -1}
      aria-activedescendant={isPhone && active >= 0 ? optionId(active) : undefined}
      onKeyDown={isPhone ? onListKey : undefined}
    >
      {options.map((option, i) => (
        <div
          key={option.value}
          id={optionId(i)}
          role="option"
          aria-selected={i === selected}
          className={`ds-option${i === active ? ' ds-option--active' : ''}${i === active && byKeyboard ? ' ds-option--keyboard' : ''}`}
          // Keep focus on the box (laptop) while the list is used.
          onMouseDown={(e) => e.preventDefault()}
          onMouseMove={() => { if (active !== i || byKeyboard) { setActive(i); setByKeyboard(false); } }}
          onClick={() => choose(i)}
        >
          <span className="ds-option-text">
            {option.label}
            {option.hint && <small>{option.hint}</small>}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`ds-choice ${className}`.trim()}>
      <FieldLabel label={label} id={labelId} who={who} coachName={coachName} />
      <button
        ref={boxRef}
        type="button"
        className={`ds-dd${current ? '' : ' ds-dd--empty'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId}
        aria-activedescendant={open && !isPhone && active >= 0 ? optionId(active) : undefined}
        onClick={() => (open ? close() : openList(selected, false))}
        onKeyDown={onBoxKey}
      >
        <span className="ds-dd-value">{current ? current.label : placeholder}</span>
        <Crosshair tone="grey" turned={open} />
      </button>
      <Popover
        open={open}
        onClose={close}
        anchorRef={boxRef}
        title={label}
        variant="list"
        keepFocus
        initialFocusRef={listRef}
      >
        {list}
      </Popover>
    </div>
  );
}
