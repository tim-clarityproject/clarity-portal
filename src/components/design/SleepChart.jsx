import { useLayoutEffect, useRef, useState } from 'react';
import ChartTips, { tipProps } from './ChartTips';
import useIsPhone from './useIsPhone';
import { hoursFigure, qualityWords, rangeWords, sleepScaleTop } from '../../lib/performance/sleepChart';
import './design.css';

// The sleep chart (Recovery's Home; approved by Tim, 3 Nov 2026, 14:26).
// One bar per night of the Recovery, drawn to scale from zero, in the same
// colours as every chart (26 Oct design rules): nights inside or above the
// person's target range mint, nights below it the below-standard grey,
// nights to come (or not answered) a faint 2px stub. Coral is never a data
// colour.
//
// No key (26 Oct rule 3): the target range is a faint mint band between
// two thin dashed mint lines, labelled in place ("Your target range 7 to
// 9 hours"): to the right of the chart on a laptop, in a thin strip above
// its right end on a phone, so the label never covers a bar. Only last
// night's figure is written above its bar. Along the bottom, "Day 1",
// "Day 2" and so on, with "Last night" under the latest bar; on a phone
// only every other day is named, and fewer still when the names would
// touch (a long Recovery, or the largest text size). Every bar has the
// shared pop-up (ChartTips): the hours, larger, then the day and its
// night ("Day 4, night of 23 Oct."), then its quality.
//
// Before there are two nights, the empty frame with one line saying when
// it starts.
//
// slots:  recoverySleepView().slots
// target: { from, to, own }
// note:   a line under the range's label ("Suggested for adults aged 18
//         to 64." until the person changes it), or null
// grow:   the date of a bar just answered: it grows in once (none with
//         reduced motion)
// enough: two nights or more hold hours
// empty:  the one line for the empty frame

const LABEL_GAP = 8; // px between two names along the bottom
// A long Recovery (up to 90 days): past this many days the gaps between
// bars go and each bar takes part of its column, so none gets too thin.
const DENSE_FROM = 28;

function tipFor(s) {
  // The pop-up names the day as the axis does, then the night it holds.
  const when = `${s.day}, ${s.night.charAt(0).toLowerCase()}${s.night.slice(1)}.`;
  if (s.state === 'next') return tipProps({ value: 'To come', when });
  const q = qualityWords(s.quality);
  if (s.state === 'none') {
    // Quality answered without the hours: say which part is missing.
    return q
      ? tipProps({ value: 'Hours not answered', when, extra: [`Quality: ${q}.`] })
      : tipProps({ value: 'Not answered', when });
  }
  return tipProps({ value: `${hoursFigure(s.hours)} hours`, when, extra: q ? [`Quality: ${q}.`] : [] });
}

// Which names along the bottom fit: "Last night" always, Day 1 whenever it
// can, then every `step` days (2 at least on a phone), never touching each
// other. A name at either end of the chart is moved in so it never sticks
// out past it. Measured, so it holds at every width and text size.
function useAxisNames(slots, phone) {
  const axisRef = useRef(null);
  const [names, setNames] = useState(() => ({ shown: slots.map(() => true), nudge: slots.map(() => 0) }));
  useLayoutEffect(() => {
    const axis = axisRef.current;
    if (!axis) return undefined;
    const fit = () => {
      const spans = [...axis.children];
      if (!spans.length) return;
      const box = axis.getBoundingClientRect();
      const colW = box.width / spans.length;
      const widths = spans.map((sp) => sp.firstChild?.getBoundingClientRect().width || 0);
      const centres = spans.map((sp) => {
        const r = sp.getBoundingClientRect();
        return r.left - box.left + r.width / 2;
      });
      // Where each name sits once kept inside the chart's ends.
      const nudge = widths.map((w, i) => {
        const left = centres[i] - w / 2;
        const right = centres[i] + w / 2;
        if (left < 0) return -left;
        if (right > box.width) return box.width - right;
        return 0;
      });
      const at = (i) => [centres[i] + nudge[i] - widths[i] / 2, centres[i] + nudge[i] + widths[i] / 2];
      const apart = (i, j) => {
        const [a1, a2] = at(i);
        const [b1, b2] = at(j);
        return a2 + LABEL_GAP <= b1 || b2 + LABEL_GAP <= a1;
      };
      const lastIdx = slots.findIndex((sl) => sl.last);
      const widest = Math.max(...widths.filter((_, i) => i !== lastIdx), 0);
      // The smallest even step at which every name kept clears the one
      // before it, so the names stay evenly spaced (only those too near
      // "Last night" give way to it).
      const pick = (step) => {
        const kept = [];
        for (let i = 0; i < slots.length; i += step) {
          if (i === lastIdx) continue;
          if (lastIdx >= 0 && !apart(i, lastIdx)) continue;
          if (kept.length && !apart(i, kept[kept.length - 1])) return null;
          kept.push(i);
        }
        return kept;
      };
      let step = phone ? 2 : 1;
      while (step < spans.length && step * colW < widest + LABEL_GAP) step += 1;
      let kept = pick(step);
      while (!kept && step < spans.length) {
        step += 1;
        kept = pick(step);
      }
      kept = kept || [];
      if (lastIdx >= 0) kept.push(lastIdx);
      const shown = slots.map((_, i) => kept.includes(i));
      const next = { shown, nudge: nudge.map((n) => Math.round(n)) };
      setNames((old) => (
        old.shown.length === shown.length
        && old.shown.every((v, i) => v === shown[i])
        && old.nudge.every((v, i) => v === next.nudge[i]) ? old : next
      ));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(axis);
    return () => watch.disconnect();
  }, [slots, phone]);
  return { axisRef, ...names };
}

// The range's label beside the chart: level with the middle of the band,
// held inside the chart's height. When it's taller than the chart (the
// largest text sizes) it goes to the strip above the chart, as on a phone.
// Measured at the side column's width, so it comes back when it fits.
function useSideLabel(mid, phone) {
  const plotRef = useRef(null);
  const sideRef = useRef(null);
  const [place, setPlace] = useState({ top: null, strip: false });
  useLayoutEffect(() => {
    const plot = plotRef.current;
    const side = sideRef.current;
    if (phone || !plot || !side) return undefined;
    const fit = () => {
      const H = plot.getBoundingClientRect().height;
      const h = side.getBoundingClientRect().height;
      const next = h > H
        ? { top: null, strip: true }
        : { top: Math.round(Math.max(h / 2, Math.min(H - h / 2, (mid / 100) * H))), strip: false };
      setPlace((old) => (old.top === next.top && old.strip === next.strip ? old : next));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(plot);
    watch.observe(side);
    return () => watch.disconnect();
  }, [mid, phone]);
  return { plotRef, sideRef, ...place };
}

export default function SleepChart({ slots, target, note = null, grow = null, enough, empty, label = 'Sleep each night of your recovery' }) {
  const phone = useIsPhone();
  const { axisRef, shown, nudge } = useAxisNames(slots, phone);
  const top = sleepScaleTop(slots, target);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const mid = 100 - ((target.from + target.to) / 2 / top) * 100;
  const side = useSideLabel(mid, phone);
  const strip = phone || side.strip;
  const labelWords = (
    <>
      <span className="ds-schart-range-name">
        {'Your target range '}
        <span className="ds-keep">{rangeWords(target)}</span>
      </span>
      {note && <span className="ds-schart-range-note">{note}</span>}
    </>
  );

  if (!enough) {
    return (
      <div className="ds-schart ds-schart--empty">
        <div className="ds-schart-frame">
          <p className="ds-chart-empty ds-schart-empty-line">{empty}</p>
        </div>
      </div>
    );
  }

  return (
    <ChartTips className={`ds-schart${slots.length > DENSE_FROM ? ' ds-schart--dense' : ''}`}>
      {strip && <p className="ds-schart-range-strip">{labelWords}</p>}
      <div className={`ds-schart-grid${strip ? ' ds-schart-grid--strip' : ''}`}>
        <div className="ds-schart-plot" ref={side.plotRef} role="group" aria-label={`${label}, in hours`}>
          <span className="ds-schart-band" style={{ bottom: pct(target.from), height: `calc(${pct(target.to)} - ${pct(target.from)})` }} aria-hidden="true" />
          {slots.map((s, i) => {
            const has = s.state === 'good' || s.state === 'below';
            // At either end of the chart the figure lines up with its bar's
            // outer edge, so it never sticks out past the chart.
            let end = '';
            if (i === slots.length - 1) end = ' ds-schart-tag--end';
            else if (i === 0) end = ' ds-schart-tag--start';
            return (
              <div className="ds-schart-col" key={s.date}>
                <i
                  className={`ds-schart-bar ds-schart-bar--${s.state}${has && grow === s.date ? ' ds-schart-bar--grow' : ''}`}
                  style={{ height: has ? pct(s.hours) : undefined }}
                  {...tipFor(s)}
                >
                  {s.last && has && <em className={`ds-schart-tag${end}`} aria-hidden="true">{hoursFigure(s.hours)}</em>}
                </i>
              </div>
            );
          })}
        </div>
        {!phone && (
          <p className="ds-schart-range-side" aria-hidden={side.strip || undefined}>
            <span className="ds-schart-range-at" ref={side.sideRef} style={{ top: side.top == null ? `${mid}%` : `${side.top}px` }}>{labelWords}</span>
          </p>
        )}
        <div className="ds-schart-axis" ref={axisRef} aria-hidden="true">
          {slots.map((s, i) => (
            <span key={s.date} className={`${s.last ? 'ds-schart-now' : ''}${shown[i] ? '' : ' ds-schart-axis-off'}`.trim() || undefined}>
              <span style={nudge[i] ? { '--nudge': `${nudge[i]}px` } : undefined}>{s.axis}</span>
            </span>
          ))}
        </div>
      </div>
    </ChartTips>
  );
}
