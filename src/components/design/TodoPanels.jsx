import { useRef } from 'react';
import { Button } from './Button';
import { Choice, Dropdown } from './Choice';
import MultiChoice from './MultiChoice';
import TextBox from './TextBox';
import { SlidePanel } from './Dialogs';
import { IMPACT_OPTIONS } from './impact';
import './design.css';

// The add panels (M1 sheetPanel 'todo' and 'win'; reused in Phase 3 by
// the weekly debrief and Plan my day). They keep one order (Tim, 23 Oct):
// what it is, which Strategy, how much, then when, last. The page holds
// the form (so a draft survives a refresh) and does the saving.
//
// form:  { text, strategyId, impact (1 to 3), week } for a to-do;
//        { text, strategyIds: [], impact, day } for a win
// strategies: [{ value, label }]; weeks: [{ value, label }]; days: [{ value, label }]

const TEXT_LIMIT = 300; // todos.text and wins.what hold up to 300 characters

function Footer({ onCancel, onAdd, ready, label }) {
  return (
    <div className="ds-panel-actions">
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" disabled={!ready} onClick={onAdd}>{label}</Button>
    </div>
  );
}

export function AddTodoPanel({ open, onClose, form, onFormChange, strategies, weeks, onAdd }) {
  const box = useRef(null);
  const set = (patch) => onFormChange({ ...form, ...patch });
  const ready = Boolean(form.text.trim() && form.strategyId && form.week);
  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Add a to-do"
      initialFocusRef={box}
      footer={<Footer onCancel={onClose} onAdd={() => ready && onAdd(form)} ready={ready} label="Add my to-do" />}
    >
      <div className="ds-panel-form">
        <TextBox ref={box} label="What needs doing?" who="me" value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Book a physio assessment" maxLength={TEXT_LIMIT} />
        <Choice label="Which Strategy does it serve?" options={strategies} value={form.strategyId} onChange={(strategyId) => set({ strategyId })} form="rows" />
        <Choice label="How much will it move this Strategy?" options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
        <div>
          <Dropdown label="Which week?" options={weeks} value={form.week} onChange={(week) => set({ week })} />
          <p className="ds-panel-note">Moving it before that week starts doesn’t count against you.</p>
        </div>
      </div>
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
          <p>It counts as done and is saved to your Performance Evidence.</p>
        </div>
        <TextBox ref={box} label="What did you do?" who="me" value={form.text} onChange={(text) => set({ text })} placeholder="e.g. Ran a workshop that led to two referrals" maxLength={TEXT_LIMIT} />
        <MultiChoice label="Which Strategies did it help?" hint="Pick all that apply." options={strategies} values={form.strategyIds} onChange={(strategyIds) => set({ strategyIds })} />
        <Choice label="How much did it help?" options={IMPACT_OPTIONS} value={form.impact} onChange={(impact) => set({ impact })} />
        <Choice label="Which day?" options={days} value={form.day} onChange={(day) => set({ day })} />
      </div>
    </SlidePanel>
  );
}

// Move a to-do to another week (M1 'move'). Choosing a week moves it at
// once. `started` is the line saying it won't count as done this week,
// for a to-do due this week (M2); a to-do in a later week moves free.
export function MoveTodoPanel({ open, onClose, text, started, options, onMove, emptyLine }) {
  return (
    <SlidePanel open={open} onClose={onClose} title="Move this to-do">
      <div className="ds-panel-form">
        <div className="ds-panel-lead">
          <p className="ds-panel-lead-text">{text}</p>
          {started && <p>{started}</p>}
        </div>
        {options.length ? (
          <Choice label="Which week should it move to?" options={options} value={null} onChange={onMove} form="rows" />
        ) : (
          <p className="ds-panel-note">{emptyLine}</p>
        )}
      </div>
    </SlidePanel>
  );
}
