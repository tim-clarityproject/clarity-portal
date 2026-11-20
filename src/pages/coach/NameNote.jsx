import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, SlidePanel, TextBox } from '../../components/design';
import { birthdayNote, firstName, possessive, quickContacts } from '../../lib/coach/model';
import { TextLink, useCoachPortal } from './parts';

// Names in quiet lines open a note (Tim, 18 Nov, 15:58): any person named in
// a quiet line ("It's Priya Nair's birthday today.") opens a short drafted
// note. Email opens the coach's own email app with the note; nothing is
// sent until they send it there. "View Priya's page" sits at the bottom.
//
// M11 also draws "Portal message". It is dropped for good (Phase 6a run 2):
// Tim's answer 40 (17 Nov) is no messages in the portal, ever. The note
// offers Email only, plus View their page.

export default function NameNote({ profile, reason, onClose }) {
  const { coach } = useCoachPortal();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const id = profile?.id || null;
  useEffect(() => {
    if (profile) setNote(birthdayNote(profile, coach.display_first_name));
    // A new person: a new draft. Typing is never replaced while the panel is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!profile) return <SlidePanel open={false} onClose={onClose} title="" />;
  const first = firstName(profile.name);
  const email = quickContacts(profile, { subject: `Happy birthday, ${first}`, body: note }).find((c) => c.key === 'email');
  return (
    <SlidePanel
      open
      onClose={onClose}
      title={profile.name}
      footer={(
        <div className="cc-panel-foot">
          <TextLink onClick={() => { onClose(); navigate(`/coach/clients/${profile.id}`); }}>View {possessive(first)} page</TextLink>
          {email && <a className="ds-btn ds-btn--primary" href={email.href} onClick={onClose}>Open in my email</a>}
        </div>
      )}
    >
      <p className="cc-quiet">{reason}</p>
      <div className="cc-field">
        <TextBox label={`A note to ${first}`} value={note} onChange={setNote} />
      </div>
      <p className="cc-note">{email ? 'Nothing is sent until you send it from your own email.' : `Add ${possessive(first)} email to their page to send this.`}</p>
      {!email && <div className="cc-acts"><Button variant="outline" onClick={() => { onClose(); navigate(`/coach/clients/${profile.id}`); }}>Open {possessive(first)} page</Button></div>}
    </SlidePanel>
  );
}
