import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { themeProps, useThemeScope } from './themeScope';
import { pushLayer } from './layers';
import { readTip, tipNow } from './tipWords';
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
// - How it opens (Tim, 28 Oct, 14:22 and 14:42; START-HERE section 5):
//   pointing at a mark with a mouse previews its pop-up, and it closes
//   when the pointer moves away. A click keeps it open until you click
//   away, click the mark again or press Escape. On a touch screen there
//   is no hover: it opens on tap. Keyboard focus opens it, Enter keeps it
//   open, and Escape closes it and returns focus to the mark. It stays
//   with its mark when the page scrolls.
//
// Wrap a chart in <ChartTips> and give each mark the props from tipProps():
//   <ChartTips><svg>…<rect {...tipProps({ value: 'Performance score 88%', when: 'Sprint 4, week 2' })} />…</svg></ChartTips>

let tipCount = 0;

/**
 * Props for one mark: what its pop-up says, focusable, and read out in
 * the same words by a screen reader.
 *
 * A pop-up with several facts is a small card (Tim, 19 Nov, 15:54): a
 * `title` (a name, or "2 people"), `sub` lines under it in the text colour
 * (the organisation, the list), then `rows` of [label, value] under a
 * hairline, and a quiet `foot` ("Choose to see who"). `wide`: a one-line
 * pop-up on a phone may use the screen's whole width before it wraps.
 * @param {{value?: string, when?: string, extra?: string[], kind?: string, name?: string, title?: string, sub?: string[], rows?: [string, string][], foot?: string, wide?: boolean}} tip
 */
export function tipProps({ value, when, extra = [], kind, name, title, sub = [], rows = [], foot, wide }) {
  const words = title ? [title, ...sub, ...rows.map(([label, v]) => `${label} ${v}`), foot] : kind ? [kind, name, ...extra] : [value, when, ...extra];
  return {
    'data-tip': JSON.stringify(title ? { title, sub, rows, foot } : { value, when, extra, kind, name, ...(wide ? { wide: true } : {}) }),
    tabIndex: 0,
    role: 'img',
    'aria-label': words.filter(Boolean).join(', '),
  };
}

function edgeOf(el) {
  return parseFloat(getComputedStyle(el).getPropertyValue('--tip-edge')) || 12;
}

/** Labels on a chart that a pop-up must never cover ("Best", "This week", the standard's label). */
const CHART_LABELS = '[data-chart-label], .ds-wchart-tag, .dash-hchart-tag, .dash-hchart-std-label, .dash-hchart-axis span, .ds-wchart-std-label';

/**
 * `onChoose(mark)`: a mark that opens something (a person, a list). A
 * click, a tap or Enter then hands over the mark (the nearest one, with
 * `nearest`) and closes its pop-up instead of keeping it open; pointing at
 * it and keyboard focus still show the pop-up.
 */
export default function ChartTips({ children, className = '', nearest = false, onChoose = null }) {
  const scope = useThemeScope();
  const zoneRef = useRef(null);
  const tipRef = useRef(null);
  const [shown, setShown] = useState(null); // { el, tip, kept }
  // Focus going back to a mark after Escape doesn't open it again.
  const quiet = useRef(false);
  // Nor does focus going back to a mark once what it opened has closed.
  const chosen = useRef(null);
  const chooseMark = (el) => {
    chosen.current = el;
    setShown(null);
    onChoose(el);
  };
  const [idRef] = useState(() => {
    tipCount += 1;
    return `ds-tip-${tipCount}`;
  });

  const hide = useCallback(() => setShown(null), []);
  // kept: opened by a click, a tap or Enter, so the pointer leaving
  // doesn't close it.
  const show = useCallback((el, kept = false) => {
    const tip = readTip(el);
    if (tip) setShown({ el, tip, kept });
  }, []);

  // Place it once its words are in: centred over the mark, kept 12px
  // inside the screen, above the mark or below it when there's no room.
  // Placed again when the page scrolls, so it stays with its mark.
  const place = useCallback(() => {
    const box = tipRef.current;
    if (!shown || !box) return;
    const edge = edgeOf(box);
    const gap = parseFloat(getComputedStyle(box).getPropertyValue('--tip-gap')) || 8;
    const viewW = document.documentElement.clientWidth;
    box.style.maxWidth = `min(var(--tip-max-w), ${viewW - 2 * edge}px)`;
    box.style.left = '0px';
    box.style.top = '0px';
    const mark = shown.el.getBoundingClientRect();
    // Whole pixels, rounded up, so it never ends up a fraction inside the edge.
    const w = Math.ceil(box.getBoundingClientRect().width);
    const h = Math.ceil(box.getBoundingClientRect().height);
    const centre = mark.left + mark.width / 2;
    const left = Math.max(edge, Math.min(viewW - edge - w, centre - w / 2));
    // Never over a label (Tim, 5 Nov: the pop-up covered "Best"): a label
    // the pop-up would sit on lifts it above that label; with no room
    // above, it goes below the mark.
    const labels = [...(zoneRef.current?.querySelectorAll(CHART_LABELS) || [])]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const hits = (t) => labels.find((r) => r.left < left + w && r.right > left && r.top < t + h && r.bottom > t);
    let top = mark.top - gap - h;
    for (let k = 0; k < labels.length; k += 1) {
      const hit = hits(top);
      if (!hit) break;
      top = hit.top - gap - h;
    }
    if (top < edge) {
      top = mark.bottom + gap;
      for (let k = 0; k < labels.length; k += 1) {
        const hit = hits(top);
        if (!hit) break;
        top = hit.bottom + gap;
      }
    }
    // Never past the bottom of the screen either (a mark scrolled away).
    top = Math.max(edge, Math.min(window.innerHeight - edge - h, top));
    box.style.left = `${Math.floor(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }, [shown]);

  useLayoutEffect(place, [place]);

  // While one shows: Escape, a tap outside the chart or resizing closes
  // it; scrolling moves it with its mark.
  useEffect(() => {
    if (!shown) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      hide();
      const { el } = shown;
      if (el.isConnected && document.activeElement !== el) {
        quiet.current = true;
        el.focus?.({ preventScroll: true });
        quiet.current = false;
      }
    };
    const onDown = (e) => {
      if (!zoneRef.current?.contains(e.target)) hide();
    };
    // Escape closes the pop-up first, never what it sits in (a guided
    // tool, a panel): the shared Escape layers (layers.js), on top.
    const removeLayer = pushLayer(() => onKey({ key: 'Escape' }));
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', hide);
    shown.el.setAttribute('aria-describedby', idRef);
    const el = shown.el;
    // The mark's words changed while its pop-up is open (a day rated by
    // keyboard, with the pop-up kept open): the pop-up follows its mark,
    // or closes when the mark has no words any more.
    const watch = new MutationObserver(() => {
      const tip = tipNow(el, shown.tip);
      if (!tip) hide();
      else if (tip !== shown.tip) setShown({ ...shown, tip });
    });
    watch.observe(el, { attributes: true, attributeFilter: ['data-tip'] });
    return () => {
      watch.disconnect();
      removeLayer();
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', hide);
      el.removeAttribute('aria-describedby');
    };
  }, [shown, hide, place, idRef]);

  const markOf = (e) => {
    const el = e.target.closest?.('[data-tip]');
    const hit = el && zoneRef.current?.contains(el) ? el : null;
    return hit && nearest ? nearestMark(e, hit) : hit;
  };
  // nearest: where tap areas overlap (close dots on a phone), the mark whose
  // centre is nearest the press wins, not the one drawn on top (Health Check
  // follow-up 1, step 2). Each mark's tap area is the round area its box
  // holds, so the 44px tap area stays as it is.
  const nearestMark = (e, hit) => {
    if (!e.clientX && !e.clientY) return hit; // a keyboard press: the focused mark
    let best = hit;
    let bestD = Infinity;
    zoneRef.current.querySelectorAll('[data-tip]').forEach((m) => {
      const r = m.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      if (d <= Math.min(r.width, r.height) / 2 + 0.5 && d < bestD) { best = m; bestD = d; }
    });
    return best;
  };

  // Only a mouse previews, and not while a click keeps one open: a touch
  // never leaves a hover pop-up behind.
  const onPointerOver = (e) => {
    if (e.pointerType !== 'mouse' || shown?.kept) return;
    const el = markOf(e);
    if (el) {
      if (shown?.el !== el) show(el);
    } else hide();
  };
  const onPointerLeave = (e) => {
    if (e.pointerType === 'mouse' && !shown?.kept) hide();
  };
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') (markOf(e) || e.target.closest?.('[data-tip]'))?.focus?.({ preventScroll: true });
  };
  // A click (or a tap) keeps the mark's pop-up open; a click on a mark
  // whose pop-up it kept open, or on the chart away from a mark, closes
  // it. (A press also focuses the mark, which shows it without keeping
  // it, so a first tap always opens it.)
  const toggle = (el) => {
    if (shown?.el === el && shown.kept) hide();
    else show(el, true);
  };
  const onClick = (e) => {
    const el = markOf(e);
    if (el && onChoose) chooseMark(el);
    else if (el) toggle(el);
    else hide();
  };
  // Enter and Space on a mark that isn't a button act as a click (also
  // when the mark does something of its own, such as picking a week).
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = markOf(e);
    if (!el || el !== e.target || el.matches('button, a, input, select, textarea')) return;
    e.preventDefault();
    if (onChoose) chooseMark(el);
    else toggle(el);
  };
  const onFocus = (e) => {
    const el = markOf(e);
    if (el && chosen.current === el) { chosen.current = null; return; }
    chosen.current = null;
    if (el && !quiet.current && shown?.el !== el) show(el);
  };
  const onBlur = (e) => {
    if (!zoneRef.current?.contains(e.relatedTarget) && !shown?.kept) hide();
  };

  const tip = shown?.tip;
  return (
    <div
      ref={zoneRef}
      className={`ds-tipzone ${className}`.trim()}
      onPointerOver={onPointerOver}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
      {createPortal(
        <div className="ui-root ds-portal" {...themeProps(scope)}>
          <div ref={tipRef} id={idRef} className={`ds-tip${tip?.title ? ' ds-tip--card' : ''}${tip?.wide ? ' ds-tip--wide' : ''}`} role="tooltip" hidden={!tip}>
            {tip?.title ? (
              <>
                <b className="ds-tip-title">{tip.title}</b>
                {tip.sub?.map((line) => <span key={line} className="ds-tip-line ds-tip-sub">{line}</span>)}
                {tip.rows?.length > 0 && (
                  <dl className="ds-tip-rows">
                    {tip.rows.map(([label, v]) => <div key={label} className="ds-tip-row"><dt>{label}</dt><dd>{v}</dd></div>)}
                  </dl>
                )}
                {tip.foot && <span className="ds-tip-line ds-tip-foot">{tip.foot}</span>}
              </>
            ) : tip?.kind ? (
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
