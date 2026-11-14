import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { LoadError, Loading, PageHeader, PdfDownload, clearGuideDraft, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { readCache, writeCache } from '../../lib/pageCache';
import { clearDraft, readDraft, useDraft } from '../../lib/drafts';
import { newId } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { deviceToolAnswer, loadToolAnswer, loadToolAnswers, saveToolAnswers } from '../../lib/toolAnswers';
import {
  TOOL,
  TOOL_NAME,
  checkFrom,
  checkTitle,
  emptyCheck,
  hasAnswers,
  isComplete,
  newestFinished,
  savedAnswers,
} from '../../lib/teamCheck/model';
import TeamCheckTool from './TeamCheckTool';
import '../performance/performance.css';

// Team performance check, signed in (mock-up M10, version 5.6): the guided
// tool at /team-performance-check.
//
// Where the answers are kept:
// - on the device as a draft while the tool is open (drafts.js: "Draft
//   restored"), with the step it was left on (GuidedTool);
// - as one saved item (src/lib/toolAnswers.js: `tool_answers`, migration
//   043, through the offline queue; on the device until 043 has run): a
//   draft when the tool is closed part-way ("Saved", and it shows in My
//   Plans as a draft), and completed once every question is answered and
//   the results show. The item's id is made on the device, so every save
//   writes the same row.
//
// A new check starts from the people of the last finished one, with
// nothing answered, and keeps that check's answers as "your last check",
// for the chart's dashed rings and "At your last check, in October".
//
// A saved check opens with its id in the page's state (My Plans) or as
// ?id=…; with neither, the tool carries on the unfinished one on this
// device, or starts a new one.

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const LOAD_ERROR = 'Your check didn’t load. Check your connection and try again.';
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const draftName = (asked) => `team-check:${asked || 'new'}`;
export const stepDraftKey = (userId, asked) => `team-check-${userId}-${asked || 'new'}`;

function fromRecord(r) {
  return {
    id: r.id,
    check: checkFrom(r.answers, r.shared),
    status: r.status === 'completed' ? 'completed' : 'draft',
    saved: true,
    createdAt: r.createdAt || null,
    finishedAt: r.finishedAt || null,
  };
}

async function loadFirstName(userId) {
  const { data, error } = await supabase.from('profiles').select('first_name').eq('id', userId).limit(1);
  if (error) throw error;
  return (data?.[0]?.first_name || '').trim();
}

export default function TeamCheck() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const fromState = location.state?.checkId;
  const fromQuery = new URLSearchParams(location.search).get('id');
  const asked = isId(fromState) ? fromState : isId(fromQuery) ? fromQuery : null;
  const [state, setState] = useState(() => {
    // A saved check this device holds opens at once; so does an unfinished new one.
    const here = userId && asked ? deviceToolAnswer(userId, asked) : null;
    if (here) return { item: fromRecord(here), error: null };
    if (userId && !asked && readDraft(userId, draftName(null))?.v?.check) {
      return { item: { id: newId(), check: emptyCheck(), status: 'new', saved: false, createdAt: null, finishedAt: null }, error: null };
    }
    return { item: null, error: null };
  });

  useEffect(() => {
    if (!userId || state.item) return undefined;
    let live = true;
    if (asked) {
      loadToolAnswer(userId, TOOL, asked).then((r) => {
        if (!live) return;
        setState(r ? { item: fromRecord(r), error: null } : { item: null, error: new Error('missing') });
      });
    } else {
      // A new check: the same people as the last finished one, nothing answered.
      loadToolAnswers(userId, TOOL).then((records) => {
        if (!live) return;
        setState({ item: { id: newId(), check: emptyCheck(newestFinished(records)), status: 'new', saved: false, createdAt: null, finishedAt: null }, error: null });
      });
    }
    return () => { live = false; };
    // Only when the person or the check asked for changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, asked]);

  if (state.error) {
    return (
      <Shell>
        <LoadError>{LOAD_ERROR}</LoadError>
      </Shell>
    );
  }
  if (!userId || !state.item) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your check" className="ds-loading--page" /></div>;
  }
  return <Flow key={`${userId}:${asked || 'new'}`} userId={userId} user={user} asked={asked} start={state.item} />;
}

// A plain page (not the full-screen tool), for when a saved check can't be shown.
function Shell({ children }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-plans')} label="My Plans" /></div>
        <PageHeader title={TOOL_NAME} />
        {children}
      </div>
    </div>
  );
}

function Flow({ userId, user, asked, start }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState(start);
  const itemRef = useRef(item);
  itemRef.current = item;
  const [name, setName] = useState(() => readCache(userId, 'first-name')?.v || (user?.user_metadata?.first_name || '').trim());
  const busy = useRef(false); // one save per press
  const lastSaved = useRef(start.saved ? JSON.stringify([start.status, savedAnswers(start.check), start.check.shared]) : '');

  useEffect(() => {
    let live = true;
    loadFirstName(userId).then((first) => {
      if (!live || !first) return;
      writeCache(userId, 'first-name', first);
      setName(first);
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // The check is kept on the device while the tool is open and put back
  // after a refresh ("Draft restored"): the same check, with the same id.
  useDraft({
    userId,
    name: draftName(asked),
    value: item,
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object' || !d.check || !isId(d.id)) return;
      if (asked && d.id !== asked) return;
      setItem({ ...start, ...d, check: { ...emptyCheck(), ...d.check } });
    },
  });

  // The tool's screens depend on who is on the list, so it opens only once
  // a check kept on the device has been put back: the step it was left on
  // (the tenth question, the results) is then still there to open on.
  const [opened, setOpened] = useState(false);
  useEffect(() => { setOpened(true); }, []);

  const onCheck = useCallback((fn) => setItem((s) => ({ ...s, check: fn(s.check) })), []);

  const forget = () => {
    clearDraft(userId, draftName(asked));
    clearGuideDraft(stepDraftKey(userId, asked));
  };

  // One saved item, written over itself: a draft until every answer is in.
  const save = async (now, status) => {
    const createdAt = now.createdAt || new Date().toISOString();
    const finishedAt = status === 'completed' ? (now.finishedAt || new Date().toISOString()) : null;
    const result = await saveToolAnswers(userId, {
      id: now.id,
      tool: TOOL,
      title: checkTitle(createdAt),
      status,
      answers: savedAnswers(now.check),
      shared: Boolean(now.check.shared),
      createdAt,
      finishedAt,
    });
    lastSaved.current = JSON.stringify([status, savedAnswers(now.check), now.check.shared]);
    setItem((s) => ({ ...s, status, saved: true, createdAt, finishedAt }));
    return result;
  };
  const statusOf = (now) => (isComplete(now.check) ? 'completed' : 'draft');
  const unchanged = (now, status) => lastSaved.current === JSON.stringify([status, savedAnswers(now.check), now.check.shared]);

  // Back to where they came from: My Plans for a saved check, otherwise the hub.
  const leave = () => navigate(asked ? '/my-plans' : '/interpersonal', { replace: true });

  const close = async () => {
    if (busy.current) return;
    const now = itemRef.current;
    // Nobody on the list and nothing saved: there is nothing to keep.
    if (!hasAnswers(now.check) && !now.saved) {
      forget();
      leave();
      return;
    }
    busy.current = true;
    try {
      const status = statusOf(now);
      const result = unchanged(now, status) ? 'saved' : await save(now, status);
      // A finished check, or one opened from My Plans, is in the list: the
      // next visit starts a new one. An unfinished new one keeps its place
      // on this device, so the tool carries on from here.
      if (asked || status === 'completed') forget();
      toast.show(result === 'queued' ? 'Will sync' : 'Saved');
      leave();
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  // Every answer is in and the results are showing: the check is saved as
  // finished, quietly, so nothing depends on how the tool is left.
  const onResults = async () => {
    const now = itemRef.current;
    if (!isComplete(now.check) || unchanged(now, 'completed')) return;
    try {
      await save(now, 'completed');
    } catch {
      // Still on the device as a draft; closing saves it and says so.
    }
  };

  // The eye's choice saves at once (WhoSees then says "Saved").
  const share = async (shared) => {
    const now = { ...itemRef.current, check: { ...itemRef.current.check, shared } };
    setItem((s) => ({ ...s, check: { ...s.check, shared } }));
    if (now.saved || hasAnswers(now.check)) await save(now, statusOf(now));
  };

  if (!opened) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your check" className="ds-loading--page" /></div>;
  }
  return (
    <div className="ui-root plan-builder-wait">
      <TeamCheckTool
        check={item.check}
        onCheck={onCheck}
        onShare={share}
        sourceId={item.id}
        pdf={(
          <PdfDownload
            variant="text"
            label="Download my PDF"
            getDocument={async () => {
              const { teamCheckPdf } = await import('../../lib/pdf/docs/teamCheck');
              const now = itemRef.current;
              return teamCheckPdf({ check: now.check, person: name, createdAt: now.finishedAt || now.createdAt });
            }}
          />
        )}
        onResults={onResults}
        draftKey={stepDraftKey(userId, asked)}
        initialStep={asked && start.status === 'completed' ? 'results' : undefined}
        onClose={close}
      />
    </div>
  );
}
