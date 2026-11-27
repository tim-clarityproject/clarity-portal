import { useRef, useState } from 'react';
import { Button } from './Button';
import { Choice, Dropdown } from './Choice';
import MultiChoice from './MultiChoice';
import TextBox from './TextBox';
import { SlidePanel, useDismissPanel } from './Dialogs';
import { ErrorMessage } from './Status';
import { IMPACT_OPTIONS, helpQuestion, moveQuestion } from './impact';
import { BACKLOG_LINE, BACKLOG_VALUE, TODO_WHERE } from '../../lib/performance/sprintPage';
import './design.css';

// The add panels (M1 sheetPanel 'todo' and 'win'; reused in Phase 3 by
// the weekly debrief and Daily plan). They keep one order (Tim, 23 Oct):
// what it is, which Strategy, how much, then when, last. The page holds
// the form (so a draft survives a refresh) and does the saving.
//
// form:  { text, strategyId, impact (1 to 3), week } for a to-do;
//        { text, strategyIds: [], impact, day } for a win
// strategies: [{ value, label }]; weeks: [{ value, label }]; days: [{ value, label }]

const TEXT_LIMIT = 300; // todos.text and wins.what hold up to 300 characters

const nameOf = (strategies, id) => (strategies || []).find((s) => s.value === id)?.label || null;

// never: the button is never greyed out (a tool's add panel, as M9 and
// M10 draw it): pressing it with something missing says what is needed.
function Footer({ onCancel, onAdd, ready, label, never = false }) {
  // Cancel closes it as the cross does, so what is typed is kept (tidy pass item 3).
  const dismiss = useDismissPanel();
  return (
    <div className="ds-panel-actions">
      <Button onClick={dismiss || onCancel}>Cancel</Button>
      <Button variant="primary" disabled={!never && !ready} onClick={onAdd}>{label}</Button>
    </div>
  );
}

// What a tool's add panel says when its button is pressed too soon.
export const TODO_NEEDS = {
  text: 'Type what needs doing to carry on.',
  strategy: 'Choose a Strategy to carry on.',
  impact: 'Choose Low, Medium or High to carry on.',
  week: 'Choose a week to carry on.',
};

// Where a tool's to-do goes (M10 "Where should it go?"; Tim, 13 Nov,
// 10:42): This week, Backlog or Don’t add it, with the Backlog's one line
// under the choice while Backlog is chosen. It stands on its own inside a
// tool's step (the Emotional wash) and is the last question of the add
// panel a tool opens. options: todoWhereOptions({ running }).
export function TodoWhere({ value, onChange, options, label = 'Where should it go?' }) {
  return (
    <div className="ds-todo-where">
      {/* A joined switch while its equal parts fit, else rows (Stage C: never unequal; the wash's commit screen at twice the text size, Stage D). */}
      <Choice label={label} options={options} value={value} onChange={onChange} fit />
      {value === TODO_WHERE.backlog && <p className="ds-panel-note" role="status">{BACKLOG_LINE}</p>}
    </div>
  );
}

// todayNote: Daily plan's mode (M5 todoPanel): no "Which week?" (it goes
// into today and this week), and this line instead ("It’s added to today
// and to this week’s sprint.").
// where: a tool's mode (M10; Tim, 13 Nov, 10:42): the choices for "Where
// should it go?" (todoWhereOptions), in place of "Which week?"; the form
// then holds `where` ('week', 'backlog' or 'none'). With "Don’t add it"
// chosen nothing else is needed and the button reads "Done".
// notice: lines shown in place of the questions when nothing can be added
// (the plan has no Strategy for a to-do to serve): the panel says so, and
// its one button, "Done", closes it as "Don’t add it".
// draftKey: keeps what is typed when the panel is closed without adding,
// and puts it back next time (Dialogs' draftKey); for a page that doesn't
// keep its own draft of the form.
export function AddTodoPanel({ open, onClose, form, onFormChange, strategies, weeks, onAdd, todayNote, where, notice, draftKey = null }) {
  const box = useRef(null);
  const set = (patch) => onFormChange({ ...form, ...patch });
  const today = Boolean(todayNote);
  const tool = Array.isArray(where);
  const none = tool && form.where === TODO_WHERE.none;
  const noStrategies = Boolean(notice?.length);
  // A tool's panel follows M9 (Phase 8a follow-up, step 1): Strategies in
  // the branded drop-down, and "How much" starts unchosen, so it is asked.
  const ready = noStrategies || none || Boolean(form.text.trim() && form.strategyId && (!tool || form.impact) && (today || (tool ? form.where : form.week)));
  // A tool's panel never greys its button out (M9, M10): a press with
  // something missing shows one calm line under the part it is about.
  const [asked, setAsked] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    setAsked(false);
  }
  // Never greyed out anywhere (Phase 8a follow-up, step 2): the sprint
  // page's own panel and Daily plan's say what is missing, as a tool's does.
  const add = () => {
    if (ready) onAdd(noStrategies ? { ...form, where: TODO_WHERE.none } : form);
    else {
      setAsked(true);
      if (!form.text.trim()) box.current?.focus();
    }
  };
  const needs = asked && !none;
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add to-do"
      draftKey={noStrategies ? null : draftKey}
      initialFocusRef={noStrategies ? undefined : box}
      footer={noStrategies
        ? <Button onClick={add}>Done</Button>
        : <Footer onCancel={onClose} onAdd={add} ready={ready} never label={none ? 'Done' : 'Add to-do'} />}
    >
      {noStrategies ? (
        <div className="ds-panel-lead">
          {notice.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        <div className="ds-panel-form">
          {/* In a tool the eye is on its first step and its summary only (Tim, 13 Nov, 09:32), so not here. */}
          <div>
            <TextBox ref={box} label="What needs doing?" who={tool ? undefined : 'me'} value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Book a physio assessment" maxLength={TEXT_LIMIT} />
            {needs && !form.text.trim() && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.text}</ErrorMessage></div>}
          </div>
          <div>
            {tool
              ? <Dropdown label="Which Strategy does it serve?" options={strategies} value={form.strategyId} onChange={(strategyId) => set({ strategyId })} placeholder="Choose a Strategy" />
              : <Choice label="Which Strategy does it serve?" options={strategies} value={form.strategyId} onChange={(strategyId) => set({ strategyId })} form="rows" />}
            {needs && !form.strategyId && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.strategy}</ErrorMessage></div>}
          </div>
          <div>
            <Choice label={moveQuestion(nameOf(strategies, form.strategyId))} options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
            {needs && !form.impact && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.impact}</ErrorMessage></div>}
          </div>
          {today && <p className="ds-panel-note">{todayNote}</p>}
          {tool && <TodoWhere options={where} value={form.where} onChange={(w) => set({ where: w })} />}
          {!today && !tool && (
            <div>
              <Dropdown label="Which week?" options={weeks} value={form.week} onChange={(week) => set({ week })} />
              {needs && !form.week && <div className="ds-panel-needs"><ErrorMessage>{TODO_NEEDS.week}</ErrorMessage></div>}
              <p className="ds-panel-note">{form.week === BACKLOG_VALUE ? BACKLOG_LINE : 'Moving it before that week starts doesn’t count against you.'}</p>
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}

// Never greyed out (Phase 8a follow-up, step 2): pressed with something
// missing, it says what under the part it is about.
export const WIN_NEEDS = {
  text: 'Type what you did to carry on.',
  strategies: 'Choose at least one Strategy to carry on.',
  day: 'Choose a day to carry on.',
};

export function AddWinPanel({ open, onClose, form, onFormChange, strategies, days, onAdd, draftKey = null }) {
  const box = useRef(null);
  const set = (patch) => onFormChange({ ...form, ...patch });
  const ready = Boolean(form.text.trim() && form.strategyIds.length && form.day);
  const [asked, setAsked] = useState(false);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    setAsked(false);
  }
  const add = () => {
    if (ready) onAdd(form);
    else {
      setAsked(true);
      if (!form.text.trim()) box.current?.focus();
    }
  };
  const need = (missing, words) => asked && missing && <div className="ds-panel-needs"><ErrorMessage>{words}</ErrorMessage></div>;
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add unplanned win"
      draftKey={draftKey}
      initialFocusRef={box}
      footer={<Footer onCancel={onClose} onAdd={add} ready={ready} never label="Add my win" />}
    >
      <div className="ds-panel-form">
        <div className="ds-panel-lead">
          <p>Something you did that wasn’t in your plan but moved the needle.</p>
          <p>It counts as done and is saved to your confidence bank.</p>
        </div>
        <div>
          <TextBox ref={box} label="What did you do?" who="me" value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Ran a workshop that led to two referrals" maxLength={TEXT_LIMIT} />
          {need(!form.text.trim(), WIN_NEEDS.text)}
        </div>
        <div>
          <MultiChoice label="Which Strategies did it help?" hint="Pick all that apply." options={strategies} values={form.strategyIds} onChange={(strategyIds) => set({ strategyIds })} />
          {need(!form.strategyIds.length, WIN_NEEDS.strategies)}
        </div>
        <Choice label={helpQuestion(form.strategyIds.map((id) => nameOf(strategies, id)).filter(Boolean))} options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
        <div>
          <Choice label="Which day?" options={days} value={form.day} onChange={(day) => set({ day })} />
          {need(!form.day, WIN_NEEDS.day)}
        </div>
      </div>
    </SlidePanel>
  );
}

// Move a to-do to another week (M1 'move'). Choosing a week moves it at
// once. `started` is the line saying it won't count as done this week,
// for a to-do due this week (M2); a to-do in a later week moves free.
// The Backlog is the last place in the list (Tim, 13 Nov, 10:42). A
// to-do in the Backlog is planned into a week with the same panel:
// `title` and `label` give it its own words.
export function MoveTodoPanel({ open, onClose, text, started, options, onMove, emptyLine, title = 'Move this to-do', label = 'Which week should it move to?' }) {
  return (
    <SlidePanel open={open} onClose={onClose} title={title}>
      <div className="ds-panel-form">
        <div className="ds-panel-lead">
          <p className="ds-panel-lead-text">{text}</p>
          {started && <p>{started}</p>}
        </div>
        {options.length ? (
          <Choice label={label} options={options} value={null} onChange={onMove} form="rows" />
        ) : (
          <p className="ds-panel-note">{emptyLine}</p>
        )}
      </div>
    </SlidePanel>
  );
}
