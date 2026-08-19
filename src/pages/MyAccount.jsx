import { useEffect, useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { plans as plansAPI } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const isGuest = location.state?.isGuest || false;

  useEffect(() => {
    const fetchPlans = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userPlans = await plansAPI.getUserPlans(user.id);
        setPlans(userPlans || []);
      } catch (error) {
        console.error('Error fetching plans:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, [user]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getStatusColor = (status) => {
    return status === 'completed' ? '#5ECCC0' : '#F08571';
  };

  const getStatusText = (status) => {
    return status === 'completed' ? 'Completed' : 'In Progress';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
            My Plans
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            View and continue your strategic planning sessions
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: '80px' }}>
            <p style={{ color: '#999', fontSize: '16px', marginBottom: '32px' }}>
              Loading your plans...
            </p>
          </div>
        ) : plans.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '80px' }}>
            <p style={{ color: '#999', fontSize: '16px', marginBottom: '32px' }}>
              You haven't created any plans yet
            </p>
            <button
              onClick={() => navigate('/choose-focus', { state: { isGuest } })}
              style={{
                padding: '16px 48px',
                backgroundColor: '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
            >
              Create Your First Plan
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {plans.map((plan) => (
              <div
                key={plan.id}
                style={{
                  border: '2px solid #e5e5e5',
                  borderRadius: '12px',
                  padding: '24px',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#F08571';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 133, 113, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e5e5';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '8px', marginTop: 0 }}>
                      {plan.name}
                    </h3>
                    <p style={{ color: '#999', fontSize: '13px', marginBottom: '8px', margin: 0 }}>
                      {plan.type}
                    </p>
                  </div>
                  <div style={{
                    padding: '6px 16px',
                    backgroundColor: getStatusColor(plan.status),
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    marginLeft: '16px',
                  }}>
                    {getStatusText(plan.status)}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ color: '#666', fontSize: '12px' }}>Progress</span>
                    <span style={{ color: '#333', fontSize: '12px', fontWeight: '600' }}>{plan.progress}%</span>
                  </div>
                  <div style={{
                    height: '4px',
                    backgroundColor: '#e5e5e5',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      backgroundColor: getStatusColor(plan.status),
                      width: `${plan.progress}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#999', marginBottom: '16px' }}>
                  <span>Created {formatDate(plan.createdDate)}</span>
                  <span>Edited {formatDate(plan.lastEditedDate)}</span>
                </div>

                <button
                  onClick={() => navigate('/choose-focus', { state: { isGuest } })}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
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
                  {plan.status === 'completed' ? 'Review' : 'Continue Editing'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
