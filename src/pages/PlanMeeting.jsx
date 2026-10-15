import { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { discardDecisionDraft } from '../lib/discardDraft';
import DesignHeader from '../components/DesignHeader';
import PhoneActionBar from '../components/ui/PhoneActionBar';
import AutoGrowTextarea from '../components/ui/AutoGrowTextarea';
import { DiscardLink } from '../components/ui/DiscardLink';
import DiscardDialog from '../components/ui/DiscardDialog';
import Toast from '../components/ui/Toast';
import useToast from '../hooks/useToast';
import pageText from '../content/pageText';
import PageHeading from '../components/PageHeading';

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
  if (!time) return '—';
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
  const { message, showToast } = useToast();

  const menuRef = useRef(null);

  useEffect(() => {
    if (!decisionId || !user) return;
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
    })();
    return () => { cancelled = true; };
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

    if (decisionId) {
      const { data, error } = await supabase
        .from('decisions')
        .update(payload)
        .eq('id', decisionId)
        .eq('user_id', user.id)
        .select();
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Could not find this meeting to update.');
      return decisionId;
    }

    const { data, error } = await supabase
      .from('decisions')
      .insert({ user_id: user.id, tool_type: 'plan_meeting', ...payload })
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Save did not return a meeting.');
    return data[0].id;
  };

  const handleFinish = async () => {
    if (!user || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(false);
      navigate('/meeting-summary', { state: { decisionId: savedId, toast: 'Saved.' } });
    } catch (error) {
      console.error('[PlanMeeting] Finish failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!user || isSaving) return;
    setSaveError('');
    setIsSaving(true);
    try {
      const savedId = await persist(true);
      setDecisionId(savedId);
      showToast('Draft saved.');
      navigate('/my-plans');
    } catch (error) {
      console.error('[PlanMeeting] Save as draft failed:', error);
      setSaveError('Could not save - please try again.');
    } finally {
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
    navigate('/my-plans');
  };

  const bothAdded = sections.includes('context') && sections.includes('pre-reads');

  const actionButtons = (
    <>
      <button type="button" className="ui-btn-primary" disabled={isSaving} onClick={handleFinish}>Finish</button>
      <button type="button" className="ui-btn-ghost" disabled={isSaving} onClick={handleSaveDraft}>Save as draft</button>
    </>
  );

  return (
    <div className="ui-root">
      <DesignHeader />

      <div className="plan-page plan-page--form">
        <div className="plan-header">
          <PageHeading pageKey="planMeeting" title="Meeting planner" overline="" rule={false} />
        </div>

        <div className="plan-field">
          <label htmlFor="meeting-title">Meeting title</label>
          <AutoGrowTextarea id="meeting-title" singleLine className="plan-input" placeholder="Type here" value={title} onChange={setTitle} />
        </div>

        <div className="plan-field">
          <label htmlFor="meeting-chair">Chair</label>
          <AutoGrowTextarea id="meeting-chair" singleLine className="plan-input" placeholder="Type here" value={chair} onChange={setChair} />
        </div>

        <div className="plan-field-row">
          <div className="plan-field">
            <label htmlFor="meeting-date">Date</label>
            <input id="meeting-date" type="date" className="plan-input" value={date} onChange={(e) => setDate(e.target.value)} />
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
              <button type="button" className="plan-link-btn" onClick={() => removeSection('context')}>Remove</button>
            </div>
            <AutoGrowTextarea
              id="meeting-context"
              className="plan-input"
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
              <button type="button" className="plan-link-btn" onClick={() => removeSection('pre-reads')}>Remove</button>
            </div>
            <AutoGrowTextarea
              id="meeting-prereads"
              className="plan-input"
              placeholder="Type here"
              value={preReads}
              onChange={setPreReads}
            />
          </div>
        )}

        {!bothAdded && (
          <div className="plan-menu" ref={menuRef}>
            <button
              type="button"
              className="plan-add-btn"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className={`ui-cross ui-cross--sm ui-cross--open${menuOpen ? ' open' : ''}`} aria-hidden="true" />
              Add section
            </button>
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
          <span className="ui-section-heading">Objectives (in priority order)</span>
        </div>
        {objectives.map((obj, index) => (
          <div className="plan-obj-row" key={obj.id}>
            <span className="plan-obj-num">{index + 1}.</span>
            <AutoGrowTextarea
              singleLine
              className="plan-input"
              placeholder="Type here"
              aria-label={`Objective ${index + 1}`}
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
        <button type="button" className="plan-add-btn" onClick={addObjective}>
          <span className="ui-cross ui-cross--sm" aria-hidden="true" />
          Add objective
        </button>

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
              <AutoGrowTextarea singleLine className="plan-input" placeholder="Type here" value={item.item} onChange={(v) => changeAgendaItem(item.id, 'item', v)} />
            </div>
            <div className="plan-ag-field plan-ag-field--aim">
              <label>Aim</label>
              <AutoGrowTextarea singleLine className="plan-input" placeholder="Type here" value={item.aim} onChange={(v) => changeAgendaItem(item.id, 'aim', v)} />
            </div>
            <div className="plan-ag-field">
              <label>Lead</label>
              <AutoGrowTextarea singleLine className="plan-input" placeholder="Type here" value={item.lead} onChange={(v) => changeAgendaItem(item.id, 'lead', v)} />
            </div>
            <div className="plan-ag-field">
              <label>Length (min)</label>
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
        <button type="button" className="plan-add-btn" onClick={addAgendaItem}>
          <span className="ui-cross ui-cross--sm" aria-hidden="true" />
          Add agenda item
        </button>

        {saveError && <p className="plan-save-error" role="alert">{saveError}</p>}

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
      <Toast message={message} />
    </div>
  );
}
