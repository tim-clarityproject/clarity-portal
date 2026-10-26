import { newId, saveOrQueue } from './syncQueue';

// Saving a plan or tool (a row in `decisions`) so that it is never lost
// for want of a connection (Tim, 26 Oct). Online it saves at once, as
// before. Offline, or if the connection drops mid-save, it is kept on the
// device and sent when the connection is back (syncQueue.js); a new plan
// gets its id on the device, so later saves update the same row.
//
// Resolves { id, status: 'saved' | 'queued', qid }. Rejects only when the
// server answered with a real error.
export async function saveDecisionOrQueue({ userId, decisionId, toolType, payload }) {
  if (decisionId) {
    const { status, qid } = await saveOrQueue(userId, {
      table: 'decisions',
      kind: 'update',
      values: payload,
      match: { id: decisionId, user_id: userId },
    });
    return { id: decisionId, status, qid };
  }
  const id = newId();
  const { status, qid } = await saveOrQueue(userId, {
    table: 'decisions',
    kind: 'upsert',
    onConflict: 'id',
    values: { id, user_id: userId, tool_type: toolType, ...payload },
  });
  return { id, status, qid };
}
