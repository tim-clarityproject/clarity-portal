import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { EmptyState, ErrorMessage, List, ListRow, Loading, PageHeader } from '../../components/design';
import { usePlanVersions } from '../../lib/performance/hooks';
import { VERSION_KIND_LABEL, versionLabel } from '../../lib/performance';
import pageText from '../../content/pageText';
import { dayAndTime } from './planDates';
import './performance.css';

// Version history of the Individual Performance Plan (not mocked; M1 only
// has "See version history"). Built from the shared list row: the version,
// what kind of change it was, and when. A version is kept for every major
// or minor change (src/lib/performance/versions.js), never for logging,
// scores or figures. A row opens that version, read only.
export default function PlanHistory() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { data, loading, error } = usePlanVersions(user?.id);
  const versions = data?.versions || [];

  return (
    <div className="ui-root">
      <DesignHeader />
      <div className="plan-page ipp-page">
        <div className="plan-back-row"><BackLink onClick={() => navigate('/performance-plan')} label="Individual Performance Plan" /></div>
        <PageHeader title="Version history" info={pageText.performancePlanHistory} />
        {loading ? (
          <Loading label="Loading your version history" className="ds-loading--page" />
        ) : error ? (
          <div className="ipp-gap"><ErrorMessage keepsHappening>Your version history didn’t load. Check your connection and try again.</ErrorMessage></div>
        ) : !data?.plan ? (
          <div className="ipp-gap">
            <EmptyState question="Ready to build your Individual Performance Plan?" action={{ label: 'Build my plan', onClick: () => navigate('/performance-plan/build') }} />
          </div>
        ) : versions.length === 0 ? (
          <div className="ipp-gap"><p className="ipp-muted">Your first version is kept when you finish building your plan.</p></div>
        ) : (
          <List label="Versions of your plan" className="ipp-version-list">
            {versions.map((v, i) => (
              <ListRow
                key={v.id}
                title={versionLabel(v)}
                type={i === 0 ? `${VERSION_KIND_LABEL[v.kind]}, your current plan` : VERSION_KIND_LABEL[v.kind]}
                date={dayAndTime(v.created_at)}
                onClick={() => navigate(`/performance-plan/history/${v.major}.${v.minor}`)}
              />
            ))}
          </List>
        )}
      </div>
    </div>
  );
}
