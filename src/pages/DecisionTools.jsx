import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import HomeHeader from '../components/HomeHeader';

const ALL_PROBLEMS = [
  { id: 'decision', title: 'I\'m navigating a tricky decision', description: 'Use the GROW model to get clear on the way forward', tools: ['grow'], status: null },
  { id: 'strategic', title: 'I need to provide my team direction', description: 'Assess how your current projects align with your team\'s objective', tools: ['strategic-alignment'], status: null },
  { id: 'tough-conversation', title: 'I need to give tough feedback', description: 'Create a script for giving feedback', tools: ['tough-conversation'], status: null },
  { id: 'new-hire', title: 'Making a new hire', description: 'Plan and prepare for bringing on new team members', tools: ['new-hire'], status: 'coming-soon' },
  { id: 'onboarding', title: 'Onboarding a new member of staff', description: 'Guide and support new team members in their first weeks', tools: ['onboarding'], status: 'coming-soon' },
  { id: 'energy', title: 'What to focus my energy on', description: 'Allocate your priorities wisely', tools: ['energy-allocation'], status: 'coming-soon' },
  { id: 'goals', title: 'What goals to set', description: 'Set meaningful, values-aligned goals', tools: ['goal-setting'], status: 'coming-soon' },
  { id: 'improve', title: 'Getting better at what I do', description: 'Create an individual development plan', tools: ['idp'], status: 'coming-soon' },
  { id: 'alignment', title: 'Creating alignment in my team', description: 'Improve team clarity and shared direction', tools: ['alignment'], status: 'coming-soon' },
  { id: 'habits', title: 'Improving my habits', description: 'Build better habits and break unhelpful ones', tools: ['habits'], status: 'coming-soon' },
  { id: 'rut', title: 'Getting out of a rut', description: 'Refocus on what\'s working and build momentum', tools: ['rut'], status: 'coming-soon' },
  { id: 'purpose', title: 'Feeling more purposeful', description: 'Reconnect with your intention and "why"', tools: ['purpose'], status: 'coming-soon' },
  { id: 'gratitude', title: 'Cultivating gratitude', description: 'Shift perspective and boost wellbeing', tools: ['gratitude'], status: 'coming-soon' },
  { id: 'performance', title: 'Looking after my wellbeing', description: 'Human performance audit and recovery', tools: ['performance-audit'], status: 'coming-soon' },
  { id: 'team-goals', title: 'Setting team goals and OKRs', description: 'Define and align on team objectives', tools: ['team-goals'], status: 'coming-soon' },
  { id: 'team-performance', title: 'Team health & performance', description: 'Assess team dynamics and performance', tools: ['team-performance'], status: 'coming-soon' },
];

export default function DecisionTools() {
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.state?.isGuest || false;

  const problems = ALL_PROBLEMS;

  const handleProblemSelect = (problem) => {
    if (problem.status === 'coming-soon') return;

    if (problem.tools[0] === 'grow') {
      navigate('/grow-step-1', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    } else if (problem.tools[0] === 'strategic-alignment') {
      navigate('/goal-setting', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    } else if (problem.tools[0] === 'tough-conversation') {
      navigate('/tough-conversation-step-1', { state: { isGuest, ...location.state, problemTitle: problem.title } });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <div style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0 }}>All Decision Tools</h1>
          <button
            onClick={() => navigate('/decision-history', { state: { isGuest } })}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '6px',
              color: '#333',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            My Decisions
          </button>
        </div>


        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {problems.map((problem) => (
            <button
              key={problem.id}
              onClick={() => handleProblemSelect(problem)}
              disabled={problem.status === 'coming-soon'}
              style={{
                padding: '24px',
                backgroundColor: problem.status === 'coming-soon' ? '#f9f9f9' : 'white',
                border: problem.status === 'coming-soon' ? '2px solid #e5e5e5' : '2px solid #e5e5e5',
                borderRadius: '12px',
                color: problem.status === 'coming-soon' ? '#999' : '#333',
                fontWeight: '600',
                cursor: problem.status === 'coming-soon' ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                transition: 'all 0.2s',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '180px',
              }}
              onMouseEnter={(e) => {
                if (problem.status !== 'coming-soon') {
                  e.currentTarget.style.borderColor = '#F08571';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 133, 113, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                if (problem.status !== 'coming-soon') {
                  e.currentTarget.style.borderColor = '#e5e5e5';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <div style={{ fontSize: '28px' }}>{problem.icon}</div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{problem.title}</div>
                <div style={{ fontSize: '13px', fontWeight: '400', opacity: 0.7 }}>{problem.description}</div>
              </div>
              {problem.status === 'coming-soon' && (
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-start' }}>
                  <Lock size={16} color="#999" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
