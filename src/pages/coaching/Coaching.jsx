import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { Button, Card, Checkbox, Chevron, Empty, LoadError, Row, Rows, TextBox, ToolTodoPanel, useCoach, useToast, PageOpening } from '../../components/design';
import { savePdf, PDF_ERROR } from '../../components/design/pdfSave';
import { useCachedLoad } from '../../lib/pageCache';
import { useDraft } from '../../lib/drafts';
import { formatClockTime, formatSavedDate, getLocalDateKey, parseDbTimestamp } from '../../lib/dateFormatter';
import { dayKeyWords } from '../../lib/time/index.js';
import {
  EMPTY_LINE, NO_COACH_NAME, PREP_MAX,
  acceptInvite, acceptWords, addCoachingNotNow, addWords, agreeCover, answerView, coachAsks, coachingEmpty, loadCoaching,
  markAction, markCoachingSeen, noteCoachingPlaced, placedLine, readCoachingNotNow, readCoachingPlaced, savePrep, tidyCoaching, withAction,
} from '../../lib/coaching';
import '../performance/performance.css';
import {
  SIGNED_PDF, billingLine, readyLine, readyToSign, rowDay, showsBilling, signedVersions, versionTitle,
} from '../../lib/coaching/agreements';
import { isOffline, needsConnection } from '../../lib/friendlyError';
import CoachingSessions from './CoachingSessions';
import MySignature from './MySignature';
import { agreementDocument, useAgreements } from './agreementData';
import './coaching.css';
import { B1_LINES } from '../../content/pageLines/client';
import '../../pages/hubs/clientPage.css';

// Coaching (Phase 6a run 2): the client's side of working with a coach, on
// one calm page built from the shared parts. No mock-up draws it. Each
// section shows only when it has something:
//   From your coach   an invite to accept, a View as client request, cover
//                     while their coach is away: one calm card each, with
//                     what happens in one sentence
//   For next time     the client's own note for their next session, which
//                     their coach reads in the brief as "For this call"
//   Your sessions     the sessions still to come, each to move or cancel,
//                     and Book a session from their coach's free times
//                     (run 3; CoachingSessions.jsx), for someone with a
//                     coach
//   Session recaps    the recaps their coach has sent, newest first, each
//                     with its actions: a tick for done, and "Add to this
//                     week" or "Add to my backlog" through the one shared
//                     add panel
//   Agreement     (Phase 6b run 1, M13 A2) the version ready to sign, with
//                 "Sign my agreement", then each signed version as a row
//                 that downloads its signed PDF (light only)
//   More          My signature (M13 A7's side panel), and Billing for a
//                 self-funded client, with the next invoice that's due
// With nothing from a coach nothing links here, and the page says one line.
// Polish 1 (FX3, 26 Nov): built as the other client pages are, the shared PageOpening (Sign my agreement as its one
// main button while a version waits), then each section as a Card with its label, its rows with hairlines.
// It reads and answers only through the database's own checked functions
// (src/lib/coaching.js), and is quiet until migrations 049 and 050 have run.

const SAVE_PROBLEM = 'That didn’t save. Check your connection and try again.';
const closedOnly = (list) => list.filter((v) => v.startsWith('closed|'));
const paragraphs = (recap) => String(recap || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const thisYear = (key, today) => key.slice(0, 4) === today.slice(0, 4);

export default function Coaching() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const navigate = useNavigate();
  const toast = useToast();
  const myCoach = useCoach();
  const [today] = useState(() => getLocalDateKey());
  const [now] = useState(() => new Date());
  const { data: raw, loading, error, reload, setData } = useCachedLoad({ userId, name: 'coaching', load: () => loadCoaching(userId) });
  const data = useMemo(() => tidyCoaching(raw), [raw]);
  const [notNow, setNotNow] = useState(() => readCoachingNotNow(userId));
  const [placed, setPlaced] = useState(() => readCoachingPlaced(userId));
  const asks = useMemo(() => coachAsks(data, { now, today, notNow: closedOnly(notNow) }), [data, now, today, notNow]);
  const busy = useRef(false); // one request per press
  // Agreements and invoices (061), from the device first.
  const { data: deals } = useAgreements(userId);
  const ready = readyToSign(deals.agreements);
  const signedRows = signedVersions(deals.agreements);
  const billing = showsBilling(deals);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const making = useRef(false); // one PDF at a time
  const downloadSigned = async (version) => {
    if (making.current) return;
    making.current = true;
    try {
      await savePdf(() => agreementDocument({ userId, version }), 'light');
    } catch (e) {
      toast.error(isOffline(e) ? needsConnection('This PDF') : PDF_ERROR);
    } finally {
      making.current = false;
    }
  };

  // Opening the page is what makes a recap no longer new on Home.
  const shown = !loading && !error;
  useEffect(() => { if (shown) markCoachingSeen(userId); }, [shown, userId, data.recaps.length]);

  // For next time: what is typed is kept as a draft on the device until it is saved.
  const savedPrep = data.prep?.body || '';
  const [prep, setPrep] = useState(savedPrep);
  const [prepFrom, setPrepFrom] = useState(savedPrep);
  if (savedPrep !== prepFrom) { setPrepFrom(savedPrep); if (prep === prepFrom) setPrep(savedPrep); }
  const draft = useDraft({ userId, name: 'coaching-prep', value: prep, ready: shown, onRestore: (d) => { if (typeof d === 'string') setPrep(d.slice(0, PREP_MAX)); } });

  const [adding, setAdding] = useState(null); // the recap action being added to the to-dos

  const once = async (work) => {
    if (busy.current) return;
    busy.current = true;
    try { await work(); } catch (e) { toast.error(e?.message || SAVE_PROBLEM); } finally { busy.current = false; }
  };

  // ---- From your coach
  const accept = (invite) => once(async () => {
    const answer = await acceptInvite(invite.profile_id);
    if (answer === 'linked') {
      toast.show(acceptWords(answer, invite.coach_first_name));
      setData((d) => ({ ...tidyCoaching(d), invites: tidyCoaching(d).invites.filter((i) => i.profile_id !== invite.profile_id) }));
      reload();
      return;
    }
    // The invite can't be taken with this account: it is said once and closed here.
    setNotNow(addCoachingNotNow(userId, `closed|${invite.profile_id}`));
    toast.show(acceptWords(answer, invite.coach_first_name));
  });
  const notNowInvite = (invite) => {
    addCoachingNotNow(userId, `${today}|${invite.profile_id}`);
    toast.show('We’ll ask again tomorrow.');
    navigate('/welcome');
  };
  const answer = (view, allowed) => once(async () => {
    await answerView(view.request_id, allowed);
    const at = Date.now();
    setData((d) => ({ ...tidyCoaching(d), views: tidyCoaching(d).views.map((v) => (v.request_id === view.request_id ? { ...v, answered_at: new Date(at).toISOString(), allowed, expires_at: allowed ? new Date(at + 30 * 60 * 1000).toISOString() : null } : v)) }));
    toast.show(allowed ? 'Saved' : `${view.coach_first_name || NO_COACH_NAME} won’t view your portal.`);
    reload();
  });
  const agree = (cover) => once(async () => {
    await agreeCover(cover.cover_id);
    setData((d) => ({ ...tidyCoaching(d), covers: tidyCoaching(d).covers.map((c) => (c.cover_id === cover.cover_id ? { ...c, agreed_at: new Date().toISOString() } : c)) }));
    toast.show('Agreed');
  });

  // ---- For next time
  const keepPrep = () => once(async () => {
    const before = data.prep;
    const saved = await savePrep(userId, prep);
    draft.clear();
    setPrep(saved?.body || '');
    setData((d) => ({ ...tidyCoaching(d), prep: saved }));
    if (saved || !before) { toast.show('Saved'); return; }
    toast.saved({
      message: 'Deleted',
      onUndo: async () => {
        try { const back = await savePrep(userId, before.body); setData((d) => ({ ...tidyCoaching(d), prep: back })); } catch (e) { toast.error(e?.message || SAVE_PROBLEM); }
      },
    });
  });

  // ---- Session recaps
  const tick = async (action, done) => {
    setData((d) => withAction(d, action.id, { done }));
    try { await markAction(action.id, { done }); } catch (e) { setData((d) => withAction(d, action.id, { done: !done })); toast.error(e?.message || SAVE_PROBLEM); }
  };
  const added = ({ where }) => {
    const action = adding;
    setAdding(null);
    if (!action || !where || where === 'none') return;
    setPlaced(noteCoachingPlaced(userId, action.id, where));
    setData((d) => withAction(d, action.id, { placed: true }));
    // The to-do is saved either way; the row here remembers it on this device if the note to the coach can't go now.
    markAction(action.id, { placed: true }).catch(() => {});
  };
  const unadded = (action) => () => {
    setPlaced(noteCoachingPlaced(userId, action.id, null));
    setData((d) => withAction(d, action.id, { placed: false }));
    markAction(action.id, { placed: false }).catch(() => {});
  };

  const coachName = myCoach?.firstName || data.recaps[0]?.coach_first_name || null;
  const hasAsks = asks.invites.length + asks.views.length + asks.covers.length > 0;
  // The note is for a coach to read: it shows once the person has one (and the coaching day's tables are there).
  const showPrep = data.day && (Boolean(myCoach) || Boolean(data.prep));
  // Their own sessions: booking, moving and cancelling, for someone with a coach (run 3).
  const showSessions = Boolean(myCoach);
  const hasAgreements = deals.agreements.length > 0 || billing;
  const empty = coachingEmpty(data, { now, today, notNow: closedOnly(notNow) }) && !showPrep && !showSessions && !hasAgreements;
  const day = (key) => dayKeyWords(key, { year: !thisYear(key, today) });

  let body;
  if (loading) body = null;
  else if (error) body = <LoadError>The page didn’t load. Check your connection and try again.</LoadError>;
  else if (empty) body = <Empty className="coaching-empty">{EMPTY_LINE}</Empty>;
  else {
    body = (
      <>
        {hasAsks && (
          <Card label="From your coach" className="coaching-section">
            <div className="coaching-asks">
              {asks.invites.map((i) => {
                const who = i.coach_first_name || NO_COACH_NAME;
                return (
                  <div key={i.profile_id} className="coaching-ask">
                    <p className="coaching-ask-line">{who} has invited you to work together in The Clarity Portal.</p>
                    <p className="coaching-ask-note">Accepting makes {i.coach_first_name || 'them'} your coach here, and they see only what you share.</p>
                    <div className="coaching-ask-acts">
                      <Button variant="outline" aria-label={`Accept the invite from ${who}`} onClick={() => accept(i)}>Accept</Button>
                      <Button variant="text" onClick={() => notNowInvite(i)}>Not now</Button>
                    </div>
                  </div>
                );
              })}
              {asks.views.map((v) => {
                const who = v.coach_first_name || NO_COACH_NAME;
                return v.state === 'yes' ? (
                  <div key={v.request_id} className="coaching-ask" role="status">
                    <p className="coaching-ask-line">{who} can view your portal until {formatClockTime(v.expires_at)}.</p>
                    <p className="coaching-ask-note">They see it as you do, and nothing can be changed.</p>
                  </div>
                ) : (
                  <div key={v.request_id} className="coaching-ask">
                    <p className="coaching-ask-line">{who} would like to view your portal for 30 minutes.</p>
                    <p className="coaching-ask-note">They’ll see it as you do, and nothing can be changed.</p>
                    <div className="coaching-ask-acts">
                      <Button variant="outline" onClick={() => answer(v, true)}>Yes, for 30 minutes</Button>
                      <Button variant="text" aria-label={`No, ${who} can’t view my portal`} onClick={() => answer(v, false)}>No</Button>
                    </div>
                  </div>
                );
              })}
              {asks.covers.map((c) => {
                const who = c.coach_first_name || NO_COACH_NAME;
                const cover = c.cover_first_name || 'another coach';
                return (
                  <div key={c.cover_id} className="coaching-ask">
                    <p className="coaching-ask-line">While {who === NO_COACH_NAME ? 'your coach' : who} is away from {day(c.starts_on)} to {day(c.ends_on)}, {cover} will cover.</p>
                    <p className="coaching-ask-note">{c.cover_first_name || 'They'} {c.cover_first_name ? 'sees' : 'see'} only what you share.</p>
                    <div className="coaching-ask-acts">
                      {c.agreed
                        ? <span className="coaching-agreed" role="status">Agreed</span>
                        : <Button variant="outline" aria-label={`I agree to ${cover} covering`} onClick={() => agree(c)}>I agree</Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {(ready || signedRows.length > 0) && (
          <Card label="Agreement" className="coaching-section agree-section">
            {ready && (
              <div className="agree-ready">
                <p className="coaching-ask-line agree-ready-line">{readyLine(ready.version)}</p>
              </div>
            )}
            {signedRows.length > 0 && (
              <Rows label="Signed agreements" className="agree-rows">
                {signedRows.map((v) => (
                  <Row
                    key={v.id}
                    name={versionTitle(v.version)}
                    sub={SIGNED_PDF}
                    value={rowDay(v.signedAt, today)}
                    strong
                    onClick={() => downloadSigned(v)}
                  />
                ))}
              </Rows>
            )}
          </Card>
        )}

        {showPrep && (
          <Card label="For next time" className="coaching-section">
            <form noValidate onSubmit={(e) => { e.preventDefault(); keepPrep(); }}>
              <TextBox label="What do you want to talk about next time?" who="coach" coachName={coachName || undefined} value={prep} onChange={setPrep} maxLength={PREP_MAX} focusMode />
              <p className="coaching-note">{coachName || NO_COACH_NAME} sees this before your next session.</p>
              <div className="coaching-acts"><Button variant="outline" type="submit">Save</Button></div>
            </form>
          </Card>
        )}

        {showSessions && <CoachingSessions coachName={coachName} ready={data.day} />}

        {data.recaps.length > 0 && (
          <Card label="Session recaps" className="coaching-section">
            <div className="coaching-recaps">
              {data.recaps.map((r) => (
                <article key={r.session_id} className="coaching-recap">
                  <h3 className="coaching-recap-date">{formatSavedDate(parseDbTimestamp(r.starts_at), today)}</h3>
                  <p className="coaching-recap-meta">{r.group_name ? `${r.group_name}, with ${r.coach_first_name || 'your coach'}` : `With ${r.coach_first_name || 'your coach'}`}</p>
                  {paragraphs(r.recap).map((p, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <p key={i} className="coaching-recap-text">{p}</p>
                  ))}
                  {r.actions.length > 0 && (
                    <ul className="coaching-actions" aria-label="Actions">
                      {r.actions.map((a) => {
                        const isPlaced = a.placed || Boolean(placed[a.id]);
                        return (
                          <li key={a.id} className="coaching-action">
                            <Checkbox checked={a.done} onChange={(on) => tick(a, on)}>{a.title}</Checkbox>
                            <div className="coaching-action-meta">
                              {isPlaced
                                ? <span className="coaching-action-line">{placedLine(placed[a.id])}</span>
                                : !a.done && <Button variant="outline" aria-label={`${addWords(a)}: ${a.title}`} onClick={() => setAdding(a)}>{addWords(a)}</Button>}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </Card>
        )}

        {hasAgreements && (
          <Card label="More" className="coaching-section agree-more">
            <Rows label="More">
              <Row name="My signature" value={<Chevron direction="right" size="sm" />} onClick={() => setSignatureOpen(true)} strong />
              {billing && (
                <Row name="Billing" sub={billingLine(deals.invoices, today) || undefined} value={<Chevron direction="right" size="sm" />} onClick={() => navigate('/coaching/billing')} strong />
              )}
            </Rows>
          </Card>
        )}
      </>
    );
  }

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page cp-page ipp-page coaching-page">
        <PageOpening
          title="My coaching"
          line={B1_LINES.coaching}
          action={!loading && !error && ready ? <Button variant="primary" onClick={() => navigate(`/coaching/agreement/${ready.id}`)}>Sign my agreement</Button> : null}
        />
        {body}
      </div>
      <MySignature open={signatureOpen} onClose={() => setSignatureOpen(false)} userId={userId} />
      <ToolTodoPanel
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        startText={adding?.title || ''}
        startWhere={adding?.goes_to === 'backlog' ? 'backlog' : 'week'}
        source="other_tool"
        sourceId={adding?.id || null}
        onDone={added}
        onUndone={adding ? unadded(adding) : undefined}
      />
    </div>
  );
}
