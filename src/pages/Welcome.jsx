import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';
import BreathingGuide from '../components/BreathingGuide';

const ALL_PROBLEMS = [
  // Plan
  { id: 'plan-day', title: 'I want to make the most of today', tools: ['plan-day'], status: null, category: 'Plan' },
  { id: 'plan-meeting', title: 'I want to hold a high quality meeting', tools: ['plan-meeting'], status: null, category: 'Plan' },

  // Decide
  { id: 'grow', title: 'I\'m navigating a tricky decision', tools: ['grow'], status: null, category: 'Decide' },
  { id: 'tough-conversation', title: 'I need to give tough feedback', tools: ['tough-conversation'], status: null, category: 'Decide' },
  { id: 'strategic', title: 'I need to provide my team direction', tools: ['strategic-alignment'], status: null, category: 'Decide' },

  // Review
  { id: 'after-action', title: 'I need to review a situation', tools: ['after-action'], status: null, category: 'Review' },
  { id: 'progress', title: 'I want to review my progress', tools: ['progress'], status: null, category: 'Review' },
];

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { clearFormData } = useContext(FormContext);
  const [firstName, setFirstName] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [displayedGreeting, setDisplayedGreeting] = useState('');
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBreathingGuide, setShowBreathingGuide] = useState(false);
  const [showGreetingText, setShowGreetingText] = useState(false);
  const isGuest = location.state?.isGuest || false;

  // Show breathing guide greeting on Welcome page load (with 2-hour timer)
  useEffect(() => {
    if (isGuest) return;

    const lastBreathingTime = localStorage.getItem('lastBreathingGuideTime');
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;

    if (!lastBreathingTime || now - parseInt(lastBreathingTime) > twoHours) {
      setShowBreathingGuide(true);
      setShowGreetingText(true);
      localStorage.setItem('lastBreathingGuideTime', now.toString());
    }
  }, [isGuest]);

  useEffect(() => {
    if (!user || isGuest) return;

    try {
      const cachedData = sessionStorage.getItem('clarity-user-data');
      if (cachedData) {
        const userData = JSON.parse(cachedData);
        if (userData.first_name) {
          setFirstName(userData.first_name);
          return;
        }
      }
    } catch (err) {
      console.error('Error reading cached data:', err);
    }

    const fetchUserName = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('id', user.id)
          .single();

        if (data && data.first_name) {
          setFirstName(data.first_name);
        }
      } catch (err) {
        console.error('Error fetching user name:', err);
      }
    };

    fetchUserName();
  }, [user, isGuest]);

  useEffect(() => {
    setShowDropdown(false);
    setDisplayedGreeting('');
    setDisplayedQuestion('');

    const timeGreeting = getTimeGreeting();
    const namePart = displayName ? `, ${displayName}.` : '.';
    const fullGreeting = timeGreeting + namePart;
    const question = 'What are we working on?';

    let greetingIndex = 0;
    let questionIndex = 0;
    let isGreetingDone = false;

    const typeInterval = setInterval(() => {
      if (!isGreetingDone && greetingIndex < fullGreeting.length) {
        setDisplayedGreeting(fullGreeting.substring(0, greetingIndex + 1));
        greetingIndex++;
      } else if (!isGreetingDone) {
        isGreetingDone = true;
      } else if (questionIndex < question.length) {
        setDisplayedQuestion(question.substring(0, questionIndex + 1));
        questionIndex++;
      } else {
        clearInterval(typeInterval);
        // Show dropdown after all text types out
        setTimeout(() => setShowDropdown(true), 200);
      }
    }, 40);

    return () => clearInterval(typeInterval);
  }, [firstName]);

  const displayName = firstName || null;
  const problems = ALL_PROBLEMS;

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    if (hour < 22) return 'Good Evening';
    return 'Good Morning';
  };


  const handleProblemSelect = (problem) => {
    if (problem.status === 'coming-soon') return;

    // Clear FormContext and localStorage when starting a fresh decision
    clearFormData();
    clearProgress();

    const tool = problem.tools[0];
    const routeMap = {
      'grow': '/grow-step-1',
      'inversion': '/inversion-step-1',
      'strategic-alignment': '/goal-setting',
      'tough-conversation': '/tough-conversation-step-1',
      'plan-day': '/plan-my-day',
      'plan-meeting': '/plan-meeting',
      'after-action': '/my-journal',
      'progress': '/my-journal',
    };

    const route = routeMap[tool];
    if (route) {
      const state = { isGuest, ...location.state, problemTitle: problem.title };
      if (tool === 'after-action') state.reviewType = 'after-action';
      if (tool === 'progress') state.reviewType = 'progress';
      navigate(route, { state });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />
      <BreathingGuide isOpen={showBreathingGuide} onClose={() => setShowBreathingGuide(false)} showGreeting={showGreetingText} firstName={firstName} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 32px' }} className="page-container">
        <div style={{ width: '100%', maxWidth: '1000px' }}>
          <div style={{ marginBottom: '48px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '44px', fontWeight: 'bold', color: 'black', marginBottom: '8px', minHeight: '60px' }}>
              {displayedGreeting}
              {displayedGreeting.length > 0 && displayedGreeting.length < (displayName ? `Good Morning, ${displayName}.` : 'Good Morning.').length && <span style={{ animation: 'blink 0.7s infinite' }}>|</span>}
            </h1>
            <h2 style={{ fontSize: '20px', fontWeight: '400', color: '#333', margin: 0, minHeight: '30px' }}>
              {displayedQuestion}
              {displayedQuestion.length > 0 && displayedQuestion.length < 'What are we working on?'.length && <span style={{ animation: 'blink 0.7s infinite' }}>|</span>}
            </h2>
          </div>

          <style>{`
            @keyframes blink {
              0%, 49% { opacity: 1; }
              50%, 100% { opacity: 0; }
            }
          `}</style>

          <div style={{ maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto' }}>
            {/* Problem selector dropdown */}
            <div>
              <div
            style={{
              position: 'relative',
              opacity: showDropdown ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
            }}
          >
                <button
                  onClick={() => setIsOpen(!isOpen)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    backgroundColor: 'white',
                    border: '2px solid #e5e5e5',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#999',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#F08571';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = isOpen ? '#F08571' : '#e5e5e5';
                  }}
                >
                  <span>Choose an option...</span>
                  <span style={{ fontSize: '12px', opacity: 0.5 }}>▼</span>
                </button>

                {isOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: 'white',
                      border: '2px solid #F08571',
                      borderRadius: '8px',
                      marginTop: '4px',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    }}
                  >
                    {(() => {
                      let lastCategory = null;
                      return problems.map((problem, index) => (
                        <div key={problem.id}>
                          {problem.category && problem.category !== lastCategory && (
                            <>
                              {index > 0 && <div style={{ height: '1px', backgroundColor: '#f0f0f0' }} />}
                              <div style={{ padding: '8px 16px', fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', backgroundColor: '#fafafa' }}>
                                {(lastCategory = problem.category)}
                              </div>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setIsOpen(false);
                              handleProblemSelect(problem);
                            }}
                            style={{
                              width: '100%',
                              padding: '14px 16px',
                              backgroundColor: 'white',
                              border: 'none',
                              borderBottom: '1px solid #f0f0f0',
                              textAlign: 'left',
                              cursor: problem.status === 'coming-soon' ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              color: problem.status === 'coming-soon' ? '#ccc' : '#333',
                              fontSize: '14px',
                            }}
                            onMouseEnter={(e) => {
                              if (problem.status !== 'coming-soon') {
                                e.currentTarget.style.backgroundColor = '#FEE5DE';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (problem.status !== 'coming-soon') {
                                e.currentTarget.style.backgroundColor = 'white';
                              }
                            }}
                            disabled={problem.status === 'coming-soon'}
                          >
                            <span>{problem.title}</span>
                            {problem.status === 'coming-soon' && (
                              <span style={{ fontSize: '10px', color: '#ccc', fontWeight: '600', textTransform: 'uppercase', marginLeft: 'auto' }}>
                                Coming soon
                              </span>
                            )}
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 999,
          }}
        />
      )}
    </div>
  );
}
