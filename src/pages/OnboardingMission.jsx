import './toolFocus/onboarding.css';
import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { MissionContext } from '../context/MissionContext';
import { supabase } from '../lib/supabase';
import { useDraft } from '../lib/drafts';
import { TextBox, Button, useToast } from '../components/design';

const MAX_GOAL_LENGTH = 70;

export default function OnboardingMission() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const { updateMission } = useContext(MissionContext);
  const [greeting, setGreeting] = useState('');
  const [question, setQuestion] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [mission, setMission] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [firstName, setFirstName] = useState('');

  // Typing survives a refresh or a closed tab (Tim, 26 Oct).
  const { clear: clearDraft } = useDraft({
    userId: user?.id,
    name: 'onboarding-mission',
    value: { mission },
    ready: true,
    onRestore: (draft) => {
      if (typeof draft?.mission === 'string') setMission(draft.mission.slice(0, MAX_GOAL_LENGTH));
    },
  });

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 4) return "You're a night owl";
    if (hour >= 4 && hour < 7) return 'Rise and shine';
    if (hour >= 7 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 22) return 'Evening';
    return "You're a night owl";
  };

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    // Fetch first name
    const fetchFirstName = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();
        if (data?.first_name) {
          setFirstName(data.first_name);
        }
      } catch (error) {
        console.error('Error fetching name:', error);
      }
    };

    fetchFirstName();
  }, [user?.id, navigate]);

  useEffect(() => {
    if (!firstName) return;

    // Animate greeting
    const timeGreeting = getTimeGreeting();
    let charIndex = 0;

    const greetingInterval = setInterval(() => {
      if (charIndex <= timeGreeting.length) {
        setGreeting(timeGreeting.substring(0, charIndex));
        charIndex++;
      } else {
        clearInterval(greetingInterval);
        // After greeting finishes, fade it out and show question
        setTimeout(() => {
          setGreeting('');
          // Now animate the question
          animateQuestion();
        }, 1200);
      }
    }, 80);

    const animateQuestion = () => {
      const questionText = 'What\'s your big Mission?';
      let qIndex = 0;

      const questionInterval = setInterval(() => {
        if (qIndex <= questionText.length) {
          setQuestion(questionText.substring(0, qIndex));
          qIndex++;
        } else {
          clearInterval(questionInterval);
          // Show input after question finishes
          setTimeout(() => {
            setShowInput(true);
          }, 300);
        }
      }, 80);
    };

    return () => clearInterval(greetingInterval);
  }, [firstName]);

  const charCount = mission.length;
  const isOverLimit = charCount > MAX_GOAL_LENGTH;

  const handleSaveMission = async () => {
    if (!mission.trim()) {
      toast.error('Your Mission is empty. Type your Mission, then save.');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ personal_goal: mission.trim() })
        .eq('id', user.id);
      if (error) throw error;

      // Update mission in context after successful save
      await updateMission(mission.trim());
      clearDraft();

      setTimeout(() => {
        navigate('/welcome');
      }, 500);
    } catch (error) {
      console.error('Error saving mission:', error);
      toast.error('Your Mission didn’t save. Check your connection and try again.');
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && mission.trim() && !isOverLimit) {
      handleSaveMission();
    }
  };

  return (
    <div className="ui-root obm-page">
      <div className="obm-col">
        {/* The greeting types in and goes: the page's title, Nekst capitals (Polish 1, rules 1 and 2). */}
        {greeting && (
          <div className="obm-greet">
            <h1 className="obm-title">
              Welcome, {firstName || 'there'}
              <span className="obm-caret" aria-hidden="true">|</span>
            </h1>
          </div>
        )}

        {/* The question types in after the greeting: a 20px question. */}
        {!greeting && (
          <div className="obm-ask">
            <h2 className={`ds-q obm-q${showInput ? ' obm-q--up' : ''}`}>
              {question}
              {question.length < "What's your big Mission?".length && <span className="obm-caret" aria-hidden="true">|</span>}
            </h2>

            {showInput && (
              <div className="obm-input">
                <TextBox
                  className="onboarding-mission-box"
                  ariaLabel="Your Mission"
                  who="me"
                  lines="one"
                  value={mission}
                  onChange={(text) => setMission(text.slice(0, MAX_GOAL_LENGTH))}
                  onKeyDown={handleKeyPress}
                  placeholder="Type here"
                  autoFocus
                />
                <div className={`obm-count${isOverLimit ? ' obm-count--over' : ''}`}>
                  {charCount}/{MAX_GOAL_LENGTH} characters
                  {isOverLimit && <div>That’s over the limit, so shorten it a little.</div>}
                </div>
                <div className="obm-actions">
                  <Button
                    variant="primary"
                    onClick={handleSaveMission}
                    disabled={!mission.trim() || isSaving || isOverLimit}
                  >
                    {isSaving ? 'Saving' : 'Get started'}
                  </Button>
                  <button type="button" className="ds-more ds-more--bare obm-later" onClick={() => { clearDraft(); navigate('/welcome'); }}>
                    Do this later
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
