import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreLink, SaveStatus, ToolFrame } from '../../components/design';
import { ONE_TAP_MS } from '../../components/design/GuidedTool';
import { STEP_PREFIX, openStepIndex } from '../../components/design/guideDraft';
import { pushLayer } from '../../components/design/layers';
import { readJson, writeJson } from '../../lib/deviceStore';

// A guided tool in focus mode (Polish 1, rule 21; example-pages-25nov.html "Tool: Plan my day"),
// built on A1's ToolFrame: × on the left saves and goes back, "Step 2 of 7" on the right, the
// progress line, the step's question at 20px with its eye, Next, Back and Skip this step at the
// foot, and the summary last with Finish. The Daily plan is the first tool on it; every tool
// rebuilt in Stage B follows the same pattern.
//
// It keeps GuidedTool's behaviour, so the tool's own code is unchanged: the step (and the steps
// skipped, and an edit open from the summary) is kept on the device under the same key
// (guideDraft.js), so the tool carries on where it was left; initialStep opens a step by its key;
// "Edit" on the summary opens one question and Next goes straight back to the summary; a one-tap
// answer moves on by itself after ONE_TAP_MS; a step's onNext runs before moving on; Finish runs
// onFinish once, and again only when it answered false; Escape closes (× does the same).
//
// steps: [{ key, name, question, nudges, example, eye, oneTap, skipLabel, onNext, render(tool) }]

export default function StepFrame({ name, steps, draftKey, initialStep, saveState, finishLabel = 'Finish', onClose, onFinish }) {
  const saved = draftKey ? readJson(STEP_PREFIX + draftKey, null) : null;
  const [changeLeft] = useState(() => {
    const at = steps.findIndex((s) => s.key === saved?.changing?.step);
    const from = steps.findIndex((s) => s.key === saved?.changing?.from);
    return at >= 0 && from >= 0 && at !== from ? { at, from } : null;
  });
  const [index, setIndex] = useState(() => {
    if (changeLeft) return changeLeft.at;
    const asked = initialStep ? steps.findIndex((s) => s.key === initialStep) : -1;
    const left = Number.isInteger(saved?.index) && saved.index >= 0 ? saved.index : 0;
    return asked >= 0 ? asked : Math.min(left, steps.length - 1);
  });
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
  const [returnTo, setReturnTo] = useState(() => (changeLeft ? changeLeft.from : null));
  const [exampleOpen, setExampleOpen] = useState(false);
  const finished = useRef(false);
  const oneTapTimer = useRef(null);
  const headingRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => () => clearTimeout(oneTapTimer.current), []);

  const i = Math.min(index, steps.length - 1);
  const step = steps[i];
  const last = i === steps.length - 1;
  const changing = returnTo != null && returnTo !== i;
  const indexRef = useRef(i);
  indexRef.current = i;
  const changingRef = useRef(changing);
  changingRef.current = changing;

  // Where they are, kept on the device by the steps' keys (GuidedTool's own shape).
  const changingKey = changing && steps[returnTo] ? `${step.key}\n${steps[returnTo].key}` : '';
  useEffect(() => {
    if (!draftKey) return;
    const [at, from] = changingKey.split('\n');
    writeJson(STEP_PREFIX + draftKey, { index: i, skipped: [...skipped], ...(changingKey ? { changing: { step: at, from } } : {}) });
  }, [draftKey, i, skipped, changingKey]);

  // Escape closes the tool once nothing above it is open (× does the same).
  useEffect(() => pushLayer(() => onCloseRef.current?.()), []);
  useEffect(() => { setExampleOpen(false); }, [i]);

  const go = (to) => {
    const target = Math.max(0, Math.min(steps.length - 1, to));
    if (target === i) return;
    openedOn.current = null;
    setIndex(target);
  };
  const backToSummary = () => {
    const to = returnTo;
    setReturnTo(null);
    go(to);
  };
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    Promise.resolve(onFinish?.()).then(
      (ok) => { if (ok === false) finished.current = false; },
      () => { finished.current = false; },
    );
  };
  const next = () => {
    step.onNext?.();
    if (skipped.has(step.key)) {
      const rest = new Set(skipped);
      rest.delete(step.key);
      setSkipped(rest);
    }
    if (changing) { backToSummary(); return; }
    if (last) { finish(); return; }
    go(i + 1);
  };
  const skip = () => {
    setSkipped((s) => new Set(s).add(step.key));
    if (changing) { backToSummary(); return; }
    if (last) { finish(); return; }
    go(i + 1);
  };
  const back = () => {
    if (changing) { backToSummary(); return; }
    go(i - 1);
  };

  const tool = {
    go: (to, opts) => {
      if (opts?.fromSummary) { setReturnTo(i); go(to); return; }
      if (changing && to > i) { backToSummary(); return; }
      go(to);
    },
    // A one-tap answer: shown as chosen for a moment, then on (or back to the summary).
    next: () => {
      clearTimeout(oneTapTimer.current);
      const from = i;
      oneTapTimer.current = setTimeout(() => {
        if (indexRef.current !== from) return;
        if (changingRef.current) { setReturnTo(null); setIndex(returnTo); return; }
        setIndex(from + 1);
      }, ONE_TAP_MS);
    },
    index: i,
    skipped,
    steps,
    headingRef,
  };

  const nudges = (step.nudges || []).filter(Boolean);
  const hasNext = !(step.oneTap && !last);
  return (
    <ToolFrame
      step={i + 1}
      steps={steps.length}
      name={name}
      question={step.question ? <>{step.question}{step.eye ? <span className="sf-eye">{step.eye}</span> : null}</> : null}
      hint={nudges.length ? nudges.join(' ') : null}
      onClose={onClose}
      onNext={hasNext ? next : undefined}
      nextLabel={changing ? 'Save my edit' : last ? finishLabel : 'Next'}
      onBack={i > 0 || changing ? back : undefined}
      onSkip={!last ? skip : undefined}
      skipLabel={step.skipLabel || 'Skip this step'}
      last={last}
      // Saving, Saved and Will sync sit beside "Step 2 of 7", out of the step's own flow.
      stepWords={<span className="sf-steps">{saveState && <SaveStatus state={saveState} />}<span>{last ? 'Done' : `Step ${i + 1} of ${steps.length}`}</span></span>}
      className="sf-tool"
    >
      {step.example && (
        <div className="sf-example">
          <MoreLink bare onClick={() => setExampleOpen((v) => !v)} aria-expanded={exampleOpen} aria-controls={`sf-example-${step.key}`}>
            {exampleOpen ? 'Hide the example' : 'See an example'}
          </MoreLink>
          {exampleOpen && <p id={`sf-example-${step.key}`} className="sf-example-text">{step.example}</p>}
        </div>
      )}
      {step.render(tool)}
    </ToolFrame>
  );
}
