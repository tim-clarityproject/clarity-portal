import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import DesignHeader from '../../components/DesignHeader';
import { BackLink } from '../../components/ui/DiscardLink';
import { AddButton, Button, HubAnchor, HubGroup, HubGrid, HubRecent, HubTeams, HubTile, PageHeader, PinPanel, useToast } from '../../components/design';
import { HUBS, PIN_GROUPS, TOOLS, isNewTool, toolCount, MAX_PINS } from '../../lib/navigation';
import { usePins } from '../../lib/menuPins';
import { getLocalDateKey } from '../../lib/dateFormatter';
import { useCachedLoad } from '../../lib/pageCache';
import { healthCheckTeams, planRows, recentRows, reviewRows } from '../../lib/savedItems';
import { loadSavedPlans, loadSavedReviews, SAVED_PLANS_CACHE, SAVED_REVIEWS_CACHE } from '../../lib/savedItemsApi';

// A hub page (mock-up M3; Phase 4 step 1): Personal (Plan, Reset and
// Review), Plan, Reset, Review, Interpersonal and Strategic. Only the
// title, with its ⓘ, then type-only tiles in M3's order, then "Pin tools
// to my menu" (every hub but Personal). The menu and the phone bar reach
// every hub; Personal's three hubs have a back link to Personal on phone.
//
// Plan, Review and Interpersonal end with their last three saved items
// and a link to My Plans or My Reviews filtered to the area; Strategic's
// Health Check card lists the saved teams, each opening its versions in My
// Plans (step 4). They share My Plans' and My Reviews' device copies, so
// they show at once. Still to come: the tiles' live lines ("Done today",
// "Version 3.2").

const plainClick = (e) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

export default function HubPage({ hub: hubKey }) {
  const hub = HUBS[hubKey];
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useContext(AuthContext);
  const { pins, toggle, refresh } = usePins(user?.id);
  const [pinOpen, setPinOpen] = useState(false);
  const recent = hub.recent;
  const wantsPlans = recent?.list === 'plans' || Boolean(hub.anchor);
  const plans = useCachedLoad({ userId: wantsPlans ? user?.id : null, name: SAVED_PLANS_CACHE, load: () => loadSavedPlans(user.id), deps: [hubKey] });
  const reviews = useCachedLoad({ userId: recent?.list === 'reviews' ? user?.id : null, name: SAVED_REVIEWS_CACHE, load: () => loadSavedReviews(user.id), deps: [hubKey] });
  const today = getLocalDateKey();
  const planList = useMemo(() => (wantsPlans ? planRows(plans.data, today) : []), [wantsPlans, plans.data, today]);
  const reviewList = useMemo(() => (recent?.list === 'reviews' ? reviewRows(reviews.data, today) : []), [recent, reviews.data, today]);
  const recentItems = recent
    ? recentRows(recent.list === 'plans' ? planList : reviewList, recent.area).map((r) => ({
      key: r.id,
      title: r.title,
      type: r.typeLabel,
      date: r.dateLabel,
      onClick: () => navigate(r.to.path, r.to.state ? { state: r.to.state } : undefined),
    }))
    : [];
  const teams = hub.anchor
    ? healthCheckTeams(planList, today).map((t) => ({
      key: t.team.toLowerCase(),
      team: t.team,
      line: t.line,
      onClick: () => navigate(`/my-plans?area=strategic&team=${encodeURIComponent(t.team)}`),
    }))
    : [];

  const open = (to, state) => (e) => {
    if (!plainClick(e)) return;
    e.preventDefault();
    navigate(to, state ? { state } : undefined);
  };

  const tile = (key) => {
    const t = TOOLS[key];
    return <HubTile key={key} name={t.name} line={t.line} time={t.time} live={isNewTool(key, today) ? 'New' : undefined} href={t.to} onClick={open(t.to, t.state)} />;
  };

  const onPin = async (key, on) => {
    try {
      const result = await toggle(key, on);
      if (result === 'full') toast.show(`You’ve pinned ${MAX_PINS}, so unpin one to pin another.`);
      else toast.show(result === 'queued' ? 'Will sync' : 'Saved');
    } catch {
      refresh({ force: true });
      toast.error();
    }
  };

  const openPins = () => {
    refresh();
    setPinOpen(true);
  };

  const anchor = hub.anchor ? TOOLS[hub.anchor] : null;

  return (
    <div className="ui-root">
      <DesignHeader />
      <main className="ds-hub-page">
        {hub.up && (
          <div className="ds-hub-back">
            <BackLink label={HUBS[hub.up].title} onClick={() => navigate(HUBS[hub.up].path)} />
          </div>
        )}
        <PageHeader title={hub.title} info={hub.info} />

        {hub.areas && (
          <HubGrid>
            {hub.areas.map((k) => (
              <HubTile key={k} big name={HUBS[k].title} line={HUBS[k].line} time={toolCount(k)} href={HUBS[k].path} onClick={open(HUBS[k].path)} />
            ))}
          </HubGrid>
        )}

        {anchor && (
          <HubAnchor>
            <HubTile name={anchor.name} line={anchor.line} time={anchor.time} href={anchor.to} onClick={open(anchor.to)} />
            <HubTeams teams={teams} />
            <AddButton onClick={() => navigate(anchor.to)}>Start a new Health Check</AddButton>
          </HubAnchor>
        )}

        {(hub.groups || []).map((g) => (
          <HubGroup key={g.title || 'tools'} title={g.title}>
            {g.tools.map(tile)}
          </HubGroup>
        ))}

        {recent && (
          <HubRecent title={recent.title} items={recentItems} linkLabel={`Open ${recent.title}`} onOpenAll={() => navigate(recent.to)} />
        )}

        {!hub.areas && (
          <div className="ds-hub-pin-link">
            <Button variant="text" onClick={openPins}>Pin tools to my menu</Button>
          </div>
        )}
      </main>

      <PinPanel
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        groups={PIN_GROUPS.map((g) => ({ title: g.title, tools: g.tools.map((k) => ({ key: k, name: TOOLS[k].name })) }))}
        pinned={pins}
        onToggle={onPin}
        max={MAX_PINS}
      />
    </div>
  );
}
