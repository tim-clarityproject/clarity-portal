import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import pageText from '../content/pageText';
import { DatePicker, DisclosureArrow, PageHeader, SaveStatus, TextBox, Button, useToast } from '../components/design';
import { clearDraft as forgetDraft, useDraft } from '../lib/drafts';
import { saveDecisionOrQueue } from '../lib/decisionSave';
import { useQueuedSave } from '../lib/syncQueue';
import { limitTitle, TITLE_TOO_LONG } from '../lib/titleLimit';

const SECTION_OPTIONS = [
  { id: 'context', label: 'Meeting context' },
  { id: 'pre-reads', label: 'Attendee preparation' },
];

function BinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.6 8h6.8l.6-8M6.8 7v3.5M9.2 7v3.5" />
    </svg>
  );
}

function calcEndTime(time, totalMinutes) {
  if (!time) return 'Not set';
  const [hours, minutes] = time.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0, 0);
  const end = new Date(start.getTime() + totalMinutes * 60000);
  const hh = String(end.getHours()).padStart(2, '0');
  const mm = String(end.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function PlanMeeting() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [decisionId, setDecisionId] = useState(location.state?.decisionId || null);

  const [title, setTitle] = useState('');
  const [titleNote, setTitleNote] = useState(false); // shown after typing past the title limit
  const [chair, setChair] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [objectives, setObjectives] = useState([{ id: 1, text: '' }]);
  const [nextObjectiveId, setNextObjectiveId] = useState(2);
  const [flowItems, setFlowItems] = useState([{ id: 1, item: '', aim: '', lead: '', length: '' }]);
  const [nextItemId, setNextItemId] = useState(2);
  const [sections, setSections] = useState(['agenda']);
  const [meetingContext, setMeetingContext] = useState('');
  const [preReads, setPreReads] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const toast = useToast();
  // A plan opened from My Plans is ready once it has loaded; a new one at once.
  const [loaded, setLoaded] = useState(!location.state?.decisionId);
  const [draftName, setDraftName] = useState(() => `meeting:${location.state?.decisionId || 'new'}`);
  const [syncState, markQueued] = useQueuedSave();
  // A double tap starts one save, not two.
  const savingRef = useRef(false);

  const menuRef = useRef(null);

  // Typing survives a refresh or a closed tab (Tim, 26 Oct).
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: draftName,
    value: { title, chair, date, time, objectives, flowItems, sections, meetingContext, preReads },
    ready: loaded,
    onRestore: (v) => {
      setTitle(v.title || '');
      setChair(v.chair || '');
      setDate(v.date || '');
      setTime(v.time || '');
      setMeetingContext(v.meetingContext || '');
      setPreReads(v.preReads || '');
      if (v.sections) setSections(v.sections);
      if (v.objectives?.length) {
        setObjectives(v.objectives);
        setNextObjectiveId(Math.max(...v.objectives.map((o) => o.id || 0)) + 1);
      }
      if (v.flowItems?.length) {
        setFlowItems(v.flowItems);
        setNextItemId(Math.max(...v.flowItems.map((i) => i.id || 0)) + 1);
      }
    },
  });

  // A save that waited on the device has reached the server: the draft
  // can go. (A refused one keeps it, so the typing comes back.)
  useEffect(() => {
    if (syncState === 'saved') clearDraft();
  }, [syncState, clearDraft]);

  useEffect(() => {
    if (!decisionId || !user || loaded) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('decisions')
        .select('*')
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        console.error('[PlanMeeting] load failed:', error);
        setLoaded(true);
        return;
      }
      const formData = data?.form_data || {};
      setTitle(formData.title || '');
      setChair(formData.chair || '');
      setDate(formData.date || '');
      setTime(formData.time || '');
      setMeetingContext(formData.meetingContext || '');
      setPreReads(formData.preReads || '');
      if (formData.sections) setSections(formData.sections);
      if (formData.objectives?.length) {
        setObjectives(formData.objectives);
        setNextObjectiveId(Math.max(...formData.objectives.map((o) => o.id || 0)) + 1);
      }
      if (formData.flowItems?.length) {
        setFlowItems(formData.flowItems);
        setNextItemId(Math.max(...formData.flowItems.map((i) => i.id || 0)) + 1);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, user?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const addSection = (id) => {
    if (!sections.includes(id)) setSections([...sections, id]);
    setMenuOpen(false);
  };

  const removeSection = (id) => setSections(sections.filter((s) => s !== id));

  const addObjective = () => {
    setObjectives([...objectives, { id: nextObjectiveId, text: '' }]);
    setNextObjectiveId(nextObjectiveId + 1);
  };
  const removeObjective = (id) => {
    if (objectives.length > 1) setObjectives(objectives.filter((o) => o.id !== id));
  };
  const changeObjective = (id, text) => {
    setObjectives(objectives.map((o) => (o.id === id ? { ...o, text } : o)));
  };

  const addAgendaItem = () => {
    setFlowItems([...flowItems, { id: nextItemId, item: '', aim: '', lead: '', length: '' }]);
    setNextItemId(nextItemId + 1);
  };
  const removeAgendaItem = (id) => {
    if (flowItems.length > 1) setFlowItems(flowItems.filter((i) => i.id !== id));
  };
  const changeAgendaItem = (id, field, value) => {
    setFlowItems(flowItems.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const totalLength = flowItems.reduce((sum, item) => sum + (parseInt(item.length, 10) || 0), 0);
  const endTime = calcEndTime(time, totalLength);

  const persist = async (draft) => {
    const formData = { title, date, time, chair, objectives, flowItems, sections, meetingContext, preReads };
    const payload = {
      form_data: formData,
      title: title || `Meeting on ${date}`,
      draft,
      status: draft ? 'draft' : 'completed',
      updated_at: new Date().toISOString(),
    };

    // Offline, it is kept on the device and sent when the connection is
    // back ("Will sync", then "Saved").
    const result = await saveDecisionOrQueue({ userId: user.id, decisionId, toolType: 'plan_meeting', payload });
    setDecisionId(result.id);
    // A new plan now has its id (made on the device when offline): the
    // page's history and its draft follow it, so a refresh and a second
    // save update this plan rather than make another.
    if (!location.state?.decisionId) {
      navigate(location.pathname, { replace: true, state: { ...location.state, decisionId: result.id } });
      forgetDraft(user.id, draftName);
      setDraftName(`meeting:${result.id}`);
    }
    // The draft stays until the server has it: a save waiting on the
    // device is cleared once it has gone (below), and kept if refused.
    if (result.status === 'queued') markQueued(result.qid);
    else clearDraft();
    return result;
  };

  const handleFinish = async () => {
    if (!user || isSaving || savingRef.current) return;
    savingRef.current = true;
    setSaveError('');
    setIsSaving(true);
    try {
      const saved = await persist(false);
      // Kept on the device for now: stay here, showing "Will sync".
      if (saved.status === 'saved') navigate('/meeting-summary', { state: { decisionId: saved.id, toast: 'Saved.' } });
    } catch (error) {
      console.error('[PlanMeeting] Finish failed:', error);
      setSaveError('That didn’t save. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user || isSaving || savingRef.current) return;
    savingRef.current = true;
    setSaveError('');
    setIsSaving(true);
    try {
      const saved = await persist(true);
      if (saved.status === 'saved') {
        toast.show('Draft saved.');
        navigate('/my-plans');
      }
    } catch (error) {
      console.error('[PlanMeeting] Save as draft failed:', error);
      setSaveError('That didn’t save. Check your connection and try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  // Deletes the saved row only if it is still a draft - a completed
  // plan is never deleted by walking away from it. The condition lives
  // in the query (see discardDraft.js), so a completed row matches
  // nothing even though this page does not track its status (patch D1).
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (decisionId) {
      try {
        await discardDecisionDraft(user.id, decisionId);
      } catch (error) {
        console.error('[PlanMeeting] draft delete on discard failed:', error);
      }
    }
    clearDraft();
    navigate('/my-plans');
  };

  const bothAdded = sections.includes('context') && sections.includes('pre-reads');

  const actionButtons = (
    <>
      <Button type="button" variant="primary" disabled={isSaving} onClick={handleFinish}>Finish</Button>
      <Button type="button" variant="outline" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</Button>
    </>
  );

  return (
    <div className="ui-root">
      <style>{`
        .ui-root .plan-field label {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          font-size: var(--fs-label-row);
          color: var(--text-2);
        }
        .ui-root .plan-ag-head {
          font-family: var(--font-body);
          text-transform: none;
          letter-spacing: normal;
          font-size: var(--fs-meta);
          color: var(--label);
        }
        .ui-root .plan-obj-row {
          grid-template-columns: 28px minmax(0, 1fr) 44px;
        }
        .ui-root .plan-obj-row .plan-bin-btn,
        .ui-root .plan-ag-row .plan-bin-btn {
          box-sizing: border-box;
          width: 44px;
          padding: 0 !important;
        }
      `}</style>
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <PageHeader title="Meeting planner" info={pageText.planMeeting} />
        </div>

        <div className="plan-field">
          <TextBox
            id="meeting-title"
            label="Meeting title"
            lines="one"
            placeholder="Type here"
            value={title}
            onChange={(next) => {
              const { value, over } = limitTitle(next);
              setTitle(value);
              setTitleNote(over);
            }}
            aria-describedby={titleNote ? 'meeting-title-note' : undefined}
          />
          {titleNote && <p id="meeting-title-note" className="ds-hint" role="status">{TITLE_TOO_LONG}</p>}
        </div>

        <div className="plan-field">
          <TextBox id="meeting-chair" label="Chair" lines="one" placeholder="Type here" value={chair} onChange={setChair} />
        </div>

        <div className="plan-field-row">
          <div className="plan-field">
            <DatePicker label="Date" value={date} onChange={(key) => setDate(key)} min="1900-01-01" />
          </div>
          <div className="plan-field">
            <label htmlFor="meeting-time">Start time</label>
            <input id="meeting-time" type="time" className="plan-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <p className="plan-endline">
          Ends at <b>{endTime}</b>
          <span>Worked out from the start time and agenda lengths.</span>
        </p>

        {sections.includes('context') && (
          <div className="plan-section">
            <div className="plan-section-top">
              <label htmlFor="meeting-context">Meeting context</label>
              <Button type="button" variant="text" onClick={() => removeSection('context')}>Remove</Button>
            </div>
            <TextBox
              id="meeting-context"
              lines="many"
              placeholder="Type here"
              value={meetingContext}
              onChange={setMeetingContext}
            />
          </div>
        )}

        {sections.includes('pre-reads') && (
          <div className="plan-section">
            <div className="plan-section-top">
              <label htmlFor="meeting-prereads">Attendee preparation</label>
              <Button type="button" variant="text" onClick={() => removeSection('pre-reads')}>Remove</Button>
            </div>
            <TextBox
              id="meeting-prereads"
              lines="many"
              placeholder="Type here"
              value={preReads}
              onChange={setPreReads}
            />
          </div>
        )}

        {!bothAdded && (
          <div className="plan-menu" ref={menuRef}>
            <Button
              type="button"
              variant="outline"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              Add section
              <DisclosureArrow open={menuOpen} />
            </Button>
            {menuOpen && (
              <div className="plan-menu-list" role="menu">
                {SECTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    className="plan-menu-option"
                    disabled={sections.includes(opt.id)}
                    onClick={() => addSection(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="plan-label-row">
          <span className="ui-section-heading">Objectives in priority order</span>
        </div>
        {objectives.map((obj, index) => (
          <div className="plan-obj-row" key={obj.id}>
            <span className="plan-obj-num">{index + 1}.</span>
            <TextBox
              lines="one"
              placeholder="Type here"
              ariaLabel={`Objective ${index + 1}`}
              value={obj.text}
              onChange={(v) => changeObjective(obj.id, v)}
            />
            <button
              type="button"
              className="plan-bin-btn"
              aria-label={`Remove objective ${index + 1}`}
              disabled={objectives.length === 1}
              onClick={() => removeObjective(obj.id)}
            >
              <BinIcon />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" icon="plus" onClick={addObjective}>
          Add objective
        </Button>

        <div className="plan-label-row">
          <span className="ui-section-heading">Meeting agenda</span>
          <span className="plan-total-badge">Total: {totalLength} min</span>
        </div>

        <div className="plan-ag-head">
          <span>Item</span>
          <span>Aim</span>
          <span>Lead</span>
          <span>Length</span>
          <span />
        </div>
        {flowItems.map((item, index) => (
          <div className="plan-ag-row" key={item.id}>
            <div className="plan-ag-field plan-ag-field--item">
              <label>Item</label>
              <TextBox lines="one" ariaLabel={`Agenda item ${index + 1}`} placeholder="Type here" value={item.item} onChange={(v) => changeAgendaItem(item.id, 'item', v)} />
            </div>
            <div className="plan-ag-field plan-ag-field--aim">
              <label>Aim</label>
              <TextBox lines="one" ariaLabel={`Aim of agenda item ${index + 1}`} placeholder="Type here" value={item.aim} onChange={(v) => changeAgendaItem(item.id, 'aim', v)} />
            </div>
            <div className="plan-ag-field">
              <label>Lead</label>
              <TextBox lines="one" ariaLabel={`Lead for agenda item ${index + 1}`} placeholder="Type here" value={item.lead} onChange={(v) => changeAgendaItem(item.id, 'lead', v)} />
            </div>
            <div className="plan-ag-field">
              <label>Length in minutes</label>
              <input
                className="plan-input"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={item.length}
                onChange={(e) => changeAgendaItem(item.id, 'length', e.target.value)}
              />
            </div>
            <button
              type="button"
              className="plan-bin-btn"
              aria-label={`Remove agenda item ${index + 1}`}
              disabled={flowItems.length === 1}
              onClick={() => removeAgendaItem(item.id)}
            >
              <BinIcon />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" icon="plus" onClick={addAgendaItem}>
          Add agenda item
        </Button>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}
        <SaveStatus state={syncState} />

        <div className="plan-actions plan-actions--desktop">{actionButtons}</div>

        <div className="plan-discard-row">
          <DiscardLink onClick={() => setDiscardOpen(true)} />
        </div>
      </div>

      <PhoneActionBar>{actionButtons}</PhoneActionBar>

      <DiscardDialog
        isOpen={discardOpen}
        title="Discard this plan?"
        message="Anything you have not saved will be lost."
        onKeep={() => setDiscardOpen(false)}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
