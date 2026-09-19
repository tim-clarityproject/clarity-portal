-- Add if_then_planning, daily_plan, and plan_meeting to allowed tool_type values
-- First, drop the existing constraint
ALTER TABLE public.decisions
DROP CONSTRAINT decisions_tool_type_check;

-- Add the new constraint with all allowed tool types
ALTER TABLE public.decisions
ADD CONSTRAINT decisions_tool_type_check
CHECK (tool_type IN ('grow', 'inversion', 'tough-conversation', 'strategic-alignment', 'if_then_planning', 'daily_plan', 'plan_meeting'));
