-- Personal Operating Plan version history (prompt 9).
--
-- New table: mission_versions. Each row is an immutable snapshot of a
-- plan (mission title + every strategy + every tactic) at the moment
-- it was saved or restored. Rows are never updated or deleted (RLS
-- below only grants INSERT and SELECT) - history, not working state.
--
-- Additive columns on mission_progress_reviews: a review can now say
-- which plan version it was reviewing against (plan_version_id), and
-- whether it is a finished review or a saved draft (status). updated_at
-- lets a draft be saved over itself instead of always inserting a new
-- row.
--
-- No DB functions: saving/restoring a plan stays in the app (JS), the
-- same pattern every other table in this schema already uses (plain
-- CRUD + RLS, no stored procedures anywhere else in this project). If
-- the version-history insert fails after the plan itself saved
-- successfully, the app does not roll back the plan - it shows "Plan
-- saved, but your version history could not be updated."

CREATE TABLE IF NOT EXISTS mission_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_major INTEGER NOT NULL,
  version_minor INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mission_versions_mission_id ON mission_versions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_versions_user_id ON mission_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_mission_versions_created_at ON mission_versions(created_at DESC);

ALTER TABLE mission_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own plan versions" ON mission_versions;
CREATE POLICY "Users can view their own plan versions" ON mission_versions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own plan versions" ON mission_versions;
CREATE POLICY "Users can insert their own plan versions" ON mission_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy: version history rows are immutable once
-- written (RLS denies by default when no policy grants the action).

ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES mission_versions(id) ON DELETE SET NULL;
ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';
ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE mission_progress_reviews ADD CONSTRAINT mission_progress_reviews_status_check CHECK (status IN ('final', 'draft'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_mission_progress_reviews_plan_version_id ON mission_progress_reviews(plan_version_id);
