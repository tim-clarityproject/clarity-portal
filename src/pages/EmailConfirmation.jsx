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
        // Check for error parameters in URL (from Supabase if something went wrong)
        const errorCode = searchParams.get('error_code');
        const error = searchParams.get('error');
        if (error || errorCode) {
          console.error('[EmailConfirmation] Error in URL:', { error, errorCode });
          setStatus('error');
          setMessage(
            errorCode === 'otp_expired'
              ? 'The confirmation link has expired. Please sign up again.'
              : error || 'Email confirmation failed. Please try signing up again.'
          );
          return;
        }

        // CRITICAL: Set the justConfirmedEmail flag FIRST, before anything else
        // This ensures it's available in localStorage even before session is fully processed
        localStorage.setItem('justConfirmedEmail', 'true');
        console.log('[EmailConfirmation] Flag set: justConfirmedEmail = true');

        // CRITICAL: Wait for the onAuthStateChange event to fire
        // Supabase's detectSessionInUrl processes the token asynchronously
        // We need to wait for the session to actually be created and the listener to fire
        // Rather than calling getSession() immediately (which might return null if still processing)
        let sessionReady = false;
        let sessionError = null;
        let detectedUser = null;

        // Listen for the auth state change event (fired when token is processed)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, session) => {
            console.log('[EmailConfirmation] Auth state changed:', event, 'has session?', !!session?.user);

            if (event === 'SIGNED_IN' && session?.user) {
              // Token was successfully exchanged for a session
              console.log('✓ Email confirmed and session established');
              console.log('[EmailConfirmation] User:', session.user.email, 'ID:', session.user.id);
              detectedUser = session.user;
              sessionReady = true;
            } else if (event === 'SIGNED_IN') {
              // SIGNED_IN but no user - something is wrong
              sessionError = 'Session created but no user data';
              sessionReady = true;
            }
          }
        );

        // Poll for session ready or timeout after 10 seconds
        let waitTime = 0;
        const maxWait = 10000; // 10 second timeout
        const pollInterval = 100;

        while (!sessionReady && waitTime < maxWait) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          waitTime += pollInterval;
        }

        // Clean up the subscription
        subscription?.unsubscribe();

        if (sessionError || !detectedUser) {
          console.error('[EmailConfirmation] Session error or timeout:', sessionError);
          setStatus('error');
          setMessage(
            sessionError || 'Email confirmation timed out. The link may have expired. Please try signing up again.'
          );
          return;
        }

        // CRITICAL: Don't do profile UPSERT here - AuthContext handles it
        // Multiple simultaneous UPSERT calls cause 409 conflicts
        // AuthContext's onAuthStateChange listener will:
        // 1. See the SIGNED_IN event (from detectSessionInUrl)
        // 2. Read justConfirmedEmail flag from localStorage
        // 3. Do the profile UPSERT with names from user_metadata and terms_accepted=true
        // 4. Call loadUserData to sync other tables

        // Clean up old localStorage name storage (no longer needed)
        localStorage.removeItem('pendingSignupName');

        setStatus('success');
        setMessage('Email confirmed! Redirecting to your mission...');

        // Redirect to the mission/purpose onboarding page after a brief delay
        // This is CRITICAL for new users to set their mission
        // The justConfirmedEmail flag is already set
        // The user should now be authenticated in AuthContext via the onAuthStateChange listener
        setTimeout(() => {
          navigate('/onboarding-mission');
        }, 1000);
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
