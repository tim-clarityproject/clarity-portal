import { useRef } from 'react';
import { Button } from './Button';
import { Choice, Dropdown } from './Choice';
import MultiChoice from './MultiChoice';
import TextBox from './TextBox';
import { SlidePanel } from './Dialogs';
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

function Footer({ onCancel, onAdd, ready, label }) {
  return (
    <div className="ds-panel-actions">
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" disabled={!ready} onClick={onAdd}>{label}</Button>
    </div>
  );
}

// Where a tool's to-do goes (M10 "Where should it go?"; Tim, 13 Nov,
// 10:42): This week, Backlog or Don’t add it, with the Backlog's one line
// under the choice while Backlog is chosen. It stands on its own inside a
// tool's step (the Emotional wash) and is the last question of the add
// panel a tool opens. options: todoWhereOptions({ running }).
export function TodoWhere({ value, onChange, options, label = 'Where should it go?' }) {
  return (
    <div className="ds-todo-where">
      <Choice label={label} options={options} value={value} onChange={onChange} form="pills" />
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
export function AddTodoPanel({ open, onClose, form, onFormChange, strategies, weeks, onAdd, todayNote, where, notice }) {
  const box = useRef(null);
  const set = (patch) => onFormChange({ ...form, ...patch });
  const today = Boolean(todayNote);
  const tool = Array.isArray(where);
  const none = tool && form.where === TODO_WHERE.none;
  const noStrategies = Boolean(notice?.length);
  const ready = noStrategies || none || Boolean(form.text.trim() && form.strategyId && (today || (tool ? form.where : form.week)));
  const add = () => { if (ready) onAdd(noStrategies ? { ...form, where: TODO_WHERE.none } : form); };
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add a to-do"
      initialFocusRef={noStrategies ? undefined : box}
      footer={noStrategies
        ? <Button onClick={add}>Done</Button>
        : <Footer onCancel={onClose} onAdd={add} ready={ready} label={none ? 'Done' : 'Add my to-do'} />}
    >
      {noStrategies ? (
        <div className="ds-panel-lead">
          {notice.map((line) => <p key={line}>{line}</p>)}
        </div>
      ) : (
        <div className="ds-panel-form">
          <TextBox ref={box} label="What needs doing?" who="me" value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Book a physio assessment" maxLength={TEXT_LIMIT} />
          <Choice label="Which Strategy does it serve?" options={strategies} value={form.strategyId} onChange={(strategyId) => set({ strategyId })} form="rows" />
          <Choice label={moveQuestion(nameOf(strategies, form.strategyId))} options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
          {today && <p className="ds-panel-note">{todayNote}</p>}
          {tool && <TodoWhere options={where} value={form.where} onChange={(w) => set({ where: w })} />}
          {!today && !tool && (
            <div>
              <Dropdown label="Which week?" options={weeks} value={form.week} onChange={(week) => set({ week })} />
              <p className="ds-panel-note">{form.week === BACKLOG_VALUE ? BACKLOG_LINE : 'Moving it before that week starts doesn’t count against you.'}</p>
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}

export function AddWinPanel({ open, onClose, form, onFormChange, strategies, days, onAdd }) {
  const box = useRef(null);
  const set = (patch) => onFormChange({ ...form, ...patch });
  const ready = Boolean(form.text.trim() && form.strategyIds.length && form.day);
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add an unplanned win"
      initialFocusRef={box}
      footer={<Footer onCancel={onClose} onAdd={() => ready && onAdd(form)} ready={ready} label="Add my win" />}
    >
      <div className="ds-panel-form">
        <div className="ds-panel-lead">
          <p>Something you did that wasn’t in your plan but moved the needle.</p>
          <p>It counts as done and is saved to your Confidence Bank.</p>
        </div>
        <TextBox ref={box} label="What did you do?" who="me" value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Ran a workshop that led to two referrals" maxLength={TEXT_LIMIT} />
        <MultiChoice label="Which Strategies did it help?" hint="Pick all that apply." options={strategies} values={form.strategyIds} onChange={(strategyIds) => set({ strategyIds })} />
        <Choice label={helpQuestion(form.strategyIds.map((id) => nameOf(strategies, id)).filter(Boolean))} options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
        <Choice label="Which day?" options={days} value={form.day} onChange={(day) => set({ day })} />
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
