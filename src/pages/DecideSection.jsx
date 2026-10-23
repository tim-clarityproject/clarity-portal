import { useNavigate, useLocation } from 'react-router-dom';
import DesignHeader from '../components/DesignHeader';
import { PageHeader, HubCard, TileGrid } from '../components/design';

const DECIDE_ITEMS = [
  { id: 'tools', title: 'Decision Tools', description: 'Access all available decision-making frameworks', route: '/decision-tools' },
  { id: 'history', title: 'My Decisions', description: 'Review all your past decisions', route: '/decision-history' },
];

export default function DecideSection() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleDecideSelect = (route) => {
    navigate(route, { state: { ...location.state } });
  };

  return (
    <div className="ui-root" style={{ minHeight: '100vh', paddingTop: 'var(--header-height)', backgroundColor: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <DesignHeader />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '64px 32px' }} className="page-container">
        <PageHeader title="Decide" />

        <TileGrid>
          {DECIDE_ITEMS.map((item) => (
            <HubCard
              key={item.id}
              name={item.title}
              description={item.description}
              onClick={() => handleDecideSelect(item.route)}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  );
}
