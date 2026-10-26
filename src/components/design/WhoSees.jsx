import { useState } from 'react';
import { useCoachName, whoSeesText } from './coachContext';
import { EyeIcon, IconText } from './IconText';
import { Sheet } from './Dialogs';
import { useToast, ERROR_MESSAGE } from './toastContext';
import './design.css';

// Who can see this (experience rule 44, Tim 23 Oct; M6): a small eye and
// who can see what's typed here, right beside where people type, so they
// feel safe to write anything. It changes the moment something is
// shared, and back if sharing is undone (the page passes the current
// audience). Screen readers hear "Who can see this: Only you".
// It follows the icon-with-words standard (Tim, 26 Oct): 14px words,
// a 16px eye with 1.5px lines.
//
// audience:  'me' (Only you), 'coach' (You and [coach's first name]) or
//            'team' (Your team).
// coachName: the client's own coach's first name; from CoachContext when
//            not given. Never typed into the code.
//
// The eye can be tapped to change who sees it, there and then (Tim,
// 26 Oct; M4 dashboard v46). Pass `onChange` and the thing's `name`
// ("Your sleep"): it opens "Who can see this?" with the thing's name,
// then "Only you" and "You and [coach]". Choosing one saves at once
// (onChange may return a promise), shows "Saved" and updates the eye.
// It uses the same settings as My Account's "What your coach sees".
export const MY_ACCOUNT_LINE = 'You can also change this in My Account, under What your coach sees.';

export default function WhoSees({ audience = 'me', coachName, name, onChange }) {
  const coach = useCoachName(coachName);
  const [open, setOpen] = useState(false);
  const words = whoSeesText(audience, coach);
  if (!onChange) {
    return (
      <IconText icon={<EyeIcon />} className="ds-who" aria-live="polite">
        <span className="ds-sr">Who can see this: </span>
        {words}
      </IconText>
    );
  }
  return (
    <>
      <IconText icon={<EyeIcon />} className="ds-who" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="ds-sr">Who can see this: </span>
        {words}
      </IconText>
      <WhoSeesSheet
        open={open}
        onClose={() => setOpen(false)}
        name={name}
        audience={audience}
        coach={coach}
        onChange={onChange}
      />
    </>
  );
}

function WhoSeesSheet({ open, onClose, name, audience, coach, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const choose = async (next) => {
    if (busy) return;
    if (next === audience) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await onChange(next);
      onClose();
      toast.show('Saved');
    } catch {
      toast.error(ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Who can see this?" footer={<p className="ds-sheet-foot">{MY_ACCOUNT_LINE}</p>}>
      {name && <p className="ds-sheet-name">{name}</p>}
      <div className="ds-listbox ds-sheet-options" role="listbox" aria-label="Who can see this?">
        {['me', 'coach'].map((value) => (
          <button
            key={value}
            type="button"
            role="option"
            aria-selected={audience === value}
            className="ds-option"
            onClick={() => choose(value)}
          >
            <span className="ds-option-text">{whoSeesText(value, coach)}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// The eye at the top of a page: what the coach sees of the whole page
// (Tim, 26 Oct; M4 dashboard v46). It reads "Only you", or "[Coach] sees
// 2 parts". Tapped, it opens "What [coach] sees" with one switch per
// part; each switch saves at once and shows "Saved".
//
// parts:    [{ key, label, shared }] in the order they appear on the page.
// onToggle: (key, shared) => promise or nothing.
export function CoachSees({ parts, onToggle, coachName }) {
  const coach = useCoachName(coachName);
  const [open, setOpen] = useState(false);
  const shared = parts.filter((p) => p.shared).length;
  const who = coach || 'Your coach';
  const words = shared
    ? `${who} sees ${shared} ${shared === 1 ? 'part' : 'parts'}`
    : 'Only you';
  return (
    <>
      <IconText icon={<EyeIcon />} className="ds-who" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="ds-sr">Who can see this page: </span>
        {words}
      </IconText>
      <CoachSeesSheet open={open} onClose={() => setOpen(false)} parts={parts} onToggle={onToggle} coach={coach} />
    </>
  );
}

function CoachSeesSheet({ open, onClose, parts, onToggle, coach }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const who = coach || 'Your coach';
  const flip = async (part) => {
    if (busy) return;
    setBusy(part.key);
    try {
      await onToggle(part.key, !part.shared);
      toast.show('Saved');
    } catch {
      toast.error(ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={coach ? `What ${coach} sees` : 'What your coach sees'} footer={<p className="ds-sheet-foot">{MY_ACCOUNT_LINE}</p>}>
      <p className="ds-sheet-name">{who} only sees what you switch on here.</p>
      <div className="ds-sheet-rows">
        {parts.map((part) => (
          <div className="ds-sheet-row" key={part.key}>
            <span>{part.label}</span>
            <button
              type="button"
              role="switch"
              className="ds-switch"
              aria-checked={part.shared}
              aria-label={`${who} can see ${part.label.charAt(0).toLowerCase()}${part.label.slice(1)}`}
              aria-busy={busy === part.key}
              onClick={() => flip(part)}
            />
          </div>
        ))}
      </div>
    </Sheet>
  );
}
