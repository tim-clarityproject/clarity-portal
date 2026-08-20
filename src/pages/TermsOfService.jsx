import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button
          onClick={() => navigate('/create-account')}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#F08571',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '32px',
          }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px', color: 'black' }}>
          Terms of Service
        </h1>

        <div style={{ color: '#333', lineHeight: '1.8', fontSize: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            1. Acceptance of Terms
          </h2>
          <p style={{ marginBottom: '16px' }}>
            By accessing and using the Clarity Portal, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            2. Use License
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Permission is granted to temporarily download one copy of the materials (information or software) on the Clarity Portal for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or for any public display</li>
            <li>Attempt to decompile or reverse engineer any software contained on the portal</li>
            <li>Remove any copyright or other proprietary notations from the materials</li>
            <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
          </ul>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            3. Disclaimer
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The materials on the Clarity Portal are provided "as is". We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            4. Limitations
          </h2>
          <p style={{ marginBottom: '16px' }}>
            In no event shall The Clarity Project or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on the Clarity Portal.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            5. Accuracy of Materials
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The materials appearing on the Clarity Portal could include technical, typographical, or photographic errors. The Clarity Project does not warrant that any of the materials on the portal are accurate, complete, or current. The Clarity Project may make changes to the materials contained on the portal at any time without notice.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            6. Links
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The Clarity Project has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by The Clarity Project of the site. Use of any such linked website is at the user's own risk.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            7. Modifications
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The Clarity Project may revise these terms of service for the portal at any time without notice. By using this portal, you are agreeing to be bound by the then current version of these terms of service.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            8. Governing Law
          </h2>
          <p style={{ marginBottom: '32px' }}>
            These terms and conditions are governed by and construed in accordance with the laws of the United Kingdom, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
          </p>

          <p style={{ color: '#999', fontSize: '12px', marginTop: '40px' }}>
            Last updated: August 2026
          </p>
        </div>
      </div>
    </div>
  );
}
