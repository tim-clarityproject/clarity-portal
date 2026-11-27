import { lazy, Suspense, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { idFromAddress } from '../../lib/coach/address';
import { BottomBar, Button, Dropdown, PageHeader, useToast } from '../../components/design';
import { rowsOf, saveRow, saveRows } from '../../lib/coach/store';
import { dayWords, firstName, possessive, toDayKey } from '../../lib/coach/model';
import { askedWords, closeGoals, closeLine, closeRows, closeScores, engagementToSave, KEEPS, nextSession, pastWords } from '../../lib/coach/day';
import { useReviews } from '../../lib/coach/dayData';
import { Back, Line, Part, TextLink, TICK, useCoachPortal } from './parts';
import { currentEngagement } from './clientData';
import { useSay } from './sessionParts';
import { useCoachingEnded } from './crmParts';
import './sessions.css';

// The guided close (Phase 6a run 2, step 5; M11's "The guided close"): the
// outcomes the client shares, what to do together before the end, which
// portal level they keep, and Move to Past clients, the page's one coral
// button. Nothing here sends: M11's "Send the request" for a testimonial
// and for case-study results arrives with Phases 6b and 6c, so each is a
// row the coach ticks once they have asked.

const BriefPanel = lazy(() => import('./Brief'));
const ASKS = [
  { key: 'testimonial', title: 'Testimonial', line: (first) => `${first} chooses how it’s credited.` },
  { key: 'case_study', title: 'Results for case studies', line: (first) => `${first} chooses whether you may use them, with no name.` },
];

export default function ClosePage() {
  const id = idFromAddress(useParams().id); // any case in the address (tidy follow-up 4)
  const navigate = useNavigate();
  const toast = useToast();
  const say = useSay();
  const { userId, state, clients, sessions, sessionPeople, sessionsOlder, todayKey, now } = useCoachPortal();
  const profile = clients.find((p) => p.id === id) || null;
  const reviews = useReviews(profile?.user_id || null);
  const [brief, setBrief] = useState(null);
  const [briefAsked, setBriefAsked] = useState(false);
  const busy = useRef(false);
  const ended = useCoachingEnded();

  if (!profile) {
    return (
      <div className="cc-page"><div className="cc-col">
        <Back onClick={() => navigate('/coach/clients')} />
        <PageHeader title="Close the engagement" />
        <p className="cc-quiet">This client isn’t in your list any more.</p>
      </div></div>
    );
  }

  const first = firstName(profile.name);
  const engagement = currentEngagement(rowsOf(state, 'engagements'), { profileId: profile.id });
  const past = profile.status === 'past';
  const scores = closeScores(reviews);
  const goals = closeGoals(reviews);
  const final = nextSession(sessions, (s) => s.profile_id === profile.id, now);
  const close = profile.getting_started?.close && typeof profile.getting_started.close === 'object' ? profile.getting_started.close : {};
  const saveClose = (patch, message = 'Saved') => say(
    () => saveRow(userId, 'client_profiles', { ...profile, getting_started: { ...(profile.getting_started || {}), close: { ...close, ...patch } } }),
    message, () => saveRow(userId, 'client_profiles', profile).catch(() => {}),
  );

  const moveToPast = async () => {
    if (busy.current) return; // one request a press
    busy.current = true;
    try {
      // The engagement is saved with its count as it stands now, so ending it (or Undo) never moves the count.
      const kept = engagementToSave(engagement, sessions, sessionPeople, sessionsOlder);
      const rows = closeRows(profile, kept, todayKey);
      const pairs = [['client_profiles', rows.profile], ...(rows.engagement ? [['engagements', rows.engagement]] : [])];
      const before = [['client_profiles', profile], ...(kept ? [['engagements', kept]] : [])];
      const status = await saveRows(userId, pairs);
      // Coaching has ended (run 4): check-ins are suggested at 3, 6 and 12 months, and "when coaching ends" automations add
      // their to-dos. Nothing is sent; Undo takes all of it back.
      const after = await ended(rows.profile).catch(() => null);
      toast.saved({ message: status === 'queued' ? 'Will sync' : pastWords(profile.name), long: true, onUndo: async () => { if (after) await after.undo().catch(() => {}); await saveRows(userId, before).catch(() => {}); } });
      navigate('/coach/clients');
    } catch (error) {
      toast.error(error?.message && !/fetch|network/i.test(error.message) ? error.message : undefined);
    } finally { busy.current = false; }
  };

  return (
    <div className={`cc-page cc-ses${past ? '' : ' cc-ses-page--bar'}`}>
      <div className="cc-col">
        <Back to={profile.name} onClick={() => navigate(`/coach/clients/${profile.id}`)} />
        <PageHeader title="Close the engagement" meta={[profile.name, closeLine(engagement, todayKey)]} />
        {past && <p className="cc-quiet">{first} is already in Past clients.</p>}

        <Part title="Outcomes">
          {scores.length === 0 && (
            <p className="cc-quiet">{profile.user_id ? `${possessive(first)} scores show here once ${first} has finished a monthly review and shares it.` : `${first} has no portal account yet, so there are no scores to show.`}</p>
          )}
          {scores.map((s) => (
            <div key={s.key} className="cc-close-score">
              <span><b>{s.label}</b><small>{s.startWords}</small></span>
              <span className="cc-close-bars" aria-hidden="true">
                {s.start != null && <span className="cc-close-bar"><i style={{ width: `${Math.max(0, Math.min(100, s.start))}%` }} /></span>}
                <span className="cc-close-bar cc-close-bar--now"><i style={{ width: `${Math.max(0, Math.min(100, s.now))}%` }} /></span>
              </span>
              <span className="cc-close-now"><span className="ds-sr">Now </span>{s.now}</span>
            </div>
          ))}
        </Part>

        {goals.length > 0 && (
          <Part title="First check-in goals">
            <p className="cc-quiet cc-close-goalsline">What {first} most wanted from coaching, in their own words.</p>
            {goals.map((g) => <div key={g} className="cc-line cc-close-goal"><span><b>{g}</b></span></div>)}
          </Part>
        )}

        <Part title="To do together">
          <Line title="Final review" small={final ? `In the last session, on ${dayWords(toDayKey(new Date(final.starts_at)), todayKey)}.` : 'No session is booked.'}>
            {final && <TextLink onClick={() => { setBriefAsked(true); setBrief(final.id); }}>Open the brief</TextLink>}
          </Line>
          {ASKS.map((a) => {
            const on = close[`${a.key}_asked_on`] || null;
            return (
              <div key={a.key} className="cc-line cc-close-ask">
                <span className="cc-close-ask-words">
                  <button type="button" role="checkbox" className="ds-check-box" aria-checked={Boolean(on)} aria-label={`${a.title}: I’ve asked ${first}`} onClick={() => saveClose({ [`${a.key}_asked_on`]: on ? null : todayKey }, on ? 'Saved' : 'Ticked as asked')}><span>{TICK}</span></button>
                  <span><b>{a.title}</b><small>{a.line(first)}</small></span>
                </span>
                <span className={`cc-line-state${on ? ' cc-line-state--good' : ''}`}>{on ? askedWords(on, todayKey) : 'Not asked yet'}</span>
              </div>
            );
          })}
          <div className="cc-field cc-close-keep">
            <Dropdown label={`Which portal level does ${first} keep?`} options={KEEPS} value={KEEPS.some((k) => k.value === close.keeps) ? close.keeps : 'individual'} onChange={(v) => saveClose({ keeps: v })} />
          </div>
        </Part>
      </div>

      {!past && <BottomBar className="cc-ses-bar"><Button variant="primary" onClick={moveToPast}>Move to Past clients</Button></BottomBar>}
      {briefAsked && <Suspense fallback={null}><BriefPanel sessionId={brief} onClose={() => setBrief(null)} /></Suspense>}
    </div>
  );
}
