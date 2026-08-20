import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase, auth } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function CreateAccount() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signup } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const handleOAuthSignUp = async (provider) => {
    try {
      setError('');
      if (provider === 'google') {
        await auth.signInWithGoogle();
      }
    } catch (err) {
      setError(err.message || `Failed to sign up with ${provider}`);
    }
  };

  // Guest data from previous session
  const guestFormData = location.state || {};

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required');
      return;
    }

    if (!termsAccepted) {
      setError('Please accept the Terms of Service to continue');
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

    setIsLoading(true);
    try {
      const success = await signup(email, password);
      if (success) {
        // Set terms as accepted for email signups (they checked the box)
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ first_name: firstName, last_name: lastName, terms_accepted: true })
              .eq('id', user.id);
          }
        } catch (profileErr) {
          console.error('Error updating profile:', profileErr);
        }

        // Show verification email message
        setVerificationEmailSent(true);
        setFirstName('');
        setLastName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setTermsAccepted(false);
      } else {
        setError('Failed to create account');
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <HomeHeader isGuest={true} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '48px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '16px' }}>
              Create Your Account
            </h1>
            <p style={{ color: '#999', fontSize: '14px' }}>
              Save your progress and continue your work
            </p>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 16px', backgroundColor: '#FEE5DE', borderRadius: '8px', color: '#C0574C', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {verificationEmailSent && (
            <div style={{
              marginBottom: '16px',
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

          {!verificationEmailSent && (
            <>
              <div style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={() => handleOAuthSignUp('google')}
                  style={{
                    width: '100%',
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
                  Sign up with Google
                </button>
              </div>

              <div style={{ textAlign: 'center', marginBottom: '24px', fontSize: '14px', color: '#999' }}>
                or
              </div>

              <div style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowEmailForm(!showEmailForm)}
                  style={{
                    width: '100%',
                    padding: '12px 24px',
                    backgroundColor: showEmailForm ? '#FEE5DE' : '#fff',
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
                    if (!showEmailForm) e.target.style.backgroundColor = '#FEE5DE';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#e5e5e5';
                    if (!showEmailForm) e.target.style.backgroundColor = '#fff';
                  }}
                >
                  Sign up with Email
                </button>
              </div>
            </>
          )}

          {!verificationEmailSent && showEmailForm && (
          <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slideDown 0.2s ease-out', marginBottom: '12px' }}>
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

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              backgroundColor: '#fafafa',
              borderRadius: '8px',
              border: '1px solid #e5e5e5',
            }}>
              <input
                type="checkbox"
                id="terms"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                style={{
                  width: '20px',
                  height: '20px',
                  cursor: 'pointer',
                  accentColor: '#F08571',
                  flexShrink: 0,
                  margin: 0,
                }}
              />
              <label htmlFor="terms" style={{ fontSize: '13px', color: '#333', cursor: 'pointer', margin: 0, flex: 1 }}>
                I agree to the terms
              </label>
              <button
                type="button"
                onClick={() => setShowTermsModal(true)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#F08571',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
              >
                Review Terms
              </button>
            </div>

            <button
              type="submit"
              disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !termsAccepted || isLoading}
              style={{
                padding: '16px 32px',
                backgroundColor: (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !termsAccepted || isLoading) ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !termsAccepted || isLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontSize: '14px',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !termsAccepted || isLoading) || (e.target.style.backgroundColor = '#e07560')}
              onMouseLeave={(e) => (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !termsAccepted || isLoading) || (e.target.style.backgroundColor = '#F08571')}
            >
              {isLoading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
          )}

          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/welcome', { state: location.state })}
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
              Back to portal
            </button>
          </div>

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
            }}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '600px',
                maxHeight: '80vh',
                overflowY: 'auto',
                width: '100%',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, color: 'black' }}>Review Terms</h2>
                  <button
                    onClick={() => setShowTermsModal(false)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      fontSize: '24px',
                      cursor: 'pointer',
                      color: '#999',
                      padding: '0',
                      width: '30px',
                      height: '30px',
                    }}
                  >
                    ✕
                  </button>
                </div>

                {['Terms of Service', 'Privacy Policy', 'Data Storage Notice'].map((title) => (
                  <div key={title} style={{ marginBottom: '12px', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
                    <button
                      onClick={() => setExpandedSection(expandedSection === title ? null : title)}
                      style={{
                        width: '100%',
                        padding: '14px',
                        backgroundColor: expandedSection === title ? '#FEE5DE' : '#fafafa',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontWeight: '600',
                        fontSize: '13px',
                        color: '#333',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#FEE5DE'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = expandedSection === title ? '#FEE5DE' : '#fafafa'}
                    >
                      {title}
                      <span style={{ fontSize: '14px', transition: 'transform 0.2s', transform: expandedSection === title ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        ▼
                      </span>
                    </button>
                    {expandedSection === title && (
                      <div style={{ padding: '14px', backgroundColor: 'white', borderTop: '1px solid #e5e5e5', color: '#333', lineHeight: '1.5', fontSize: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                        {title === 'Terms of Service' && (
                          <div>
                            <p style={{ marginBottom: '12px' }}><strong>1. Acceptance of Terms</strong><br/>By accessing and using the Clarity Portal, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>
                            <p style={{ marginBottom: '12px' }}><strong>2. Use License</strong><br/>Permission is granted to temporarily download one copy of the materials for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:<br/>• Modify or copy the materials<br/>• Use the materials for any commercial purpose<br/>• Attempt to decompile or reverse engineer any software<br/>• Remove any copyright or other proprietary notations<br/>• Transfer the materials to another person or server</p>
                            <p style={{ marginBottom: '12px' }}><strong>3. Disclaimer</strong><br/>The materials on the Clarity Portal are provided "as is". We make no warranties, expressed or implied, and hereby disclaim all other warranties.</p>
                            <p style={{ marginBottom: '12px' }}><strong>4. Limitations</strong><br/>In no event shall The Clarity Project or its suppliers be liable for any damages arising out of the use or inability to use the materials.</p>
                            <p style={{ marginBottom: '12px' }}><strong>5. Accuracy of Materials</strong><br/>Materials appearing on the portal could include errors. The Clarity Project may make changes at any time without notice.</p>
                            <p><strong>6. Governing Law</strong><br/>These terms and conditions are governed by and construed in accordance with the laws of the United Kingdom.</p>
                          </div>
                        )}
                        {title === 'Privacy Policy' && (
                          <div>
                            <p style={{ marginBottom: '12px' }}><strong>Information We Collect</strong><br/>We collect information you provide directly to us, such as when you create an account, including name, email address, and profile information.</p>
                            <p style={{ marginBottom: '12px' }}><strong>How We Use Your Information</strong><br/>We use the information we collect to:<br/>• Provide, maintain, and improve our services<br/>• Send you technical notices and support messages<br/>• Respond to your comments and questions<br/>• Comply with legal obligations</p>
                            <p style={{ marginBottom: '12px' }}><strong>Data Security</strong><br/>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.</p>
                            <p style={{ marginBottom: '12px' }}><strong>Your Rights</strong><br/>You have the right to access, correct, or delete your personal data. Contact us at support@clarityproject.org to exercise these rights.</p>
                            <p><strong>Changes to This Policy</strong><br/>We may update this Privacy Policy from time to time. Your continued use of the Clarity Portal indicates your acceptance of any changes.</p>
                          </div>
                        )}
                        {title === 'Data Storage Notice' && (
                          <div>
                            <p style={{ marginBottom: '12px' }}><strong>Where Your Data Is Stored</strong><br/>Your personal data and portal activity are stored on Supabase servers located in the United States. By using the Clarity Portal, you consent to your data being processed and stored in the United States.</p>
                            <p style={{ marginBottom: '12px' }}><strong>Data Retention</strong><br/>We retain your personal data for as long as your account is active. You can request deletion of your account and associated data at any time.</p>
                            <p style={{ marginBottom: '12px' }}><strong>Data Access</strong><br/>Your data is protected by row-level security policies that ensure only you can access your own information.</p>
                            <p style={{ marginBottom: '12px' }}><strong>International Data Transfer</strong><br/>If you are located outside the United States, your personal data will be transferred to, stored in, and processed in the United States.</p>
                            <p><strong>Questions?</strong><br/>For questions about how we store and process your data, please contact support@clarityproject.org.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => setShowTermsModal(false)}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '12px',
                    backgroundColor: '#F08571',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#e07560'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#F08571'}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
