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

  return (
    <div style={{
      backgroundColor: '#fffbf0',
      border: '1px solid #ffe5cc',
      borderRadius: '6px',
      padding: '12px 16px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '12px',
      marginBottom: '16px',
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: '13px', color: '#333', margin: '0 0 6px 0', fontWeight: '600' }}>
          Verify your email
        </p>
        <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
          We sent a verification link to <strong>{user?.email}</strong>. Click it to confirm your email.{' '}
          <button
            onClick={handleResendEmail}
            disabled={isLoading}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F08571',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              padding: '0',
              textDecoration: 'underline',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {isLoading ? 'Sending...' : 'Resend email'}
          </button>
        </p>
        {message && (
          <p style={{ fontSize: '12px', color: '#F08571', margin: '6px 0 0 0', fontWeight: '500' }}>
            {message}
          </p>
        )}
      </div>
      <button
        onClick={() => setIsVisible(false)}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: '#999',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title="Dismiss banner"
      >
        <X size={18} />
      </button>
    </div>
  );
}
