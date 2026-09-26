import { useState, useContext, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase, auth } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, isLoading, user } = useContext(AuthContext);

  // CSS for checkbox styling
  const checkboxStyles = `
    #terms {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      outline: none;
    }
    #terms:checked {
      background-color: #F08571;
      border-color: #F08571;
    }
    #terms:checked::after {
      content: '✓';
      color: white;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;
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
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDataStorageModal, setShowDataStorageModal] = useState(false);

  // Handle navigation state from CheckEmailConfirmation (Sign Up with Different Email)
  useEffect(() => {
    if (location.state?.signup) {
      setIsSignUp(true);
      setShowEmailModal(true);
    }
  }, [location.state]);


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
          // Email verification required - redirect to check-email-confirmation page
          navigate('/check-email-confirmation', { state: { email } });
        } else {
          // Login succeeded - always redirect to homepage
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
    <div style={{ height: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'row' }} className="mobile-responsive-row">
      <style>{checkboxStyles}</style>
      {/* Left Column - Welcome */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', backgroundColor: '#fafafa', borderRight: '1px solid #e5e5e5' }} className="mobile-responsive-column">
        <div style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '32px' }}>
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
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'black', margin: 0, marginBottom: '8px' }}>
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
                    width: '16px',
                    height: '16px',
                    marginTop: '2px',
                    cursor: 'pointer',
                    flexShrink: 0,
                    border: '2px solid #ccc',
                    borderRadius: '3px',
                    backgroundColor: 'white',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    outline: 'none',
                  }}
                />
                <label htmlFor="terms" style={{ fontSize: '13px', color: '#333', cursor: 'pointer', lineHeight: '1.5', margin: 0 }}>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#F08571',
                      textDecoration: 'underline',
                      fontWeight: '500',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Terms of Service
                  </button>
                  ,{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#F08571',
                      textDecoration: 'underline',
                      fontWeight: '500',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Privacy Policy
                  </button>
                  , and{' '}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setShowDataStorageModal(true); }}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#F08571',
                      textDecoration: 'underline',
                      fontWeight: '500',
                      cursor: 'pointer',
                      padding: 0,
                      font: 'inherit',
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Data Storage Notice
                  </button>
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

        </div>
      </div>

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 1000,
        }} onClick={() => setShowTermsModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            width: '100%',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: 'black' }}>Terms of Service</h2>
              <button onClick={() => setShowTermsModal(false)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999', padding: '0', width: '30px', height: '30px' }}>✕</button>
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>1. Acceptance of Terms</h3>
              <p>By accessing and using the Clarity Portal, you accept and agree to be bound by the terms and provision of this agreement.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>2. Use License</h3>
              <p>Permission is granted to temporarily download one copy of the materials for personal, non-commercial transitory viewing only.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>3. Disclaimer</h3>
              <p>The materials on the Clarity Portal are provided "as is". We make no warranties, expressed or implied.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>4. Governing Law</h3>
              <p>These terms and conditions are governed by the laws of the United Kingdom.</p>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 1000,
        }} onClick={() => setShowPrivacyModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            width: '100%',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: 'black' }}>Privacy Policy</h2>
              <button onClick={() => setShowPrivacyModal(false)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999', padding: '0', width: '30px', height: '30px' }}>✕</button>
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Information We Collect</h3>
              <p>We collect information you provide directly to us, such as name, email address, and profile information when you create an account.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>How We Use Your Information</h3>
              <p>We use the information we collect to provide, maintain, and improve our services; process your authentication; and comply with legal obligations.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Data Security</h3>
              <p>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Your Rights</h3>
              <p>You have the right to access, correct, or delete your personal data. Contact us to exercise these rights.</p>
            </div>
          </div>
        </div>
      )}

      {/* Data Storage Notice Modal */}
      {showDataStorageModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 1000,
        }} onClick={() => setShowDataStorageModal(false)}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
            width: '100%',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: 'black' }}>Data Storage Notice</h2>
              <button onClick={() => setShowDataStorageModal(false)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999', padding: '0', width: '30px', height: '30px' }}>✕</button>
            </div>
            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Data Storage Infrastructure</h3>
              <p>Your data is stored on Supabase, a secure, open-source backend-as-a-service platform built on PostgreSQL.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Types of Data Stored</h3>
              <p>Authentication data, decisions, reflections, strategic alignments, and account metadata are stored in your account.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Data Encryption</h3>
              <p>Your data is transmitted over encrypted connections (HTTPS/TLS). Passwords are hashed using industry-standard algorithms.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px', color: 'black' }}>Data Access Control</h3>
              <p>We implement Row-Level Security (RLS) policies to ensure each user can only access their own data.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
