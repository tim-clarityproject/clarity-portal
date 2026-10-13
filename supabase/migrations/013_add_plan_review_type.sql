-- Add 'plan-review' to allowed review_type values in journal_entries table
-- (reviews of a specific daily plan, meeting, If-Then plan, Inversion
-- thinking or Tough conversation - prompt 8). No new columns: which
-- plan is being reviewed is stored inside the existing content TEXT
-- column, as JSON, the same way every other review_type already stores
-- its answers there (see MyJournal.jsx) - {a, b, planKind, planId,
-- dateKey, reviewType:'plan-review'}.
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_review_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_review_type_check
  CHECK (review_type IN ('after-action', 'progress', 'weekly-momentum', 'plan-review'));
