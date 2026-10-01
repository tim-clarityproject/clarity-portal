import { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

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
      setMessage('Failed to resend email. Please try again.');
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isVisible) return null;

  const isError = message.startsWith('Failed');

  return (
    <div className="ev-banner">
      <style>{`
        .ev-banner {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          background: var(--surface);
          border: 1px solid var(--coral);
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
          color: var(--coral);
          margin: 0 0 8px;
        }

        .ev-banner-message {
          font-family: var(--font-body);
          font-size: 15px;
          line-height: 1.5;
          color: var(--text-2);
          margin: 0;
        }

        .ev-banner-message strong {
          color: var(--text);
          font-weight: 500;
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
          color: var(--coral-soft);
        }

        .ev-banner-actions {
          margin-top: 12px;
        }

        /* A global rule in src/styles/mobile.css, button:not(.breathe-button),
           targets every <button> with !important padding/min-height/font-size
           (specificity 0,1,1). A single class alone would not reliably beat
           that, so the dismiss control is scoped under .ui-root (the banner
           only ever renders inside a page that already carries that class)
           for (0,2,0) specificity, with matching !important. */
        .ui-root .ev-dismiss {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 44px !important;
          height: 44px;
          min-height: 44px !important;
          padding: 0 !important;
          background: transparent;
          border: none;
          color: var(--text-2);
          cursor: pointer;
        }

        .ui-root .ev-dismiss:hover,
        .ui-root .ev-dismiss:focus-visible {
          color: var(--text);
        }
      `}</style>

      <div className="ev-banner-text">
        <p className="ev-banner-label">Verify your email</p>
        <p className="ev-banner-message">
          We sent a verification link to <strong>{user?.email}</strong>. Click it to confirm your email.
        </p>
        <div className="ev-banner-actions">
          <button type="button" className="ui-btn-ghost" onClick={handleResendEmail} disabled={isLoading}>
            {isLoading ? 'Sending...' : 'Resend email'}
          </button>
        </div>
        {message && (
          <p className={`ev-banner-status ${isError ? 'ev-banner-status--error' : 'ev-banner-status--success'}`}>
            {message}
          </p>
        )}
      </div>
      <button type="button" className="ev-dismiss" onClick={() => setIsVisible(false)} aria-label="Dismiss banner">
        <X size={18} />
      </button>
    </div>
  );
}
