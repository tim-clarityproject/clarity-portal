import { useNavigate } from 'react-router-dom';

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>

        <div style={{ color: '#333', lineHeight: '1.8', fontSize: '14px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            1. Introduction
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The Clarity Project ("we," "us," "our," or "Company") respects the privacy of our users ("user" or "you"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services, including the Clarity Portal.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            2. Information We Collect
          </h2>
          <p style={{ marginBottom: '12px' }}>
            We may collect information about you in a variety of ways. The information we may collect on the site includes:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li><strong>Personal Data:</strong> Email address, name, and authentication credentials when you create an account</li>
            <li><strong>User-Generated Content:</strong> Decisions, reflections, journal entries, and other content you create within the portal</li>
            <li><strong>Usage Data:</strong> Information about how you interact with our services, including pages visited, time spent, and features used</li>
            <li><strong>Device Information:</strong> Information about your device, browser, and IP address</li>
          </ul>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            3. How We Use Your Information
          </h2>
          <p style={{ marginBottom: '12px' }}>
            We use the information we collect to:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li>Provide, maintain, and improve our services</li>
            <li>Process your authentication and maintain your account</li>
            <li>Store and sync your data across devices</li>
            <li>Communicate with you about service updates</li>
            <li>Monitor and analyze service usage and trends</li>
            <li>Detect and prevent fraudulent activity</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            4. Data Storage and Security
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Your data is stored securely using Supabase, a secure cloud database platform. We implement industry-standard security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            5. Data Retention
          </h2>
          <p style={{ marginBottom: '16px' }}>
            We retain your personal data for as long as your account is active or as needed to provide you with our services. You may request deletion of your account and associated data at any time by contacting us. Some data may be retained as required by law or for legitimate business purposes.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            6. Third-Party Services
          </h2>
          <p style={{ marginBottom: '16px' }}>
            Our services may contain links to third-party websites and services that are not operated by us. This Privacy Policy does not apply to third-party services, and we are not responsible for their privacy practices. We encourage you to review their privacy policies before providing any information.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            7. Your Rights
          </h2>
          <p style={{ marginBottom: '12px' }}>
            Depending on your location, you may have the following rights:
          </p>
          <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
            <li>The right to access your personal data</li>
            <li>The right to correct inaccurate data</li>
            <li>The right to request deletion of your data</li>
            <li>The right to restrict processing of your data</li>
            <li>The right to data portability</li>
          </ul>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            8. Children's Privacy
          </h2>
          <p style={{ marginBottom: '16px' }}>
            The Clarity Portal is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will take steps to delete such information and terminate the child's account.
          </p>

          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            9. Contact Us
          </h2>
          <p style={{ marginBottom: '16px' }}>
            If you have questions about this Privacy Policy or our privacy practices, please contact us at:
          </p>
          <p style={{ marginBottom: '32px' }}>
            The Clarity Project<br />
            Email: privacy@theclarityproject.co.uk
          </p>

          <p style={{ color: '#999', fontSize: '12px', marginTop: '40px' }}>
            Last updated: August 2026
          </p>
        </div>
      </div>
    </div>
  );
}
