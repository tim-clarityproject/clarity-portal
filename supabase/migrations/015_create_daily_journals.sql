-- Daily Journal (prompt 10a, per clarity-specs-9-to-11.md section B).
--
-- One row per person per day (unique(user_id, journal_date), the
-- person's own local date, not the server's). body holds an ordered
-- array of blocks - {"t":"p","v":"..."} for a prompt question the
-- person tapped, {"t":"t","v":"..."} for their own writing - so a
-- journal reads back exactly as written. body_text is a plain column,
-- not a Postgres GENERATED one (a generated column's expression can't
-- contain a subquery, and reading JSONB array elements needs one) - it
-- is written by the app's save function each time, holding only the
-- "t" blocks joined, for the list preview/word count/search.
--
-- Journal text is private: RLS allows only the owning user to select,
-- insert, update or delete their own rows - no shared/team visibility
-- at all, matching how every other personal-data table here is scoped.

CREATE TABLE IF NOT EXISTS daily_journals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_date DATE NOT NULL,
  body JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, journal_date)
);

DO $$ BEGIN
  ALTER TABLE daily_journals ADD CONSTRAINT daily_journals_status_check CHECK (status IN ('draft', 'final'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_journals_user_date ON daily_journals(user_id, journal_date DESC);

ALTER TABLE daily_journals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own journals" ON daily_journals;
CREATE POLICY "Users can view their own journals" ON daily_journals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own journals" ON daily_journals;
CREATE POLICY "Users can insert their own journals" ON daily_journals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own journals" ON daily_journals;
CREATE POLICY "Users can update their own journals" ON daily_journals
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own journals" ON daily_journals;
CREATE POLICY "Users can delete their own journals" ON daily_journals
  FOR DELETE USING (auth.uid() = user_id);
