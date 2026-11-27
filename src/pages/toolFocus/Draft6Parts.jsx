import { AddButton, DatePicker, IconButton, RowList, TextBox, TextField, todayKey } from '../../components/design';
import { newId } from '../../lib/syncQueue';
import { rowTexts, withRows } from '../../lib/draft6Tools/shared';
import './draft6.css';

// The answers Draft 6's rebuilt tools share (Polish 1, Stage D item 1): a
// list of rows that keep their own ids, a box with its day (and time), and
// pairs of boxes (If and Then; a name and what they want). Built from the
// shared parts only: RowList, TextBox, DatePicker, TextField, AddButton and
// the bare × (IconButton).

/** A list the person adds to as they like (question rule 12): each row its own box. */
export function ListAnswer({ label, list, onList, itemLabel, addLabel = 'Add another' }) {
  return (
    <RowList
      label={label}
      rows={rowTexts(list)}
      max={Infinity}
      removeAlways
      undo
      itemLabel={itemLabel}
      addLabel={addLabel}
      onChange={(rows, change) => onList(withRows(list, rows, change, newId))}
    />
  );
}

/** A box for what they'll do, then the day it happens (and the time, where asked). */
export function BoxAndWhen({ question, text, onText, date, onDate, time, onTime, dayLabel = 'Which day?', timeLabel = 'What time?' }) {
  return (
    <div className="d6-when">
      {onText && <TextBox lines="many" ariaLabel={question} value={text} onChange={onText} />}
      <div className={`d6-when-row${onTime ? ' d6-when-row--two' : ''}`}>
        <DatePicker label={dayLabel} value={date || ''} onChange={onDate} min={todayKey()} />
        {onTime && <TextField label={timeLabel} type="time" step={300} value={time || ''} onChange={(e) => onTime(e.target.value)} />}
      </div>
    </div>
  );
}

/**
 * Pairs of boxes, side by side on a laptop and one over the other on a
 * phone, with "Add another" and the bare × to take a pair out.
 * fields: [{ key, label }, { key, label }]; rows: [{ id, [key]: text }].
 */
export function PairRows({ rows, onRows, fields, itemName = 'pair' }) {
  const shown = rows?.length ? rows : [{ id: newId() }];
  const set = (id, key, value) => onRows(shown.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  return (
    <div className="d6-pairs">
      {shown.map((row, n) => (
        <div className="d6-pair" key={row.id}>
          <div className="d6-pair-boxes">
            {fields.map((f) => (
              <TextBox
                key={f.key}
                label={f.label}
                lines="one"
                value={row[f.key] || ''}
                onChange={(v) => set(row.id, f.key, v)}
              />
            ))}
          </div>
          {shown.length > 1
            ? <IconButton label={`Remove ${itemName} ${n + 1}`} onClick={() => onRows(shown.filter((r) => r.id !== row.id))} />
            : <span className="d6-pair-space" aria-hidden="true" />}
        </div>
      ))}
      <AddButton onClick={() => onRows([...shown, { id: newId() }])}>Add another</AddButton>
    </div>
  );
}
