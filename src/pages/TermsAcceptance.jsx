import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function ReviewAcceptTerms() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isAccepting, setIsAccepting] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  const handleAcceptTerms = async () => {
    if (!user) return;

    setIsAccepting(true);
    try {
      localStorage.setItem(`terms_${user.id}`, 'true');

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

  const ExpandableSection = ({ title, children }) => (
    <div style={{ marginBottom: '16px', borderRadius: '8px', border: '1px solid #e5e5e5', overflow: 'hidden' }}>
      <button
        onClick={() => setExpandedSection(expandedSection === title ? null : title)}
        style={{
          width: '100%',
          padding: '16px',
          backgroundColor: expandedSection === title ? '#FEE5DE' : '#fafafa',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: '600',
          fontSize: '14px',
          color: '#333',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#FEE5DE'}
        onMouseLeave={(e) => e.target.style.backgroundColor = expandedSection === title ? '#FEE5DE' : '#fafafa'}
      >
        {title}
        <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: expandedSection === title ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {expandedSection === title && (
        <div style={{ padding: '16px', backgroundColor: 'white', borderTop: '1px solid #e5e5e5', color: '#333', lineHeight: '1.6', fontSize: '13px' }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader />

      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 32px' }}>
        <div style={{ width: '100%', maxWidth: '700px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '12px' }}>
            Review & Accept Terms
          </h1>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '32px' }}>
            Please review our legal documents below before continuing.
          </p>

          <ExpandableSection title="Terms of Service">
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '0', marginBottom: '12px' }}>1. Acceptance of Terms</h3>
              <p style={{ marginBottom: '12px' }}>By accessing and using the Clarity Portal, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>2. Use License</h3>
              <p style={{ marginBottom: '8px' }}>Permission is granted to temporarily download one copy of the materials for personal, non-commercial transitory viewing only.</p>
              <ul style={{ marginLeft: '16px', marginBottom: '12px' }}>
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose</li>
                <li>Attempt to decompile or reverse engineer any software</li>
                <li>Remove any copyright or other proprietary notations</li>
                <li>Transfer the materials to another person or server</li>
              </ul>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>3. Disclaimer</h3>
              <p style={{ marginBottom: '12px' }}>The materials on the Clarity Portal are provided "as is". We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>4. Limitations</h3>
              <p style={{ marginBottom: '12px' }}>In no event shall The Clarity Project or its suppliers be liable for any damages arising out of the use or inability to use the materials on the portal.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>5. Accuracy of Materials</h3>
              <p style={{ marginBottom: '12px' }}>Materials appearing on the portal could include errors. The Clarity Project may make changes at any time without notice.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>6. Governing Law</h3>
              <p>These terms and conditions are governed by and construed in accordance with the laws of the United Kingdom.</p>
            </div>
          </ExpandableSection>

          <ExpandableSection title="Privacy Policy">
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '0', marginBottom: '12px' }}>Information We Collect</h3>
              <p style={{ marginBottom: '12px' }}>We collect information you provide directly to us, such as when you create an account, including name, email address, and profile information.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>How We Use Your Information</h3>
              <p style={{ marginBottom: '12px' }}>We use the information we collect to:</p>
              <ul style={{ marginLeft: '16px', marginBottom: '12px' }}>
                <li>Provide, maintain, and improve the Clarity Portal</li>
                <li>Send you technical notices and support messages</li>
                <li>Respond to your comments and questions</li>
                <li>Comply with legal obligations</li>
              </ul>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Data Security</h3>
              <p style={{ marginBottom: '12px' }}>We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, alteration, disclosure, or destruction.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Your Rights</h3>
              <p style={{ marginBottom: '12px' }}>You have the right to access, correct, or delete your personal data. Contact us at support@clarityproject.org to exercise these rights.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Changes to This Policy</h3>
              <p>We may update this Privacy Policy from time to time. Your continued use of the Clarity Portal indicates your acceptance of any changes.</p>
            </div>
          </ExpandableSection>

          <ExpandableSection title="Data Storage Notice">
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '0', marginBottom: '12px' }}>Where Your Data Is Stored</h3>
              <p style={{ marginBottom: '12px' }}>Your personal data and portal activity are stored on Supabase servers located in the United States. By using the Clarity Portal, you consent to your data being processed and stored in the United States.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Data Retention</h3>
              <p style={{ marginBottom: '12px' }}>We retain your personal data for as long as your account is active. You can request deletion of your account and associated data at any time.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Data Access</h3>
              <p style={{ marginBottom: '12px' }}>Your data is protected by row-level security policies that ensure only you can access your own information.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>International Data Transfer</h3>
              <p style={{ marginBottom: '12px' }}>If you are located outside the United States, your personal data will be transferred to, stored in, and processed in the United States.</p>

              <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Questions?</h3>
              <p>For questions about how we store and process your data, please contact support@clarityproject.org.</p>
            </div>
          </ExpandableSection>

          <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #e5e5e5', marginBottom: '24px' }}>
            <p style={{ fontSize: '13px', color: '#666', margin: '0', lineHeight: '1.6' }}>
              By clicking "Accept Terms", you acknowledge that you have read, understood, and agree to be bound by all of the above terms and conditions.
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
              marginBottom: '24px',
            }}
            onMouseEnter={(e) => !isAccepting && (e.target.style.backgroundColor = '#e07560')}
            onMouseLeave={(e) => !isAccepting && (e.target.style.backgroundColor = '#F08571')}
          >
            {isAccepting ? 'Accepting...' : 'Accept Terms & Conditions'}
          </button>
        </div>
      </div>
    </div>
  );
}
