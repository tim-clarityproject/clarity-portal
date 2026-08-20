import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function EditPersonalDetails() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, role, organisation, profile_picture_url')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
        }

        if (profile) {
          console.log('Profile loaded:', profile);
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setRole(profile.role || '');
          setOrganisation(profile.organisation || '');
          if (profile.profile_picture_url) {
            setProfilePicture(profile.profile_picture_url);
            setProfilePicturePreview(profile.profile_picture_url);
          }
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setMessage('Please upload a PNG or JPG image');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage('File size must be less than 5MB');
      return;
    }

    setProfilePictureFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setProfilePicturePreview(e.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSaving(true);
    setMessage('');

    try {
      let pictureUrl = profilePicture;

      // Upload new profile picture if selected
      if (profilePictureFile) {
        const fileExt = profilePictureFile.name.split('.').pop();
        const fileName = `${user.id}-${Date.now()}.${fileExt}`;
        const filePath = `profile-pictures/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('profiles')
          .upload(filePath, profilePictureFile, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data } = supabase.storage
          .from('profiles')
          .getPublicUrl(filePath);

        pictureUrl = data.publicUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          role: role,
          organisation: organisation,
          profile_picture_url: pictureUrl,
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfilePictureFile(null);
      setProfilePicture(pictureUrl);

      // Refresh profile data from Supabase to show updated info
      const { data: freshProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, role, organisation, profile_picture_url')
        .eq('id', user.id)
        .single();

      if (freshProfile) {
        setFirstName(freshProfile.first_name || '');
        setLastName(freshProfile.last_name || '');
        setRole(freshProfile.role || '');
        setOrganisation(freshProfile.organisation || '');
        if (freshProfile.profile_picture_url) {
          setProfilePicture(freshProfile.profile_picture_url);
          setProfilePicturePreview(freshProfile.profile_picture_url);
        }
      }

      // Redirect back to My Account after a short delay
      setTimeout(() => {
        navigate('/my-account');
      }, 800);
    } catch (error) {
      console.error('Error saving profile:', error);
      setMessage('Error saving profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '600px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
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
            {/* Profile Picture */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                Profile Picture
              </label>

              {profilePicturePreview && (
                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                  <img
                    src={profilePicturePreview}
                    alt="Profile"
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #F08571',
                    }}
                  />
                </div>
              )}

              <label
                htmlFor="profile-picture-input"
                style={{
                  display: 'block',
                  padding: '24px 16px',
                  border: '2px dashed #e5e5e5',
                  borderRadius: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: '#fafafa',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#F08571';
                  e.currentTarget.style.backgroundColor = '#FEE5DE';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e5e5';
                  e.currentTarget.style.backgroundColor = '#fafafa';
                }}
              >
                <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '600', color: '#333' }}>
                  Click to upload or drag and drop
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
                  PNG or JPG (max 5MB)
                </p>
              </label>

              <input
                id="profile-picture-input"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* First Name */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: '#333', fontWeight: '600' }}>
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Tim"
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
                placeholder="Dutton"
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
                Role
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., CEO, Project Manager, Designer"
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
                Organisation
              </label>
              <input
                type="text"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="Your company or organisation name"
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

            {/* Success/Error Message */}
            {message && (
              <div style={{
                padding: '12px 16px',
                backgroundColor: message.includes('Error') ? '#ffe5e5' : '#e5f5f2',
                color: message.includes('Error') ? '#d32f2f' : '#00897b',
                borderRadius: '6px',
                fontSize: '13px',
                textAlign: 'center',
              }}>
                {message}
              </div>
            )}

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
    </div>
  );
}
