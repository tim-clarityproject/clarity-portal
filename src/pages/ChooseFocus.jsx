import { useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FormContext } from '../context/FormContext';
import BackArrow from '../components/BackArrow';
import HomeHeader from '../components/HomeHeader';

export default function ChooseFocus() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPath } = useContext(FormContext);
  const isGuest = location.state?.isGuest || false;

  const handlePersonal = () => {
    setPath('personal');
    navigate('/goal-setting', { state: { path: 'personal', isGuest } });
  };

  const handleTeam = () => {
    setPath('team');
    navigate('/goal-setting', { state: { path: 'team', isGuest } });
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }}>
        <div style={{ width: '100%' }}>
          <div style={{ marginBottom: '96px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: 'black' }}>
              Where should we start?
            </h1>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '24px', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
            {/* Me Button */}
            <button
              onClick={handlePersonal}
              style={{
                padding: '16px 32px',
                flex: 1,
                backgroundColor: '#F08571',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.target.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.1)'}
              onMouseLeave={(e) => e.target.style.boxShadow = 'none'}
            >
              Me
            </button>

            {/* My Team Button */}
            <button
              onClick={handleTeam}
              style={{
                padding: '16px 32px',
                flex: 1,
                backgroundColor: '#5ECCC0',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.target.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.1)'}
              onMouseLeave={(e) => e.target.style.boxShadow = 'none'}
            >
              My Team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
