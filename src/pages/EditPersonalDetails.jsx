import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DesignHeader from '../components/DesignHeader';
import pageText from '../content/pageText';
import { Loading, PageHeader, TextField, Button, useToast } from '../components/design';
import { limitName, NAME_MAX, NAME_TOO_LONG } from '../lib/nameLimit';

export default function EditPersonalDetails() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameNote, setNameNote] = useState({ first: false, last: false });
  const [role, setRole] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

      toast.show('Saved');

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
      toast.error('Your details didn’t save. Check your connection and try again.');
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
          padding: 80px 0;
        }

        .edit-profile-field {
          margin-top: 18px;
        }

        .edit-profile-field:first-of-type {
          margin-top: 32px;
        }

        .edit-profile-label {
          display: block;
          font-family: var(--font-body);
          font-weight: 400;
          letter-spacing: normal;
          font-size: var(--fs-meta);
          color: var(--label);
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
          border: 1px solid var(--field-line);
          border-radius: 12px;
          padding: 13px 14px !important;
          font-family: var(--font-body);
          font-size: 16px;
          color: var(--text);
          background: var(--card);
          caret-color: var(--coral-text);
          outline: none;
          transition: border-color var(--dur-fast) var(--ease);
        }

        .edit-profile-input:focus {
          border-color: var(--coral-text);
          outline: none;
        }

        .edit-profile-input:disabled {
          color: var(--label);
          background: var(--bg);
          cursor: default;
        }

        .edit-profile-note {
          font-family: var(--font-body);
          font-size: 12px;
          color: var(--label);
          margin-top: 6px;
        }

        .ui-root .edit-profile-save {
          width: 100%;
          margin-top: 26px;
        }
      `}</style>

      <DesignHeader />

      <div className="edit-profile-content">
        <div className="edit-profile-column">
          <Button variant="text" className="edit-profile-back" onClick={() => navigate(-1)}>
            Back
          </Button>

          <PageHeader title="Edit Profile" info={pageText.editPersonalDetails} />

          {isLoading ? (
            <div className="edit-profile-loading"><Loading label="Loading your profile" /></div>
          ) : (
            <>
              <div className="edit-profile-field" style={{ marginTop: '32px' }}>
                <TextField
                  id="edit-first-name"
                  label="First name"
                  value={firstName}
                  onChange={(e) => {
                    const { value, over } = limitName(e.target.value);
                    setFirstName(value);
                    setNameNote((n) => ({ ...n, first: over }));
                  }}
                  maxLength={NAME_MAX + 1}
                  aria-describedby={nameNote.first ? 'edit-first-name-note' : undefined}
                  placeholder="Type here"
                />
                {nameNote.first && <p id="edit-first-name-note" className="edit-profile-note" role="status">{NAME_TOO_LONG}</p>}
              </div>

              <div className="edit-profile-field">
                <TextField
                  id="edit-last-name"
                  label="Last name"
                  value={lastName}
                  onChange={(e) => {
                    const { value, over } = limitName(e.target.value);
                    setLastName(value);
                    setNameNote((n) => ({ ...n, last: over }));
                  }}
                  maxLength={NAME_MAX + 1}
                  aria-describedby={nameNote.last ? 'edit-last-name-note' : undefined}
                  placeholder="Type here"
                />
                {nameNote.last && <p id="edit-last-name-note" className="edit-profile-note" role="status">{NAME_TOO_LONG}</p>}
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
                <TextField
                  id="edit-role"
                  label="Role, optional"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <div className="edit-profile-field">
                <TextField
                  id="edit-organisation"
                  label="Organisation, optional"
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                  placeholder="Type here"
                />
              </div>

              <Button
                variant="primary"
                className="edit-profile-save"
                onClick={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? 'Saving' : 'Save changes'}
              </Button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
