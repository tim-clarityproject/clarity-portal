import { useState } from 'react';
import { auth } from '../lib/supabase';

export default function OAuthButtons() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleOAuth = async (provider) => {
    setIsLoading(true);
    setError('');
    try {
      if (provider === 'google') {
        await auth.signInWithGoogle();
      } else if (provider === 'facebook') {
        await auth.signInWithFacebook();
      }
    } catch (err) {
      setError(err.message || `Failed to sign in with ${provider}`);
      setIsLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <p style={{ color: '#d32f2f', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <button
          onClick={() => handleOAuth('google')}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: 'white',
            border: '2px solid #e5e5e5',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            color: '#333',
            transition: 'all 0.2s',
            opacity: isLoading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'white';
            }
          }}
        >
          {isLoading ? 'Loading...' : 'Google'}
        </button>

        <button
          onClick={() => handleOAuth('facebook')}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px 16px',
            backgroundColor: 'white',
            border: '2px solid #e5e5e5',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            color: '#333',
            transition: 'all 0.2s',
            opacity: isLoading ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              e.target.style.borderColor = '#F08571';
              e.target.style.backgroundColor = '#FEE5DE';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              e.target.style.borderColor = '#e5e5e5';
              e.target.style.backgroundColor = 'white';
            }
          }}
        >
          {isLoading ? 'Loading...' : 'Facebook'}
        </button>
      </div>
    </div>
  );
}
