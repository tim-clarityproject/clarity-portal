import { useContext, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { readCache, writeCache } from '../../lib/pageCache';
import { useDraft, clearDraft as forgetDraft } from '../../lib/drafts';
import { isNetworkError } from '../../lib/connection';
import { newId, saveOrQueue } from '../../lib/syncQueue';
import { friendlyError } from '../../lib/friendlyError';
import { clearProgress } from '../../lib/saveProgress';
import { TOOL_CLOSED } from '../../content/pageLines/client';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { ErrorMessage, LoadError, Loading, clearGuideDraft, useToast } from '../../components/design';

// One guided tool saved as a row in `decisions` (Polish 1, Stage D item 1:
// the Pre-mortem, Pressure plan and Meeting planner rebuilt to Draft 6 on
// GuidedTool, in focus mode). The page around the tool: it opens a saved
// item (its id in the page's state, as My Plans and the summaries hand it,
// or ?id=…), keeps what's typed on the device as before (useDraft: "Draft
// restored"), saves the same row every time through the offline queue
// (× part-way keeps it as a draft, as Save as draft did; the summary's
// button finishes it) and lands on the tool's own summary page.
//
//   model      the tool's answers: TOOL_TYPE, SUMMARY_PATH, emptyAnswers,
//              fromForm(form, makeId), toForm(answers, before), titleOf, hasAnswers
//   draftName  the device draft's name ('inversion-1', so Home's "Carry on
//              where you left off" still finds an unfinished Pre-mortem)
//   closeTo    where × goes when there's no page to go back to
//   children   ({ answers, onAnswers, draftKey, initialStep, onClose, onFinish, before }) => the tool

const SAVE_ERROR = 'That didn’t save. Check your connection and try again.';
const LOAD_ERROR = 'This didn’t load. Check your connection and try again.';
const GONE = 'This isn’t here any more. It may have been deleted.';
const COLS = 'id, title, form_data, status, draft, created_at, updated_at';
const isId = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** The answers as the tool can always draw them, whatever was kept. */
const tidy = (model, answers) => model.fromForm(model.toForm({ ...model.emptyAnswers(), ...answers }), newId);

export default function DecisionFlow({ model, draftName, closeTo, children }) {
  const { user } = useContext(AuthContext);
  const userId = user?.id;
  const location = useLocation();
  const fromState = location.state?.decisionId;
  const fromQuery = new URLSearchParams(location.search).get('id');
  const asked = isId(fromState) ? fromState : isId(fromQuery) ? fromQuery : null;
  const [state, setState] = useState(() => (asked ? { item: null, error: null } : {
    item: { id: newId(), answers: model.emptyAnswers(), form: {}, title: null, status: 'new', saved: false },
    error: null,
  }));

  useEffect(() => {
    if (!userId || !asked) return undefined;
    let live = true;
    const cacheName = `${model.TOOL_TYPE}:${asked}`;
    const fromRow = (row) => {
      const answers = model.fromForm(row.form_data, newId);
      const named = `${row.title || ''}`.trim();
      return {
        id: row.id,
        answers,
        form: row.form_data || {},
        // A name its owner gave it (the older pages asked) stays; otherwise it follows the answers.
        title: named && named !== model.titleOf(answers, row.form_data || {}) ? named : null,
        status: row.draft || row.status === 'draft' ? 'draft' : 'completed',
        saved: true,
      };
    };
    supabase.from('decisions').select(COLS).eq('id', asked).eq('user_id', userId).eq('tool_type', model.TOOL_TYPE).limit(1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw error;
        if (!data?.[0]) {
          setState({ item: null, error: new Error('missing') });
          return;
        }
        writeCache(userId, cacheName, data[0]);
        setState({ item: fromRow(data[0]), error: null });
      })
      .catch((error) => {
        if (!live) return;
        const cached = isNetworkError(error) ? readCache(userId, cacheName) : null;
        setState(cached ? { item: fromRow(cached.v), error: null } : { item: null, error });
      });
    return () => { live = false; };
  }, [userId, asked, model]);

  if (state.error) {
    return (
      <Shell>
        {state.error?.message === 'missing' ? <ErrorMessage>{GONE}</ErrorMessage> : <LoadError>{LOAD_ERROR}</LoadError>}
      </Shell>
    );
  }
  if (!userId || !state.item) {
    return <div className="ui-root"><Loading label="Loading" className="ds-loading--page" /></div>;
  }
  return (
    <Flow
      key={`${userId}:${asked || 'new'}`}
      userId={userId}
      asked={asked}
      start={state.item}
      model={model}
      draftName={draftName}
      closeTo={closeTo}
    >
      {children}
    </Flow>
  );
}

// A plain page (not the full-screen tool), for when a saved item can't be shown.
function Shell({ children }) {
  const navigate = useNavigate();
  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/my-plans')} label="My Plans" /></div>
        {children}
      </div>
    </div>
  );
}

function Flow({ userId, asked, start, model, draftName, closeTo, children }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState(start);
  const itemRef = useRef(item);
  itemRef.current = item;
  const busy = useRef(false); // one save per press
  const name = `${draftName}:${asked || 'new'}`;
  const stepKey = `${draftName}-${userId}-${asked || 'new'}`;

  // Typing is kept on the device and put back after a refresh ("Draft restored").
  const draft = useDraft({
    userId,
    name,
    value: { id: item.id, answers: item.answers, saved: item.saved, status: item.status },
    ready: true,
    onRestore: (d) => {
      if (!d || typeof d !== 'object') return;
      // A draft the older pages kept: the Pre-mortem's first page kept only its goal, the
      // Pressure plan its situation and if-then plans, read as a saved plan is.
      const older = d.answers ? null : model.fromForm(d, newId);
      const answers = d.answers && typeof d.answers === 'object' ? d.answers
        : typeof d.goal === 'string' ? { plan: d.goal }
          : older && model.hasAnswers(older) ? older : null;
      if (!answers) return;
      if (asked && isId(d.id) && d.id !== asked) return;
      setItem((s) => ({
        ...s,
        id: !asked && isId(d.id) ? d.id : s.id,
        saved: s.saved || (!asked && d.saved === true),
        status: !asked && ['draft', 'completed'].includes(d.status) ? d.status : s.status,
        answers: tidy(model, answers),
      }));
    },
  });

  // Saved for good, or deleted: nothing of it stays on the device.
  const forget = () => {
    draft.clear();
    forgetDraft(userId, name);
    clearGuideDraft(stepKey);
    clearProgress();
  };

  const onAnswers = (fn) => setItem((s) => ({ ...s, answers: typeof fn === 'function' ? fn(s.answers) : fn }));

  // One row in `decisions`, written over itself: a draft until it's finished.
  const save = (status) => {
    const now = itemRef.current;
    const values = {
      title: now.title || model.titleOf(now.answers, now.form),
      form_data: model.toForm(now.answers, now.form),
      status,
      draft: status === 'draft',
      updated_at: new Date().toISOString(),
    };
    if (now.saved) {
      return saveOrQueue(userId, { table: 'decisions', kind: 'update', values, match: { id: now.id, user_id: userId } });
    }
    return saveOrQueue(userId, { table: 'decisions', kind: 'upsert', onConflict: 'id', values: { id: now.id, user_id: userId, tool_type: model.TOOL_TYPE, ...values } });
  };

  // Back where they came from, or the tool's hub.
  const leave = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(closeTo, { replace: true });
  };

  // × part-way: what's there is kept, as a draft (a finished one stays finished).
  const onClose = async () => {
    if (busy.current) return;
    const now = itemRef.current;
    if (!model.hasAnswers(now.answers) && !now.saved) {
      forget();
      leave();
      return;
    }
    busy.current = true;
    try {
      const status = now.status === 'completed' ? 'completed' : 'draft';
      const result = await save(status);
      if (asked || status === 'completed') forget();
      else setItem((s) => ({ ...s, status, saved: true }));
      toast.show(result?.status === 'queued' ? 'Will sync' : TOOL_CLOSED);
      leave();
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
    } finally {
      busy.current = false;
    }
  };

  // The summary's button: saved as finished, then its own summary page.
  const onFinish = async () => {
    const now = itemRef.current;
    let result;
    try {
      result = await save('completed');
    } catch (error) {
      toast.error(friendlyError(error, SAVE_ERROR));
      return false;
    }
    forget();
    if (result?.status === 'queued') {
      // Kept on the device and sent when the connection is back.
      navigate('/my-plans', { replace: true, state: { toast: 'Will sync' } });
      return true;
    }
    navigate(model.SUMMARY_PATH, { replace: true, state: { decisionId: now.id, toast: 'Saved.' } });
    return true;
  };

  return (
    <div className="ui-root">
      {children({
        answers: item.answers,
        onAnswers,
        draftKey: stepKey,
        initialStep: asked && start.status === 'completed' ? 'sum' : undefined,
        onClose,
        onFinish,
        before: item.form,
        decisionId: item.id,
      })}
    </div>
  );
}
