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
            <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>1. Acceptance of Terms</h3>
              <p style={{ marginBottom: '16px' }}>By accessing and using the Clarity Portal, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>2. Use License</h3>
              <p style={{ marginBottom: '12px' }}>Permission is granted to temporarily download one copy of the materials (information or software) on the Clarity Portal for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or for any public display</li>
                <li>Attempt to decompile or reverse engineer any software contained on the portal</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
                <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
              </ul>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>3. Disclaimer</h3>
              <p style={{ marginBottom: '16px' }}>The materials on the Clarity Portal are provided "as is". We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>4. Limitations</h3>
              <p style={{ marginBottom: '16px' }}>In no event shall The Clarity Project or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on the Clarity Portal.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>5. Accuracy of Materials</h3>
              <p style={{ marginBottom: '16px' }}>The materials appearing on the Clarity Portal could include technical, typographical, or photographic errors. The Clarity Project does not warrant that any of the materials on the portal are accurate, complete, or current. The Clarity Project may make changes to the materials contained on the portal at any time without notice.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>6. Links</h3>
              <p style={{ marginBottom: '16px' }}>The Clarity Project has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by The Clarity Project of the site. Use of any such linked website is at the user's own risk.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>7. Modifications</h3>
              <p style={{ marginBottom: '16px' }}>The Clarity Project may revise these terms of service for the portal at any time without notice. By using this portal, you are agreeing to be bound by the then current version of these terms of service.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>8. Governing Law</h3>
              <p style={{ marginBottom: '16px' }}>These terms and conditions are governed by and construed in accordance with the laws of the United Kingdom, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.</p>

              <p style={{ color: '#999', fontSize: '12px', marginTop: '20px' }}>Last updated: August 2026</p>
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
            <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>1. Introduction</h3>
              <p style={{ marginBottom: '16px' }}>The Clarity Project ("we," "us," "our," or "Company") respects the privacy of our users ("user" or "you"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services, including the Clarity Portal.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>2. Information We Collect</h3>
              <p style={{ marginBottom: '12px' }}>We may collect information about you in a variety of ways. The information we may collect on the site includes:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>Personal Data:</strong> Email address, name, and authentication credentials when you create an account</li>
                <li><strong>User-Generated Content:</strong> Decisions, reflections, journal entries, and other content you create within the portal</li>
                <li><strong>Usage Data:</strong> Information about how you interact with our services, including pages visited, time spent, and features used</li>
                <li><strong>Device Information:</strong> Information about your device, browser, and IP address</li>
              </ul>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>3. How We Use Your Information</h3>
              <p style={{ marginBottom: '12px' }}>We use the information we collect to:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li>Provide, maintain, and improve our services</li>
                <li>Process your authentication and maintain your account</li>
                <li>Store and sync your data across devices</li>
                <li>Communicate with you about service updates</li>
                <li>Monitor and analyze service usage and trends</li>
                <li>Detect and prevent fraudulent activity</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>4. Data Storage and Security</h3>
              <p style={{ marginBottom: '16px' }}>Your data is stored securely using Supabase, a secure cloud database platform. We implement industry-standard security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>5. Data Retention</h3>
              <p style={{ marginBottom: '16px' }}>We retain your personal data for as long as your account is active or as needed to provide you with our services. You may request deletion of your account and associated data at any time by contacting us. Some data may be retained as required by law or for legitimate business purposes.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>6. Third-Party Services</h3>
              <p style={{ marginBottom: '16px' }}>Our services may contain links to third-party websites and services that are not operated by us. This Privacy Policy does not apply to third-party services, and we are not responsible for their privacy practices. We encourage you to review their privacy policies before providing any information.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>7. Your Rights</h3>
              <p style={{ marginBottom: '12px' }}>Depending on your location, you may have the following rights:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li>The right to access your personal data</li>
                <li>The right to correct inaccurate data</li>
                <li>The right to request deletion of your data</li>
                <li>The right to restrict processing of your data</li>
                <li>The right to data portability</li>
              </ul>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>8. Children's Privacy</h3>
              <p style={{ marginBottom: '16px' }}>The Clarity Portal is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will take steps to delete such information and terminate the child's account.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>9. Contact Us</h3>
              <p style={{ marginBottom: '16px' }}>If you have questions about this Privacy Policy or our privacy practices, please contact us at:</p>
              <p style={{ marginBottom: '16px' }}>The Clarity Project<br />Email: privacy@theclarityproject.co.uk</p>

              <p style={{ color: '#999', fontSize: '12px', marginTop: '20px' }}>Last updated: August 2026</p>
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
            <div style={{ fontSize: '14px', lineHeight: '1.8', color: '#333' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>Overview</h3>
              <p style={{ marginBottom: '16px' }}>This Data Storage Notice explains how the Clarity Portal stores and manages your data. By using the Clarity Portal, you acknowledge that you understand and agree to the data storage practices outlined below.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>1. Data Storage Infrastructure</h3>
              <p style={{ marginBottom: '16px' }}>Your data is stored on Supabase, a secure, open-source backend-as-a-service platform built on PostgreSQL. Supabase provides enterprise-grade security and reliability for data storage and management.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>2. Types of Data Stored</h3>
              <p style={{ marginBottom: '12px' }}>The following types of data are stored in your account:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li><strong>Authentication Data:</strong> Email address, hashed password, and session tokens</li>
                <li><strong>Decisions:</strong> GROW model decisions and Inversion model decisions with all associated form data</li>
                <li><strong>Reflections:</strong> Journal entries and reflections you create</li>
                <li><strong>Strategic Alignments:</strong> Team planning and alignment data</li>
                <li><strong>Account Metadata:</strong> Name, profile information, and preferences</li>
              </ul>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>3. Data Encryption</h3>
              <p style={{ marginBottom: '16px' }}>Your data is transmitted over encrypted connections (HTTPS/TLS) to and from our servers. Sensitive data including passwords are hashed using industry-standard algorithms before storage. Supabase employs encryption for data at rest.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>4. Data Access Control</h3>
              <p style={{ marginBottom: '16px' }}>We implement Row-Level Security (RLS) policies to ensure that each user can only access their own data. Only authenticated users can view, edit, or delete their personal data. Your data is never shared with other users unless you explicitly choose to share it.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>5. Session Management</h3>
              <p style={{ marginBottom: '16px' }}>When you log in to the Clarity Portal, we create a secure session that lasts for up to 30 days. Your session is stored in your browser's local storage and synced with our servers. You can log out at any time to end your session immediately.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>6. Data Backup and Recovery</h3>
              <p style={{ marginBottom: '16px' }}>Supabase maintains regular backups of all data to ensure recovery in case of unforeseen circumstances. These backups are stored securely and are subject to the same security measures as live data.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>7. Data Deletion</h3>
              <p style={{ marginBottom: '16px' }}>You may request deletion of your account and all associated data at any time. Upon deletion, your personal data will be permanently removed from our systems within 30 days. Some data may be retained for compliance or legal purposes as required by law.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>8. Third-Party Providers</h3>
              <p style={{ marginBottom: '12px' }}>We use the following third-party services to store and manage your data:</p>
              <ul style={{ marginLeft: '20px', marginBottom: '12px' }}>
                <li><strong>Supabase:</strong> Database and authentication services</li>
                <li><strong>Vercel:</strong> Application hosting and deployment</li>
                <li><strong>Google:</strong> OAuth authentication provider</li>
              </ul>
              <p style={{ marginBottom: '16px' }}>These providers are bound by confidentiality agreements and are only allowed to use your data for the purposes specified in this notice.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>9. Data Transfer</h3>
              <p style={{ marginBottom: '16px' }}>You can export your data at any time by requesting a copy from your account settings. This data will be provided in a standard format that you can use with other applications.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>10. Changes to This Notice</h3>
              <p style={{ marginBottom: '16px' }}>We may update this Data Storage Notice from time to time. Changes will be effective immediately upon posting to the website. Your continued use of the Clarity Portal constitutes acceptance of any changes to this notice.</p>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '12px', color: 'black' }}>11. Contact Us</h3>
              <p style={{ marginBottom: '16px' }}>If you have questions about this Data Storage Notice, please contact us at:<br />The Clarity Project<br />Email: data@theclarityproject.co.uk</p>

              <p style={{ color: '#999', fontSize: '12px', marginTop: '20px' }}>Last updated: August 2026</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
