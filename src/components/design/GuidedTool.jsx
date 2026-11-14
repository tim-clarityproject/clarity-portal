import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import InfoIcon from './InfoIcon';
import InfoPop from './InfoPop';
import { useEscapeLayer, pushLayer } from './layers';
import { lockPage, openerOf, returnFocus, trapTab, unlockPage } from './pageLock';
import { SaveStatus } from './Status';
import { themeProps, useThemeScope } from './themeScope';
import { STEP_PREFIX } from './guideDraft';
import useKeepScroll from './useKeepScroll';
import useViewportFit from './useViewportFit';
import Chevron from './Chevron';
import keepWords, { titleWithAside } from './keepWords';
import useInfoToggle from './useInfoToggle';
import { inSentence } from '../../lib/performance/words.js';
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
//   nudgeInfo: { label, text } an "i" at the end of the last nudge,
//              opening its one line in place (M19's Close the day),
//   required, nextLabel, skippable (for the last step), bare,
//   eye:       the screen's eye (WhoSees), shown beside the question.
//   oneTap:    a one-answer question (Tim, 5 Nov, 10:23): the chosen answer
//              shows as selected for a moment (ONE_TAP_MS), then the step
//              moves itself on with tool.next(); no Next button. Back keeps
//              the answer. Several-answer, typed and slider steps keep Next.
//   plain:     only the top bar (name, Saving and Saved, close) and the
//              step's own content: no % bar, question or footer (M19's
//              breathing, Sleep well and Work's done screens). Its
//              content puts tool.headingRef on its heading, for focus.
//   className: added to the tool while on this step ('ds-night', M19's
//              night colours),
//   render: (tool) => content; tool has go(i), index, skipped, steps
// }]
// layout:   'fullscreen' (real pages) or 'framed' (fills its box; gallery).
// autoFocus: framed only, move focus to the question when it appears
//           (e.g. when a finished tool starts again in place).
// progress: 'steps' or 'percent'.
// initialStep: the key of the step to open on (instead of where it was left).
// skipMoves: false when the quiet word only calls onSkip and stays put
//           (the First review's "Do this later" closes the tool, M12).
// calm:     the stepped frame of M9, M10 and M7b (Tim, 13 Nov): the top bar
//           and the bottom bar line up with the page's own column, Back
//           shows on the first step too (there it closes the tool), the %
//           bar has no figure beside it, the step's `label` is the small
//           grey stage name above the question ("Goal", "Reality"), Skip is
//           a quiet link at the bottom bar's left, and a question opened
//           from the summary shows the bar full.
// More a step can say (M10, 14 Nov):
//   percent:   the % bar's own figure, where the steps aren't equal parts
//              (three questions for each person on a list);
//   noProgress: no % bar on this step (a results page with its own title);
//   footAside: a quiet link at the bottom bar's left, where Skip would be
//              ("Download my PDF" beside "Add a to-do");
//   onward:    () => the key of the step Next goes to from here, or null
//              for the usual one. It wins over going back to a summary, so
//              an edit that needs more answers (someone added to a list)
//              asks for them before the summary shows again.
// longName: the tool's name may run to two lines on a phone (M10: "long
//           tool names wrap rather than being cut off"): its lines balance.
// skipLabel "Finish later" with skipMoves false is M10's quiet link at the
// left of every typing step: it calls onSkip and stays put (the tool saves
// and closes).
// More a step can say (M10's Emotional wash, 14 Nov):
//   onNext:    () => runs when Next (or Save my edit) is pressed and the
//              step's check has nothing to say, just before the tool moves
//              on: a step that asks "Where should it go?" adds its to-do
//              here. It never holds the move up.
//   thenEdit:  the key of a step that belongs with this one on a summary
//              ("The feeling" is the kind, then its words). Opened from the
//              summary, this step is followed by that one, and the summary
//              shows again after it.
// A step's `check`: () => a calm message, or null. Pressing Next (or Save
//           my edit) on a step whose check gives a message shows it under
//           the answer ("Type your goal to carry on.") and stays put: the
//           button is never greyed out. The message goes once the answer
//           is given.

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
// It sits beside the tool's name, in capitals, and is centred on those capitals (Tim, 11 Nov).
const ARROW = <Chevron direction="left" size="sm" beside="capitals" />;

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
  const { open: nudgeOpen, buttonRef: nudgeButtonRef, panelRef: nudgePanelRef, buttonProps: nudgeProps } = useInfoToggle();
  const nudgeInfoId = useId();
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
      {step.info && <InfoPop id={infoId} open={infoOpen} anchorRef={infoButtonRef} panelRef={infoPanelRef} lines={step.info} />}
      <Heading
        ref={headingRef}
        tabIndex={-1}
        className={`${step.title ? 'ds-guide-title' : 'ds-guide-question'} ds-guide-rv ds-guide-rv--1`}
        aria-describedby={positionId}
      >
        {/* The eye beside the question it belongs to, wrapped with its last
            word so it is never on its own line (Tim, 5 Nov, 11:09). */}
        {titleWithAside(step.title || step.question, step.eye)}
      </Heading>
      {step.nudges?.map((line, n) => (
        <p key={line} className="ds-guide-nudge ds-guide-rv ds-guide-rv--2">
          {line}
          {step.nudgeInfo && n === step.nudges.length - 1 && (
            <button
              type="button"
              className="ds-guide-i ds-guide-i--end"
              aria-controls={nudgeInfoId}
              aria-label={step.nudgeInfo.label}
              ref={nudgeButtonRef}
              aria-expanded={nudgeOpen}
              {...nudgeProps}
            >
              <InfoIcon />
            </button>
          )}
        </p>
      ))}
      {step.nudgeInfo && <InfoPop id={nudgeInfoId} open={nudgeOpen} anchorRef={nudgeButtonRef} panelRef={nudgePanelRef} lines={step.nudgeInfo.text} />}
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

/**
 * How long a one-tap answer shows as chosen before the tool moves on: the
 * answer shows as chosen the instant it's tapped, then the next screen
 * follows after 150ms (rule 21, Tim, 5 Nov, 15:00: 300ms felt like the
 * tap hadn't registered). The same as --dur-fast.
 */
export const ONE_TAP_MS = 150;

// onEdited: runs when a question opened from the summary has gone back to
// it ("Save my edit", or a one-tap answer): the tool says "Saved" (M9).
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
  onEdited,
  autoFocus = false,
  initialStep,
  skipMoves = true,
  calm = false,
  longName = false,
}) {
  const scope = useThemeScope();
  const fullscreen = layout === 'fullscreen';
  const saved = draftKey ? readJson(STEP_PREFIX + draftKey, null) : null;
  // initialStep (a step's key) opens the tool on that step, e.g. "Edit
  // this Strategy"; otherwise it carries on where it was left.
  // A change from a summary that was still open when the page went (a
  // refresh, or the tab closed): that same step opens again, with "Save
  // my change" still going straight back to the summary (Tim, 10 Nov,
  // 09:15: nothing is ever lost). It wins over initialStep, which a
  // finished tool uses to open on its summary.
  const [changeLeft] = useState(() => {
    const at = steps.findIndex((s) => s.key === saved?.changing?.step);
    const from = steps.findIndex((s) => s.key === saved?.changing?.from);
    return at >= 0 && from >= 0 && at !== from ? { at, from } : null;
  });
  const [index, setIndex] = useState(() => {
    if (changeLeft) return changeLeft.at;
    const asked = initialStep ? steps.findIndex((s) => s.key === initialStep) : -1;
    // Only a whole step number counts: anything else kept there (a damaged
    // or older draft) opens the first step, never a blank screen.
    const left = Number.isInteger(saved?.index) && saved.index >= 0 ? saved.index : 0;
    return asked >= 0 ? asked : Math.min(left, steps.length - 1);
  });
  const [skipped, setSkipped] = useState(() => new Set(Array.isArray(saved?.skipped) ? saved.skipped : []));
  // "Change" on a summary (Tim, 5 Nov, 10:41): only that question opens,
  // and moving on from it goes straight back to the summary, with the
  // change shown. The steps in between are never shown again.
  const [returnTo, setReturnTo] = useState(() => (changeLeft ? changeLeft.from : null));
  const [direction, setDirection] = useState('none');
  // The step Next was pressed on while its check still had something to say.
  const [asked, setAsked] = useState(null);
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
  const oneTapTimer = useRef(null);
  const indexRef = useRef(i);
  indexRef.current = i;
  const changingRef = useRef(false);
  const backToSummaryRef = useRef(() => {});
  useEffect(() => () => clearTimeout(oneTapTimer.current), []);
  const step = steps[i];
  const last = i === steps.length - 1;
  const shown = fullscreen ? open : true;

  // A tap in the first moment after the tool appears (the second half of
  // a double tap that opened or restarted it) is ignored too.
  useEffect(() => {
    if (shown) lastMove.current = Date.now();
  }, [shown]);

  // Remember where they are (and what they skipped) on the device, and a
  // change from a summary while it is open, by the steps' keys.
  const changingKey = returnTo != null && returnTo !== i && steps[returnTo] ? `${step.key}\n${steps[returnTo].key}` : '';
  useEffect(() => {
    if (!draftKey) return;
    const [at, from] = changingKey.split('\n');
    writeJson(STEP_PREFIX + draftKey, { index: i, skipped: [...skipped], ...(changingKey ? { changing: { step: at, from } } : {}) });
  }, [draftKey, i, skipped, changingKey]);

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

  // The last button runs onFinish once, however often it is tapped. When
  // onFinish answers false (its save was refused and it said so), the
  // button works again, so a second tap can try once more.
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    Promise.resolve(onFinish?.()).then(
      (ok) => { if (ok === false) finished.current = false; },
      () => { finished.current = false; },
    );
  };

  // Back to the summary the change was made from.
  const backToSummary = () => {
    const to = returnTo;
    setReturnTo(null);
    go(to, 'jump');
  };
  // "Save my edit" (or a one-tap answer changed from the summary) went back
  // to the summary: the tool says so (M9: "Saved").
  const savedEdit = () => {
    backToSummary();
    onEdited?.();
  };

  // A step opened from a summary that has a second part (thenEdit): that
  // part opens next, still as an edit. True when it did.
  const editOn = () => {
    const at = step.thenEdit ? steps.findIndex((s) => s.key === step.thenEdit) : -1;
    if (at < 0 || at === i || at === returnTo) return false;
    go(at, 'jump');
    return true;
  };

  const next = () => {
    if (Date.now() - lastMove.current < NEXT_GUARD_MS) return;
    if (step.check?.()) {
      setAsked(step.key);
      return;
    }
    step.onNext?.();
    if (skipped.has(step.key)) {
      const rest = new Set(skipped);
      rest.delete(step.key);
      setSkipped(rest);
    }
    const onwardKey = step.onward?.();
    const onward = onwardKey ? steps.findIndex((s) => s.key === onwardKey) : -1;
    if (onward >= 0 && onward !== i) {
      setReturnTo(null);
      go(onward, 'jump');
      return;
    }
    if (returnTo != null && returnTo !== i) {
      if (!editOn()) savedEdit();
      return;
    }
    if (last) {
      finish();
      return;
    }
    go(i + 1);
  };

  const skip = () => {
    if (Date.now() - lastMove.current < NEXT_GUARD_MS) return;
    if (!skipMoves) {
      onSkip?.(step.key);
      return;
    }
    setSkipped((s) => new Set(s).add(step.key));
    onSkip?.(step.key);
    if (returnTo != null && returnTo !== i) {
      backToSummary();
      return;
    }
    if (last) {
      finish();
      return;
    }
    go(i + 1);
  };

  if (!shown) return null;

  // Where you are, for the step list and for screen readers.
  const listed = steps.map((s, j) => ({ s, j })).filter(({ s }) => !s.bare);
  const position = listed.findIndex(({ j }) => j === i);
  const stepPercent = steps.length > 1 ? Math.round((i / (steps.length - 1)) * 100) : 100;
  // One question opened from the summary: the plan is whole, so the bar is full (M9).
  const percent = calm && returnTo != null && returnTo !== i ? 100 : (Number.isFinite(step.percent) ? step.percent : stepPercent);
  const positionText = progress === 'percent'
    ? `${percent}% complete`
    : `Step ${position + 1} of ${listed.length}: ${step.name}`;

  const showSkip = !(step.required || (step.title && !last) || (last && !step.skippable));
  const previous = steps[i - 1];
  const changing = returnTo != null && returnTo !== i;
  // Back shows on a change from a summary too, even on the first question:
  // it goes back to the summary.
  // In the calm frame Back shows on the first step too, where it leaves the
  // tool, so the tool's name never moves (M9).
  const showBack = changing || (i > 0 && !previous?.bare) || (calm && i === 0);
  const problem = asked === step.key ? step.check?.() || null : null;
  // A one-answer screen moves on by itself, so it has no Next (rule 21).
  const hasNext = !(step.oneTap && !last);
  changingRef.current = changing;
  backToSummaryRef.current = () => { if (!editOn()) savedEdit(); };
  // tool.go(to, { fromSummary: true }) opens one question from a summary
  // (GuidedSummary does this); a step moving itself on (a one-tap answer)
  // then goes back to that summary too.
  const tool = {
    go: (to, opts) => {
      if (opts?.fromSummary) {
        setReturnTo(i);
        go(to, 'jump');
        return;
      }
      if (changing && to > i) {
        backToSummary();
        return;
      }
      go(to, 'jump');
    },
    // A one-tap answer: shown as chosen for a moment, then on (or back to
    // the summary it was changed from). Leaving the step first cancels it.
    next: () => {
      clearTimeout(oneTapTimer.current);
      const from = i;
      oneTapTimer.current = setTimeout(() => {
        if (indexRef.current !== from) return;
        if (changingRef.current) backToSummaryRef.current();
        else go(from + 1, 'jump');
      }, ONE_TAP_MS);
    },
    index: i,
    skipped,
    steps,
    headingRef,
  };

  const progressBar = progress === 'percent' ? (
    <div
      id={positionId}
      className="ds-guide-pct"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${percent}% complete`}
    >
      <span className="ds-guide-pct-track"><span style={{ width: `${percent}%` }} /></span>
      <span className="ds-guide-pct-text" aria-hidden="true">{`${percent}%`}</span>
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
      className={`ds-guide ds-guide--${layout}${calm ? ' ds-guide--calm' : ''}${longName ? ' ds-guide--long-name' : ''}${step.bare ? ' ds-guide--bare' : ''}${step.plain ? ' ds-guide--plain' : ''}${step.className ? ` ${step.className}` : ''}`}
      role={fullscreen ? 'dialog' : 'region'}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-label={name}
      tabIndex={fullscreen ? -1 : undefined}
      onKeyDown={fullscreen ? (e) => trapTab(e, rootRef.current) : undefined}
    >
      <div className="ds-guide-frame">
        {!step.bare && (
          <div className="ds-guide-bar">
            {/* Back at the top left, beside the tool's name (rules 29o and 29t,
                Tim, 5 Nov): the chevron alone, its 44px tap area invisible. */}
            {showBack && !step.plain && (
              <button type="button" className="ds-guide-back" aria-label="Back" onClick={() => (changing ? backToSummary() : i === 0 ? onCloseRef.current?.() : go(i - 1))}>
                {ARROW}
              </button>
            )}
            {/* "CHECK-IN" never splits at its hyphen, even at twice the text size (rule 29x). */}
            <b className="ds-guide-name">{keepWords(name)}</b>
            {!step.plain && <SaveStatus state={saveState} />}
            <IconButton label="Close" className="ds-guide-close" onClick={() => onCloseRef.current?.()} />
          </div>
        )}
        <div ref={scrollRef} className="ds-guide-scroll">
          <div key={step.key} className={`ds-guide-page${motion}`}>
            {!step.bare && !step.plain && !step.noProgress && progressBar}
            {/* The % shows once and is said once (29n): the bar itself names it. */}
            {!step.plain && (progress !== 'percent' || step.noProgress) && <span id={positionId} className="ds-sr">{step.noProgress ? name : positionText}</span>}
            {step.bare || step.plain ? (
              step.render(tool)
            ) : (
              <>
                <StepHead step={step} headingRef={headingRef} positionId={positionId} role={role} />
                <div className="ds-guide-body ds-guide-rv ds-guide-rv--3">{step.render(tool)}</div>
                {/* Never a greyed-out button: a calm line says what is needed (M9). */}
                {problem && (
                  <div className="ds-error ds-guide-problem" role="alert">
                    <span className="ds-error-mark" aria-hidden="true">!</span>
                    <span>{problem}</span>
                  </div>
                )}
                {!hasNext && showSkip && (
                  <button type="button" className="ds-guide-skip ds-guide-skip--body" onClick={skip}>{skipLabel}</button>
                )}
              </>
            )}
          </div>
        </div>
        {/* The bottom bar only when the screen has a button (rule 29o): a
            screen that moves straight on has none, and its Skip sits
            quietly under the answers instead. */}
        {!step.bare && !step.plain && hasNext && (
          <div className="ds-guide-foot">
            <div className="ds-guide-foot-right">
              {showSkip && !step.footAside && (
                <button type="button" className="ds-guide-skip" onClick={skip}>{skipLabel}</button>
              )}
              {step.footAside && <div className="ds-guide-foot-aside">{step.footAside}</div>}
              <button type="button" className="ds-btn ds-btn--primary ds-guide-next" onClick={next}>
                {changing ? 'Save my edit' : (step.nextLabel || (last ? finishLabel : 'Next'))}
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
//
// stacked (M9's "Your plan", Tim, 13 Nov): each row is one button, the
// small grey label over its answer and "Edit" at the right; the whole row
// opens that one question. A row then has
//   lines: [{ text, sub, good }]  one paragraph each; `sub` is the small
//          line under it ("It’s in this week’s sprint."), mint when `good`.
export function GuidedSummary({ rows, onChange, emptyWord = 'Not yet', addWhenEmpty = false, stacked = false }) {
  if (stacked) {
    return (
      <div className="ds-guide-plan">
        {rows.map((row) => (
          <button
            key={row.key || row.label}
            type="button"
            className="ds-guide-plan-row"
            aria-label={`Edit ${(typeof row.editName === 'string' && row.editName.trim()) || inSentence(row.label)}`}
            onClick={() => onChange(row.step, { fromSummary: true })}
          >
            <span className="ds-guide-plan-value">
              <span className="ds-guide-plan-label">{row.label}</span>
              {(row.lines || []).map((line, j) => (
                // The lines have no ids of their own; their order is their identity.
                // eslint-disable-next-line react/no-array-index-key
                <span key={j} className="ds-guide-plan-line">
                  {line.text}
                  {line.sub && <small className={line.good ? 'ds-guide-plan-good' : undefined}>{line.sub}</small>}
                </span>
              ))}
            </span>
            <span className="ds-guide-plan-edit" aria-hidden="true">Edit</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="ds-guide-summary">
      {rows.map((row) => {
        const lines = Array.isArray(row.value) ? row.value.filter(Boolean) : null;
        const has = lines ? lines.length > 0 : Boolean(row.value);
        // "Edit", never "Change" (Tim, 11 Nov, 12:59); a screen reader hears "Edit how it went".
        const action = has || !addWhenEmpty ? 'Edit' : 'Add';
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
                aria-label={`${action} ${(typeof row.editName === 'string' && row.editName.trim()) || inSentence(row.label)}`.trim()}
                onClick={() => onChange(row.step, { fromSummary: true })}
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
