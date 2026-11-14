import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { LoadError, Loading, PageHeader, PdfDownload, clearGuideDraft, useToast } from '../../components/design';
import { supabase } from '../../lib/supabase';
import { readCache, writeCache } from '../../lib/pageCache';
import { clearDraft, useDraft } from '../../lib/drafts';
import { isNetworkError } from '../../lib/connection';
import { newId, saveOrQueue, waitingToSend } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { setTodoDeleted } from '../../lib/performance/api';
import {
  TOOL_NAME,
  TOOL_TYPE,
  emptyPlan,
  finishMessage,
  hasAnswers,
  nextSteps,
  planFrom,
  planTitle,
  savedForm,
  whereLine,
} from '../../lib/getUnstuck/model';
import GetUnstuckTool from './GetUnstuckTool';
import '../performance/performance.css';

// Get unstuck, signed in (mock-up M9, version 12): the guided tool at
// /get-unstuck. It replaces the five old pages (the goal, reality,
// options, prioritise and "What will I do?"), whose addresses now come
// here, and it opens every plan they saved (planFrom).
//
// Where the answers are kept:
// - on the device as a draft while they are typed (drafts.js: "Draft
//   restored"), with the step the tool was left on (GuidedTool);
// - in `decisions` (tool_type 'grow', as before) through the offline
//   queue: as a draft when the tool is closed part-way ("Saved", and it
//   shows in My Plans as a draft), and as finished by "Finish my plan".
//   The row's id is made on the device, so every save writes the same row.
//
// Finishing lands on This week (the sprint page) with the counted
// message, "1 next step is in this week" (M9, "In your sprint").
//
// A saved plan opens with its id in the page's state (My Plans) or as
// ?id=…; with neither, the tool carries on the unfinished one on this
// device, or starts a new one.

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const LOAD_ERROR = 'Your plan didn’t load. Check your connection and try again.';
const COLS = 'id, title, form_data, status, draft, created_at, updated_at';
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const draftName = (asked) => `get-unstuck:${asked || 'new'}`;
export const stepDraftKey = (userId, asked) => `get-unstuck-${userId}-${asked || 'new'}`;

function fromRow(row) {
  const done = !(row.draft || row.status === 'draft');
  return { id: row.id, plan: planFrom(row.form_data, newId), status: done ? 'completed' : 'draft', saved: true };
}

async function loadFirstName(userId) {
  const { data, error } = await supabase.from('profiles').select('first_name').eq('id', userId).limit(1);
  if (error) throw error;
  return (data?.[0]?.first_name || '').trim();
}

export default function GetUnstuck() {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const fromState = location.state?.decisionId;
  const fromQuery = new URLSearchParams(location.search).get('id');
  const asked = isId(fromState) ? fromState : isId(fromQuery) ? fromQuery : null;
  // My Plans hands over the whole row; an older link only its id.
  const handed = asked && location.state?.id === asked && location.state?.form_data ? location.state : null;
  const [state, setState] = useState(() => {
    if (!asked) return { item: { id: newId(), plan: emptyPlan(), status: 'new', saved: false }, error: null };
    return { item: handed ? fromRow(handed) : null, error: null };
  });

  useEffect(() => {
    if (!userId || !asked || handed) return undefined;
    let live = true;
    supabase.from('decisions').select(COLS).eq('id', asked).eq('user_id', userId).eq('tool_type', TOOL_TYPE).limit(1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw error;
        if (!data?.[0]) {
          setState({ item: null, error: new Error('missing') });
          return;
        }
        writeCache(userId, `get-unstuck:${asked}`, data[0]);
        setState({ item: fromRow(data[0]), error: null });
      })
      .catch((error) => {
        if (!live) return;
        const cached = isNetworkError(error) ? readCache(userId, `get-unstuck:${asked}`) : null;
        setState(cached ? { item: fromRow(cached.v), error: null } : { item: null, error });
      });
    return () => { live = false; };
  }, [userId, asked, handed]);

  if (state.error) {
    return (
      <Shell>
        <LoadError>{LOAD_ERROR}</LoadError>
      </Shell>
    );
  }
  if (!userId || !state.item) {
    return <div className="ui-root plan-builder-wait"><Loading label="Loading your plan" className="ds-loading--page" /></div>;
  }
  return <Flow key={`${userId}:${asked || 'new'}`} userId={userId} user={user} asked={asked} start={state.item} />;
}

// A plain page (not the full-screen tool), for when a saved plan can't be shown.
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

  // Typing is kept on the device and put back after a refresh ("Draft
  // restored"): the same plan, with the same row's id.
  const draft = useDraft({
    userId,
    name: draftName(asked),
    value: item,
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object' || !d.plan || !isId(d.id)) return;
      if (asked && d.id !== asked) return;
      setItem({ ...start, ...d, plan: { ...emptyPlan(), ...d.plan } });
    },
  });

  // The unfinished plan this device carries on was saved as a draft when
  // it was closed. If it has since been deleted (from My Plans, here or
  // on another device) the tool starts a new one, rather than bring it back.
  const savedId = !asked && item.saved ? item.id : null;
  useEffect(() => {
    if (!savedId) return undefined;
    let live = true;
    supabase.from('decisions').select('id').eq('id', savedId).limit(1).then(({ data, error }) => {
      if (!live || error || data?.length || waitingToSend(userId)) return;
      clearDraft(userId, draftName(null));
      clearGuideDraft(stepDraftKey(userId, null));
      setItem({ id: newId(), plan: emptyPlan(), status: 'new', saved: false });
    }, () => {});
    return () => { live = false; };
  }, [savedId, userId]);

  const onPlan = useCallback((fn) => setItem((s) => ({ ...s, plan: fn(s.plan) })), []);

  // Saved for good and leaving: nothing of it stays on the device as a
  // draft. The hook's own clear, so the page doesn't keep it again as it
  // leaves (a finished plan then came back as one to carry on; 14 Nov).
  const forget = () => {
    draft.clear();
    clearGuideDraft(stepDraftKey(userId, asked));
  };

  // One row in `decisions`, written over itself: a draft until it is finished.
  const save = (plan, status) => saveOrQueue(userId, {
    table: 'decisions',
    kind: 'upsert',
    onConflict: 'id',
    values: {
      id: itemRef.current.id,
      user_id: userId,
      tool_type: TOOL_TYPE,
      title: planTitle(plan),
      form_data: savedForm(plan),
      status,
      draft: status === 'draft',
      updated_at: new Date().toISOString(),
    },
  });

  // Back to where they came from: My Plans for a saved plan, otherwise the Plan hub.
  const leave = () => navigate(asked ? '/my-plans' : '/personal/plan', { replace: true });

  const close = async () => {
    if (busy.current) return;
    const now = itemRef.current;
    // Nothing typed and nothing saved: there is nothing to keep.
    if (!hasAnswers(now.plan) && !now.saved) {
      forget();
      leave();
      return;
    }
    busy.current = true;
    try {
      const status = now.status === 'completed' ? 'completed' : 'draft';
      const result = await save(now.plan, status);
      // A plan opened from My Plans is in the list again; a new one keeps
      // its place on this device, so the tool carries on from here.
      if (asked) forget();
      else setItem((s) => ({ ...s, status, saved: true }));
      toast.show(result?.status === 'queued' ? 'Will sync' : 'Saved');
      leave();
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  const finish = async () => {
    const now = itemRef.current;
    try {
      await save(now.plan, 'completed');
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
      return false;
    }
    forget();
    navigate('/performance-sprint', { replace: true, state: { toast: finishMessage(now.plan) } });
    return true;
  };

  // The eye's choice saves at once (WhoSees then says "Saved").
  const share = async (shared) => {
    const now = itemRef.current;
    const plan = { ...now.plan, shared };
    setItem((s) => ({ ...s, plan: { ...s.plan, shared } }));
    if (now.saved || hasAnswers(plan)) {
      const status = now.status === 'completed' ? 'completed' : 'draft';
      await save(plan, status);
      setItem((s) => ({ ...s, status, saved: true }));
    }
  };

  return (
    <div className="ui-root plan-builder-wait">
      <GetUnstuckTool
        plan={item.plan}
        onPlan={onPlan}
        name={name}
        onShare={share}
        sourceId={item.id}
        pdf={(
          <PdfDownload
            getDocument={async () => {
              const { getUnstuckPdf } = await import('../../lib/pdf/docs/getUnstuck');
              const plan = itemRef.current.plan;
              return getUnstuckPdf({ plan, person: name, where: nextSteps(plan).map((a) => whereLine(a, 1).line) });
            }}
          />
        )}
        onTodoGone={(id) => { setTodoDeleted(userId, id, new Date().toISOString()).catch(() => null); }}
        draftKey={stepDraftKey(userId, asked)}
        initialStep={asked && start.status === 'completed' ? 'sum' : undefined}
        onClose={close}
        onFinish={finish}
      />
    </div>
  );
}
