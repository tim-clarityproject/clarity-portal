import { supabase } from './supabase';

// Daily Journal (prompt 10a, per clarity-specs-9-to-11.md section B).
// body is an ordered array of blocks: {t:'p', v:question} for a prompt
// the person tapped, {t:'t', v:text} for their own writing - the
// journal reads back exactly as written. Prompts are never counted in
// the word count, the preview or the PDF word totals.
export const PROMPTS = [
  'What is on my mind?',
  'What am I avoiding?',
  'What would make today a good day?',
  'What am I grateful for?',
];

export const MAX_CHARS = 50000;

export function textBlock(v = '') {
  return { t: 't', v };
}

export function promptBlock(v) {
  return { t: 'p', v };
}

// Only the "t" blocks, joined - what the person actually wrote.
export function textOf(blocks) {
  return (blocks || []).filter((b) => b.t === 't').map((b) => b.v).join('\n\n').trim();
}

export function wordCount(blocks) {
  const t = textOf(blocks);
  const matches = t.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

// Merge adjacent writing blocks, drop empty ones that aren't last, and
// make sure the page always ends on a writing block (never a prompt).
export function normalizeBlocks(blocks) {
  let out = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.t === 't' && prev && prev.t === 't') {
      const left = prev.v.replace(/\s+$/, '');
      const right = b.v.replace(/^\s+/, '');
      prev.v = left && right ? `${left}\n\n${right}` : left + right;
    } else {
      out.push({ ...b });
    }
  }
  out = out.filter((b, i) => !(b.t === 't' && !b.v.trim() && i < out.length - 1));
  if (!out.length || out[out.length - 1].t === 'p') out.push(textBlock(''));
  return out;
}

// Tapping a prompt chip: if the last block is an empty writing block,
// the question is inserted before it; otherwise the question and a new
// empty writing block are added at the end. The same question can be
// added more than once.
export function addPrompt(blocks, question) {
  const normalized = normalizeBlocks(blocks);
  const last = normalized[normalized.length - 1];
  if (last.t === 't' && !last.v.trim()) {
    normalized.splice(normalized.length - 1, 0, promptBlock(question));
  } else {
    normalized.push(promptBlock(question), textBlock(''));
  }
  return normalized;
}

export function removeBlock(blocks, index) {
  return normalizeBlocks(blocks.filter((_, i) => i !== index));
}

export async function loadJournalByDate(userId, dateKey) {
  const { data, error } = await supabase
    .from('daily_journals')
    .select('*')
    .eq('user_id', userId)
    .eq('journal_date', dateKey)
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function loadAllJournals(userId) {
  const { data, error } = await supabase
    .from('daily_journals')
    .select('*')
    .eq('user_id', userId)
    .order('journal_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveJournal({ userId, journalDate, blocks, status, existingId }) {
  const payload = {
    body: blocks,
    body_text: textOf(blocks),
    status,
    updated_at: new Date().toISOString(),
  };
  if (existingId) {
    const { data, error } = await supabase
      .from('daily_journals')
      .update(payload)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Could not find this journal to update.');
    return data[0];
  }
  const { data, error } = await supabase
    .from('daily_journals')
    .insert({ user_id: userId, journal_date: journalDate, ...payload })
    .select();
  if (error) {
    // Another device/tab already created today's row between this
    // page loading and this save (spec: "never create a duplicate" -
    // unique(user_id, journal_date)) - fall back to updating it
    // instead of surfacing the conflict as a failure.
    if (error.code === '23505') {
      const existing = await loadJournalByDate(userId, journalDate);
      if (existing) {
        const { data: updated, error: updateError } = await supabase
          .from('daily_journals')
          .update(payload)
          .eq('id', existing.id)
          .eq('user_id', userId)
          .select();
        if (updateError) throw updateError;
        return updated[0];
      }
    }
    throw error;
  }
  if (!data || data.length === 0) throw new Error('Save did not return a journal.');
  return data[0];
}

export async function deleteJournal(userId, id) {
  const { error } = await supabase
    .from('daily_journals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}
