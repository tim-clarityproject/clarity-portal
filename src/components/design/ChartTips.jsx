import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { themeProps, useThemeScope } from './themeScope';
import './design.css';

// The chart pop-up (Tim, 26 Oct; M4 dashboard v46): one shared pop-up
// for every mark on every chart. No keys on screen: things are labelled
// where they are, and every mark has a pop-up, so there are no
// unexplained marks.
//
// - The value first and larger ("Performance score 88%"), then when
//   ("Sprint 4, week 2"), then any extra fact on its own line.
// - A pop-up that names something says what kind of thing it is first,
//   small ("Outcome Objective 2"), then the name.
// - It stays at least 12px inside both screen edges, sits above the mark
//   or flips below it when there's no room above, wraps rather than run
//   off the side, and is hidden with display none when closed.
// - Hover with a mouse, tap on a phone, or Tab to a mark with the
//   keyboard. Escape, a tap elsewhere or scrolling closes it.
//
// Wrap a chart in <ChartTips> and give each mark the props from tipProps():
//   <ChartTips><svg>…<rect {...tipProps({ value: 'Performance score 88%', when: 'Sprint 4, week 2' })} />…</svg></ChartTips>

let tipCount = 0;

/**
 * Props for one mark: what its pop-up says, focusable, and read out in
 * the same words by a screen reader.
 * @param {{value?: string, when?: string, extra?: string[], kind?: string, name?: string}} tip
 */
export function tipProps({ value, when, extra = [], kind, name }) {
  const words = kind ? [kind, name, ...extra] : [value, when, ...extra];
  return {
    'data-tip': JSON.stringify({ value, when, extra, kind, name }),
    tabIndex: 0,
    role: 'img',
    'aria-label': words.filter(Boolean).join(', '),
  };
}

function readTip(el) {
  try {
    return JSON.parse(el.getAttribute('data-tip'));
  } catch {
    return null;
  }
}

function edgeOf(el) {
  return parseFloat(getComputedStyle(el).getPropertyValue('--tip-edge')) || 12;
}

export default function ChartTips({ children, className = '' }) {
  const scope = useThemeScope();
  const zoneRef = useRef(null);
  const tipRef = useRef(null);
  const [shown, setShown] = useState(null); // { el, tip }
  const [idRef] = useState(() => {
    tipCount += 1;
    return `ds-tip-${tipCount}`;
  });

  const hide = useCallback(() => setShown(null), []);
  const show = useCallback((el) => {
    const tip = readTip(el);
    if (tip) setShown({ el, tip });
  }, []);

  // Place it once its words are in: centred over the mark, kept 12px
  // inside the screen, above the mark or below it when there's no room.
  useLayoutEffect(() => {
    const box = tipRef.current;
    if (!shown || !box) return;
    const edge = edgeOf(box);
    const gap = parseFloat(getComputedStyle(box).getPropertyValue('--tip-gap')) || 8;
    const viewW = document.documentElement.clientWidth;
    box.style.maxWidth = `min(var(--tip-max-w), ${viewW - 2 * edge}px)`;
    box.style.left = '0px';
    box.style.top = '0px';
    const mark = shown.el.getBoundingClientRect();
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const centre = mark.left + mark.width / 2;
    const left = Math.max(edge, Math.min(viewW - edge - w, centre - w / 2));
    let top = mark.top - gap - h;
    if (top < edge) top = mark.bottom + gap;
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }, [shown]);

  // While one shows: Escape, a tap outside the chart, scrolling or
  // resizing closes it.
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') hide();
    };
    const onDown = (e) => {
      if (!zoneRef.current?.contains(e.target)) hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    shown.el.setAttribute('aria-describedby', idRef);
    const el = shown.el;
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      el.removeAttribute('aria-describedby');
    };
  }, [shown, hide, idRef]);

  const markOf = (e) => {
    const el = e.target.closest?.('[data-tip]');
    return el && zoneRef.current?.contains(el) ? el : null;
  };

  const onPointerOver = (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = markOf(e);
    if (el) show(el);
    else hide();
  };
  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse') hide();
  };
  // A tap (or click) shows the mark's pop-up; a tap on the same mark
  // again, or on the chart away from a mark, closes it.
  const onClick = (e) => {
    const el = markOf(e);
    if (!el) {
      hide();
      return;
    }
    if (shown?.el === el && e.detail > 0 && matchMedia('(hover: none)').matches) hide();
    else show(el);
  };
  const onFocus = (e) => {
    const el = markOf(e);
    if (el) show(el);
  };
  const onBlur = (e) => {
    if (!zoneRef.current?.contains(e.relatedTarget)) hide();
  };

  const tip = shown?.tip;
  return (
    <div
      ref={zoneRef}
      className={`ds-tipzone ${className}`.trim()}
      onPointerOver={onPointerOver}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
      {createPortal(
        <div className="ui-root ds-portal" {...themeProps(scope)}>
          <div ref={tipRef} id={idRef} className="ds-tip" role="tooltip" hidden={!tip}>
            {tip?.kind ? (
              <>
                <span className="ds-tip-kind">{tip.kind}</span>
                <b className="ds-tip-value">{tip.name}</b>
              </>
            ) : (
              <>
                {tip?.value && <b className="ds-tip-value">{tip.value}</b>}
                {tip?.when && <span className="ds-tip-line">{tip.when}</span>}
              </>
            )}
            {tip?.extra?.map((line) => <span key={line} className="ds-tip-line ds-tip-extra">{line}</span>)}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
