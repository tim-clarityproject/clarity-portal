import { useNavigate } from 'react-router-dom';

export default function DataStorageNotice() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', padding: '40px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <button
          onClick={() => navigate(-1)}
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
          Data Storage Notice
        </h1>

        <div style={{ color: '#333', lineHeight: '1.8', fontSize: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            Overview
          </h2>
          <p style={{ marginBottom: '16px' }}>
            This Data Storage Notice explains how the Clarity Portal stores and manages your data. By using the Clarity Portal, you acknowledge that you understand and agree to the data storage practices outlined below.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            1. Data Storage Infrastructure
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Your data is stored on Supabase, a secure, open-source backend-as-a-service platform built on PostgreSQL. Supabase provides enterprise-grade security and reliability for data storage and management.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            2. Types of Data Stored
          </h2>
          <p style={{ marginBottom: '12px' }}>
            The following types of data are stored in your account:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li><strong>Authentication Data:</strong> Email address, hashed password, and session tokens</li>
            <li><strong>Decisions:</strong> GROW model decisions and Inversion model decisions with all associated form data</li>
            <li><strong>Reflections:</strong> Journal entries and reflections you create</li>
            <li><strong>Strategic Alignments:</strong> Team planning and alignment data</li>
            <li><strong>Account Metadata:</strong> Name, profile information, and preferences</li>
          </ul>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            3. Data Encryption
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Your data is transmitted over encrypted connections (HTTPS/TLS) to and from our servers. Sensitive data including passwords are hashed using industry-standard algorithms before storage. Supabase employs encryption for data at rest.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            4. Data Access Control
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We implement Row-Level Security (RLS) policies to ensure that each user can only access their own data. Only authenticated users can view, edit, or delete their personal data. Your data is never shared with other users unless you explicitly choose to share it.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            5. Session Management
          </h2>
          <p style={{ marginBottom: '16px' }}>
            When you log in to the Clarity Portal, we create a secure session that lasts for up to 30 days. Your session is stored in your browser's local storage and synced with our servers. You can log out at any time to end your session immediately.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            6. Data Backup and Recovery
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Supabase maintains regular backups of all data to ensure recovery in case of unforeseen circumstances. These backups are stored securely and are subject to the same security measures as live data.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            7. Data Deletion
          </h2>
          <p style={{ marginBottom: '16px' }}>
            You may request deletion of your account and all associated data at any time. Upon deletion, your personal data will be permanently removed from our systems within 30 days. Some data may be retained for compliance or legal purposes as required by law.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            8. Third-Party Providers
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We use the following third-party services to store and manage your data:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li><strong>Supabase:</strong> Database and authentication services</li>
            <li><strong>Vercel:</strong> Application hosting and deployment</li>
            <li><strong>Google:</strong> OAuth authentication provider</li>
          </ul>
          <p style={{ marginBottom: '16px' }}>
            These providers are bound by confidentiality agreements and are only allowed to use your data for the purposes specified in this notice.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            9. Data Transfer
          </h2>
          <p style={{ marginBottom: '16px' }}>
            You can export your data at any time by requesting a copy from your account settings. This data will be provided in a standard format that you can use with other applications.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            10. Changes to This Notice
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We may update this Data Storage Notice from time to time. Changes will be effective immediately upon posting to the website. Your continued use of the Clarity Portal constitutes acceptance of any changes to this notice.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            11. Contact Us
          </h2>
          <p style={{ marginBottom: '32px' }}>
            If you have questions about this Data Storage Notice, please contact us at:<br />
            The Clarity Project<br />
            Email: data@theclarityproject.co.uk
          </p>

          <p style={{ color: '#999', fontSize: '12px', marginTop: '40px' }}>
            Last updated: August 2026
          </p>
        </div>
      </div>
    </div>
  );
}
