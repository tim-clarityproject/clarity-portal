-- Add show_mission_in_header column to profiles table
ALTER TABLE public.profiles
ADD COLUMN show_mission_in_header BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.show_mission_in_header IS 'Whether to display the mission statement in the page header';
