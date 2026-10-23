import { useCallback, useMemo, useState } from 'react';
import {
  Choice,
  clearGuideDraft,
  dayLabel,
  GuidedSummary,
  HelpPanel,
  nextMondayKey,
  TextBox,
  todayKey,
  useAutosave,
  useToast,
} from '../../components/design';
import { forgetSaved, startingValue, usePretendServer } from './galleryUtils';

// A live guided-tool demo for the gallery, built on GuidedTool with M6's
// "Start a sprint" wording. Invented text only; nothing is sent anywhere
// (the save is pretended). Answers and the step are kept on the device,
// so an unfinished demo carries on as a draft.

const LENGTHS = [4, 6, 8, 12, 16];
const STANDARDS = [75, 80, 85, 90];

// Examples follow the role picked at sign-up (M6); Other gets Leader's.
const NEXT_TIME = {
  ceo: 'Finish by 18:30 on 4 nights a week, so training doesn’t slip.',
  coach: 'Protect one full rest day a week, even in-season.',
  leader: 'Say no to one meeting a week that I don’t need to be in.',
};

const LABEL_EXAMPLE = {
  ceo: 'e.g. Q1, Merger year',
  coach: 'e.g. Pre-season, In-season block 2',
  leader: 'e.g. Q1, New team',
  other: 'e.g. Q1, Autumn',
};

function startingAnswers() {
  return {
    len: 12,
    tpl: false,
    label: '',
    start: nextMondayKey(),
    extraStart: null,
    std: 85,
    other: false,
    otherStd: '',
    better: '',
  };
}

function useSprintAnswers(key) {
  const [answers, setAnswers] = useState(() => ({ ...startingAnswers(), ...(startingValue(key, {}) || {}) }));
  const [save] = usePretendServer(key);
  const state = useAutosave(answers, save, { draftKey: key });
  const set = useCallback((patch) => setAnswers((a) => ({ ...a, ...patch })), []);
  const reset = useCallback(() => {
    forgetSaved(key);
    setAnswers(startingAnswers());
  }, [key]);
  return [answers, set, state, reset];
}

function sprintSteps(a, set, role, openCalendar) {
  const weeks = a.tpl ? 13 : a.len;
  const today = todayKey();
  const monday = nextMondayKey();
  const startOptions = [
    { value: today, label: `Today, ${dayLabel(today)}` },
    { value: monday, label: dayLabel(monday), note: 'suggested' },
  ];
  if (a.extraStart && a.extraStart !== today && a.extraStart !== monday) {
    startOptions.push({ value: a.extraStart, label: dayLabel(a.extraStart) });
  }
  const pct = Number(a.otherStd);
  const otherValid = a.other && Number.isInteger(pct) && pct >= 50 && pct <= 100;
  const standard = a.other ? (otherValid ? pct : null) : a.std;

  return [
    {
      key: 'length',
      name: 'Length',
      label: 'Performance Sprint 5',
      question: 'How long is this sprint?',
      nudges: ['Pick 2 to 16 weeks.', '12 is long enough to see results and short enough to stay focused.'],
      tip: { key: 'gallery-sprint-saves', text: 'Everything saves as you go.' },
      render: () => (
        <div className="dr-stack dr-stack--fill">
          <Choice
            ariaLabel="How long is this sprint?"
            options={LENGTHS.map((n) => ({ value: n, label: `${n} weeks`, note: n === 12 ? 'suggested' : undefined }))}
            value={a.tpl ? null : a.len}
            onChange={(len) => set({ len, tpl: false })}
          />
          <button type="button" className="dr-tmpl" aria-pressed={a.tpl} onClick={() => set({ tpl: !a.tpl })}>
            <span>Just started a new role?</span>
            <small>Here’s a first 90 days template to get you started.</small>
          </button>
          <div>
            <TextBox
              label="What would you like to call it?"
              who="me"
              maxLength={40}
              lines="one"
              value={a.label}
              onChange={(label) => set({ label })}
              placeholder={LABEL_EXAMPLE[role] || LABEL_EXAMPLE.leader}
            />
            <p className="ds-hint">Optional.</p>
          </div>
        </div>
      ),
    },
    {
      key: 'start',
      name: 'Start',
      question: 'When does it start?',
      nudges: ['Pick any day. You can move it before it starts.'],
      render: () => (
        <div>
          <Choice ariaLabel="When does it start?" form="rows" options={startOptions} value={a.start} onChange={(start) => set({ start })} />
          <div className="dr-rows-tail">
            <button type="button" className="ds-answer" aria-haspopup="dialog" onClick={openCalendar}>Another day</button>
          </div>
        </div>
      ),
    },
    {
      key: 'standard',
      name: 'Standard',
      question: 'What’s your performance standard this time?',
      nudges: ['Lower it for a heavy period, or raise it for a stretch.'],
      render: () => (
        <div>
          <Choice
            ariaLabel="What’s your performance standard this time?"
            options={[...STANDARDS.map((v) => ({ value: v, label: `${v}%` })), { value: 'other', label: 'Other' }]}
            value={a.other ? 'other' : a.std}
            onChange={(v) => (v === 'other' ? set({ other: true }) : set({ other: false, std: v }))}
          />
          {a.other ? (
            <div className="dr-pct">
              <div className="dr-pct-row">
                <TextBox
                  label="What percentage?"
                  lines="one"
                  inputMode="numeric"
                  maxLength={3}
                  value={a.otherStd}
                  onChange={(otherStd) => set({ otherStd: otherStd.replace(/[^0-9]/g, '') })}
                />
                <span aria-hidden="true">%</span>
              </div>
              <p className="ds-hint">Any figure from 50 to 100.</p>
            </div>
          ) : <p className="ds-hint">85% is suggested.</p>}
          <HelpPanel
            line="Your performance standard is the weekly Performance score that counts as a good week."
            example="For example: 85% means you completed most of your plan, not all of it."
          />
        </div>
      ),
    },
    {
      key: 'better',
      name: 'Next time',
      label: 'Optional',
      info: 'Writing it down makes it easier to act on.',
      question: 'What would make this sprint even better than the last?',
      nudges: ['Pick one thing you’d do differently.'],
      example: NEXT_TIME,
      render: () => (
        <TextBox
          ariaLabel="What would make this sprint even better than the last?"
          who="me"
          value={a.better}
          onChange={(better) => set({ better })}
          focusMode
        />
      ),
    },
    {
      key: 'ready',
      name: 'Ready',
      title: 'Performance Sprint 5',
      nudges: ['Check it, then start.'],
      render: (tool) => {
        // Skipped steps show "Not yet", to fill in later.
        const unless = (key, value) => (tool.skipped.has(key) ? '' : value);
        return (
          <GuidedSummary
            onChange={tool.go}
            rows={[
              { label: 'Length', value: unless('length', `${weeks} weeks${a.tpl ? ' · first 90 days in a new role' : ''}`), step: 0 },
              { label: 'Label', value: unless('length', a.label.trim() || 'None'), step: 0 },
              { label: 'Starts', value: unless('start', dayLabel(a.start)), step: 1 },
              { label: 'Performance standard', value: unless('standard', standard != null ? `${standard}%` : ''), step: 2 },
              { label: 'Next time', value: unless('better', a.better.trim()), step: 3 },
            ]}
          />
        );
      },
    },
  ];
}

export const stepDraft = (key, layout) => `gallery-sprint-step-${key}-${layout}`;

export function useSprintDemo(key, role, openCalendar) {
  const toast = useToast();
  const [answers, set, state, reset] = useSprintAnswers(`gallery-sprint-${key}`);
  const [run, setRun] = useState(0);
  const steps = useMemo(
    () => sprintSteps(answers, set, role, openCalendar),
    [answers, set, role, openCalendar],
  );
  const finish = () => {
    toast.show(`Saved. Performance Sprint 5 starts ${dayLabel(answers.start)}.`);
    clearGuideDraft(stepDraft(key, 'framed'));
    clearGuideDraft(stepDraft(key, 'fullscreen'));
    reset();
    setRun((n) => n + 1);
  };
  return { key, answers, set, state, steps, finish, run };
}
