import { useContext, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import {
  Button,
  ChartTable,
  ChartTips,
  CheckinChart,
  CoachSees,
  DisclosureArrow,
  Dropdown,
  LoadError,
  Loading,
  ObjectiveNumbers,
  PageHeader,
  PatternCard,
  PerformanceSystem,
  RecoveryNotice,
  SegmentedControl,
  SleepChart,
  SleepTargetEditor,
  SleepTargetLink,
  Stat,
  WhoSees,
  keepWords,
  tipProps,
  useIsPhone,
  useSleepTarget,
  EmptyState,
} from '../../components/design';
import { useCachedLoad } from '../../lib/pageCache';
import { loadDashboard, saveSharing } from '../../lib/performance/api';
import { DASHBOARD_CACHE, DASHBOARD_TITLE, SLEEP_EMPTY, SLEEP_LABEL, SPANS, dashboardView } from '../../lib/performance/dashboard';
import { useLatestWhenSuperseded } from '../../lib/performance/hooks';
import { localToday, openRecovery } from '../../lib/performance/rows';
import { recoveryLead } from '../../lib/performance/recovery';
import { tripsWords } from '../../lib/performance/checkin';
import { SLEEP_SUGGESTED_LINE } from '../../lib/performance/sleepChart';
import { dayName } from '../../lib/performance/sprintPage';
import { areaName } from '../../lib/wheelOfLife';
import { patternsRow } from '../../lib/performance/patterns';
import { DashboardCustomise, useDashboardPrefs, useFold } from './DashboardCustomise';
import { usePatterns } from './usePatterns';

// The Individual Performance Dashboard (mock-up M4 v47, approved by Tim on
// 26 Oct; Phase 5 step 2): the mirror. At a glance, what's improving and
// what's holding someone back, with one tap to act on each, then the work
// behind it. Every figure comes from dashboardView (dashboard.js), which
// takes each from src/lib/scores.
//
// Top to bottom, as M4: the title with the page's eye and How the system
// fits together; the score this sprint with its glance figure, one line
// against the standard and the one big chart (the weeks to the end of the
// sprint, the usual range as a band, the standard labelled at its right
// end, Best on its bar, Week 1 and This week along the bottom);
// this week's logging line and the debrief when it's ready; then Current
// sprint (What's improving, What's holding you back), Objectives and
// Strategies (with the time switch, which changes only that section) and
// What's behind your performance (one row each, folded, with the figure
// and a small chart beside it). Each section opens and closes from its
// heading, with a one-line summary when closed, and the page remembers
// what each person left open (DashboardCustomise.jsx). Customise my
// dashboard at the bottom.
//
// On a phone the big chart is full width, the small charts in the rows
// become just the figure, and a line that repeats a small chart shows only
// when the chart is tapped (26 Oct rule 10). Patterns in your numbers
// (Phase 5 step 3, usePatterns and patterns.js) is a row in What's behind
// once there is enough data to check: its cards, or "No clear link yet".
// The coach's "View as" waits for Phase 6a, and the PDF isn't in this step.

const pct = (v, top = 100) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const [today] = useState(() => localToday());
  const loaded = useCachedLoad({ userId, name: DASHBOARD_CACHE, load: () => loadDashboard(userId, today) });
  useLatestWhenSuperseded(loaded.reload);
  const [target, changeTarget] = useSleepTarget();
  const [settings] = useDashboardPrefs();
  const [closed, toggle] = useFold();
  const [span, setSpan] = useState('sprint');
  const [showResults, setShowResults] = useState(false);
  const [system, setSystem] = useState(false);
  const [customise, setCustomise] = useState(false);
  const phone = useIsPhone();
  const pat = usePatterns(today);
  const patRow = useMemo(() => patternsRow(pat.state, today, pat.built?.names), [pat.state, pat.built, today]);
  const view = useMemo(
    () => (loaded.data ? dashboardView(loaded.data, { today, span, target, showResults, patterns: patRow }) : null),
    [loaded.data, today, span, target, showResults, patRow],
  );

  const coach = loaded.data?.coach?.firstName || null;
  const shared = Boolean(coach) && loaded.data?.checkinShared !== false;
  const setShared = async (on) => {
    loaded.setData((d) => ({ ...d, checkinShared: on }));
    try {
      await saveSharing(userId, 'checkin', on);
    } catch (e) {
      loaded.setData((d) => ({ ...d, checkinShared: !on }));
      throw e;
    }
  };
  const go = (fix) => navigate(`${fix.to}${fix.hash || ''}`, fix.state ? { state: fix.state } : undefined);

  let body;
  if (!view && loaded.error) {
    body = <LoadError>Your dashboard didn’t load. Check your connection and try again.</LoadError>;
  } else if (!view) {
    body = <Loading label="Loading your dashboard" className="ds-loading--page" />;
  } else {
    const recovery = openRecovery(loaded.data.recoveries || []);
    const sections = {
      // Hidden until there's an objective or a Strategy to show (declutter, Tim, 5 Nov).
      chain: !settings.hidden.chain && (view.chain.objectives.rows.length > 0 || view.chain.strategies.rows.length > 0) && <ChainSection key="chain" view={view} closed={closed} toggle={toggle} span={span} setSpan={setSpan} phone={phone} />,
      more: !settings.hidden.more && <BehindSection key="more" view={view} closed={closed} toggle={toggle} phone={phone} target={target} changeTarget={changeTarget} coach={coach} shared={shared} setShared={setShared} navigate={navigate} go={go} hidePattern={pat.hide} />,
    };
    body = (
      <>
        {recovery && (
          <RecoveryNotice
            className="dash-recovery"
            lead={recoveryLead(recovery, today)}
            lines={[showResults ? 'Your results show as normal for this visit.' : 'Your scores and standards are hidden until you’re back.']}
            action={showResults ? null : { label: 'Show my results', onClick: () => setShowResults(true) }}
          />
        )}
        {!view.hidden && (
          <>
            {!settings.hidden.hero && <Hero hero={view.hero} phone={phone} navigate={navigate} state={view.state} />}
            {view.debrief && (
              <div className="dash-debrief">
                <span>Your weekly debrief is ready.</span>
                <Button variant="text" onClick={() => navigate('/performance-sprint/debrief')}>Start my debrief</Button>
              </div>
            )}
            {!settings.hidden.sum && view.current && <CurrentSprint current={view.current} closed={closed} toggle={toggle} phone={phone} go={go} />}
            {settings.order.map((key) => sections[key])}
          </>
        )}
        <div className="dash-foot">
          <Button variant="text" onClick={() => setCustomise(true)}>Customise my dashboard</Button>
        </div>
      </>
    );
  }

  const parts = coach ? [{ key: 'checkin', label: 'Your Hardware and Software check-in', shared }] : [];
  return (
    <div className="ui-root">
      <DesignHeader />
      <main className="plan-page dash-page">
        {phone && <div className="plan-back-row"><BackLink onClick={() => navigate('/personal')} label="Personal" /></div>}
        {/* The eye once, beside the title (Tim, 5 Nov, 11:09). */}
        <PageHeader
          title={DASHBOARD_TITLE}
          aside={view ? (coach ? <CoachSees parts={parts} coachName={coach} onToggle={(_k, on) => setShared(on)} /> : <WhoSees audience="me" />) : null}
        />
        {body}
      </main>
      <PerformanceSystem open={system} onClose={() => setSystem(false)} />
      <DashboardCustomise open={customise} onClose={() => setCustomise(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- the top

function Hero({ hero, phone, navigate, state }) {
  // Before there's data: one calm card, one line and one action, never
  // "Not yet" in the big figure style (Tim, 5 Nov, 11:04).
  if (hero.empty) {
    return (
      <EmptyState
        question={hero.lines[0]}
        action={state === 'none' ? { label: 'Start my first sprint', onClick: () => navigate('/performance-sprint/start') } : null}
      />
    );
  }
  const noFigure = hero.value === 'Not yet';
  return (
    <section className="dash-hero" aria-label={hero.label}>
      <div className="dash-hero-num">
        <span className="dash-hero-label">{hero.label}</span>
        <span className="dash-hero-row">
          {!noFigure && <strong className={`dash-hero-value${hero.good ? ' dash-hero-value--good' : ''}`}>{hero.value}</strong>}
          {hero.change && (
            <ChartTips className="dash-glance-tips">
              <span className={`dash-glance${hero.change.up ? ' dash-glance--up' : ''}`} {...tipProps({ value: hero.change.words, when: 'Since last sprint' })}>
                <span aria-hidden="true">{hero.change.text}</span>
              </span>
            </ChartTips>
          )}
        </span>
        {hero.lines.map((l) => <span key={l} className="dash-hero-line">{l}</span>)}
      </div>
      {hero.chart && (
        <div className="dash-hero-chart">
          <HeroChart chart={hero.chart} phone={phone} />
          {hero.chart.enough && (
            <ChartTable
              caption="Performance score week by week"
              columns={[{ key: 'week', label: 'Week' }, { key: 'score', label: 'Performance score' }]}
              rows={hero.chart.table}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The one big chart (M4 hero): one bar per week to the end of the sprint,
 * drawn to scale from zero (the shared week chart's rule), mint at or above
 * the standard, grey below, this week in the text colour, weeks to come a
 * faint stub. The usual range is a pale band with its own pop-up, the
 * standard a dashed line labelled at its right end ("85%" alone on a
 * phone), "Best" on the best week of this sprint, "Week 1" under the
 * sprint's first week and "This week" under this one (Tim, 5 Nov), and an
 * earlier sprint's name under its first week. No key.
 */
function HeroChart({ chart, phone }) {
  if (!chart.enough) return <p className="ds-chart-empty dash-empty">{chart.empty}</p>;
  const { standard, band, bars } = chart;
  return (
    <ChartTips className="dash-hchart">
      <div className="dash-hchart-plot" role="group" aria-label={`Performance score week by week, against your standard of ${standard}%`}>
        {band && <span className="dash-hchart-band" style={{ bottom: pct(band.low), height: `calc(${pct(band.high)} - ${pct(band.low)})` }} {...tipProps(band.tip)} />}
        <span className="dash-hchart-std" style={{ bottom: pct(standard) }} aria-hidden="true">
          <span className="dash-hchart-std-label">{phone ? `${standard}%` : `Standard ${standard}%`}</span>
        </span>
        {bars.map((b) => {
          const has = b.value != null && b.state !== 'next';
          return (
            <div className="dash-hchart-col" key={b.key}>
              <i className={`dash-hchart-bar dash-hchart-bar--${b.state}`} style={{ height: has ? pct(b.value) : undefined }} {...tipProps(b.tip)}>
                {!phone && b.best && <em className="dash-hchart-tag" aria-hidden="true">Best</em>}
              </i>
            </div>
          );
        })}
      </div>
      <div className="dash-hchart-axis" aria-hidden="true">
        {bars.map((b) => (
          <span key={b.key} className={b.state === 'now' ? 'dash-hchart-now' : undefined}>
            {b.sprintLabel || ''}
          </span>
        ))}
      </div>
    </ChartTips>
  );
}

// ---------------------------------------------------------------- small charts

/** A Strategy's week squares (M4 .sq): mint at or above the standard, grey below, this week the text colour, weeks to come faint. */
function Strip({ cells, small = false, tips = true }) {
  const inner = (
    <span className={`dash-sq${small ? ' dash-sq--small' : ''}`} aria-hidden={tips ? undefined : 'true'}>
      {cells.map((c) => <i key={c.key} className={`dash-sq-i dash-sq-i--${c.state}`} {...(tips ? tipProps(c.tip) : {})} />)}
    </span>
  );
  return tips ? <ChartTips className="dash-sq-tips">{inner}</ChartTips> : inner;
}

/** A mini chart beside a figure (M4 miniBars): decorative, the figure says it. */
function Mini({ bars }) {
  if (!bars?.length) return null;
  const n = bars.length;
  const W = 72;
  const H = 24;
  const bw = W / n;
  const max = bars[0].max || 1;
  return (
    <svg className="dash-mini" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      {bars.map((b, i) => {
        const w = Math.max(2, bw - 3);
        const x = i * bw + (bw - w) / 2;
        if (b.value == null) return <rect key={b.key} x={x} y={H - 2} width={w} height={2} rx={1} className="dash-mini-stub" />;
        const h = Math.max(2, (H - 2) * Math.min(1, b.value / max));
        return <rect key={b.key} x={x} y={H - h} width={w} height={h} rx={1.5} className={b.good ? 'dash-mini-good' : 'dash-mini-below'} />;
      })}
    </svg>
  );
}

function Big({ big, holding = false }) {
  if (!big?.text) return null;
  return (
    <span className={`dash-big${big.good && !holding ? ' dash-big--good' : ''}`}>
      {big.text}
      {big.unit && <span className="ds-unit">{big.unit}</span>}
    </span>
  );
}

/**
 * A line that repeats a small chart (26 Oct rule 10): on a laptop it
 * shows; on a phone the chart becomes a tap that shows it.
 */
function useTapLine({ phone, line, label, visual }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!phone || !line) return { visual, line: line ? <small className="dash-si-line">{line}</small> : null };
  return {
    visual: (
      <button type="button" className="dash-tapvis" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen((v) => !v)}>
        {visual}
      </button>
    ),
    line: open ? <small id={id} className="dash-si-line">{line}</small> : <span id={id} hidden />,
  };
}

// ---------------------------------------------------------------- section headings

function SectionHead({ id, title, closed, toggle, as: H = 'h2' }) {
  const open = !closed[id];
  return (
    <H className="dash-sec-h">
      <button type="button" className="dash-colb" aria-expanded={open} onClick={() => toggle(id)}>
        <span>{title}</span>
        <DisclosureArrow open={open} />
      </button>
    </H>
  );
}

function GroupHead({ id, title, right, summary, closed, toggle, first = false }) {
  const open = !closed[id];
  return (
    <>
      <div className={`dash-grph${first ? ' dash-grph--first' : ''}`}>
        <h3 className="dash-grph-h">
          <button type="button" className="dash-colb dash-colb--group" aria-expanded={open} onClick={() => toggle(id)}>
            <span>{title}</span>
            <span className="dash-colb-rt">
              {right && open && <span className="dash-colb-rtl">{right}</span>}
              <DisclosureArrow open={open} />
            </span>
          </button>
        </h3>
      </div>
      {!open && <p className="dash-csum">{summary}</p>}
    </>
  );
}

// ---------------------------------------------------------------- Current sprint

// M4's "Nothing has improved yet. Results often lag effort by a few
// weeks." as one sentence a line (26 Oct rule 9).
function Lines({ text }) {
  return text.split(/(?<=\.) (?=[A-Z])/).map((l) => <span key={l} className="dash-ls">{l}</span>);
}

function SumItem({ item, holding, phone, go }) {
  let visual = null;
  if (item.strip) visual = <Strip cells={item.strip} small tips={!phone} />;
  else if (item.mini) visual = <Mini bars={item.mini} />;
  else if (item.big) visual = <Big big={item.big} holding={holding} />;
  const tap = useTapLine({ phone: phone && item.repeats && (item.strip || item.mini), line: item.line, label: `About ${item.title}`, visual });
  return (
    <div className="dash-si">
      <div className="dash-sit">
        <b>{item.title}</b>
        {tap.line}
        {item.fix && <Button variant="text" className="dash-fix" onClick={() => go(item.fix)}>{item.fix.label}</Button>}
      </div>
      {tap.visual && <div className="dash-siv">{tap.visual}</div>}
    </div>
  );
}

function CurrentSprint({ current, closed, toggle, phone, go }) {
  const shut = closed.sum;
  const a = current.improving;
  const b = current.holdingBack;
  const n = Math.max(Math.min(a.length, 3), Math.min(b.length, 3), 1);
  return (
    <section className="dash-sec" aria-labelledby={undefined}>
      <SectionHead id="sum" title="Current sprint" closed={closed} toggle={toggle} />
      {/* Declutter (Tim, 5 Nov): no line saying what the section shows; closed, its one-line summary. */}
      {shut && <p className="dash-lead"><span className="dash-ls">{current.closedLine}</span></p>}
      {!shut && !phone && (
        <div className="dash-sgrid">
          <h3 className="dash-sh">What’s improving</h3>
          <h3 className="dash-sh">What’s holding you back</h3>
          {Array.from({ length: n }, (_, i) => (
            <div className="dash-spair" key={i}>
              {i === 0 && !a.length ? <p className="dash-semp"><Lines text={current.improvingEmpty} /></p> : a[i] ? <SumItem item={a[i]} phone={phone} go={go} /> : <div />}
              {i === 0 && !b.length ? <p className="dash-semp">{current.holdingBackEmpty}</p> : b[i] ? <SumItem item={b[i]} holding phone={phone} go={go} /> : <div />}
            </div>
          ))}
        </div>
      )}
      {!shut && phone && (
        <div className="dash-sumg">
          <div>
            <h3 className="dash-sh">What’s improving</h3>
            {a.length ? a.map((x) => <SumItem key={x.key} item={x} phone={phone} go={go} />) : <p className="dash-semp"><Lines text={current.improvingEmpty} /></p>}
          </div>
          <div>
            <h3 className="dash-sh">What’s holding you back</h3>
            {b.length ? b.map((x) => <SumItem key={x.key} item={x} holding phone={phone} go={go} />) : <p className="dash-semp">{current.holdingBackEmpty}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Objectives and Strategies

function SpanSwitch({ span, setSpan, phone }) {
  if (phone) {
    return (
      <div className="dash-span dash-span--phone">
        <Dropdown label="Show" options={SPANS} value={span} onChange={setSpan} />
      </div>
    );
  }
  return (
    <div className="dash-span">
      <SegmentedControl label="Show" options={SPANS} value={span} onChange={setSpan} />
    </div>
  );
}

function GoalBar({ bar }) {
  if (bar.kind === 'timeline') {
    return (
      <span className="dash-goal dash-goal--time" aria-hidden="true">
        <span className="dash-goal-labels"><span style={{ left: pct(bar.gone * 100) }}>Today</span><span>Due</span></span>
        <span className="dash-goal-track"><span className="dash-goal-fill dash-goal-fill--time" style={{ width: pct(bar.gone * 100) }} /><span className="dash-goal-now" style={{ left: pct(bar.gone * 100) }} /></span>
      </span>
    );
  }
  return (
    <span className="dash-goal" aria-hidden="true">
      <span className="dash-goal-track"><span className={`dash-goal-fill${bar.good ? ' dash-goal-fill--good' : ''}`} style={{ width: pct(bar.value * 100) }} /></span>
    </span>
  );
}

function ObjectiveRow({ row, phone }) {
  const [open, setOpen] = useState(false);
  const extra = (
    <>
      {row.effortLine && <small className="dash-crow-sub">{row.effortLine}</small>}
    </>
  );
  const bar = <GoalBar bar={row.bar} />;
  return (
    <div className="dash-crow">
      <div className="dash-crow-n">
        <b className="dash-crow-nb"><span className="ds-onum" aria-hidden="true">{row.number}</span><span>{row.name}</span></b>
        {row.line && <small className="dash-crow-ind">{row.line}</small>}
        {(!phone || open) && row.effortLine && <span className="dash-crow-ind">{extra}</span>}
      </div>
      <div className="dash-crow-c">
        {phone && row.effortLine
          ? <button type="button" className="dash-tapvis" aria-expanded={open} aria-label={`About ${row.name}`} onClick={() => setOpen((v) => !v)}>{bar}</button>
          : bar}
      </div>
      <div className="dash-crow-v">
        <strong className={row.kind === 'milestone' ? 'dash-crow-lng' : undefined}>{row.value}</strong>
        {row.of && <span className="dash-crow-of">{` ${row.of}`}</span>}
        {row.label && (!phone || open) && <span className="dash-crow-dl">{row.label}</span>}
      </div>
    </div>
  );
}

function StrategyRow({ row, phone }) {
  return (
    <div className="dash-crow">
      <div className="dash-crow-n">
        <b>{row.name}</b>
        {row.serves.length > 0 && <ObjectiveNumbers items={row.serves} className="dash-serves" />}
      </div>
      <div className="dash-crow-c"><Strip cells={row.strip} /></div>
      <div className="dash-crow-v">
        {/* No figure yet: nothing in the figure style (Tim, 5 Nov). */}
        {row.latest && !phone && <span className="dash-crow-cvl">{row.latestLabel}</span>}
        {row.latest && <strong>{`${row.latest.value}%`}</strong>}
      </div>
    </div>
  );
}

function ChainSection({ view, closed, toggle, span, setSpan, phone }) {
  const { chain } = view;
  const shut = closed.chain;
  return (
    <section className="dash-sec">
      <SectionHead id="chain" title="Objectives and Strategies" closed={closed} toggle={toggle} />
      {shut ? (
        <p className="dash-lead">{chain.closedLine}</p>
      ) : (
        <>
          <SpanSwitch span={span} setSpan={setSpan} phone={phone} />
          <GroupHead id="obj" title="Outcome Objectives" summary={chain.objectives.summary} closed={closed} toggle={toggle} first />
          {!closed.obj && (chain.objectives.rows.length
            ? chain.objectives.rows.map((r) => <ObjectiveRow key={r.id} row={r} phone={phone} />)
            : <p className="dash-semp">{chain.objectives.summary}</p>)}
          <GroupHead id="strat" title="Strategies" right={chain.strategies.heading} summary={chain.strategies.summary} closed={closed} toggle={toggle} />
          {!closed.strat && (
            <>
              {chain.strategies.rows.length
                ? chain.strategies.rows.map((r) => <StrategyRow key={r.id} row={r} phone={phone} />)
                : <p className="dash-semp">You haven’t added a Strategy yet.</p>}
              {chain.strategies.rows.some((r) => r.latest) && (
                <ChartTable
                  caption="Strategies, week by week"
                  columns={[{ key: 'name', label: 'Strategy' }, { key: 'latest', label: 'Latest week' }, { key: 'std', label: 'Weeks at your standard' }]}
                  rows={chain.strategies.rows.map((r) => ({ key: r.id, cells: { name: r.name, latest: r.latest ? `${r.latest.value}%` : 'Not yet', std: r.atStandard || 'No finished week yet' } }))}
                />
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- What's behind your performance

function Fold({ row, phone, children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const fig = row.figure;
  return (
    <div className="dash-fold">
      <button type="button" className="dash-fold-h" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="dash-fold-words">
          <span className="dash-fold-t">{keepWords(row.title)}</span>
          {row.line && <small className="dash-fold-l">{row.line}</small>}
        </span>
        {fig && (
          <span className="dash-fv">
            <b className={fig.good ? 'dash-fv-good' : undefined}>
              {fig.text}
              {fig.unit && <span className={`ds-unit${fig.unit.startsWith('/') ? ' ds-unit--tight' : ''}`}>{fig.unit}</span>}
            </b>
            {!phone && <Mini bars={row.mini} />}
          </span>
        )}
        <span className="dash-fold-mark"><DisclosureArrow open={open} /></span>
      </button>
      {open && <div id={id} className="dash-fold-b">{children}</div>}
    </div>
  );
}

function Lab({ text, eye }) {
  return (
    <div className="dash-lab">
      <span>{text}</span>
      {eye}
    </div>
  );
}

/** Weekly bars inside a fold (M4 weekBars): mint for a green week, grey below, faint to come, week numbers along the bottom. */
function TrendBars({ bars, max, label }) {
  return (
    <ChartTips className="dash-tbars">
      <div className="dash-tbars-plot" role="group" aria-label={label}>
        {bars.map((b) => (
          <div className="dash-tbars-col" key={b.key}>
            <i className={`dash-tbars-bar dash-tbars-bar--${b.state}`} style={{ height: b.value != null ? pct(b.value, max) : undefined }} {...tipProps(b.tip)} />
          </div>
        ))}
      </div>
      <div className="dash-tbars-axis" aria-hidden="true">{bars.map((b) => <span key={b.key}>{b.label}</span>)}</div>
    </ChartTips>
  );
}

/** Stress, week by week (M4): the five answers down the side, one dot a week, mint for the two best. */
function StressDots({ row }) {
  return (
    <ChartTips className="dash-stress">
      <div className="dash-stress-grid" role="group" aria-label="Stress, week by week">
        <div className="dash-stress-levels" aria-hidden="true">{row.levels.map((l) => <span key={l}>{l}</span>)}</div>
        <div className="dash-stress-plot">
          <div className="dash-stress-inner">
            {row.levels.map((l, i) => <span key={l} className="dash-stress-line" style={{ top: `${(i / 4) * 100}%` }} aria-hidden="true" />)}
            {row.dots.map((d, i) => (d.answer ? (
              <i
                key={d.key}
                className={`dash-stress-dot${d.good ? ' dash-stress-dot--good' : ''}`}
                style={{ left: `${((i + 0.5) / row.dots.length) * 100}%`, top: `${(d.level / 4) * 100}%` }}
                {...tipProps(d.tip)}
              />
            ) : null))}
          </div>
        </div>
      </div>
      <div className="dash-stress-axis" aria-hidden="true"><span /><div>{row.dots.map((d) => <span key={d.key}>{d.label}</span>)}</div></div>
    </ChartTips>
  );
}

function SleepBody({ row, target, changeTarget, navigate }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Lab text="Hours a night, night by night" eye={<WhoSees audience="me" />} />
      {row.usual && <div className="dash-sleep-figs"><Stat label="Average quality" value={row.usual} /></div>}
      <SleepChart slots={row.slots} target={target} note={target.own ? null : SLEEP_SUGGESTED_LINE} enough={row.enough} empty={SLEEP_EMPTY} label={SLEEP_LABEL} />
      {row.enough && (
        <ChartTable caption="Sleep each night of this sprint" columns={[{ key: 'night', label: 'Night' }, { key: 'hours', label: 'Hours' }, { key: 'quality', label: 'Quality' }]} rows={row.table} />
      )}
      <div className="dash-act">
        {row.action?.lines.map((l) => <p key={l} className="dash-fp">{l}</p>)}
        <div className="dash-links">
          {row.action?.windDown && <Button variant="text" onClick={() => navigate('/sleep-wind-down')}>Open Sleep wind down</Button>}
          <SleepTargetLink open={editing} onToggle={() => setEditing((v) => !v)} controls="dash-sleep-target" />
        </div>
        {editing && <SleepTargetEditor id="dash-sleep-target" target={target} onChange={changeTarget} />}
      </div>
    </>
  );
}

function BehindSection({ view, closed, toggle, phone, target, changeTarget, coach, shared, setShared, navigate, go, hidePattern }) {
  const { behind } = view;
  const shut = closed.more;
  const checkEye = coach
    ? <WhoSees audience={shared ? 'coach' : 'me'} coachName={coach} name="Your Hardware and Software check-in" onChange={(a) => setShared(a === 'coach')} />
    : <WhoSees audience="me" />;
  const bodies = {
    wins: (row) => (
      <>
        <Lab text="The wins you added that weren’t in your plan" eye={<WhoSees audience="me" />} />
        {row.items.length ? (
          <ul className="dash-stick">
            {row.items.map((w) => (
              <li key={w.key}>
                <span className="dash-stick-w">
                  <span>{w.text}</span>
                  {w.served.length > 0 && <small>{`Served ${w.served.map((s) => `“${s}”`).join(' and ')}`}</small>}
                </span>
                <span className="dash-stick-d">{dayName(w.date, view.today)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="dash-fp">Add one from the Performance Sprint when something good happens that wasn’t planned.</p>}
        {row.items.length > 0 && <p className="dash-fp">These come from the Performance Sprint, Review my day and the weekly debrief.</p>}
      </>
    ),
    rhythm: (row) => (
      <ul className="dash-stick">
        {row.items.map((x) => <li key={x.key}><span>{x.title}</span><span className="dash-stick-d">{x.value}</span></li>)}
      </ul>
    ),
    // Patterns in your numbers (M4 .pcs; M14): up to 4 cards, or the honest "No clear link yet".
    pat: (row) => (
      <>
        <Lab text={row.lead} eye={<WhoSees audience="me" />} />
        {row.cards.length ? (
          <div className="ds-patterns">
            {row.cards.map((c) => <PatternCard key={c.key} card={c} onAct={go} onHide={(k) => { hidePattern(k).catch(() => {}); }} />)}
          </div>
        ) : row.empty.map((l) => <p key={l} className="dash-fp">{l}</p>)}
      </>
    ),
    check: (row) => (
      <>
        <Lab text="Each score out of 100, month by month" eye={checkEye} />
        <CheckinChart points={row.points} />
        {row.points.length >= 2 && (
          <ChartTable
            caption="Hardware score and Software score by month"
            columns={[
              { key: 'month', label: 'Month' },
              { key: 'hw', label: 'Hardware score' },
              { key: 'sw', label: 'Software score' },
              ...(row.points.some((p) => p.trips) ? [{ key: 'trips', label: 'Travel' }] : []),
            ]}
            rows={row.points.map((p) => ({ key: p.month, cells: { month: p.when, hw: p.hardware == null ? 'Not answered' : `${p.hardware}/100`, sw: p.software == null ? 'Not answered' : `${p.software}/100`, trips: tripsWords(p.trips) } }))}
          />
        )}
        <Button variant="text" onClick={() => navigate('/check-in')}>{row.started ? 'Open my check-ins' : 'Start my check-in'}</Button>
      </>
    ),
    lbr: (row) => (
      <>
        {row.stats && (
          <>
            <Lab text={`Your latest review, ${dayName(row.latestDate, view.today)}`} eye={<WhoSees audience="me" />} />
            <ul className="dash-stick">
              {row.stats.biggestRise && <li><span>Biggest rise</span><span className="dash-stick-d">{`${areaWords(row.stats.biggestRise.area)}, up ${row.stats.biggestRise.change}`}</span></li>}
              {row.stats.biggestDrop && <li><span>Biggest drop</span><span className="dash-stick-d">{`${areaWords(row.stats.biggestDrop.area)}, down ${-row.stats.biggestDrop.change}`}</span></li>}
              {row.stats.lowest && <li><span>Lowest now</span><span className="dash-stick-d">{`${areaWords(row.stats.lowest.area)}, ${row.stats.lowest.score}/10`}</span></li>}
            </ul>
          </>
        )}
        <Button variant="text" onClick={() => navigate(row.stats ? '/life-balance-review/results' : '/life-balance-review')}>{row.stats ? 'Open my life balance review' : 'Start my life balance review'}</Button>
      </>
    ),
    be: (row) => (
      <>
        <Lab text="Your daily rating out of 10, averaged each week" eye={<WhoSees audience="me" />} />
        {row.enough ? <TrendBars bars={row.bars} max={10} label="How you want to be, week by week" /> : <p className="dash-fp">Review my day adds your first rating here.</p>}
        {row.enough && (
          <ChartTable caption="Your rating each week" columns={[{ key: 'week', label: 'Week' }, { key: 'v', label: 'Average rating' }]} rows={row.bars.filter((b) => b.value != null).map((b) => ({ key: b.key, cells: { week: b.tip.when, v: `${b.value}/10` } }))} />
        )}
        {row.latestWay && <p className="dash-fp">{`Your latest way of being was “${row.latestWay}”, from Plan my day.`}</p>}
        {row.enough && <p className="dash-fp">Green weeks averaged 7/10 or more.</p>}
      </>
    ),
    line: (row) => (
      <>
        <Lab text="Reviews where you were above the line, week by week" eye={<WhoSees audience="me" />} />
        <TrendBars bars={row.bars} max={100} label="Share of reviews above the line, week by week" />
        <ChartTable caption="Reviews above the line each week" columns={[{ key: 'week', label: 'Week' }, { key: 'v', label: 'Above the line' }]} rows={row.bars.filter((b) => b.value != null).map((b) => ({ key: b.key, cells: { week: b.tip.when, v: `${b.value}%` } }))} />
        <p className="dash-fp">Green weeks had 70% or more of reviews above the line.</p>
      </>
    ),
    sleep: (row) => <SleepBody row={row} target={target} changeTarget={changeTarget} navigate={navigate} />,
    stress: (row) => (
      <>
        <Lab text="How tense, restless, nervous or anxious you felt each week" eye={<WhoSees audience="me" />} />
        {row.enough ? (
          <>
            <StressDots row={row} />
            <ChartTable caption="Stress each week" columns={[{ key: 'week', label: 'Week' }, { key: 'answer', label: 'Your answer' }]} rows={row.table} />
            <p className="dash-fp">Green weeks are the ones where you answered “Not at all” or “A little”.</p>
            <p className="dash-fp">This comes from your weekly debrief.</p>
          </>
        ) : <p className="dash-fp">Your first weekly debrief adds the first week here.</p>}
      </>
    ),
  };
  return (
    <section className="dash-sec dash-mt">
      <SectionHead id="more" title="What’s behind your performance" closed={closed} toggle={toggle} />
      {shut && <p className="dash-lead">{behind.closedLine}</p>}
      {!shut && (
        <div className="dash-folds">
          {behind.rows.map((row) => (
            <Fold key={row.key} row={row} phone={phone}>{bodies[row.key](row)}</Fold>
          ))}
        </div>
      )}
    </section>
  );
}

function areaWords(area) {
  return area ? areaName(area) : '';
}
