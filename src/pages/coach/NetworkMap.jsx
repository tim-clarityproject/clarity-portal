import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartTips, Dropdown, SearchField, tipProps, useIsPhone } from '../../components/design';
import { networkMapOf, networkPageOf } from '../../lib/coach/networkData';
import { findQuery, MAP_CHART, MAP_HELP, MAP_LABEL, MAP_LIMIT, MAP_SHOW, MAP_WORDS, mapLine, mapSpots, networkProblem, NETWORK_LOAD_PROBLEM, spotCard, spotLine, withFound } from '../../lib/coach/network';
import { useCoachPortal } from './parts';
import { HelpLink } from './help';
import { useNetworkAsk } from './networkParts';
import { SpotPanel } from './NetworkPanels';

// Network's map, Where to focus (M11 seq 77; Tim, 19 Nov, 12:59 to 15:54):
// influence up and trust across, 0 to 10, with ONE shared 0 at the corner,
// a faint point at every spot and hairline lines at 7, each labelled "7 or
// more" once, outside the chart. Up to 150 people (focus lists first, then
// who you spoke to most recently). One same-size dot a spot, with the
// number inside when people share it: a single dot opens the person, a
// numbered dot the list of names there. A dot's style says where to focus
// (never coral); there is no key: "How to read the map" opens the side
// panel. Pointing at a dot, or keyboard focus, shows its pop-up card; the
// tap areas are 44px and the nearest dot wins where they overlap.

const FIND_WAIT = 250;
/** The chart's own measures, in px: a laptop's (M11's 720 by 500) and a phone's (356 by 372). */
const WIDE = { left: 40, right: 76, top: 44, stepY: 40, bottom: 56, r: 9.5 };
const NARROW = { left: 30, right: 14, top: 40, bottom: 50, r: 8.5 };
const TAP = 22;

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.round(el.getBoundingClientRect().width));
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref]);
  return w;
}

export default function NetworkMap({ onOpen }) {
  const { userId, todayKey } = useCoachPortal();
  const phone = useIsPhone();
  const [show, setShow] = useState('everyone');
  const [typed, setTyped] = useState('');
  const [hits, setHits] = useState(null); // Find someone's answers, while it is typed
  const [found, setFound] = useState(null); // the person found
  const [spot, setSpot] = useState(null);
  const wrap = useRef(null);
  const width = useWidth(wrap);
  const map = useNetworkAsk(() => networkMapOf(userId, { show, limit: MAP_LIMIT, today: todayKey }), [userId, show, todayKey]);

  // Find someone searches everyone active, a few at a time, as it is typed.
  useEffect(() => {
    const q = typed.trim();
    if (!q || (found && found.name === typed)) { setHits(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => {
      networkPageOf(userId, findQuery(q, todayKey)).then((page) => { if (live) setHits(page.rows); }).catch(() => { if (live) setHits([]); });
    }, FIND_WAIT);
    return () => { live = false; clearTimeout(timer); };
  }, [typed, found, userId, todayKey]);

  const placed = useMemo(() => withFound(map.data?.rows || [], found), [map.data, found]);
  const spots = useMemo(() => mapSpots(placed.rows, { foundId: placed.placed ? found?.id : null }), [placed, found]);
  const line = map.data ? mapLine(map.data, show) : '';

  const narrow = width > 0 && width < 560;
  const g = narrow ? { ...NARROW, stepY: Math.round(((width - NARROW.left - NARROW.right) / 10) * 9) / 10 } : WIDE;
  const stepX = width > 0 ? (width - g.left - g.right) / 10 : 0;
  const height = g.top + g.stepY * 10 + g.bottom;
  const x = (trust) => g.left + trust * stepX;
  const y = (influence) => g.top + (10 - influence) * g.stepY;
  const lineX = x(MAP_CHART.lineAt - 0.5);
  const lineY = y(MAP_CHART.lineAt - 0.5);

  const choose = (el) => {
    const s = spots.find((k) => k.key === el.getAttribute('data-spot'));
    if (!s) return;
    if (s.count === 1) onOpen(s.ids[0]); else setSpot(s);
  };
  const pick = (p) => { setFound(p); setTyped(p.name); setHits(null); if (show !== 'everyone') setShow('everyone'); };

  return (
    <div className="cc-fade">
      <div className="cc-net-ctl cc-net-ctl--map">
        <div className="cc-net-show"><Dropdown label={MAP_WORDS.show} options={MAP_SHOW.map(([value, label]) => ({ value, label }))} value={show} onChange={(v) => { setShow(v); setFound(null); setTyped(''); }} /></div>
        <div className="cc-net-find">
          <SearchField label={MAP_WORDS.find} placeholder={MAP_WORDS.find} value={typed} onChange={(v) => { setTyped(v); if (found && v !== found.name) setFound(null); }} />
          {hits && (
            <div className="cc-pop cc-net-hits" id="cc-net-found" role="listbox" aria-label="People found">
              {hits.length === 0 && <p className="cc-pop-label">Nobody matches that.</p>}
              {hits.map((p) => <button key={p.id} type="button" role="option" aria-selected="false" className="cc-pop-item" onClick={() => pick(p)}><span>{p.name}{p.organisation ? <small> {p.organisation}</small> : null}</span></button>)}
            </div>
          )}
        </div>
      </div>
      {line && <p className="cc-net-count cc-net-mapline">{line}</p>}
      {found && !placed.placed && <p className="cc-quiet" role="status">{placed.line}</p>}
      {map.error && !map.data && <p className="cc-problem" role="alert">{map.error.code === 'OFFLINE' || map.error.code === 'NO_ROOM' ? networkProblem(map.error) : NETWORK_LOAD_PROBLEM}</p>}
      {map.data && spots.length === 0 && <p className="cc-quiet">{show === 'everyone' ? MAP_WORDS.empty : MAP_WORDS.noneInShow}</p>}
      <div className="cc-net-map" ref={wrap}>
        {width > 0 && map.data && (
          <ChartTips nearest onChoose={choose}>
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={MAP_LABEL}>
              <g aria-hidden="true">
                {Array.from({ length: 121 }, (_, i) => <circle key={i} className="cc-net-point" cx={x(i % 11)} cy={y(Math.floor(i / 11))} r="1" />)}
                <line className="cc-net-seven" x1={lineX} y1={g.top - 14} x2={lineX} y2={y(0) + 8} />
                <line className="cc-net-seven" x1={g.left - 8} y1={lineY} x2={narrow ? width : x(10) + 6} y2={lineY} />
                <text className="cc-net-tick" data-chart-label x={lineX + 6} y={g.top - 18}>{MAP_CHART.lineLabel}</text>
                {narrow
                  ? <text className="cc-net-tick cc-net-halo" data-chart-label x={g.left + 4} y={lineY + 14}>{MAP_CHART.lineLabel}</text>
                  : <text className="cc-net-tick" data-chart-label x={x(10) + 12} y={lineY + 3.5}>{MAP_CHART.lineLabel}</text>}
                <text className="cc-net-tick" x={g.left - 14} y={y(0) + 4} textAnchor="end">{MAP_CHART.min}</text>
                <text className="cc-net-tick" x={g.left - 14} y={y(10) + 4} textAnchor="end">{MAP_CHART.max}</text>
                <text className="cc-net-tick" x={x(10)} y={y(0) + 24} textAnchor="middle">{MAP_CHART.max}</text>
                <text className="cc-net-axis" data-chart-label x={g.left - 14} y={g.top - 18}>{MAP_CHART.up}</text>
                <text className="cc-net-axis" data-chart-label x={x(10)} y={y(0) + 44} textAnchor="end">{MAP_CHART.across}</text>
              </g>
              {spots.map((s) => {
                const card = spotCard(s, placed.rows, todayKey);
                const tip = phone ? { value: spotLine(s, placed.rows, todayKey), wide: true } : card;
                const left = s.trust >= 8;
                return (
                  <g key={s.key} className={`cc-net-dot cc-net-dot--${s.style}${s.found ? ' cc-net-dot--found' : ''}`} transform={`translate(${x(s.trust)} ${y(s.influence)})`} {...tipProps(tip)} role="button" aria-label={`${s.label} Open`} data-spot={s.key} data-opens="true">
                    <circle className="cc-net-tap" r={TAP} />
                    {s.style === 'keep_close' && <circle className="cc-net-ring" r={g.r + 3} />}
                    {s.found && <circle className="cc-net-found" r={g.r + 5} />}
                    <circle className="cc-net-o" r={g.r} />
                    {s.number && <text className="cc-net-num" y="3.6" textAnchor="middle">{s.number}</text>}
                    {s.found && <text className="cc-net-named cc-net-halo" x={left ? -(g.r + 9) : g.r + 9} y="4" textAnchor={left ? 'end' : 'start'}>{s.name}</text>}
                  </g>
                );
              })}
            </svg>
          </ChartTips>
        )}
      </div>
      <div className="cc-acts"><HelpLink helpKey="network-map" explain={{ title: MAP_WORDS.help, terms: MAP_HELP.map(([term, meaning]) => ({ term, meaning })) }}>{MAP_WORDS.help}</HelpLink></div>
      <SpotPanel spot={spot} rows={placed.rows} onClose={() => setSpot(null)} onOpen={(id) => { setSpot(null); onOpen(id); }} />
    </div>
  );
}
