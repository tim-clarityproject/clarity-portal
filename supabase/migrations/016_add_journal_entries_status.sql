-- After-action review / Weekly momentum check-in drafts (prompt 10b,
-- per clarity-specs-9-to-11.md section C).
--
-- Today "Save as Draft" does exactly what Finish does - nothing is
-- ever actually a draft. This adds status so a review can be saved
-- half-finished and continued later, without showing up in My
-- Reviews until it is finished. DEFAULT 'final' on a NOT NULL column
-- backfills every existing row to 'final' automatically - they were
-- all, in effect, finished reviews already.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_status_check CHECK (status IN ('final', 'draft'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(user_id, review_type, status);
