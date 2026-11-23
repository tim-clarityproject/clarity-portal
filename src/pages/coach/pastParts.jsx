import { useEffect, useState } from 'react';
import { SlidePanel, TextBox, useToast } from '../../components/design';
import { saveRow } from '../../lib/coach/store';
import { firstName } from '../../lib/coach/model';
import { ASK_BUTTONS, checkInAsk, checkInLater, checkInMeta, checkInNote, checkInSend, PAST_WORDS, suggestedAsk } from '../../lib/coach/crm';
import { TextLink, useCoachPortal } from './parts';
import { calm } from './crmParts';
import './crm.css';

// A past client's check-in, opened from Past clients or from Today's Keep
// in touch (M11 seq 77: "Past clients: a check-in note"): a short drafted
// note the coach edits, with a gentle referral or testimonial ask they can
// add. "Open in my email" opens the coach's own email app with it and
// marks the check-in done; nothing is sent from the portal. Not now moves
// it two weeks on. The rules and words are crm.js's.

export function CheckInPanel({ checkInId, onClose }) {
  const { userId, coach, clients, checkIns, todayKey } = useCoachPortal();
  const toast = useToast();
  const checkIn = checkInId ? checkIns.find((c) => c.id === checkInId) || null : null;
  const profile = checkIn ? clients.find((p) => p.id === checkIn.profile_id) || null : null;
  const [note, setNote] = useState({ subject: '', body: '' });
  const [ask, setAsk] = useState(null);
  useEffect(() => {
    if (!checkIn || !profile) return;
    setAsk(null);
    setNote(checkInNote(profile, { months: checkIn.months, ask: null }, { coachFirstName: coach.display_first_name || '' }));
    // A new check-in: a new draft. Typing is never replaced while the panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInId]);
  if (!checkIn || !profile) return <SlidePanel open={false} onClose={onClose} title="" />;
  const first = firstName(profile.name);
  const kind = suggestedAsk(checkIn.months);
  const plan = checkInSend(profile, { ...checkIn, ask }, note, new Date().toISOString());
  const toggleAsk = () => { const on = ask !== kind; setAsk(on ? kind : null); setNote((n) => checkInAsk(n, kind, on)); };
  const later = async () => {
    const moved = checkInLater(checkIn, todayKey);
    try {
      await saveRow(userId, 'client_check_ins', moved.checkIn);
      toast.saved({ message: moved.toast, long: true, onUndo: () => saveRow(userId, 'client_check_ins', moved.undo).catch((e) => toast.error(calm(e))) });
      onClose();
    } catch (e) { toast.error(calm(e)); }
  };
  const sent = async () => {
    // The coach's own email app opens with the note (the link's own doing); the check-in is marked done here.
    try {
      await saveRow(userId, 'client_check_ins', plan.checkIn);
      toast.saved({ message: plan.toast, long: true, onUndo: () => saveRow(userId, 'client_check_ins', checkIn).catch((e) => toast.error(calm(e))) });
    } catch (e) { toast.error(calm(e)); }
    onClose();
  };
  return (
    <SlidePanel draftKey={`past-checkin:${checkInId}`}
      open
      onClose={onClose}
      title={profile.name}
      footer={(
        <div className="cc-past-foot">
          <TextLink onClick={toggleAsk}>{ask === kind ? ASK_BUTTONS[kind].remove : ASK_BUTTONS[kind].add}</TextLink>
          <TextLink onClick={later}>{PAST_WORDS.later}</TextLink>
          {plan.href
            ? <a className="ds-btn ds-btn--primary" href={plan.href} onClick={sent}>{PAST_WORDS.open}</a>
            : <button type="button" className="ds-btn ds-btn--primary" onClick={() => toast.show(plan.toast)}>{PAST_WORDS.open}</button>}
        </div>
      )}
    >
      <p className="cc-past-meta">{checkInMeta(profile, checkIn, todayKey).map((line) => <span key={line}>{line}</span>)}</p>
      <div className="cc-field cc-past-note">
        <TextBox label={PAST_WORDS.note(first)} value={note.body} maxLength={6000} onChange={(v) => setNote((n) => ({ ...n, body: v }))} />
      </div>
      <p className="cc-note">Nothing is sent until you send it from your own email.</p>
    </SlidePanel>
  );
}
