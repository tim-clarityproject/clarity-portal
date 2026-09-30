import { useState, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

/*
 * Desktop navigation dropdown, unchanged from the old HomeHeader menu.
 * Styling is intentionally left as-is (old light theme) - it will be
 * restyled in a later batch. This component only exists so the new
 * DesignHeader hamburger can open the SAME menu that exists today.
 */
export default function DesktopMenuDropdown({ isOpen, onClose, menuRef }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useContext(AuthContext);
  const [decisionsSubmenuOpen, setDecisionsSubmenuOpen] = useState(false);
  const [journalSubmenuOpen, setJournalSubmenuOpen] = useState(false);
  const [planSubmenuOpen, setPlanSubmenuOpen] = useState(false);
  const [groundSubmenuOpen, setGroundSubmenuOpen] = useState(false);

  if (!isOpen) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/');
    onClose();
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: '79px',
        left: '0',
        backgroundColor: 'white',
        border: '1px solid #e5e5e5',
        borderLeft: 'none',
        borderTop: 'none',
        borderRadius: '0px',
        boxShadow: 'inset 1px 0 0 rgba(0, 0, 0, 0.06)',
        width: '300px',
        zIndex: 1000,
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
        display: 'block',
      }}
    >
      <button
        onClick={() => {
          navigate('/welcome', { state: location.state });
          onClose();
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      >
        Home
      </button>

      <button
        onClick={() => {
          navigate('/about', { state: location.state });
          onClose();
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      >
        About
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setPlanSubmenuOpen(!planSubmenuOpen);
          if (!planSubmenuOpen) {
            setDecisionsSubmenuOpen(false);
            setJournalSubmenuOpen(false);
            setGroundSubmenuOpen(false);
          }
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderLeft: '3px solid #F08571',
          backgroundColor: '#fafafa',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
      >
        Plan
        <ChevronDown size={16} style={{ transform: planSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>

      {planSubmenuOpen && (
        <>
          <button
            onClick={() => {
              navigate('/personal-operating-plan', { state: location.state });
              onClose();
              setPlanSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Personal Operating Plan
          </button>
          <button
            onClick={() => {
              navigate('/plan-my-day', { state: location.state });
              onClose();
              setPlanSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Daily Intentions
          </button>
          <button
            onClick={() => {
              navigate('/plan-meeting', { state: location.state });
              onClose();
              setPlanSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Meeting Planner
          </button>
          <button
            onClick={() => {
              navigate('/my-plans', { state: location.state });
              onClose();
              setPlanSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            My Plans
          </button>
        </>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setGroundSubmenuOpen(!groundSubmenuOpen);
          if (!groundSubmenuOpen) {
            setDecisionsSubmenuOpen(false);
            setJournalSubmenuOpen(false);
            setPlanSubmenuOpen(false);
          }
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderLeft: '3px solid #F08571',
          backgroundColor: '#fafafa',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
      >
        Ground
        <ChevronDown size={16} style={{ transform: groundSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>

      {groundSubmenuOpen && (
        <>
          <button
            onClick={() => {
              navigate('/if-then-planning', { state: location.state });
              onClose();
              setGroundSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            If-Then Planning
          </button>
          <button
            onClick={() => {
              navigate('/breathe', { state: location.state });
              onClose();
              setGroundSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Breathe
          </button>
        </>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setDecisionsSubmenuOpen(!decisionsSubmenuOpen);
          if (!decisionsSubmenuOpen) {
            setJournalSubmenuOpen(false);
            setPlanSubmenuOpen(false);
            setGroundSubmenuOpen(false);
          }
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderLeft: '3px solid #F08571',
          backgroundColor: '#fafafa',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
      >
        Decide
        <ChevronDown size={16} style={{ transform: decisionsSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>

      {decisionsSubmenuOpen && (
        <>
          <button
            onClick={() => {
              navigate('/decision-tools', { state: location.state });
              onClose();
              setDecisionsSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Decision Tools
          </button>
          <button
            onClick={() => {
              navigate('/decision-history', { state: location.state });
              onClose();
              setDecisionsSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            My Decisions
          </button>
        </>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setJournalSubmenuOpen(!journalSubmenuOpen);
          if (!journalSubmenuOpen) {
            setDecisionsSubmenuOpen(false);
            setPlanSubmenuOpen(false);
            setGroundSubmenuOpen(false);
          }
        }}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          borderLeft: '3px solid #F08571',
          backgroundColor: '#fafafa',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
        onMouseLeave={(e) => e.target.style.backgroundColor = '#fafafa'}
      >
        Review
        <ChevronDown size={16} style={{ transform: journalSubmenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }} />
      </button>

      {journalSubmenuOpen && (
        <>
          <button
            onClick={() => {
              navigate('/my-journal', { state: { ...location.state, reviewType: 'after-action' } });
              onClose();
              setJournalSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            After-Action Review
          </button>
          <button
            onClick={() => {
              navigate('/my-journal', { state: { ...location.state, reviewType: 'weekly-momentum' } });
              onClose();
              setJournalSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Weekly Momentum Review
          </button>
          <button
            onClick={async () => {
              try {
                const { data: missionData } = await supabase
                  .from('missions')
                  .select('id')
                  .eq('user_id', user?.id)
                  .is('archived_at', null)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();

                if (missionData) {
                  navigate('/personal-operating-plan-review', { state: { missionId: missionData.id } });
                }
              } catch (err) {
                console.error('Error fetching mission:', err);
              } finally {
                onClose();
                setJournalSubmenuOpen(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Personal Operating Plan Review
          </button>
          <button
            onClick={() => {
              navigate('/my-reviews', { state: location.state });
              onClose();
              setJournalSubmenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '12px 16px 12px 32px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#666',
              textAlign: 'left',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'backgroundColor 0.2s',
              borderBottom: '1px solid #f0f0f0',
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            My Reviews
          </button>
        </>
      )}

      <button
        onClick={() => navigate('/my-account')}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#333',
          textAlign: 'left',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'backgroundColor 0.2s',
          borderBottom: '1px solid #f0f0f0',
        }}
        onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
        onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
      >
        My Account
      </button>

      {user && (
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: 'none',
            backgroundColor: 'transparent',
            color: '#F08571',
            textAlign: 'left',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'backgroundColor 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#f9f9f9'}
          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
        >
          Log Out
        </button>
      )}
    </div>
  );
}
