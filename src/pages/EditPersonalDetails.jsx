import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import SavedConfirmation from '../components/SavedConfirmation';
import DesignHeader from '../components/DesignHeader';
import PageHeading from '../components/PageHeading';

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
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
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
  }, [user?.id]);

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
    <div className="ui-root edit-profile-root">
      <style>{`
        .edit-profile-root {
          width: 100%;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          background: var(--bg);
        }

        .edit-profile-content {
          flex: 1;
          width: 100%;
          background: var(--bg);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        @media (max-width: 768px) {
          .edit-profile-content {
            min-height: calc(100dvh - var(--tabbar-height, 81px));
          }
        }

        .edit-profile-column {
          width: 100%;
          box-sizing: border-box;
          padding: 0 20px;
        }

        @media (min-width: 769px) {
          .edit-profile-column {
            max-width: 620px;
            margin: 0 auto;
            padding: 44px 24px 40px;
          }
        }

        @media (max-width: 768px) {
          .edit-profile-column {
            padding-top: 34px;
            padding-bottom: 40px;
          }
        }

        .edit-profile-back {
          margin-bottom: 24px;
        }

        .edit-profile-loading {
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--text-2);
          padding: 80px 0;
          text-align: center;
        }

        .edit-profile-field {
          margin-top: 18px;
        }

        .edit-profile-field:first-of-type {
          margin-top: 32px;
        }

        .edit-profile-label {
          display: block;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          font-size: 10px;
          color: var(--text);
        }

        /* src/styles/mobile.css has input, select { min-height: 44px;
           padding: 12px 16px !important; } at max-width: 768px.
           .edit-profile-input (0,1,0) out-ranks "input, select" (0,0,1)
           on specificity, but not !important, so padding needs its own
           !important. min-height is harmless (not !important, and our
           13px+13px padding plus border already clears 44px anyway). */
        .edit-profile-input {
          margin-top: 8px;
          width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 13px 14px !important;
          font-family: var(--font-body);
          font-size: 16px;
          color: var(--text);
          background: var(--surface);
          caret-color: var(--coral);
          outline: none;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .edit-profile-input:focus {
          border-color: var(--coral);
          outline: none;
        }

        .edit-profile-input:disabled {
          color: var(--placeholder);
          background: var(--bg);
          cursor: default;
        }

        .edit-profile-note {
          font-family: var(--font-body);
          font-size: 12px;
          color: var(--placeholder);
          margin-top: 6px;
        }

        /* .ui-btn-primary (components.css) already sets padding and
           font-size with !important (needed there to beat the legacy
           mobile.css button rule). This page's Save button needs
           different values (padding 14px 0 13px, font-size 11px, not
           the shared pill's 12px 28px 11px / 10px), so this override
           needs higher specificity AND its own !important to win over
           .ui-btn-primary's. */
        .edit-profile-root .ui-btn-primary.edit-profile-save {
          display: block;
          width: 100%;
          padding: 14px 0 13px !important;
          margin-top: 26px;
          font-family: var(--font-display);
          font-weight: 400;
          text-transform: uppercase;
          font-size: 11px !important;
          letter-spacing: 0.24em;
        }
      `}</style>

      <DesignHeader />

      <div className="edit-profile-content">
        <div className="edit-profile-column">
          <button type="button" className="ui-btn-ghost edit-profile-back" onClick={() => navigate(-1)}>
            Back
          </button>

          <PageHeading pageKey="editPersonalDetails" title="Edit Profile" />

          {isLoading ? (
            <div className="edit-profile-loading">Loading profile...</div>
          ) : (
            <>
              <div className="edit-profile-field" style={{ marginTop: '32px' }}>
                <label className="edit-profile-label" htmlFor="edit-first-name">First name</label>
                <input
                  id="edit-first-name"
                  type="text"
                  className="edit-profile-input"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <div className="edit-profile-field">
                <label className="edit-profile-label" htmlFor="edit-last-name">Last name</label>
                <input
                  id="edit-last-name"
                  type="text"
                  className="edit-profile-input"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <div className="edit-profile-field">
                <label className="edit-profile-label" htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  type="email"
                  className="edit-profile-input"
                  value={user?.email || ''}
                  disabled
                />
                <div className="edit-profile-note">Email cannot be changed</div>
              </div>

              <div className="edit-profile-field">
                <label className="edit-profile-label" htmlFor="edit-role">Role, optional</label>
                <input
                  id="edit-role"
                  type="text"
                  className="edit-profile-input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <div className="edit-profile-field">
                <label className="edit-profile-label" htmlFor="edit-organisation">Organisation, optional</label>
                <input
                  id="edit-organisation"
                  type="text"
                  className="edit-profile-input"
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <button
                type="button"
                className="ui-btn-primary edit-profile-save"
                onClick={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>

      <SavedConfirmation
        isVisible={saved}
        onDismiss={() => setSaved(false)}
      />
    </div>
  );
}
