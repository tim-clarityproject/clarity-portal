-- Add archive support to missions table
ALTER TABLE missions ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX idx_missions_archived_at ON missions(archived_at);
