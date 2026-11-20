import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SlidePanel, Stat, StatGroup } from '../../components/design';
import { rowsOf } from '../../lib/coach/store';
import { firstName, possessive } from '../../lib/coach/model';
import { averageSince, comingUp, fromLastTime, isLink, lastSession, lengthPlace, prepLine, sharedReview, whenWords } from '../../lib/coach/day';
import { useBriefData } from '../../lib/coach/dayData';
import { saveAction } from '../../lib/coach/sessionActions';
import { reviewRows } from '../../lib/peakMoments/model';
import { Eye, Part, TextLink, useCoachPortal } from './parts';
import { useSay } from './sessionParts';
import './sessions.css';

// The brief before a call (Phase 6a run 2, step 4; M11's brief): the side
// panel, full screen on a phone. Top to bottom: the client's name, when and
// how long, the coach's pinned notes, then For this call (the client's own
// For next time), From last time (the actions that went with the last
// recap, each Done or Not yet, switched with a tap), Since last time (the
// average performance score), the debrief after a big moment when it is
// shared, Coming up (shared work peak moments in the next 14 days) and the
// coach's own note from last time. What the client shares is read as the
// brief opens and never kept; a part with nothing to show is left out.
// M11's "Sam emailed" line is email logging (run 4).

const PIN = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.5l5 5-2.2.7-2.6 2.6.3 3.2-1 1L5.5 10.5 1.5 14.5M5.5 10.5L2 7l1-1 3.2.3 2.6-2.6z" /></svg>;

function BriefBody({ session, client }) {
  const { userId, coach, state, sessions, sessionActions, sessionNotes, todayKey } = useCoachPortal();
  const say = useSay();
  const first = firstName(client.name);
  const shared = useBriefData(client.user_id || null, todayKey);
  const last = lastSession(sessions, (s) => s.profile_id === client.id, session.starts_at);
  const pinned = rowsOf(state, 'client_notes').filter((n) => n.profile_id === client.id && n.coach_id === coach.id && n.pinned)
    .sort((a, b) => String(b.noted_on).localeCompare(String(a.noted_on))).slice(0, 3).reverse() // the newest three, oldest first (M11);
  const before = fromLastTime(sessionActions, last);
  const average = averageSince(shared.scores, last?.starts_at, todayKey);
  const review = sharedReview(shared.reviews, shared.moments, last?.starts_at, todayKey, client.name);
  const reviewLines = review ? reviewRows(review.moment.kind, review.review, []).rows.filter((r) => r.lines[0].text !== 'Skipped') : [];
  const coming = comingUp(shared.coming, todayKey);
  const note = last ? (sessionNotes.find((n) => n.session_id === last.id)?.next_time || '').trim() : '';

  const flip = (row) => {
    const next = { ...row.action, done_at: row.done ? null : new Date().toISOString() };
    say(() => saveAction(userId, next), 'Saved', () => saveAction(userId, row.action).catch(() => {}));
  };

  return (
    <>
      <p className="cc-brief-meta"><span>{whenWords(session.starts_at, todayKey)}</span><span>{lengthPlace(session)}</span></p>
      {pinned.length > 0 && (
        <div className="cc-pins cc-brief-pins" aria-label="Pinned notes, only you can see these">
          {pinned.map((n) => <p key={n.id}>{PIN}<span>{n.body}</span></p>)}
        </div>
      )}

      {shared.prep && (
        <Part title="For this call">
          <div className="cc-soft cc-brief-soft">
            <span className="cc-soft-label">{prepLine(client.name, shared.prep.noted_at, todayKey)}</span>
            <p>{shared.prep.body}</p>
          </div>
        </Part>
      )}

      {before.length > 0 && (
        <Part title="From last time">
          <div className="cc-brief-rows" role="list" aria-label="From last time">
            {before.map((row) => (
              <div key={row.action.id} role="listitem">
                <button type="button" className="cc-brief-row" aria-pressed={row.done} aria-label={`${row.action.title}, ${row.state.toLowerCase()}. Mark as ${row.done ? 'not yet done' : 'done'}`} onClick={() => flip(row)}>
                  <b>{row.action.title}</b>
                  <span className={`cc-line-state${row.done ? ' cc-line-state--good' : ''}`}>{row.state}</span>
                </button>
              </div>
            ))}
          </div>
        </Part>
      )}

      <Part title="Since last time">
        {average.value
          ? <StatGroup className="cc-stats cc-brief-stat"><Stat label={average.label} value={average.value} bar={parseInt(average.value, 10) / 100} barBand={parseInt(average.value, 10) < 85 ? 'below' : undefined} /></StatGroup>
          : <p className="cc-quiet">{average.none}</p>}
        {review && (
          <div className="cc-soft cc-brief-soft">
            <span className="cc-soft-label">{review.line}</span>
            <dl className="cc-brief-dl">
              {reviewLines.map((r) => <div key={r.key}><dt>{r.label}</dt><dd>{r.lines[0].text}</dd></div>)}
            </dl>
          </div>
        )}
      </Part>

      {coming.length > 0 && (
        <Part title="Coming up">
          {coming.map((c) => <p key={c.key} className="cc-brief-coming">{c.words}</p>)}
        </Part>
      )}

      {note && (
        <Part title="Your note from last time" aside={<Eye sentence="Only you can see this." />}>
          <div className="cc-soft cc-brief-soft"><p>{note}</p></div>
        </Part>
      )}
    </>
  );
}

/**
 * The brief for one session. Today mounts it on the first click of a call
 * and keeps it mounted: a null `sessionId` is closed.
 * @param {{ sessionId: string|null, onClose: () => void }} props
 */
export function BriefPanel({ sessionId, onClose }) {
  const { sessions, clients } = useCoachPortal();
  const navigate = useNavigate();
  const live = sessionId ? sessions.find((s) => s.id === sessionId) || null : null;
  // What it showed stays while the panel slides away.
  const [session, setSession] = useState(live);
  useEffect(() => { if (live) setSession(live); }, [live]);
  // Gone while open (deleted in another tab): the panel closes.
  // (onClose is the opener's own; only the session going decides this.)
  useEffect(() => { if (sessionId && !live) onClose(); }, [sessionId, live]);
  const client = session ? clients.find((c) => c.id === session.profile_id) || null : null;
  if (!session || !client) return <SlidePanel open={false} onClose={onClose} title="Brief" />;
  const first = firstName(client.name);
  return (
    <SlidePanel
      open={Boolean(live)}
      onClose={onClose}
      title={client.name}
      className="cc-brief"
      footer={(
        <div className="cc-panel-foot cc-brief-foot">
          <TextLink onClick={() => { onClose(); navigate(`/coach/clients/${client.id}`); }}>Open {possessive(first)} page</TextLink>
          {isLink(session.place) && <a className="ds-btn ds-btn--outline ds-panel-go" href={session.place.trim()} target="_blank" rel="noreferrer">Join on Zoom</a>}
        </div>
      )}
    >
      <BriefBody key={session.id} session={session} client={client} />
    </SlidePanel>
  );
}

export default BriefPanel;
