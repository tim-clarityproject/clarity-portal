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
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (error) {
        alert('Failed to delete account: ' + error.message);
        setIsDeleting(false);
        return;
      }

      await logout();
      sessionStorage.clear();
      localStorage.clear();

      setTimeout(() => navigate('/'), 500);
    } catch (error) {
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, personal_goal, show_mission_in_header')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setPersonalGoal(profile.personal_goal || '');

          if (profile.show_mission_in_header !== null && profile.show_mission_in_header !== undefined) {
            setShowGoalInHeader(profile.show_mission_in_header);
          } else {
            const savedVisibility = localStorage.getItem(`goal-visibility-${user.id}`);
            if (savedVisibility !== null) {
              setShowGoalInHeader(JSON.parse(savedVisibility));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);

  // Re-fetch goal when modal closes (to show updated value immediately)
  useEffect(() => {
    if (!showGoalModal && user) {
      const refetchGoal = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('personal_goal, show_mission_in_header')
            .eq('id', user.id)
            .single();

          if (profile) {
            setPersonalGoal(profile.personal_goal || '');
            if (profile.show_mission_in_header !== null && profile.show_mission_in_header !== undefined) {
              setShowGoalInHeader(profile.show_mission_in_header);
            }
          }
        } catch (error) {
          console.error('Error refetching goal:', error);
        }
      };

      refetchGoal();
    }
  }, [showGoalModal, user]);

  const handleToggleGoalVisibility = async () => {
    const newVisibility = !showGoalInHeader;
    setShowGoalInHeader(newVisibility);

    if (user) {
      try {
        // Save to Supabase
        await supabase
          .from('profiles')
          .update({ show_mission_in_header: newVisibility })
          .eq('id', user.id);

        // Also save to localStorage for instant effect
        localStorage.setItem(`goal-visibility-${user.id}`, JSON.stringify(newVisibility));
      } catch (error) {
        console.error('Error updating visibility preference:', error);
      }
    }
  };


  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} personalGoal={showGoalInHeader ? personalGoal : ''} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
          My Account
        </h1>

        {/* Settings Container */}
        <div style={{ backgroundColor: 'white' }}>
          {/* Profile Section */}
          <div style={{
            paddingBottom: '24px',
            marginBottom: '32px',
            borderBottom: '1px solid #e5e5e5',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Profile
            </h2>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '4px' }}>
                  {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Your Name'}
                </p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
                  {user?.email}
                </p>
              </div>
              <button
                onClick={() => navigate('/edit-profile')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '6px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Edit
              </button>
            </div>
          </div>

          {/* Mission Section */}
          <div style={{
            paddingBottom: '24px',
            marginBottom: '32px',
            borderBottom: '1px solid #e5e5e5',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Your Mission
            </h2>

            {/* Mission Statement Setting */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '16px 0',
              borderBottom: '1px solid #f0f0f0',
              marginBottom: '16px',
            }}>
              <div style={{ flex: 1, maxWidth: '60%' }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '4px' }}>
                  Mission Statement
                </p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: '1.5' }}>
                  {personalGoal || 'No mission set yet'}
                </p>
                <p style={{ fontSize: '12px', color: '#bbb', margin: '6px 0 0 0' }}>
                  {personalGoal.length}/50 characters
                </p>
              </div>
              <button
                onClick={() => setShowGoalModal(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '6px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Edit
              </button>
            </div>

            {/* Show in Header Setting */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '4px' }}>
                  Show in Header
                </p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: '1.5' }}>
                  Display your mission in the page heading
                </p>
              </div>
              <button
                onClick={handleToggleGoalVisibility}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '6px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                  minWidth: '76px',
                  textAlign: 'center',
                  opacity: showGoalInHeader ? 1 : 0.6,
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                {showGoalInHeader ? 'Visible' : 'Hidden'}
              </button>
            </div>
          </div>

          {/* Advanced Settings Section */}
          <div id="breathing-settings" style={{
            paddingBottom: '24px',
            marginBottom: '32px',
            borderBottom: '1px solid #e5e5e5',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Advanced
            </h2>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '4px' }}>
                  Breathing Settings
                </p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: '1.5' }}>
                  Customize your breathing cycle duration
                </p>
              </div>
              <button
                onClick={() => setShowBreathingSettings(true)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid #F08571',
                  borderRadius: '6px',
                  color: '#F08571',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Edit
              </button>
            </div>
          </div>

          {/* Danger Zone */}
          <div style={{
            paddingTop: '24px',
            borderTop: '2px solid #fee5de',
          }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#c0574c', margin: '0 0 20px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Danger Zone
            </h2>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 0',
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#c0574c', margin: 0, marginBottom: '4px' }}>
                  Delete Account
                </p>
                <p style={{ fontSize: '13px', color: '#999', margin: 0, lineHeight: '1.5' }}>
                  Permanently delete your account and all data
                </p>
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  border: '2px solid #c0574c',
                  borderRadius: '6px',
                  color: '#c0574c',
                  fontWeight: '600',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  marginLeft: '16px',
                  opacity: isDeleting ? 0.5 : 1,
                }}
                onMouseEnter={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = 'rgba(192, 87, 76, 0.1)')}
                onMouseLeave={(e) => !isDeleting && (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
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
