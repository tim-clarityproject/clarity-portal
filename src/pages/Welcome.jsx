import { useNavigate, useLocation } from 'react-router-dom';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { FormContext } from '../context/FormContext';
import { supabase } from '../lib/supabase';
import { clearProgress } from '../lib/saveProgress';
import HomeHeader from '../components/HomeHeader';
import BreathingGuide from '../components/BreathingGuide';

const ALL_PROBLEMS = [
  { id: 'plan-day', title: 'Plan my day', tools: ['plan-day'], status: null },
  { id: 'decision', title: 'A key decision', tools: ['grow'], status: null },
  { id: 'strategic', title: 'Where my team should focus', tools: ['strategic-alignment'], status: null },
  { id: 'tough-conversation', title: 'A tough conversation', tools: ['tough-conversation'], status: null },
  { id: 'new-hire', title: 'Making a new hire', tools: ['new-hire'], status: 'coming-soon' },
  { id: 'onboarding', title: 'Onboarding a new member of staff', tools: ['onboarding'], status: 'coming-soon' },
  { id: 'energy', title: 'What to focus my energy on', tools: ['energy-allocation'], status: 'coming-soon' },
  { id: 'goals', title: 'What goals to set', tools: ['goal-setting'], status: 'coming-soon' },
  { id: 'improve', title: 'Getting better at what I do', tools: ['idp'], status: 'coming-soon' },
  { id: 'alignment', title: 'Creating alignment in my team', tools: ['alignment'], status: 'coming-soon' },
  { id: 'habits', title: 'Improving my habits', tools: ['habits'], status: 'coming-soon' },
  { id: 'rut', title: 'Getting out of a rut', tools: ['rut'], status: 'coming-soon' },
  { id: 'purpose', title: 'Feeling more purposeful', tools: ['purpose'], status: 'coming-soon' },
  { id: 'gratitude', title: 'Cultivating gratitude', tools: ['gratitude'], status: 'coming-soon' },
  { id: 'performance', title: 'Looking after my wellbeing', tools: ['performance-audit'], status: 'coming-soon' },
  { id: 'team-goals', title: 'Setting team goals and OKRs', tools: ['team-goals'], status: 'coming-soon' },
  { id: 'team-performance', title: 'Team health & performance', tools: ['team-performance'], status: 'coming-soon' },
];

export default function Welcome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const { clearFormData } = useContext(FormContext);
  const [firstName, setFirstName] = useState('');
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [displayedGreeting, setDisplayedGreeting] = useState('');
  const [displayedQuestion, setDisplayedQuestion] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPastDecisions, setShowPastDecisions] = useState(false);
  const [showBreathingGuide, setShowBreathingGuide] = useState(false);
  const [showGreetingText, setShowGreetingText] = useState(false);
  const isGuest = location.state?.isGuest || false;

  // Show breathing guide greeting on Welcome page load
  useEffect(() => {
    if (!isGuest) {
      setShowBreathingGuide(true);
      setShowGreetingText(true);
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
    setShowPastDecisions(false);
    setDisplayedGreeting('');
    setDisplayedQuestion('');

    const timeGreeting = getTimeGreeting();
    const namePart = displayName ? `, ${displayName}.` : '.';
    const fullGreeting = timeGreeting + namePart;
    const question = 'What are you thinking about?';

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
        // Show dropdown after typing completes
        setTimeout(() => setShowDropdown(true), 200);
        // Show past decisions button after dropdown appears
        setTimeout(() => setShowPastDecisions(true), 600);
      }
    }, 40);

    return () => clearInterval(typeInterval);
  }, [firstName]);

  const displayName = firstName || null;
  const problems = ALL_PROBLEMS;
  const selected = selectedProblem ? problems.find(p => p.id === selectedProblem) : null;

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

    if (problem.tools[0] === 'grow') {
      navigate('/grow-step-1', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    } else if (problem.tools[0] === 'strategic-alignment') {
      navigate('/goal-setting', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    } else if (problem.tools[0] === 'tough-conversation') {
      navigate('/tough-conversation-step-1', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    } else if (problem.tools[0] === 'plan-day') {
      navigate('/plan-my-day', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />
      <BreathingGuide isOpen={showBreathingGuide} onClose={() => setShowBreathingGuide(false)} showGreeting={showGreetingText} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 32px' }} className="page-container">
        <div style={{ width: '100%', maxWidth: '1000px' }}>
          <div style={{ marginBottom: '48px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '44px', fontWeight: 'bold', color: 'black', marginBottom: '8px', minHeight: '60px' }}>
              {displayedGreeting}
              {displayedGreeting.length > 0 && displayedGreeting.length < (displayName ? `Good Morning, ${displayName}.` : 'Good Morning.').length && <span style={{ animation: 'blink 0.7s infinite' }}>|</span>}
            </h1>
            <p style={{ fontSize: '20px', color: '#666', margin: 0, minHeight: '30px' }}>
              {displayedQuestion}
              {displayedQuestion.length > 0 && displayedQuestion.length < 'What are we making a decision about?'.length && <span style={{ animation: 'blink 0.7s infinite' }}>|</span>}
            </p>
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
                    color: selected ? '#333' : '#999',
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
                  <span>{selected?.title || 'Choose a challenge...'}</span>
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
                    {problems.map((problem) => (
                      <button
                        key={problem.id}
                        onClick={() => {
                          setSelectedProblem(problem.id);
                          setIsOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '14px 16px',
                          backgroundColor: selectedProblem === problem.id ? '#FEE5DE' : 'white',
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
                          if (selectedProblem !== problem.id && problem.status !== 'coming-soon') {
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
                    ))}
                  </div>
                )}
              </div>

              {selected && selected.status !== 'coming-soon' && (
                <button
                  onClick={() => handleProblemSelect(selected)}
                  style={{
                    width: '100%',
                    marginTop: '16px',
                    padding: '14px 24px',
                    backgroundColor: '#F08571',
                    color: 'white',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
                >
                  Get started
                </button>
              )}

              {selected?.status === 'coming-soon' && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#999',
                }}>
                  Coming soon
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: '80px',
              textAlign: 'center',
              opacity: showPastDecisions ? 1 : 0,
              transition: 'opacity 0.5s ease-in-out',
              fontSize: '13px',
              color: '#999',
            }}
          >
            <p style={{ margin: '0 0 12px 0' }}>Or</p>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/my-journal', { state: { isGuest, reviewType: 'after-action' } })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#F08571',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline';
                  e.currentTarget.style.color = '#e07560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.color = '#F08571';
                }}
              >
                After Action Review
              </button>
              <span style={{ color: '#e5e5e5' }}>•</span>
              <button
                onClick={() => navigate('/my-journal', { state: { isGuest, reviewType: 'progress' } })}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#F08571',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.textDecoration = 'underline';
                  e.currentTarget.style.color = '#e07560';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.textDecoration = 'none';
                  e.currentTarget.style.color = '#F08571';
                }}
              >
                Progress Review
              </button>
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
