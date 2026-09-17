import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HomeHeader from '../components/HomeHeader';

export default function PlanMyDayStep1() {
  const navigate = useNavigate();
  const [success, setSuccess] = useState('');
  const [showUp, setShowUp] = useState('');
  const [notDo, setNotDo] = useState('');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
            Plan My Day
          </h1>
          <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
            Set yourself up for success
          </p>
        </div>

        <div style={{ marginBottom: '32px', display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              What would make today a success for you?
            </label>
            <textarea
              value={success}
              onChange={(e) => setSuccess(e.target.value)}
              placeholder="Describe what a successful day looks like..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              How do you want to show up today?
            </label>
            <textarea
              value={showUp}
              onChange={(e) => setShowUp(e.target.value)}
              placeholder="What qualities or mindset do you want to embody..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
              What do you not want to do today?
            </label>
            <textarea
              value={notDo}
              onChange={(e) => setNotDo(e.target.value)}
              placeholder="What should you avoid or not focus on..."
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                border: '2px solid #e5e5e5',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/welcome')}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Save Plan
          </button>
          <button
            onClick={() => navigate('/welcome')}
            style={{
              flex: 1,
              padding: '14px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #e5e5e5',
              borderRadius: '8px',
              color: '#333',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
