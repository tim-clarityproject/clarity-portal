import { areaName } from '../../lib/wheelOfLife';

// Shared by WheelSectional and WheelRadar: the size presets and the data
// mapping, ported from the approved mock-up (wheel-of-life.html: the W
// presets in R.onepager, the mini wheel in R.rate, and svgLab).

/**
 * Size presets, as the mock-up: the one-pager on desktop and on phone, and
 * the small live wheel on the rating screens.
 */
export const WHEEL_SIZES = {
  desktop: { w: 680, h: 440, cx: 340, cy: 220, R: 140, fs: 13, lg: 16, wrap: 18 },
  phone: { w: 340, h: 300, cx: 170, cy: 150, R: 74, fs: 12, lg: 10, wrap: 12 },
  mini: { w: 230, h: 230, cx: 115, cy: 115, R: 86, fs: 10, lg: 0 },
};

/**
 * The preset for a wheel. Radar on the one-pager adds 8 to the radius and
 * to the label gap, so its outer ring meets the sectional's rim and
 * switching views does not resize the wheel (the mock-up's WR).
 * @param {'desktop'|'phone'|'mini'} size
 * @param {boolean} radar
 */
export function sizeFor(size, radar) {
  const o = WHEEL_SIZES[size] || WHEEL_SIZES.mini;
  if (radar && size !== 'mini') return { ...o, R: o.R + 8, lg: o.lg + 8 };
  return o;
}

/**
 * Turns the areas and keyed scores into the arrays the drawings walk (the
 * mock-up's remap): one entry per area on the wheel, in wheel order.
 * @param {object[]} areas - the active areas
 * @param {Array<{ cls: 'now'|'start'|'o', scores: object }>} series
 * @param {object|null} targets - { key: target|null } or null for none
 * @param {object|null} labelValues - { key: score } shown beside each label
 */
export function remap(areas, series, targets, labelValues) {
  const keys = areas.map((a) => a.key);
  const val = (map, k) => (map && typeof map[k] === 'number' ? map[k] : null);
  const mapped = (series || []).map((sr) => ({ cls: sr.cls, v: keys.map((k) => val(sr.scores, k)) }));
  const now = mapped.find((sr) => sr.cls === 'now')?.v || null;
  const start = mapped.find((sr) => sr.cls === 'start')?.v || null;
  return {
    N: keys.length,
    names: areas.map(areaName),
    series: mapped,
    tgt: targets ? keys.map((k) => val(targets, k)) : null,
    labVals: labelValues ? keys.map((k) => val(labelValues, k)) : null,
    now,
    start,
    // Areas that went up since the start of the range: only these are
    // green (Tim, 26 Oct: mint dots and figures only on areas that rose).
    rose: keys.map((k, i) => !!(now && start && now[i] != null && start[i] != null && now[i] > start[i])),
  };
}

/**
 * What one area's pop-up says, as a small card (tidy pass, item 15): the
 * area, then its score, when, how it moved since the start of the range and
 * its target as label and value rows.
 * @param {object} M - from remap
 * @param {number} i - the area's place on the wheel
 * @param {{ when?: string, startWhen?: string }} dates - "Sat 3 Oct"
 */
export function areaTip(M, i, { when, startWhen } = {}) {
  const v = M.now ? M.now[i] : null;
  const s = M.start ? M.start[i] : null;
  const rows = [['Score', v == null ? 'No score' : `${v}/10`]];
  if (when) rows.push(['Latest', when]);
  if (v != null && s != null && startWhen) {
    const label = `Since ${startWhen}`;
    if (v > s) rows.push([label, `Up ${v - s} from ${s}`]);
    else if (v < s) rows.push([label, `Down ${s - v} from ${s}`]);
    else rows.push([label, 'The same']);
  }
  if (M.tgt && M.tgt[i] != null) rows.push(['Target', v != null && v >= M.tgt[i] ? `${M.tgt[i]} (reached)` : `${M.tgt[i]}`]);
  return { title: M.names[i], rows };
}
