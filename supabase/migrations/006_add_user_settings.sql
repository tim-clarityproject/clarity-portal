-- Add user settings columns to profiles table for local storage migration

-- Add breathing settings (JSON object for all breathing preferences)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS breathing_settings JSONB DEFAULT '{
  "cycles": 5,
  "duration": 5,
  "sound": false
}'::jsonb;

COMMENT ON COLUMN public.profiles.breathing_settings IS 'User breathing guide preferences (cycles, duration, sound)';

-- Add goal visibility preferences
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS goal_visibility JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.goal_visibility IS 'Which goals are visible to user (JSON object)';

-- Add last breathing guide shown timestamp (for tracking when guide was last shown)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_breathing_guide_shown TIMESTAMP;

COMMENT ON COLUMN public.profiles.last_breathing_guide_shown IS 'Timestamp of when breathing guide was last displayed to user';

-- Ensure terms_accepted column exists (may already exist from auth)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.terms_accepted IS 'Whether user has accepted terms of service';
