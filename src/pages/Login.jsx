import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const { login, signup, isLoading } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && (!firstName.trim() || !lastName.trim())) {
      setError('Please enter your first and last name');
      return;
    }

    try {
      const success = isSignUp
        ? await signup(email, password)
        : await login(email, password);

      if (success) {
        if (isSignUp) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ first_name: firstName, last_name: lastName })
              .eq('id', user.id);
          }
        }
        navigate('/welcome');
      } else {
        setError(isSignUp ? 'Failed to create account' : 'Invalid email or password');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'row' }}>
      {/* Left Column - Welcome */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', backgroundColor: '#fafafa', borderRight: '1px solid #e5e5e5' }}>
        <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
            Welcome to The Clarity Portal
          </h1>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              marginBottom: '32px',
            }}
          >
            <span style={{ color: '#999', fontSize: '13px' }}>Created by</span>
            <a
              href="https://theclarityproject.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
                marginLeft: '-12px',
              }}
              onMouseEnter={(e) => e.target.style.opacity = '1'}
              onMouseLeave={(e) => e.target.style.opacity = '0.9'}
            >
              <img
                src="/clarity-logo.png"
                alt="The Clarity Project"
                style={{
                  height: '67px',
                  width: 'auto',
                  display: 'block',
                  opacity: 0.9,
                }}
              />
            </a>
          </div>
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Login/Signup Form */}
          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
              {isSignUp ? 'Create Account' : 'Login'}
            </h2>
            {error && (
              <p style={{ color: '#d32f2f', fontSize: '13px', marginTop: '8px' }}>
                {error}
              </p>
            )}
          </div>

          {isSignUp && (
            <>
              {/* Social Login - Only for Signup */}
              <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  type="button"
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#fff',
                    border: '2px solid #e5e5e5',
                    borderRadius: '8px',
                    color: '#333',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#F08571';
                    e.target.style.backgroundColor = '#FEE5DE';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#e5e5e5';
                    e.target.style.backgroundColor = '#fff';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Google
                </button>

                <button
                  type="button"
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#fff',
                    border: '2px solid #e5e5e5',
                    borderRadius: '8px',
                    color: '#333',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '14px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#F08571';
                    e.target.style.backgroundColor = '#FEE5DE';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#e5e5e5';
                    e.target.style.backgroundColor = '#fff';
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
                  </svg>
                  Facebook
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e5e5' }} />
                <span style={{ color: '#999', fontSize: '12px' }}>or</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e5e5' }} />
              </div>
            </>
          )}


          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isSignUp && (
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

            <button
              type="submit"
              disabled={!email.trim() || !password.trim() || isLoading}
              style={{
                padding: '16px 32px',
                backgroundColor: (!email.trim() || !password.trim() || isLoading) ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: (!email.trim() || !password.trim() || isLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontSize: '14px',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (!email.trim() || !password.trim() || isLoading) || (e.target.style.backgroundColor = '#e07560')}
              onMouseLeave={(e) => (!email.trim() || !password.trim() || isLoading) || (e.target.style.backgroundColor = '#F08571')}
            >
              {isLoading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Login')}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#F08571',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.color = '#e07560'}
              onMouseLeave={(e) => e.target.style.color = '#F08571'}
            >
              {isSignUp ? 'Already have an account? Login' : "Don't have an account? Sign up"}
            </button>
          </div>

          <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e5e5e5' }}>
            <p style={{ color: '#999', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>
              Or continue as
            </p>
            <button
              type="button"
              onClick={() => navigate('/welcome', { state: { isGuest: true } })}
              style={{
                width: '100%',
                padding: '12px 24px',
                backgroundColor: 'transparent',
                border: '2px solid #5ECCC0',
                borderRadius: '8px',
                color: '#5ECCC0',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#5ECCC0';
                e.target.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#5ECCC0';
              }}
            >
              Guest User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
