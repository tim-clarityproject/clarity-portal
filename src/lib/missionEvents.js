// Anything that changes the mission outside MissionContext (the operating
// plan editor, restoring a version or an archived plan, archiving) calls
// announceMissionChange() so the pill, Welcome and My Account update at
// once, with no sign-out.
export const MISSION_CHANGED = 'clarity:mission-changed';

export function announceMissionChange() {
  window.dispatchEvent(new Event(MISSION_CHANGED));
}
