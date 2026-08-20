import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function TermsAcceptance() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAcceptTerms = async () => {
    if (!user) return;

    setIsAccepting(true);
    try {
      // Save to localStorage as fallback
      localStorage.setItem(`terms_${user.id}`, 'true');

      // Try to update database
      try {
        await supabase
          .from('profiles')
          .update({ terms_accepted: true })
          .eq('id', user.id);
      } catch (dbError) {
        console.warn('Could not save to database, using localStorage fallback:', dbError);
      }

      navigate('/welcome');
    } catch (error) {
      console.error('Error accepting terms:', error);
      alert('Failed to accept terms. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 32px' }}>
        <div style={{ width: '100%', maxWidth: '600px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '24px' }}>
            Welcome to The Clarity Portal
          </h1>

          <div style={{
            backgroundColor: '#fafafa',
            borderRadius: '12px',
            border: '1px solid #e5e5e5',
            padding: '24px',
            marginBottom: '32px',
            maxHeight: '400px',
            overflowY: 'auto',
          }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', marginTop: 0 }}>
              Terms & Conditions
            </h2>
            <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#333', marginBottom: '12px' }}>
              By using The Clarity Portal, you agree to:
            </p>
            <ul style={{ fontSize: '13px', lineHeight: '1.6', color: '#333', marginLeft: '20px' }}>
              <li style={{ marginBottom: '8px' }}>Comply with our Terms of Service</li>
              <li style={{ marginBottom: '8px' }}>Accept our Privacy Policy</li>
              <li style={{ marginBottom: '8px' }}>Acknowledge our Data Storage Notice</li>
              <li style={{ marginBottom: '8px' }}>Use this service lawfully and ethically</li>
              <li>Respect the intellectual property rights of The Clarity Project</li>
            </ul>

            <p style={{ fontSize: '13px', lineHeight: '1.6', color: '#666', marginTop: '16px', marginBottom: 0 }}>
              For complete details, please review our{' '}
              <a href={`${window.location.origin}/terms-of-service`} target="_blank" rel="noopener noreferrer" style={{ color: '#F08571', textDecoration: 'none', fontWeight: '500' }}>
                Terms of Service
              </a>
              ,{' '}
              <a href={`${window.location.origin}/privacy-policy`} target="_blank" rel="noopener noreferrer" style={{ color: '#F08571', textDecoration: 'none', fontWeight: '500' }}>
                Privacy Policy
              </a>
              , and{' '}
              <a href={`${window.location.origin}/data-storage-notice`} target="_blank" rel="noopener noreferrer" style={{ color: '#F08571', textDecoration: 'none', fontWeight: '500' }}>
                Data Storage Notice
              </a>
              .
            </p>
          </div>

          <button
            onClick={handleAcceptTerms}
            disabled={isAccepting}
            style={{
              width: '100%',
              padding: '16px 32px',
              backgroundColor: isAccepting ? '#ccc' : '#F08571',
              color: 'white',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '8px',
              cursor: isAccepting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => !isAccepting && (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !isAccepting && (e.target.style.backgroundColor = '#F08571')}
          >
            {isAccepting ? 'Accepting...' : 'I Accept Terms & Conditions'}
          </button>
        </div>
      </div>
    </div>
  );
}
