-- Add 'weekly-momentum' to allowed review_type values in journal_entries table
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_review_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_review_type_check
  CHECK (review_type IN ('after-action', 'progress', 'weekly-momentum'));
