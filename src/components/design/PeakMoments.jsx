import { useMemo, useRef, useState } from 'react';
import { nearestRing, ringLabel, ringNote, whenWords } from '../../lib/peakMoments/model';
import './design.css';
import './peak.css';

// Peak moments' shared parts (mock-up M18, version 28; Phase 8b part A),
// each in the design gallery under "Peak moments".
//
// PeakMomentList, PeakMomentRow: the list's rows (M18 .lr): the name, the
//   meta line (its kind's short name, Work or Personal, how it repeats, its
//   city) as separate quiet items with no dots between them, the date on
//   the right; a past one has its lesson as a third line. A row with
//   onClick is one button; without, only words (M18: past rows can't be
//   tapped).
//
// PeakWeekBars: the sprint's week bars as M18 draws them (viewBox 300 by
//   150: bars from zero, mint at the standard and grey below it, this week
//   filling in, the dashed standard line labelled at its end, no key), with
//   a small ring above each week that holds a peak moment; two or more show
//   as one slightly larger ring with the number in it. Tapping a ring fills
//   it and lists that week's moments under the chart: no pop-up and no
//   focus box. Keyboard focus shows the coral ring. Each ring's tap area
//   reaches 25 units (56px across on a phone), and where two tap areas
//   overlap the nearer ring wins (M18 let the later ring win: fixed, brief
//   step 2).
//
// PeakYearList: View your year's plain list by month (M18 .mon): the month
//   and the sprint it falls in, then its moments, or "Nothing marked yet".

const W = 300;
const H = 150;
const TOP = 18;
const BOTTOM = 22;
const RIGHT = 74;
const PLOT_H = H - TOP - BOTTOM; // 110
const REACH = 25; // each ring's tap area, in the drawing's units

export function PeakMomentList({ label, children, className = '' }) {
  return (
    <ul className={`ds-peak-list ${className}`.trim()} aria-label={label}>
      {children}
    </ul>
  );
}

export function PeakMomentRow({ name, meta = [], date, lesson, onClick, ariaLabel }) {
  const body = (
    <>
      <span className="ds-peak-main">
        <span className="ds-peak-name">{name}</span>
        {meta.length > 0 && (
          <span className="ds-peak-meta">
            {meta.map((m) => <span key={m}>{m}</span>)}
          </span>
        )}
        {lesson && <span className="ds-peak-lesson">{lesson}</span>}
      </span>
      {date && <span className="ds-peak-date">{date}</span>}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button type="button" className="ds-peak-row" onClick={onClick} aria-label={ariaLabel}>{body}</button>
      ) : (
        <div className="ds-peak-row ds-peak-row--still">{body}</div>
      )}
    </li>
  );
}

/**
 * weeks:    [{ number, value: 0 to 100 or null, state: 'good'|'below'|'now'|'next'|'none' }]
 * standard: the sprint's standard (85)
 * rings:    weekRings() from src/lib/peakMoments/model.js
 * reviews, today: for each moment's line under the chart
 * label:    the drawing's words for a screen reader
 */
export function PeakWeekBars({ weeks, standard, rings = [], reviews = {}, today, label, className = '' }) {
  const [open, setOpen] = useState(null);
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const n = Math.max(1, weeks.length);
  const cw = (W - RIGHT) / n;
  const bw = cw * 0.62;
  const y = (v) => TOP + PLOT_H * (1 - Math.max(0, Math.min(100, v)) / 100);
  const stdY = y(standard);

  const placed = useMemo(() => rings.map((r) => {
    const i = weeks.findIndex((w) => w.number === r.week);
    const w = weeks[i];
    const top = w && w.value != null ? y(w.value) : y(0);
    const many = r.occurrences.length > 1;
    return { ...r, x: i * cw + cw / 2, y: top - 12, r: many ? 9 : 5, many };
    // y and cw follow weeks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rings, weeks, cw]);

  // A point on the drawing, in its own units.
  const pointOf = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
  };
  const toggle = (week) => setOpen((o) => (o === week ? null : week));
  const onClick = (e) => {
    const p = pointOf(e);
    const ring = p && nearestRing(placed, p, REACH);
    if (!ring) return;
    toggle(ring.week);
    // A tap leaves no focus box: focus shows only for the keyboard.
    if (e.detail > 0) e.currentTarget.ownerDocument?.activeElement?.blur?.();
  };
  const onMove = (e) => {
    const p = pointOf(e);
    const ring = p && nearestRing(placed, p, REACH);
    setHover(ring ? ring.week : null);
  };
  const onKey = (week) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(week);
    }
  };
  const shown = placed.find((r) => r.week === open) || null;

  return (
    <div className={`ds-peakbars ${className}`.trim()}>
      <svg
        ref={svgRef}
        className={`ds-peakbars-svg${hover != null ? ' ds-peakbars-svg--on' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={label}
        onClick={onClick}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {weeks.map((w, i) => {
          const x = i * cw + (cw - bw) / 2;
          const has = w.value != null && w.state !== 'next' && w.state !== 'none';
          return (
            <g key={w.number}>
              {has && (
                <rect
                  className={`ds-peakbars-bar ds-peakbars-bar--${w.state === 'now' ? 'now' : w.state}`}
                  x={x}
                  y={y(w.value)}
                  width={bw}
                  height={Math.max(0, TOP + PLOT_H - y(w.value))}
                  rx={3}
                />
              )}
              <text className="ds-peakbars-num" x={i * cw + cw / 2} y={H - 6} textAnchor="middle" aria-hidden="true">{w.number}</text>
            </g>
          );
        })}
        <line className="ds-peakbars-std" x1={0} x2={W - RIGHT + 4} y1={stdY} y2={stdY} />
        <text className="ds-peakbars-stdt" x={W - RIGHT + 10} y={stdY + 3.5} aria-hidden="true">{`Standard ${standard}%`}</text>
        {placed.map((r) => (
          <g key={r.week} className={`ds-peakbars-ring${open === r.week ? ' ds-peakbars-ring--open' : ''}${hover === r.week ? ' ds-peakbars-ring--hover' : ''}`}>
            {/* The tap area: not a control of its own; the drawing works out the nearer ring. */}
            <circle className="ds-peakbars-hit" cx={r.x} cy={r.y} r={REACH} aria-hidden="true" />
            <circle
              className="ds-peakbars-pk"
              cx={r.x}
              cy={r.y}
              r={r.r}
              role="button"
              tabIndex={0}
              aria-pressed={open === r.week}
              aria-label={ringLabel(r, today)}
              onKeyDown={onKey(r.week)}
            />
            {r.many && (
              <text className="ds-peakbars-count" x={r.x} y={r.y + 3.5} textAnchor="middle" aria-hidden="true">{r.occurrences.length}</text>
            )}
          </g>
        ))}
      </svg>
      <div role="status" className="ds-peakbars-detail-wrap">
        {shown && (
          <div className="ds-peakbars-detail">
            {shown.occurrences.map((o) => {
              const note = ringNote(o, reviews, today);
              return (
                <div key={o.key}>
                  <b>{`${o.moment.name}, ${whenWords(o.on, o.endsOn, today)}`}</b>
                  {note && <p>{note}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** months: yearMonths() from src/lib/peakMoments/model.js */
export function PeakYearList({ months, label = 'Peak moments by month' }) {
  return (
    <ul className="ds-peak-year" aria-label={label}>
      {months.map((m) => (
        <li key={m.key} className="ds-peak-mon">
          <h3>
            {m.month}
            <small>{m.sprint}</small>
          </h3>
          <div>
            {m.moments.length ? m.moments.map((x) => (
              <p key={x.key}>
                <em>{x.day}</em>
                {x.name}
                {x.until ? `, ${x.until}` : ''}
                {x.waiting && <span className="ds-peak-wait">Waiting</span>}
              </p>
            )) : <p className="ds-peak-none">Nothing marked yet</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
