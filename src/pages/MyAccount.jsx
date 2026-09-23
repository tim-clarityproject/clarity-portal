import { useEffect, useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';
import BreathingSettingsModal from '../components/BreathingSettingsModal';
import PersonalGoalModal from '../components/PersonalGoalModal';
import EmailVerificationBanner from '../components/EmailVerificationBanner';

export default function MyAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [personalGoal, setPersonalGoal] = useState('');
  const [showGoalInHeader, setShowGoalInHeader] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBreathingSettings, setShowBreathingSettings] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [archivedMissions, setArchivedMissions] = useState([]);
  const [showArchivedMissions, setShowArchivedMissions] = useState(false);
  const [loadingArchivedMissions, setLoadingArchivedMissions] = useState(false);
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

  // Load archived missions on component mount to prevent stale count
  useEffect(() => {
    if (user) {
      loadArchivedMissions();
    }
  }, [user]);

  // Reload when section is expanded (in case new archives happened)
  useEffect(() => {
    if (showArchivedMissions && user) {
      loadArchivedMissions();
    }
  }, [showArchivedMissions, user]);

  const loadArchivedMissions = async () => {
    setLoadingArchivedMissions(true);
    try {
      const { data } = await supabase
        .from('missions')
        .select('*')
        .eq('user_id', user.id)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

      setArchivedMissions(data || []);
    } catch (error) {
      console.error('Error loading archived missions:', error);
    } finally {
      setLoadingArchivedMissions(false);
    }
  };

  const handleRestoreMission = async (missionId) => {
    try {
      await supabase
        .from('missions')
        .update({ archived_at: null })
        .eq('id', missionId)
        .eq('user_id', user.id);

      // Refresh the active mission in MissionContext by triggering auth state change
      await supabase.auth.refreshSession();

      loadArchivedMissions();
    } catch (error) {
      console.error('Error restoring mission:', error);
      alert('Failed to restore mission');
    }
  };

  const handleDeleteArchivedMission = async (missionId) => {
    const confirmed = window.confirm(
      'Permanently delete this archived mission? This cannot be undone. All reviews will be lost.'
    );
    if (!confirmed) return;

    const doubleConfirm = window.confirm(
      'Are you absolutely sure? This is permanent and cannot be recovered.'
    );
    if (!doubleConfirm) return;

    try {
      await supabase
        .from('missions')
        .delete()
        .eq('id', missionId)
        .eq('user_id', user.id);

      loadArchivedMissions();
    } catch (error) {
      console.error('Error deleting mission:', error);
      alert('Failed to delete mission');
    }
  };

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
        await supabase
          .from('profiles')
          .update({ show_mission_in_header: newVisibility })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating visibility preference:', error);
      }
    }
  };

  // Handle hash-based scrolling to sections
  useEffect(() => {
    if (location.hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.querySelector(location.hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [location.hash]);

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} personalGoal={showGoalInHeader ? personalGoal : ''} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
          My Account
        </h1>

        <EmailVerificationBanner />

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

          {/* Archived Missions */}
          <div style={{
            paddingTop: '24px',
            borderTop: '1px solid #e5e5e5',
          }}>
            <button
              onClick={() => setShowArchivedMissions(!showArchivedMissions)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: '0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Archived Missions
              </h2>
              <span style={{ fontSize: '12px', color: '#999', fontWeight: '500' }}>
                ({archivedMissions.length})
              </span>
            </button>

            {showArchivedMissions && (
              <div>
                {loadingArchivedMissions ? (
                  <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>Loading archived missions...</p>
                ) : archivedMissions.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>No archived missions</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {archivedMissions.map((mission) => (
                      <div key={mission.id} style={{
                        padding: '20px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e5e5',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
                      }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0, marginBottom: '6px' }}>
                            {mission.title}
                          </p>
                          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                            Archived {new Date(mission.archived_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                          <button
                            onClick={() => handleRestoreMission(mission.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'white',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px',
                              color: '#F08571',
                              fontWeight: '600',
                              cursor: 'pointer',
                              fontSize: '12px',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#f9f9f9';
                              e.target.style.borderColor = '#F08571';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'white';
                              e.target.style.borderColor = '#e5e5e5';
                            }}
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteArchivedMission(mission.id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'white',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px',
                              color: '#c0574c',
                              fontWeight: '600',
                              cursor: 'pointer',
                              fontSize: '12px',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = 'rgba(192, 87, 76, 0.1)';
                              e.target.style.borderColor = '#c0574c';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'white';
                              e.target.style.borderColor = '#e5e5e5';
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
