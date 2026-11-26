import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { toastReaches } from './toastAbove';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import { MoreLink } from './Blocks';
import InfoIcon from './InfoIcon';
import { ExplainInfo } from './Explain';
import InfoPop from './InfoPop';
import { useEscapeLayer, pushLayer } from './layers';
import { lockPage, openerOf, returnFocus, trapTab, unlockPage } from './pageLock';
import { SaveStatus } from './Status';
import { themeProps, useThemeScope } from './themeScope';
import { STEP_PREFIX, openStepIndex } from './guideDraft';
import useKeepScroll from './useKeepScroll';
import useViewportFit from './useViewportFit';
import { useHidePhoneBar } from './phoneBar';
import { useFocusMode } from './Frame';
import { endWithIcon, titleWithAside } from './keepWords';
import useInfoToggle from './useInfoToggle';
import { inSentence } from '../../lib/performance/words.js';
import './design.css';

// The guided-step component: every tool people work through in order,
// one question per screen.
//
// Polish 1 (25 Nov design reference, rule 21; B3, Stage B): it runs in
// ToolFrame's focus mode, as Plan my day does (example-pages-25nov.html
// "Tool: Plan my day"). Still a full-screen layer over the page, it draws
// the frame itself: on a laptop the portal's rounded panel with no menu and
// the tool's 560px column in its middle 720px, 40px from the top; on a
// phone edge to edge, 20px in. The bar holds × ("Close and save my place",
// onClose saves and goes back) at the left and "Step n of m" with Saving
// and Saved at the right; the 2px progress line; a small grey eyebrow (the
// step's stage name, or the tool's name); the question in DM Sans 20px
// (a step's `title` too: no Nekst inside a tool); its grey lines; then the
// step. Next, Back and Skip this step at the foot: one row on a laptop,
// stacked and centred on a phone. Steps settle in (a fade and an 8px rise).
// Keyboard and screen readers: focus moves to the new question on each
// step, which also says where you are; Enter in a text box never moves on;
// Escape closes open help, panels and drop-downs before the tool.
// $SP/polish/b3/NOTES.md lists what changed for the tools.
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
//              opening its one line in place (M19's Close the day);
//              { label, explain } opens a longer explanation in the side
//              panel instead (Explain.jsx; Tim, 16 Nov, 23:31)
//   info may also be { explain }: "Why we ask" in the side panel,
//   required, nextLabel, skippable (for the last step), bare,
//   eye:       the screen's eye (WhoSees), shown beside the question.
//   skipLabel: this step's own word for the quiet skip under one-tap
//              answers ("Skip this one" on a person's own question; run 7),
//   oneTap:    a one-answer question (Tim, 5 Nov, 10:23): the chosen answer
//              shows as selected for a moment (ONE_TAP_MS), then the step
//              moves itself on with tool.next(); no Next button. Back keeps
//              the answer. Several-answer, typed and slider steps keep Next.
//   wide:      the step uses the whole 720px column (a results page with a
//              chart); a step with `top` or `noProgress` is wide anyway.
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
//              ("Download my PDF" beside "Add to-do");
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
// More a step can say (M7b's Health Check, 14 Nov):
//   back:      () => the key of the step Back goes to from here, or null for
//              the usual one (the first rating of a project opened from the
//              results goes back to the results). A question opened from a
//              summary stays an edit after it.
//   top:       what shows in place of the top bar on this step (M7b's
//              results: the bold crosshair alone, centred, as a guest page),
//              so a results step keeps the tool's own "Save my edit".
//   editNext:  the button's words while this step is open from a summary
//              and has a second part to come (`thenEdit`): "Next" (M7b: the
//              Success Factors, then how much each matters, then "Save my
//              edit").
//   A one-tap answer follows the step's `onward` too, when it gives a key.
// More a step can say (M21's Travel plan, 18 Nov):
//   foot:      the step's own bottom bar in place of the coral button (a
//              day of the plan: "Previous day" and "Next day"), or null for
//              no bottom bar at all (a summary page with nothing to press,
//              Your plan). Its words are the step's own; the bar is the
//              tool's, so it lines up as every other.
// onBack:   Back on the first step, when it isn't the same as Close (M7b:
//           Back leaves for the email and code screen; Close saves).
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

function StepHead({ step, headingRef, positionId, role, name }) {
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
  // The small grey line over the question (the example's eyebrow, Polish 1):
  // the step's own stage name where it has one ("Goal"), else the tool's name.
  const eyebrow = step.label || name;

  return (
    <>
      {(eyebrow || step.info) && (
        <div className={`ds-guide-label${step.label ? '' : ' ds-guide-name'}`}>
          {eyebrow && <span>{eyebrow}</span>}
          {step.info?.explain && <ExplainInfo explain={step.info.explain} helpKey={step.info.helpKey} label="Why we ask" className="ds-guide-i" />}
          {step.info && !step.info.explain && (
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
      {step.info && !step.info.explain && <InfoPop id={infoId} open={infoOpen} anchorRef={infoButtonRef} panelRef={infoPanelRef} lines={step.info} />}
      <Heading
        ref={headingRef}
        tabIndex={-1}
        // One kind of heading in focus mode: a 20px DM Sans question (Polish 1,
        // rules 1 and 2). A step that had a short Nekst title keeps its class.
        className={`ds-q ds-guide-question${step.title ? ' ds-guide-title' : ''}`}
        aria-describedby={positionId}
      >
        {/* The eye beside the question it belongs to, wrapped with its last
            word so it is never on its own line (Tim, 5 Nov, 11:09). */}
        {titleWithAside(step.title || step.question, step.eye)}
      </Heading>
      {step.nudges?.map((line, n) => (
        <p key={line} className="ds-guide-nudge">
          {/* The ⓘ wrapped with the nudge's last word, never on a line of its own (tidy pass item 1). */}
          {endWithIcon(line, step.nudgeInfo && n === step.nudges.length - 1 && (step.nudgeInfo.explain ? (
            <ExplainInfo explain={step.nudgeInfo.explain} helpKey={step.nudgeInfo.helpKey} label={step.nudgeInfo.label} className="ds-guide-i ds-guide-i--end" />
          ) : (
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
          )))}
        </p>
      ))}
      {step.nudgeInfo && !step.nudgeInfo.explain && <InfoPop id={nudgeInfoId} open={nudgeOpen} anchorRef={nudgeButtonRef} panelRef={nudgePanelRef} lines={step.nudgeInfo.text} />}
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
  skipLabel = 'Skip this step',
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
  onBack,
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
  // Until the person moves, the step asked for stays the one shown by its
  // key, even when steps arrive before it after the first render (own
  // questions before a finished tool's summary).
  const openedOn = useRef(!changeLeft && initialStep ? initialStep : null);
  const stepKeys = steps.map((s) => s.key).join('\n');
  useLayoutEffect(() => {
    if (!openedOn.current) return;
    const at = openStepIndex(steps, openedOn.current, index);
    if (at !== index) setIndex(at);
    // Only when the steps themselves change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKeys]);
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
  const onBackRef = useRef(onBack);
  const positionId = useId();
  useEffect(() => {
    onCloseRef.current = onClose;
    onBackRef.current = onBack;
  }, [onClose, onBack]);

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
  // The phone bar steps back while a full-screen tool covers it (phoneBar.js),
  // so its measured height (--tabbar-height) no longer lifts toasts over the
  // tool's last answer (the UI tester, 22 Nov: "Draft restored" sat over
  // the Team performance check's "Committed" at 390px).
  useHidePhoneBar(fullscreen && open);
  // Inside a tool the menu goes (rule 21): the frame behind hides its menu and phone header too.
  useFocusMode(fullscreen && open);
  useKeepScroll(scrollRef, shown);

  // A toast never covers the bottom bar's button (the functionality
  // tester, 14 Nov: on a phone "Saved" and "Added to this week" sat on the
  // middle of Next for as long as they showed). Where the button runs
  // under the middle of the screen, toasts rise to 16px above the bar, as
  // M9 draws them on a phone; on a laptop the button is at the right and
  // the toast stays where M9 draws it. Dialogs do the same for their own
  // footers (Dialogs.jsx). A step's own bar (`foot`, M21's "Previous day"
  // and "Next day") is measured as one row: on a phone its buttons share
  // the width, so toasts rise above it there too (the UI tester, 22 Nov).
  useLayoutEffect(() => {
    if (!fullscreen || !open || !shown) return undefined;
    const foot = rootRef.current?.querySelector('.ds-guide-foot');
    const button = foot?.querySelector('.ds-guide-next, .ds-guide-foot-own');
    if (!foot || !button) return undefined;
    const html = document.documentElement;
    const before = html.style.getPropertyValue('--ds-toast-offset');
    const place = () => {
      if (toastReaches(foot)) html.style.setProperty('--ds-toast-offset', `${Math.max(0, Math.round(foot.getBoundingClientRect().height) - 16)}px`);
      else if (before) html.style.setProperty('--ds-toast-offset', before);
      else html.style.removeProperty('--ds-toast-offset');
    };
    place();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      if (before) html.style.setProperty('--ds-toast-offset', before);
      else html.style.removeProperty('--ds-toast-offset');
    };
  }, [fullscreen, open, shown, i, returnTo]);

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
    openedOn.current = null;
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
  // On the first step Back shows only where it isn't the same as × (onBack:
  // M7b's email and code screen; Polish 1, rule 21).
  const showBack = changing || (i > 0 && !previous?.bare) || (i === 0 && Boolean(onBack));
  const problem = asked === step.key ? step.check?.() || null : null;
  // A one-answer screen moves on by itself, so it has no Next (rule 21).
  const ownFoot = Object.prototype.hasOwnProperty.call(step, 'foot');
  const hasNext = ownFoot ? Boolean(step.foot) : !(step.oneTap && !last);
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
        if (changingRef.current) {
          backToSummaryRef.current();
          return;
        }
        // The step's own next place, when it names one (a Health Check
        // goes straight to the next answer still missing).
        const onwardKey = steps[from]?.onward?.();
        const onward = onwardKey ? steps.findIndex((s) => s.key === onwardKey) : -1;
        go(onward >= 0 && onward !== from ? onward : from + 1, 'jump');
      }, ONE_TAP_MS);
    },
    index: i,
    skipped,
    steps,
    headingRef,
  };

  // Where you are (Polish 1, rule 21): "Step 2 of 3" at the bar's right and
  // the 2px progress line under it. A tool with uneven parts (progress
  // 'percent') fills the line by the step's own percent.
  const lineWidth = progress === 'percent' ? percent : (last ? 100 : Math.max(4, stepPercent));
  const stepWords = step.noProgress ? '' : `Step ${position + 1} of ${listed.length}`;
  const progressLine = (
    <div
      id={progress === 'percent' ? positionId : undefined}
      className="ds-guide-pct"
      role="progressbar"
      aria-valuenow={Math.round(lineWidth)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={progress === 'percent' ? `${percent}% complete` : positionText}
    >
      <span className="ds-guide-pct-track"><span style={{ width: `${lineWidth}%` }} /></span>
    </div>
  );

  // Back: the step's own place when it names one, the summary an edit came
  // from, the step before, or out of the tool from the first step.
  const goBack = () => {
    const backKey = step.back?.();
    const at = backKey ? steps.findIndex((s) => s.key === backKey) : -1;
    if (at >= 0 && at !== i) {
      // Back to the summary itself ends the edit.
      if (at === returnTo) setReturnTo(null);
      go(at, 'jump');
      return;
    }
    if (changing) backToSummary();
    else if (i === 0) (onBackRef.current || onCloseRef.current)?.();
    else go(i - 1);
  };
  // An edit with a second part to come keeps its own word on the button.
  const editHasMore = changing && step.editNext && step.thenEdit
    && steps.some((s, j) => s.key === step.thenEdit && j !== i && j !== returnTo);

  // In focus mode Back is at the foot (rule 21).
  const backShown = !step.plain && showBack;
  const nextWords = editHasMore ? step.editNext : changing ? 'Save my edit' : (step.nextLabel || (last ? finishLabel : 'Next'));
  // "Skip this step" (rule 21): a tool's older plain "Skip" reads the same.
  const skipWords = ((w) => (w === 'Skip' ? 'Skip this step' : w))(step.skipLabel || skipLabel);
  const footShown = !step.bare && !step.plain && (ownFoot ? Boolean(step.foot) || backShown : (hasNext || backShown || showSkip || step.footAside));

  // Steps settle in (a fade and an 8px rise, rule 21), forward or back alike.
  const motion = direction === 'none' ? '' : ' ds-guide-page--next';

  const tree = (
    <div
      ref={rootRef}
      className={`ds-guide ds-guide--${layout} ds-guide--focus${calm ? ' ds-guide--calm' : ''}${longName ? ' ds-guide--long-name' : ''}${step.bare ? ' ds-guide--bare' : ''}${step.plain ? ' ds-guide--plain' : ''}${step.className ? ` ${step.className}` : ''}`}
      role={fullscreen ? 'dialog' : 'region'}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-label={name}
      tabIndex={fullscreen ? -1 : undefined}
      onKeyDown={fullscreen ? (e) => trapTab(e, rootRef.current) : undefined}
    >
      {/* Focus mode (Polish 1, rule 21; example-pages-25nov.html "Tool: Plan my
          day"): on a laptop the portal's panel with the menu gone and the
          tool in its middle column; on a phone edge to edge. The whole layer
          scrolls as one page. */}
      <div ref={scrollRef} className="ds-guide-scroll">
        <div className="ds-guide-frame">
          <div className="ds-guide-col">
            <div className={`ds-tool ds-guide-tool${step.wide || step.top || step.noProgress ? ' ds-guide-tool--wide' : ''}`}>
              {step.top && <div className="ds-guide-top">{step.top}</div>}
              {!step.bare && !step.top && (
                <div className="ds-tool-bar ds-guide-bar">
                  {/* × saves where they are and goes back (rule 21): the tool's onClose does both. */}
                  <button type="button" className="ds-tool-x ds-guide-close" aria-label="Close and save my place" title="Close" onClick={() => onCloseRef.current?.()}>
                    <span className="ds-x" aria-hidden="true" />
                  </button>
                  <span className="ds-tool-step ds-guide-where">
                    {!step.plain && <SaveStatus state={saveState} />}
                    {!step.plain && stepWords && <span aria-hidden="true">{stepWords}</span>}
                  </span>
                </div>
              )}
              {!step.bare && !step.plain && !step.noProgress && !step.top && progressLine}
              {/* Said once for screen readers; the line itself names a percent. */}
              {!step.plain && progress !== 'percent' && <span id={positionId} className="ds-sr">{step.noProgress ? name : positionText}</span>}
              {!step.plain && progress === 'percent' && (step.noProgress || step.top) && <span id={positionId} className="ds-sr">{name}</span>}
              <div key={step.key} className={`ds-guide-page${motion}`}>
                {step.bare || step.plain ? (
                  step.render(tool)
                ) : (
                  <>
                    <StepHead step={step} headingRef={headingRef} positionId={positionId} role={role} name={name} />
                    <div className="ds-guide-body">{step.render(tool)}</div>
                    {/* Never a greyed-out button: a calm line says what is needed (M9). */}
                    {problem && (
                      <div className="ds-error ds-guide-problem" role="alert">
                        <span className="ds-error-mark" aria-hidden="true">!</span>
                        <span>{problem}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* The foot (rule 21): Next, Back and Skip this step in one row on a
                  laptop, stacked and centred on a phone (rule 11). A screen that
                  moves straight on has no Next; its Back and Skip stay here. */}
              {footShown && (
                <div className={`ds-tool-foot ds-guide-foot${hasNext ? '' : ' ds-guide-foot--quiet'}`}>
                  {ownFoot ? (step.foot && <div className="ds-guide-foot-own">{step.foot}</div>) : (
                    hasNext && (
                      <button type="button" className="ds-btn ds-btn--primary ds-guide-next" onClick={next}>
                        {nextWords}
                      </button>
                    )
                  )}
                  {backShown && (
                    <MoreLink back onClick={goBack} className="ds-tool-back ds-guide-back">Back</MoreLink>
                  )}
                  {!ownFoot && showSkip && !step.footAside && (
                    <button type="button" className="ds-more ds-more--bare ds-tool-skip ds-guide-skip" onClick={skip}>{skipWords}</button>
                  )}
                  {!ownFoot && step.footAside && <div className="ds-guide-foot-aside">{step.footAside}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
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
        {rows.map((row) => {
          const open = () => onChange(row.step, { fromSummary: true });
          return (
            // A row, not a control (Polish 1: its two lines are a name and its value):
            // tapping anywhere on it opens that question, and its "Edit" is the button.
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div key={row.key || row.label} className="ds-guide-plan-row" onClick={open}>
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
              <button
                type="button"
                className="ds-guide-plan-edit"
                aria-label={`Edit ${(typeof row.editName === 'string' && row.editName.trim()) || inSentence(row.label)}`}
                onClick={(e) => { e.stopPropagation(); open(); }}
              >
                Edit
              </button>
            </div>
          );
        })}
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
