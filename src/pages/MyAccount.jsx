import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BreathingSettingsModal from '../components/BreathingSettingsModal';
import PersonalGoalModal from '../components/PersonalGoalModal';

export default function MyAccount() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalGoal, setPersonalGoal] = useState('');
  const [showGoalInHeader, setShowGoalInHeader] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBreathingSettings, setShowBreathingSettings] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const isGuest = false;

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure? This will permanently delete your account and all data.')) {
      return;
    }

    setIsDeleting(true);
    try {
      // Delete profile and related data (cascade will handle other tables)
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (error) {
        console.error('Delete error:', error);
        alert('Failed to delete account: ' + error.message);
        setIsDeleting(false);
        return;
      }

      // Sign out the user
      await logout();

      // Redirect to login
      setTimeout(() => navigate('/'), 500);
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please try again.');
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch profile data
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, personal_goal')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setPersonalGoal(profile.personal_goal || '');
        }

        // Load goal visibility from localStorage
        const savedVisibility = localStorage.getItem(`goal-visibility-${user.id}`);
        if (savedVisibility !== null) {
          setShowGoalInHeader(JSON.parse(savedVisibility));
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  const handleToggleGoalVisibility = () => {
    const newVisibility = !showGoalInHeader;
    setShowGoalInHeader(newVisibility);
    if (user) {
      localStorage.setItem(`goal-visibility-${user.id}`, JSON.stringify(newVisibility));
    }
  };


  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} personalGoal={showGoalInHeader ? personalGoal : ''} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
          My Account
        </h1>

        {/* Profile Card */}
        <div style={{
          marginBottom: '48px',
          padding: '24px',
          backgroundColor: '#fafafa',
          borderRadius: '12px',
          border: '1px solid #e5e5e5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '8px', margin: 0 }}>
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Profile'}
            </h2>
            <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => navigate('/edit-profile')}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #F08571',
              borderRadius: '8px',
              color: '#F08571',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Edit Profile
          </button>
        </div>

        {/* Personal Goal Section */}
        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #e5e5e5' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '24px' }}>
            Your Purpose
          </h2>

          <div style={{
            padding: '28px',
            background: 'linear-gradient(135deg, rgba(240, 133, 113, 0.04) 0%, rgba(255, 255, 255, 0.4) 100%)',
            borderRadius: '12px',
            border: '1px solid rgba(240, 133, 113, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            boxShadow: '0 2px 12px rgba(240, 133, 113, 0.06)',
          }}>
            {/* Goal Display */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '16px 0',
              gap: '16px',
            }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#F08571', marginBottom: '8px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Personal Mission
                </h3>
                <p style={{ fontSize: '15px', color: '#333', margin: 0, fontWeight: '500', lineHeight: '1.6', marginBottom: '8px' }}>
                  {personalGoal || 'No mission set yet'}
                </p>
                <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                  Max 50 characters
                </p>
              </div>
              <button
                onClick={() => setShowGoalModal(true)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '8px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Edit
              </button>
            </div>

            {/* Visibility Toggle */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '20px',
              borderTop: '1px solid rgba(240, 133, 113, 0.15)',
            }}>
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#F08571', marginBottom: '6px', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Show in Header
                </h3>
                <p style={{ fontSize: '13px', color: '#777', margin: 0, lineHeight: '1.5' }}>
                  Display your goal in the page heading
                </p>
              </div>
              <button
                onClick={handleToggleGoalVisibility}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '8px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                  minWidth: '80px',
                  textAlign: 'center',
                  opacity: showGoalInHeader ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                {showGoalInHeader ? 'Visible' : 'Hidden'}
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Settings Section */}
        <div id="breathing-settings" style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #e5e5e5' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '24px' }}>
            Advanced Settings
          </h2>

          <div style={{
            padding: '24px',
            backgroundColor: '#fafafa',
            borderRadius: '12px',
            border: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'black', marginBottom: '4px', margin: 0 }}>
                Breathing Settings
              </h3>
              <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                Customize your breathing cycle duration
              </p>
            </div>
            <button
              onClick={() => setShowBreathingSettings(true)}
              style={{
                padding: '12px 24px',
                backgroundColor: 'transparent',
                border: '2px solid #F08571',
                borderRadius: '8px',
                color: '#F08571',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
                flexShrink: 0,
                marginLeft: '16px',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#FEE5DE';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              Edit
            </button>
          </div>
        </div>

        {/* Delete Account Section */}
        <div style={{ marginTop: '48px', textAlign: 'center' }}>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#c0574c',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              textDecoration: 'none',
              transition: 'opacity 0.2s',
              opacity: isDeleting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => !isDeleting && (e.target.style.textDecoration = 'underline')}
            onMouseLeave={(e) => !isDeleting && (e.target.style.textDecoration = 'none')}
          >
            {isDeleting ? 'Deleting account...' : 'Delete account'}
          </button>
        </div>

        <BreathingSettingsModal isOpen={showBreathingSettings} onClose={() => setShowBreathingSettings(false)} />
        <PersonalGoalModal
          isOpen={showGoalModal}
          onClose={() => setShowGoalModal(false)}
          currentGoal={personalGoal}
          onGoalSaved={(newGoal) => setPersonalGoal(newGoal)}
        />
      </div>
    </div>
  );
}
