import { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase, auth } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const { login, signup, isLoading, user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [error, setError] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);


  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (isSignUp && showEmailModal && (!firstName.trim() || !lastName.trim())) {
      setError('Please enter your first and last name');
      return;
    }

    if (isSignUp && showEmailModal && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (isSignUp && showEmailModal && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (isSignUp && !termsAccepted) {
      setError('Please accept the Terms of Service to continue');
      return;
    }

    try {
      const result = isSignUp
        ? await signup(email, password, firstName, lastName)
        : await login(email, password);

      if (result.success) {
        if (isSignUp) {
          // No email verification needed - redirect to onboarding mission
          navigate('/onboarding-mission', { state: { isNewSignup: true } });
        } else {
          // Login succeeded, redirect to welcome
          navigate('/welcome');
        }
      } else {
        // Display specific error message from auth function
        setError(result.error || (isSignUp ? 'Failed to create account. Please try again.' : 'Invalid email or password. Please check and try again.'));
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    }
  };

  return (
    <div style={{ minHeight: '100vh', paddingTop: '70px', backgroundColor: 'white', display: 'flex', flexDirection: 'row' }} className="mobile-responsive-row">
      {/* Left Column - Welcome */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', backgroundColor: '#fafafa', borderRight: '1px solid #e5e5e5' }} className="mobile-responsive-column">
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
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }} className="mobile-responsive-column">
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Login/Signup Form */}
          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', marginBottom: '8px' }}>
              {isSignUp ? 'Create Account' : 'Login'}
            </h2>
            {error && (
              <p style={{ color: '#F08571', fontSize: '13px', marginTop: '8px' }}>
                {error}
              </p>
            )}
            {verificationEmailSent && (
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                backgroundColor: '#e8f5e9',
                borderRadius: '8px',
                border: '1px solid #4caf50'
              }}>
                <p style={{ color: '#2e7d32', fontSize: '13px', margin: 0, fontWeight: '500' }}>
                  ✓ Account created! Check your email for a verification link to complete signup.
                </p>
              </div>
            )}
          </div>

          {/* Email signup option for signup mode */}
          {!showEmailModal && isSignUp && (
            <>
              <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
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
                        e.target.style.backgroundColor = '#f9f9f9';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.borderColor = '#e5e5e5';
                        e.target.style.backgroundColor = '#fff';
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M22 6l-10 7L2 6" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Sign up with Email
                    </button>
              </div>
            </>
          )}


          {(!isSignUp || showEmailModal) && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isSignUp && showEmailModal && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Type here"
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
                    placeholder="Type here"
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
                placeholder="Type here"
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
                placeholder="Type here"
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

            {isSignUp && showEmailModal && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#333', fontWeight: '500' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type here"
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

            {isSignUp && showEmailModal && (
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 16px',
                backgroundColor: '#fafafa',
                borderRadius: '8px',
                border: '1px solid #e5e5e5',
                transition: 'all 0.2s',
              }}>
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{
                    width: '20px',
                    height: '20px',
                    marginTop: '0px',
                    cursor: 'pointer',
                    accentColor: '#F08571',
                    flexShrink: 0,
                    border: '2px solid #e5e5e5',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#F08571';
                    e.target.style.boxShadow = '0 0 0 3px rgba(240, 133, 113, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = e.target.checked ? '#F08571' : '#e5e5e5';
                    e.target.style.boxShadow = 'none';
                  }}
                />
                <label htmlFor="terms" style={{ fontSize: '13px', color: '#333', cursor: 'pointer', lineHeight: '1.5', margin: 0 }}>
                  I agree to the{' '}
                  <a
                    href={`${window.location.origin}/terms-of-service`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#F08571',
                      textDecoration: 'none',
                      fontWeight: '500',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Terms of Service
                  </a>
                  ,{' '}
                  <a
                    href={`${window.location.origin}/privacy-policy`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#F08571',
                      textDecoration: 'none',
                      fontWeight: '500',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Privacy Policy
                  </a>
                  , and{' '}
                  <a
                    href={`${window.location.origin}/data-storage-notice`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#F08571',
                      textDecoration: 'none',
                      fontWeight: '500',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Data Storage Notice
                  </a>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={!email.trim() || !password.trim() || isLoading || (isSignUp && showEmailModal && !termsAccepted)}
              style={{
                padding: '16px 32px',
                backgroundColor: (!email.trim() || !password.trim() || isLoading || (isSignUp && showEmailModal && !termsAccepted)) ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: (!email.trim() || !password.trim() || isLoading || (isSignUp && showEmailModal && !termsAccepted)) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontSize: '14px',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (!email.trim() || !password.trim() || isLoading || (isSignUp && showEmailModal && !termsAccepted)) || (e.target.style.backgroundColor = '#e07560')}
              onMouseLeave={(e) => (!email.trim() || !password.trim() || isLoading || (isSignUp && showEmailModal && !termsAccepted)) || (e.target.style.backgroundColor = '#F08571')}
            >
              {isLoading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Login')}
            </button>

            {isSignUp && showEmailModal && (
              <button
                type="button"
                onClick={() => {
                  setShowEmailModal(false);
                  setFirstName('');
                  setLastName('');
                  setEmail('');
                  setPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'transparent',
                  border: '2px solid #e5e5e5',
                  borderRadius: '8px',
                  color: '#333',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = '#F08571';
                  e.target.style.backgroundColor = '#f9f9f9';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = '#e5e5e5';
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                Back
              </button>
            )}
          </form>
          )}

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

          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e5e5', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/welcome', { state: { isGuest: true } })}
              style={{
                backgroundColor: 'transparent',
                border: '2px solid #e5e5e5',
                borderRadius: '8px',
                color: '#333',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '12px 24px',
                transition: 'all 0.2s',
                width: '100%',
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#F08571';
                e.target.style.backgroundColor = '#f9f9f9';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#e5e5e5';
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              Continue as Guest
            </button>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>
              Explore the tools without creating an account
            </p>
          </div>

          <div style={{ marginTop: '32px', paddingTop: '32px', borderTop: '1px solid #e5e5e5', textAlign: 'center' }}>
            <p style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
              <a
                href={`${window.location.origin}/terms-of-service`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#F08571', textDecoration: 'none', marginRight: '16px' }}
              >
                Terms
              </a>
              <a
                href={`${window.location.origin}/privacy-policy`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#F08571', textDecoration: 'none', marginRight: '16px' }}
              >
                Privacy
              </a>
              <a
                href={`${window.location.origin}/data-storage-notice`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#F08571', textDecoration: 'none' }}
              >
                Data Storage
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
