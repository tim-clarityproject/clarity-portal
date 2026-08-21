import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { AuthContext } from '../context/AuthContext';
import { plans as plansAPI } from '../lib/supabase';
import BackArrow from '../components/BackArrow';
import HomeHeader from '../components/HomeHeader';

export default function Results() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const strategies = location.state?.strategies || [];
  const ratings = location.state?.ratings || [];
  const isGuest = location.state?.isGuest || false;
  const path = location.state?.path || 'personal';

  const data = strategies.map((strategy, index) => ({
    name: String.fromCharCode(65 + index),
    value: ratings[index] || 0,
    fullName: strategy,
  }));

  const handleSavePlan = async () => {
    console.log('Save plan clicked. User:', user);

    if (!user) {
      alert('Please log in to save your plan');
      return;
    }

    setIsSaving(true);
    try {
      const planName = `${path === 'personal' ? 'Personal' : 'Team'} Strategy Review - ${new Date().toLocaleDateString()}`;
      const formData = location.state || {};

      await plansAPI.savePlan(user.id, planName, path, formData);
      setSavedMessage('Plan saved successfully!');
      setTimeout(() => {
        navigate('/decision-history', { state: { isGuest: false } });
      }, 1500);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const getConfidenceColor = (rating) => {
    if (rating >= 5) return '#C0574C'; // Dark coral for 5
    if (rating >= 4) return '#D07560'; // Medium coral for 4
    if (rating >= 3) return '#E89580'; // Light coral for 3
    return '#F0A89E'; // Lighter coral for 1-2
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black' }}>
            Your Strategy Ratings
          </h1>
        </div>

        {/* Radar Chart */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '48px' }}>
          <ResponsiveContainer width="100%" height={380}>
            <RadarChart data={data} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
              <PolarGrid stroke="#e5e5e5" strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="name" stroke="#333" fontSize={14} fontWeight="bold" />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 5]}
                stroke="#999"
                label={{ value: 'Confidence Level', angle: 90, position: 'insideBottomLeft', offset: 10 }}
                ticks={[1, 2, 3, 4, 5]}
              />
              <Radar
                name="Strategy Confidence"
                dataKey="value"
                stroke="#C0574C"
                fill="#F08571"
                fillOpacity={0.55}
                isAnimationActive={true}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Strategy Legend */}
        <div style={{ marginBottom: '48px', maxWidth: '600px', margin: '0 auto 48px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', textAlign: 'center', color: '#333' }}>
            Strategy Ratings
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
            {data.map((item, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', backgroundColor: '#f9f9f9', borderRadius: '8px', borderLeft: `4px solid ${getConfidenceColor(item.value)}` }}>
                <div style={{ minWidth: '32px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 'bold', color: getConfidenceColor(item.value), display: 'inline-block', width: '32px', height: '32px', lineHeight: '32px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '4px', border: `2px solid ${getConfidenceColor(item.value)}` }}>
                    {item.name}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', color: '#333', marginBottom: '4px' }}>
                    {item.fullName}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {[1, 2, 3, 4, 5].map(num => (
                      <div
                        key={num}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: num <= item.value ? getConfidenceColor(item.value) : '#e5e5e5',
                        }}
                      />
                    ))}
                    <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px' }}>{item.value}/5</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scale Reference */}
        <div style={{ textAlign: 'center', marginBottom: '24px', color: '#666', fontSize: '13px' }}>
          <p>Scale: 1 (center, lowest confidence) to 5 (outer edge, highest confidence)</p>
        </div>

        {/* Save Message */}
        {savedMessage && (
          <div style={{ textAlign: 'center', color: '#5ECCC0', fontSize: '14px', fontWeight: '600', marginBottom: '16px' }}>
            ✓ {savedMessage}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center', paddingBottom: '24px' }}>
        <button
          type="button"
          onClick={() => navigate(path === 'team' ? '/project-scatter' : '/dashboard', { state: { ...location.state, isGuest } })}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => {
            const div = e.target.querySelector('div');
            if (div) {
              div.style.backgroundColor = '#e8e8e8';
              div.style.transform = 'translateX(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            const div = e.target.querySelector('div');
            if (div) {
              div.style.backgroundColor = '#f5f5f5';
              div.style.transform = 'translateX(0)';
            }
          }}
        >
          <BackArrow />
        </button>
        <button
          onClick={handleSavePlan}
          disabled={isSaving}
          style={{
            padding: '16px 32px',
            backgroundColor: isSaving ? '#ccc' : '#F08571',
            color: 'white',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '8px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => !isSaving && (e.target.style.backgroundColor = '#e07560')}
          onMouseLeave={(e) => !isSaving && (e.target.style.backgroundColor = '#F08571')}
        >
          {isSaving ? 'Saving...' : (user ? 'Save & Finish' : 'Finish')}
        </button>
      </div>

    </div>
  );
}
