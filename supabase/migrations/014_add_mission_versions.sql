-- Personal Operating Plan version history (prompt 9, per
-- clarity-specs-9-to-11.md section A).
--
-- New table: mission_versions. Each row is an immutable snapshot of a
-- plan (mission title + every strategy + every tactic) at the moment
-- it was saved or restored, plus an automatic one-line change_note
-- ("Strategy added.", "Tactic or target updated.", "First Version.",
-- "Restored from Version X.Y.") and a change_type ('start'|'major'|
-- 'minor'|'restore'). RLS grants SELECT and INSERT only - no update,
-- no delete: history is permanent. unique(mission_id, major, minor)
-- protects against two saves racing to the same version number (spec
-- section 5: "never overwrite a version").
--
-- Additive columns on mission_progress_reviews: a review can now say
-- which plan version it was reviewing against (plan_version_id), and
-- whether it is a finished review or a saved draft (status). updated_at
-- lets a draft be saved over itself instead of always inserting a new
-- row.
--
-- No DB functions (save_plan_version/restore_plan_version/
-- restore_archived_plan): the spec prefers one transactional function
-- but explicitly allows this ordered-fallback instead. Saving/restoring
-- a plan stays in the app (JS), matching every other table in this
-- schema (plain CRUD + RLS, no stored procedures anywhere else in this
-- project, and nothing here could be rehearsed against the live
-- database before this migration runs). If the version-history insert
-- fails after the plan itself saved successfully, the app does not
-- roll back the plan - it shows "Plan saved, but your version history
-- could not be updated."
--
-- NOT added: a unique partial index enforcing "only one live plan at a
-- time" (spec: "add only if existing data allows"). Checking whether
-- existing data allows it means running a query against the live
-- database, which this migration-writing step must not do - flagged
-- for the site owner to check before adding it separately if wanted.

CREATE TABLE IF NOT EXISTS mission_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  major INTEGER NOT NULL,
  minor INTEGER NOT NULL DEFAULT 0,
  change_type TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  change_note TEXT NOT NULL,
  restored_from UUID NULL REFERENCES mission_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mission_id, major, minor)
);

CREATE INDEX IF NOT EXISTS idx_mission_versions_mission_major_minor ON mission_versions(mission_id, major DESC, minor DESC);

ALTER TABLE mission_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own plan versions" ON mission_versions;
CREATE POLICY "Users can view their own plan versions" ON mission_versions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own plan versions" ON mission_versions;
CREATE POLICY "Users can insert their own plan versions" ON mission_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy: version history rows are immutable once
-- written (RLS denies by default when no policy grants the action).

DO $$ BEGIN
  ALTER TABLE mission_versions ADD CONSTRAINT mission_versions_change_type_check CHECK (change_type IN ('start', 'major', 'minor', 'restore'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES mission_versions(id) ON DELETE SET NULL;
ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'final';
ALTER TABLE mission_progress_reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE mission_progress_reviews ADD CONSTRAINT mission_progress_reviews_status_check CHECK (status IN ('final', 'draft'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_mission_progress_reviews_plan_version_id ON mission_progress_reviews(plan_version_id);

-- Backfill (spec 2.5): every existing non-archived mission with no
-- version yet gets Version 1.0, built from its current live strategies
-- and tactics. Idempotent via the NOT EXISTS guard.
INSERT INTO mission_versions (mission_id, user_id, major, minor, change_type, change_note, snapshot)
SELECT
  m.id,
  m.user_id,
  1,
  0,
  'start',
  'First Version.',
  jsonb_build_object(
    'schema_version', 1,
    'mission', jsonb_build_object('title', m.title),
    'strategies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', s.name,
        'description', s.description,
        'sort_order', s.sort_order,
        'tactics', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'action', t.action,
            'type', t.type,
            'target_value', t.target_value,
            'unit', t.unit,
            'current_value', t.current_value,
            'is_done', t.is_done,
            'sort_order', t.sort_order
          ) ORDER BY t.sort_order)
          FROM tactics t WHERE t.strategy_id = s.id
        ), '[]'::jsonb)
      ) ORDER BY s.sort_order)
      FROM strategies s WHERE s.mission_id = m.id
    ), '[]'::jsonb)
  )
FROM missions m
WHERE m.archived_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM mission_versions v WHERE v.mission_id = m.id);
