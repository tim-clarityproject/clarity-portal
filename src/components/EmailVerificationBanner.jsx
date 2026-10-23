import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { IconButton, Button } from './design';

export default function EmailVerificationBanner() {
  const { user } = useContext(AuthContext);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      // Check if email is confirmed
      const emailConfirmed = user.email_confirmed_at !== null && user.email_confirmed_at !== undefined;
      setIsVisible(!emailConfirmed);
    } else {
      setIsVisible(false);
    }
  }, [user]);

  // Listen for auth state changes to detect when email is verified
  useEffect(() => {
    if (!user) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const emailConfirmed = session.user.email_confirmed_at !== null && session.user.email_confirmed_at !== undefined;
        setIsVisible(!emailConfirmed);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [user]);

  const handleResendEmail = async () => {
    if (!user?.email) return;
    setIsLoading(true);
    setMessage('');

    try {
      // Try the resendEnrollmentEmail API (Supabase v2+)
      const { error } = await supabase.auth.resendEnrollmentEmail(user.email);
      if (error && !error.message?.includes('not found')) {
        throw error;
      }
      setMessage('Verification email sent! Check your inbox.');
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      console.error('Resend email error:', err);
      setMessage('That email didn’t send. Check your connection and try again.');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  const isError = message.startsWith('That email didn’t');

  return (
    <div className="ev-banner">
      <style>{`
        .ev-banner {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          background: var(--card);
          border: 1px solid var(--coral-text);
          border-radius: var(--radius-card);
          padding: 20px;
          margin: 0 20px 24px;
        }

        @media (min-width: 769px) {
          .ev-banner {
            max-width: 620px;
            margin: 0 auto 24px;
          }
        }

        .ev-banner-text {
          flex: 1;
          min-width: 0;
        }

        .ev-banner-label {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: var(--fs-button);
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--coral-text);
          margin: 0 0 8px;
        }

        .ev-banner-message {
          font-family: var(--font-body);
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-2);
          margin: 0;
        }

        .ev-banner-email {
          color: var(--text);
        }

        .ev-banner-status {
          font-family: var(--font-body);
          font-size: 15px;
          line-height: 1.5;
          margin: 8px 0 0;
        }

        .ev-banner-status--success {
          color: var(--mint-text);
        }

        .ev-banner-status--error {
          color: var(--coral-soft-text);
        }

        .ev-banner-actions {
          margin-top: 12px;
        }
      `}</style>

      <div className="ev-banner-text">
        <p className="ev-banner-label">Verify your email</p>
        <p className="ev-banner-message">
          We sent a verification link to <span className="ev-banner-email">{user?.email}</span>. Click it to confirm your email.
        </p>
        <div className="ev-banner-actions">
          <Button variant="outline" onClick={handleResendEmail} disabled={isLoading}>
            {isLoading ? 'Sending' : 'Resend email'}
          </Button>
        </div>
        {message && (
          <p className={`ev-banner-status ${isError ? 'ev-banner-status--error' : 'ev-banner-status--success'}`}>
            {message}
          </p>
        )}
      </div>
      <IconButton label="Dismiss banner" onClick={() => setIsVisible(false)} />
    </div>
  );
}
