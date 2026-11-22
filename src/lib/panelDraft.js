import { clearDraft, readDraft, writeDraft } from './drafts';

// Slide-in panels keep their draft (tidy pass item 3; experience rule 2:
// closing never loses anything). A panel that opts in (SlidePanel's
// `draftKey`) has what is typed in its boxes copied to the device as it
// changes. Closed with its cross, Escape, a tap outside, a swipe down or
// the phone's Back, the copy stays; opened again (now, after a refresh or
// on another visit), the typing is put back quietly and "Draft restored"
// shows. When the panel's own button closes it (a save, or a choice that
// finishes it), the copy goes.
//
// A panel's fields are read in order, each with its label, so a draft is
// only put back into the box it came from. Passwords and one-time codes
// are never kept. Signed out (the outside Health Check), the copy is kept
// in this tab only, for as long as it is open.

const memory = new Map();
const NAME = (key) => `panel:${key}`;

/** One field as kept: its place, its label and what was typed. */
export function fieldEntry(index, label, value) {
  return { i: index, label: String(label || '').replace(/\s+/g, ' ').trim().slice(0, 80), v: String(value ?? '') };
}

/** True when two readings of a panel's fields hold the same typing. */
export function sameFields(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((f, n) => f.label === b[n].label && f.v === b[n].v);
}

/**
 * What to put back: each kept field goes into the field now in the same
 * place with the same label, or else the only one with its label; nothing
 * is put back where the box already holds the same words.
 * @returns {{ i: number, v: string }[]}
 */
export function fieldsToRestore(kept = [], now = []) {
  const out = [];
  const used = new Set();
  for (const f of kept) {
    let at = now.findIndex((n, k) => k === f.i && n.label === f.label && !used.has(k));
    if (at < 0) {
      const same = now.map((n, k) => (n.label === f.label && !used.has(k) ? k : -1)).filter((k) => k >= 0);
      at = same.length === 1 ? same[0] : -1;
    }
    if (at < 0) continue;
    used.add(at);
    if (now[at].v !== f.v) out.push({ i: at, v: f.v });
  }
  return out;
}

/** Something was typed: a field differs from how the panel opened. */
export function hasTyping(fields = [], opened = []) {
  return !sameFields(fields, opened) && fields.some((f) => f.v.trim());
}

export function keepPanelDraft(userId, key, fields) {
  if (!key) return;
  if (!userId) { memory.set(key, fields); return; }
  writeDraft(userId, NAME(key), fields);
}

export function readPanelDraft(userId, key) {
  if (!key) return null;
  if (!userId) return memory.get(key) || null;
  const d = readDraft(userId, NAME(key));
  return Array.isArray(d?.v) ? d.v : null;
}

export function clearPanelDraft(userId, key) {
  if (!key) return;
  memory.delete(key);
  if (userId) clearDraft(userId, NAME(key));
}

/**
 * The draft key of a tool's add-to-do panel (ToolTodoPanel): the tool, the
 * saved item it came from and, where a tool has several next steps, which
 * one, so one step's draft never shows in another step's panel.
 */
export function toolTodoDraftKey(source, sourceId = null, item = null) {
  return `tool-todo:${source}:${sourceId || 'none'}${item ? `:${item}` : ''}`;
}
