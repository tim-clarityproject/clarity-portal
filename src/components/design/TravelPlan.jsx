import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Chevron from './Chevron';
import FieldLabel from './FieldLabel';
import useIsPhone from './useIsPhone';
import { chartDayLabels, stepTime } from '../../lib/travel/model';
import './travel.css';

// The Travel plan's shared parts (M21 version 7.2; Phase 8b part B). Each
// is in the design gallery.
//
//   BodyClockChart  the body clock line between home's time and away's, each
//                   time zone named above its own line, the key moments as
//                   numbered markers with a key under the chart. Its read-out
//                   works by hover, by touch scrubbing (touch-action pan-y,
//                   so the page still scrolls) and with the arrow keys; it
//                   leads with the day's key moments, then where the body
//                   clock is. No date: the day's label on the axis is
//                   highlighted instead.
//   TravelSteps     a day's rows: the time and the step, nothing else; on a
//                   day across two time zones every time has its zone under
//                   it in small grey.
//   TravelDayRow    a row of Day by day: the date (a dot on a key moment's
//                   day) over the day's line, the chevron at the right.
//   TravelTodayCard Home's "Today’s travel plan" card, during the trip only:
//                   the day's steps in time order, each with a private tick
//                   box. Nothing ever says what wasn't ticked.
//   TravelDayPanel  the Daily plan's view of the same steps, with no tick boxes.
//   PlaceField      From and To: a search over airports and cities.
//   MomentNumber    the numbered disc of a key moment.
//   PLANE           the offer row's solid plane (OfferRow icon="plane").

export function MomentNumber({ n }) {
  return <i className="ds-tc-num" aria-hidden="true">{n}</i>;
}

const geometry = (phone) => (phone
  ? { W: 340, H: 224, L: 10, R: 14, T: 46, B: 34 }
  : { W: 680, H: 244, L: 10, R: 18, T: 46, B: 34 });

/**
 * plan: makeTravelPlan's plan (not a short one).
 * label: the chart's sentence for a screen reader.
 */
export function BodyClockChart({ plan, label }) {
  const phone = useIsPhone();
  const g = geometry(phone);
  const n = plan.days.length;
  const iw = g.W - g.L - g.R;
  const ih = g.H - g.T - g.B;
  const D = plan.chart.away.level || -1;
  const X = (i) => g.L + (n > 1 ? (iw * i) / (n - 1) : iw / 2);
  const Y = (v) => g.T + ih * Math.max(-0.1, Math.min(1.1, v / D));
  const [at, setAt] = useState(null);
  const wrap = useRef(null);
  const tip = useRef(null);
  const down = useRef(null); // a touch: { index, moved }
  const liveId = useId();
  const [place, setPlace] = useState({ left: 0, side: 'right' });

  const nearest = (clientX) => {
    const r = wrap.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * g.W;
    return Math.max(0, Math.min(n - 1, Math.round(((x - g.L) / iw) * (n - 1))));
  };

  // A tap anywhere else hides the read-out.
  useEffect(() => {
    if (at == null) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setAt(null); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [at]);

  // 14px to the right of the day, flipped to the left when it would run out, centred when neither fits.
  useLayoutEffect(() => {
    if (at == null || !wrap.current || !tip.current) return;
    const w = wrap.current.getBoundingClientRect().width;
    const tw = tip.current.getBoundingClientRect().width;
    const x = (X(at) / g.W) * w;
    if (x + 14 + tw <= w) setPlace({ left: x + 14, side: 'right' });
    else if (x - 14 - tw >= 0) setPlace({ left: x - 14 - tw, side: 'left' });
    else setPlace({ left: Math.max(0, Math.min(w - tw, x - tw / 2)), side: 'middle' });
    // X depends on the layout only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, phone, n]);

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return;
    const i = nearest(e.clientX);
    down.current = { index: i, was: at, moved: false };
    setAt(i);
  };
  const onPointerMove = (e) => {
    if (e.pointerType === 'mouse') { setAt(nearest(e.clientX)); return; }
    if (!down.current) return;
    const i = nearest(e.clientX);
    if (i !== down.current.index) down.current.moved = true;
    setAt(i);
  };
  const onPointerUp = (e) => {
    if (e.pointerType === 'mouse' || !down.current) return;
    // Tapping the day that was already showing hides it.
    if (!down.current.moved && down.current.was === down.current.index) setAt(null);
    down.current = null;
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setAt((cur) => (cur == null ? 0 : Math.max(0, Math.min(n - 1, cur + step))));
    } else if (e.key === 'Escape' && at != null) {
      e.stopPropagation();
      setAt(null);
    }
  };

  const markers = plan.chart.markers;
  const byDay = new Map();
  for (const m of markers) byDay.set(m.dayIndex, [...(byDay.get(m.dayIndex) || []), m]);
  const shown = at == null ? null : {
    moments: (byDay.get(at) || []).map((m) => ({ number: m.number, words: m.time ? `${m.name}, ${m.time}` : m.name })),
    clock: plan.days[at].readout,
  };
  // Labels never touch: every other day (or fewer) where they're close, and the lit day's neighbours step back.
  const labelShown = chartDayLabels(plan.chart.points.map((p) => p.label), at, iw);
  const path = plan.chart.points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.clock).toFixed(1)}`).join(' ');

  return (
    <div className="ds-tc">
      <div
        ref={wrap}
        className="ds-tc-chart"
        // The chart is read one day at a time; the drawing itself is hidden from screen readers.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="group"
        aria-label={label}
        aria-describedby={liveId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { down.current = null; }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAt(null); }}
        onKeyDown={onKeyDown}
        onBlur={() => setAt(null)}
      >
        <svg viewBox={`0 0 ${g.W} ${g.H}`} aria-hidden="true" focusable="false">
          {[plan.chart.home, plan.chart.away].map((lv) => (
            <g key={lv.zone}>
              <line className="ds-tc-level" x1={g.L} x2={g.W - g.R} y1={Y(lv.level)} y2={Y(lv.level)} />
              <text className="ds-tc-level-name" x={g.L} y={Y(lv.level) - 8}>{lv.label}</text>
            </g>
          ))}
          {at != null && <line className="ds-tc-cursor" x1={X(at)} x2={X(at)} y1={g.T} y2={g.T + ih} />}
          {[...byDay.entries()].flatMap(([day, ms]) => ms.map((m, j) => {
            const cx = X(day) + (j - (ms.length - 1) / 2) * 22;
            const dotY = Y(plan.chart.points[day].clock);
            return (
              <g key={m.id} className="ds-tc-marker">
                <line className="ds-tc-stem" x1={cx} x2={cx} y1={23} y2={dotY - 6} />
                <circle cx={cx} cy={14} r={9} />
                <text x={cx} y={18} textAnchor="middle">{m.number}</text>
              </g>
            );
          }))}
          <path className="ds-tc-line" d={path} />
          {plan.chart.points.map((p, i) => (
            <circle key={p.date} className={`ds-tc-dot${p.moment ? ' ds-tc-dot--moment' : ''}`} cx={X(i)} cy={Y(p.clock)} r={p.moment ? 4.5 : 3} />
          ))}
          {plan.chart.points.map((p, i) => (
            <text
              key={`l${p.date}`}
              className={`ds-tc-day${at === i ? ' ds-tc-day--on' : ''}${labelShown[i] ? '' : ' ds-tc-day--hidden'}`}
              x={X(i)}
              y={g.H - 10}
              textAnchor="middle"
            >
              {p.label}
            </text>
          ))}
        </svg>
        {shown && (
          <div ref={tip} className={`ds-tc-readout ds-tc-readout--${place.side}`} style={{ left: `${place.left}px` }} aria-hidden="true">
            {shown.moments.map((m) => (
              <span key={m.number} className="ds-tc-readout-moment"><MomentNumber n={m.number} />{m.words}</span>
            ))}
            <span className={shown.moments.length ? 'ds-tc-readout-clock' : 'ds-tc-readout-clock ds-tc-readout-clock--alone'}>{shown.clock}</span>
          </div>
        )}
        <span id={liveId} className="ds-sr" aria-live="polite">
          {shown ? [plan.days[at].title, ...shown.moments.map((m) => m.words), shown.clock].join('. ') : ''}
        </span>
      </div>
      {markers.length > 0 && (
        <p className="ds-tc-key">
          {markers.map((m) => <span key={m.id}><MomentNumber n={m.number} />{m.name}</span>)}
        </p>
      )}
    </div>
  );
}

/** A step's time, with its city under it on a two-zone day; an untimed key moment reads "All day". */
function StepTime({ s, className }) {
  const t = stepTime(s);
  return (
    <span className={className}>
      {t.time}
      {t.zone && <small className="ds-tsteps-zone">{t.zone}</small>}
    </span>
  );
}

/** A day's rows: the time (with its zone under it on a two-zone day) and the step. */
export function TravelSteps({ steps, label = 'Steps', className = '' }) {
  return (
    <ul className={`ds-tsteps ${className}`.trim()} aria-label={label}>
      {steps.map((s, i) => (
        // A step's kind and time are its identity within a day; two key moments at once keep their order.
        // eslint-disable-next-line react/no-array-index-key
        <li key={`${s.kind}-${s.momentId || ''}-${i}`} className="ds-tsteps-row">
          <StepTime s={s} className="ds-tsteps-time" />
          <p className="ds-tsteps-words">{s.words}</p>
        </li>
      ))}
    </ul>
  );
}

/** One row of Day by day. */
export function TravelDayRow({ title, line, moment = false, today = false, onClick }) {
  return (
    <li>
      <button type="button" className="ds-tday" onClick={onClick} aria-label={`${title}${today ? ', today' : ''}. ${line}`}>
        <span className="ds-tday-words">
          <b className={moment ? 'ds-tday-title ds-tday-title--moment' : 'ds-tday-title'}>{title}</b>
          <span className="ds-tday-line">{line}</span>
        </span>
        <Chevron direction="right" size="sm" />
      </button>
    </li>
  );
}

const TICK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

/** Home's card, during the trip only. ticks: { [key]: true }; onTick(step, on). */
export function TravelTodayCard({ line, steps, ticks = {}, keyOf, onTick, onOpen }) {
  return (
    <section className="ds-tcard" aria-labelledby="ds-tcard-title">
      <span className="ds-tcard-label">Today’s travel plan</span>
      <h2 id="ds-tcard-title" className="ds-tcard-title">{line}</h2>
      <ul className="ds-tcard-list">
        {steps.map((s) => {
          const key = keyOf(s);
          const on = ticks[key] === true;
          return (
            <li key={key} className="ds-tcard-row">
              <button
                type="button"
                role="checkbox"
                className="ds-check-box ds-tcard-tick"
                aria-checked={on}
                aria-label={`Mark as done: ${s.words}`}
                onClick={() => onTick(s, !on)}
              >
                <span>{TICK}</span>
              </button>
              <StepTime s={s} className="ds-tcard-time" />
              <span className="ds-tcard-words">{s.words}</span>
            </li>
          );
        })}
      </ul>
      <button type="button" className="ds-link ds-tcard-open" onClick={onOpen}>See today’s plan</button>
    </section>
  );
}

/** The Daily plan's view of today's travel steps: rows with their times, no tick boxes. */
export function TravelDayPanel({ steps, onOpen }) {
  return (
    <div className="ds-tpanel">
      <span className="ds-tpanel-label">Today’s travel plan</span>
      <ul className="ds-tpanel-list">
        {steps.map((s, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <li key={`${s.kind}-${i}`} className="ds-tpanel-row">
            <StepTime s={s} className="ds-tpanel-time" />
            <span>{s.words}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="ds-link ds-tpanel-open" onClick={onOpen}>Open today’s travel plan</button>
    </div>
  );
}

/**
 * From or To (M21 version 7.2): a box that searches airports and cities as
 * it's typed into, its list floating under it. Up and Down move, Enter
 * picks, Escape puts back what was there. Focusing it empties the search.
 * value: a place ({ name, city, zone }) or null; search(query) => places.
 */
export function PlaceField({ label, value, onChange, search, placeholder = 'City or airport' }) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState(null); // null: showing the chosen place
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const results = query != null && query.trim() ? search(query) : [];
  const open = query != null && query.trim().length > 0;
  const pick = (p) => {
    onChange(p);
    setQuery(null);
    setActive(0);
  };
  return (
    <div className="ds-place">
      <FieldLabel label={label} htmlFor={id} />
      <div className="ds-place-box">
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          className="ds-field"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? `${id}-o${active}` : undefined}
          placeholder={placeholder}
          value={query ?? (value ? value.name : '')}
          onFocus={() => { setQuery(''); setActive(0); }}
          onBlur={() => setQuery(null)}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter' && open) { e.preventDefault(); if (results[active]) pick(results[active]); }
            else if (e.key === 'Escape' && query != null) { e.preventDefault(); e.stopPropagation(); setQuery(null); input.current?.blur(); }
          }}
        />
        {open && (
          <div className="ds-place-list" id={listId} role="listbox" aria-label={label}>
            {results.length ? results.map((p, i) => (
              <div
                key={p.key}
                id={`${id}-o${i}`}
                role="option"
                aria-selected={i === active}
                className={`ds-place-option${i === active ? ' ds-place-option--on' : ''}`}
                // Picked before the box loses focus.
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              >
                <span className="ds-place-words"><b>{p.name}</b><small>{p.line}</small></span>
                {p.code && <span className="ds-place-code">{p.code}</span>}
              </div>
            )) : (
              <p className="ds-place-none">{`No airport matches “${query.trim()}”. Try the city or the 3-letter code.`}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The offer row's plane (M21): one solid icon, turned 35 degrees, in the secondary grey. */
export const PLANE = (
  <svg className="ds-offer-icon ds-offer-icon--plane" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M22 12C22 12.6 21.4 12.9 20.6 12.9L14.2 12.9L9.6 20.2L8.4 20.2L10.8 12.9L5.6 12.9L3.9 15.3L3.1 15.3L3.9 12.6Q3.2 12 3.9 11.4L3.1 8.7L3.9 8.7L5.6 11.1L10.8 11.1L8.4 3.8L9.6 3.8L14.2 11.1L20.6 11.1C21.4 11.1 22 11.4 22 12Z" />
  </svg>
);
