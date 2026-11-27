import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Button, ErrorMessage, TextField, useToast } from '../../components/design';
import { friendlyError, needsConnection, isOffline } from '../../lib/friendlyError';
import { hasPassword, signsInWithGoogle } from '../../lib/signIn/account';
import { returnAddress } from '../../lib/signIn/addresses';
import { ADD_FIRST_NAME, DIDNT_SEND, EMAIL_NOT_RIGHT, looksLikeEmail, SAME_EMAIL, TOO_MANY } from '../../lib/signIn/words';
import { limitName, NAME_TOO_LONG } from '../../lib/nameLimit';

// My Account, Profile (walk item 25, 27 Nov; example-pages-25nov.html "My Account", Profile): two
// questions with their boxes, "What should we call you?" and "What's your email?", in place of the
// rows that opened their own pages.
//
// The name saves as the Edit profile page did (profiles.first_name), when the box is left or Enter is
// pressed. The email keeps sign-in rules 25 and 43 exactly: a new email is sent through the same
// Supabase call as the Email page, then the Email page opens on "Check your email" (it reads the
// waiting address from the account), so the two links, Send it again and every message stay that
// page's. Someone who signs in with Google sees their email, not to be typed over; the pane says
// "You sign in with Google." where Change my password would be.

const lines = (words) => (Array.isArray(words) ? words.join(' ') : words);

export default function ProfileFields({ user, firstName, loading, onNameSaved }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(firstName);
  const [nameProblem, setNameProblem] = useState('');
  const savedName = useRef(firstName);
  const nameTyped = useRef(false);
  useEffect(() => {
    // The box follows the saved name until they type in it.
    savedName.current = firstName;
    if (!nameTyped.current) setName(firstName);
  }, [firstName]);

  const saveName = async () => {
    const next = name.trim();
    if (next === (savedName.current || '').trim()) { setNameProblem(''); return; }
    if (!next) { setNameProblem(ADD_FIRST_NAME); return; }
    setNameProblem('');
    const { data, error } = await supabase.from('profiles').update({ first_name: next }).eq('id', user.id).select('first_name');
    if (error || !data?.length) {
      setNameProblem(isOffline() ? needsConnection('Saving your name') : 'Your name didn’t save. Check your connection and try again.');
      return;
    }
    savedName.current = next;
    nameTyped.current = false;
    onNameSaved?.(next);
    toast.show('Saved');
  };

  const canChangeEmail = user && !signsInWithGoogle(user) && hasPassword(user);
  const [email, setEmail] = useState(user?.email || '');
  const [emailProblem, setEmailProblem] = useState(null);
  const busy = useRef(false);
  const emailTyped = useRef(false);
  useEffect(() => {
    if (!emailTyped.current) setEmail(user?.email || '');
  }, [user?.email]);
  const emailChanged = email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

  const sendEmail = async (e) => {
    e.preventDefault();
    if (busy.current || !canChangeEmail) return;
    setEmailProblem(null);
    const address = email.trim();
    if (!looksLikeEmail(address)) { setEmailProblem(EMAIL_NOT_RIGHT); return; }
    if (address.toLowerCase() === (user.email || '').toLowerCase()) { setEmailProblem(SAME_EMAIL); return; }
    if (isOffline()) { setEmailProblem(needsConnection('Sending the link')); return; }
    busy.current = true;
    try {
      const { error } = await supabase.auth
        .updateUser({ email: address }, { emailRedirectTo: returnAddress('emailChange', window.location.origin) })
        .catch((err) => ({ error: err }));
      if (error) {
        if (error.status === 429 || /rate limit|too many|security purposes/i.test(error.message || '')) setEmailProblem(TOO_MANY);
        else if (error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message || '')) setEmailProblem(['There’s already an account with this email.', 'Enter a different one to carry on.']);
        else setEmailProblem(friendlyError(error, DIDNT_SEND.join(' '), 'Sending the link'));
        return;
      }
      // "Check your email", with its two links, is the Email page's (sign-in rule 43).
      navigate('/my-account/email');
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="acct-fields">
      <div className="acct-field">
        <TextField
          label="What should we call you?"
          value={loading && !nameTyped.current ? '' : name}
          autoComplete="given-name"
          aria-busy={loading || undefined}
          onChange={(e) => {
            nameTyped.current = true;
            const { value, over } = limitName(e.target.value);
            setNameProblem(over ? NAME_TOO_LONG : '');
            setName(value);
          }}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } }}
        />
        {nameProblem ? <ErrorMessage>{nameProblem}</ErrorMessage> : null}
      </div>
      <form className="acct-field" onSubmit={sendEmail} noValidate>
        <TextField
          label="What’s your email?"
          type="email"
          autoComplete="email"
          value={email}
          readOnly={!canChangeEmail}
          onChange={(e) => { emailTyped.current = true; setEmailProblem(null); setEmail(e.target.value); }}
        />
        {emailProblem ? <ErrorMessage>{lines(emailProblem)}</ErrorMessage> : null}
        {canChangeEmail && emailChanged ? (
          <div className="acct-field-save">
            <Button type="submit" variant="outline">Save my new email</Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
