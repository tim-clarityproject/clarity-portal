import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import InfoIcon from './InfoIcon';
import { useEscapeLayer, pushLayer } from './layers';
import { lockPage, openerOf, returnFocus, trapTab, unlockPage } from './pageLock';
import { SaveStatus } from './Status';
import { themeProps, useThemeScope } from './themeScope';
import { STEP_PREFIX } from './guideDraft';
import useKeepScroll from './useKeepScroll';
import useViewportFit from './useViewportFit';
import Chevron from './Chevron';
import useInfoToggle from './useInfoToggle';
import './design.css';

// The guided-step component: every tool people work through in order,
// one question per screen, built as M6's set-up flows in both modes
// (decisions: "Guided tools", "Stepped tools, details", "Guided tools on
// desktop open focused, full screen", "No needless words").
//
// - Opens focused, full screen: the header and menu step back. A top bar
//   with the tool's name, Saving and Saved, and the rotated crosshair to
//   close, which returns people to where they came from.
// - Where you are: the step list (numbered, current outlined, done grey,
//   tap any step to jump), which becomes the slim segmented line on
//   phone; question tools use the % complete bar instead. Never a
//   "Step 1 of 3" line.
// - Each step: a small label with an optional "i" (one line of why); the
//   question in sentence case; one or two nudges; an optional "See an
//   example" (the tool supplies one per role); an optional one-off tip,
//   never shown again once closed; then the step's content.
// - Footer: Back (the arrow alone on phone), a quiet Skip (or the tool's
//   own word) and the coral button. Required steps show no Skip. A bare
//   step has no step list or footer.
// - Steps slide across: Next from the right, Back from the left; with
//   reduced motion they fade instead.
// - Keyboard and screen readers: focus moves to the new question on each
//   step, which also says where you are; Enter in a text box never moves
//   on; Escape closes open help, panels and drop-downs before the tool.
//
// The tool owns its answers and saves them (useAutosave). This component
// owns where people are, and with `draftKey` remembers the step and the
// skipped steps on the device, so an unfinished tool carries on as a
// draft.
//
// steps: [{
//   key, name,            name: the step list's word for it
//   label,                the small label above the question (optional)
//   info,                 one line of why behind the "i" (optional)
//   question | title,     the heading: a question, or a short Nekst title
//   nudges: [],           one or two short lines under it
//   example,              text, or { ceo, coach, leader } by role
//   tip: { key, text },   a one-off tip
//   required, nextLabel, skippable (for the last step), bare,
//   render: (tool) => content; tool has go(i), index, skipped, steps
// }]
// layout:   'fullscreen' (real pages) or 'framed' (fills its box; gallery).
// autoFocus: framed only, move focus to the question when it appears
//           (e.g. when a finished tool starts again in place).
// progress: 'steps' or 'percent'.
// initialStep: the key of the step to open on (instead of where it was left).

const NEXT_GUARD_MS = 400;     // a second tap this soon after a move is ignored
const TIP_PREFIX = 'ds-tip-seen:';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the draft lasts until the page is closed.
  }
}

// The example for the person's role (Tim, 23 Oct): CEO or executive,
// Head coach or Leader; Other gets the Leader version.
function exampleFor(example, role) {
  if (!example || typeof example === 'string') return example;
  const key = role === 'ceo' || role === 'coach' ? role : 'leader';
  return example[key] ?? example.leader;
}

// Back: the one chevron, turned to point left (Tim, 26 Oct).
const ARROW = <Chevron direction="left" size="sm" />;

function Tip({ tip, onClosed }) {
  const [shown, setShown] = useState(() => !readJson(TIP_PREFIX + tip.key, false));
  if (!shown) return null;
  return (
    <div className="ds-guide-tip" role="note">
      <span>{tip.text}</span>
      <IconButton
        label="Close tip"
        onClick={() => {
          writeJson(TIP_PREFIX + tip.key, true);
          setShown(false);
          // The close button goes with the tip; focus moves to the question.
          onClosed?.();
        }}
      />
    </div>
  );
}

function StepHead({ step, headingRef, positionId, role }) {
  // The "i" opens as every "i" does (useInfoToggle), and Escape closes open help first.
  const { open: infoOpen, buttonRef: infoButtonRef, panelRef: infoPanelRef, buttonProps: infoProps } = useInfoToggle();
  const [exampleOpen, setExampleOpen] = useState(false);
  const infoId = useId();
  const exampleId = useId();
  useEscapeLayer(exampleOpen, () => setExampleOpen(false));
  const example = exampleFor(step.example, role);
  const Heading = 'h2';

  return (
    <>
      {(step.label || step.info) && (
        <div className="ds-guide-label ds-guide-rv">
          {step.label && <span>{step.label}</span>}
          {step.info && (
            <button
              type="button"
              className="ds-guide-i"
              aria-controls={infoId}
              aria-label="Why we ask"
              ref={infoButtonRef}
              aria-expanded={infoOpen}
              {...infoProps}
            >
              <InfoIcon />
            </button>
          )}
        </div>
      )}
      {step.info && infoOpen && <p id={infoId} ref={infoPanelRef} className="ds-guide-info">{step.info}</p>}
      <Heading
        ref={headingRef}
        tabIndex={-1}
        className={`${step.title ? 'ds-guide-title' : 'ds-guide-question'} ds-guide-rv ds-guide-rv--1`}
        aria-describedby={positionId}
      >
        {step.title || step.question}
      </Heading>
      {step.nudges?.map((line) => <p key={line} className="ds-guide-nudge ds-guide-rv ds-guide-rv--2">{line}</p>)}
      {example && (
        <>
          <button
            type="button"
            className="ds-guide-example-link"
            aria-expanded={exampleOpen}
            aria-controls={exampleId}
            onClick={() => setExampleOpen((v) => !v)}
          >
            {exampleOpen ? 'Hide the example' : 'See an example'}
          </button>
          {exampleOpen && <div id={exampleId} className="ds-guide-example">{`For example: ${example}`}</div>}
        </>
      )}
      {step.tip && <Tip tip={step.tip} onClosed={() => headingRef.current?.focus({ preventScroll: true })} />}
    </>
  );
}

export default function GuidedTool({
  open = true,
  layout = 'fullscreen',
  name,
  steps,
  progress = 'steps',
  skipLabel = 'Skip',
  finishLabel = 'Finish',
  saveState,
  role,
  draftKey,
  onSkip,
  onClose,
  onFinish,
  autoFocus = false,
  initialStep,
}) {
  const scope = useThemeScope();
  const fullscreen = layout === 'fullscreen';
  const saved = draftKey ? readJson(STEP_PREFIX + draftKey, null) : null;
  // initialStep (a step's key) opens the tool on that step, e.g. "Edit
  // this Strategy"; otherwise it carries on where it was left.
  const [index, setIndex] = useState(() => {
    const asked = initialStep ? steps.findIndex((s) => s.key === initialStep) : -1;
    return asked >= 0 ? asked : Math.min(saved?.index ?? 0, steps.length - 1);
  });
  const [skipped, setSkipped] = useState(() => new Set(saved?.skipped || []));
  const [direction, setDirection] = useState('none');
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const headingRef = useRef(null);
  const lastMove = useRef(0);
  const finished = useRef(false);
  const onCloseRef = useRef(onClose);
  const positionId = useId();
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const i = Math.min(index, steps.length - 1);
  const step = steps[i];
  const last = i === steps.length - 1;
  const shown = fullscreen ? open : true;

  // A tap in the first moment after the tool appears (the second half of
  // a double tap that opened or restarted it) is ignored too.
  useEffect(() => {
    if (shown) lastMove.current = Date.now();
  }, [shown]);

  // Remember where they are (and what they skipped) on the device.
  useEffect(() => {
    if (draftKey) writeJson(STEP_PREFIX + draftKey, { index: i, skipped: [...skipped] });
  }, [draftKey, i, skipped]);

  // Full screen: the page steps back (pinned, inert), Escape closes the
  // tool once nothing above it is open, and focus returns afterwards.
  useLayoutEffect(() => {
    if (!fullscreen || !open) return undefined;
    const returnTo = openerOf(document.activeElement);
    lockPage();
    const removeLayer = pushLayer(() => onCloseRef.current?.());
    return () => {
      removeLayer();
      unlockPage();
      returnFocus(returnTo);
    };
  }, [fullscreen, open]);

  useViewportFit(rootRef, fullscreen && open);
  useKeepScroll(scrollRef, shown);

  // Each step: back to the top, and focus on the new question.
  useEffect(() => {
    if (!shown) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    if (direction !== 'none' || fullscreen || autoFocus) headingRef.current?.focus({ preventScroll: true });
    // Only when the step changes or the tool opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, shown]);

  const go = (to, how) => {
    const now = Date.now();
    if (how !== 'jump' && now - lastMove.current < NEXT_GUARD_MS) return;
    const target = Math.max(0, Math.min(steps.length - 1, to));
    if (target === i) return;
    lastMove.current = now;
    setDirection(target > i ? 'forward' : 'back');
    setIndex(target);
  };

  const next = () => {
    if (Date.now() - lastMove.current < NEXT_GUARD_MS) return;
    if (skipped.has(step.key)) {
      const rest = new Set(skipped);
      rest.delete(step.key);
      setSkipped(rest);
    }
    if (last) {
      if (finished.current) return;
      finished.current = true;
      onFinish?.();
      return;
    }
    go(i + 1);
  };

  const skip = () => {
    if (Date.now() - lastMove.current < NEXT_GUARD_MS) return;
    setSkipped((s) => new Set(s).add(step.key));
    onSkip?.(step.key);
    if (last) {
      if (finished.current) return;
      finished.current = true;
      onFinish?.();
      return;
    }
    go(i + 1);
  };

  if (!shown) return null;

  // Where you are, for the step list and for screen readers.
  const listed = steps.map((s, j) => ({ s, j })).filter(({ s }) => !s.bare);
  const position = listed.findIndex(({ j }) => j === i);
  const percent = steps.length > 1 ? Math.round((i / (steps.length - 1)) * 100) : 100;
  const positionText = progress === 'percent'
    ? `${percent}% complete`
    : `Step ${position + 1} of ${listed.length}: ${step.name}`;

  const showSkip = !(step.required || (step.title && !last) || (last && !step.skippable));
  const previous = steps[i - 1];
  const showBack = i > 0 && !previous?.bare;
  const tool = { go: (to) => go(to, 'jump'), index: i, skipped, steps };

  const progressBar = progress === 'percent' ? (
    <div
      className="ds-guide-pct"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${percent}% complete`}
    >
      <span className="ds-guide-pct-track"><span style={{ width: `${percent}%` }} /></span>
      <span className="ds-guide-pct-text">{`${percent}%`}</span>
    </div>
  ) : (
    <nav className="ds-guide-steps" aria-label="Steps">
      <ol>
        {listed.map(({ s, j }, n) => (
          <li key={s.key}>
            <button
              type="button"
              className={j < i && !skipped.has(s.key) ? 'ds-guide-done' : undefined}
              aria-current={j === i ? 'step' : undefined}
              aria-label={`${n + 1}. ${s.name}${j < i && !skipped.has(s.key) ? ', done' : ''}${skipped.has(s.key) ? ', skipped' : ''}`}
              onClick={() => go(j, 'jump')}
            >
              <b aria-hidden="true">{n + 1}</b>
              <span aria-hidden="true">{s.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );

  const motion = direction === 'forward' ? ' ds-guide-page--next' : direction === 'back' ? ' ds-guide-page--back' : '';

  const tree = (
    <div
      ref={rootRef}
      className={`ds-guide ds-guide--${layout}${step.bare ? ' ds-guide--bare' : ''}`}
      role={fullscreen ? 'dialog' : 'region'}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-label={name}
      tabIndex={fullscreen ? -1 : undefined}
      onKeyDown={fullscreen ? (e) => trapTab(e, rootRef.current) : undefined}
    >
      <div className="ds-guide-frame">
        {!step.bare && (
          <div className="ds-guide-bar">
            <b className="ds-guide-name">{name}</b>
            <SaveStatus state={saveState} />
            <IconButton label="Close" className="ds-guide-close" onClick={() => onCloseRef.current?.()} />
          </div>
        )}
        <div ref={scrollRef} className="ds-guide-scroll">
          <div key={step.key} className={`ds-guide-page${motion}`}>
            {!step.bare && progressBar}
            <span id={positionId} className="ds-sr">{positionText}</span>
            {step.bare ? (
              step.render(tool)
            ) : (
              <>
                <StepHead step={step} headingRef={headingRef} positionId={positionId} role={role} />
                <div className="ds-guide-body ds-guide-rv ds-guide-rv--3">{step.render(tool)}</div>
              </>
            )}
          </div>
        </div>
        {!step.bare && (
          <div className="ds-guide-foot">
            {showBack ? (
              <button type="button" className="ds-guide-back" aria-label="Back" onClick={() => go(i - 1)}>
                {ARROW}
                <span aria-hidden="true">Back</span>
              </button>
            ) : <span />}
            <div className="ds-guide-foot-right">
              {showSkip && (
                <button type="button" className="ds-guide-skip" onClick={skip}>{skipLabel}</button>
              )}
              <button type="button" className="ds-btn ds-btn--primary ds-guide-next" onClick={next}>
                {step.nextLabel || (last ? finishLabel : 'Next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!fullscreen) return tree;
  return createPortal(
    <div className="ui-root ds-portal" {...themeProps(scope)}>{tree}</div>,
    document.body,
  );
}

// The editable summary at the end: every answer on one page, each with a
// way to change it (M6). Skipped answers show "Not yet", to fill in later.
//
// For the daily tools (M5 srow), a row can also have:
//   value: an array, one line each (the day's to-dos, numbered);
//   sub:   a grey line under the value ("If it happens: …");
//   good:  a mint line under the value ("Plus 1 unplanned win.");
//   step:  null for a row that can't be changed here.
// emptyWord: "Skipped" (M5) instead of "Not yet"; the action then reads
// "Add" for an empty row (M5: "Skipped" with an Add link).
export function GuidedSummary({ rows, onChange, emptyWord = 'Not yet', addWhenEmpty = false }) {
  return (
    <div className="ds-guide-summary">
      {rows.map((row) => {
        const lines = Array.isArray(row.value) ? row.value.filter(Boolean) : null;
        const has = lines ? lines.length > 0 : Boolean(row.value);
        const action = has || !addWhenEmpty ? 'Change' : 'Add';
        return (
          <div key={row.label} className="ds-guide-summary-row">
            <span className="ds-guide-summary-label">{row.label}</span>
            <span className={`ds-guide-summary-value${has ? '' : ' ds-guide-summary-value--empty'}`}>
              {!has && emptyWord}
              {has && (lines
                ? lines.map((line, j) => <span key={j} className="ds-guide-summary-line">{line}</span>)
                : row.value)}
              {has && row.sub && <span className="ds-guide-summary-sub">{row.sub}</span>}
              {has && row.good && <span className="ds-guide-summary-good">{row.good}</span>}
            </span>
            {row.step != null ? (
              <button
                type="button"
                className="ds-guide-summary-change"
                aria-label={`${action} ${row.label}`}
                onClick={() => onChange(row.step)}
              >
                {action}
              </button>
            ) : <span />}
          </div>
        );
      })}
    </div>
  );
}
