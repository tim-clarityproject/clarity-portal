import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BoldCrosshair, Button, InlineChoice, PageOpening, TextBox, TextField } from '../../components/design';
import { answerWorkshopSurvey, loadWorkshopPage, loadWorkshopSurvey, registerForWorkshop } from '../../lib/coach/actions';
import { clean, isEmail } from '../../lib/coach/model';
import { workshopWhen } from './workshopWords';
import './coach.css';

// A workshop's two public pages (M11: "A workshop registration page"), for
// people with no account: /workshop/<the page's key> to register (a place
// while there is one, otherwise the waiting list), and
// /workshop/survey/<their own key> for the short survey the day after.
// They reach only what migration 049's four functions hand over. Like the
// other outside pages they follow the device, light or dark.

const NOT_OPEN = 'This page isn’t open at the moment. Ask whoever sent you the link.';
const NO_CONNECTION = 'This needs a connection, so try again when you’re back online.';

// One left edge (Tim, 23 Nov 2026, 17:40; sign-in rule 49): the registration and
// survey forms are on the column's left edge; a short message (a title and one
// line) is centred throughout (`message`).
function Frame({ children, message = false }) {
  return (
    <div className={`ui-root cc-public${message ? ' cc-public--message' : ''}`}>
      <div className="cc-page"><div className="cc-col" data-align={message ? 'centre' : 'start'}>
        <div className="cc-public-brand"><BoldCrosshair size={22} /><span>The Clarity Project</span></div>
        {children}
      </div></div>
    </div>
  );
}

export function WorkshopRegister() {
  const { key } = useParams();
  const [page, setPage] = useState(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState({});
  const [problem, setProblem] = useState(null);
  const [result, setResult] = useState(null);
  const busy = useRef(false);
  useEffect(() => {
    let live = true;
    loadWorkshopPage(key).then((p) => { if (live) setPage(p || null); }).catch(() => { if (live) setPage(null); });
    return () => { live = false; };
  }, [key]);
  useEffect(() => { document.title = page?.title ? `${page.title}, The Clarity Project` : 'The Clarity Project'; }, [page]);

  if (page === undefined) return <Frame message><div role="status" aria-label="Loading" /></Frame>;
  if (!page) return <Frame message><PageOpening title="Workshop" /><p className="cc-quiet">{NOT_OPEN}</p></Frame>;
  const meta = [workshopWhen(page), [page.organisation, page.place].filter(Boolean).join(', ')];
  if (result) {
    const line = {
      registered: 'You have a place. See you there.',
      waiting: 'It’s full, so you’re on the waiting list. You’ll hear if a place opens.',
      already_registered: 'You already have a place with that email.',
      already_waiting: 'You’re already on the waiting list with that email.',
    }[result];
    return <Frame message><PageOpening label={meta.filter(Boolean).join(', ')} title={page.title} /><p className="cc-quiet" role="status">{line}</p></Frame>;
  }
  if (!page.open) return <Frame message><PageOpening label={meta.filter(Boolean).join(', ')} title={page.title} /><p className="cc-quiet">Registration isn’t open at the moment.</p></Frame>;

  const questions = Array.isArray(page.questions) ? page.questions : [];
  const register = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    if (!clean(name)) { setProblem({ at: 'name', line: 'Type your name to carry on.' }); return; }
    if (!isEmail(clean(email).toLowerCase())) { setProblem({ at: 'email', line: 'Type your email to carry on.' }); return; }
    const missing = questions.find((x) => x.needed && !clean(answers[x.id]));
    if (missing) { setProblem({ at: missing.id, line: 'Answer this one to carry on.' }); return; }
    busy.current = true;
    try {
      const given = Object.fromEntries(questions.map((x) => [x.q, clean(answers[x.id]).slice(0, 2000)]).filter(([, v]) => v));
      const status = await registerForWorkshop(key, clean(name), clean(email).toLowerCase(), given);
      if (['registered', 'waiting', 'already_registered', 'already_waiting'].includes(status)) setResult(status);
      else if (status === 'email') setProblem({ at: 'email', line: 'That email doesn’t look right. Check it and try again.' });
      else if (status === 'name') setProblem({ at: 'name', line: 'Type your name to carry on.' });
      else if (status === 'too_long') setProblem({ at: 'form', line: 'That’s too long to send. Shorten an answer and try again.' });
      else setProblem({ at: 'form', line: 'Registration has closed.' });
    } catch {
      setProblem({ at: 'form', line: navigator.onLine === false ? NO_CONNECTION : 'That didn’t go through. Try again in a moment.' });
    } finally { busy.current = false; }
  };
  const at = (k) => (problem?.at === k ? <p className="cc-problem" role="alert">{problem.line}</p> : null);
  const taken = Math.min(Number(page.taken) || 0, page.capacity);
  return (
    <Frame>
      <PageOpening label={meta.filter(Boolean).join(', ')} title={page.title} />
      <p className="cc-quiet">{taken >= page.capacity ? 'Every place is taken. Register to join the waiting list.' : `${taken} of ${page.capacity} places are taken.`}</p>
      <form onSubmit={register} noValidate>
        <div className="cc-field"><TextField label="Your name" value={name} autoComplete="name" maxLength={120} onChange={(e) => { setName(e.target.value); setProblem(null); }} />{at('name')}</div>
        <div className="cc-field"><TextField label="Your email" type="email" value={email} autoComplete="email" onChange={(e) => { setEmail(e.target.value); setProblem(null); }} />{at('email')}</div>
        {questions.map((x) => (
          <div key={x.id} className="cc-field">
            {x.kind === 'long'
              ? <TextBox label={x.q} value={answers[x.id] || ''} maxLength={2000} onChange={(v) => { setAnswers({ ...answers, [x.id]: v }); setProblem(null); }} />
              : <TextField label={x.q} value={answers[x.id] || ''} maxLength={300} onChange={(e) => { setAnswers({ ...answers, [x.id]: e.target.value }); setProblem(null); }} />}
            {at(x.id)}
          </div>
        ))}
        {at('form')}
        <div className="cc-acts"><Button variant="primary" type="submit">Register</Button></div>
      </form>
    </Frame>
  );
}

const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));
const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export function WorkshopSurvey() {
  const { key } = useParams();
  const [survey, setSurvey] = useState(undefined);
  const [answers, setAnswers] = useState({});
  const [problem, setProblem] = useState(null);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let live = true;
    loadWorkshopSurvey(key).then((s) => { if (live) setSurvey(s || null); }).catch(() => { if (live) setSurvey(null); });
    return () => { live = false; };
  }, [key]);
  if (survey === undefined) return <Frame message><div role="status" aria-label="Loading" /></Frame>;
  if (!survey) return <Frame message><PageOpening title="Survey" /><p className="cc-quiet">{NOT_OPEN}</p></Frame>;
  if (sent || survey.done) return <Frame message><PageOpening title={survey.title} /><p className="cc-quiet" role="status">Thank you. Your answers are in.</p></Frame>;
  const questions = Array.isArray(survey.questions) ? survey.questions : [];
  const send = async (e) => {
    e.preventDefault();
    if (busy.current) return;
    if (!Object.values(answers).some((v) => clean(v))) { setProblem('Answer at least one question to carry on.'); return; }
    busy.current = true;
    try {
      const status = await answerWorkshopSurvey(key, Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, String(v).slice(0, 2000)])));
      if (status === 'saved' || status === 'already') setSent(true);
      else setProblem('That didn’t go through. Try again in a moment.');
    } catch {
      setProblem(navigator.onLine === false ? NO_CONNECTION : 'That didn’t go through. Try again in a moment.');
    } finally { busy.current = false; }
  };
  return (
    <Frame>
      <PageOpening label="~1 minute" title={survey.title} />
      <form onSubmit={send} noValidate>
        {questions.map((x) => (
          <div key={x.id} className="cc-field">
            {x.kind === 'rating' && <InlineChoice label={`${x.q} 1 is not at all, 5 is very.`} options={RATINGS} value={answers[x.id] || null} onChange={(v) => { setAnswers({ ...answers, [x.id]: v }); setProblem(null); }} form="pills" />}
            {x.kind === 'yesno' && <InlineChoice label={x.q} options={YES_NO} value={answers[x.id] || null} onChange={(v) => { setAnswers({ ...answers, [x.id]: v }); setProblem(null); }} form="pills" />}
            {x.kind !== 'rating' && x.kind !== 'yesno' && <TextBox label={x.q} value={answers[x.id] || ''} maxLength={2000} onChange={(v) => { setAnswers({ ...answers, [x.id]: v }); setProblem(null); }} />}
          </div>
        ))}
        {problem && <p className="cc-problem" role="alert">{problem}</p>}
        <div className="cc-acts"><Button variant="primary" type="submit">Send my answers</Button></div>
      </form>
    </Frame>
  );
}
