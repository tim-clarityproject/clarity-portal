// Zoom, through the portal's own server (Phase 6a run 3).
//
// THE INTERFACE (the stand-in in standIn.js has exactly the same one):
//   service: 'zoom', real: boolean
//   createMeeting({ topic, startsAt, minutes, timeZone }) → { id, joinUrl }
//   updateMeeting(id, { topic?, startsAt?, minutes?, timeZone? }) → { id, joinUrl }
//   deleteMeeting(id) → nothing
// `timeZone` is the call's anchor zone by its place name (the client's own,
// time-zone-safeguards.md): the meeting is made in the client's time zone,
// so Zoom shows them the time they agreed to.
//
// The real adapter never holds a key: every call goes to
// /api/coach-calendar with the coach's own sign-in.

/**
 * @param {(body: object) => Promise<object>} ask posts to /api/coach-calendar and resolves its answer (index.js's askServer)
 */
export function zoomAdapter(ask) {
  const call = async (body) => {
    const answer = await ask({ service: 'zoom', ...body });
    if (!answer || answer.ok !== true) { const err = new Error('Zoom didn’t answer.'); err.code = answer?.reason || 'no_answer'; throw err; }
    return answer;
  };
  const tidy = (m) => ({ id: String(m?.id ?? ''), joinUrl: /^https:\/\//.test(String(m?.joinUrl || '')) ? m.joinUrl : null });
  return {
    service: 'zoom',
    real: true,
    async createMeeting(meeting) { return tidy((await call({ kind: 'create', meeting })).meeting); },
    async updateMeeting(id, meeting) { return tidy((await call({ kind: 'update', id, meeting })).meeting); },
    async deleteMeeting(id) { await call({ kind: 'delete', id }); },
  };
}
