-- Add breathing_preference column to profiles table for persisting user's selected breathing type
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS breathing_preference TEXT DEFAULT 'sigh';

-- Valid breathing types: 'sigh', 'vagal', 'box'
-- Add check constraint to ensure only valid breathing types are stored
ALTER TABLE profiles ADD CONSTRAINT breathing_preference_check
  CHECK (breathing_preference IN ('sigh', 'vagal', 'box'));
