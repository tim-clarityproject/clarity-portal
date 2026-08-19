import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
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

  // Guest data from previous session
  const guestFormData = location.state || {};

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required');
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
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          await supabase
            .from('profiles')
            .update({ first_name: firstName, last_name: lastName })
            .eq('id', user.id);
        }

        navigate('/welcome', { state: { ...guestFormData, isGuest: false, email } });
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

          <form onSubmit={handleCreateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

            <button
              type="submit"
              disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || isLoading}
              style={{
                padding: '16px 32px',
                backgroundColor: (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || isLoading) ? '#ccc' : '#F08571',
                color: 'white',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '8px',
                cursor: (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || isLoading) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontSize: '14px',
                marginTop: '8px',
              }}
              onMouseEnter={(e) => (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || isLoading) || (e.target.style.backgroundColor = '#e07560')}
              onMouseLeave={(e) => (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || isLoading) || (e.target.style.backgroundColor = '#F08571')}
            >
              {isLoading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

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
        </div>
      </div>
    </div>
  );
}
