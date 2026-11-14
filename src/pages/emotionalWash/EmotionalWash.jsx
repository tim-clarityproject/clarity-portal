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
import { setTodoDeleted } from '../../lib/performance/api';
import { deviceToolAnswer, loadToolAnswer, saveToolAnswers } from '../../lib/toolAnswers';
import {
  TOOL,
  TOOL_NAME,
  emptyWash,
  hasAnswers,
  isComplete,
  resumeStep,
  savedAnswers,
  strayTodos,
  washFrom,
  washTitle,
  withTodo,
} from '../../lib/emotionalWash/model';
import EmotionalWashTool from './EmotionalWashTool';
import '../performance/performance.css';

// Emotional wash, signed in (mock-up M10, version 5.6): the guided tool at
// /emotional-wash.
//
// Where the answers are kept:
// - on the device as a draft while the tool is open (drafts.js: "Draft
//   restored"), with the step it was left on (GuidedTool);
// - as one saved item (src/lib/toolAnswers.js: `tool_answers`, migration
//   043, through the offline queue; on the device until 043 has run): a
//   draft when the tool is closed part-way ("Saved", and it shows in My
//   Plans as a draft), and completed with "Finish my wash". The item's id
//   is made on the device, so every save writes the same row.
//
// A wash is private, like the Journal: it is never shared with a coach
// (043 refuses it), and its name in the lists is never what was typed.
// Once finished, its trashed thoughts are let go for good.
//
// A saved wash opens with its id in the page's state (My Plans) or as
// ?id=…; with neither, the tool carries on the unfinished one on this
// device, or starts a new one.

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const LOAD_ERROR = 'Your wash didn’t load. Check your connection and try again.';
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const draftName = (asked) => `emotional-wash:${asked || 'new'}`;
export const stepDraftKey = (userId, asked) => `emotional-wash-${userId}-${asked || 'new'}`;

const fresh = () => ({ id: newId(), wash: emptyWash(newId), status: 'new', saved: false, createdAt: null, finishedAt: null });

function fromRecord(r) {
  return {
    id: r.id,
    wash: washFrom(r.answers, newId),
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

export default function EmotionalWash() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const fromState = location.state?.checkId;
  const fromQuery = new URLSearchParams(location.search).get('id');
  const asked = isId(fromState) ? fromState : isId(fromQuery) ? fromQuery : null;
  const [state, setState] = useState(() => {
    // A saved wash this device holds opens at once; a new one needs nothing loaded.
    const here = userId && asked ? deviceToolAnswer(userId, asked) : null;
    if (here) return { item: fromRecord(here), error: null };
    return { item: asked ? null : fresh(), error: null };
  });

  useEffect(() => {
    if (!userId || state.item || !asked) return undefined;
    let live = true;
    loadToolAnswer(userId, TOOL, asked).then((r) => {
      if (!live) return;
      setState(r ? { item: fromRecord(r), error: null } : { item: null, error: new Error('missing') });
    });
    return () => { live = false; };
    // Only when the person or the wash asked for changes.
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
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your wash" className="ds-loading--page" /></div>;
  }
  return <Flow key={`${userId}:${asked || 'new'}`} userId={userId} user={user} asked={asked} start={state.item} />;
}

// A plain page (not the full-screen tool), for when a saved wash can't be shown.
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

  useEffect(() => {
    let live = true;
    loadFirstName(userId).then((first) => {
      if (!live || !first) return;
      writeCache(userId, 'first-name', first);
      setName(first);
    }).catch(() => {});
    return () => { live = false; };
  }, [userId]);

  // The wash is kept on the device while the tool is open and put back
  // after a refresh ("Draft restored"): the same wash, with the same id.
  const draft = useDraft({
    userId,
    name: draftName(asked),
    value: item,
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object' || !d.wash || !isId(d.id)) return;
      if (asked && d.id !== asked) return;
      setItem({ ...start, ...d, wash: { ...emptyWash(newId), ...d.wash } });
    },
  });

  // The tool's screens depend on the thoughts typed, so it opens only once
  // a wash kept on the device has been put back: the step it was left on
  // (the second thought's question, the summary) is then still there.
  const [opened, setOpened] = useState(false);
  useEffect(() => { setOpened(true); }, []);

  const onWash = useCallback((fn) => setItem((s) => ({ ...s, wash: fn(s.wash) })), []);
  const todoGone = (id) => { setTodoDeleted(userId, id, new Date().toISOString()).catch(() => null); };

  // Saved for good and leaving: nothing of it stays on the device as a
  // draft. (The hook's own clear, so the page leaving doesn't keep it again;
  // nothing may change the wash on screen between this and leaving.)
  const forget = () => {
    draft.clear();
    clearGuideDraft(stepDraftKey(userId, asked));
    // The same wash carried on at the tool's own address is this one: its
    // older copy there goes too, so it can never be saved over this one.
    if (asked && readDraft(userId, draftName(null))?.v?.id === asked) {
      clearDraft(userId, draftName(null));
      clearGuideDraft(stepDraftKey(userId, null));
    }
  };

  // To-dos made for thoughts that no longer want one are taken away.
  const tidy = (wash) => {
    let next = wash;
    for (const { thoughtId, id } of strayTodos(wash)) {
      todoGone(id);
      next = withTodo(next, thoughtId, null);
    }
    return next;
  };

  // One saved item, written over itself: a draft until it is finished.
  // Never shared: a wash is private.
  // `stays`: the tool stays open (or keeps its place on this device), so
  // what is on screen takes the saved state too.
  const save = async (now, wash, status, { stays = false } = {}) => {
    const createdAt = now.createdAt || new Date().toISOString();
    const finishedAt = status === 'completed' ? (now.finishedAt || new Date().toISOString()) : null;
    const result = await saveToolAnswers(userId, {
      id: now.id,
      tool: TOOL,
      title: washTitle(),
      status,
      answers: savedAnswers(wash, { finished: status === 'completed' }),
      shared: false,
      createdAt,
      finishedAt,
    });
    if (stays) setItem((s) => ({ ...s, wash, status, saved: true, createdAt, finishedAt }));
    return result;
  };

  // Back to where they came from: My Plans for a saved wash, otherwise Reset.
  const leave = () => navigate(asked ? '/my-plans' : '/personal/reset', { replace: true });

  const close = async () => {
    if (busy.current) return;
    const now = itemRef.current;
    // Nothing typed and nothing saved: there is nothing to keep.
    if (!hasAnswers(now.wash) && !now.saved) {
      forget();
      leave();
      return;
    }
    busy.current = true;
    try {
      const wash = tidy(now.wash);
      // A finished wash stays finished only while it is still whole.
      const status = now.status === 'completed' && isComplete(wash) ? 'completed' : 'draft';
      // A finished wash, or one opened from My Plans, is in the list: the
      // next visit starts a new one. An unfinished new one keeps its place
      // on this device, so the tool carries on from here.
      const leaves = Boolean(asked) || status === 'completed';
      const result = await save(now, wash, status, { stays: !leaves });
      if (leaves) forget();
      toast.show(result === 'queued' ? 'Will sync' : 'Saved');
      leave();
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  const finish = async () => {
    const now = itemRef.current;
    let result;
    try {
      result = await save(now, tidy(now.wash), 'completed');
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
      return false;
    }
    forget();
    toast.show(result === 'queued' ? 'Will sync' : 'Saved');
    leave();
    return true;
  };

  if (!opened) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your wash" className="ds-loading--page" /></div>;
  }
  return (
    <div className="ui-root plan-builder-wait">
      <EmotionalWashTool
        wash={item.wash}
        onWash={onWash}
        sourceId={item.id}
        onTodoGone={todoGone}
        pdf={(
          <PdfDownload
            variant="text"
            label="Download my PDF"
            getDocument={async () => {
              const { emotionalWashPdf } = await import('../../lib/pdf/docs/emotionalWash');
              const now = itemRef.current;
              return emotionalWashPdf({ wash: now.wash, person: name, createdAt: now.finishedAt || now.createdAt });
            }}
          />
        )}
        draftKey={stepDraftKey(userId, asked)}
        initialStep={asked ? (start.status === 'completed' ? 'sum' : resumeStep(start.wash)) : undefined}
        onClose={close}
        onFinish={finish}
      />
    </div>
  );
}
