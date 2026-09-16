import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, signup, isLoading, user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (user && !isLoading) {
      navigate('/welcome');
    }
  }, [user, isLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Please enter your first and last name');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (!termsAccepted) {
        setError('Please accept the Terms of Service');
        return;
      }
    }

    try {
      const success = isSignUp
        ? await signup(email, password)
        : await login(email, password);

      if (success) {
        if (!isSignUp) {
          navigate('/welcome');
        } else {
          setEmail('');
          setPassword('');
          setFirstName('');
          setLastName('');
          setConfirmPassword('');
          setError('Account created! Please log in.');
          setIsSignUp(false);
        }
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9f9f9', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '500px' }}>
        <div style={{ marginBottom: '40px', textAlign: 'left' }}>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', margin: '0 0 20px 0', color: '#333' }}>
            {isSignUp ? 'Create Account' : 'Login'}
          </h1>
          <p style={{ fontSize: '16px', color: '#666', margin: '0 0 20px 0' }}>
            Welcome to The Clarity Portal
          </p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee5de', borderLeft: '4px solid #F08571', padding: '16px', marginBottom: '24px', borderRadius: '4px' }}>
            <p style={{ color: '#F08571', fontSize: '14px', margin: '0' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isSignUp && (
            <>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
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
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
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
              </div>
            </>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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

          {isSignUp && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
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
          )}

          {isSignUp && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{ marginTop: '4px', cursor: 'pointer' }}
              />
              <label htmlFor="terms" style={{ fontSize: '14px', color: '#666', cursor: 'pointer' }}>
                I accept the{' '}
                <a href="/terms-of-service" style={{ color: '#F08571', textDecoration: 'none' }}>
                  Terms of Service
                </a>
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '12px 24px',
              backgroundColor: isLoading ? '#ccc' : '#F08571',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginTop: '8px',
            }}
          >
            {isLoading ? 'Loading...' : isSignUp ? 'Create Account' : 'Login'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#F08571',
              fontSize: '14px',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign up"}
          </button>
        </div>

        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
          <a href="/terms-of-service" style={{ color: '#F08571', textDecoration: 'none', marginRight: '16px' }}>
            Terms
          </a>
          <a href="/privacy-policy" style={{ color: '#F08571', textDecoration: 'none', marginRight: '16px' }}>
            Privacy
          </a>
          <a href="/data-storage-notice" style={{ color: '#F08571', textDecoration: 'none' }}>
            Data Storage
          </a>
        </div>
      </div>
    </div>
  );
}
