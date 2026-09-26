import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import SavedConfirmation from '../components/SavedConfirmation';
import HomeHeader from '../components/HomeHeader';

export default function EditPersonalDetails() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, role, organisation')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setRole(profile.role || '');
          setOrganisation(profile.organisation || '');
        }
      } catch (error) {
        // Silently handle profile fetch errors
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSaving(true);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          role: role || null,
          organisation: organisation || null,
        })
        .eq('id', user.id)
        .select();

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('Failed to save profile: profile not found or no changes made');
      }

      setSaved(true);

      const { data: freshProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, role, organisation')
        .eq('id', user.id)
        .single();

      if (freshProfile) {
        setFirstName(freshProfile.first_name || '');
        setLastName(freshProfile.last_name || '');
        setRole(freshProfile.role || '');
        setOrganisation(freshProfile.organisation || '');
      }

      setTimeout(() => {
        navigate('/my-account');
      }, 1500);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(`Failed to save profile: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '600px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <button
          onClick={() => navigate(-1)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '32px',
            padding: 0,
            textAlign: 'left',
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
          Edit Profile
        </h1>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '32px' }}>
          Update your personal information
        </p>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 32px' }}>
            <p style={{ color: '#999' }}>Loading profile...</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* First Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Type here"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>

            {/* Last Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Type here"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>

            {/* Email (Read-only) */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                Email
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  backgroundColor: '#f5f5f5',
                  color: '#999',
                  cursor: 'default',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '12px', color: '#999', marginTop: '6px', margin: 0 }}>
                Email cannot be changed
              </p>
            </div>

            {/* Role */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                Role <span style={{ color: '#999', fontSize: '12px' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Type here"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>

            {/* Organisation */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                Organisation <span style={{ color: '#999', fontSize: '12px' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="Type here"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#F08571'}
                onBlur={(e) => e.target.style.borderColor = '#e5e5e5'}
              />
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              style={{
                padding: '16px 32px',
                backgroundColor: isSaving ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
                marginTop: '16px',
              }}
              onMouseEnter={(e) => !isSaving && (e.target.style.backgroundColor = '#e07560')}
              onMouseLeave={(e) => !isSaving && (e.target.style.backgroundColor = '#F08571')}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <SavedConfirmation
        isVisible={saved}
        onDismiss={() => setSaved(false)}
      />
    </div>
  );
}
