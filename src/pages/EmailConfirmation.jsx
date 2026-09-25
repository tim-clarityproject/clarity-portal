import { useEffect, useContext, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function EmailConfirmation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useContext(AuthContext);
  const [status, setStatus] = useState('confirming'); // 'confirming', 'success', 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        // Supabase automatically processes the token if detectSessionInUrl is enabled
        // Check if session was successfully created by the confirmation
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Email confirmation error:', error);
          setStatus('error');
          setMessage(error.message || 'Failed to confirm email. The link may have expired. Please try signing up again.');
          return;
        }

        if (session?.user) {
          console.log('✓ Email confirmed and session established');

          // Create profile record with name from user_metadata (saved at signup) and mark terms as accepted
          try {
            // Get names from user_metadata (saved during signup, more reliable than localStorage)
            const userData = session.user.user_metadata || {};
            const firstName = userData.first_name || '';
            const lastName = userData.last_name || '';
            console.log('[EmailConfirmation] Retrieved names from user_metadata:', { firstName, lastName });

            // Check if profile already exists
            const { data: existingProfile, error: fetchError } = await supabase
              .from('profiles')
              .select('id')
              .eq('id', session.user.id)
              .single();

            if (fetchError && fetchError.code === 'PGRST116') {
              // Profile doesn't exist, create it
              await supabase
                .from('profiles')
                .insert({
                  id: session.user.id,
                  email: session.user.email,
                  first_name: firstName,
                  last_name: lastName,
                  terms_accepted: true,
                });
              console.log('✓ Profile created with name from user_metadata and terms accepted');
            } else if (!fetchError) {
              // Profile exists, update it with name and terms accepted
              await supabase
                .from('profiles')
                .update({
                  first_name: firstName,
                  last_name: lastName,
                  terms_accepted: true,
                })
                .eq('id', session.user.id);
              console.log('✓ Profile updated with name from user_metadata and terms accepted');
            }

            // Mark this as a new signup confirmation (to skip /accept-terms redirect)
            localStorage.setItem('justConfirmedEmail', 'true');
            // Clean up old localStorage name storage (no longer needed)
            localStorage.removeItem('pendingSignupName');
          } catch (profileErr) {
            console.error('Profile creation error (non-fatal):', profileErr);
            // Continue anyway - user can still proceed
          }

          setStatus('success');
          setMessage('Email confirmed! Redirecting to your mission...');

          // Redirect to the mission/purpose onboarding page after a brief delay
          // This is CRITICAL for new users to set their mission
          setTimeout(() => {
            navigate('/onboarding-mission');
          }, 2000);
        } else {
          console.warn('No session after email confirmation');
          setStatus('error');
          setMessage('Email confirmation completed, but session could not be established. Please try logging in.');
        }
      } catch (err) {
        console.error('Email confirmation exception:', err);
        setStatus('error');
        setMessage(err.message || 'An error occurred during email confirmation. Please try again.');
      }
    };

    handleEmailConfirmation();
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <div style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: 'black', marginBottom: '16px' }}>
              The Clarity Project
            </h1>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '24px', lineHeight: '1.6' }}>
              We're confirming your email address so you can access your personalized clarity tools.
            </p>
          </div>

          {status === 'confirming' && (
            <div style={{ padding: '32px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                margin: '0 auto 16px',
                border: '3px solid #F08571',
                borderTop: '3px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <p style={{ color: '#666', fontSize: '14px' }}>
                Confirming your email address...
              </p>
            </div>
          )}

          {status === 'success' && (
            <div style={{
              padding: '24px 32px',
              backgroundColor: '#e8f5e9',
              borderRadius: '8px',
              border: '1px solid #4caf50',
              marginBottom: '24px'
            }}>
              <p style={{ color: '#2e7d32', fontSize: '14px', margin: '0 0 8px 0', fontWeight: '500' }}>
                ✓ Email Confirmed!
              </p>
              <p style={{ color: '#2e7d32', fontSize: '13px', margin: 0 }}>
                Welcome to The Clarity Project. Let's help you define your purpose.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div style={{
              padding: '24px 32px',
              backgroundColor: '#ffebee',
              borderRadius: '8px',
              border: '1px solid #f44336',
              marginBottom: '24px'
            }}>
              <p style={{ color: '#c62828', fontSize: '14px', margin: 0, fontWeight: '500' }}>
                Confirmation Issue
              </p>
              <p style={{ color: '#c62828', fontSize: '13px', margin: '8px 0 0 0' }}>
                {message}
              </p>
            </div>
          )}

          {status === 'error' && (
            <button
              onClick={() => navigate('/create-account')}
              style={{
                padding: '12px 24px',
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
              Try Signing Up Again
            </button>
          )}

          <p style={{ color: '#999', fontSize: '12px', marginTop: '32px', lineHeight: '1.6' }}>
            This page is part of The Clarity Project. We never share your data and your privacy is important to us.
          </p>
        </div>
      </div>
    </div>
  );
}
