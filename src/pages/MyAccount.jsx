import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import HomeHeader from '../components/HomeHeader';

export default function MyAccount() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(true);
  const isGuest = false;

  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Fetch profile data
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [user]);


  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}>
      <HomeHeader isGuest={isGuest} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', width: '100%', padding: '64px 32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'black', marginBottom: '32px' }}>
          My Account
        </h1>

        {/* Profile Card */}
        <div style={{
          marginBottom: '48px',
          padding: '24px',
          backgroundColor: '#fafafa',
          borderRadius: '12px',
          border: '1px solid #e5e5e5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'black', marginBottom: '8px', margin: 0 }}>
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Profile'}
            </h2>
            <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={() => navigate('/edit-profile')}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #F08571',
              borderRadius: '8px',
              color: '#F08571',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#FEE5DE';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Edit Profile
          </button>
        </div>
      </div>
    </div>
  );
}
